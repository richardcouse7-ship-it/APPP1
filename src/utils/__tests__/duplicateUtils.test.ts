import { describe, it, expect } from "vitest";
import { deduplicateDataset } from "../duplicateUtils";
import { CompanyRecord } from "../../types";

describe("deduplicateDataset", () => {
  it("prefers record with real email over record with literal 'null' string in contactEmail", () => {
    // Two duplicate records with the same company number (will be in the same dedup group)
    // One has contactEmail: "null" (literal string, legacy bad data)
    // One has contactEmail: "real@example.ie" (real email)
    // Both have same status ('PENDING') and no other distinguishing factors
    // The one with the real email should be kept

    const recordWithNullString: CompanyRecord = {
      id: "record-1",
      companyNumber: "123456",
      companyName: "Test Company Ltd",
      county: "Dublin",
      status: "PENDING",
      contactEmail: "null", // literal string "null" - data loss risk
      phoneNumber: undefined,
      official_website_url: undefined,
      match_type: "UNPROCESSED",
      confidence_score: "NONE",
    };

    const recordWithRealEmail: CompanyRecord = {
      id: "record-2",
      companyNumber: "123456",
      companyName: "Test Company Ltd",
      county: "Dublin",
      status: "PENDING",
      contactEmail: "real@example.ie", // real verified email
      phoneNumber: undefined,
      official_website_url: undefined,
      match_type: "UNPROCESSED",
      confidence_score: "NONE",
    };

    const result = deduplicateDataset([recordWithNullString, recordWithRealEmail]);

    // Should keep only the record with the real email
    expect(result.cleanedRecords).toHaveLength(1);
    expect(result.cleanedRecords[0].id).toBe("record-2");
    expect(result.removedRecords).toHaveLength(1);
    expect(result.removedRecords[0].id).toBe("record-1");
  });

  it("prefers record with real phone over record with literal 'null' string in phoneNumber", () => {
    // Two duplicate records with the same company number (will be in the same dedup group)
    // One has phoneNumber: "null" (literal string, legacy bad data)
    // One has phoneNumber: "0851234567" (real phone number)
    // Both have same status ('PENDING') and no other distinguishing factors
    // The one with the real phone number should be kept

    const recordWithNullString: CompanyRecord = {
      id: "record-1",
      companyNumber: "654321",
      companyName: "Test Company Two Ltd",
      county: "Dublin",
      status: "PENDING",
      contactEmail: undefined,
      phoneNumber: "null", // literal string "null" - data loss risk
      official_website_url: undefined,
      match_type: "UNPROCESSED",
      confidence_score: "NONE",
    };

    const recordWithRealPhone: CompanyRecord = {
      id: "record-2",
      companyNumber: "654321",
      companyName: "Test Company Two Ltd",
      county: "Dublin",
      status: "PENDING",
      contactEmail: undefined,
      phoneNumber: "0851234567", // real verified phone number
      official_website_url: undefined,
      match_type: "UNPROCESSED",
      confidence_score: "NONE",
    };

    const result = deduplicateDataset([recordWithNullString, recordWithRealPhone]);

    // Should keep only the record with the real phone number
    expect(result.cleanedRecords).toHaveLength(1);
    expect(result.cleanedRecords[0].id).toBe("record-2");
    expect(result.removedRecords).toHaveLength(1);
    expect(result.removedRecords[0].id).toBe("record-1");
  });

  it("handles cleanNullableField for undefined and null contactEmail", () => {
    // Verify that undefined and null values are also handled correctly
    const recordWithUndefined: CompanyRecord = {
      id: "record-1",
      companyNumber: "789",
      companyName: "Company A",
      county: "Cork",
      status: "PENDING",
      contactEmail: undefined,
      phoneNumber: undefined,
      official_website_url: undefined,
      match_type: "UNPROCESSED",
      confidence_score: "NONE",
    };

    const recordWithEmail: CompanyRecord = {
      id: "record-2",
      companyNumber: "789",
      companyName: "Company A",
      county: "Cork",
      status: "PENDING",
      contactEmail: "contact@example.ie",
      phoneNumber: undefined,
      official_website_url: undefined,
      match_type: "UNPROCESSED",
      confidence_score: "NONE",
    };

    const result = deduplicateDataset([recordWithUndefined, recordWithEmail]);

    expect(result.cleanedRecords).toHaveLength(1);
    expect(result.cleanedRecords[0].id).toBe("record-2");
  });

  it("handles empty/whitespace-only contactEmail", () => {
    const recordWithEmpty: CompanyRecord = {
      id: "record-1",
      companyNumber: "456",
      companyName: "Company B",
      county: "Galway",
      status: "PENDING",
      contactEmail: "   ",
      phoneNumber: undefined,
      official_website_url: undefined,
      match_type: "UNPROCESSED",
      confidence_score: "NONE",
    };

    const recordWithEmail: CompanyRecord = {
      id: "record-2",
      companyNumber: "456",
      companyName: "Company B",
      county: "Galway",
      status: "PENDING",
      contactEmail: "info@company.ie",
      phoneNumber: undefined,
      official_website_url: undefined,
      match_type: "UNPROCESSED",
      confidence_score: "NONE",
    };

    const result = deduplicateDataset([recordWithEmpty, recordWithEmail]);

    expect(result.cleanedRecords).toHaveLength(1);
    expect(result.cleanedRecords[0].id).toBe("record-2");
  });

  it("keeps record with non-email score factors even if email is 'null'", () => {
    // A record with a successful status should be kept even if contactEmail is "null"
    // if it has higher overall score than its duplicate
    const recordWithNullEmailButSuccess: CompanyRecord = {
      id: "record-1",
      companyNumber: "999",
      companyName: "Winner Company",
      county: "Limerick",
      status: "SUCCESS",
      contactEmail: "null",
      phoneNumber: undefined,
      official_website_url: "https://example.ie",
      match_type: "OFFICIAL_WEBSITE",
      confidence_score: "HIGH",
    };

    const recordWithEmailButPending: CompanyRecord = {
      id: "record-2",
      companyNumber: "999",
      companyName: "Winner Company",
      county: "Limerick",
      status: "PENDING",
      contactEmail: "test@example.ie",
      phoneNumber: undefined,
      official_website_url: undefined,
      match_type: "UNPROCESSED",
      confidence_score: "NONE",
    };

    const result = deduplicateDataset([
      recordWithNullEmailButSuccess,
      recordWithEmailButPending,
    ]);

    // The first record should win due to higher overall score (SUCCESS + website + OFFICIAL_WEBSITE)
    expect(result.cleanedRecords).toHaveLength(1);
    expect(result.cleanedRecords[0].id).toBe("record-1");
  });

  it("keeps non-duplicates as-is", () => {
    const uniqueRecords: CompanyRecord[] = [
      {
        id: "unique-1",
        companyNumber: "111",
        companyName: "Company One",
        county: "Dublin",
        status: "SUCCESS",
        contactEmail: "one@example.ie",
        phoneNumber: "0123456789",
        official_website_url: "https://one.ie",
        match_type: "OFFICIAL_WEBSITE",
        confidence_score: "HIGH",
      },
      {
        id: "unique-2",
        companyNumber: "222",
        companyName: "Company Two",
        county: "Cork",
        status: "SUCCESS",
        contactEmail: "two@example.ie",
        phoneNumber: "0987654321",
        official_website_url: "https://two.ie",
        match_type: "OFFICIAL_WEBSITE",
        confidence_score: "HIGH",
      },
    ];

    const result = deduplicateDataset(uniqueRecords);

    expect(result.cleanedRecords).toHaveLength(2);
    expect(result.removedRecords).toHaveLength(0);
    expect(result.removedCount).toBe(0);
  });
});
