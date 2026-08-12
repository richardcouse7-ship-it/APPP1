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
