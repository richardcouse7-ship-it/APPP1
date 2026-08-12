import { describe, it, expect } from "vitest";
import { getCleanedContactFields } from "../CompanyDetailModal";
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

describe("getCleanedContactFields", () => {
  it("cleans literal 'null' strings for all sibling fields", () => {
    const record = makeRecord({
      decisionMakerName: "null",
      decisionMakerRole: "null",
      industry: "null",
      companySummary: "null",
      phoneNumber: "null",
      contactEmail: "null",
    });

    const fields = getCleanedContactFields(record);

    expect(fields.decisionMakerName).toBeNull();
    expect(fields.decisionMakerRole).toBeNull();
    expect(fields.industry).toBeNull();
    expect(fields.companySummary).toBeNull();
    expect(fields.phoneNumber).toBeNull();
    expect(fields.contactEmail).toBeNull();
  });

  it("returns null for a genuinely missing contact field, same as a legacy 'null' string", () => {
    const record = makeRecord({ contactEmail: undefined, phoneNumber: null });

    const fields = getCleanedContactFields(record);

    expect(fields.contactEmail).toBeNull();
    expect(fields.phoneNumber).toBeNull();
  });

  it("passes through real values unchanged", () => {
    const record = makeRecord({
      decisionMakerName: "John Murphy",
      contactEmail: "info@example.ie",
    });

    const fields = getCleanedContactFields(record);

    expect(fields.decisionMakerName).toBe("John Murphy");
    expect(fields.contactEmail).toBe("info@example.ie");
  });

  it("does not treat a value containing 'null' as a substring as null-like", () => {
    const record = makeRecord({ decisionMakerName: "Null Byrne" });

    const fields = getCleanedContactFields(record);

    expect(fields.decisionMakerName).toBe("Null Byrne");
  });
});
