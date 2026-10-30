import { render, screen } from '@testing-library/react-native';
import { useState } from 'react';

import type { CardioWorkout } from '@/api/types';
import { TIMESPANS, TimespanCarousel, type Timespan } from '@/components/timespan';
import { CardioStats } from '@/progress/cardio-stats';
import { allOfType, layout, setNow, turnCarousel } from '@/test-utils';

const ride = (id: number, date: string, km: number, minutes: number): CardioWorkout => ({
  id,
  date,
  started_at: `${date}T10:00:00+02:00`,
  activity: 'cycling',
  duration_seconds: minutes * 60,
  distance_m: km * 1000,
});

/** CardioStats as the Progress tab uses it, with the timespan switchable. */
function Harness({ workouts, initial = TIMESPANS[0] }: { workouts: CardioWorkout[]; initial?: Timespan }) {
  const [timespan, setTimespan] = useState<Timespan>(initial);
  return (
    <>
      <CardioStats activity="cycling" workouts={workouts} timespan={timespan} />
      <TimespanCarousel value={timespan} onChange={setTimespan} />
    </>
  );
}

// Sunday 18 Oct 2026, the day the weekly chart bug was reported.
beforeEach(() => setNow('2026-10-18T17:26:00+02:00'));
afterEach(() => jest.useRealTimers());

test('totals cover the sessions in the timespan', async () => {
  await render(<Harness workouts={[ride(1, '2026-10-17', 45.2, 136.3)]} />);
  expect(screen.getByText('1')).toBeOnTheScreen();
  // Each figure shows on its tile, in its chart's readout and on the session's row.
  expect(screen.getAllByText('45.2 km')).toHaveLength(3);
  expect(screen.getAllByText('19.9 km/h')).toHaveLength(3);
});

// Regression: a ride on Saturday read out as "Mon, 12 Oct 2026" under every timespan but All.
test('weekly distance names the ride’s week under every timespan, never a single day', async () => {
  await render(<Harness workouts={[ride(1, '2026-10-17', 45.2, 136.3)]} />);
  for (const span of TIMESPANS) {
    await turnCarousel('Timespan', span.key === 'all' ? 'All time' : span.label);
    expect(screen.getByText('Latest · Week of 12 Oct – 18 Oct')).toBeOnTheScreen();
    expect(screen.queryByText(/Mon, 12 Oct/)).not.toBeOnTheScreen();
  }
});

test('under All with one session, its week fills the weekly chart', async () => {
  await render(<Harness workouts={[ride(1, '2026-10-17', 45.2, 136.3)]} />);
  await layout(screen.getByLabelText(/per week chart/), 40 + 70);
  const [bar] = allOfType('RNSVGRect');
  // The only week spans the whole 70 px plot; its bar is centred in it.
  expect(Number(bar.props.x) + Number(bar.props.width) / 2).toBeCloseTo(40 + 35, 5);
});

test('rides in the same week add up to one bar', async () => {
  await render(<Harness workouts={[ride(1, '2026-10-13', 20, 60), ride(2, '2026-10-17', 25, 75)]} />);
  // On the Distance tile and in the weekly readout.
  expect(screen.getAllByText('45.0 km')).toHaveLength(2);
  await layout(screen.getByLabelText(/per week chart/), 300);
  expect(allOfType('RNSVGRect')).toHaveLength(1);
});

test('the speed chart plots each ride on its own day', async () => {
  await render(<Harness workouts={[ride(1, '2026-10-17', 45.2, 136.3)]} />);
  expect(screen.getByText('Latest · Sat, 17 Oct 2026')).toBeOnTheScreen();
});

test('sessions older than the timespan are left out', async () => {
  await render(
    <Harness workouts={[ride(1, '2026-08-01', 30, 90), ride(2, '2026-10-17', 45.2, 136.3)]} initial={TIMESPANS[4]} />
  );
  expect(screen.getByText('1')).toBeOnTheScreen();
  expect(screen.queryByText('1 Aug 2026', { exact: false })).not.toBeOnTheScreen();
});

test('an empty timespan says so', async () => {
  await render(<Harness workouts={[ride(1, '2026-08-01', 30, 90)]} initial={TIMESPANS[4]} />);
  expect(screen.getByText('No sessions in the last 1 month.')).toBeOnTheScreen();
});
