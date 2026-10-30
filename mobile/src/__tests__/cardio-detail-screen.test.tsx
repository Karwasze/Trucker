import AsyncStorage from '@react-native-async-storage/async-storage';
import { screen, userEvent } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';

import type { CardioWorkout, PlannedSession } from '@/api/types';
import CardioDetailScreen from '@/app/(tabs)/history/cardio/[id]';
import { healthHeartRateProfile, isHealthAvailable } from '@/health/healthkit';
import { mockAlerts, mockServer, renderInApp, selectPlan, setNow, TEST_ZONES, type Request } from '@/test-utils';

jest.mock('@/health/healthkit', () => ({
  isHealthAvailable: jest.fn(() => false),
  connectHealth: jest.fn(async () => {}),
  healthHeartRateProfile: jest.fn(async () => ({})),
}));

const ride: CardioWorkout = {
  id: 5,
  date: '2026-10-17',
  started_at: '2026-10-17T10:00:00+02:00',
  activity: 'cycling',
  duration_seconds: 8178,
  distance_m: 45200,
  avg_heart_rate: 132,
  energy_kcal: 950,
  source: 'Apple Watch',
  source_uuid: 'ride',
  laps: [
    { t: 0, duration: 4000, d: 22000 },
    { t: 4000, duration: 4178, d: 23200 },
  ],
};
const indoor: CardioWorkout = { ...ride, id: 6, distance_m: undefined, laps: undefined, source_uuid: 'indoor' };

const session = (id: number, description: string, filledBy?: number, date = '2026-10-17'): PlannedSession => ({
  id,
  goal_id: 3,
  date,
  activity: 'cycling',
  kind: 'long',
  phase: 'base',
  intensity: 'easy',
  description,
  cardio_workout_id: filledBy,
  verdict: filledBy
    ? { status: 'met', checks: [{ name: 'Distance', actual: '45.2 km', target: '40 km', ok: true }] }
    : undefined,
});

function server(workout: CardioWorkout, sessions: PlannedSession[] = []) {
  return mockServer({
    'GET /api/cardio': workout,
    'GET /api/goals': [{ id: 3, name: 'Gran Fondo', active: true }],
    'GET /api/goals/sessions': () => sessions,
    'PUT /api/goals/match': ({ body }: Request) => {
      const { session_id, cardio_id } = body as { session_id: number; cardio_id: number | null };
      sessions = sessions.map((s) =>
        s.id === session_id
          ? session(s.id, s.description, cardio_id ?? undefined, s.date)
          : s.cardio_workout_id === cardio_id
            ? session(s.id, s.description, undefined, s.date)
            : s
      );
      return { success: true };
    },
    'PATCH /api/cardio': ({ body }: Request) => ({ ...workout, ...(body as object), manual_distance: true }),
    'DELETE /api/cardio': { success: true },
    'GET /api/heart-rate-zones': TEST_ZONES,
  });
}

// Health state is cached per server, and deleting dismisses, so each test uses its own.
let count = 0;

beforeEach(async () => {
  jest.clearAllMocks();
  setNow('2026-10-18T09:00:00+02:00');
  await AsyncStorage.clear();
  await selectPlan(null, `http://cardio-${++count}:8081`);
  jest.mocked(useLocalSearchParams).mockReturnValue({ id: '5' });
});
afterEach(() => jest.useRealTimers());

test('shows the workout’s numbers and laps', async () => {
  server(ride);
  await renderInApp(<CardioDetailScreen />);
  expect(await screen.findByText('🚴 Ride')).toBeOnTheScreen();
  expect(screen.getByText('Sat, 17 Oct 2026 · 10:00 · Apple Watch')).toBeOnTheScreen();
  expect(screen.getByText('19.9 km/h')).toBeOnTheScreen();
  expect(screen.getByText('950 kcal')).toBeOnTheScreen();
  expect(screen.getByText('Laps · 2')).toBeOnTheScreen();
  expect(screen.getByText('22.0 km in 1:06:40')).toBeOnTheScreen();
});

test('a workout without a distance can have one entered', async () => {
  jest.mocked(useLocalSearchParams).mockReturnValue({ id: '6' });
  const requests = server(indoor);
  const alerts = mockAlerts();
  const user = userEvent.setup();
  await renderInApp(<CardioDetailScreen />);
  expect(await screen.findByText('No distance recorded')).toBeOnTheScreen();
  const input = screen.getByLabelText('Distance in kilometres');
  await user.type(input, '0');
  await user.press(screen.getByRole('button', { name: 'Save' }));
  expect(alerts.latest().title).toBe("Can't save distance");

  await user.clear(input);
  await user.type(input, '40,5');
  await user.press(screen.getByRole('button', { name: 'Save' }));
  const patch = requests.find((r) => r.method === 'PATCH');
  expect(patch?.body).toEqual({ distance_m: 40500 });
  expect(patch?.query.get('date')).toBe('2026-10-18');
});

test('the session it fills can be changed or cleared', async () => {
  const requests = server(ride, [session(21, 'Long ride 40 km · easy', 5), session(22, 'Recovery spin: 30 min')]);
  const user = userEvent.setup();
  await renderInApp(<CardioDetailScreen />);
  expect(await screen.findByText('✓ Distance 45.2 km (target 40 km)')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Long ride 40 km' })).toBeSelected();

  await user.press(screen.getByRole('button', { name: 'Recovery spin' }));
  const matches = () => requests.filter((r) => r.method === 'PUT').map((r) => r.body);
  expect(matches()).toEqual([{ session_id: 22, cardio_id: 5 }]);
  expect(await screen.findByRole('button', { name: 'Recovery spin', selected: true })).toBeOnTheScreen();

  await user.press(screen.getByRole('button', { name: 'No session' }));
  expect(matches().at(-1)).toEqual({ session_id: 22, cardio_id: null });
});

test('it can count as any open session of its week', async () => {
  const requests = server(ride, [
    session(20, 'Tempo ride 30 km', undefined, '2026-10-11'),
    session(21, 'Long ride 40 km · easy', undefined, '2026-10-12'),
    session(22, 'Recovery spin: 30 min', 9, '2026-10-18'),
  ]);
  const user = userEvent.setup();
  await renderInApp(<CardioDetailScreen />);
  await user.press(await screen.findByRole('button', { name: 'Long ride 40 km · Mon' }));
  expect(requests.filter((r) => r.method === 'PUT').map((r) => r.body)).toEqual([{ session_id: 21, cardio_id: 5 }]);
  expect(await screen.findByRole('button', { name: 'Long ride 40 km · Mon', selected: true })).toBeOnTheScreen();
  // Another workout filled Sunday's, and last week's is over.
  expect(screen.queryByRole('button', { name: /Recovery spin/ })).toBeNull();
  expect(screen.queryByRole('button', { name: /Tempo ride/ })).toBeNull();
  const query = requests.find((r) => r.path === '/api/goals/sessions')!.query;
  expect([query.get('from'), query.get('to')]).toEqual(['2026-10-12', '2026-10-18']);
});

test('deleting dismisses it from Apple Health imports and goes back', async () => {
  const requests = server(ride);
  const alerts = mockAlerts();
  const user = userEvent.setup();
  await renderInApp(<CardioDetailScreen />);
  await user.press(await screen.findByRole('button', { name: 'Delete workout' }));
  await alerts.press('Delete');
  expect(requests.find((r) => r.method === 'DELETE')?.query.get('id')).toBe('5');
  expect(router.back).toHaveBeenCalled();
});

describe('heart rate zones', () => {
  // The server's zones: zone 2 is 133–145 bpm, zone 3 146–158.
  const run: CardioWorkout = {
    ...ride,
    activity: 'running',
    laps: undefined,
    samples: [
      { t: 0, d: 0 },
      { t: 600, d: 2000, hr: 140 },
      { t: 900, d: 3000, hr: 150 },
      { t: 1200, d: 4000, hr: 150 },
    ],
  };

  async function connect() {
    jest.mocked(isHealthAvailable).mockReturnValue(true);
    jest.mocked(healthHeartRateProfile).mockResolvedValue({
      dateOfBirth: new Date('1991-03-02T00:00:00'),
      restingHeartRate: 55,
    });
    await AsyncStorage.setItem(
      `trucker.health:http://cardio-${count}:8081`,
      JSON.stringify({ connectedAt: '2026-10-01T08:00:00.000Z' })
    );
  }

  test('show the time the workout spent in each', async () => {
    await connect();
    server(run);
    await renderInApp(<CardioDetailScreen />);
    expect(await screen.findByText('Heart rate zones')).toBeOnTheScreen();
    expect(screen.getByLabelText('Zone 1, 0:00')).toBeOnTheScreen();
    expect(screen.getByLabelText('Zone 2, 10:00')).toBeOnTheScreen();
    expect(screen.getByLabelText('Zone 3, 10:00')).toBeOnTheScreen();
    expect(screen.getAllByText('50%')).toHaveLength(2);
  });

  test('are left out of a workout without heart rate', async () => {
    await connect();
    server({
      ...run,
      samples: [
        { t: 0, d: 0 },
        { t: 600, d: 2000 },
      ],
    });
    await renderInApp(<CardioDetailScreen />);
    expect(await screen.findByText('🏃 Run')).toBeOnTheScreen();
    expect(screen.queryByText('Heart rate zones')).not.toBeOnTheScreen();
  });
});
