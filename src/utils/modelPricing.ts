export const MODEL_PRICING: Record<string, number> = {
  'gemini-3.1-flash-lite': 0.0002,
  'gemini-3.6-flash': 0.001,
  'perplexity-sonar': 0.006,
  'perplexity-sonar-pro': 0.020,
};

export function formatCost(amount: number): string {
  if (amount < 0.01) {
    return `$${amount.toFixed(4)}`;
  }
  return `$${amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
