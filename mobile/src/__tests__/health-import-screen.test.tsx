import AsyncStorage from '@react-native-async-storage/async-storage';
import { screen, userEvent } from '@testing-library/react-native';
import { router } from 'expo-router';

import type { NewCardioWorkout, PlannedSession } from '@/api/types';
import HealthImportScreen from '@/app/health-import';
import { healthWorkoutReport, healthWorkoutsSince } from '@/health/healthkit';
import { mockAlerts, mockServer, renderInApp, selectPlan, SERVER, type Request } from '@/test-utils';

jest.mock('@/health/healthkit', () => ({
  isHealthAvailable: () => true,
  healthWorkoutsSince: jest.fn(),
  healthWorkoutReport: jest.fn(async () => []),
}));

const run: NewCardioWorkout = {
  date: '2026-10-17',
  started_at: '2026-10-17T07:00:00+02:00',
  activity: 'running',
  duration_seconds: 3000,
  distance_m: 10000,
  source_uuid: 'run',
};
const swim: NewCardioWorkout = {
  date: '2026-10-18',
  started_at: '2026-10-18T07:00:00+02:00',
  activity: 'swimming',
  duration_seconds: 1800,
  source_uuid: 'swim',
};
const session = (id: number, description: string): PlannedSession => ({
  id,
  goal_id: 3,
  date: '2026-10-17',
  activity: 'running',
  kind: 'easy',
  phase: 'base',
  intensity: 'easy',
  description,
});

function fakeServer(sessions: PlannedSession[] = []) {
  return mockServer({
    'GET /api/cardio': [],
    'GET /api/goals': [{ id: 3, name: 'Marathon', active: true }],
    'GET /api/goals/sessions': sessions,
    'POST /api/cardio': ({ body }: Request) => body,
  });
}

// Health state is cached per server, so each test connects a server of its own.
let server = SERVER;
let count = 0;
const health = async () => JSON.parse((await AsyncStorage.getItem(`trucker.health:${server}`))!);

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  server = `http://server-${++count}:8081`;
  await selectPlan(null, server);
  await AsyncStorage.setItem(
    `trucker.health:${server}`,
    JSON.stringify({ connectedAt: '2026-10-15T08:00:00.000Z', dismissed: [] })
  );
  jest.mocked(healthWorkoutsSince).mockResolvedValue([run, swim]);
});

test('every new workout is ticked; importing one dismisses the unticked other', async () => {
  const requests = fakeServer();
  const user = userEvent.setup();
  await renderInApp(<HealthImportScreen />);
  expect(
    await screen.findByText('No distance from Apple Health. Add it after importing, from the workout in History.')
  ).toBeOnTheScreen();
  const [, swimBox] = screen.getAllByRole('checkbox');
  await user.press(swimBox);
  expect(swimBox).not.toBeChecked();

  await user.press(screen.getByRole('button', { name: 'Import 1 workout' }));
  expect(requests.find((r) => r.method === 'POST')?.body).toEqual([run]);
  expect((await health()).dismissed).toEqual(['swim']);
  expect(router.back).toHaveBeenCalled();
});

test('a workout fills the open session of its activity that day, unless another is chosen', async () => {
  const requests = fakeServer([session(11, 'Easy run 6 km · 5:45–6:15/km'), session(12, 'Strides: 6 × 100 m')]);
  const user = userEvent.setup();
  await renderInApp(<HealthImportScreen />);
  expect(await screen.findByRole('button', { name: 'Easy run 6 km' })).toBeSelected();

  await user.press(screen.getByRole('button', { name: 'Strides' }));
  await user.press(screen.getByRole('button', { name: 'Import 2 workouts' }));
  expect(requests.find((r) => r.method === 'POST')?.body).toEqual([{ ...run, planned_session_id: 12 }, swim]);
});

test('skipping all imports nothing and dismisses everything', async () => {
  const requests = fakeServer();
  const user = userEvent.setup();
  await renderInApp(<HealthImportScreen />);
  await user.press(await screen.findByRole('button', { name: 'Skip all' }));
  expect(requests.some((r) => r.method === 'POST')).toBe(false);
  expect((await health()).dismissed).toEqual(['run', 'swim']);
});

test('a failed import says why and stays open', async () => {
  mockServer({ 'GET /api/cardio': [], 'GET /api/goals': [] });
  const alerts = mockAlerts();
  const user = userEvent.setup();
  await renderInApp(<HealthImportScreen />);
  await user.press(await screen.findByRole('button', { name: 'Import 2 workouts' }));
  expect(alerts.latest().title).toBe("Couldn't import workouts");
  expect(router.back).not.toHaveBeenCalled();
});

test('with nothing new it shows what Apple Health returned', async () => {
  jest.mocked(healthWorkoutsSince).mockResolvedValue([]);
  jest.mocked(healthWorkoutReport).mockResolvedValue([
    {
      uuid: 'y',
      start: new Date('2026-10-16T06:00:00Z'),
      activityType: 57,
      name: 'Unsupported workout',
      status: 'unsupported',
    },
  ]);
  fakeServer();
  await renderInApp(<HealthImportScreen />);
  expect(await screen.findByText('No new workouts in Apple Health.')).toBeOnTheScreen();
  expect(await screen.findByText(/Unsupported workout \(type 57\) · activity not supported/)).toBeOnTheScreen();
});

// Regression: the session picked for a workout without a Health UUID was dropped on import.
test('a workout without a Health UUID keeps the session picked for it', async () => {
  const { source_uuid: _uuid, ...manual } = run;
  jest.mocked(healthWorkoutsSince).mockResolvedValue([manual]);
  const requests = fakeServer([session(11, 'Easy run 6 km · 5:45–6:15/km'), session(12, 'Strides: 6 × 100 m')]);
  const user = userEvent.setup();
  await renderInApp(<HealthImportScreen />);
  await user.press(await screen.findByRole('button', { name: 'Strides' }));
  await user.press(screen.getByRole('button', { name: 'Import 1 workout' }));
  expect(requests.find((r) => r.method === 'POST')?.body).toEqual([{ ...manual, planned_session_id: 12 }]);
});
