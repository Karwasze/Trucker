import { parseWeight } from '@/diet/parse-weight';

test('reads a weight', () => {
  expect(parseWeight(' 78 ')).toBe(78);
  expect(parseWeight('78,5')).toBe(78.5);
  expect(parseWeight('')).toBeUndefined();
  expect(parseWeight('abc')).toBeNaN();
  expect(parseWeight('0')).toBeNaN();
  expect(parseWeight('-5')).toBeNaN();
});
