/**
 * Reads a whole or decimal weight (with a dot or comma), or undefined when
 * empty. Resolves NaN for anything else, or a number not above 0.
 */
export function parseWeight(text: string): number | undefined {
  const trimmed = text.trim().replace(',', '.');
  if (trimmed === '') return undefined;
  const weight = /^\d+(\.\d+)?$/.test(trimmed) ? Number(trimmed) : NaN;
  return weight > 0 ? weight : NaN;
}
