import AsyncStorage from '@react-native-async-storage/async-storage';
import { screen, userEvent } from '@testing-library/react-native';
import { router } from 'expo-router';

import type { CardioWorkout, Workout } from '@/api/types';
import HistoryScreen from '@/app/(tabs)/history/index';
import { mockAlerts, mockServer, renderInApp, selectPlan, SERVER, setNow, type Request } from '@/test-utils';

const lift: Workout = {
  id: 1,
  date: '2026-10-16',
  plan_id: 2,
  exercises: [
    {
      name: 'Squat',
      sets: [
        { weight: 100, reps: 5 },
        { weight: 100, reps: 5 },
      ],
    },
  ],
};
const run: CardioWorkout = {
  id: 1,
  date: '2026-10-17',
  started_at: '2026-10-17T07:00:00+02:00',
  activity: 'running',
  duration_seconds: 3000,
  distance_m: 10000,
  source_uuid: 'health-run',
};

/** Those of `list` within the request's from and to, or all of them. */
const within = <T extends { date: string }>(list: T[], { query }: Request) =>
  list.filter((w) => w.date >= (query.get('from') ?? '') && w.date <= (query.get('to') ?? '9999'));

/** A server holding `workouts` and `cardio`, deleting from them as asked. */
function server(workouts: Workout[] = [lift], cardio: CardioWorkout[] = [run]) {
  return mockServer({
    'GET /api/workouts': (req: Request) => within(workouts, req),
    'GET /api/cardio': (req: Request) => within(cardio, req),
    'GET /api/history': () => ({
      oldest: [...workouts, ...cardio].map((w) => w.date).sort()[0] ?? null,
    }),
    'GET /api/plans': [{ id: 2, name: 'Strength', days: [] }],
    'DELETE /api/workouts': ({ query }: Request) => {
      workouts = workouts.filter((w) => w.id !== Number(query.get('id')));
      return { success: true };
    },
    'DELETE /api/cardio': ({ query }: Request) => {
      cardio = cardio.filter((w) => w.id !== Number(query.get('id')));
      return { success: true };
    },
  });
}

beforeEach(async () => {
  jest.clearAllMocks();
  setNow('2026-10-20T12:00:00+02:00');
  await AsyncStorage.clear();
  await selectPlan(null);
});

test('lifting and cardio are listed together, newest day first', async () => {
  server();
  await renderInApp(<HistoryScreen />);
  const days = await screen.findAllByText(/^(Fri|Sat), 1[67] Oct 2026$/);
  expect(days.map((d) => d.props.children)).toEqual(['Sat, 17 Oct 2026', 'Fri, 16 Oct 2026']);
  expect(screen.getByText('🏃 Run')).toBeOnTheScreen();
  expect(screen.getByText('10.0 km · 50:00 · 5:00/km')).toBeOnTheScreen();
  expect(screen.getByText('Strength')).toBeOnTheScreen();
  expect(screen.getByText('2 × 5 @ 100 kg')).toBeOnTheScreen();
  expect(screen.getByText('1,000 kg')).toBeOnTheScreen();
});

test('with nothing logged it points to Today', async () => {
  server([], []);
  await renderInApp(<HistoryScreen />);
  expect(await screen.findByText('No workouts yet. Log one from the Today tab.')).toBeOnTheScreen();
});

test('a server error is shown', async () => {
  mockServer({});
  await renderInApp(<HistoryScreen />);
  expect(await screen.findByText('No route for GET /api/workouts')).toBeOnTheScreen();
});

test('tapping a workout opens it', async () => {
  server();
  const user = userEvent.setup();
  await renderInApp(<HistoryScreen />);
  await user.press(await screen.findByText('Squat'));
  expect(router.push).toHaveBeenCalledWith({ pathname: '/history/[id]', params: { id: 1 } });
});

test('deleting a lifting workout asks first, then removes it', async () => {
  const requests = server();
  const alerts = mockAlerts();
  const user = userEvent.setup();
  await renderInApp(<HistoryScreen />);
  await user.longPress(await screen.findByText('Squat'));
  expect(alerts.latest().title).toBe('Delete workout?');

  await alerts.press('Cancel');
  expect(requests.some((r) => r.method === 'DELETE')).toBe(false);

  await user.longPress(screen.getByText('Squat'));
  await alerts.press('Delete');
  expect(await screen.findByText('🏃 Run')).toBeOnTheScreen();
  expect(screen.queryByText('Squat')).not.toBeOnTheScreen();
  expect(requests.find((r) => r.method === 'DELETE')?.path).toBe('/api/workouts');
});

test('a deleted Health workout isn’t offered for import again', async () => {
  server();
  const alerts = mockAlerts();
  const user = userEvent.setup();
  await renderInApp(<HistoryScreen />);
  await user.longPress(await screen.findByText('🏃 Run'));
  expect(alerts.latest().message).toBe("It stays in Apple Health but won't be offered for import again.");
  await alerts.press('Delete');
  await screen.findByText('Squat');
  expect(screen.queryByText('🏃 Run')).not.toBeOnTheScreen();
  const health = JSON.parse((await AsyncStorage.getItem(`trucker.health:${SERVER}`))!);
  expect(health.dismissed).toEqual(['health-run']);
});

test('a failed delete says why and keeps the workout', async () => {
  mockServer({
    'GET /api/workouts': [lift],
    'GET /api/cardio': [],
    'GET /api/history': { oldest: lift.date },
    'GET /api/plans': [],
  });
  const alerts = mockAlerts();
  const user = userEvent.setup();
  await renderInApp(<HistoryScreen />);
  await user.longPress(await screen.findByText('Squat'));
  await alerts.press('Delete');
  expect(alerts.latest().title).toBe("Couldn't delete workout");
  expect(screen.getByText('Squat')).toBeOnTheScreen();
});

afterEach(() => jest.useRealTimers());

const september: Workout = { ...lift, id: 2, date: '2026-09-03', exercises: [{ name: 'Deadlift', sets: [] }] };

test('only this month is loaded', async () => {
  const requests = server([lift, september]);
  await renderInApp(<HistoryScreen />);
  expect(await screen.findByText('Squat')).toBeOnTheScreen();
  expect(screen.getByText('October 2026')).toBeOnTheScreen();
  expect(screen.queryByText('Deadlift')).not.toBeOnTheScreen();
  for (const path of ['/api/workouts', '/api/cardio']) {
    const query = requests.find((r) => r.path === path)!.query;
    expect([query.get('from'), query.get('to')]).toEqual(['2026-10-01', '2026-10-31']);
  }
});

test('earlier months go back as far as the oldest workout', async () => {
  server([lift, september], []);
  const user = userEvent.setup();
  await renderInApp(<HistoryScreen />);
  await screen.findByText('Squat');
  expect(screen.getByRole('button', { name: 'Next month' })).toBeDisabled();

  await user.press(screen.getByRole('button', { name: 'Previous month' }));
  expect(await screen.findByText('Deadlift')).toBeOnTheScreen();
  expect(screen.getByText('September 2026')).toBeOnTheScreen();
  expect(screen.queryByText('Squat')).not.toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Previous month' })).toBeDisabled();

  await user.press(screen.getByRole('button', { name: 'Next month' }));
  expect(await screen.findByText('Squat')).toBeOnTheScreen();
});

test('a month without workouts says so', async () => {
  server([september], []);
  await renderInApp(<HistoryScreen />);
  expect(await screen.findByText('No workouts in October 2026.')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Previous month' })).toBeEnabled();
});

test('picking a day on the calendar shows only its workouts', async () => {
  server();
  const user = userEvent.setup();
  await renderInApp(<HistoryScreen />);
  await screen.findByText('Squat');
  // Days without workouts can't be picked.
  expect(screen.getByRole('button', { name: 'Sun, 18 Oct 2026' })).toBeDisabled();

  await user.press(screen.getByRole('button', { name: 'Fri, 16 Oct 2026' }));
  expect(screen.queryByText('🏃 Run')).not.toBeOnTheScreen();
  expect(screen.getByText('Squat')).toBeOnTheScreen();

  // Pressed again, the whole month is back.
  await user.press(screen.getByRole('button', { name: 'Fri, 16 Oct 2026' }));
  expect(screen.getByText('🏃 Run')).toBeOnTheScreen();
});

test('deleting the last workout of a picked day shows the rest of the month', async () => {
  server();
  const alerts = mockAlerts();
  const user = userEvent.setup();
  await renderInApp(<HistoryScreen />);
  await user.press(await screen.findByRole('button', { name: 'Fri, 16 Oct 2026' }));
  await user.longPress(screen.getByText('Squat'));
  await alerts.press('Delete');
  expect(await screen.findByText('🏃 Run')).toBeOnTheScreen();
});
