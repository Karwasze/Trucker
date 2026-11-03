import { formatGrams, parseGrams } from '@/diet/grams';

test('reads grams', () => {
  expect(parseGrams(' 150 ')).toBe(150);
  expect(parseGrams('142,5')).toBe(142.5);
  expect(parseGrams('')).toBeUndefined();
  expect(parseGrams('abc')).toBeNaN();
  expect(parseGrams('0')).toBeNaN();
  expect(parseGrams('-5')).toBeNaN();
});

test('formats grams', () => {
  expect(formatGrams(143.33)).toBe('143.3 g');
  expect(formatGrams(150)).toBe('150 g');
});
