# Light Sweep Bulk Fast Match (Tier 1 → Tier 2) — Design

**Date:** 2026-08-11
**Status:** Approved (pending final spec review)
**Scope:** First regional rollout of the Light Sweep framework — a fast, low-cost Perplexity pass that promotes trading Tier 1 (Staged Vault) leads into Tier 2 (Final Enriched Data Table) without running full AI enrichment on every imported row. Scoped strictly to a ~6,157-record County Galway CSV batch; not the full 117k national dataset.

## Background

Today, every record that reaches Tier 2 (`records` state) gets the full `enrichBusinessRecord()` pass in `server.ts` — website + industry + decision-maker + LinkedIn + phone/email — which is expensive to run across a large regional import. The Light Sweep framework inserts a cheap intermediate pass: query Perplexity on just `company_name` + address (+ eircode when present), get back `website` / `trading_status` / `category` / `phone`, and only let trading, verified-website records advance to Tier 2. Non-trading, dormant, or unverified rows stay parked in Tier 1, tagged `DISQUALIFIED`, instead of silently occupying the expensive full-enrichment queue.

This spec was scoped through a five-question technical grilling session covering state management, schema/payload, batching/cache, and deduplication. Answers are folded into the sections below; each subsection notes which question it resolves.

## Goal

For a ~6,000-record regional CSV import: run a cheap Light Sweep pass over Tier 1, auto-promote records with a verified trading website into Tier 2 (deduplicated at the apex-domain level), leave everything else in Tier 1 tagged `DISQUALIFIED`, and do this without introducing a duplicate-ID resurrection bug across tiers or losing the address/eircode data the sweep itself depends on.

## Non-goals

- No support for the full 117k-record national dataset in this pass — no memory/pagination optimization, no tombstone pruning strategy beyond the existing single-set model. (Explicitly deferred per locked scope answer.)
- No new dedicated Light Sweep API endpoint or server file — retrofits `/api/enrich-single` and `/api/enrich-batch` instead (locked answer, Q4).
- No changes to the full-enrichment prompt, schema, or UI for records that go through `FULL_ENRICHMENT` mode — that path is untouched.
- No public-suffix-list dependency for apex domain extraction — a small hard-coded exception list covers the expected `.ie`/`.co.uk` cases for this dataset.

## Data model (`src/types.ts`)

Add to `CompanyRecord`:
- `eircode?: string | null`
- `apexDomain?: string | null`
- `tradingStatus?: 'TRADING' | 'DORMANT_OR_SHELL' | 'NOT_FOUND' | null`
- `category?: string | null` — kept distinct from the existing `industry` field, which is populated only by the deeper `FULL_ENRICHMENT` pass.

Extend `MatchType` with `'DISQUALIFIED' | 'LIGHT_SWEEP_COMPLETE' | 'SHARED_DOMAIN'`, alongside the existing `OFFICIAL_WEBSITE | FACEBOOK_FALLBACK | NOT_FOUND | UNPROCESSED`. `FilterState.matchTypeFilter` gets the same additions so the UI can filter on sweep outcomes.

New shared module `src/utils/normalize.ts`, imported by both `server.ts` and client code so cache keys and dedup keys agree byte-for-byte:
- `normalizeString(s: string): string` — lowercase, trim, collapse internal whitespace.
- `getApexDomain(url: string): string | null` — strips protocol, `www.`, path, and query string; returns the registrable domain using a small hard-coded suffix exception list (`co.uk`, `co.ie`, `org.uk`) rather than a full public-suffix-list dependency.

## Import path (`src/utils/csvUtils.ts`)

**Resolves Q3.** Regional CSVs pass through `smartExtractAndHealRecords` (auto-detect) by default, falling back to the `ColumnMappingModal` path (`extractRecordsWithCustomMapping`) when `company_name` is ambiguous. Both paths must preserve the original row:

- `smartExtractAndHealRecords` gains the same `rawRowData: row, originalHeaders: Object.keys(row)` assignment `extractRecordsWithCustomMapping` already has (`csvUtils.ts:413-414`) — today only the manual-mapping path retains it.
- Neither path is required to perfectly classify `eircode`/address into top-level fields; `rawRowData` is the guaranteed fallback, not a replacement for best-effort top-level extraction.

**Resolves Q5 (dedup key).** A shared `getDedupKey(record)` helper replaces the positional `INC-${1000 + index}` fallback used when no CRO number is present (`csvUtils.ts:189,404`, `duplicateUtils.ts:20-22,76-77`):

```
getDedupKey(record) = record.companyNumber?.trim() || `c_${normalizeString(companyName)}_${normalizeString(county)}`
```

This keeps cache keys and Firestore IDs stable across separate CSV slices of the same region, instead of colliding on `INC-1000`, `INC-1001`, ... between independent imports.

## Server (`server.ts`)

**Resolves Q4.** `enrichBusinessRecord` and both `/api/enrich-single` and `/api/enrich-batch` gain a `mode: 'LIGHT_SWEEP' | 'FULL_ENRICHMENT'` parameter, defaulting to `'FULL_ENRICHMENT'` for backward compatibility. No new endpoint or file.

- **Cache key** becomes mode-namespaced: `${mode === 'LIGHT_SWEEP' ? 'light' : 'full'}_${normalizeString(companyName)}_${normalizeString(county)}`, replacing the current unnamespaced `name_county_companyNumber` key (`server.ts:65`). This is what prevents a later `FULL_ENRICHMENT` promotion from cache-hitting on a thin Light Sweep result.
- **Prompt builder branches on mode.** `LIGHT_SWEEP` asks strictly for `website`, `trading_status` (`TRADING | DORMANT_OR_SHELL | NOT_FOUND`), `category`, `phone` — nothing else. Address context for the query is built by checking top-level `county`/`eircode` first, then falling back directly to `rawRowData['company_address_4']` → `rawRowData['company_address_3']` → `rawRowData['company_address_2']` → `rawRowData['company_address_1']`, in that order, so full address context is available regardless of how column-mapping heuristics classified the row.
- **Response parsing** sets `apexDomain` via `getApexDomain(website)` whenever a website is returned, for both modes (used downstream by the shared-domain policy).
- `/api/enrich-batch`'s existing chunk-of-3 concurrency (`server.ts:311-367`) is unchanged, just made mode-aware.

## Client batch runner (`src/App.tsx`)

`runBatchEnrichment` is generalized to accept a `tier: 'STAGED' | 'FINAL'` parameter so it can read/write `stagedLeads` in addition to `records`, reusing its existing 429-pause, pacing-delay (`requestDelay`), and `stopBatchRef` cancellation logic unchanged — no new batch orchestration path is built.

When run in `LIGHT_SWEEP` mode over `stagedLeads`, per-record outcome handling:

- **`tradingStatus: 'TRADING'` with a resolved website** — apply the shared-domain policy (**resolves Q5**): promote all N records that resolve to the same `apexDomain`, where "same" is checked against both other records in the current sweep run *and* `apexDomain` values already present on existing Tier 2 `records` (so a domain shared across two separate sweep runs, days apart, is still caught). Whichever record is promoted first — by run order, or already present in Tier 2 from an earlier run — is tagged `match_type: 'LIGHT_SWEEP_COMPLETE'`; every other record sharing that domain, regardless of which run it was found in, is tagged `match_type: 'SHARED_DOMAIN'`. All promoted records store the shared `apexDomain` so a later Pass 2 deep-research run can group or deduplicate outreach at the domain level.
- **`tradingStatus: 'DORMANT_OR_SHELL'` or `'NOT_FOUND'`, or no website resolved** — set `match_type: 'DISQUALIFIED'`; record stays in `stagedLeads`, does not advance to Tier 2.

## Promotion & tombstones

**Resolves Q1.** `deletedRecordIds` remains the single tombstone set across both tiers:

- **Code change A:** `getStagedLeadsFromFirestore`'s result is filtered against `deletedRecordIds` at load time in `App.tsx`, matching the filtering Tier 2 already gets (`App.tsx:163`) — today Tier 1 load has no such filter.
- **Code change B:** `handlePromoteAndEnrichStagedLeads` (`App.tsx:339-360`), and the new Light Sweep auto-promotion path described above, both add promoted IDs into `deletedRecordIds` — updating React state and `localStorage` synchronously — before or alongside firing `deleteStagedLeadsFromFirestore`, rather than firing the delete and moving on with no local tombstone update. This closes the resurrection gap: a promoted lead can no longer reappear in Tier 1 on next sign-in due to a failed/slow Firestore delete, because the tombstone is already authoritative locally regardless of that call's outcome.

## Scale

**Resolves scope question.** Tier 1 is capped at one regional batch (~6,157 County Galway records) at a time, not the full 117k dataset. This removes 100k+-scale concerns (localStorage quota pressure, per-document Firestore write storms, tombstone-set pruning) as blockers for this pass — the existing localStorage + per-doc Firestore sync model (`App.tsx:224-245`, `firestoreDb.ts:78-89,147-155`) is reused as-is.

## Testing

No automated test suite exists in this project (`npm run lint` = `tsc --noEmit` only). Verification plan:

1. Type-check clean (`npm run lint`).
2. Manual run against a real (or representative sample of) Galway CSV slice through both `smartExtractAndHealRecords` (auto-detect) and `ColumnMappingModal` (manual-mapping) import paths, confirming `rawRowData`/`eircode`/address fields survive both.
3. Run a Light Sweep batch over the imported Tier 1 records; inspect one shared-domain cluster's promoted records for correct `apexDomain` and `match_type` (`LIGHT_SWEEP_COMPLETE` vs `SHARED_DOMAIN`) tagging.
4. Confirm a `DISQUALIFIED` record remains in Tier 1 and does not appear in Tier 2.
5. Confirm a promoted record's ID is present in `deletedRecordIds` immediately after promotion, and does not reappear in `stagedLeads` after a simulated reload (re-reading from `localStorage`/Firestore).
