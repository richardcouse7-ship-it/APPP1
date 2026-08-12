import { describe, it, expect } from "vitest";
import Papa from "papaparse";
import { exportRecordsToCSV, extractRecordsWithCustomMapping, mergeRelabeledRecords, CustomColumnMapping } from "../csvUtils";
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

describe("mergeRelabeledRecords", () => {
  const mapping: CustomColumnMapping = {
    companyNameKey: "Company Name",
    companyNumberKey: "CRO Reg Number",
    countyKey: "County",
    decisionMakerNameKey: "Decision Maker Name",
    decisionMakerRoleKey: "Decision Maker Role",
  };

  function relabelViaModal(records: CompanyRecord[], edits: Record<string, any> = {}) {
    const rows = records.map((r) => ({
      "Company Name": r.companyName,
      "CRO Reg Number": r.companyNumber,
      County: r.county,
      "Decision Maker Name": r.decisionMakerName || "",
      "Decision Maker Role": r.decisionMakerRole || "",
      __recordId: r.id,
      ...edits[r.id],
    }));
    const { records: relabeled } = extractRecordsWithCustomMapping(rows, mapping, true);
    return mergeRelabeledRecords(records, relabeled);
  }

  it("preserves enrichment fields not covered by the mapping (website, industry, phone, email, etc.)", () => {
    const original = makeRecord({
      id: "rec-1",
      official_website_url: "https://acme.ie",
      industry: "Manufacturing",
      phoneNumber: "021-1234567",
      contactEmail: "info@acme.ie",
      linkedinUrl: "https://linkedin.com/company/acme",
      apexDomain: "acme.ie",
      match_type: "OFFICIAL_WEBSITE",
      confidence_score: "HIGH",
    });

    const [merged] = relabelViaModal([original]);

    expect(merged.official_website_url).toBe("https://acme.ie");
    expect(merged.industry).toBe("Manufacturing");
    expect(merged.phoneNumber).toBe("021-1234567");
    expect(merged.contactEmail).toBe("info@acme.ie");
    expect(merged.linkedinUrl).toBe("https://linkedin.com/company/acme");
    expect(merged.apexDomain).toBe("acme.ie");
    expect(merged.match_type).toBe("OFFICIAL_WEBSITE");
    expect(merged.confidence_score).toBe("HIGH");
  });

  it("preserves the original record id instead of minting a new one", () => {
    const original = makeRecord({ id: "rec-stable-id" });
    const [merged] = relabelViaModal([original]);
    expect(merged.id).toBe("rec-stable-id");
  });

  it("applies the relabeled name/CRO/county/decision-maker fields", () => {
    const original = makeRecord({
      id: "rec-1",
      companyName: "Old Name Ltd",
      companyNumber: "111",
      county: "Cork",
    });

    const [merged] = relabelViaModal([original], {
      "rec-1": { "Company Name": "New Name Ltd", "CRO Reg Number": "222", County: "Galway" },
    });

    expect(merged.companyName).toBe("New Name Ltd");
    expect(merged.companyNumber).toBe("222");
    expect(merged.county).toBe("Galway");
  });

  it("round-trips multiple records to their correct original entry, not by array position", () => {
    const recordA = makeRecord({ id: "rec-a", companyName: "Alpha Ltd", official_website_url: "https://alpha.ie" });
    const recordB = makeRecord({ id: "rec-b", companyName: "Beta Ltd", official_website_url: "https://beta.ie" });

    const merged = relabelViaModal([recordA, recordB]);
    const mergedA = merged.find((r) => r.id === "rec-a");
    const mergedB = merged.find((r) => r.id === "rec-b");

    expect(mergedA?.official_website_url).toBe("https://alpha.ie");
    expect(mergedB?.official_website_url).toBe("https://beta.ie");
  });

  it("falls back to the extracted record when no matching original id is found", () => {
    const freshRecord = makeRecord({ id: "fresh-1" });
    delete (freshRecord as any).rawRowData;
    const merged = mergeRelabeledRecords([], [freshRecord]);
    expect(merged).toEqual([freshRecord]);
  });

  it("strips the internal __recordId tracking key from rawRowData in the no-match fallback, so it can't leak into a CSV export column", () => {
    const freshRecord = makeRecord({
      id: "fresh-1",
      rawRowData: { "Company Name": "Fresh Ltd", __recordId: "some-stale-id" },
    });
    const [merged] = mergeRelabeledRecords([], [freshRecord]);
    expect(merged.rawRowData).not.toHaveProperty("__recordId");
    expect(merged.rawRowData).toEqual({ "Company Name": "Fresh Ltd" });
  });

  it("does not mark a record as manually edited when the relabel changes nothing", () => {
    const original = makeRecord({ id: "rec-1", companyName: "Same Ltd", isManualEdit: false });
    const [merged] = relabelViaModal([original]);
    expect(merged.isManualEdit).toBe(false);
  });

  it("marks a record as manually edited only when a mapped field actually changes", () => {
    const original = makeRecord({ id: "rec-1", companyName: "Old Name Ltd", isManualEdit: false });
    const [merged] = relabelViaModal([original], {
      "rec-1": { "Company Name": "New Name Ltd" },
    });
    expect(merged.isManualEdit).toBe(true);
  });
});
