# Close Null-String Follow-Up Surfaces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining surfaces where the literal string `"null"` (instead of a real null/empty value) can reach a user or an external system — `CompanyDetailModal`, CSV export, Google Sheets export, `EditRowModal`, table search, and the four sibling enrichment fields (`industry`, `companySummary`, `decisionMakerRole`, `phoneNumber`) that were left unnormalized at the enrichment source in the prior fix.

**Architecture:** A prior PR (`docs/superpowers/plans/2026-08-12-fix-null-string-contact-fields.md`, merged) added `cleanNullableField(value: unknown): string | null` to `src/utils/normalize.ts` and wired it into `server.ts`'s `enrichBusinessRecord()` for `decisionMakerName`/`contactEmail` only, plus a render guard in `ResultsTable.tsx` and a dedup-scoring fix in `duplicateUtils.ts`. Every remaining surface listed above reuses that same helper — no new null-handling logic is introduced anywhere in this plan. Three of the seven touched files (`workspaceService.ts`, `EditRowModal.tsx`, `useTableFilters.ts`) have their affected logic embedded inside a function that isn't independently testable as written (a network call, a form submit handler, a React hook); each of those tasks extracts the transform into a small pure function first, then wires `cleanNullableField` into it and unit-tests the pure function directly — no new test framework or dependency is added. `CompanyDetailModal.tsx` is pure JSX with no extractable transform; that task is verified by inspection, `cleanNullableField`'s own existing unit tests, and a manual browser spot-check (documented in Final Verification), not a new automated test — do not fabricate one.

**Tech Stack:** TypeScript, React, Vitest, Papaparse (already a dependency, used to round-trip-verify CSV output in tests).

## Global Constraints

- Reuse `cleanNullableField()` from `src/utils/normalize.ts` in every task. Do not duplicate or reimplement null-handling logic anywhere in this plan.
- **Preserve each call site's existing fallback tail.** `csvUtils.ts` and `workspaceService.ts` fall back to `'N/A'` on a missing value, not `''` — the fix is `cleanNullableField(r.field) || 'N/A'`, never bare `cleanNullableField(r.field)` (which would silently change exported cells from `'N/A'` to empty/`null`). `App.tsx:1035-1036` falls back to `''` — preserve that tail exactly (`cleanNullableField(r.field) || ''`).
- **"No literal null" tests must be field-level, not substring/`.includes('null')` checks.** A substring check false-positives on a company literally named "Nullify Solutions Ltd" (this exact case was raised and had to be defended against in the prior plan's tests) or on an unrelated notes field containing the word "null". Parse structured output (CSV via Papaparse, Sheets rows as an array) and assert individual field *values* don't equal `'null'` case-insensitively — never scan the whole serialized blob for the substring.
- Do not modify `duplicateUtils.ts` dedup scoring — that was already fixed and merged in the prior PR (commit `cd5d234`). This plan touches every file listed in the Task list below and no others.
- Add unit tests only where the task's brief says to (see the per-surface table below and each task's Files section). Do not add `@testing-library/react`, jsdom, or any new test-runner dependency — this repo's Vitest setup is Node-only and stays that way.

**Per-surface field matrix** (fields differ per surface — do not assume every surface touches every field):

| Surface | decisionMakerName | decisionMakerRole | industry | companySummary | phoneNumber | contactEmail |
|---|---|---|---|---|---|---|
| Task 1 — `server.ts` source normalization | already fixed (prior PR) | **fix** | **fix** | **fix** | **fix** | already fixed (prior PR) |
| Task 2 — CSV export (`csvUtils.ts`) | **fix** | **fix** | not exported | not exported | **fix** | **fix** |
| Task 3 — Sheets export (`workspaceService.ts`) | **fix** | **fix** | **fix** | **fix** | **fix** | **fix** |
| Task 4 — `App.tsx` column-mapping rows | **fix** | **fix** | n/a | n/a | n/a | n/a |
| Task 5 — `EditRowModal.tsx` | **fix** | **fix** | **fix** | not in this form | **fix** | **fix** |
| Task 6 — search (`useTableFilters.ts`) | **fix** | **fix** | not searched today | not searched today | not searched today | not searched today |
| Task 7 — `CompanyDetailModal.tsx` | **fix** | **fix** | **fix** | **fix** | **fix** | **fix** |

**Explicitly deferred, not in this plan** (documented for a future third round, do not reopen scope here): `server.ts:670` (`/api/ai-analyze-dataset` feeds `r.decisionMakerName`/`r.decisionMakerRole` raw into the lead-scoring prompt for legacy records — once Task 1 lands, only pre-existing legacy records can still leak here).

---

### Task 1: Normalize sibling enrichment fields at the source (`server.ts`)

**Files:**
- Modify: `server.ts:492,493,495,498`

**Interfaces:**
- Consumes: `cleanNullableField(value: unknown): string | null` from `src/utils/normalize.ts` (already imported in `server.ts:6`).

**Context:** `enrichBusinessRecord()`'s `enrichedResult` object already normalizes `decisionMakerName` (line 494) and `contactEmail` (line 499) via `cleanNullableField()`. Four sibling fields on the same object still use the old `resultJson?.field || null` pattern, which lets the literal AI-emitted string `"null"` (see the prior plan's root-cause note: the prompt's JSON schema shows these as quoted `"<..._OR_NULL>"` placeholders) pass through unnormalized, because a non-empty string is truthy and `||` only catches falsy values.

- [ ] **Step 1: Normalize `industry`**

In `server.ts`, change line 492 from:

```ts
    industry: resultJson?.industry || null,
```

to:

```ts
    industry: cleanNullableField(resultJson?.industry),
```

- [ ] **Step 2: Normalize `companySummary`**

Change line 493 from:

```ts
    companySummary: resultJson?.company_summary || null,
```

to:

```ts
    companySummary: cleanNullableField(resultJson?.company_summary),
```

- [ ] **Step 3: Normalize `decisionMakerRole`**

Change line 495 from:

```ts
    decisionMakerRole: resultJson?.decision_maker_role || null,
```

to:

```ts
    decisionMakerRole: cleanNullableField(resultJson?.decision_maker_role),
```

- [ ] **Step 4: Normalize `phoneNumber`**

Change line 498 from:

```ts
    phoneNumber: resultJson?.phone_number || null,
```

to:

```ts
    phoneNumber: cleanNullableField(resultJson?.phone_number),
```

- [ ] **Step 5: Type-check and run the full suite**

Run: `npm run lint`
Expected: 0 errors — `cleanNullableField` returns `string | null`, matching each field's existing inferred type.

Run: `npm test`
Expected: all existing suites pass (this repo has no direct unit test for `enrichBusinessRecord()`, so this only checks for regressions elsewhere — same situation as the prior plan's equivalent task).

- [ ] **Step 6: Commit**

```bash
git add server.ts
git commit -m "fix: normalize sibling enrichment fields (industry, companySummary, decisionMakerRole, phoneNumber) at source"
```

---

### Task 2: Fix literal "null" strings in CSV export (`csvUtils.ts`)

**Files:**
- Modify: `src/utils/csvUtils.ts:557-560`
- Test: `src/utils/__tests__/csvUtils.test.ts` (new file)

**Interfaces:**
- Consumes: `cleanNullableField(value: unknown): string | null` from `../normalize` (new import for this file — `csvUtils.ts` does not currently import from `normalize.ts` beyond `getDedupKey`, which is already imported at line 3).

**Context:** `exportRecordsToCSV()` (`src/utils/csvUtils.ts:511-566`) builds each CSV row via a `baseRow` object. Four of its enrichment columns use `r.field || 'N/A'`, which lets a literal `"null"` string (truthy) pass straight into the exported CSV cell instead of falling back to `'N/A'`. This is the file a sales rep opens directly — the highest-value fix in this plan and the only one that's already pure and directly unit-testable with no extraction needed.

- [ ] **Step 1: Write the failing tests**

Create `src/utils/__tests__/csvUtils.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import Papa from "papaparse";
import { exportRecordsToCSV } from "../csvUtils";
import { CompanyRecord } from "../../types";

function makeRecord(overrides: Partial<CompanyRecord>): CompanyRecord {
  return {
    id: "record-1",
    companyNumber: "123456",
    companyName: "Test Company Ltd",
    county: "Dublin",
    status: "SUCCESS",
    official_website_url: "https://example.ie",
    match_type: "OFFICIAL_WEBSITE",
    confidence_score: "HIGH",
    ...overrides,
  };
}

describe("exportRecordsToCSV", () => {
  it("does not export literal 'null' strings for decisionMakerName/decisionMakerRole/phoneNumber/contactEmail", () => {
    const record = makeRecord({
      decisionMakerName: "null",
      decisionMakerRole: "null",
      phoneNumber: "null",
      contactEmail: "null",
    });

    const csv = exportRecordsToCSV([record]);
    const parsed = Papa.parse(csv, { header: true });
    const row = parsed.data[0] as Record<string, string>;

    expect(row.decisionMakerName.toLowerCase()).not.toBe("null");
    expect(row.decisionMakerRole.toLowerCase()).not.toBe("null");
    expect(row.phoneNumber.toLowerCase()).not.toBe("null");
    expect(row.contactEmail.toLowerCase()).not.toBe("null");
  });

  it("falls back to 'N/A' for a literal 'null' string field, matching the existing missing-value fallback", () => {
    const record = makeRecord({ contactEmail: "null" });
    const csv = exportRecordsToCSV([record]);
    const parsed = Papa.parse(csv, { header: true });
    const row = parsed.data[0] as Record<string, string>;

    expect(row.contactEmail).toBe("N/A");
  });

  it("falls back to 'N/A' for a real missing field, unchanged from before this fix", () => {
    const record = makeRecord({ contactEmail: null });
    const csv = exportRecordsToCSV([record]);
    const parsed = Papa.parse(csv, { header: true });
    const row = parsed.data[0] as Record<string, string>;

    expect(row.contactEmail).toBe("N/A");
  });

  it("falls back to 'N/A' for a whitespace-only field", () => {
    const record = makeRecord({ contactEmail: "   " });
    const csv = exportRecordsToCSV([record]);
    const parsed = Papa.parse(csv, { header: true });
    const row = parsed.data[0] as Record<string, string>;

    expect(row.contactEmail).toBe("N/A");
  });

  it("exports a real value unchanged", () => {
    const record = makeRecord({
      decisionMakerName: "John Murphy",
      contactEmail: "info@example.ie",
    });
    const csv = exportRecordsToCSV([record]);
    const parsed = Papa.parse(csv, { header: true });
    const row = parsed.data[0] as Record<string, string>;

    expect(row.decisionMakerName).toBe("John Murphy");
    expect(row.contactEmail).toBe("info@example.ie");
  });

  it("does not treat a company literally named with 'null' as a substring as a null-like value", () => {
    const record = makeRecord({ companyName: "Nullify Solutions Ltd", decisionMakerName: "Null Byrne" });
    const csv = exportRecordsToCSV([record]);
    const parsed = Papa.parse(csv, { header: true });
    const row = parsed.data[0] as Record<string, string>;

    expect(row.company_name).toBe("Nullify Solutions Ltd");
    expect(row.decisionMakerName).toBe("Null Byrne");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/utils/__tests__/csvUtils.test.ts`
Expected: FAIL — the first two tests fail because `row.contactEmail` etc. is currently the literal string `"null"`, not `"N/A"`.

- [ ] **Step 3: Add the import and fix the four field lines**

In `src/utils/csvUtils.ts`, change line 3 from:

```ts
import { getDedupKey } from './normalize';
```

to:

```ts
import { getDedupKey, cleanNullableField } from './normalize';
```

Then change lines 557-560 from:

```ts
    baseRow['decisionMakerName'] = r.decisionMakerName || 'N/A';
    baseRow['decisionMakerRole'] = r.decisionMakerRole || 'N/A';
    baseRow['phoneNumber'] = r.phoneNumber || 'N/A';
    baseRow['contactEmail'] = r.contactEmail || 'N/A';
```

to:

```ts
    baseRow['decisionMakerName'] = cleanNullableField(r.decisionMakerName) || 'N/A';
    baseRow['decisionMakerRole'] = cleanNullableField(r.decisionMakerRole) || 'N/A';
    baseRow['phoneNumber'] = cleanNullableField(r.phoneNumber) || 'N/A';
    baseRow['contactEmail'] = cleanNullableField(r.contactEmail) || 'N/A';
```

(`official_website_url` on line 552 is untouched — it's already validated via `isValidUrl()` upstream in `server.ts` and is out of scope for this plan.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/utils/__tests__/csvUtils.test.ts`
Expected: PASS, all 6 tests.

- [ ] **Step 5: Manually spot-check real CSV output**

Run this one-off script and read its output directly — this is the "manually spot-checked" confirmation the plan's Final Verification will reference:

```bash
node -e "
const { exportRecordsToCSV } = require('./src/utils/csvUtils.ts');
" 2>&1 || true
```

That won't work directly against a `.ts` file — instead, add a temporary `console.log` inside the Step 1 test file's first `it()` block (`console.log(csv)`), run `npm test -- src/utils/__tests__/csvUtils.test.ts` once, read the printed CSV in the terminal output to confirm with your own eyes that no cell contains the literal text `null`, then remove the temporary `console.log` before committing.

- [ ] **Step 6: Run the full suite and lint**

Run: `npm run lint` — expect 0 errors.
Run: `npm test` — expect all suites passing.

- [ ] **Step 7: Commit**

```bash
git add src/utils/csvUtils.ts src/utils/__tests__/csvUtils.test.ts
git commit -m "fix: prevent literal 'null' strings in CSV export, fall back to 'N/A' like a missing value"
```

---

### Task 3: Fix literal "null" strings in Google Sheets export (`workspaceService.ts`)

**Files:**
- Modify: `src/services/workspaceService.ts:92-133`
- Test: `src/services/__tests__/workspaceService.test.ts` (new file)

**Interfaces:**
- Consumes: `cleanNullableField(value: unknown): string | null` from `../utils/normalize` (new import for this file).
- Produces: `buildSheetRows(records: CompanyRecord[]): string[][]`, a new **exported** pure function extracted from inside `exportLeadsToGoogleSheets()`. This is what the test in this task calls directly — do not attempt to test `exportLeadsToGoogleSheets()` itself, it makes real network calls via `authorizedFetch` and needs OAuth to run end-to-end; that remains untested here as before, and this task's Final Verification step is explicit that only `buildSheetRows()`'s output was spot-checked, not a live Sheets round-trip.

**Context:** `exportLeadsToGoogleSheets()` builds its `headers` and `rows` arrays inline (current lines 93-133) before making network calls to create and populate a Google Sheet. Six of the row-builder's cells use `r.field || 'N/A'`, letting literal `"null"` strings land in an external Google Sheet a sales rep works from. The row-building logic isn't independently testable while it stays inline inside the network-calling function, so this task extracts it into its own pure, exported function first.

- [ ] **Step 1: Extract `buildSheetRows()`**

In `src/services/workspaceService.ts`, the function currently reads (starting at line 92):

```ts
  // 2. Prepare Rows Data
  const headers = [
    'CRO Reg #',
    'Business Name',
    'County',
    'Official Website URL',
    'Decision Maker Name',
    'Decision Maker Role',
    'LinkedIn URL',
    'LinkedIn Type',
    'Industry / Sector',
    'Company Overview',
    'Phone',
    'Contact Email',
    'Lead Verification Status',
    'Confidence Score',
    'Match Type',
    'Process Status',
    'Research Notes',
    'Processed At',
  ];

  const rows = records.map((r) => [
    r.companyNumber || '',
    r.companyName || '',
    r.county || '',
    r.official_website_url || 'N/A',
    r.decisionMakerName || 'N/A',
    r.decisionMakerRole || 'N/A',
    r.linkedinUrl || 'N/A',
    r.linkedinType === 'DECISION_MAKER' ? 'Decision Maker Profile' : r.linkedinType === 'COMPANY' ? 'Company LinkedIn Page' : 'Not Found',
    r.industry || 'N/A',
    r.companySummary || 'N/A',
    r.phoneNumber || 'N/A',
    r.contactEmail || 'N/A',
    r.verificationStatus || 'UNPROCESSED',
    r.confidence_score || 'NONE',
    r.match_type || 'UNPROCESSED',
    r.status || 'PENDING',
    r.notes || '',
    r.processedAt ? new Date(r.processedAt).toLocaleString('en-IE') : '',
  ]);

  const valueData = [headers, ...rows];
```

Replace it with a module-level exported constant and function, defined **above** `exportLeadsToGoogleSheets` (so they can also be imported independently by the test file), plus a two-line call site left in `exportLeadsToGoogleSheets`:

Add this above the `export async function exportLeadsToGoogleSheets(` line:

```ts
export const SHEET_HEADERS = [
  'CRO Reg #',
  'Business Name',
  'County',
  'Official Website URL',
  'Decision Maker Name',
  'Decision Maker Role',
  'LinkedIn URL',
  'LinkedIn Type',
  'Industry / Sector',
  'Company Overview',
  'Phone',
  'Contact Email',
  'Lead Verification Status',
  'Confidence Score',
  'Match Type',
  'Process Status',
  'Research Notes',
  'Processed At',
];

/**
 * Builds the Google Sheets row data for an export. Pure and side-effect-free
 * so it can be unit-tested without a live Sheets API call.
 */
export function buildSheetRows(records: CompanyRecord[]): (string)[][] {
  return records.map((r) => [
    r.companyNumber || '',
    r.companyName || '',
    r.county || '',
    r.official_website_url || 'N/A',
    cleanNullableField(r.decisionMakerName) || 'N/A',
    cleanNullableField(r.decisionMakerRole) || 'N/A',
    r.linkedinUrl || 'N/A',
    r.linkedinType === 'DECISION_MAKER' ? 'Decision Maker Profile' : r.linkedinType === 'COMPANY' ? 'Company LinkedIn Page' : 'Not Found',
    cleanNullableField(r.industry) || 'N/A',
    cleanNullableField(r.companySummary) || 'N/A',
    cleanNullableField(r.phoneNumber) || 'N/A',
    cleanNullableField(r.contactEmail) || 'N/A',
    r.verificationStatus || 'UNPROCESSED',
    r.confidence_score || 'NONE',
    r.match_type || 'UNPROCESSED',
    r.status || 'PENDING',
    r.notes || '',
    r.processedAt ? new Date(r.processedAt).toLocaleString('en-IE') : '',
  ]);
}
```

Then replace the original inline block (the `headers`/`rows`/`valueData` lines shown above, inside `exportLeadsToGoogleSheets`) with:

```ts
  // 2. Prepare Rows Data
  const headers = SHEET_HEADERS;
  const rows = buildSheetRows(records);
  const valueData = [headers, ...rows];
```

(`official_website_url`, `linkedinUrl`, `verificationStatus`, `confidence_score`, `match_type`, `status`, `notes`, `processedAt`, `companyNumber`, `companyName`, `county` are untouched — out of scope per the field matrix above.)

- [ ] **Step 2: Add the import**

Change line 1 of `src/services/workspaceService.ts` from:

```ts
import { CompanyRecord } from '../types';
```

to:

```ts
import { CompanyRecord } from '../types';
import { cleanNullableField } from '../utils/normalize';
```

- [ ] **Step 3: Write the failing tests**

Create `src/services/__tests__/workspaceService.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildSheetRows, SHEET_HEADERS } from "../workspaceService";
import { CompanyRecord } from "../../types";

function makeRecord(overrides: Partial<CompanyRecord>): CompanyRecord {
  return {
    id: "record-1",
    companyNumber: "123456",
    companyName: "Test Company Ltd",
    county: "Dublin",
    status: "SUCCESS",
    official_website_url: "https://example.ie",
    match_type: "OFFICIAL_WEBSITE",
    confidence_score: "HIGH",
    ...overrides,
  };
}

// Column indices, derived from SHEET_HEADERS, so this test breaks loudly
// if the header/row column order ever drifts apart instead of silently
// asserting the wrong cell.
const col = (header: string) => {
  const idx = SHEET_HEADERS.indexOf(header);
  if (idx === -1) throw new Error(`Header not found: ${header}`);
  return idx;
};

describe("buildSheetRows", () => {
  it("does not export literal 'null' strings for decisionMakerName/decisionMakerRole/industry/companySummary/phoneNumber/contactEmail", () => {
    const record = makeRecord({
      decisionMakerName: "null",
      decisionMakerRole: "null",
      industry: "null",
      companySummary: "null",
      phoneNumber: "null",
      contactEmail: "null",
    });

    const [row] = buildSheetRows([record]);

    expect(String(row[col('Decision Maker Name')]).toLowerCase()).not.toBe("null");
    expect(String(row[col('Decision Maker Role')]).toLowerCase()).not.toBe("null");
    expect(String(row[col('Industry / Sector')]).toLowerCase()).not.toBe("null");
    expect(String(row[col('Company Overview')]).toLowerCase()).not.toBe("null");
    expect(String(row[col('Phone')]).toLowerCase()).not.toBe("null");
    expect(String(row[col('Contact Email')]).toLowerCase()).not.toBe("null");
  });

  it("falls back to 'N/A' for a literal 'null' string field, matching the existing missing-value fallback", () => {
    const record = makeRecord({ contactEmail: "null" });
    const [row] = buildSheetRows([record]);
    expect(row[col('Contact Email')]).toBe("N/A");
  });

  it("falls back to 'N/A' for a real missing field, unchanged from before this fix", () => {
    const record = makeRecord({ contactEmail: null });
    const [row] = buildSheetRows([record]);
    expect(row[col('Contact Email')]).toBe("N/A");
  });

  it("falls back to 'N/A' for a whitespace-only field", () => {
    const record = makeRecord({ contactEmail: "   " });
    const [row] = buildSheetRows([record]);
    expect(row[col('Contact Email')]).toBe("N/A");
  });

  it("exports a real value unchanged", () => {
    const record = makeRecord({ decisionMakerName: "John Murphy", contactEmail: "info@example.ie" });
    const [row] = buildSheetRows([record]);
    expect(row[col('Decision Maker Name')]).toBe("John Murphy");
    expect(row[col('Contact Email')]).toBe("info@example.ie");
  });

  it("does not treat a value containing 'null' as a substring as null-like", () => {
    const record = makeRecord({ decisionMakerName: "Null Byrne" });
    const [row] = buildSheetRows([record]);
    expect(row[col('Decision Maker Name')]).toBe("Null Byrne");
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail, then implement, then verify they pass**

Run: `npm test -- src/services/__tests__/workspaceService.test.ts`
Expected first run: FAIL (before Steps 1-2 are applied — if you're doing Steps 1-2 before writing tests, reorder so you see red first: comment out the `cleanNullableField(...)` calls in `buildSheetRows` temporarily, confirm red, then restore them and confirm green. Either order is fine as long as you see the test fail against the unfixed `|| 'N/A'` code once before it passes).
Expected after Steps 1-2 are applied: PASS, all 6 tests.

- [ ] **Step 5: Manually spot-check real row output**

This surface cannot be spot-checked via a live Google Sheet without OAuth credentials, so spot-check the pure function's output directly instead — this is the "manually spot-checked" confirmation the plan's Final Verification will reference, and it must be described accurately as checking `buildSheetRows()` output, not a live Sheets round-trip. Temporarily add `console.log(JSON.stringify(row))` inside the first `it()` block in the test file, run `npm test -- src/services/__tests__/workspaceService.test.ts` once, read the printed row array in the terminal to confirm with your own eyes that no cell is the literal string `"null"`, then remove the temporary `console.log` before committing.

- [ ] **Step 6: Run the full suite and lint**

Run: `npm run lint` — expect 0 errors.
Run: `npm test` — expect all suites passing.

- [ ] **Step 7: Commit**

```bash
git add src/services/workspaceService.ts src/services/__tests__/workspaceService.test.ts
git commit -m "fix: extract buildSheetRows and prevent literal 'null' strings in Google Sheets export"
```

---

### Task 4: Fix literal "null" strings in the column-mapping modal rows (`App.tsx`)

**Files:**
- Modify: `src/App.tsx:1035-1036`, plus import addition near line 17

**Interfaces:**
- Consumes: `cleanNullableField(value: unknown): string | null` from `./utils/normalize` (new import for this file).

**Context:** The `ColumnMappingModal` invocation in `App.tsx` (around line 1026-1042) feeds `rows={records.map((r) => ({ 'Decision Maker Name': r.decisionMakerName || '', 'Decision Maker Role': r.decisionMakerRole || '', ... }))}` — this is display data for the re-labeling modal's grid, not a file export, but it's still user-visible text and was documented as a follow-up gap in the prior plan. No new test is added for this task — `App.tsx` has no existing unit test coverage and this repo has no component-test framework (per this plan's Global Constraints); this is a 2-line, inspection-verified fix.

- [ ] **Step 1: Add the import**

In `src/App.tsx`, change line 17 from:

```tsx
import { analyzeDuplicates, deduplicateDataset } from './utils/duplicateUtils';
```

to:

```tsx
import { analyzeDuplicates, deduplicateDataset } from './utils/duplicateUtils';
import { cleanNullableField } from './utils/normalize';
```

- [ ] **Step 2: Fix the two field lines**

Change lines 1035-1036 from:

```tsx
          'Decision Maker Name': r.decisionMakerName || '',
          'Decision Maker Role': r.decisionMakerRole || '',
```

to:

```tsx
          'Decision Maker Name': cleanNullableField(r.decisionMakerName) || '',
          'Decision Maker Role': cleanNullableField(r.decisionMakerRole) || '',
```

- [ ] **Step 3: Type-check**

Run: `npm run lint` — expect 0 errors.

- [ ] **Step 4: Run the full suite**

Run: `npm test` — expect all suites passing (this change has no dedicated test; this confirms no regression elsewhere).

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "fix: prevent literal 'null' strings in column-mapping modal rows"
```

---

### Task 5: Fix literal "null" strings surviving edits in `EditRowModal.tsx`

**Files:**
- Modify: `src/components/EditRowModal.tsx:1-79`
- Test: `src/components/__tests__/EditRowModal.test.ts` (new file)

**Interfaces:**
- Consumes: `cleanNullableField(value: unknown): string | null` from `../utils/normalize` (new import for this file).
- Produces: `normalizeEditedRecord(record: CompanyRecord, formData: Partial<CompanyRecord>): CompanyRecord`, a new **exported** pure function extracted from inside `handleSubmit`. This is what the test in this task calls directly.

**Context — the real defect, precisely:** Manually clearing a field in this form already works correctly today: an empty input produces `formData.field === ''`, and `''.trim() || null` correctly falls back to real `null`. The actual bug is that **editing any *other* field and clicking Save silently re-persists an untouched field's literal `"null"` string**, because `"null".trim()` is still the truthy string `"null"` — `.trim()` only strips whitespace, it does not recognize the word "null". A record loaded from a legacy `"null"`-poisoned field keeps that literal string forever unless the user happens to specifically retype that one field. `normalizeEditedRecord()` fixes this by using `cleanNullableField()` (which already trims *and* recognizes the literal string `"null"`) in place of the old `?.trim() || null` pattern — this is a drop-in replacement, not new logic. The form is also updated to normalize on load, so a legacy `"null"` value doesn't visibly appear as text in the input field in the first place (that part is inspection-only, no test needed — the extracted function is what's tested).

- [ ] **Step 1: Write the failing tests**

Create `src/components/__tests__/EditRowModal.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { normalizeEditedRecord } from "../EditRowModal";
import { CompanyRecord } from "../../types";

function makeRecord(overrides: Partial<CompanyRecord>): CompanyRecord {
  return {
    id: "record-1",
    companyNumber: "123456",
    companyName: "Test Company Ltd",
    county: "Dublin",
    status: "PENDING",
    official_website_url: null,
    match_type: "UNPROCESSED",
    confidence_score: "NONE",
    ...overrides,
  };
}

describe("normalizeEditedRecord", () => {
  it("cleans a literal 'null' string left untouched in formData when the user edited a different field", () => {
    // Simulates: record loaded with legacy contactEmail: "null", user only
    // edited companyName and clicked Save without touching contactEmail.
    const record = makeRecord({ contactEmail: "null", companyName: "Old Name" });
    const formData: Partial<CompanyRecord> = {
      ...record,
      companyName: "New Name", // the only field the user actually changed
      contactEmail: "null", // untouched — still the raw legacy value
    };

    const updated = normalizeEditedRecord(record, formData);

    expect(updated.contactEmail).toBeNull();
    expect(updated.companyName).toBe("New Name");
  });

  it("keeps a manually cleared field as null (already-working behavior, locked in by this test)", () => {
    const record = makeRecord({ contactEmail: "real@example.ie" });
    const formData: Partial<CompanyRecord> = { ...record, contactEmail: "" };

    const updated = normalizeEditedRecord(record, formData);

    expect(updated.contactEmail).toBeNull();
  });

  it("passes through a real value unchanged", () => {
    const record = makeRecord({});
    const formData: Partial<CompanyRecord> = {
      ...record,
      decisionMakerName: "  John Murphy  ",
      contactEmail: "info@example.ie",
    };

    const updated = normalizeEditedRecord(record, formData);

    expect(updated.decisionMakerName).toBe("John Murphy");
    expect(updated.contactEmail).toBe("info@example.ie");
  });

  it("cleans decisionMakerRole, phoneNumber, and industry the same way", () => {
    const record = makeRecord({});
    const formData: Partial<CompanyRecord> = {
      ...record,
      decisionMakerRole: "null",
      phoneNumber: "null",
      industry: "null",
    };

    const updated = normalizeEditedRecord(record, formData);

    expect(updated.decisionMakerRole).toBeNull();
    expect(updated.phoneNumber).toBeNull();
    expect(updated.industry).toBeNull();
  });

  it("requires a non-empty companyName and trims it", () => {
    const record = makeRecord({});
    const formData: Partial<CompanyRecord> = { ...record, companyName: "  Trimmed Co  " };

    const updated = normalizeEditedRecord(record, formData);

    expect(updated.companyName).toBe("Trimmed Co");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/components/__tests__/EditRowModal.test.ts`
Expected: FAIL — `normalizeEditedRecord` is not exported from `../EditRowModal` yet.

- [ ] **Step 3: Extract and fix `normalizeEditedRecord`**

In `src/components/EditRowModal.tsx`, change the import at line 3 from:

```tsx
import { CompanyRecord } from '../types';
```

to:

```tsx
import { CompanyRecord } from '../types';
import { cleanNullableField } from '../utils/normalize';
```

Then replace `handleSubmit` (currently lines 48-79):

```tsx
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.companyName?.trim()) {
      alert('Company Name cannot be empty.');
      return;
    }

    const isFb = formData.official_website_url?.toLowerCase().includes('facebook.com');

    const updated: CompanyRecord = {
      ...record,
      ...formData,
      companyName: formData.companyName.trim(),
      companyNumber: (formData.companyNumber || '').trim(),
      county: (formData.county || 'Ireland').trim(),
      official_website_url: formData.official_website_url?.trim() || null,
      decisionMakerName: formData.decisionMakerName?.trim() || null,
      decisionMakerRole: formData.decisionMakerRole?.trim() || null,
      phoneNumber: formData.phoneNumber?.trim() || null,
      contactEmail: formData.contactEmail?.trim() || null,
      industry: formData.industry?.trim() || null,
      isManualEdit: true,
      status: formData.official_website_url ? 'SUCCESS' : record.status,
      match_type: formData.official_website_url
        ? (isFb ? 'FACEBOOK_FALLBACK' : 'OFFICIAL_WEBSITE')
        : record.match_type,
      confidence_score: formData.official_website_url ? 'HIGH' : record.confidence_score,
    };

    onSave(updated);
    onClose();
  };
```

with:

```tsx
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.companyName?.trim()) {
      alert('Company Name cannot be empty.');
      return;
    }

    onSave(normalizeEditedRecord(record, formData));
    onClose();
  };
```

Then add the extracted, exported pure function **above** the `EditRowModal` component definition (i.e. above the `export const EditRowModal: React.FC<EditRowModalProps> = ({` line):

```tsx
/**
 * Merges a record with its edited form data into a normalized CompanyRecord,
 * ready to save. Pure and side-effect-free so it can be unit-tested directly.
 * Uses cleanNullableField (not a bare `.trim() || null`) so that a field the
 * user left untouched — which may still carry a legacy literal "null" string
 * from before the enrichment-side fix — gets cleaned on every save, not only
 * when the user happens to retype that specific field.
 */
export function normalizeEditedRecord(
  record: CompanyRecord,
  formData: Partial<CompanyRecord>
): CompanyRecord {
  const isFb = formData.official_website_url?.toLowerCase().includes('facebook.com');

  return {
    ...record,
    ...formData,
    companyName: (formData.companyName || '').trim(),
    companyNumber: (formData.companyNumber || '').trim(),
    county: (formData.county || 'Ireland').trim(),
    official_website_url: formData.official_website_url?.trim() || null,
    decisionMakerName: cleanNullableField(formData.decisionMakerName),
    decisionMakerRole: cleanNullableField(formData.decisionMakerRole),
    phoneNumber: cleanNullableField(formData.phoneNumber),
    contactEmail: cleanNullableField(formData.contactEmail),
    industry: cleanNullableField(formData.industry),
    isManualEdit: true,
    status: formData.official_website_url ? 'SUCCESS' : record.status,
    match_type: formData.official_website_url
      ? (isFb ? 'FACEBOOK_FALLBACK' : 'OFFICIAL_WEBSITE')
      : record.match_type,
    confidence_score: formData.official_website_url ? 'HIGH' : record.confidence_score,
  };
}
```

(`official_website_url` keeps its original `?.trim() || null` — it is out of scope for this plan, already guarded elsewhere by `isValidUrl()`.)

- [ ] **Step 4: Normalize on load too (defense in depth, inspection-only — no test)**

In the same file, change the `useEffect` (currently lines 20-24) from:

```tsx
  useEffect(() => {
    if (record) {
      setFormData({ ...record });
    }
  }, [record]);
```

to:

```tsx
  useEffect(() => {
    if (record) {
      setFormData({
        ...record,
        decisionMakerName: cleanNullableField(record.decisionMakerName),
        decisionMakerRole: cleanNullableField(record.decisionMakerRole),
        phoneNumber: cleanNullableField(record.phoneNumber),
        contactEmail: cleanNullableField(record.contactEmail),
        industry: cleanNullableField(record.industry),
      });
    }
  }, [record]);
```

This means a legacy `"null"`-poisoned field now shows as an empty input when the modal opens, instead of the visible text `null` — matching how the table itself already behaves after the prior fix.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- src/components/__tests__/EditRowModal.test.ts`
Expected: PASS, all 5 tests.

- [ ] **Step 6: Run the full suite and lint**

Run: `npm run lint` — expect 0 errors.
Run: `npm test` — expect all suites passing.

- [ ] **Step 7: Commit**

```bash
git add src/components/EditRowModal.tsx src/components/__tests__/EditRowModal.test.ts
git commit -m "fix: extract normalizeEditedRecord, stop re-persisting literal 'null' strings on save"
```

---

### Task 6: Fix table search matching the literal "null" string (`useTableFilters.ts`)

**Files:**
- Modify: `src/hooks/useTableFilters.ts:40-65`
- Test: `src/hooks/__tests__/useTableFilters.test.ts` (new file)

**Interfaces:**
- Consumes: `cleanNullableField(value: unknown): string | null` from `../utils/normalize` (new import for this file).
- Produces: `recordMatchesSearch(r: CompanyRecord, term: string): boolean`, a new **exported** pure function extracted from inside the `filteredRecords` `useMemo`. This is what the test in this task calls directly — the hook itself (`useTableFilters`) stays untested, as it was before this task (no React-hook test harness in this repo per this plan's Global Constraints).

**Context:** `filteredRecords`'s search-term matching (current lines 45-56) checks `r.decisionMakerName?.toLowerCase().includes(term)` and `r.decisionMakerRole?.toLowerCase().includes(term)` directly against the raw field. A legacy record with the literal string `"null"` for either field will match a search for "null" and surface in results — cosmetically confusing, and it means "null" is effectively an unintentional way to list every unfixed legacy record. Every other search field (`companyName`, `companyNumber`, `official_website_url`, `notes`, `linkedinUrl`) is untouched — they were not part of this bug family and are out of scope.

- [ ] **Step 1: Write the failing tests**

Create `src/hooks/__tests__/useTableFilters.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { recordMatchesSearch } from "../useTableFilters";
import { CompanyRecord } from "../../types";

function makeRecord(overrides: Partial<CompanyRecord>): CompanyRecord {
  return {
    id: "record-1",
    companyNumber: "123456",
    companyName: "Test Company Ltd",
    county: "Dublin",
    status: "SUCCESS",
    official_website_url: "https://example.ie",
    match_type: "OFFICIAL_WEBSITE",
    confidence_score: "HIGH",
    ...overrides,
  };
}

describe("recordMatchesSearch", () => {
  it("does not match a search for 'null' against a record whose decisionMakerName is the literal string 'null'", () => {
    const record = makeRecord({ decisionMakerName: "null" });
    expect(recordMatchesSearch(record, "null")).toBe(false);
  });

  it("does not match a search for 'null' against a record whose decisionMakerRole is the literal string 'null'", () => {
    const record = makeRecord({ decisionMakerRole: "null" });
    expect(recordMatchesSearch(record, "null")).toBe(false);
  });

  it("still matches a real decisionMakerName substring search", () => {
    const record = makeRecord({ decisionMakerName: "John Murphy" });
    expect(recordMatchesSearch(record, "murphy")).toBe(true);
  });

  it("still matches company name, unaffected by this fix", () => {
    const record = makeRecord({ companyName: "Nullify Solutions Ltd" });
    expect(recordMatchesSearch(record, "nullify")).toBe(true);
  });

  it("still matches company number, unaffected by this fix", () => {
    const record = makeRecord({ companyNumber: "999888" });
    expect(recordMatchesSearch(record, "999888")).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/hooks/__tests__/useTableFilters.test.ts`
Expected: FAIL — `recordMatchesSearch` is not exported from `../useTableFilters` yet.

- [ ] **Step 3: Extract and fix `recordMatchesSearch`**

In `src/hooks/useTableFilters.ts`, change the import at line 2 from:

```ts
import { CompanyRecord, FilterState } from "../types";
```

to:

```ts
import { CompanyRecord, FilterState } from "../types";
import { cleanNullableField } from "../utils/normalize";
```

Add this new exported function above the `useTableFilters` function (i.e. above the `export function useTableFilters(records: CompanyRecord[]) {` line):

```ts
/**
 * Whether a record matches a free-text search term across its searchable
 * fields. Pure and side-effect-free so it can be unit-tested directly.
 * decisionMakerName/decisionMakerRole are compared via cleanNullableField
 * so a legacy literal "null" string never matches a search for "null".
 */
export function recordMatchesSearch(r: CompanyRecord, term: string): boolean {
  const lowerTerm = term.toLowerCase();
  const cleanedDecisionMakerName = cleanNullableField(r.decisionMakerName);
  const cleanedDecisionMakerRole = cleanNullableField(r.decisionMakerRole);

  return (
    r.companyName.toLowerCase().includes(lowerTerm) ||
    r.companyNumber.toLowerCase().includes(lowerTerm) ||
    !!r.official_website_url?.toLowerCase().includes(lowerTerm) ||
    !!r.notes?.toLowerCase().includes(lowerTerm) ||
    !!cleanedDecisionMakerName?.toLowerCase().includes(lowerTerm) ||
    !!cleanedDecisionMakerRole?.toLowerCase().includes(lowerTerm) ||
    !!r.linkedinUrl?.toLowerCase().includes(lowerTerm)
  );
}
```

Then, inside `filteredRecords`'s `useMemo` (current lines 40-65), replace the inline search block:

```ts
      if (filters.searchTerm) {
        const term = filters.searchTerm.toLowerCase();
        const matches =
          r.companyName.toLowerCase().includes(term) ||
          r.companyNumber.toLowerCase().includes(term) ||
          r.official_website_url?.toLowerCase().includes(term) ||
          r.notes?.toLowerCase().includes(term) ||
          r.decisionMakerName?.toLowerCase().includes(term) ||
          r.decisionMakerRole?.toLowerCase().includes(term) ||
          r.linkedinUrl?.toLowerCase().includes(term);
        if (!matches) return false;
      }
```

with:

```ts
      if (filters.searchTerm && !recordMatchesSearch(r, filters.searchTerm)) {
        return false;
      }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/hooks/__tests__/useTableFilters.test.ts`
Expected: PASS, all 5 tests.

- [ ] **Step 5: Run the full suite and lint**

Run: `npm run lint` — expect 0 errors.
Run: `npm test` — expect all suites passing.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useTableFilters.ts src/hooks/__tests__/useTableFilters.test.ts
git commit -m "fix: extract recordMatchesSearch, stop matching literal 'null' string in table search"
```

---

### Task 7: Fix literal "null" strings in `CompanyDetailModal.tsx`

**Files:**
- Modify: `src/components/CompanyDetailModal.tsx:1-24,125-196`

**Interfaces:**
- Consumes: `cleanNullableField(value: unknown): string | null` from `../utils/normalize` (new import for this file).

**Context:** `CompanyDetailModal` opens when a user clicks a table row — the click-through destination from the exact table the prior fix already covers. Six truthy checks (the top-level card-visibility guard at line 125, plus `decisionMakerName` at 132/137, `decisionMakerRole` at 138-140, `industry` at 165, `phoneNumber` at 177, `contactEmail` at 183) render the raw record field, so a legacy `"null"`-poisoned record shows the literal text `null` one click after the table itself correctly shows "Not listed" / omits the field. **No new automated test is added for this task** — this component has no extractable pure transform (every affected line is a JSX render guard) and this repo has no component-test framework (per this plan's Global Constraints, do not add one for a single component). Verification is: `cleanNullableField`'s own existing unit tests (already covering JSON null / literal "null" string / missing field — the exact three cases this task depends on), TypeScript type-checking, and a manual browser spot-check performed after all tasks land (see the plan's Final Verification section) — do not claim automated regression coverage for this task in its report.

- [ ] **Step 1: Add the import and cleaned local consts**

In `src/components/CompanyDetailModal.tsx`, change line 3 from:

```tsx
import { CompanyRecord } from '../types';
```

to:

```tsx
import { CompanyRecord } from '../types';
import { cleanNullableField } from '../utils/normalize';
```

Then, in the component body, find the existing hooks block (currently lines 20-24):

```tsx
  if (!company) return null;

  const [isEditing, setIsEditing] = useState(false);
  const [editedUrl, setEditedUrl] = useState(company.official_website_url || '');
  const [copied, setCopied] = useState(false);
```

and add the six cleaned local consts immediately **after** this block (i.e. after `const [copied, setCopied] = useState(false);`, before `const handleCopy = () => {`) — placed after the hooks, not before, since this file already has an early `return null` above its `useState` calls and these new consts must not make that pre-existing ordering worse:

```tsx
  if (!company) return null;

  const [isEditing, setIsEditing] = useState(false);
  const [editedUrl, setEditedUrl] = useState(company.official_website_url || '');
  const [copied, setCopied] = useState(false);

  const decisionMakerName = cleanNullableField(company.decisionMakerName);
  const decisionMakerRole = cleanNullableField(company.decisionMakerRole);
  const industry = cleanNullableField(company.industry);
  const companySummary = cleanNullableField(company.companySummary);
  const phoneNumber = cleanNullableField(company.phoneNumber);
  const contactEmail = cleanNullableField(company.contactEmail);
```

- [ ] **Step 2: Fix the card-visibility guard and the six field renders**

Change line 125 from:

```tsx
          {(company.industry || company.companySummary || company.phoneNumber || company.contactEmail || company.decisionMakerName || company.linkedinUrl) && (
```

to:

```tsx
          {(industry || companySummary || phoneNumber || contactEmail || decisionMakerName || company.linkedinUrl) && (
```

Change lines 132-141 from:

```tsx
                {company.decisionMakerName && (
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-500 flex items-center gap-1">
                      <UserCheck className="w-3 h-3 text-emerald-600" /> Key Decision Maker
                    </span>
                    <p className="font-bold text-slate-900 mt-0.5">{company.decisionMakerName}</p>
                    {company.decisionMakerRole && (
                      <p className="text-[11px] font-medium text-slate-600">{company.decisionMakerRole}</p>
                    )}
                  </div>
                )}
```

to:

```tsx
                {decisionMakerName && (
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-500 flex items-center gap-1">
                      <UserCheck className="w-3 h-3 text-emerald-600" /> Key Decision Maker
                    </span>
                    <p className="font-bold text-slate-900 mt-0.5">{decisionMakerName}</p>
                    {decisionMakerRole && (
                      <p className="text-[11px] font-medium text-slate-600">{decisionMakerRole}</p>
                    )}
                  </div>
                )}
```

Change lines 165-169 (industry) from:

```tsx
                {company.industry && (
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-500">Industry / Sector</span>
                    <p className="font-semibold text-slate-800 mt-0.5">{company.industry}</p>
                  </div>
                )}
```

to:

```tsx
                {industry && (
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-500">Industry / Sector</span>
                    <p className="font-semibold text-slate-800 mt-0.5">{industry}</p>
                  </div>
                )}
```

Change lines 177-182 (phoneNumber) from:

```tsx
                {company.phoneNumber && (
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-500">Public Phone</span>
                    <p className="font-mono text-slate-800 mt-0.5">{company.phoneNumber}</p>
                  </div>
                )}
```

to:

```tsx
                {phoneNumber && (
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-500">Public Phone</span>
                    <p className="font-mono text-slate-800 mt-0.5">{phoneNumber}</p>
                  </div>
                )}
```

Change lines 183-188 (contactEmail) from:

```tsx
                {company.contactEmail && (
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-500">Public Email</span>
                    <p className="font-mono text-slate-800 mt-0.5 truncate">{company.contactEmail}</p>
                  </div>
                )}
```

to:

```tsx
                {contactEmail && (
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-500">Public Email</span>
                    <p className="font-mono text-slate-800 mt-0.5 truncate">{contactEmail}</p>
                  </div>
                )}
```

Change lines 191-196 (companySummary) from:

```tsx
              {company.companySummary && (
                <div className="pt-2 border-t border-emerald-200/60">
                  <span className="text-[10px] uppercase font-bold text-slate-500">Company Overview</span>
                  <p className="text-xs text-slate-700 mt-0.5 leading-relaxed">{company.companySummary}</p>
                </div>
              )}
```

to:

```tsx
              {companySummary && (
                <div className="pt-2 border-t border-emerald-200/60">
                  <span className="text-[10px] uppercase font-bold text-slate-500">Company Overview</span>
                  <p className="text-xs text-slate-700 mt-0.5 leading-relaxed">{companySummary}</p>
                </div>
              )}
```

(`company.verificationStatus` on line 171-176 and `company.linkedinUrl`/`company.linkedinType` on lines 143-164 are untouched — `verificationStatus` is a locally-computed enum, not raw AI free text, and `linkedinUrl` is out of scope per this plan's field matrix.)

- [ ] **Step 3: Type-check**

Run: `npm run lint` — expect 0 errors.

- [ ] **Step 4: Run the full suite**

Run: `npm test` — expect all suites passing (no dedicated test for this task, per the Context note above — this confirms no regression elsewhere, particularly that `cleanNullableField`'s own suite is still green).

- [ ] **Step 5: Commit**

```bash
git add src/components/CompanyDetailModal.tsx
git commit -m "fix: prevent literal 'null' strings rendering in CompanyDetailModal"
```

---

## Final Verification

- [x] Run `npm run lint` — 0 errors across all seven tasks.
- [x] Run `npm test` — 99/99 passing after the seven tasks (6 in `csvUtils.test.ts` + 6 in `workspaceService.test.ts` + 5 in `EditRowModal.test.ts` + 5 in `useTableFilters.test.ts`, on top of the prior plan's 77); 100/100 after the final-review fix wave below added one more test.
- [x] Run `npm run build` — clean production build (only the pre-existing, unrelated chunk-size and CJS `import.meta` warnings already documented in this repo's `CLAUDE.md`).
- [x] Manual browser spot-check (controller-performed): started `npm run dev`, found real pre-existing legacy records in the seeded dataset with literal `"null"` strings (e.g. "THE MIDLAND OIL COMPANY UNLIMITED COMPANY" — `decisionMakerName`/`decisionMakerRole`/`contactEmail` all literal `"null"`), confirmed in the browser that: (a) the table row shows "Not listed" and omits the email line (no literal `null` — see the final-review fix wave note below, this required an additional fix beyond the seven tasks), (b) `CompanyDetailModal` shows no literal `null` text anywhere in the "B2B Lead Verification Intelligence" card (the Key Decision Maker sub-section correctly disappears entirely, since the name is null), and (c) `EditRowModal` shows empty inputs (placeholder text) for Decision Maker Name, Decision Maker Role, and Contact Email, not the text `null`, while real values (Phone, Industry) still display correctly.
- [x] Explicit confirmation: CSV export was manually spot-checked via the Task 2 Step 5 printed output; Google Sheets export was manually spot-checked via the Task 3 Step 5 printed `buildSheetRows()` output — **not** a live authenticated Sheets round-trip, since that needs OAuth credentials this environment doesn't have.

## Final whole-branch review — additional fix wave (post-Task-7, pre-merge)

The final whole-branch review (most capable model, full 7-task diff) found the seven tasks individually correct but two cross-task gaps this plan's text didn't anticipate. Per human-partner decision, both were fixed on this branch (see commits `b08bf68`, `b22c85b`, `f5f9b3b`) rather than deferred:

1. **`src/components/ResultsTable.tsx` was left inconsistent with `CompanyDetailModal.tsx`.** Task 7 cleaned all six fields in the detail modal, but the main table (from the *prior* merged plan) only ever cleaned `decisionMakerName`/`contactEmail` — `decisionMakerRole`, `industry`, `phoneNumber` still rendered the raw field. A legacy record showed literal `null` in the primary table view while the same record's detail modal (one click away) correctly hid it. Fixed by adding the same three cleaned local consts already established in that file (`decisionMakerRole`, `industry`, `phoneNumber`, alongside the existing `decisionMakerName`/`contactEmail`) and swapping the three affected render sites.
2. **This plan's "do not modify `duplicateUtils.ts` dedup scoring" constraint (line 16 above) turned out to be premature.** The reviewer found `if (r.phoneNumber) score += 10;` (line 99, directly above the already-fixed `contactEmail` line from the prior PR) still trusts a raw, unnormalized field — the same data-loss shape as the prior PR's `contactEmail` fix (a legacy `"null"`-string phone can outscore and cause deletion of a real duplicate). This was compounded by a second, previously-undocumented gap: `server.ts`'s `LIGHT_SWEEP` branch (`category`/`phone` fields) was never normalized at the source by Task 1, which only covered the `FULL_ENRICHMENT` result object — so new Light Sweep runs could still *write* fresh literal-`"null"` phone numbers even after this plan landed. Both halves were fixed together (source normalization in `server.ts`, scoring fix in `duplicateUtils.ts`, with a new regression test proving a real-phone record survives dedup over a `"null"`-string-phone record — verified by the re-reviewer by reverting the one-line fix and confirming the test fails, then restoring it and confirming it passes).

**Both previously-deferred items were closed in a follow-up session** (commits `0f2142d`, `924eaff`, on `main`, after this branch was already merged):

1. **`server.ts:670`** — `buildDatasetSummary()` extracted to `src/utils/datasetSummary.ts`; the `/api/ai-analyze-dataset` prompt payload now runs `decisionMaker`/`role`/`industry` through `cleanNullableField()` before they reach the model. 5 new tests in `datasetSummary.test.ts`.
2. **`App.tsx`'s `ColumnMappingModal` relabel data-loss risk** — confirmed via code read: `onConfirmImport` was calling `setRecords(newRecords)` with the wholesale output of `extractRecordsWithCustomMapping`, which only knows 5 fields and builds brand-new `CompanyRecord` objects (fresh `id`, `official_website_url: null`, `match_type: 'UNPROCESSED'`, etc.) — so using "Fix Column Mapping" on the main table would have silently wiped every enrichment field on every Tier 2 record and orphaned their Firestore documents. Fixed by adding `mergeRelabeledRecords()` to `csvUtils.ts`, which correlates each relabeled row back to its source record via a `rawRowData.__recordId` tag (attached to the modal's row objects before extraction) and spreads only the 5 mapped fields onto a copy of the original record — `isManualEdit` is only stamped when a mapped field actually changed. 7 new tests in `csvUtils.test.ts`, including one proving the internal `__recordId` tag can never leak into a CSV export column. Falsification check (bypass the merge, return `relabeledRecords` verbatim) confirmed 6 of the 7 new tests go red, then pass again once restored.

Both verified: `npm run lint` — 0 errors; `npm test` — 113/113 passing; `npm run build` — clean (same pre-existing warnings as before).

**Noted but intentionally not fixed in this pass** (pre-existing, not a regression from either fix above): `exportRecordsToCSV` sources the company-name/CRO/county CSV columns from `r.rawRowData` when present, not from `r.companyName`/`companyNumber`/`county` — so a relabel via `ColumnMappingModal`, or a manual edit via `EditRowModal` (`normalizeEditedRecord` has the identical gap), updates the record fields shown in the UI but does not update `rawRowData`, so CSV export of those three columns can still reflect pre-edit values for any record that was originally imported from a file. This is a shared, app-wide limitation of `rawRowData`-based CSV export, not specific to this fix; it would need its own investigation and is out of scope here.
