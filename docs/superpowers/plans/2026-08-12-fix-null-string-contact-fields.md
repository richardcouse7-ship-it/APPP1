# Fix Literal "null" String Rendering in Contact Fields Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the "Enriched Master Data Table" from displaying the literal text `null` in the Decision Maker Name and Contact Email columns, by normalizing AI-provider responses at the earliest point in the enrichment pipeline and adding a matching frontend render guard as defense in depth.

**Architecture:** The AI enrichment prompt in `server.ts` presents `decision_maker_name` and `contact_email` as quoted string placeholders (`"<..._OR_NULL>"`) in its JSON schema example. Some model responses echo this pattern back as the literal JSON string `"null"` rather than an unquoted JSON `null`. `enrichBusinessRecord()` currently normalizes these fields with `resultJson?.field || null`, which only catches falsy values (`undefined`, `""`, real `null`) — the non-empty string `"null"` is truthy in JavaScript and passes straight through into the stored record, and from there into `src/App.tsx` state and the `ResultsTable.tsx` render, where a plain truthy check (`record.decisionMakerName ? ... : ...`) treats the string `"null"` as "has a value" and prints it. The fix adds a shared `cleanNullableField()` helper that collapses real `null`/`undefined`/empty-string/whitespace-only and the case-insensitive literal string `"null"` down to one `null` representation, wires it into the two affected `enrichBusinessRecord()` assignments (earliest point in the pipeline, so new enrichments are clean at the source), and reuses the same helper in `ResultsTable.tsx` so records already persisted with the literal `"null"` string (in `localStorage`/Firestore from before this fix) also render correctly without a migration.

**Tech Stack:** TypeScript, Express (`server.ts`), React (`src/components/ResultsTable.tsx`), Vitest (`src/utils/__tests__/normalize.test.ts`).

## Global Constraints

- Verify current HEAD before starting — this plan was written against commit `5a51eb4` on `main` (the spec referenced `0175497`, which does not match any commit in this repo's history; treat `5a51eb4` as authoritative and flag the discrepancy if it matters to the requester).
- Fix at the earliest point in the pipeline (API response normalization in `server.ts`), not just at render time, but also add a frontend guard/fallback as defense in depth.
- Use explicit null/undefined/string-equality checks. Do not use static delays (`setTimeout`, sleeps) and do not use blanket type coercion (e.g. no bare `String(x)` without an explicit null-like check first, no `Boolean(x)` truthy shortcuts on values that could be the string `"null"`).
- Add unit test coverage for: (a) input is JSON `null`, (b) input is the string `"null"`, (c) input is `undefined` (field missing entirely).
- Do not touch unrelated fields or components. Scope is limited to `decisionMakerName` (`decision_maker_name`) and `contactEmail` (`contact_email`) only. Sibling fields with the same latent pattern (`decisionMakerRole`, `industry`, `companySummary`, `phoneNumber`) are explicitly out of scope for this fix, even though they share the same `|| null` pattern — see "Known related gap" note at the end of this plan.
- Confirm with the project's existing test runner (`npm test` → `vitest run`) and type-checker (`npm run lint` → `tsc --noEmit`); this repo does have a Vitest suite under `src/**/__tests__/` despite `CLAUDE.md` describing an older state with none.

---

### Task 1: Add `cleanNullableField` normalization helper

**Files:**
- Modify: `src/utils/normalize.ts`
- Test: `src/utils/__tests__/normalize.test.ts`

**Interfaces:**
- Produces: `cleanNullableField(value: unknown): string | null` — exported from `src/utils/normalize.ts`. Returns `null` for real `null`/`undefined`, for an empty or whitespace-only string, and for the string `"null"` (trimmed, case-insensitive). Otherwise returns the trimmed string unchanged. Consumed by Task 2 (`server.ts`) and Task 3 (`src/components/ResultsTable.tsx`).

- [ ] **Step 1: Write the failing tests**

Open `src/utils/__tests__/normalize.test.ts` and update the import at the top of the file from:

```ts
import { normalizeString, getApexDomain, getDedupKey, stripLegalSuffix } from "../normalize";
```

to:

```ts
import { normalizeString, getApexDomain, getDedupKey, stripLegalSuffix, cleanNullableField } from "../normalize";
```

Then add this new `describe` block anywhere at the top level of the file (e.g. after the closing `});` of the existing `describe("normalizeString", ...)` block):

```ts
describe("cleanNullableField", () => {
  it("returns null when the value is JSON null", () => {
    expect(cleanNullableField(null)).toBeNull();
  });

  it('returns null when the value is the literal string "null"', () => {
    expect(cleanNullableField("null")).toBeNull();
  });

  it('returns null for the literal string "null" regardless of case or surrounding whitespace', () => {
    expect(cleanNullableField("  NuLL  ")).toBeNull();
    expect(cleanNullableField("Null")).toBeNull();
  });

  it("returns null when the field is missing (undefined)", () => {
    expect(cleanNullableField(undefined)).toBeNull();
  });

  it("returns null for an empty or whitespace-only string", () => {
    expect(cleanNullableField("")).toBeNull();
    expect(cleanNullableField("   ")).toBeNull();
  });

  it("returns the trimmed value unchanged when it is a real value", () => {
    expect(cleanNullableField("  John Murphy  ")).toBe("John Murphy");
    expect(cleanNullableField("info@example.ie")).toBe("info@example.ie");
  });

  it("does not treat values merely containing the substring null as null-like", () => {
    expect(cleanNullableField("Nullify Solutions Ltd")).toBe("Nullify Solutions Ltd");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/utils/__tests__/normalize.test.ts`
Expected: FAIL — `cleanNullableField` is not exported from `../normalize` (TypeScript/Vitest will report an import/undefined-function error).

- [ ] **Step 3: Implement the minimal function**

In `src/utils/normalize.ts`, append this function at the end of the file (after `getDedupKey`):

```ts
/**
 * Normalizes an AI-provider-sourced nullable field.
 * Collapses JSON null, undefined, empty/whitespace-only strings, and the
 * literal string "null" (which LLMs sometimes emit for a quoted
 * "<VALUE_OR_NULL>" schema placeholder instead of a real JSON null) down
 * to a single null representation. Any other value is returned trimmed.
 */
export function cleanNullableField(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  if (trimmed === '' || trimmed.toLowerCase() === 'null') return null;
  return trimmed;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/utils/__tests__/normalize.test.ts`
Expected: PASS — all 7 `cleanNullableField` tests plus the pre-existing `normalizeString`/`getApexDomain`/etc. tests in the file pass.

- [ ] **Step 5: Commit**

```bash
git add src/utils/normalize.ts src/utils/__tests__/normalize.test.ts
git commit -m "fix: add cleanNullableField to normalize literal 'null' strings from AI responses"
```

---

### Task 2: Wire normalization into the enrichment API response (earliest point in the pipeline)

**Files:**
- Modify: `server.ts:6` (import), `server.ts:494`, `server.ts:499`

**Interfaces:**
- Consumes: `cleanNullableField(value: unknown): string | null` from Task 1 (`src/utils/normalize.ts`).

**Root cause (for reference):** `server.ts:273` and `server.ts:278` define the AI prompt's JSON schema example with `decision_maker_name` and `contact_email` as quoted placeholders (`"<KEY_EXECUTIVE_FULL_NAME_OR_NULL>"`, `"<PUBLIC_EMAIL_OR_NULL>"`), which some model responses echo back literally as the JSON string `"null"`. `server.ts:494` and `server.ts:499` currently normalize with `resultJson?.decision_maker_name || null` / `resultJson?.contact_email || null` — the `||` operator only replaces falsy values, and the non-empty string `"null"` is truthy, so it passes through unchanged into the stored `enrichedResult` object, which is what `src/App.tsx:556` and `src/App.tsx:727` copy verbatim into React state.

- [ ] **Step 1: Update the import**

In `server.ts`, change line 6 from:

```ts
import { normalizeString, getApexDomain } from "./src/utils/normalize";
```

to:

```ts
import { normalizeString, getApexDomain, cleanNullableField } from "./src/utils/normalize";
```

- [ ] **Step 2: Normalize `decisionMakerName` at its source**

In `server.ts`, change line 494 from:

```ts
    decisionMakerName: resultJson?.decision_maker_name || null,
```

to:

```ts
    decisionMakerName: cleanNullableField(resultJson?.decision_maker_name),
```

- [ ] **Step 3: Normalize `contactEmail` at its source**

In `server.ts`, change line 499 from:

```ts
    contactEmail: resultJson?.contact_email || null,
```

to:

```ts
    contactEmail: cleanNullableField(resultJson?.contact_email),
```

- [ ] **Step 4: Type-check**

Run: `npm run lint`
Expected: No new TypeScript errors. `cleanNullableField` returns `string | null`, matching the existing inferred type of the `decisionMakerName`/`contactEmail` fields on `enrichedResult` (both were already `string | null` from the `|| null` pattern), so no downstream type changes are needed.

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: All existing suites plus the Task 1 `cleanNullableField` tests pass (no regressions — this change only affects two field assignments inside `enrichBusinessRecord()`, which has no direct unit tests in this repo, so no existing test exercises this code path).

- [ ] **Step 6: Commit**

```bash
git add server.ts
git commit -m "fix: normalize literal 'null' strings for decisionMakerName/contactEmail at enrichment source"
```

---

### Task 3: Add frontend render guard in the Enriched Master Data Table (defense in depth)

**Files:**
- Modify: `src/components/ResultsTable.tsx:8` (import), `src/components/ResultsTable.tsx:349` (local consts), `src/components/ResultsTable.tsx:441-460` (Decision Maker cell), `src/components/ResultsTable.tsx:504-523` (Verified Contact Info cell)

**Interfaces:**
- Consumes: `cleanNullableField(value: unknown): string | null` from Task 1 (`src/utils/normalize.ts`).

**Why this is still needed after Task 2:** Task 2 only cleans *new* enrichment responses. Records enriched before this fix shipped may already have the literal string `"null"` persisted in `localStorage` (`irish_b2b_website_finder_*` keys) or Firestore (`users/{uid}/companies`), and `src/App.tsx`'s Firestore merge (`mergeRecordsList`) does not re-run server-side normalization on load. Without a render-time guard, those existing bad records would keep showing `null` in the table indefinitely.

**Design note:** Rather than introducing a new literal `"Not found"` label, this guard makes the existing truthy checks operate on the *cleaned* value, so a record whose `decisionMakerName`/`contactEmail` is null-like now correctly falls through to the fallback branches the table already has for "no data": `"Not listed"` / `"—"` in the Decision Maker cell, and `"No public contact"` / `"—"` in the Verified Contact Info cell (`record.phoneNumber` is untouched — only `contactEmail` is in scope). This keeps the UI's existing vocabulary consistent instead of adding a third, overlapping "no value" label.

- [ ] **Step 1: Add the import**

In `src/components/ResultsTable.tsx`, change line 8 from:

```tsx
import { CompanyRecord, FilterState, MatchType } from '../types';
```

to:

```tsx
import { CompanyRecord, FilterState, MatchType } from '../types';
import { cleanNullableField } from '../utils/normalize';
```

- [ ] **Step 2: Compute cleaned values per row**

In `src/components/ResultsTable.tsx`, inside the `filteredRecords.map((record) => { ... })` callback, find these existing lines (currently at lines 339-349):

```tsx
              filteredRecords.map((record) => {
                const isSelected = selectedIds.has(record.id);
                const isDuplicate = duplicateAnalysis.duplicateRecordIds.has(record.id);
                const statusDotClass =
                  record.match_type === 'OFFICIAL_WEBSITE'
                    ? 'bg-gold shadow-[0_0_6px_var(--color-gold)]'
                    : record.match_type === 'FACEBOOK_FALLBACK'
                      ? 'bg-ember shadow-[0_0_6px_var(--color-ember)]'
                      : record.status === 'PROCESSING'
                        ? 'bg-gold animate-pulse'
                        : 'bg-smoke';
```

and add two new lines immediately after the `statusDotClass` declaration (before the `return (`):

```tsx
              filteredRecords.map((record) => {
                const isSelected = selectedIds.has(record.id);
                const isDuplicate = duplicateAnalysis.duplicateRecordIds.has(record.id);
                const statusDotClass =
                  record.match_type === 'OFFICIAL_WEBSITE'
                    ? 'bg-gold shadow-[0_0_6px_var(--color-gold)]'
                    : record.match_type === 'FACEBOOK_FALLBACK'
                      ? 'bg-ember shadow-[0_0_6px_var(--color-ember)]'
                      : record.status === 'PROCESSING'
                        ? 'bg-gold animate-pulse'
                        : 'bg-smoke';
                const decisionMakerName = cleanNullableField(record.decisionMakerName);
                const contactEmail = cleanNullableField(record.contactEmail);
```

- [ ] **Step 3: Use the cleaned value in the Decision Maker cell**

In `src/components/ResultsTable.tsx`, change (currently lines 441-460):

```tsx
                    {/* Key Decision Maker */}
                    <td className="py-3 px-3">
                      {record.decisionMakerName ? (
                        <div className="space-y-0.5 max-w-[170px]">
                          <div className="flex items-center text-ash font-bold text-xs gap-1 truncate">
                            <UserCheck className="w-3.5 h-3.5 text-gold shrink-0" />
                            <span className="truncate">{record.decisionMakerName}</span>
                          </div>
                          {record.decisionMakerRole && (
                            <div className="text-[10px] font-semibold text-smoke truncate pl-4">
                              {record.decisionMakerRole}
                            </div>
                          )}
                        </div>
                      ) : record.status === 'SUCCESS' ? (
                        <span className="text-smoke text-[11px] italic">Not listed</span>
                      ) : (
                        <span className="text-char-light text-[11px]">&mdash;</span>
                      )}
                    </td>
```

to:

```tsx
                    {/* Key Decision Maker */}
                    <td className="py-3 px-3">
                      {decisionMakerName ? (
                        <div className="space-y-0.5 max-w-[170px]">
                          <div className="flex items-center text-ash font-bold text-xs gap-1 truncate">
                            <UserCheck className="w-3.5 h-3.5 text-gold shrink-0" />
                            <span className="truncate">{decisionMakerName}</span>
                          </div>
                          {record.decisionMakerRole && (
                            <div className="text-[10px] font-semibold text-smoke truncate pl-4">
                              {record.decisionMakerRole}
                            </div>
                          )}
                        </div>
                      ) : record.status === 'SUCCESS' ? (
                        <span className="text-smoke text-[11px] italic">Not listed</span>
                      ) : (
                        <span className="text-char-light text-[11px]">&mdash;</span>
                      )}
                    </td>
```

(`record.decisionMakerRole` is intentionally left untouched — it is out of scope for this fix.)

- [ ] **Step 4: Use the cleaned value in the Verified Contact Info cell**

In `src/components/ResultsTable.tsx`, change (currently lines 504-523):

```tsx
                    {/* Verified Contact Info */}
                    <td className="py-3 px-3">
                      {record.phoneNumber || record.contactEmail ? (
                        <div className="space-y-0.5 text-[11px]">
                          {record.phoneNumber && (
                            <div className="flex items-center text-ash font-mono gap-1">
                              <Phone className="w-3 h-3 text-gold shrink-0" /> {record.phoneNumber}
                            </div>
                          )}
                          {record.contactEmail && (
                            <div className="flex items-center text-smoke font-mono gap-1 truncate max-w-[150px]">
                              <Mail className="w-3 h-3 text-gold shrink-0" /> {record.contactEmail}
                            </div>
                          )}
                        </div>
                      ) : record.status === 'SUCCESS' ? (
                        <span className="text-smoke text-[11px] italic">No public contact</span>
                      ) : (
                        <span className="text-char-light text-[11px]">&mdash;</span>
                      )}
                    </td>
```

to:

```tsx
                    {/* Verified Contact Info */}
                    <td className="py-3 px-3">
                      {record.phoneNumber || contactEmail ? (
                        <div className="space-y-0.5 text-[11px]">
                          {record.phoneNumber && (
                            <div className="flex items-center text-ash font-mono gap-1">
                              <Phone className="w-3 h-3 text-gold shrink-0" /> {record.phoneNumber}
                            </div>
                          )}
                          {contactEmail && (
                            <div className="flex items-center text-smoke font-mono gap-1 truncate max-w-[150px]">
                              <Mail className="w-3 h-3 text-gold shrink-0" /> {contactEmail}
                            </div>
                          )}
                        </div>
                      ) : record.status === 'SUCCESS' ? (
                        <span className="text-smoke text-[11px] italic">No public contact</span>
                      ) : (
                        <span className="text-char-light text-[11px]">&mdash;</span>
                      )}
                    </td>
```

(`record.phoneNumber` is intentionally left untouched — it is out of scope for this fix.)

- [ ] **Step 5: Type-check**

Run: `npm run lint`
Expected: No new TypeScript errors.

- [ ] **Step 6: Manually verify in the browser**

Run: `npm run dev`, then open `http://localhost:3000`.

In the browser DevTools console, seed a record with the literal bad values this fix targets (adjust the localStorage key prefix if your existing records use a different key — check Application → Local Storage for the exact `irish_b2b_website_finder_records` key first):

```js
const key = Object.keys(localStorage).find(k => k.includes('irish_b2b_website_finder') && k.includes('records'));
const records = JSON.parse(localStorage.getItem(key));
records.push({
  id: 'test-null-string-guard',
  companyName: 'Midland Oil Company',
  county: 'Offaly',
  status: 'SUCCESS',
  match_type: 'OFFICIAL_WEBSITE',
  decisionMakerName: 'null',
  decisionMakerRole: null,
  contactEmail: 'null',
  phoneNumber: null,
});
localStorage.setItem(key, JSON.stringify(records));
location.reload();
```

Expected: The "Midland Oil Company" row's Decision Maker column shows "Not listed" (not the text `null`), and its Verified Contact Info column shows "No public contact" (not the text `null`).

Clean up afterward by removing the injected test record from `localStorage` (re-run the same lookup, filter out `id === 'test-null-string-guard'`, and save).

- [ ] **Step 7: Commit**

```bash
git add src/components/ResultsTable.tsx
git commit -m "fix: guard against literal 'null' strings when rendering decision maker/contact email"
```

---

## Known related gap (not in scope for this plan)

`decisionMakerRole` (`server.ts:495`), `industry` (`server.ts:492`), `companySummary` (`server.ts:493`), and `phoneNumber` (`server.ts:498`) all use the same `resultJson?.field || null` pattern and share the identical latent literal-`"null"`-string bug. They were left untouched here per the constraint to scope this fix strictly to the reported contact name/email symptom. A natural follow-up is a second, separate change that wires `cleanNullableField()` into those four fields too (and their corresponding `ResultsTable.tsx` cells), reusing the exact helper built in Task 1 — no new logic required, just additional call sites.

**Additional gap found by the final whole-branch review (post-merge, 2026-08-12):** the literal `"null"` string can also surface at other render/consume sites for the same two in-scope fields (`decisionMakerName`/`contactEmail`), not just the main table. Per human-partner decision, only the highest-severity item (data loss, not cosmetic) was fixed as part of this plan; the rest are follow-up work, all fixable by reusing the existing `cleanNullableField()` helper:

- **Fixed in this plan** (final-review fix, commit `cd5d234`): `src/utils/duplicateUtils.ts` — `scoreRecord()`'s `if (r.contactEmail) score += 10` awarded a legacy `"null"`-string record real-email points, which could cause `deduplicateDataset()` to delete a genuinely-enriched duplicate in favor of the junk one. Now gated through `cleanNullableField()`. `r.phoneNumber` on the adjacent line has the same shape of gap but is out of scope (tracked with the sibling-fields gap above).
- **Deferred, not fixed:** `src/components/CompanyDetailModal.tsx` (lines ~125, 132, 137, 183, 186) — the detail modal opened by clicking a table row still truthy-checks the raw fields, so a legacy record shows `null` one click after the table itself shows "Not listed".
- **Deferred, not fixed:** CSV/Google Sheets export — `src/utils/csvUtils.ts:557,560`, `src/App.tsx:1035`, `src/services/workspaceService.ts:119,126` — export outbound data using `r.decisionMakerName || 'N/A'` / `r.contactEmail || 'N/A'`, which passes the literal `"null"` straight into a CSV or Sheet a salesperson works from.
- **Deferred, not fixed:** `src/components/EditRowModal.tsx` (lines ~64, 204, 249) — the edit form shows `"null"` as the field's value, and saving unchanged re-persists it (`.trim() || null` leaves a truthy `"null"` string as-is).
- **Deferred, not fixed:** `src/hooks/useTableFilters.ts:52` — table search matches the literal string "null", so searching "null" surfaces every affected legacy record.
- **Deferred, not fixed:** `server.ts:670` — `/api/ai-analyze-dataset` feeds `r.decisionMakerName` (raw, unguarded) into its lead-scoring prompt for legacy records.

## Final Verification

- [x] Run `npm run lint` — 0 errors (confirmed across Tasks 1-3 and the final-review fix).
- [x] Run `npm test` — 77/77 passing (72 from Tasks 1-3 + 5 new in the final-review fix's `duplicateUtils.test.ts`).
- [x] Run `npm run build` — clean production build (only pre-existing, unrelated warnings: chunk-size advisory and CJS `import.meta` warnings already documented in this project's `CLAUDE.md`).
- [x] Manual browser verification (controller-performed, since implementer subagents had no browser tool): started `npm run dev`, found a real pre-existing record in the seeded dataset — "THE MIDLAND OIL COMPANY UNLIMITED COMPANY" — that had this exact bug (`decisionMakerName`/`contactEmail` both the literal string `"null"`, confirmed via `localStorage` inspection). Post-fix, the table row renders "Not listed" in Decision Maker and shows only the phone number in Contact Info (no `null` email line) — confirmed via screenshot/zoom.
