import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, screen, userEvent, waitFor } from '@testing-library/react-native';

import SettingsScreen from '@/app/(tabs)/settings';
import { requestReminderPermission, scheduleCheckIns } from '@/diet/reminder-native';
import { mockAlerts, mockServer, renderInApp, selectPlan, setNow } from '@/test-utils';

const exercises = [
  { id: 1, name: 'Squat', is_default: true, muscles: [] },
  { id: 7, name: 'Zercher Squat', is_default: false, muscles: [] },
];

const server = () =>
  mockServer({
    'GET /api/exercises': exercises,
    'GET /api/exercise-muscles': {},
    'GET /api/diet': [],
    'DELETE /api/exercises': { success: true },
  });

beforeEach(async () => {
  await AsyncStorage.clear();
  await selectPlan(null);
});

test('only custom exercises can be removed, after confirming', async () => {
  const requests = server();
  const alerts = mockAlerts();
  const user = userEvent.setup();
  await renderInApp(<SettingsScreen />);
  await user.press(await screen.findByRole('button', { name: 'Remove Zercher Squat' }));
  expect(screen.queryByRole('button', { name: 'Remove Squat' })).not.toBeOnTheScreen();
  expect(alerts.latest().title).toBe('Remove Zercher Squat?');
  await alerts.press('Remove');
  expect(requests.find((r) => r.method === 'DELETE')?.query.get('id')).toBe('7');
});

test('testing the server reports how many exercises it has', async () => {
  server();
  const user = userEvent.setup();
  await renderInApp(<SettingsScreen />);
  await user.press(await screen.findByRole('button', { name: 'Test connection' }));
  expect(await screen.findByText('Connected · 2 exercises')).toBeOnTheScreen();
});

test('a new server URL is saved, trimmed, and its failure reported', async () => {
  server();
  const user = userEvent.setup();
  await renderInApp(<SettingsScreen />);
  const url = await screen.findByLabelText('Development server URL');
  await user.clear(url);
  await user.type(url, 'http://other:8081/ ');
  // The fake server only answers the original address.
  globalThis.fetch = jest.fn().mockRejectedValue(new TypeError('Network request failed'));
  await user.press(screen.getByRole('button', { name: 'Save & test' }));
  // Under the URL, and in the exercise and muscle lists, which reload from the new server.
  expect(await screen.findAllByText("Can't reach the server at http://other:8081")).toHaveLength(3);
  const saved = JSON.parse((await AsyncStorage.getItem('trucker.settings'))!);
  expect(saved.servers.dev.url).toBe('http://other:8081');
});

test('the rest timer can be lengthened and its finish behaviour toggled', async () => {
  server();
  const user = userEvent.setup();
  await renderInApp(<SettingsScreen />);
  expect(await screen.findByText('3:00')).toBeOnTheScreen();
  await user.press(screen.getByRole('button', { name: 'Lengthen by 15 seconds' }));
  expect(screen.getByText('3:15')).toBeOnTheScreen();
  await user.press(screen.getByRole('button', { name: 'Vibration' }));
  expect(screen.getByRole('button', { name: 'Vibration' })).toBeSelected();
  expect(screen.getByText(/Vibrates even with the phone locked/)).toBeOnTheScreen();
  const stored = JSON.parse((await AsyncStorage.getItem('trucker.timer.settings'))!);
  expect(stored).toEqual({ durationSec: 195, animation: true, vibration: true });
});

describe('diet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Wednesday 14 October 2026.
    setNow('2026-10-14T18:00:00+02:00');
  });
  afterEach(() => jest.useRealTimers());

  test('turns on the evening check-in, scheduling it from today', async () => {
    server();
    const user = userEvent.setup();
    await renderInApp(<SettingsScreen />);

    await fireEvent(await screen.findByRole('switch', { name: 'Evening check-in' }), 'valueChange', true);
    expect(requestReminderPermission).toHaveBeenCalled();
    expect(await screen.findByText('21:00')).toBeOnTheScreen();
    await waitFor(() => expect(scheduleCheckIns).toHaveBeenCalled());
    const checkIns = jest.mocked(scheduleCheckIns).mock.calls.at(-1)![0];
    expect(checkIns[0]).toEqual({ date: '2026-10-14', at: new Date('2026-10-14T21:00:00+02:00') });

    await user.press(screen.getByRole('button', { name: '15 minutes later' }));
    expect(screen.getByText('21:15')).toBeOnTheScreen();
    await waitFor(() =>
      expect(jest.mocked(scheduleCheckIns).mock.calls.at(-1)![0][0].at).toEqual(new Date('2026-10-14T21:15:00+02:00'))
    );
    expect(JSON.parse((await AsyncStorage.getItem('trucker.diet-reminder'))!)).toEqual({
      enabled: true,
      minutes: 1275,
    });
  });
});
