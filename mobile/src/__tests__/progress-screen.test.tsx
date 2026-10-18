import AsyncStorage from '@react-native-async-storage/async-storage';
import { screen, userEvent } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';

import StatsScreen from '@/app/(tabs)/stats';
import { healthBodyweight, isHealthAvailable } from '@/health/healthkit';
import { mockAlerts, mockServer, renderInApp, selectPlan, setNow, type Request } from '@/test-utils';

jest.mock('@/health/healthkit', () => ({
  isHealthAvailable: jest.fn(() => true),
  connectHealth: jest.fn(async () => {}),
  healthBodyweight: jest.fn(async () => []),
}));

// Health state is cached per server, so each test connecting Health uses a server of its own.
let count = 0;
async function connectHealth() {
  const url = `http://progress-${++count}:8081`;
  await selectPlan(null, url);
  await AsyncStorage.setItem(`trucker.health:${url}`, JSON.stringify({ connectedAt: '2026-10-01T08:00:00.000Z' }));
}

function server({ exercises = ['Squat'] } = {}) {
  return mockServer({
    'GET /api/statistics': ({ query }: Request) =>
      query.get('exercise') === 'Squat'
        ? {
            exercises,
            data: [
              { date: '2026-10-16', estimated_1rm: 116.7, total_volume: 1000 },
              { date: '2026-10-09', estimated_1rm: 113.3, total_volume: 950 },
            ],
          }
        : { exercises, data: [] },
    'GET /api/cardio': [
      {
        id: 1,
        date: '2026-10-17',
        started_at: '2026-10-17T10:00:00+02:00',
        activity: 'cycling',
        duration_seconds: 8178,
        distance_m: 45200,
      },
    ],
    'GET /api/bodyweight': [{ date: '2026-10-18', weight: 82.4 }],
    'PUT /api/bodyweight': ({ body }: Request) => body,
  });
}

beforeEach(async () => {
  jest.clearAllMocks();
  jest.mocked(isHealthAvailable).mockReturnValue(true);
  jest.mocked(healthBodyweight).mockResolvedValue([]);
  setNow('2026-10-18T17:26:00+02:00');
  await AsyncStorage.clear();
  await selectPlan(null);
  jest.mocked(useLocalSearchParams).mockReturnValue({});
});
afterEach(() => jest.useRealTimers());

test('opens on the first exercise’s estimated 1RM, oldest to newest', async () => {
  server();
  await renderInApp(<StatsScreen />);
  expect(await screen.findByText('+3.4 kg')).toBeOnTheScreen();
  expect(screen.getByText('Since 9 Oct')).toBeOnTheScreen();
  expect(screen.getByText('Latest · Fri, 16 Oct 2026')).toBeOnTheScreen();
});

test('with nothing lifted it falls back to bodyweight, which can’t be entered by hand', async () => {
  const requests = server({ exercises: [] });
  const user = userEvent.setup();
  await renderInApp(<StatsScreen />);
  expect(await screen.findByText('Connect Apple Health in Settings to import your weigh-ins.')).toBeOnTheScreen();
  expect(screen.getAllByText('82.4 kg')[0]).toBeOnTheScreen();
  expect(screen.queryByLabelText("Today's bodyweight in kilograms")).toBeNull();
  expect(healthBodyweight).not.toHaveBeenCalled();
  expect(requests.some((r) => r.method === 'PUT')).toBe(false);
  await user.press(screen.getByRole('button', { name: 'Open Settings' }));
  expect(router.push).toHaveBeenCalledWith('/settings');
});

test('without Apple Health, bodyweight is read-only', async () => {
  jest.mocked(isHealthAvailable).mockReturnValue(false);
  server({ exercises: [] });
  await renderInApp(<StatsScreen />);
  expect(await screen.findByText('Bodyweight is imported from Apple Health in the iPhone app.')).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: 'Sync from Apple Health' })).toBeNull();
});

test('with Health connected, opening bodyweight replaces the log with Health’s', async () => {
  await connectHealth();
  jest.mocked(healthBodyweight).mockResolvedValue([
    { date: '2026-10-11', weight: 83.1 },
    { date: '2026-10-17', weight: 82.2 },
  ]);
  const requests = server({ exercises: [] });
  await renderInApp(<StatsScreen />);
  expect((await screen.findAllByText('82.2 kg'))[0]).toBeOnTheScreen();
  expect(screen.getByText('-0.9 kg')).toBeOnTheScreen();
  expect(requests.find((r) => r.method === 'PUT')?.body).toEqual([
    { date: '2026-10-11', weight: 83.1 },
    { date: '2026-10-17', weight: 82.2 },
  ]);
});

test('syncing pulls Health’s weigh-ins again, overwriting the log', async () => {
  await connectHealth();
  jest.mocked(healthBodyweight).mockResolvedValue([{ date: '2026-10-17', weight: 82.2 }]);
  const requests = server({ exercises: [] });
  const user = userEvent.setup();
  await renderInApp(<StatsScreen />);
  expect((await screen.findAllByText('82.2 kg'))[0]).toBeOnTheScreen();

  jest.mocked(healthBodyweight).mockResolvedValue([
    { date: '2026-10-17', weight: 82.2 },
    { date: '2026-10-18', weight: 81.8 },
  ]);
  await user.press(screen.getByRole('button', { name: 'Sync from Apple Health' }));
  expect(requests.filter((r) => r.method === 'PUT').at(-1)?.body).toEqual([
    { date: '2026-10-17', weight: 82.2 },
    { date: '2026-10-18', weight: 81.8 },
  ]);
});

test('syncing with no weigh-ins in Health says so and keeps the log', async () => {
  await connectHealth();
  const requests = server({ exercises: [] });
  const alerts = mockAlerts();
  const user = userEvent.setup();
  await renderInApp(<StatsScreen />);
  await user.press(await screen.findByRole('button', { name: 'Sync from Apple Health' }));
  expect(alerts.latest().title).toBe('No weigh-ins in Apple Health');
  expect(screen.getAllByText('82.4 kg')[0]).toBeOnTheScreen();
  expect(requests.some((r) => r.method === 'PUT')).toBe(false);
});

// Regression: the weekly distance readout named a Monday instead of the ride's week.
test('opened on cycling from elsewhere, the weekly distance names the ride’s week', async () => {
  jest.mocked(useLocalSearchParams).mockReturnValue({ activity: 'cycling', span: '1y' });
  server();
  await renderInApp(<StatsScreen />);
  expect(await screen.findByText('Latest · Week of 12 Oct – 18 Oct')).toBeOnTheScreen();
  expect(screen.getByRole('tab', { name: '1 year' })).toBeSelected();
});

test('while Health is still reading, the stored log shows with a syncing note', async () => {
  await connectHealth();
  jest.mocked(healthBodyweight).mockReturnValue(new Promise(() => {}));
  const requests = server({ exercises: [] });
  await renderInApp(<StatsScreen />);
  expect(await screen.findByText('Syncing with Apple Health…')).toBeOnTheScreen();
  expect(screen.getAllByText('82.4 kg')[0]).toBeOnTheScreen();
  expect(requests.some((r) => r.method === 'PUT')).toBe(false);
});

test('a failed Health sync keeps the stored log and says why', async () => {
  await connectHealth();
  jest.mocked(healthBodyweight).mockRejectedValue(new Error('Authorization not determined'));
  server({ exercises: [] });
  await renderInApp(<StatsScreen />);
  expect(await screen.findByText('Couldn’t sync with Apple Health: Authorization not determined')).toBeOnTheScreen();
  expect(screen.getAllByText('82.4 kg')[0]).toBeOnTheScreen();
});
