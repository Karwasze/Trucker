import AsyncStorage from '@react-native-async-storage/async-storage';
import { screen, userEvent, within } from '@testing-library/react-native';
import { router } from 'expo-router';

import type { PlannedSession, PlanToday, Workout } from '@/api/types';
import WeekScreen from '@/app/(tabs)/week/index';
import { mockServer, renderInApp, selectPlan, setNow, type Request } from '@/test-utils';

const plan = { id: 1, name: 'Strength', days: [] };
const goal = { id: 7, name: 'Half marathon', active: true };

const squat = { name: 'Squat', sets: [{ weight: 100, reps: 5 }] };
const logged: Workout = {
  id: 42,
  date: '2026-10-12',
  exercises: [{ name: 'Squat', sets: [{ weight: 97.5, reps: 5 }] }],
};

const run: PlannedSession = {
  id: 3,
  goal_id: 7,
  date: '2026-10-14',
  activity: 'running',
  kind: 'easy',
  phase: 'base',
  intensity: 'easy',
  description: 'Easy run 5 km',
};

/** Squats on Mondays, logged on 12 Oct, rest on other days. */
function planDay({ query }: Request): PlanToday {
  const date = query.get('date')!;
  const monday = new Date(`${date}T12:00:00`).getDay() === 1;
  return {
    plan_id: 1,
    date,
    weekday: monday ? 'monday' : 'tuesday',
    exercises: monday ? [squat] : [],
    workout: date === logged.date ? logged : undefined,
  };
}

function server(sessions: PlannedSession[] = []) {
  return mockServer({
    'GET /api/plans': [plan],
    'GET /api/plans/today': planDay,
    'GET /api/goals': [goal],
    'GET /api/goals/sessions': sessions,
  });
}

/** A day's line in the week, found by its day and status. */
const line = (name: string) => screen.getByRole('button', { name });
const lineNames = () =>
  screen.getAllByRole('button', { name: /^\w+day \d+ Oct, / }).map((l) => l.props.accessibilityLabel);

beforeEach(async () => {
  await AsyncStorage.clear();
});
afterEach(() => jest.useRealTimers());

test('on a weekday it shows a line for each day of this week, with what it holds', async () => {
  setNow('2026-10-14T09:00:00+02:00');
  const requests = server([run]);
  await selectPlan(1);
  await renderInApp(<WeekScreen />);

  expect(await screen.findByText('12 Oct – 18 Oct · Strength')).toBeOnTheScreen();
  expect(lineNames()).toEqual([
    'Monday 12 Oct, done',
    'Tuesday 13 Oct, rest day',
    'Wednesday 14 Oct, planned',
    'Thursday 15 Oct, rest day',
    'Friday 16 Oct, rest day',
    'Saturday 17 Oct, rest day',
    'Sunday 18 Oct, rest day',
  ]);
  expect(within(line('Monday 12 Oct, done')).getByText('Squat')).toBeOnTheScreen();
  expect(within(line('Tuesday 13 Oct, rest day')).getByText('Rest')).toBeOnTheScreen();
  expect(within(line('Wednesday 14 Oct, planned')).getByText('🏃 Easy run 5 km')).toBeOnTheScreen();
  // Details only once a day is opened.
  expect(screen.queryByText('1 × 5 @ 97.5 kg')).toBeNull();

  const sessions = requests.find((r) => r.path === '/api/goals/sessions')!;
  expect(Object.fromEntries(sessions.query)).toEqual({
    id: '7',
    date: '2026-10-14',
    from: '2026-10-12',
    to: '2026-10-18',
  });
});

test('a day with lifting and a session lists both on its line', async () => {
  setNow('2026-10-14T09:00:00+02:00');
  server([{ ...run, date: '2026-10-12' }]);
  await selectPlan(1);
  await renderInApp(<WeekScreen />);

  expect(await screen.findByText('Squat · 🏃 Easy run 5 km')).toBeOnTheScreen();
});

test('a long day wraps onto more lines rather than being cut off', async () => {
  setNow('2026-10-14T09:00:00+02:00');
  server([{ ...run, date: '2026-10-12' }]);
  await selectPlan(1);
  await renderInApp(<WeekScreen />);

  expect((await screen.findByText('Squat · 🏃 Easy run 5 km')).props.numberOfLines).toBeUndefined();
});

test('pressing a day opens its details, one day at a time', async () => {
  setNow('2026-10-14T09:00:00+02:00');
  server([run]);
  await selectPlan(1);
  const user = userEvent.setup();
  await renderInApp(<WeekScreen />);

  await user.press(await screen.findByRole('button', { name: 'Monday 12 Oct, done' }));
  expect(line('Monday 12 Oct, done')).toBeExpanded();
  expect(screen.getByText('1 × 5 @ 97.5 kg')).toBeOnTheScreen();

  await user.press(line('Tuesday 13 Oct, rest day'));
  expect(line('Monday 12 Oct, done')).toBeCollapsed();
  expect(screen.queryByText('1 × 5 @ 97.5 kg')).toBeNull();
  expect(screen.getByText('Nothing planned')).toBeOnTheScreen();

  await user.press(line('Tuesday 13 Oct, rest day'));
  expect(screen.queryByText('Nothing planned')).toBeNull();
});

test('on Sunday it still shows this week, ending today', async () => {
  setNow('2026-10-18T09:00:00+02:00');
  server();
  await selectPlan(1);
  await renderInApp(<WeekScreen />);

  expect(await screen.findByText('12 Oct – 18 Oct · Strength')).toBeOnTheScreen();
  expect(lineNames().at(-1)).toBe('Sunday 18 Oct, rest day');
  expect(screen.queryByRole('button', { name: /Monday 19 Oct/ })).toBeNull();
});

test('it counts the week’s trainings done, lifting and goal sessions together', async () => {
  setNow('2026-10-14T09:00:00+02:00');
  const done = { ...run, id: 4, date: '2026-10-13', cardio_workout_id: 9 };
  server([run, done]);
  await selectPlan(1);
  await renderInApp(<WeekScreen />);

  // Monday's squats are logged and Tuesday's run is done; Wednesday's run isn't yet.
  expect(await screen.findByText('2 of 3 trainings done')).toBeOnTheScreen();
  expect(screen.getByRole('progressbar', { name: '2 of 3 trainings done' })).toBeOnTheScreen();
});

test('one training reads in the singular', async () => {
  setNow('2026-10-14T09:00:00+02:00');
  server();
  await selectPlan(1);
  await renderInApp(<WeekScreen />);
  expect(await screen.findByText('1 of 1 training done')).toBeOnTheScreen();
});

test('a logged day shows what was done and opens it on top of the week', async () => {
  setNow('2026-10-14T09:00:00+02:00');
  server();
  await selectPlan(1);
  const user = userEvent.setup();
  await renderInApp(<WeekScreen />);

  await user.press(await screen.findByRole('button', { name: 'Monday 12 Oct, done' }));
  const workout = screen.getByRole('button', { name: 'Workout on Monday 12 Oct' });
  expect(within(workout).getByText('Logged ✓')).toBeOnTheScreen();
  expect(within(workout).getByText('1 × 5 @ 97.5 kg')).toBeOnTheScreen();

  await user.press(workout);
  expect(router.push).toHaveBeenCalledWith({ pathname: '/week/workout/[id]', params: { id: 42 } });
});

test('a goal session done shows its time and opens its workout on top of the week', async () => {
  setNow('2026-10-14T09:00:00+02:00');
  // Run on Monday, counting as Tuesday's session.
  const done: PlannedSession = {
    ...run,
    id: 4,
    date: '2026-10-13',
    cardio_workout_id: 9,
    workout: {
      id: 9,
      date: '2026-10-12',
      started_at: '2026-10-12T07:00:00+02:00',
      activity: 'running',
      distance_m: 5000,
      duration_seconds: 1800,
    },
  };
  server([run, done]);
  await selectPlan(1);
  const user = userEvent.setup();
  await renderInApp(<WeekScreen />);

  await user.press(await screen.findByRole('button', { name: 'Tuesday 13 Oct, done' }));
  expect(within(line('Tuesday 13 Oct, done')).getByText('🏃 Easy run 5 km · 30:00')).toBeOnTheScreen();
  await user.press(screen.getByRole('button', { name: 'Easy run 5 km, done' }));
  expect(router.push).toHaveBeenCalledWith({ pathname: '/week/cardio/[id]', params: { id: 9 } });

  // Wednesday's run isn't done yet, so there's nothing to open.
  await user.press(line('Wednesday 14 Oct, planned'));
  expect(screen.queryByRole('button', { name: /Easy run 5 km, done/ })).toBeNull();
});

test('a past day left undone is marked as missed', async () => {
  setNow('2026-10-20T09:00:00+02:00');
  mockServer({
    'GET /api/plans': [plan],
    'GET /api/plans/today': (r: Request) => ({ ...planDay(r), workout: undefined }),
    'GET /api/goals': [],
  });
  await selectPlan(1);
  const user = userEvent.setup();
  await renderInApp(<WeekScreen />);

  await user.press(await screen.findByRole('button', { name: 'Monday 19 Oct, missed' }));
  expect(screen.getByText('Not logged')).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: /^Workout on/ })).toBeNull();
});

test('without a plan or goal it says there is nothing scheduled', async () => {
  setNow('2026-10-14T09:00:00+02:00');
  mockServer({ 'GET /api/plans': [plan], 'GET /api/goals': [] });
  await selectPlan(null);
  await renderInApp(<WeekScreen />);

  expect(await screen.findByText('Nothing scheduled')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Choose plan' })).toBeOnTheScreen();
});
