import AsyncStorage from '@react-native-async-storage/async-storage';
import { screen, userEvent, within } from '@testing-library/react-native';
import { router } from 'expo-router';

import type { PlannedSession, PlanToday, Workout } from '@/api/types';
import WeekScreen from '@/app/(tabs)/(workout)/week';
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

/** The card of a day, found by its heading. */
const day = (heading: string) => screen.getByLabelText(heading);

beforeEach(async () => {
  await AsyncStorage.clear();
});
afterEach(() => jest.useRealTimers());

test('on a weekday it shows this week, Monday to Sunday', async () => {
  setNow('2026-10-14T09:00:00+02:00');
  const requests = server([run]);
  await selectPlan(1);
  await renderInApp(<WeekScreen />);

  expect(await screen.findByText('12 Oct – 18 Oct · Strength')).toBeOnTheScreen();
  for (const heading of ['Monday 12 Oct', 'Wednesday 14 Oct', 'Sunday 18 Oct']) {
    expect(screen.getByText(heading)).toBeOnTheScreen();
  }
  expect(within(day('Wednesday 14 Oct')).getByText('Today')).toBeOnTheScreen();
  expect(within(day('Wednesday 14 Oct')).getByText(/Easy run 5 km/)).toBeOnTheScreen();
  expect(within(day('Tuesday 13 Oct')).getByText('Rest day')).toBeOnTheScreen();

  const sessions = requests.find((r) => r.path === '/api/goals/sessions')!;
  expect(Object.fromEntries(sessions.query)).toEqual({
    id: '7',
    date: '2026-10-14',
    from: '2026-10-12',
    to: '2026-10-18',
  });
});

test('on Sunday it shows next week with the plan’s targets', async () => {
  setNow('2026-10-18T09:00:00+02:00');
  server();
  await selectPlan(1);
  await renderInApp(<WeekScreen />);

  expect(await screen.findByText('19 Oct – 25 Oct · Strength')).toBeOnTheScreen();
  expect(screen.queryByText('Sunday 18 Oct')).toBeNull();
  expect(within(day('Monday 19 Oct')).getByText('Squat')).toBeOnTheScreen();
  expect(within(day('Monday 19 Oct')).getByText('1 × 5 @ 100 kg')).toBeOnTheScreen();
  expect(screen.queryByText('Today')).toBeNull();
});

test('a logged day shows what was done and opens it in History', async () => {
  setNow('2026-10-14T09:00:00+02:00');
  server();
  await selectPlan(1);
  const user = userEvent.setup();
  await renderInApp(<WeekScreen />);

  const monday = await screen.findByRole('button', { name: 'Monday 12 Oct' });
  expect(within(monday).getByText('Logged ✓')).toBeOnTheScreen();
  expect(within(monday).getByText('1 × 5 @ 97.5 kg')).toBeOnTheScreen();

  await user.press(monday);
  expect(router.navigate).toHaveBeenCalledWith({ pathname: '/history/[id]', params: { id: 42 } }, { withAnchor: true });
});

test('a past day left undone is marked as not logged', async () => {
  setNow('2026-10-20T09:00:00+02:00');
  mockServer({
    'GET /api/plans': [plan],
    'GET /api/plans/today': (r: Request) => ({ ...planDay(r), workout: undefined }),
    'GET /api/goals': [],
  });
  await selectPlan(1);
  await renderInApp(<WeekScreen />);

  expect(await screen.findByText('Monday 19 Oct')).toBeOnTheScreen();
  expect(within(day('Monday 19 Oct')).getByText('Not logged')).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: 'Monday 19 Oct' })).toBeNull();
});

test('without a plan or goal it says there is nothing scheduled', async () => {
  setNow('2026-10-14T09:00:00+02:00');
  mockServer({ 'GET /api/plans': [plan], 'GET /api/goals': [] });
  await selectPlan(null);
  await renderInApp(<WeekScreen />);

  expect(await screen.findByText('Nothing scheduled')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Choose plan' })).toBeOnTheScreen();
});
