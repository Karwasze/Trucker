import { addDays, dayNumber, mondayOf, xScale, yScale } from '@/components/chart-scale';

test('mondayOf finds the week start for every weekday', () => {
  // 12 Oct 2026 is a Monday.
  for (let i = 0; i < 7; i++) expect(mondayOf(addDays('2026-10-12', i))).toBe('2026-10-12');
  expect(mondayOf('2026-10-19')).toBe('2026-10-19');
  expect(mondayOf('2026-10-11')).toBe('2026-10-05');
});

test('days stay whole across DST changes', () => {
  // Europe moves clocks back on 25 Oct 2026.
  expect(dayNumber('2026-10-26') - dayNumber('2026-10-25')).toBe(1);
  expect(addDays('2026-10-24', 2)).toBe('2026-10-26');
  expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
});

test('a point sits in the middle of its day', () => {
  // A one-day range: a lone point is centred, not on the edge.
  const one = xScale('2026-10-18', '2026-10-18', 0, 100);
  expect(one.point('2026-10-18')).toBe(50);

  // Today's point is half a day in from the right, the first day's half a day in from the left.
  const week = xScale('2026-10-12', '2026-10-18', 0, 70);
  expect(week.point('2026-10-12')).toBe(5);
  expect(week.point('2026-10-18')).toBe(65);
  expect(week.at('2026-10-15')).toBe(30);
  expect(week.at('2026-10-18', 1)).toBe(70);
});

test('a ride on Saturday is plotted on Saturday, not the Monday of its week', () => {
  const x = xScale('2025-10-18', '2026-10-18', 0, 366);
  expect(x.point('2026-10-17')).toBe(364.5);
  expect(x.point('2026-10-17')).not.toBe(x.point('2026-10-12'));
});

test('zero-based axis includes zero and the value', () => {
  const y = yScale([45.2], true);
  expect(y.min).toBe(0);
  expect(y.max).toBeGreaterThanOrEqual(45.2);
  expect(y.ticks).toEqual([0, 20, 40, 60]);
});

test('fitted axis centres a single value instead of putting it at an edge', () => {
  const y = yScale([10.6], false);
  const position = (10.6 - y.min) / (y.max - y.min);
  expect(position).toBeGreaterThan(0.2);
  expect(position).toBeLessThan(0.8);
});

test('fitted axis zooms to the data', () => {
  const y = yScale([80.2, 81.5, 79.9], false);
  expect(y.min).toBeGreaterThan(70);
  expect(y.min).toBeLessThanOrEqual(79.9);
  expect(y.max).toBeGreaterThanOrEqual(81.5);
  expect(y.max).toBeLessThan(90);
  expect(y.ticks[0]).toBe(y.min);
  expect(y.ticks.at(-1)).toBe(y.max);
});

test('all-zero totals still get a usable axis', () => {
  const y = yScale([0, 0], true);
  expect(y.min).toBe(0);
  expect(y.max).toBeGreaterThan(0);
});

test('ticks are free of float noise', () => {
  for (const t of yScale([0.1, 0.7], false).ticks) expect(t).toBe(+t.toFixed(6));
});
