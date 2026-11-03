import { addMonths, formatMonth, monthOf, monthRange } from '@/workout/month-calendar';

test('months step across years', () => {
  expect(addMonths('2026-01', -1)).toBe('2025-12');
  expect(addMonths('2025-12', 1)).toBe('2026-01');
  expect(addMonths('2026-10', -13)).toBe('2025-09');
});

test('a month runs from its first to its last day', () => {
  expect(monthRange('2026-10')).toEqual({ from: '2026-10-01', to: '2026-10-31' });
  expect(monthRange('2028-02')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
});

test('months are named with their year', () => {
  expect(monthOf('2026-10-16')).toBe('2026-10');
  expect(formatMonth('2026-10')).toBe('October 2026');
});
