import { renderHook } from '@testing-library/react-native';

import { useSlideDirection } from '@/components/page-transition';

/** Category, then series, as Progress passes them. */
const levels = (category: number, series: number, seriesCount = 4) => [
  { index: category, count: 3, ring: true },
  { index: series, count: seriesCount, ring: seriesCount >= 3 },
];

async function directions(steps: [number, number][]) {
  const { result, rerender } = await renderHook(
    ({ step }: { step: [number, number] }) => useSlideDirection(levels(...step)),
    { initialProps: { step: steps[0] } }
  );
  const seen: number[] = [];
  for (const step of steps.slice(1)) {
    await rerender({ step });
    seen.push(result.current);
  }
  return seen;
}

test('content moves onwards when the series turns onwards, and back when it turns back', async () => {
  expect(
    await directions([
      [0, 0],
      [0, 1],
      [0, 0],
    ])
  ).toEqual([1, -1]);
});

test('turning round the end of a ring counts as the shorter way', async () => {
  expect(
    await directions([
      [0, 0],
      [0, 3],
    ])
  ).toEqual([-1]);
  expect(
    await directions([
      [0, 3],
      [0, 0],
    ])
  ).toEqual([1]);
});

test('a category change decides the direction, whatever the series does', async () => {
  // Strength's 3rd lift to Cardio's 1st activity: onwards, though the series index drops.
  expect(
    await directions([
      [0, 2],
      [1, 0],
    ])
  ).toEqual([1]);
  // Strength back round to Bodyweight.
  expect(
    await directions([
      [0, 0],
      [2, 0],
    ])
  ).toEqual([-1]);
});

test('without a ring, a series moves by its order', async () => {
  const { result, rerender } = await renderHook(({ s }: { s: number }) => useSlideDirection(levels(0, s, 2)), {
    initialProps: { s: 1 },
  });
  await rerender({ s: 0 });
  expect(result.current).toBe(-1);
});
