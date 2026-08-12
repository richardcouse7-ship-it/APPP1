export function normalizeString(value: string): string {
  return (value || '')
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

// Irish/UK legal entity suffixes to strip for dedup key generation
const LEGAL_SUFFIXES = [
  'limited', 'ltd', 'teoranta', 'clg', 'clc',
  'public limited company', 'plc',
  'designated activity company', 'dac',
  'company limited by guarantee', 'clbg',
  'unlimited company', 'ultd',
  'sons', 'son', 'brothers', 'bros',
  'and company', 'co',
];

/**
 * Strips common Irish/UK legal entity suffixes from a company name
 * for more accurate deduplication.
 */
export function stripLegalSuffix(name: string): string {
  let cleaned = normalizeString(name);
  // Remove trailing commas before suffixes
  cleaned = cleaned.replace(/,\s*(limited|ltd|teoranta|clg|clc|plc|dac|ultd)\b/g, '');
  // Remove suffixes at end of name
  for (const suffix of LEGAL_SUFFIXES) {
    const regex = new RegExp(`\\s+${suffix}\\.?$`, 'i');
    cleaned = cleaned.replace(regex, '');
  }
  // Also remove "co." at the end
  cleaned = cleaned.replace(/\s+co\.?$/i, '');
  return cleaned.trim();
}

const MULTI_PART_SUFFIXES = new Set(['co.uk', 'co.ie', 'org.uk']);

export function getApexDomain(url: string | null | undefined): string | null {
  if (!url) return null;
  let hostname: string;
  try {
    const withProtocol = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    hostname = new URL(withProtocol).hostname;
  } catch {
    return null;
  }
  hostname = hostname.toLowerCase().replace(/^www\./, '');
  const parts = hostname.split('.').filter(Boolean);
  if (parts.length <= 2) return hostname || null;

  const lastTwo = parts.slice(-2).join('.');
  if (MULTI_PART_SUFFIXES.has(lastTwo) && parts.length >= 3) {
    return parts.slice(-3).join('.');
  }
  return lastTwo;
}

export function getDedupKey(
  companyNumber: string | null | undefined,
  companyName: string,
  county: string
): string {
  const trimmedNumber = (companyNumber || '').toString().trim();
  if (trimmedNumber) return trimmedNumber.toLowerCase();
  // Use stripLegalSuffix for more accurate name-based dedup
  return `c_${stripLegalSuffix(companyName)}_${normalizeString(county)}`;
}

/**
 * Normalizes an AI-provider-sourced nullable field.
 * Collapses JSON null, undefined, empty/whitespace-only strings, and the
 * literal string "null" (which LLMs sometimes emit for a quoted
 * "<VALUE_OR_NULL>" schema placeholder instead of a real JSON null) down
 * to a single null representation. Any other value is returned trimmed.
 */
export function cleanNullableField(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  if (trimmed === '' || trimmed.toLowerCase() === 'null') return null;
  return trimmed;
}
