import { describe, it, expect } from "vitest";
import { fuzzyNameSimilarity, areFuzzyDuplicates } from "../fuzzyMatch";

describe("fuzzyNameSimilarity", () => {
  it("returns 1 for identical names", () => {
    expect(fuzzyNameSimilarity("Murphy Construction", "Murphy Construction")).toBe(1);
  });

  it("returns high score for names with different legal suffixes", () => {
    const score = fuzzyNameSimilarity("Murphy Construction Ltd", "Murphy Construction Limited");
    expect(score).toBeGreaterThanOrEqual(0.7);
  });

  it("returns high score for same words in different order", () => {
    const score = fuzzyNameSimilarity("Construction Murphy", "Murphy Construction");
    expect(score).toBeGreaterThanOrEqual(0.7);
  });

  it("returns lower score for different companies", () => {
    const score = fuzzyNameSimilarity("Murphy Construction", "Kelly Plumbing");
    expect(score).toBeLessThan(0.3);
  });

  it("handles Teoranta suffix", () => {
    const score = fuzzyNameSimilarity("Ó Briain Teoranta", "O Briain Ltd");
    expect(score).toBeGreaterThanOrEqual(0.5);
  });
});

describe("areFuzzyDuplicates", () => {
  it("returns true for same name in same county", () => {
    expect(areFuzzyDuplicates("Murphy Ltd", "Dublin", "Murphy Limited", "Dublin")).toBe(true);
  });

  it("returns false for similar names in different counties", () => {
    expect(areFuzzyDuplicates("Murphy Ltd", "Dublin", "Murphy Limited", "Cork")).toBe(false);
  });

  it("returns true when county is empty (unknown)", () => {
    expect(areFuzzyDuplicates("Murphy Ltd", "", "Murphy Limited", "Dublin")).toBe(true);
  });

  it("returns false for different companies in same county", () => {
    expect(areFuzzyDuplicates("Murphy Construction", "Dublin", "Kelly Plumbing", "Dublin")).toBe(false);
  });
});
