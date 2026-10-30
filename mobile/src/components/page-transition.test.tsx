import { renderHook } from '@testing-library/react-native';

import { ringDirection, slideDirection, usePager } from '@/components/page-transition';

/** Category, then series, as Progress passes them. */
const levels = (category: number, series: number, seriesCount = 4) => [
  { index: category, count: 3, ring: true },
  { index: series, count: seriesCount, ring: seriesCount >= 3 },
];

describe('slideDirection', () => {
  test('content moves onwards when the series turns onwards, and back when it turns back', () => {
    expect(slideDirection(levels(0, 0), levels(0, 1))).toBeGreaterThan(0);
    expect(slideDirection(levels(0, 1), levels(0, 0))).toBeLessThan(0);
  });

  test('turning round the end of a ring counts as the shorter way', () => {
    expect(slideDirection(levels(0, 0), levels(0, 3))).toBeLessThan(0);
    expect(slideDirection(levels(0, 3), levels(0, 0))).toBeGreaterThan(0);
  });

  test('a category change decides the direction, whatever the series does', () => {
    // Strength's 3rd lift to Cardio's 1st activity: onwards, though the series index drops.
    expect(slideDirection(levels(0, 2), levels(1, 0))).toBeGreaterThan(0);
    // Strength back round to Bodyweight.
    expect(slideDirection(levels(0, 0), levels(2, 0))).toBeLessThan(0);
  });

  test('without a ring, a series moves by its order', () => {
    expect(slideDirection(levels(0, 1, 2), levels(0, 0, 2))).toBeLessThan(0);
  });
});

describe('usePager', () => {
  /** The current and previous pages' slots after each move through `steps` of a 7-tab ring. */
  async function slots(steps: number[]) {
    const { result, rerender } = await renderHook(
      ({ index }: { index: number }) => usePager(String(index), index, ringDirection(7)),
      { initialProps: { index: steps[0] } }
    );
    const seen: { current: number; previous: number | undefined }[] = [];
    for (const index of steps.slice(1)) {
      await rerender({ index });
      seen.push({ current: result.current.current.slot, previous: result.current.previous?.slot });
    }
    return seen;
  }

  test('each new page sits one page on from the one it replaces, in the direction moved', async () => {
    expect(await slots([0, 1, 0])).toEqual([
      { current: 1, previous: 0 },
      { current: 0, previous: 1 },
    ]);
  });

  test('however far the jump, the new page sits right beside the old one', async () => {
    // Three tabs on, then the shorter way back round the ring.
    expect(await slots([0, 3, 0])).toEqual([
      { current: 1, previous: 0 },
      { current: 0, previous: 1 },
    ]);
  });

  test('the page shown keeps up with its latest value', async () => {
    const { result, rerender } = await renderHook(({ value }: { value: string }) => usePager('page', value, () => 1), {
      initialProps: { value: 'old' },
    });
    await rerender({ value: 'new' });
    expect(result.current.current.value).toBe('new');
    expect(result.current.previous).toBeNull();
  });
});
