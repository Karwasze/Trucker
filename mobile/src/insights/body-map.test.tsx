import { fireEvent, render, screen } from '@testing-library/react-native';

import type { MuscleVolume } from '@/api/types';
import { BodyMap, volumeStep } from '@/insights/body-map';
import { allOfType } from '@/test-utils';

const volume = (muscle: MuscleVolume['muscle'], weekly_sets: number, last_trained?: string): MuscleVolume => ({
  muscle,
  weekly_sets,
  days_per_week: weekly_sets > 0 ? 1.5 : 0,
  last_trained,
  status: 'low',
});

const muscles = [
  volume('chest', 4.5, '2026-10-16'),
  volume('back', 12, '2026-10-17'),
  volume('shoulders', 1, '2026-10-16'),
  volume('biceps', 0, '2026-08-02'),
  volume('triceps', 7),
  volume('quads', 3),
  volume('hamstrings', 0),
  volume('glutes', 1.5),
  volume('calves', 0),
  volume('core', 0.5),
];

/** The fill of every drawn part of `muscle`, across both figures. */
const fills = (muscle: string) => [
  ...new Set(
    screen.getAllByTestId(`muscle-${muscle}`, { includeHiddenElements: true }).map((p) => JSON.stringify(p.props.fill))
  ),
];

test('steps start at 3, 6 and 10 sets a week, with none apart', () => {
  expect([0, 0.5, 2.9, 3, 5.9, 6, 9.9, 10, 25].map(volumeStep)).toEqual([-1, 0, 0, 1, 1, 2, 2, 3, 3]);
});

test('names the muscles left untrained, and lists the rest by weekly sets', async () => {
  await render(<BodyMap muscles={muscles} span="the last 3 months" />);
  expect(screen.getByText('Not trained in the last 3 months: Biceps, Hamstrings, Calves.')).toBeOnTheScreen();
  expect(screen.getByText(/^Weekly average over the last 3 months/)).toBeOnTheScreen();
  expect(screen.getAllByRole('button')).toHaveLength(10);
  expect(screen.getAllByText(/sets \/ wk$/).map((t) => t.props.children)).toEqual([
    '12 sets / wk',
    '7 sets / wk',
    '4.5 sets / wk',
    '3 sets / wk',
    '1.5 sets / wk',
    '1 sets / wk',
    '0.5 sets / wk',
  ]);
  expect(screen.getByText('1.5 days / week · last 17 Oct')).toBeOnTheScreen();
  expect(screen.getByText('Last trained 2 Aug')).toBeOnTheScreen();
  expect(screen.getAllByText('Never trained')).toHaveLength(2);
});

test('over all time, untrained muscles were never trained', async () => {
  await render(<BodyMap muscles={muscles} span={null} />);
  expect(screen.getByText('Never trained: Biceps, Hamstrings, Calves.')).toBeOnTheScreen();
  expect(screen.getByText(/^Weekly average over all time/)).toBeOnTheScreen();
});

test('each muscle is drawn on the figures it shows on, coloured by its tier', async () => {
  await render(<BodyMap muscles={muscles} span="the last 3 months" />);
  // Both sides on both figures.
  expect(screen.getAllByTestId('muscle-shoulders', { includeHiddenElements: true })).toHaveLength(4);
  expect(screen.getAllByTestId('muscle-chest', { includeHiddenElements: true })).toHaveLength(2);
  expect(fills('back')).toHaveLength(1);
  // One colour per tier: none, under 3, 3–6, 6–10 and 10+ sets a week.
  const tiers = ['hamstrings', 'shoulders', 'quads', 'triceps', 'back'].map((m) => fills(m)[0]);
  expect(new Set(tiers).size).toBe(5);
  // Untrained muscles are outlined, not filled with the ramp.
  const hamstrings = screen.getAllByTestId('muscle-hamstrings', { includeHiddenElements: true })[0];
  expect(hamstrings.props.strokeDasharray).toBeTruthy();
  expect(screen.getAllByTestId('muscle-back', { includeHiddenElements: true })[0].props.strokeDasharray).toBeFalsy();
  // The body under the muscles, and the head.
  expect(allOfType('RNSVGEllipse')).toHaveLength(2);
});

test('tapping a muscle on a figure picks its row, and tapping again lets go', async () => {
  await render(<BodyMap muscles={muscles} span="the last 3 months" />);
  const row = () => screen.getByRole('button', { name: /^Chest/ });
  const chest = () => screen.getAllByTestId('muscle-chest', { includeHiddenElements: true })[0];
  expect(row().props.accessibilityState.selected).toBe(false);
  await fireEvent.press(chest());
  expect(row().props.accessibilityState.selected).toBe(true);
  expect(Number(chest().props.strokeWidth)).toBe(2);
  await fireEvent.press(row());
  expect(row().props.accessibilityState.selected).toBe(false);
});
