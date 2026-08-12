# Light Sweep Tier 1 → Tier 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fast, low-cost "Light Sweep" pass that queries Perplexity/Gemini for just website + trading status + category + phone on Tier 1 (`stagedLeads`) records, auto-promotes verified-trading records into Tier 2 (`records`) — deduplicated at the apex-domain level — and leaves everything else parked in Tier 1 tagged `DISQUALIFIED`, without introducing a cross-tier ID resurrection bug.

**Architecture:** `server.ts`'s `enrichBusinessRecord` and both enrichment routes gain a `mode: 'LIGHT_SWEEP' | 'FULL_ENRICHMENT'` parameter (default `FULL_ENRICHMENT`), branching the prompt and namespacing the existing in-memory cache by mode. `src/App.tsx`'s `runBatchEnrichment` is generalized to accept a `tier: 'STAGED' | 'FINAL'` parameter so the same 429-pause/pacing/cancellation logic drives both Tier 1 sweeps and Tier 2 full enrichment. A new shared `src/utils/normalize.ts` provides the string/domain/dedup-key normalization both `server.ts` and client code need to agree on byte-for-byte. Tombstone handling (`deletedRecordIds`) is tightened so promoted leads can never resurrect in Tier 1.

**Tech Stack:** React 19 + TypeScript, Express + Vite middleware mode (existing project stack, see root `CLAUDE.md`). No test framework is installed — verification is `npm run lint` (`tsc --noEmit`) plus scratch verification scripts for pure functions (deleted after use, never committed) plus manual checks in `npm run dev`, matching this project's existing conventions.

## Global Constraints

- Scope is one regional CSV batch (~6,157 County Galway records) at a time, not the full 117k dataset — no pagination/memory optimization is in scope for this plan.
- `deletedRecordIds` remains the single tombstone set across both tiers (no separate Tier 1 tombstone set).
- No new API endpoint or server file — retrofit `/api/enrich-single` and `/api/enrich-batch` in `server.ts` with a `mode` parameter, default `'FULL_ENRICHMENT'`.
- Cache keys are mode-namespaced: `light_${normalizedName}_${county}` vs `full_${normalizedName}_${county}`.
- Dedup key for records with no CRO number: `c_${normalizeString(companyName)}_${normalizeString(county)}` (deterministic, not positional).
- Shared-domain policy: promote all N companies sharing an apex domain, first tagged `LIGHT_SWEEP_COMPLETE`, rest tagged `SHARED_DOMAIN` — checked against both the current sweep run and already-promoted Tier 2 records.
- The existing auto-promote-all shortcut in `runBatchEnrichment` (records everything in `stagedLeads` straight into the full-enrichment queue when Tier 2 has nothing pending) is removed. Light Sweep becomes the only bulk Tier 1 → Tier 2 path; the existing manual "Enrich & Bring Through" button in `StagedLeadsVault` remains as a manual override for hand-picked leads.
- No changes to the existing `FULL_ENRICHMENT` prompt text or JSON schema in `server.ts` (only cache-key and an added `apexDomain` field on its result object).
- Apex domain extraction uses a small hard-coded suffix exception list (`co.uk`, `co.ie`, `org.uk`), not a public-suffix-list dependency.
- Spec reference: `docs/superpowers/specs/2026-08-11-light-sweep-tier1-tier2-design.md`.

---

### Task 1: Shared normalize/dedup utility

**Files:**
- Create: `src/utils/normalize.ts`

**Interfaces:**
- Produces: `normalizeString(value: string): string`
- Produces: `getApexDomain(url: string | null | undefined): string | null`
- Produces: `getDedupKey(companyNumber: string | null | undefined, companyName: string, county: string): string`

This file has no browser-only or Node-only dependencies (just the global `URL` class, available in both Node ≥10 and all browsers), so it can be imported unchanged from both `server.ts` (Node) and client code (Vite/browser).

- [x] **Step 1: Write the implementation file**

Create `src/utils/normalize.ts`:

```ts
export function normalizeString(value: string): string {
  return (value || '')
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

const MULTI_PART_SUFFIXES = new Set(['co.uk', 'co.ie', 'org.uk']);

export function getApexDomain(url: string | null | undefined): string | null {
  if (!url) return null;
  let hostname: string;
  try {
    const withProtocol = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    hostname = new URL(withProtocol).hostname;
  } catch {
    return null;
  }
  hostname = hostname.toLowerCase().replace(/^www\./, '');
  const parts = hostname.split('.').filter(Boolean);
  if (parts.length <= 2) return hostname || null;

  const lastTwo = parts.slice(-2).join('.');
  if (MULTI_PART_SUFFIXES.has(lastTwo) && parts.length >= 3) {
    return parts.slice(-3).join('.');
  }
  return lastTwo;
}

export function getDedupKey(
  companyNumber: string | null | undefined,
  companyName: string,
  county: string
): string {
  const trimmedNumber = (companyNumber || '').toString().trim();
  if (trimmedNumber) return trimmedNumber.toLowerCase();
  return `c_${normalizeString(companyName)}_${normalizeString(county)}`;
}
```

- [x] **Step 2: Write a scratch verification script (not committed)**

Create a temporary file `tmp-verify-normalize.ts` in the project root (`irish-b2b-website-finder/`):

```ts
import { normalizeString, getApexDomain, getDedupKey } from './src/utils/normalize';

const checks: Array<[string, string]> = [
  [normalizeString('  Glanbia   PLC  '), 'glanbia plc'],
  [normalizeString('Kerry'), 'kerry'],
  [getApexDomain('https://www.example.ie/about') || '', 'example.ie'],
  [getApexDomain('sub.example.co.uk') || '', 'example.co.uk'],
  [getApexDomain('example.com') || '', 'example.com'],
  [getApexDomain(null) === null ? 'null' : 'not-null', 'null'],
  [getApexDomain('not a url###') === null ? 'null' : 'not-null', 'null'],
  [getDedupKey('308222', 'Glanbia PLC', 'Kilkenny'), '308222'],
  [getDedupKey('', 'Glanbia PLC', 'Kilkenny'), 'c_glanbia plc_kilkenny'],
  [getDedupKey(undefined, 'Glanbia  PLC', 'Kilkenny'), 'c_glanbia plc_kilkenny'],
];

let failed = false;
for (const [actual, expected] of checks) {
  if (actual !== expected) {
    failed = true;
    console.log(`FAIL: got "${actual}", expected "${expected}"`);
  } else {
    console.log(`PASS: ${actual}`);
  }
}
if (failed) process.exit(1);
```

- [x] **Step 3: Run the scratch script**

Run (from `irish-b2b-website-finder/`): `npx tsx tmp-verify-normalize.ts`

Expected: 10 `PASS:` lines, exit code 0. If any line reads `FAIL`, fix `src/utils/normalize.ts` and re-run before continuing.

- [x] **Step 4: Delete the scratch script**

Run: `rm tmp-verify-normalize.ts`

- [x] **Step 5: Type-check**

Run: `npm run lint`
Expected: exits with no errors.

- [x] **Step 6: Commit**

```bash
git add src/utils/normalize.ts
git commit -m "feat: add shared string/domain/dedup normalization utility"
```

---

### Task 2: Data model extensions

**Files:**
- Modify: `src/types.ts`

**Interfaces:**
- Consumes: nothing (pure type changes)
- Produces: `CompanyRecord.eircode`, `CompanyRecord.apexDomain`, `CompanyRecord.tradingStatus`, `CompanyRecord.category`; `MatchType` gains `'DISQUALIFIED' | 'LIGHT_SWEEP_COMPLETE' | 'SHARED_DOMAIN'`; `FilterState.matchTypeFilter` gains the same three values.

- [x] **Step 1: Extend `MatchType`**

Find (currently line 3):

```ts
export type MatchType = 'OFFICIAL_WEBSITE' | 'FACEBOOK_FALLBACK' | 'NOT_FOUND' | 'UNPROCESSED';
```

Replace with:

```ts
export type MatchType =
  | 'OFFICIAL_WEBSITE'
  | 'FACEBOOK_FALLBACK'
  | 'NOT_FOUND'
  | 'UNPROCESSED'
  | 'DISQUALIFIED'
  | 'LIGHT_SWEEP_COMPLETE'
  | 'SHARED_DOMAIN';
```

- [x] **Step 2: Add Light Sweep fields to `CompanyRecord`**

Find (currently lines 12-21):

```ts
export interface CompanyRecord {
  id: string;
  companyNumber: string;
  companyName: string;
  county: string; // From Address4
  status: ProcessStatus;
  official_website_url: string | null;
  industry?: string | null;
  companySummary?: string | null;
  phoneNumber?: string | null;
```

Replace with:

```ts
export interface CompanyRecord {
  id: string;
  companyNumber: string;
  companyName: string;
  county: string; // From Address4
  eircode?: string | null;
  status: ProcessStatus;
  official_website_url: string | null;
  apexDomain?: string | null;
  tradingStatus?: 'TRADING' | 'DORMANT_OR_SHELL' | 'NOT_FOUND' | null;
  category?: string | null; // Light Sweep's coarse category, distinct from the deeper `industry` field below
  industry?: string | null;
  companySummary?: string | null;
  phoneNumber?: string | null;
```

- [x] **Step 3: Extend `FilterState.matchTypeFilter`**

Find (currently line 47):

```ts
  matchTypeFilter: 'ALL' | 'OFFICIAL_WEBSITE' | 'FACEBOOK_FALLBACK' | 'NOT_FOUND' | 'UNPROCESSED';
```

Replace with:

```ts
  matchTypeFilter: 'ALL' | 'OFFICIAL_WEBSITE' | 'FACEBOOK_FALLBACK' | 'NOT_FOUND' | 'UNPROCESSED' | 'DISQUALIFIED' | 'LIGHT_SWEEP_COMPLETE' | 'SHARED_DOMAIN';
```

- [x] **Step 4: Type-check**

Run: `npm run lint`
Expected: exits with no errors. (This step alone won't surface much yet since nothing reads the new fields until later tasks — it just confirms the type file itself is syntactically valid.)

- [x] **Step 5: Commit**

```bash
git add src/types.ts
git commit -m "feat: add eircode/apexDomain/tradingStatus/category fields and Light Sweep match types"
```

---

### Task 3: Import path — eircode extraction, rawRowData preservation, dedup key

**Files:**
- Modify: `src/utils/csvUtils.ts`
- Modify: `src/utils/duplicateUtils.ts`

**Interfaces:**
- Consumes: `normalizeString`, `getDedupKey` from `./normalize` (Task 1)
- Produces: `extractEircodeFromRow(row: any): string | null` (new export from `csvUtils.ts`, used by both extraction functions)

Context: `FileUpload.tsx`'s CSV path always ends up calling `extractRecordsWithCustomMapping` (via `ColumnMappingModal.tsx:143`), which already sets `rawRowData`. `smartExtractAndHealRecords` does NOT set `rawRowData` today and is the record-builder used directly by the Google Sheets import path (`workspaceService.ts:216`), so it needs the same fix for that path to retain full row context. Neither function extracts an eircode today, and `CompanyRecord.eircode` is new (Task 2).

- [x] **Step 1: Add `extractEircodeFromRow` helper**

In `src/utils/csvUtils.ts`, add this import at the top (after the existing `import { CompanyRecord } from '../types';` on line 2):

```ts
import { getDedupKey } from './normalize';
```

Then add this new exported function directly after `isCountyName` (currently ends at line 64, so insert after it, before `export interface SmartExtractResult`):

```ts
const EIRCODE_PATTERN = /^[A-Za-z]\d[A-Za-z0-9]\s?[A-Za-z0-9]{4}$/;

export function extractEircodeFromRow(row: any): string | null {
  if (!row) return null;
  const candidateKeys = Object.keys(row).filter((k) =>
    /eircode|eir_code|eir\s*code|postcode|postal_code|postal\s*code|zip/i.test(k)
  );
  for (const key of candidateKeys) {
    const val = (row[key] || '').toString().trim();
    if (val && EIRCODE_PATTERN.test(val)) {
      return val.toUpperCase();
    }
  }
  return null;
}
```

- [x] **Step 2: Wire eircode + rawRowData into `smartExtractAndHealRecords`**

Find (currently lines 186-199):

```ts
    if (companyName) {
      records.push({
        id: `record-${Date.now()}-${index}-${Math.random().toString(36).substring(2, 7)}`,
        companyNumber: companyNumber || `INC-${1000 + index}`,
        companyName,
        county,
        status: 'PENDING',
        official_website_url: null,
        decisionMakerName: dmName || null,
        decisionMakerRole: dmRole || null,
        confidence_score: 'NONE',
        match_type: 'UNPROCESSED',
      });
    }
```

Replace with:

```ts
    if (companyName) {
      records.push({
        id: `record-${Date.now()}-${index}-${Math.random().toString(36).substring(2, 7)}`,
        companyNumber: companyNumber || getDedupKey(undefined, companyName, county),
        companyName,
        county,
        eircode: extractEircodeFromRow(row),
        status: 'PENDING',
        official_website_url: null,
        decisionMakerName: dmName || null,
        decisionMakerRole: dmRole || null,
        confidence_score: 'NONE',
        match_type: 'UNPROCESSED',
        rawRowData: row,
        originalHeaders: Object.keys(row),
      });
    }
```

- [x] **Step 3: Wire eircode + dedup key into `extractRecordsWithCustomMapping`**

Find (currently lines 401-416):

```ts
    if (companyName) {
      records.push({
        id: `record-${Date.now()}-${index}-${Math.random().toString(36).substring(2, 7)}`,
        companyNumber: companyNumber || `INC-${1000 + index}`,
        companyName,
        county,
        status: 'PENDING',
        official_website_url: null,
        decisionMakerName: dmName || null,
        decisionMakerRole: dmRole || null,
        confidence_score: 'NONE',
        match_type: 'UNPROCESSED',
        rawRowData: row,
        originalHeaders: Object.keys(row),
      });
    }
```

Replace with:

```ts
    if (companyName) {
      records.push({
        id: `record-${Date.now()}-${index}-${Math.random().toString(36).substring(2, 7)}`,
        companyNumber: companyNumber || getDedupKey(undefined, companyName, county),
        companyName,
        county,
        eircode: extractEircodeFromRow(row),
        status: 'PENDING',
        official_website_url: null,
        decisionMakerName: dmName || null,
        decisionMakerRole: dmRole || null,
        confidence_score: 'NONE',
        match_type: 'UNPROCESSED',
        rawRowData: row,
        originalHeaders: Object.keys(row),
      });
    }
```

- [x] **Step 4: Replace positional dedup grouping in `duplicateUtils.ts`**

In `src/utils/duplicateUtils.ts`, add this import at the top (after `import { CompanyRecord } from '../types';` on line 1):

```ts
import { getDedupKey } from './normalize';
```

Find (currently lines 20-23, inside `analyzeDuplicates`):

```ts
  records.forEach((record) => {
    if (!record.companyNumber) return;
    const norm = record.companyNumber.toString().trim().toLowerCase();
    if (!norm) return;
```

Replace with:

```ts
  records.forEach((record) => {
    const norm = getDedupKey(record.companyNumber, record.companyName, record.county);
    if (!norm) return;
```

Find (currently lines 74-77, inside `deduplicateDataset`):

```ts
  const groups = new Map<string, CompanyRecord[]>();
  records.forEach((r) => {
    const norm = (r.companyNumber || '').toString().trim().toLowerCase();
    const key = norm || r.id;
```

Replace with:

```ts
  const groups = new Map<string, CompanyRecord[]>();
  records.forEach((r) => {
    const key = getDedupKey(r.companyNumber, r.companyName, r.county);
```

- [x] **Step 5: Write a scratch verification script (not committed)**

Create `tmp-verify-import.ts` in the project root:

```ts
import { extractEircodeFromRow, extractRecordsWithCustomMapping } from './src/utils/csvUtils';
import { analyzeDuplicates } from './src/utils/duplicateUtils';

const eircodeChecks: Array<[string, string]> = [
  [extractEircodeFromRow({ eircode: 'D02 AF30' }) || '', 'D02 AF30'],
  [extractEircodeFromRow({ Eir_Code: 'h91x2n3' }) || '', 'H91X2N3'],
  [extractEircodeFromRow({ postcode: 'not-an-eircode' }) || 'null', 'null'],
  [extractEircodeFromRow({ company_name: 'Glanbia' }) || 'null', 'null'],
];

let failed = false;
for (const [actual, expected] of eircodeChecks) {
  if (actual !== expected) {
    failed = true;
    console.log(`FAIL: got "${actual}", expected "${expected}"`);
  } else {
    console.log(`PASS: ${actual}`);
  }
}

// Two rows, no CRO number, same name+county -> must collide onto the SAME dedup key
const { records } = extractRecordsWithCustomMapping(
  [
    { name: 'Acme Traders', county: 'Galway' },
    { name: 'Acme Traders', county: 'Galway' },
    { name: 'Other Co', county: 'Galway' },
  ],
  { companyNameKey: 'name', companyNumberKey: '', countyKey: 'county' },
  false
);

const dup = analyzeDuplicates(records);
if (dup.duplicateGroups.length === 1 && dup.duplicateGroups[0].records.length === 2) {
  console.log('PASS: content-derived dedup key collides identical name+county rows');
} else {
  failed = true;
  console.log(`FAIL: expected 1 duplicate group of 2, got ${JSON.stringify(dup.duplicateGroups.map((g) => g.records.length))}`);
}

if (failed) process.exit(1);
```

- [x] **Step 6: Run the scratch script**

Run: `npx tsx tmp-verify-import.ts`
Expected: all `PASS:` lines, then `PASS: content-derived dedup key collides identical name+county rows`, exit code 0.

- [x] **Step 7: Delete the scratch script**

Run: `rm tmp-verify-import.ts`

- [x] **Step 8: Type-check**

Run: `npm run lint`
Expected: exits with no errors.

- [x] **Step 9: Commit**

```bash
git add src/utils/csvUtils.ts src/utils/duplicateUtils.ts
git commit -m "feat: extract eircode on import, preserve rawRowData in smartExtractAndHealRecords, content-derived dedup key"
```

---

### Task 4: Tombstone-safe promotion

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `deletedRecordIds: Set<string>`, `setDeletedRecordIds`, `DELETED_IDS_KEY` (all already exist in this file)
- Produces: `handlePromoteAndEnrichStagedLeads` now tombstones promoted IDs synchronously; Tier 1 loads (initial `useState`, Firestore-on-auth, Firestore-on-sign-in) are all filtered against `deletedRecordIds`.

This task only touches the promotion/load/tombstone plumbing — it does not yet touch `runBatchEnrichment` (that's Task 6) or the UI trigger (Task 7). It's independently testable: promote a staged lead manually via the existing "Enrich & Bring Through" button and confirm it doesn't reappear in Tier 1 after a simulated reload.

- [x] **Step 1: Filter the initial `stagedLeads` localStorage load against `deletedRecordIds`**

Find (currently lines 63-75):

```tsx
  // Load Tier 1 Staged Leads Vault from localStorage
  const [stagedLeads, setStagedLeads] = useState<CompanyRecord[]>(() => {
    try {
      const saved = localStorage.getItem(STAGED_VAULT_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.error('Failed to load staged leads from localStorage', e);
    }
    return [];
  });
```

Replace with:

```tsx
  // Load Tier 1 Staged Leads Vault from localStorage
  const [stagedLeads, setStagedLeads] = useState<CompanyRecord[]>(() => {
    try {
      const saved = localStorage.getItem(STAGED_VAULT_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const savedDeleted = localStorage.getItem(DELETED_IDS_KEY);
          const deletedSet = savedDeleted ? new Set(JSON.parse(savedDeleted)) : new Set();
          return parsed.filter((l: CompanyRecord) => !deletedSet.has(l.id));
        }
      }
    } catch (e) {
      console.error('Failed to load staged leads from localStorage', e);
    }
    return [];
  });
```

Note: this must stay textually above the `deletedRecordIds` `useState` declaration that already exists just above it in the file (lines 50-61) — it reads `DELETED_IDS_KEY` directly from `localStorage` rather than referencing the `deletedRecordIds` state variable, exactly the same pattern the existing `records` loader already uses two blocks below (lines 84-92), so no reordering of the existing `useState` calls is needed.

- [x] **Step 2: Filter Tier 1 Firestore load on auth (in `initAuth` callback) against `deletedRecordIds`**

Find (currently lines 166-169):

```tsx
            const firestoreStaged = await getStagedLeadsFromFirestore(currentUser.uid);
            if (firestoreStaged && firestoreStaged.length > 0) {
              setStagedLeads(firestoreStaged);
            }
```

Replace with:

```tsx
            const firestoreStaged = await getStagedLeadsFromFirestore(currentUser.uid);
            if (firestoreStaged && firestoreStaged.length > 0) {
              const validStaged = firestoreStaged.filter((l) => !deletedRecordIds.has(l.id));
              setStagedLeads(validStaged);
            }
```

- [x] **Step 3: Filter Tier 1 Firestore load on manual sign-in against `deletedRecordIds`**

Find (currently lines 200-205):

```tsx
          const firestoreStaged = await getStagedLeadsFromFirestore(result.user.uid);
          if (firestoreStaged && firestoreStaged.length > 0) {
            setStagedLeads(firestoreStaged);
          } else if (stagedLeads.length > 0) {
            await saveStagedLeadsToFirestore(result.user.uid, stagedLeads);
          }
```

Replace with:

```tsx
          const firestoreStaged = await getStagedLeadsFromFirestore(result.user.uid);
          if (firestoreStaged && firestoreStaged.length > 0) {
            const validStaged = firestoreStaged.filter((l) => !deletedRecordIds.has(l.id));
            setStagedLeads(validStaged);
          } else if (stagedLeads.length > 0) {
            await saveStagedLeadsToFirestore(result.user.uid, stagedLeads);
          }
```

- [x] **Step 4: Tombstone promoted IDs synchronously in `handlePromoteAndEnrichStagedLeads`**

Find (currently lines 338-360):

```tsx
  // Promote & bring through staged leads into Final Enriched Results Data Table (Tier 2)
  const handlePromoteAndEnrichStagedLeads = (leadsToPromote: CompanyRecord[]) => {
    if (!leadsToPromote || leadsToPromote.length === 0) return;

    const promoteIds = new Set(leadsToPromote.map((l) => l.id));

    // Append to active records table
    setRecords((prev) => {
      const existingIds = new Set(prev.map((r) => r.id));
      const freshLeads = leadsToPromote.filter((l) => !existingIds.has(l.id));
      return [...prev, ...freshLeads];
    });

    // Remove promoted leads from Staging Vault
    setStagedLeads((prev) => prev.filter((l) => !promoteIds.has(l.id)));
    setActiveTab('FINAL_TABLE');

    if (user) {
      deleteStagedLeadsFromFirestore(user.uid, Array.from(promoteIds)).catch((e) =>
        console.warn('Firestore staged delete error:', e)
      );
    }
  };
```

Replace with:

```tsx
  // Promote & bring through staged leads into Final Enriched Results Data Table (Tier 2)
  const handlePromoteAndEnrichStagedLeads = (leadsToPromote: CompanyRecord[]) => {
    if (!leadsToPromote || leadsToPromote.length === 0) return;

    const promoteIds = new Set(leadsToPromote.map((l) => l.id));

    // Append to active records table
    setRecords((prev) => {
      const existingIds = new Set(prev.map((r) => r.id));
      const freshLeads = leadsToPromote.filter((l) => !existingIds.has(l.id));
      return [...prev, ...freshLeads];
    });

    // Remove promoted leads from Staging Vault
    setStagedLeads((prev) => prev.filter((l) => !promoteIds.has(l.id)));
    setActiveTab('FINAL_TABLE');

    // Tombstone promoted IDs synchronously so a failed/slow Firestore delete below
    // can never resurrect them back into Tier 1 on next load/sign-in.
    setDeletedRecordIds((prev) => {
      const next = new Set([...prev, ...promoteIds]);
      localStorage.setItem(DELETED_IDS_KEY, JSON.stringify(Array.from(next)));
      return next;
    });

    if (user) {
      deleteStagedLeadsFromFirestore(user.uid, Array.from(promoteIds)).catch((e) =>
        console.warn('Firestore staged delete error:', e)
      );
    }
  };
```

- [x] **Step 5: Type-check**

Run: `npm run lint`
Expected: exits with no errors.

- [x] **Step 6: Manual verification in the dev server**

Run: `npm run dev`, open `http://localhost:3000`.

1. Load sample data (populates both tiers with test data) or import a small CSV.
2. Switch to the "Tier 1: Staged Raw Leads Vault" tab, select one lead, click "Enrich & Bring Through (1) to Final Table".
3. Open browser DevTools → Application → Local Storage → confirm `irish_b2b_deleted_record_ids_v1` now contains that lead's `id`.
4. Confirm the lead appears in the Tier 2 table and no longer appears in Tier 1.
5. Refresh the page — confirm the lead still does not reappear in Tier 1 (this is the resurrection-gap check; without Step 4's fix, a slow/failed Firestore delete could bring it back).

- [x] **Step 7: Commit**

```bash
git add src/App.tsx
git commit -m "fix: tombstone promoted staged leads synchronously, filter Tier 1 loads against deletedRecordIds"
```

---

### Task 5: Server — mode-aware Light Sweep enrichment

**Files:**
- Modify: `server.ts`

**Interfaces:**
- Consumes: `normalizeString`, `getApexDomain` from `./src/utils/normalize` (Task 1)
- Produces: `enrichBusinessRecord(companyName, county, companyNumber, options)` now accepts `options.mode`, `options.eircode`, `options.rawRowData`; both routes accept and forward a `mode` field from the request body.

- [x] **Step 1: Import the shared normalize helpers**

Find (currently line 5):

```ts
import dotenv from "dotenv";
```

Replace with:

```ts
import dotenv from "dotenv";
import { normalizeString, getApexDomain } from "./src/utils/normalize";
```

- [x] **Step 2: Extend `EnrichOptions`**

Find (currently lines 54-57):

```ts
interface EnrichOptions {
  modelName?: string;
  forceRefresh?: boolean;
}
```

Replace with:

```ts
interface EnrichOptions {
  modelName?: string;
  forceRefresh?: boolean;
  mode?: 'LIGHT_SWEEP' | 'FULL_ENRICHMENT';
  eircode?: string;
  rawRowData?: Record<string, any>;
}

function buildAddressContext(county: string, eircode?: string, rawRowData?: Record<string, any>): string {
  const parts: string[] = [];
  if (county) parts.push(county);
  if (eircode) parts.push(eircode);
  if (rawRowData) {
    const fallbackKeys = ["company_address_4", "company_address_3", "company_address_2", "company_address_1"];
    for (const key of fallbackKeys) {
      const val = rawRowData[key];
      if (typeof val === "string" && val.trim()) {
        parts.push(val.trim());
      }
    }
  }
  return parts.length > 0 ? parts.join(", ") : (county || "Ireland");
}
```

- [x] **Step 3: Namespace the cache key by mode**

Find (currently lines 59-65):

```ts
async function enrichBusinessRecord(
  companyName: string,
  county: string,
  companyNumber?: string,
  options: EnrichOptions = {}
) {
  const cacheKey = `${companyName.trim().toLowerCase()}_${(county || '').trim().toLowerCase()}_${(companyNumber || '').trim().toLowerCase()}`;
```

Replace with:

```ts
async function enrichBusinessRecord(
  companyName: string,
  county: string,
  companyNumber?: string,
  options: EnrichOptions = {}
) {
  const mode: "LIGHT_SWEEP" | "FULL_ENRICHMENT" = options.mode === "LIGHT_SWEEP" ? "LIGHT_SWEEP" : "FULL_ENRICHMENT";
  const cacheKey = `${mode === "LIGHT_SWEEP" ? "light" : "full"}_${normalizeString(companyName)}_${normalizeString(county || "")}`;
```

- [x] **Step 4: Branch the prompt on mode**

Find (currently lines 79-122, the `prompt` declaration through the end of its template literal — this is the existing full-enrichment prompt):

```ts
  const prompt = `You are an expert Irish B2B Lead Research Analyst and Web Intelligence Extraction Agent.
```

(...the full existing template literal, ending at...)

```ts
  "notes": "<Brief 1-sentence reasoning for selection>"
}`;
```

Replace the `const prompt = ...` declaration with a renamed `const fullEnrichmentPrompt = ...` (identical body, only the `const` name changes), then immediately follow it with the Light Sweep prompt and the mode branch:

```ts
  const fullEnrichmentPrompt = `You are an expert Irish B2B Lead Research Analyst and Web Intelligence Extraction Agent.

YOUR TASK:
For this Irish business:
Business Name: "${companyName}"
County/Location: "${county}"
${companyNumber ? `CRO Registration Number: "${companyNumber}"` : ""}

1. FIND OFFICIAL WEBSITE: Search for and identify the official, primary website domain URL.
   - EXCLUDE directories (goldenpages.ie, solocheck.ie, vision-net.ie, rip.ie, yelp.ie, tripadvisor, google maps links).
   - EXCLUDE social media platforms UNLESS no official domain exists AND an active official Facebook page exists for this business in County ${county}.

2. CONDUCT B2B LEAD RESEARCH & WEBSITE VERIFICATION:
   - Industry / Sector: Determine business sector (e.g. Dairy & Agriculture, Food & Beverage, Construction, Software & Tech, Retail, Logistics).
   - Company Summary: Write a concise 1-2 sentence overview of what the company does based on their website or web footprint.
   - Key Decision Maker (DM): Identify CEO, Managing Director, Founder, Owner, or top executive (Full Name e.g. "John Murphy").
   - Decision Maker Role: Their official title/role (e.g. "Managing Director", "Chief Executive Officer", "Owner", "Founder").
   - LinkedIn Research (Priority Fallback Order):
     1. Search for Key Decision Maker's personal LinkedIn profile URL (e.g. https://www.linkedin.com/in/...). If found, set "linkedin_url" to that URL and "linkedin_type" to "DECISION_MAKER".
     2. Fallback: If no personal decision maker LinkedIn page is found, search for official Business / Company LinkedIn page (e.g. https://www.linkedin.com/company/...). If found, set "linkedin_url" to that URL and "linkedin_type" to "COMPANY".
     3. If neither can be found, set "linkedin_url" to null and "linkedin_type" to "NOT_FOUND".
   - Primary Company Phone: Main general office/reception phone number if publicly listed. Do NOT search for personal direct-dial phone numbers for the Decision Maker.
   - Company Contact Email: Main public info/sales email (e.g. info@domain.ie) if publicly listed. Do NOT search for direct personal email addresses for the Decision Maker.
   - Verification Status: "VERIFIED_ACTIVE" if official site confirmed, "VERIFIED_FACEBOOK" if FB page used, or "UNVERIFIED".

STRICT OUTPUT FORMAT:
Return ONLY a raw JSON object:
{
  "business_name": "${companyName}",
  "county": "${county}",
  "official_website_url": "<VALID_FULL_URL_OR_NULL>",
  "industry": "<PRIMARY_INDUSTRY_OR_NULL>",
  "company_summary": "<1_2_SENTENCE_BUSINESS_OVERVIEW_OR_NULL>",
  "decision_maker_name": "<KEY_EXECUTIVE_FULL_NAME_OR_NULL>",
  "decision_maker_role": "<KEY_EXECUTIVE_TITLE_ROLE_OR_NULL>",
  "linkedin_url": "<LINKEDIN_URL_OR_NULL>",
  "linkedin_type": "DECISION_MAKER" | "COMPANY" | "NOT_FOUND",
  "phone_number": "<PUBLIC_PHONE_OR_NULL>",
  "contact_email": "<PUBLIC_EMAIL_OR_NULL>",
  "verification_status": "VERIFIED_ACTIVE" | "VERIFIED_FACEBOOK" | "UNVERIFIED",
  "confidence_score": "HIGH" | "MEDIUM" | "LOW",
  "match_type": "OFFICIAL_WEBSITE" | "FACEBOOK_FALLBACK" | "NOT_FOUND",
  "notes": "<Brief 1-sentence reasoning for selection>"
}`;

  const addressContext = buildAddressContext(county, options.eircode, options.rawRowData);
  const lightSweepPrompt = `You are a fast Irish business verification agent running a bulk "Light Sweep" pass.

For this Irish business:
Business Name: "${companyName}"
Address Context: "${addressContext}"
${companyNumber ? `CRO Registration Number: "${companyNumber}"` : ""}

TASK: Quickly verify if this business is currently trading, and find its official website.
- website: The official website domain URL, or null if none found. EXCLUDE directories (goldenpages.ie, solocheck.ie, vision-net.ie, rip.ie, yelp.ie, tripadvisor, google maps links) and social media links.
- trading_status: "TRADING" if there is clear evidence the business is currently active and trading, "DORMANT_OR_SHELL" if it appears dissolved/inactive/shell, or "NOT_FOUND" if no evidence either way can be found.
- category: A short business category (e.g. "Dairy & Agriculture", "Construction", "Retail", "Software & Tech").
- phone: Main public phone number if listed, or null.

STRICT OUTPUT FORMAT:
Return ONLY a raw JSON object:
{
  "website": "<VALID_FULL_URL_OR_NULL>",
  "trading_status": "TRADING" | "DORMANT_OR_SHELL" | "NOT_FOUND",
  "category": "<SHORT_CATEGORY_OR_NULL>",
  "phone": "<PUBLIC_PHONE_OR_NULL>"
}`;

  const prompt = mode === "LIGHT_SWEEP" ? lightSweepPrompt : fullEnrichmentPrompt;
```

- [x] **Step 5: Branch the response parsing/return on mode**

Find (currently lines 226-278, from `let websiteUrl = ...` through the end of the function):

```ts
  let websiteUrl = resultJson?.official_website_url || null;
  let matchType = resultJson?.match_type || "NOT_FOUND";
  let confidence = resultJson?.confidence_score || "LOW";
  let notes = resultJson?.notes || "Research completed via Google Search Grounding.";

  if (websiteUrl) {
    const lowerUrl = websiteUrl.toLowerCase();
    const isBanned = BANNED_DIRECTORIES.some((d) => lowerUrl.includes(d));
    const isFacebook = lowerUrl.includes("facebook.com");

    if (isBanned) {
      websiteUrl = null;
      matchType = "NOT_FOUND";
      confidence = "LOW";
      notes = "Filtered out directory link from initial search; no official direct domain confirmed.";
    } else if (isFacebook && matchType !== "FACEBOOK_FALLBACK") {
      matchType = "FACEBOOK_FALLBACK";
      confidence = "MEDIUM";
      if (!notes) notes = "Official Facebook page identified as company domain fallback.";
    } else if (!isFacebook && !isBanned && matchType === "NOT_FOUND") {
      matchType = "OFFICIAL_WEBSITE";
      confidence = "HIGH";
    }
  } else {
    matchType = "NOT_FOUND";
    confidence = "LOW";
  }

  const enrichedResult = {
    business_name: resultJson?.business_name || companyName,
    county: resultJson?.county || county,
    official_website_url: websiteUrl,
    industry: resultJson?.industry || null,
    companySummary: resultJson?.company_summary || null,
    decisionMakerName: resultJson?.decision_maker_name || null,
    decisionMakerRole: resultJson?.decision_maker_role || null,
    linkedinUrl: resultJson?.linkedin_url || null,
    linkedinType: resultJson?.linkedin_type || (resultJson?.linkedin_url ? (resultJson.linkedin_url.includes('/in/') ? 'DECISION_MAKER' : 'COMPANY') : 'NOT_FOUND'),
    phoneNumber: resultJson?.phone_number || null,
    contactEmail: resultJson?.contact_email || null,
    verificationStatus: resultJson?.verification_status || (websiteUrl ? (matchType === 'FACEBOOK_FALLBACK' ? 'VERIFIED_FACEBOOK' : 'VERIFIED_ACTIVE') : 'UNVERIFIED'),
    confidence_score: confidence,
    match_type: matchType,
    notes,
    grounding_sources: sources,
    fromCache: false,
  };

  // Save to in-memory cache
  ENRICHMENT_CACHE.set(cacheKey, enrichedResult);

  return enrichedResult;
}
```

Replace with:

```ts
  if (mode === "LIGHT_SWEEP") {
    let websiteUrl = resultJson?.website || null;
    const tradingStatus = resultJson?.trading_status || "NOT_FOUND";
    const category = resultJson?.category || null;
    const phone = resultJson?.phone || null;

    if (websiteUrl) {
      const lowerUrl = websiteUrl.toLowerCase();
      const isBanned = BANNED_DIRECTORIES.some((d) => lowerUrl.includes(d));
      if (isBanned) websiteUrl = null;
    }

    const apexDomain = getApexDomain(websiteUrl);

    const lightSweepResult = {
      official_website_url: websiteUrl,
      tradingStatus,
      category,
      phoneNumber: phone,
      apexDomain,
      confidence_score: websiteUrl && tradingStatus === "TRADING" ? "MEDIUM" : "LOW",
      notes:
        websiteUrl && tradingStatus === "TRADING"
          ? "Verified trading via Light Sweep pass."
          : "Light Sweep found no confirmed active trading website.",
      fromCache: false,
    };

    ENRICHMENT_CACHE.set(cacheKey, lightSweepResult);
    return lightSweepResult;
  }

  let websiteUrl = resultJson?.official_website_url || null;
  let matchType = resultJson?.match_type || "NOT_FOUND";
  let confidence = resultJson?.confidence_score || "LOW";
  let notes = resultJson?.notes || "Research completed via Google Search Grounding.";

  if (websiteUrl) {
    const lowerUrl = websiteUrl.toLowerCase();
    const isBanned = BANNED_DIRECTORIES.some((d) => lowerUrl.includes(d));
    const isFacebook = lowerUrl.includes("facebook.com");

    if (isBanned) {
      websiteUrl = null;
      matchType = "NOT_FOUND";
      confidence = "LOW";
      notes = "Filtered out directory link from initial search; no official direct domain confirmed.";
    } else if (isFacebook && matchType !== "FACEBOOK_FALLBACK") {
      matchType = "FACEBOOK_FALLBACK";
      confidence = "MEDIUM";
      if (!notes) notes = "Official Facebook page identified as company domain fallback.";
    } else if (!isFacebook && !isBanned && matchType === "NOT_FOUND") {
      matchType = "OFFICIAL_WEBSITE";
      confidence = "HIGH";
    }
  } else {
    matchType = "NOT_FOUND";
    confidence = "LOW";
  }

  const enrichedResult = {
    business_name: resultJson?.business_name || companyName,
    county: resultJson?.county || county,
    official_website_url: websiteUrl,
    apexDomain: getApexDomain(websiteUrl),
    industry: resultJson?.industry || null,
    companySummary: resultJson?.company_summary || null,
    decisionMakerName: resultJson?.decision_maker_name || null,
    decisionMakerRole: resultJson?.decision_maker_role || null,
    linkedinUrl: resultJson?.linkedin_url || null,
    linkedinType: resultJson?.linkedin_type || (resultJson?.linkedin_url ? (resultJson.linkedin_url.includes('/in/') ? 'DECISION_MAKER' : 'COMPANY') : 'NOT_FOUND'),
    phoneNumber: resultJson?.phone_number || null,
    contactEmail: resultJson?.contact_email || null,
    verificationStatus: resultJson?.verification_status || (websiteUrl ? (matchType === 'FACEBOOK_FALLBACK' ? 'VERIFIED_FACEBOOK' : 'VERIFIED_ACTIVE') : 'UNVERIFIED'),
    confidence_score: confidence,
    match_type: matchType,
    notes,
    grounding_sources: sources,
    fromCache: false,
  };

  // Save to in-memory cache
  ENRICHMENT_CACHE.set(cacheKey, enrichedResult);

  return enrichedResult;
}
```

- [x] **Step 6: Forward `mode`/`eircode`/`rawRowData` through `/api/enrich-single`**

Find (currently lines 290-308):

```ts
app.post("/api/enrich-single", async (req, res) => {
  try {
    const { id, companyName, county, companyNumber, modelName, forceRefresh } = req.body;
    if (!companyName || !county) {
      return res.status(400).json({ error: "companyName and county are required." });
    }

    const enrichment = await enrichBusinessRecord(companyName, county, companyNumber, {
      modelName,
      forceRefresh,
    });
    res.json({ id, ...enrichment });
  } catch (error: any) {
    console.error("Error in /api/enrich-single:", error);
    res.status(500).json({
      error: error.message || "Failed to enrich business record.",
    });
  }
});
```

Replace with:

```ts
app.post("/api/enrich-single", async (req, res) => {
  try {
    const { id, companyName, county, companyNumber, modelName, forceRefresh, mode, eircode, rawRowData } = req.body;
    if (!companyName || !county) {
      return res.status(400).json({ error: "companyName and county are required." });
    }

    const enrichment = await enrichBusinessRecord(companyName, county, companyNumber, {
      modelName,
      forceRefresh,
      mode,
      eircode,
      rawRowData,
    });
    res.json({ id, ...enrichment });
  } catch (error: any) {
    console.error("Error in /api/enrich-single:", error);
    res.status(500).json({
      error: error.message || "Failed to enrich business record.",
    });
  }
});
```

- [x] **Step 7: Forward `mode` through `/api/enrich-batch`**

Find (currently lines 311-330):

```ts
app.post("/api/enrich-batch", async (req, res) => {
  try {
    const { companies, modelName, forceRefresh } = req.body;
    if (!Array.isArray(companies) || companies.length === 0) {
      return res.status(400).json({ error: "companies must be a non-empty array." });
    }

    const results = [];
    // Process companies with concurrency limit of 3 to ensure fast and reliable execution
    const batchSize = 3;
    for (let i = 0; i < companies.length; i += batchSize) {
      const chunk = companies.slice(i, i + batchSize);
      const chunkPromises = chunk.map(async (company: any) => {
        try {
          const enrichment = await enrichBusinessRecord(
            company.companyName,
            company.county || company.address4,
            company.companyNumber,
            { modelName, forceRefresh }
          );
```

Replace with:

```ts
app.post("/api/enrich-batch", async (req, res) => {
  try {
    const { companies, modelName, forceRefresh, mode } = req.body;
    if (!Array.isArray(companies) || companies.length === 0) {
      return res.status(400).json({ error: "companies must be a non-empty array." });
    }

    const results = [];
    // Process companies with concurrency limit of 3 to ensure fast and reliable execution
    const batchSize = 3;
    for (let i = 0; i < companies.length; i += batchSize) {
      const chunk = companies.slice(i, i + batchSize);
      const chunkPromises = chunk.map(async (company: any) => {
        try {
          const enrichment = await enrichBusinessRecord(
            company.companyName,
            company.county || company.address4,
            company.companyNumber,
            { modelName, forceRefresh, mode, eircode: company.eircode, rawRowData: company.rawRowData }
          );
```

- [x] **Step 8: Type-check**

Run: `npm run lint`
Expected: exits with no errors.

- [x] **Step 9: Manual verification against the running server**

Run: `npm run dev`, then in a separate terminal:

```bash
curl -s -X POST http://localhost:3000/api/enrich-single \
  -H "Content-Type: application/json" \
  -d '{"id":"test-1","companyName":"Supermacs","county":"Galway","mode":"LIGHT_SWEEP"}' | head -c 600
```

Expected: JSON response containing `"tradingStatus"`, `"category"`, `"apexDomain"` keys (not `"industry"`/`"decisionMakerName"` — those are `FULL_ENRICHMENT`-only fields). Repeat without `"mode"` in the body and confirm the response instead contains `"industry"`/`"decisionMakerName"` (the `FULL_ENRICHMENT` default path, unchanged behavior).

- [x] **Step 10: Commit**

```bash
git add server.ts
git commit -m "feat: add mode-aware Light Sweep enrichment path with namespaced cache"
```

---

### Task 6: Client — generalized batch runner with Light Sweep outcome handling

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `handlePromoteAndEnrichStagedLeads` (Task 4, now tombstone-safe); `mode`/`eircode`/`rawRowData`/`tradingStatus`/`category`/`apexDomain` fields on the `/api/enrich-single` request/response (Task 5); `CompanyRecord.apexDomain`/`tradingStatus`/`category`/`eircode` (Task 2)
- Produces: `runBatchEnrichment(tier?: 'STAGED' | 'FINAL')` — the sole batch-processing entry point for both tiers, replacing the old zero-argument, Tier-2-only version.

- [x] **Step 1: Remove the auto-promote-all shortcut and generalize the function signature/body**

Find (currently lines 603-720, the entire `runBatchEnrichment` function):

```tsx
  // Run Batch Enrichment process with pacing delay and rate limit resilience
  const runBatchEnrichment = async () => {
    if (isRunningBatch) return;

    setRateLimitNotice(null);

    // If active tab is staging vault or no pending in records, auto-promote staged leads first!
    if (stagedLeads.length > 0 && records.filter((r) => r.status === 'PENDING').length === 0) {
      handlePromoteAndEnrichStagedLeads(stagedLeads);
    }

    // Filter strictly PENDING records (deduplication guarantee)
    const pendingRecords = records.filter((r) => r.status === 'PENDING');
    if (pendingRecords.length === 0) return;

    const itemsToProcess = pendingRecords.slice(0, batchSize);
    setIsRunningBatch(true);
    stopBatchRef.current = false;

    for (let i = 0; i < itemsToProcess.length; i++) {
      if (stopBatchRef.current) break;

      const targetItem = itemsToProcess[i];
      setCurrentActiveCompany(targetItem);

      // Mark row as processing in UI
      setRecords((prev) =>
        prev.map((r) => (r.id === targetItem.id ? { ...r, status: 'PROCESSING' } : r))
      );

      try {
        const res = await fetch('/api/enrich-single', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: targetItem.id,
            companyName: targetItem.companyName,
            county: targetItem.county,
            companyNumber: targetItem.companyNumber,
            modelName: selectedModel,
            forceRefresh: !useCache,
          }),
        });

        if (res.status === 429) {
          setRateLimitNotice('Gemini API rate limit reached. Pausing batch to let quota refresh. You can click "Run Batch Enrichment" again in a few seconds.');
          setRecords((prev) =>
            prev.map((r) => (r.id === targetItem.id ? { ...r, status: 'PENDING' } : r))
          );
          break;
        }

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          if (errData.error?.includes('rate limit') || errData.error?.includes('quota')) {
            setRateLimitNotice('Gemini API rate limit reached. Pausing batch to let quota refresh.');
            setRecords((prev) =>
              prev.map((r) => (r.id === targetItem.id ? { ...r, status: 'PENDING' } : r))
            );
            break;
          }
          throw new Error(errData.error || `API error ${res.status}`);
        }

        const data = await res.json();

        setRecords((prev) =>
          prev.map((r) => {
            if (r.id === targetItem.id) {
              return {
                ...r,
                status: 'SUCCESS',
                official_website_url: data.official_website_url,
                industry: data.industry,
                companySummary: data.companySummary,
                decisionMakerName: data.decisionMakerName,
                decisionMakerRole: data.decisionMakerRole,
                linkedinUrl: data.linkedinUrl,
                linkedinType: data.linkedinType,
                phoneNumber: data.phoneNumber,
                contactEmail: data.contactEmail,
                verificationStatus: data.verificationStatus,
                confidence_score: data.confidence_score,
                match_type: data.match_type,
                notes: data.notes,
                grounding_sources: data.grounding_sources,
                processedAt: new Date().toISOString(),
              };
            }
            return r;
          })
        );
      } catch (err: any) {
        console.error(`Error enriching ${targetItem.companyName}:`, err);
        setRecords((prev) =>
          prev.map((r) =>
            r.id === targetItem.id
              ? {
                  ...r,
                  status: 'FAILED',
                  official_website_url: null,
                  confidence_score: 'LOW',
                  match_type: 'NOT_FOUND',
                  notes: `Enrichment error: ${err.message}`,
                }
              : r
          )
        );
      }

      if (i < itemsToProcess.length - 1 && !stopBatchRef.current) {
        await new Promise((resolve) => setTimeout(resolve, requestDelay * 1000));
      }
    }

    setIsRunningBatch(false);
    setCurrentActiveCompany(null);
  };
```

Replace with:

```tsx
  // Run Batch Enrichment (Tier 2 full research) or Light Sweep (Tier 1 fast match),
  // sharing the same pacing/429-pause/cancellation infrastructure.
  const runBatchEnrichment = async (tier: 'STAGED' | 'FINAL' = 'FINAL') => {
    if (isRunningBatch) return;

    setRateLimitNotice(null);

    const mode: 'LIGHT_SWEEP' | 'FULL_ENRICHMENT' = tier === 'STAGED' ? 'LIGHT_SWEEP' : 'FULL_ENRICHMENT';
    const sourceList = tier === 'STAGED' ? stagedLeads : records;
    const pendingRecords = sourceList.filter((r) => r.status === 'PENDING');
    if (pendingRecords.length === 0) return;

    const itemsToProcess = pendingRecords.slice(0, batchSize);
    setIsRunningBatch(true);
    stopBatchRef.current = false;

    // Apex domains already present in Tier 2, seeded before the run so a Light Sweep
    // catches shared-domain matches against earlier sweep runs, not just this one.
    const seenApexDomains = new Set<string>(
      records.filter((r) => r.apexDomain).map((r) => r.apexDomain as string)
    );

    for (let i = 0; i < itemsToProcess.length; i++) {
      if (stopBatchRef.current) break;

      const targetItem = itemsToProcess[i];
      setCurrentActiveCompany(targetItem);

      const applyToSourceTier = (updater: (prev: CompanyRecord[]) => CompanyRecord[]) => {
        if (tier === 'STAGED') setStagedLeads(updater);
        else setRecords(updater);
      };

      // Mark row as processing in UI
      applyToSourceTier((prev) =>
        prev.map((r) => (r.id === targetItem.id ? { ...r, status: 'PROCESSING' } : r))
      );

      try {
        const res = await fetch('/api/enrich-single', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: targetItem.id,
            companyName: targetItem.companyName,
            county: targetItem.county,
            companyNumber: targetItem.companyNumber,
            eircode: targetItem.eircode,
            rawRowData: targetItem.rawRowData,
            modelName: selectedModel,
            forceRefresh: !useCache,
            mode,
          }),
        });

        if (res.status === 429) {
          setRateLimitNotice('Gemini API rate limit reached. Pausing batch to let quota refresh. You can click "Run Batch Enrichment" again in a few seconds.');
          applyToSourceTier((prev) =>
            prev.map((r) => (r.id === targetItem.id ? { ...r, status: 'PENDING' } : r))
          );
          break;
        }

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          if (errData.error?.includes('rate limit') || errData.error?.includes('quota')) {
            setRateLimitNotice('Gemini API rate limit reached. Pausing batch to let quota refresh.');
            applyToSourceTier((prev) =>
              prev.map((r) => (r.id === targetItem.id ? { ...r, status: 'PENDING' } : r))
            );
            break;
          }
          throw new Error(errData.error || `API error ${res.status}`);
        }

        const data = await res.json();

        if (tier === 'STAGED') {
          if (data.tradingStatus === 'TRADING' && data.official_website_url) {
            const apexDomain: string | null = data.apexDomain || null;
            const isSharedDomain = apexDomain !== null && seenApexDomains.has(apexDomain);
            if (apexDomain) seenApexDomains.add(apexDomain);

            const promotedRecord: CompanyRecord = {
              ...targetItem,
              status: 'SUCCESS',
              official_website_url: data.official_website_url,
              tradingStatus: data.tradingStatus,
              category: data.category || null,
              phoneNumber: data.phoneNumber || null,
              apexDomain,
              confidence_score: data.confidence_score || 'MEDIUM',
              match_type: isSharedDomain ? 'SHARED_DOMAIN' : 'LIGHT_SWEEP_COMPLETE',
              notes: data.notes || 'Promoted via Light Sweep.',
              processedAt: new Date().toISOString(),
            };
            handlePromoteAndEnrichStagedLeads([promotedRecord]);
          } else {
            setStagedLeads((prev) =>
              prev.map((r) =>
                r.id === targetItem.id
                  ? {
                      ...r,
                      status: 'SUCCESS',
                      tradingStatus: data.tradingStatus || 'NOT_FOUND',
                      category: data.category || null,
                      phoneNumber: data.phoneNumber || null,
                      match_type: 'DISQUALIFIED',
                      notes: data.notes || 'Light Sweep found no active trading website.',
                      processedAt: new Date().toISOString(),
                    }
                  : r
              )
            );
          }
        } else {
          setRecords((prev) =>
            prev.map((r) => {
              if (r.id === targetItem.id) {
                return {
                  ...r,
                  status: 'SUCCESS',
                  official_website_url: data.official_website_url,
                  apexDomain: data.apexDomain,
                  industry: data.industry,
                  companySummary: data.companySummary,
                  decisionMakerName: data.decisionMakerName,
                  decisionMakerRole: data.decisionMakerRole,
                  linkedinUrl: data.linkedinUrl,
                  linkedinType: data.linkedinType,
                  phoneNumber: data.phoneNumber,
                  contactEmail: data.contactEmail,
                  verificationStatus: data.verificationStatus,
                  confidence_score: data.confidence_score,
                  match_type: data.match_type,
                  notes: data.notes,
                  grounding_sources: data.grounding_sources,
                  processedAt: new Date().toISOString(),
                };
              }
              return r;
            })
          );
        }
      } catch (err: any) {
        console.error(`Error enriching ${targetItem.companyName}:`, err);
        applyToSourceTier((prev) =>
          prev.map((r) =>
            r.id === targetItem.id
              ? {
                  ...r,
                  status: 'FAILED',
                  official_website_url: null,
                  confidence_score: 'LOW',
                  match_type: tier === 'STAGED' ? 'DISQUALIFIED' : 'NOT_FOUND',
                  notes: `Enrichment error: ${err.message}`,
                }
              : r
          )
        );
      }

      if (i < itemsToProcess.length - 1 && !stopBatchRef.current) {
        await new Promise((resolve) => setTimeout(resolve, requestDelay * 1000));
      }
    }

    setIsRunningBatch(false);
    setCurrentActiveCompany(null);
  };
```

- [x] **Step 2: Update the Tier 2 `BatchControls` call site to pass `'FINAL'` explicitly**

Find (currently line 839, inside the `<BatchControls ... />` element):

```tsx
          onRunBatch={runBatchEnrichment}
```

Replace with:

```tsx
          onRunBatch={() => runBatchEnrichment('FINAL')}
```

(This is required, not cosmetic: `BatchControls` invokes its `onRunBatch` prop as a raw DOM `onClick` handler, which calls it with a `MouseEvent` as the first argument. Passing `runBatchEnrichment` directly would make `tier` receive that event object instead of `'FINAL'`.)

- [x] **Step 3: Type-check**

Run: `npm run lint`
Expected: exits with no errors.

- [x] **Step 4: Manual verification in the dev server**

Run: `npm run dev`, open `http://localhost:3000`.

1. Load sample data, confirm the Tier 2 "Run Batch Enrichment" button still works exactly as before (full enrichment fields populate: industry, decision maker, LinkedIn).
2. Import a small test CSV (3-5 rows) into Tier 1. Confirm the old auto-promote-all-on-click behavior is gone: with Tier 2 empty and Tier 1 populated, clicking "Run Batch Enrichment" on the Tier 2 tab does nothing (no pending records in `records`), rather than silently pulling in all staged leads.

(The Light Sweep trigger itself doesn't exist in the UI yet — that's Task 7. This task only verifies the underlying function and the Tier 2 regression check.)

- [x] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "feat: generalize runBatchEnrichment to drive Light Sweep over Tier 1, remove auto-promote-all shortcut"
```

---

### Task 7: UI — Light Sweep controls on the Staging Vault

**Files:**
- Modify: `src/components/StagedLeadsVault.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/ResultsTable.tsx`

**Interfaces:**
- Consumes: `runBatchEnrichment('STAGED')`, `handleStopBatch`, `isRunningBatch`, `currentActiveCompany` (all exist in `App.tsx` after Task 6)
- Produces: `StagedLeadsVault` gains `onRunLightSweep`, `onStopLightSweep`, `isRunningSweep`, `currentActiveRowName` props and a status filter for `DISQUALIFIED` leads.

- [x] **Step 1: Add new props to `StagedLeadsVaultProps`**

Find (currently lines 5-10 in `src/components/StagedLeadsVault.tsx`):

```tsx
interface StagedLeadsVaultProps {
  stagedLeads: CompanyRecord[];
  onPromoteAndEnrich: (leadsToPromote: CompanyRecord[]) => void;
  onDeleteStagedLeads: (idsToDelete: string[]) => void;
  onClearStagingVault: () => void;
}
```

Replace with:

```tsx
interface StagedLeadsVaultProps {
  stagedLeads: CompanyRecord[];
  onPromoteAndEnrich: (leadsToPromote: CompanyRecord[]) => void;
  onDeleteStagedLeads: (idsToDelete: string[]) => void;
  onClearStagingVault: () => void;
  onRunLightSweep: () => void;
  onStopLightSweep: () => void;
  isRunningSweep: boolean;
  currentActiveRowName?: string | null;
}
```

- [x] **Step 2: Destructure the new props and add a status filter**

Find (currently lines 12-20):

```tsx
export const StagedLeadsVault: React.FC<StagedLeadsVaultProps> = ({
  stagedLeads,
  onPromoteAndEnrich,
  onDeleteStagedLeads,
  onClearStagingVault,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [countyFilter, setCountyFilter] = useState('ALL');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
```

Replace with:

```tsx
export const StagedLeadsVault: React.FC<StagedLeadsVaultProps> = ({
  stagedLeads,
  onPromoteAndEnrich,
  onDeleteStagedLeads,
  onClearStagingVault,
  onRunLightSweep,
  onStopLightSweep,
  isRunningSweep,
  currentActiveRowName,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [countyFilter, setCountyFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'DISQUALIFIED'>('ALL');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const pendingCount = stagedLeads.filter((l) => l.match_type !== 'DISQUALIFIED').length;
  const disqualifiedCount = stagedLeads.filter((l) => l.match_type === 'DISQUALIFIED').length;
```

- [x] **Step 3: Apply the status filter in `filteredStagedLeads`**

Find (currently lines 24-33):

```tsx
  const filteredStagedLeads = stagedLeads.filter((lead) => {
    const matchesSearch =
      !searchTerm ||
      lead.companyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.companyNumber.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesCounty = countyFilter === 'ALL' || lead.county.toLowerCase() === countyFilter.toLowerCase();

    return matchesSearch && matchesCounty;
  });
```

Replace with:

```tsx
  const filteredStagedLeads = stagedLeads.filter((lead) => {
    const matchesSearch =
      !searchTerm ||
      lead.companyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.companyNumber.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesCounty = countyFilter === 'ALL' || lead.county.toLowerCase() === countyFilter.toLowerCase();

    const matchesStatus =
      statusFilter === 'ALL' ||
      (statusFilter === 'DISQUALIFIED' && lead.match_type === 'DISQUALIFIED') ||
      (statusFilter === 'PENDING' && lead.match_type !== 'DISQUALIFIED');

    return matchesSearch && matchesCounty && matchesStatus;
  });
```

- [x] **Step 4: Add the "Run Light Sweep" button and running-status indicator to the header toolbar**

Find (currently lines 114-133, the action button row in the populated-state header):

```tsx
        <div className="relative flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handlePromoteSelected}
            className="px-4 py-2 bg-gradient-to-r from-ember to-gold text-void font-bold text-xs rounded-full transition-all inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
            Enrich & Bring Through {selectedIds.size > 0 ? `(${selectedIds.size})` : 'All'} to Final Table
            <ArrowRight className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onClearStagingVault}
            className="px-3 py-2 bg-char hover:bg-char-light text-smoke hover:text-ash font-medium text-xs rounded-full border border-char-light transition-colors cursor-pointer"
            title="Clear all leads from staging vault"
          >
            Clear Vault
          </button>
        </div>
      </div>
```

Replace with:

```tsx
        <div className="relative flex items-center gap-2 flex-wrap">
          {isRunningSweep ? (
            <button
              type="button"
              onClick={onStopLightSweep}
              className="px-4 py-2 bg-gold text-void font-bold text-xs rounded-full transition-all inline-flex items-center gap-1.5 cursor-pointer"
            >
              Stop Light Sweep
            </button>
          ) : (
            <button
              type="button"
              onClick={onRunLightSweep}
              disabled={pendingCount === 0}
              title="Fast Perplexity pass: verifies trading status and website, auto-promotes trading matches to Tier 2"
              className={`px-4 py-2 font-bold text-xs rounded-full transition-all inline-flex items-center gap-1.5 ${
                pendingCount === 0
                  ? 'bg-char-light text-smoke cursor-not-allowed'
                  : 'bg-gradient-to-r from-ember to-gold text-void cursor-pointer'
              }`}
            >
              <Sparkles className="w-4 h-4" />
              Run Light Sweep ({Math.min(pendingCount, 50)} of {pendingCount})
            </button>
          )}
          <button
            type="button"
            onClick={handlePromoteSelected}
            className="px-4 py-2 bg-void/60 hover:bg-void border border-char-light text-ash font-bold text-xs rounded-full transition-all inline-flex items-center gap-1.5 cursor-pointer"
            title="Skip Light Sweep and send hand-picked leads straight to full enrichment"
          >
            Enrich & Bring Through {selectedIds.size > 0 ? `(${selectedIds.size})` : 'All'} to Final Table
            <ArrowRight className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onClearStagingVault}
            className="px-3 py-2 bg-char hover:bg-char-light text-smoke hover:text-ash font-medium text-xs rounded-full border border-char-light transition-colors cursor-pointer"
            title="Clear all leads from staging vault"
          >
            Clear Vault
          </button>
        </div>
      </div>

      {isRunningSweep && currentActiveRowName && (
        <div className="px-5 pb-3 -mt-2 relative flex items-center text-xs text-ash font-medium gap-1.5 bg-void/60 mx-5 p-2 rounded-xl border border-char-light">
          <Sparkles className="w-3.5 h-3.5 text-gold shrink-0" />
          <span>Sweeping: <strong className="text-ash">{currentActiveRowName}</strong></span>
        </div>
      )}
```

- [x] **Step 5: Add the status filter dropdown next to the county filter**

Find (currently lines 148-159, the county `<select>`):

```tsx
          <select
            value={countyFilter}
            onChange={(e) => setCountyFilter(e.target.value)}
            className="px-3 py-2 bg-void border border-char-light text-ash rounded-xl focus:ring-2 focus:ring-gold/40 focus:outline-none"
          >
            <option value="ALL">All Counties ({stagedLeads.length})</option>
            {counties.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
```

Replace with:

```tsx
          <select
            value={countyFilter}
            onChange={(e) => setCountyFilter(e.target.value)}
            className="px-3 py-2 bg-void border border-char-light text-ash rounded-xl focus:ring-2 focus:ring-gold/40 focus:outline-none"
          >
            <option value="ALL">All Counties ({stagedLeads.length})</option>
            {counties.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'ALL' | 'PENDING' | 'DISQUALIFIED')}
            className="px-3 py-2 bg-void border border-char-light text-ash rounded-xl focus:ring-2 focus:ring-gold/40 focus:outline-none"
          >
            <option value="ALL">All Statuses</option>
            <option value="PENDING">Pending Sweep ({pendingCount})</option>
            <option value="DISQUALIFIED">Disqualified ({disqualifiedCount})</option>
          </select>
        </div>
```

- [x] **Step 6: Show sweep status as a badge in the table instead of only "Raw Column Status"**

Find (currently line 198):

```tsx
              <th className="p-3">Raw Column Status</th>
```

Replace with:

```tsx
              <th className="p-3">Sweep Status</th>
```

Find (currently lines 228-232):

```tsx
                  <td className="p-3">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-void/60 text-smoke border border-char-light">
                      {lead.rawRowData ? `${Object.keys(lead.rawRowData).length} columns captured` : 'Standard row'}
                    </span>
                  </td>
```

Replace with:

```tsx
                  <td className="p-3">
                    {lead.match_type === 'DISQUALIFIED' ? (
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-ember/10 text-ember border border-ember/30"
                        title={lead.notes || 'Not trading / no verified website found'}
                      >
                        Disqualified ({lead.tradingStatus || 'NOT_FOUND'})
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-void/60 text-smoke border border-char-light">
                        {lead.rawRowData ? `${Object.keys(lead.rawRowData).length} columns captured` : 'Standard row'}
                      </span>
                    )}
                  </td>
```

- [x] **Step 7: Wire the new props in `App.tsx`**

Find (currently lines 892-898):

```tsx
        {activeTab === 'STAGING_VAULT' ? (
          <StagedLeadsVault
            stagedLeads={stagedLeads}
            onPromoteAndEnrich={handlePromoteAndEnrichStagedLeads}
            onDeleteStagedLeads={handleDeleteStagedLeads}
            onClearStagingVault={handleClearStagingVault}
          />
        ) : (
```

Replace with:

```tsx
        {activeTab === 'STAGING_VAULT' ? (
          <StagedLeadsVault
            stagedLeads={stagedLeads}
            onPromoteAndEnrich={handlePromoteAndEnrichStagedLeads}
            onDeleteStagedLeads={handleDeleteStagedLeads}
            onClearStagingVault={handleClearStagingVault}
            onRunLightSweep={() => runBatchEnrichment('STAGED')}
            onStopLightSweep={handleStopBatch}
            isRunningSweep={isRunningBatch}
            currentActiveRowName={currentActiveCompany?.companyName}
          />
        ) : (
```

- [x] **Step 8: Add the two new Tier 2 filter options to `ResultsTable`'s Match Type dropdown**

In `src/components/ResultsTable.tsx`, find (currently lines 434-438):

```tsx
                <option value="ALL">Match Type: All</option>
                <option value="OFFICIAL_WEBSITE">Official Website</option>
                <option value="FACEBOOK_FALLBACK">Facebook Fallback</option>
                <option value="NOT_FOUND">Not Found / Excluded</option>
                <option value="UNPROCESSED">Unprocessed</option>
```

Replace with:

```tsx
                <option value="ALL">Match Type: All</option>
                <option value="OFFICIAL_WEBSITE">Official Website</option>
                <option value="FACEBOOK_FALLBACK">Facebook Fallback</option>
                <option value="LIGHT_SWEEP_COMPLETE">Light Sweep Match</option>
                <option value="SHARED_DOMAIN">Shared Domain</option>
                <option value="NOT_FOUND">Not Found / Excluded</option>
                <option value="UNPROCESSED">Unprocessed</option>
```

- [x] **Step 9: Type-check**

Run: `npm run lint`
Expected: exits with no errors.

- [x] **Step 10: Manual verification in the dev server**

Run: `npm run dev`, open `http://localhost:3000`.

1. Import a small test CSV (5-10 real or representative Galway-style rows, ideally including at least one pair sharing an obvious real-world domain, e.g. two branches of the same chain) into Tier 1.
2. Switch to the "Tier 1: Staged Raw Leads Vault" tab. Confirm the new "Run Light Sweep" button is present and enabled.
3. Click "Run Light Sweep". Confirm the "Sweeping: <company>" status line appears and updates as it progresses, and "Stop Light Sweep" is available.
4. After it completes: confirm trading records disappeared from Tier 1 and now appear in the Tier 2 table with `match_type` of `LIGHT_SWEEP_COMPLETE` (or `SHARED_DOMAIN` for the shared-domain pair, both showing the same `apexDomain` — check via the row detail modal or browser DevTools state).
5. Confirm non-trading/not-found records remain in Tier 1, tagged "Disqualified" in the Sweep Status column.
6. Switch the new "All Statuses" dropdown to "Disqualified" and confirm it filters to only those rows.
7. Switch to the Tier 2 tab, open the Match Type filter dropdown, confirm "Light Sweep Match" and "Shared Domain" options are present and filter correctly.

- [x] **Step 11: Commit**

```bash
git add src/components/StagedLeadsVault.tsx src/App.tsx src/components/ResultsTable.tsx
git commit -m "feat: add Light Sweep trigger and disqualified/shared-domain status UI to Staging Vault"
```
