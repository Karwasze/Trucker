import AsyncStorage from '@react-native-async-storage/async-storage';
import { screen, userEvent } from '@testing-library/react-native';
import { router } from 'expo-router';

import type { CardioWorkout, Workout } from '@/api/types';
import HistoryScreen from '@/app/(tabs)/(training)/(lists)/history';
import { mockAlerts, mockServer, renderInApp, selectPlan, SERVER, type Request } from '@/test-utils';

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

/** A server holding `workouts` and `cardio`, deleting from them as asked. */
function server(workouts: Workout[] = [lift], cardio: CardioWorkout[] = [run]) {
  return mockServer({
    'GET /api/workouts': () => workouts,
    'GET /api/cardio': () => cardio,
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
  mockServer({ 'GET /api/workouts': [lift], 'GET /api/cardio': [], 'GET /api/plans': [] });
  const alerts = mockAlerts();
  const user = userEvent.setup();
  await renderInApp(<HistoryScreen />);
  await user.longPress(await screen.findByText('Squat'));
  await alerts.press('Delete');
  expect(alerts.latest().title).toBe("Couldn't delete workout");
  expect(screen.getByText('Squat')).toBeOnTheScreen();
});
