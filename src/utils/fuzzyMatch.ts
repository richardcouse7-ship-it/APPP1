/**
 * Lightweight fuzzy string matching for company name deduplication.
 *
 * Uses token-set ratio: compares the intersection of token sets
 * to detect similar names like "O'Brien Ltd" vs "OBrien Limited"
 * without requiring a CRO company number.
 */

/**
 * Tokenizes a company name into sorted unique word tokens,
 * with legal suffixes stripped.
 */
import { stripLegalSuffix } from "./normalize";

function tokenize(name: string): Set<string> {
  const cleaned = stripLegalSuffix(name);
  return new Set(cleaned.split(/\s+/).filter((t) => t.length > 1));
}

/**
 * Calculates the Jaccard similarity between two token sets.
 * Returns a value between 0 (no overlap) and 1 (identical).
 */
function jaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection++;
  }

  const union = setA.size + setB.size - intersection;
  return intersection / union;
}

/**
 * Returns a fuzzy similarity score between two company names.
 * Handles legal suffix variations, word reordering, and partial matches.
 *
 * @returns Score from 0 to 1. Above 0.7 is considered a likely match.
 */
export function fuzzyNameSimilarity(nameA: string, nameB: string): number {
  const tokensA = tokenize(nameA);
  const tokensB = tokenize(nameB);
  return jaccardSimilarity(tokensA, tokensB);
}

/**
 * Checks if two company names are fuzzy duplicates.
 * Uses a threshold of 0.7 (70% token overlap after suffix stripping).
 */
export function areFuzzyDuplicates(
  nameA: string,
  countyA: string,
  nameB: string,
  countyB: string
): boolean {
  // Must be in the same county (or one must be empty)
  if (countyA && countyB && countyA.toLowerCase() !== countyB.toLowerCase()) {
    return false;
  }
  return fuzzyNameSimilarity(nameA, nameB) >= 0.7;
}
