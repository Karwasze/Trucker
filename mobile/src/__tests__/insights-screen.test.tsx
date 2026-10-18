import AsyncStorage from '@react-native-async-storage/async-storage';
import { screen, userEvent } from '@testing-library/react-native';
import { router } from 'expo-router';

import type { Goal, Insights } from '@/api/types';
import InsightsScreen from '@/app/(tabs)/insights';
import { mockServer, renderInApp, selectPlan, setNow, type Request } from '@/test-utils';

const TODAY = '2026-10-18';

const empty: Insights = {
  date: TODAY,
  bodyweight: null,
  sessions_per_week: 0,
  muscles: [],
  adherence: null,
  stalls: [],
  progression: [],
  tonnage: { total: 0, weekly: [], by_exercise: [] },
  strength: [],
  untagged: [],
  cardio: [],
  goal: null,
  triathlon: null,
};

const full: Insights = {
  ...empty,
  bodyweight: { latest: 82, change: 0 } as unknown as Insights['bodyweight'],
  adherence: {
    plan: 'Strength',
    since: '2026-09-01',
    scheduled: 20,
    completed: 15,
    extra: 1,
    streak: 3,
    missed: ['2026-10-16', '2026-10-14', '2026-10-09', '2026-10-07', '2026-10-02', '2026-09-30'],
  },
  stalls: [
    { exercise: 'Bench Press', status: 'missing', weight: 80, misses: 2, date: '2026-10-16', deload_next: true },
    { exercise: 'Pull-up', status: 'deloaded', weight: 0, misses: 3, date: '2026-10-02' },
  ],
  progression: [
    {
      exercise: 'Squat',
      sessions: 6,
      first_1rm: 100,
      first_date: '2026-09-01',
      best_1rm: 120,
      best_date: '2026-10-16',
      latest_1rm: 110,
      per_month: 5,
      record_1rm: 120,
      record_date: '2026-10-16',
      prs: 2,
    },
  ],
  tonnage: {
    total: 12000,
    weekly: [
      { week: '2026-10-05', tonnage: 5000 },
      { week: '2026-10-12', tonnage: 7000 },
    ],
    by_exercise: [{ exercise: 'Squat', tonnage: 12000 }],
  },
  strength: [
    { exercise: 'Squat', best_1rm: 120, ratio: 1.46, level: 'intermediate', next_level: 'advanced', next_level_kg: 25 },
  ],
  untagged: ['Farmer Carry'],
  cardio: [{ activity: 'cycling', sessions: 1, distance_m: 45200, duration_seconds: 8178, weekly_distance_m: 45200 }],
  goal: {
    goal: { id: 3, name: 'Marathon', race_date: '2027-04-11', active: true, run_m: 42195 } as Goal,
    weeks_to_race: 25,
    phase: 'base',
    met: 2,
    partial: 1,
    missed: 0,
    pending: 2,
    planned_m: { running: 30000 },
    done_m: { running: 12500 },
    threshold: { running: 1000 / 270 },
  },
};

beforeEach(async () => {
  jest.clearAllMocks();
  setNow(`${TODAY}T09:00:00+02:00`);
  await AsyncStorage.clear();
});
afterEach(() => jest.useRealTimers());

test('with nothing logged each section says what to do', async () => {
  mockServer({ 'GET /api/insights': empty });
  await selectPlan(null);
  await renderInApp(<InsightsScreen />);
  expect(
    await screen.findByText('Pick a plan on the Plans tab to track adherence and stalled lifts.')
  ).toBeOnTheScreen();
  // Over all time there's no "last" period to name.
  expect(screen.getAllByText('No workouts.')).toHaveLength(2);
  expect(screen.queryByText(/From beginning/)).not.toBeOnTheScreen();
  expect(screen.getByText(/import your bodyweight and see how strong/)).toBeOnTheScreen();
});

test('adherence, stalls, progression, tonnage, cardio and strength are summarised', async () => {
  mockServer({ 'GET /api/insights': full });
  await selectPlan(1);
  await renderInApp(<InsightsScreen />);

  expect(await screen.findByText('15 / 20')).toBeOnTheScreen();
  expect(screen.getByText('75%')).toBeOnTheScreen();
  expect(screen.getByText('Strength since 1 Sept · 1 extra session')).toBeOnTheScreen();
  expect(screen.getByText('Missed 16 Oct, 14 Oct, 9 Oct, 7 Oct, 2 Oct and 1 more')).toBeOnTheScreen();

  expect(screen.getByText('2 misses at 80 kg')).toBeOnTheScreen();
  expect(screen.getByText('Last on 16 Oct · deloads next session')).toBeOnTheScreen();
  expect(screen.getByText('After 3 misses at bodyweight on 2 Oct')).toBeOnTheScreen();

  expect(screen.getByText('▲ 10 kg (10%)')).toBeOnTheScreen();
  expect(screen.getByText('92% of record')).toBeOnTheScreen();
  expect(screen.getByText('+5 kg')).toBeOnTheScreen();

  expect(screen.getByText('Latest · Week of 12 Oct – 18 Oct')).toBeOnTheScreen();
  expect(screen.getByText('🚴 Ride · 1 session')).toBeOnTheScreen();
  expect(screen.getByText('Intermediate')).toBeOnTheScreen();
  expect(screen.getByText('120 kg est. 1RM · 1.46× BW · +25 kg to advanced')).toBeOnTheScreen();
  expect(screen.getByText('Farmer Carry')).toBeOnTheScreen();

  expect(screen.getByText('Base · 25 weeks to race day')).toBeOnTheScreen();
  expect(screen.getByText('🏃 12.5 km of 30.0 km this week')).toBeOnTheScreen();
  expect(screen.getByText('Threshold: 🏃 4:30/km')).toBeOnTheScreen();
});

test('changing the timespan asks for insights from its start', async () => {
  const requests = mockServer({ 'GET /api/insights': empty });
  await selectPlan(2);
  const user = userEvent.setup();
  await renderInApp(<InsightsScreen />);
  await screen.findAllByText('No workouts.');
  expect(requests.at(-1)?.query.get('from')).toBeNull();
  expect(requests.at(-1)?.query.get('plan_id')).toBe('2');

  await user.press(screen.getByRole('tab', { name: '3 months' }));
  await screen.findByText('No weighted plan lifts in the last 3 months.');
  expect(screen.getByText('Nothing lifted in the last 3 months.')).toBeOnTheScreen();
  expect((requests.at(-1) as Request).query.get('from')).toBe('2026-07-18');
});

test('tapping a lift or an activity opens its chart on Progress with the same timespan', async () => {
  mockServer({ 'GET /api/insights': full });
  await selectPlan(1);
  const user = userEvent.setup();
  await renderInApp(<InsightsScreen />);
  await user.press(await screen.findByRole('button', { name: /Squat/ }));
  expect(router.navigate).toHaveBeenLastCalledWith({ pathname: '/stats', params: { exercise: 'Squat', span: 'all' } });
  await user.press(screen.getByText('🚴 Ride · 1 session'));
  expect(router.navigate).toHaveBeenLastCalledWith({
    pathname: '/stats',
    params: { activity: 'cycling', span: 'all' },
  });
});
