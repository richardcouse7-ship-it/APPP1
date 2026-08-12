# Batch Model Cost Estimator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show users a live, per-model $ cost estimate (both for the current batch and for their full pending queue) right in the Batch Controls panel, before they run an enrichment batch.

**Architecture:** A single new constants/helper file (`src/utils/modelPricing.ts`) holds flat $/record rates and a currency formatter; `src/components/BatchControls.tsx` consumes it to replace its existing qualitative per-model cost labels with real numbers and to add a live-computed cost readout next to the existing runtime estimate. Pure frontend, no new props, no persisted state, no server changes.

**Tech Stack:** React 19 + TypeScript (existing project stack). No test framework is installed in this repo — verification is `tsc --noEmit` (the project's `npm run lint`) plus manual checks in the running dev server (`npm run dev`), matching this project's existing (test-suite-free) conventions.

## Global Constraints

- Pricing values (exact, from the approved spec): `gemini-3.1-flash-lite` = 0.0002, `gemini-3.6-flash` = 0.001, `perplexity-sonar` = 0.006, `perplexity-sonar-pro` = 0.020 (all $/record).
- `formatCost` rule: amounts `< 0.01` render with 4 decimal places (e.g. `$0.0002`); amounts `>= 0.01` render with 2 decimal places and thousands separators (e.g. `$1.23`, `$12,000.00`).
- No new component props, no new `localStorage` keys, no Firestore changes, no `server.ts` changes.
- A model ID with no matching `MODEL_PRICING` entry must display `"Pricing TBD"` — never `$0.00`.
- Cost readout only renders when `itemsToProcess > 0` (mirrors the existing `Est. Runtime` conditional) — so it's hidden when `totalPending` is 0, same as today.
- Spec reference: `docs/superpowers/specs/2026-08-10-batch-model-cost-estimator-design.md`.

---

### Task 1: Pricing constants & cost formatter

**Files:**
- Create: `src/utils/modelPricing.ts`

**Interfaces:**
- Produces: `MODEL_PRICING: Record<string, number>` (keyed by model ID, value = $/record)
- Produces: `formatCost(amount: number): string`

- [x] **Step 1: Write the implementation file**

Create `src/utils/modelPricing.ts`:

```ts
export const MODEL_PRICING: Record<string, number> = {
  'gemini-3.1-flash-lite': 0.0002,
  'gemini-3.6-flash': 0.001,
  'perplexity-sonar': 0.006,
  'perplexity-sonar-pro': 0.020,
};

export function formatCost(amount: number): string {
  if (amount < 0.01) {
    return `$${amount.toFixed(4)}`;
  }
  return `$${amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
```

- [x] **Step 2: Write a scratch verification script (not committed)**

Create a temporary file `tmp-verify-pricing.ts` in the project root (`irish-b2b-website-finder/`):

```ts
import { MODEL_PRICING, formatCost } from './src/utils/modelPricing';

const checks: Array<[string, string]> = [
  [formatCost(0.0002), '$0.0002'],
  [formatCost(0.001), '$0.0010'],
  [formatCost(0.05), '$0.05'],
  [formatCost(20), '$20.00'],
  [formatCost(2000), '$2,000.00'],
];

let failed = false;
for (const [actual, expected] of checks) {
  if (actual !== expected) {
    failed = true;
    console.log(`FAIL: got ${actual}, expected ${expected}`);
  } else {
    console.log(`PASS: ${actual}`);
  }
}

console.log('gemini-3.6-flash rate:', MODEL_PRICING['gemini-3.6-flash']);
if (failed) process.exit(1);
```

- [x] **Step 3: Run the scratch script**

Run (from `irish-b2b-website-finder/`): `npx tsx tmp-verify-pricing.ts`

Expected output (all PASS, exit code 0):
```
PASS: $0.0002
PASS: $0.0010
PASS: $0.05
PASS: $20.00
PASS: $2,000.00
gemini-3.6-flash rate: 0.001
```

If any line reads `FAIL`, fix `formatCost` in `src/utils/modelPricing.ts` and re-run before continuing.

- [x] **Step 4: Delete the scratch script**

Run: `rm tmp-verify-pricing.ts` (this file must never be committed — it's a throwaway check, not part of the feature)

- [x] **Step 5: Type-check**

Run: `npm run lint`
Expected: exits with no errors.

- [x] **Step 6: Commit**

```bash
git add src/utils/modelPricing.ts
git commit -m "feat: add per-record model pricing constants and cost formatter"
```

---

### Task 2: Wire pricing into Batch Controls UI

**Files:**
- Modify: `src/components/BatchControls.tsx`

**Interfaces:**
- Consumes: `MODEL_PRICING: Record<string, number>`, `formatCost(amount: number): string` from `../utils/modelPricing` (Task 1)
- Consumes existing props already on this component: `selectedModel: string`, `batchSize: number`, `totalPending: number`, `useCache: boolean`

- [x] **Step 1: Add the import**

In `src/components/BatchControls.tsx`, add a new import line after the existing `lucide-react` import (currently line 2):

```ts
import { Play, Pause, RefreshCw, Sliders, CheckCircle, Shield, Layers, Clock, Zap, Save, Cpu, Database, Sparkles, DollarSign } from 'lucide-react';
import { MODEL_PRICING, formatCost } from '../utils/modelPricing';
```

(This replaces the existing `lucide-react` import line — it's the same import with `DollarSign` added, plus the new pricing import on its own line directly after.)

- [x] **Step 2: Replace the qualitative `cost` field with a `recommended` flag**

Find this block (currently lines 50-55):

```ts
  const modelOptions = [
    { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash', speed: 'Ultra Fast', cost: 'Low Cost (Recommended)' },
    { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash-Lite', speed: 'Fastest', cost: 'Maximum Economy' },
    { id: 'perplexity-sonar', label: 'Perplexity Sonar', speed: 'Live Web Search', cost: 'Perplexity Search' },
    { id: 'perplexity-sonar-pro', label: 'Perplexity Sonar Pro', speed: 'Deep Web Citation', cost: 'Advanced Perplexity' },
  ];
```

Replace it with:

```ts
  const modelOptions = [
    { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash', speed: 'Ultra Fast', recommended: true },
    { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash-Lite', speed: 'Fastest', recommended: false },
    { id: 'perplexity-sonar', label: 'Perplexity Sonar', speed: 'Live Web Search', recommended: false },
    { id: 'perplexity-sonar-pro', label: 'Perplexity Sonar Pro', speed: 'Deep Web Citation', recommended: false },
  ];
```

- [x] **Step 3: Compute live cost estimates alongside the existing runtime estimate**

Find this block (currently lines 57-58):

```ts
  const itemsToProcess = Math.min(batchSize, totalPending);
  const estimatedSeconds = Math.ceil(itemsToProcess * requestDelay);
```

Replace it with:

```ts
  const itemsToProcess = Math.min(batchSize, totalPending);
  const estimatedSeconds = Math.ceil(itemsToProcess * requestDelay);

  const selectedModelRate = MODEL_PRICING[selectedModel];
  const hasPricing = typeof selectedModelRate === 'number';
  const estimatedBatchCost = hasPricing ? itemsToProcess * selectedModelRate : null;
  const estimatedQueueCost = hasPricing ? totalPending * selectedModelRate : null;
```

- [x] **Step 4: Replace the per-model cost text on each selector button**

Find this block (currently lines 133-140, inside the `modelOptions.map` render):

```tsx
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold">{opt.label}</span>
                      {isActive && <Sparkles className="w-3.5 h-3.5 text-amber-400" />}
                    </div>
                    <div className={`text-[10px] mt-0.5 ${isActive ? 'text-emerald-200' : 'text-slate-500'}`}>
                      {opt.speed} • {opt.cost}
                    </div>
```

Replace it with:

```tsx
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold">{opt.label}</span>
                      {isActive && <Sparkles className="w-3.5 h-3.5 text-amber-400" />}
                    </div>
                    <div className={`text-[10px] mt-0.5 ${isActive ? 'text-emerald-200' : 'text-slate-500'}`}>
                      {opt.speed} •{' '}
                      {typeof MODEL_PRICING[opt.id] === 'number'
                        ? `${formatCost(MODEL_PRICING[opt.id])}/record${opt.recommended ? ' (Recommended)' : ''}`
                        : 'Pricing TBD'}
                    </div>
```

- [x] **Step 5: Add the cost readout next to the runtime estimate**

Find this block (currently lines 201-207):

```tsx
              {/* Est Batch Time Indicator */}
              {itemsToProcess > 0 && (
                <span className="text-[11px] font-semibold text-slate-500 bg-slate-50 px-2 py-0.5 rounded border border-slate-200 flex items-center gap-1">
                  <Zap className="w-3 h-3 text-amber-500" />
                  Est. Runtime: ~{estimatedSeconds}s ({Math.round(60 / requestDelay)} req/min)
                </span>
              )}
```

Replace it with:

```tsx
              {/* Est Batch Time Indicator */}
              {itemsToProcess > 0 && (
                <span className="text-[11px] font-semibold text-slate-500 bg-slate-50 px-2 py-0.5 rounded border border-slate-200 flex items-center gap-1">
                  <Zap className="w-3 h-3 text-amber-500" />
                  Est. Runtime: ~{estimatedSeconds}s ({Math.round(60 / requestDelay)} req/min)
                </span>
              )}

              {/* Est Cost Indicator */}
              {itemsToProcess > 0 && estimatedBatchCost !== null && estimatedQueueCost !== null && (
                <span
                  className="text-[11px] font-semibold text-slate-500 bg-slate-50 px-2 py-0.5 rounded border border-slate-200 flex items-center gap-1"
                  title={`Full queue: ${totalPending} records at ${formatCost(selectedModelRate as number)}/record`}
                >
                  <DollarSign className="w-3 h-3 text-emerald-600" />
                  Est. Cost: {formatCost(estimatedBatchCost)} this batch · {formatCost(estimatedQueueCost)} full queue
                </span>
              )}
```

- [x] **Step 6: Add the Smart Cache cost caveat**

Find this block (currently lines 210-233, the delay presets grid — insert immediately after its closing `</div>`, still inside the "Row 3" container div that closes after it):

```tsx
            {/* Delay presets toggle pills */}
            <div className="grid grid-cols-5 gap-1.5">
              {delayPresets.map((preset) => {
                const isActive = requestDelay === preset.value;
                return (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => onRequestDelayChange(preset.value)}
                    disabled={isRunning}
                    className={`px-2 py-1.5 rounded-lg border text-center transition-all cursor-pointer ${
                      isActive
                        ? 'bg-emerald-600 text-white border-emerald-600 font-bold shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="text-xs font-bold">{preset.label}</div>
                    <div className={`text-[9px] ${isActive ? 'text-emerald-100' : 'text-slate-400'}`}>
                      {preset.tag}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
```

Replace it with (adds a conditional caveat line right before the closing `</div>` of Row 3):

```tsx
            {/* Delay presets toggle pills */}
            <div className="grid grid-cols-5 gap-1.5">
              {delayPresets.map((preset) => {
                const isActive = requestDelay === preset.value;
                return (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => onRequestDelayChange(preset.value)}
                    disabled={isRunning}
                    className={`px-2 py-1.5 rounded-lg border text-center transition-all cursor-pointer ${
                      isActive
                        ? 'bg-emerald-600 text-white border-emerald-600 font-bold shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="text-xs font-bold">{preset.label}</div>
                    <div className={`text-[9px] ${isActive ? 'text-emerald-100' : 'text-slate-400'}`}>
                      {preset.tag}
                    </div>
                  </button>
                );
              })}
            </div>

            {useCache && itemsToProcess > 0 && estimatedBatchCost !== null && (
              <div className="text-[10px] text-slate-400 flex items-center gap-1 pt-1">
                <Shield className="w-3 h-3 text-emerald-500 shrink-0" />
                <span>Excludes Smart Cache hits, which are free</span>
              </div>
            )}
          </div>
        </div>
```

- [x] **Step 7: Type-check**

Run: `npm run lint`
Expected: exits with no errors. (If `DollarSign` is not a valid export from the installed `lucide-react` version, this step will fail with a type error naming it — in that case substitute `Coins` or `BadgeDollarSign`, both of which are also standard `lucide-react` icons, in place of `DollarSign` in both the import and the JSX usage from Step 5.)

- [x] **Step 8: Manual verification in the dev server**

Run: `npm run dev`, then open `http://localhost:3000`.

Check, for the Tier 2 Final Enriched Data Table view (Batch Controls panel is visible whenever there's at least one record — the sample dataset loads by default):

1. Each of the 4 model buttons shows a real `$.../record` figure (not the old "Low Cost"/"Maximum Economy" text). `gemini-3.6-flash` shows `(Recommended)` suffix; the other three don't.
2. Clicking between models updates the `Est. Cost:` badge next to `Est. Runtime:` immediately.
3. Dragging the batch size slider to 1 shows small "this batch" numbers; setting it near the total record count and confirming "this batch" and "full queue" converge when `batchSize >= totalPending`.
4. With Smart Cache toggled ON, the "Excludes Smart Cache hits, which are free" line appears under the delay preset pills; toggling it OFF hides that line.
5. If all records are already processed (`totalPending` = 0), the "Run Batch Enrichment" button reads "All Companies Enriched!" and neither the `Est. Runtime` nor `Est. Cost` badges render (unchanged from current behavior).

- [x] **Step 9: Commit**

```bash
git add src/components/BatchControls.tsx
git commit -m "feat: show live per-model and per-batch cost estimates in Batch Controls"
```
