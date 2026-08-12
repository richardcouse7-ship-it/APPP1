# Batch Model Cost Estimator — Design

**Date:** 2026-08-10
**Status:** Approved (pending final spec review)
**Scope:** First of three sub-projects identified for the Irish B2B Lead Intelligence Suite (waterfall enrichment, batch performance/cost, outreach tooling). This spec covers batch performance/cost only, narrowed during brainstorming to a per-model cost comparison feature.

## Background

`BatchControls.tsx` currently lets users pick one of four enrichment models (`gemini-3.6-flash`, `gemini-3.1-flash-lite`, `perplexity-sonar`, `perplexity-sonar-pro`) and shows only a qualitative cost label per model (e.g. `"Low Cost (Recommended)"`, `"Maximum Economy"`). There is no way to see what a batch — or the full pending queue, which can run into the thousands — will actually cost before running it.

Investigation during brainstorming surfaced that the original ask ("handle 1,000+ lead batches faster") was broader than the actual pain point. Clarifying questions narrowed the real need down to **cost visibility for model selection**, specifically a per-model $ comparison shown inline where the model is already chosen — not batch execution architecture (queuing, worker threads, background jobs), which remains unaddressed and out of scope here.

Also worth noting: `server.ts` already exposes a `POST /api/enrich-batch` endpoint (chunks of 3 concurrent requests) that the frontend never calls — `runBatchEnrichment` in `App.tsx` drives enrichment sequentially via `/api/enrich-single` from the browser instead. This spec does not touch that; it's noted here as relevant context for whichever sub-project addresses batch execution architecture next.

## Goal

Show users, before they click "Run Batch Enrichment," what the batch they're about to run will cost, and what clearing their entire pending queue would cost, broken down per model — using flat per-record $ rates supplied by the project owner.

## Non-goals

- No live/actual spend tracking across real API calls (a persisted "Total Spent" counter was considered and deferred as a separate future feature).
- No token-level cost accounting — rates are flat $/record, not $/1K tokens.
- No changes to batch execution architecture, concurrency, queuing, or the enrichment pipeline in `server.ts`.
- No changes to which models are offered or how `selectedModel` is chosen.

## Pricing data

Flat $ per record, supplied by the project owner (approximate, tunable later):

| Model ID | Rate ($/record) |
|---|---|
| `gemini-3.1-flash-lite` | 0.0002 |
| `gemini-3.6-flash` | 0.001 |
| `perplexity-sonar` | 0.006 |
| `perplexity-sonar-pro` | 0.020 |

## Architecture

Pure frontend, presentational change. Two files touched:

1. **New file: `src/utils/modelPricing.ts`**
   - Exports `MODEL_PRICING: Record<string, number>` — the single source of truth for per-record rates (table above).
   - Exports `formatCost(amount: number): string` — a formatting helper:
     - Amounts `< $0.01` render with 4 decimal places (e.g. `$0.0002`).
     - Amounts `>= $0.01` render with 2 decimal places and thousands separators (e.g. `$1.23`, `$12,000.00`).

2. **Modified: `src/components/BatchControls.tsx`**
   - The `modelOptions` array's `cost` field (currently a hardcoded qualitative string) is replaced by a rate looked up from `MODEL_PRICING` at render time, displayed as `$<rate>/record` on each of the 4 model selector buttons. The `speed` label and "Recommended" badge behavior are unchanged.
   - If a `modelOptions` entry's `id` has no matching key in `MODEL_PRICING`, the rate display falls back to `"Pricing TBD"` rather than `$0.00`, so an unpriced model is never misread as free.
   - A new **estimated cost readout** is added next to the existing `"Est. Runtime: ~Ns"` indicator (same conditional block, same visual treatment), showing two figures:
     - **This batch**: `itemsToProcess × MODEL_PRICING[selectedModel]`, where `itemsToProcess = Math.min(batchSize, totalPending)` (already computed in the component).
     - **Full queue**: `totalPending × MODEL_PRICING[selectedModel]` — cost to clear everything currently pending, using the `totalPending` prop already passed into this component.
   - Both figures update live as `selectedModel`, `batchSize`, or `totalPending` change — no new props required.
   - When `useCache` is `true`, a short caption (reusing the existing `<Shield>` sub-text row pattern already in the component) reads: *"Excludes Smart Cache hits, which are free"* — since cache hit rate can't be predicted before running, the estimate is not adjusted for it, only annotated.

No new component props beyond what already exists (`selectedModel`, `batchSize`, `totalPending`, `useCache` are all already passed into `BatchControls`).

## Data flow

No new data flow. All inputs (`selectedModel`, `batchSize`, `totalPending`, `useCache`) are existing props already flowing from `App.tsx` into `BatchControls`. The cost figures are derived values computed inline during render, identical in nature to the existing `estimatedSeconds` calculation already in the component.

## Error handling

The only failure mode is a `modelOptions` entry without a matching `MODEL_PRICING` key (e.g. a model added later without updating pricing). Handled by the explicit `"Pricing TBD"` fallback described above — no exceptions thrown, no silent `$0` default.

## Persistence / backward compatibility

None. No new `localStorage` keys, no Firestore schema changes, no changes to `CompanyRecord` or any other persisted type. Purely computed UI state.

## Testing / verification

This project has no automated test suite (`npm run lint` runs `tsc --noEmit` only, per the project's `CLAUDE.md`). Verification plan:

1. `npm run lint` — confirm no type errors.
2. Manual check via `npm run dev`:
   - Cycle through all 4 models and confirm the per-record rate label and both cost figures (this batch / full queue) update correctly.
   - Check formatting at small scale (`batchSize` = 1, low `totalPending`) to confirm 4-decimal rendering, and at large scale (`totalPending` in the thousands) to confirm 2-decimal + thousands-separator rendering.
   - Toggle Smart Cache on/off and confirm the caveat caption appears/disappears accordingly.
   - Confirm behavior when `totalPending` is 0 (Run button already disabled in this state; cost readout should not render, matching the existing runtime-estimate conditional).

## Open items for future sub-projects (explicitly out of scope here)

- Batch execution architecture (queuing, concurrency beyond the existing unused `/api/enrich-batch` endpoint, background/resumable jobs surviving tab closure).
- Persisted running spend tracker across real API calls (Approach C, considered and deferred).
- Waterfall enrichment (secondary API layering — Dropcontact/Prospeo/Hunter).
- Outreach/UX tooling (cold email generation, CRM export, lead scoring).
