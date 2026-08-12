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
