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
