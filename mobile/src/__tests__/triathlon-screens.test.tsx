import AsyncStorage from '@react-native-async-storage/async-storage';
import { screen, userEvent } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';

import type { CardioWorkout, Insights, Triathlon } from '@/api/types';
import HistoryScreen from '@/app/(tabs)/history/index';
import TriathlonDetailScreen from '@/app/(tabs)/history/triathlon/[date]';
import ProgressScreen from '@/app/(tabs)/stats/index';
import { CardioInsights, InsightsProvider, InsightsTimespan } from '@/insights/insights-view';
import { ProgressProvider } from '@/progress/progress-context';
import { mockServer, renderInApp, selectPlan, setNow, turnCarousel } from '@/test-utils';

const leg = (id: number, activity: CardioWorkout['activity'], distance_m: number, duration_seconds: number) => ({
  id,
  date: '2026-10-17',
  started_at: `2026-10-17T0${id}:00:00+02:00`,
  activity,
  duration_seconds,
  distance_m,
});
const cardio: CardioWorkout[] = [
  leg(4, 'walking', 3000, 2000),
  leg(3, 'running', 10500, 3900),
  leg(2, 'cycling', 45000, 4500),
  leg(1, 'swimming', 950, 1800),
];

const tri = (date: string, total: number, overrides: Partial<Triathlon> = {}): Triathlon => ({
  date,
  class: 'quarter',
  swim: { workout_ids: [1], distance_m: 950, duration_seconds: 1800 },
  bike: { workout_ids: [2], distance_m: 45000, duration_seconds: 4500 },
  run: { workout_ids: [3], distance_m: 10500, duration_seconds: total - 6300 },
  total_seconds: total,
  pr: false,
  ...overrides,
});
const latest = tri('2026-10-17', 10200);
const best = tri('2026-09-12', 9100, {
  swim: { workout_ids: [11], distance_m: 950, duration_seconds: 1700 },
  bike: { workout_ids: [12], distance_m: 45000, duration_seconds: 4500 },
  run: { workout_ids: [13], distance_m: 10500, duration_seconds: 2900 },
  pr: true,
});
const sprint = tri('2026-09-26', 4800, {
  class: 'sprint',
  swim: { workout_ids: [21], distance_m: 750, duration_seconds: 900 },
  bike: { workout_ids: [22], distance_m: 20000, duration_seconds: 2400 },
  run: { workout_ids: [23], distance_m: 5000, duration_seconds: 1500 },
  pr: true,
});

function server(triathlons: Triathlon[] = [latest, sprint, best], insights: Partial<Insights> = {}) {
  return mockServer({
    'GET /api/workouts': [],
    'GET /api/plans': [],
    'GET /api/cardio': cardio,
    'GET /api/triathlons': triathlons,
    'GET /api/statistics': { exercises: ['Squat'], data: [] },
    'GET /api/insights': { date: '2026-10-18', ...insights },
  });
}

beforeEach(async () => {
  jest.clearAllMocks();
  setNow('2026-10-18T12:00:00+02:00');
  await AsyncStorage.clear();
  await selectPlan(null);
  jest.mocked(useLocalSearchParams).mockReturnValue({});
});
afterEach(() => jest.useRealTimers());

test('History shows a triathlon’s legs as one card, leaving other workouts apart', async () => {
  server([latest]);
  const user = userEvent.setup();
  await renderInApp(<HistoryScreen />);
  expect(await screen.findByText('🏊🚴🏃 Quarter triathlon')).toBeOnTheScreen();
  expect(screen.getByText('🏊 30:00 · 🚴 1:15:00 · 🏃 1:05:00')).toBeOnTheScreen();
  expect(screen.getByText('2:50:00')).toBeOnTheScreen();
  // The walk that day stays its own card; the legs don't.
  expect(screen.getByText('🚶 Walk')).toBeOnTheScreen();
  expect(screen.queryByText('🏃 Run')).toBeNull();
  await user.press(screen.getByText('🏊🚴🏃 Quarter triathlon'));
  expect(router.push).toHaveBeenCalledWith(
    expect.objectContaining({ pathname: '/history/triathlon/[date]', params: { date: '2026-10-17' } })
  );
});

test('the triathlon screen compares the total to the class record and splits it by leg', async () => {
  jest.mocked(useLocalSearchParams).mockReturnValue({ date: '2026-10-17' });
  server();
  await renderInApp(<TriathlonDetailScreen />);
  expect(await screen.findByText('Quarter triathlon')).toBeOnTheScreen();
  expect(screen.getByText('Best · 12 Sept')).toBeOnTheScreen();
  expect(screen.getByText('+18:20')).toBeOnTheScreen();
  expect(screen.getByLabelText('Swim 18%, Ride 44%, Run 38%')).toBeOnTheScreen();
  expect(screen.getByText('10.5 km · 6:11/km')).toBeOnTheScreen();
  // Every leg's workout, but not the walk.
  expect(screen.getByText('950 m · 30:00 · 3:09/100 m')).toBeOnTheScreen();
  expect(screen.getByText('45.0 km · 1:15:00 · 36.0 km/h')).toBeOnTheScreen();
  expect(screen.getByText('10.5 km · 1:05:00 · 6:11/km')).toBeOnTheScreen();
  expect(screen.queryByText('🚶 Walk')).toBeNull();
});

test('Progress lists triathlons, one class at a time, opening on the latest’s', async () => {
  server();
  const user = userEvent.setup();
  await renderInApp(
    <ProgressProvider>
      <ProgressScreen />
    </ProgressProvider>
  );
  await screen.findByRole('adjustable', { name: 'Category' });
  await turnCarousel('Category', 'Cardio');
  await turnCarousel('Activity', 'Triathlon');
  await turnCarousel('Timespan', 'All time');
  expect(await screen.findByText('Total time · Quarter')).toBeOnTheScreen();
  expect(screen.getByText('Best')).toBeOnTheScreen();
  // In the Best tile and the best triathlon's card.
  expect(screen.getAllByText('2:31:40')).toHaveLength(2);
  expect(screen.queryByText('1:20:00')).toBeNull();

  await user.press(screen.getByRole('button', { name: 'Sprint' }));
  expect(screen.getByText('Total time · Sprint')).toBeOnTheScreen();
  expect(screen.getAllByText('1:20:00').length).toBeGreaterThan(0);
});

test('the Insights Cardio page shows the latest triathlon, the leg costing the most, pace trends and records', async () => {
  server([latest, sprint, best], {
    triathlon: {
      count: 3,
      latest,
      first: best,
      records: [sprint, best],
      share: { swim: 0.176, bike: 0.441, run: 0.382 },
      typical_share: { swim: 0.12, bike: 0.52, run: 0.36 },
      weakest: 'swim',
    },
  });
  const user = userEvent.setup();
  await renderInApp(
    <InsightsProvider>
      <CardioInsights />
      <InsightsTimespan />
    </InsightsProvider>
  );
  await turnCarousel('Timespan', 'All time');
  expect(await screen.findByText('Latest · Quarter triathlon · 17 Oct')).toBeOnTheScreen();
  expect(screen.getByText('+18:20 off your best')).toBeOnTheScreen();
  expect(screen.getByText('3 triathlons in total')).toBeOnTheScreen();
  expect(screen.getByText('typical 36%')).toBeOnTheScreen();
  expect(
    screen.getByText('Your swim takes 18% of your time, against a typical 12%: the leg with the most to gain.')
  ).toBeOnTheScreen();
  // The swim and the run got slower since the first.
  expect(screen.getByText('🏊 2:59/100 m → 3:09/100 m')).toBeOnTheScreen();
  expect(screen.getByText('▼ 5.6%')).toBeOnTheScreen();
  expect(screen.getByText('🏃 4:36/km → 6:11/km')).toBeOnTheScreen();
  expect(screen.getByText('Best times')).toBeOnTheScreen();
  expect(screen.getByText('Sprint')).toBeOnTheScreen();

  await user.press(screen.getByText('Latest · Quarter triathlon · 17 Oct'));
  expect(router.navigate).toHaveBeenCalledWith({
    pathname: '/stats',
    params: { series: 'triathlon', span: 'all' },
  });
});

test('opened from Insights, Progress shows triathlons', async () => {
  jest.mocked(useLocalSearchParams).mockReturnValue({ series: 'triathlon', span: 'all' });
  server();
  await renderInApp(
    <ProgressProvider>
      <ProgressScreen />
    </ProgressProvider>
  );
  expect(await screen.findByText('Total time · Quarter')).toBeOnTheScreen();
});

// Regression: a quarter Ironman was a custom distance, saying its times don't compare.
test('a quarter Ironman is its own class on Progress', async () => {
  jest.mocked(useLocalSearchParams).mockReturnValue({ series: 'triathlon', span: 'all' });
  server([
    tri('2026-10-17', 9000, {
      class: 'quarter',
      swim: { workout_ids: [1], distance_m: 950, duration_seconds: 1300 },
      bike: { workout_ids: [2], distance_m: 45000, duration_seconds: 5200 },
      run: { workout_ids: [3], distance_m: 10550, duration_seconds: 2500 },
      pr: true,
    }),
  ]);
  await renderInApp(
    <ProgressProvider>
      <ProgressScreen />
    </ProgressProvider>
  );
  expect(await screen.findByText('Total time · Quarter')).toBeOnTheScreen();
  expect(screen.getByText('🏊🚴🏃 Quarter triathlon')).toBeOnTheScreen();
  expect(screen.queryByText(/Custom distances differ/)).toBeNull();
});
