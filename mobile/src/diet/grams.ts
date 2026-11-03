/**
 * Reads a whole or decimal number of grams (with a dot or comma), or
 * undefined when empty. Resolves NaN for anything else, or a number not
 * above 0.
 */
export function parseGrams(text: string): number | undefined {
  const trimmed = text.trim().replace(',', '.');
  if (trimmed === '') return undefined;
  const grams = /^\d+(\.\d+)?$/.test(trimmed) ? Number(trimmed) : NaN;
  return grams > 0 ? grams : NaN;
}

/** Grams with at most one decimal, e.g. "142.5 g". */
export const formatGrams = (grams: number) => `${Math.round(grams * 10) / 10} g`;
