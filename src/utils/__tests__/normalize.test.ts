import { describe, it, expect } from "vitest";
import { normalizeString, getApexDomain, getDedupKey, stripLegalSuffix, cleanNullableField } from "../normalize";

describe("normalizeString", () => {
  it("trims and lowercases", () => {
    expect(normalizeString("  Hello World  ")).toBe("hello world");
  });

  it("collapses multiple spaces", () => {
    expect(normalizeString("hello    world")).toBe("hello world");
  });

  it("handles null/undefined", () => {
    expect(normalizeString(null as any)).toBe("");
    expect(normalizeString(undefined as any)).toBe("");
  });
});

describe("getApexDomain", () => {
  it("extracts apex domain from full URL", () => {
    expect(getApexDomain("https://www.example.ie/path")).toBe("example.ie");
  });

  it("handles URLs without protocol", () => {
    expect(getApexDomain("example.ie")).toBe("example.ie");
  });

  it("handles multi-part suffixes (.co.uk)", () => {
    expect(getApexDomain("https://sub.example.co.uk")).toBe("example.co.uk");
  });

  it("handles multi-part suffixes (.co.ie)", () => {
    expect(getApexDomain("https://sub.example.co.ie")).toBe("example.co.ie");
  });

  it("returns null for invalid input", () => {
    expect(getApexDomain(null)).toBeNull();
    expect(getApexDomain("")).toBeNull();
  });

  it("strips www prefix", () => {
    expect(getApexDomain("https://www.example.ie")).toBe("example.ie");
  });
});

describe("getDedupKey", () => {
  it("uses CRO number when available", () => {
    expect(getDedupKey("12345", "Test Ltd", "Dublin")).toBe("12345");
  });

  it("falls back to name+county when no CRO number", () => {
    const key = getDedupKey("", "Test Ltd", "Dublin");
    expect(key).toContain("c_");
    expect(key).toContain("test");
    expect(key).toContain("dublin");
  });

  it("strips legal suffixes in fallback key", () => {
    const key1 = getDedupKey("", "Test Ltd", "Dublin");
    const key2 = getDedupKey("", "Test Limited", "Dublin");
    expect(key1).toBe(key2);
  });
});

describe("stripLegalSuffix", () => {
  it("strips 'Ltd'", () => {
    expect(stripLegalSuffix("Murphy Construction Ltd")).toBe("murphy construction");
  });

  it("strips 'Limited'", () => {
    expect(stripLegalSuffix("Murphy Construction Limited")).toBe("murphy construction");
  });

  it("strips 'Teoranta'", () => {
    expect(stripLegalSuffix("Ó Briain Teoranta")).toBe("ó briain");
  });

  it("strips 'CLG'", () => {
    expect(stripLegalSuffix("Dublin Enterprise CLG")).toBe("dublin enterprise");
  });

  it("strips 'DAC'", () => {
    expect(stripLegalSuffix("Tech Solutions DAC")).toBe("tech solutions");
  });

  it("handles names without suffixes", () => {
    expect(stripLegalSuffix("Murphy Construction")).toBe("murphy construction");
  });

  it("strips trailing comma before suffix", () => {
    expect(stripLegalSuffix("Murphy Construction, Ltd")).toBe("murphy construction");
  });

  it("is case-insensitive", () => {
    expect(stripLegalSuffix("MURPHY CONSTRUCTION LTD")).toBe("murphy construction");
  });
});

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
