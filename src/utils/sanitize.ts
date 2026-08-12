/**
 * Input sanitization utilities to prevent prompt injection attacks.
 *
 * Applied to all user-supplied data (company names, counties, etc.)
 * before interpolation into LLM prompt templates.
 */

// Control characters, null bytes, and other non-printable chars
const CONTROL_CHARS = /[\x00-\x1F\x7F]/g;

// Sequences that could break out of template literals or inject instructions
const PROMPT_INJECTION_PATTERNS = [
  /\$\{[^}]*\}/g, // Template literal interpolation ${...}
  /`/g, // Backticks — could break prompt template boundaries
  /\bignore (all )?previous instructions?\b/gi,
  /\bdisregard (all )?previous\b/gi,
  /\byou are now\b/gi,
  /\bsystem prompt\b/gi,
  /\bnew (task|instruction|role)\b/gi,
  /\bforget (everything|all|your instructions)\b/gi,
];

const MAX_INPUT_LENGTH = 200;

/**
 * Sanitizes a string for safe interpolation into an LLM prompt.
 *
 * - Strips control characters and null bytes
 * - Removes backticks and ${} sequences that could break template literals
 * - Removes common prompt injection phrases
 * - Truncates to MAX_INPUT_LENGTH characters
 * - Trims whitespace
 */
export function sanitizePromptInput(value: string | null | undefined): string {
  if (!value) return "";

  let cleaned = String(value)
    .replace(CONTROL_CHARS, "")
    .trim();

  // Remove prompt injection patterns
  for (const pattern of PROMPT_INJECTION_PATTERNS) {
    cleaned = cleaned.replace(pattern, "");
  }

  // Collapse multiple spaces left by removals
  cleaned = cleaned.replace(/\s{2,}/g, " ").trim();

  // Truncate to prevent oversized inputs
  if (cleaned.length > MAX_INPUT_LENGTH) {
    cleaned = cleaned.substring(0, MAX_INPUT_LENGTH);
  }

  return cleaned;
}

/**
 * Validates a URL string for basic format safety.
 * Used to verify LLM-returned URLs before storing them.
 */
export function isValidUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    // Must have a valid hostname with at least one dot
    return parsed.hostname.includes(".");
  } catch {
    return false;
  }
}
