import AsyncStorage from '@react-native-async-storage/async-storage';
import { screen, userEvent, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { HealthCard } from '@/health/health-card';
import { connectHealth, isHealthAvailable } from '@/health/healthkit';
import { mockAlerts, mockServer, renderInApp, selectPlan, type Request } from '@/test-utils';

jest.mock('@/health/healthkit', () => ({
  isHealthAvailable: jest.fn(() => true),
  connectHealth: jest.fn(async () => {}),
  healthBodyweight: jest.fn(async () => [{ date: '2026-10-17', weight: 82.2 }]),
}));

// Health state is cached per server, so each test connects a server of its own.
let count = 0;
let server = '';

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  server = `http://health-${++count}:8081`;
  await selectPlan(null, server);
  mockServer({});
});

test('on devices without Apple Health it says so', async () => {
  jest.mocked(isHealthAvailable).mockReturnValueOnce(false).mockReturnValueOnce(false);
  await renderInApp(<HealthCard />);
  expect(screen.getByText('Apple Health is only available in the iPhone app.')).toBeOnTheScreen();
});

test('connecting asks Health for access, imports bodyweight, then offers to check for workouts', async () => {
  const requests = mockServer({
    'GET /api/bodyweight': [],
    'PUT /api/bodyweight': ({ body }: Request) => body,
  });
  const user = userEvent.setup();
  await renderInApp(<HealthCard />);
  await user.press(await screen.findByRole('button', { name: 'Connect Apple Health' }));
  expect(connectHealth).toHaveBeenCalled();
  expect(await screen.findByText(/^Connected since/)).toBeOnTheScreen();
  await waitFor(() =>
    expect(requests.find((r) => r.method === 'PUT')?.body).toEqual([{ date: '2026-10-17', weight: 82.2 }])
  );
  await user.press(screen.getByRole('button', { name: 'Check for new workouts' }));
  expect(router.navigate).toHaveBeenCalledWith('/health-import');
});

test('a refused connection says why and stays disconnected', async () => {
  jest.mocked(connectHealth).mockRejectedValueOnce(new Error('Not authorised'));
  const alerts = mockAlerts();
  const user = userEvent.setup();
  await renderInApp(<HealthCard />);
  await user.press(await screen.findByRole('button', { name: 'Connect Apple Health' }));
  expect(alerts.latest()).toMatchObject({ title: "Couldn't connect Apple Health", message: 'Not authorised' });
  expect(screen.getByRole('button', { name: 'Connect Apple Health' })).toBeOnTheScreen();
});

test('disconnecting asks first and forgets the connection', async () => {
  await AsyncStorage.setItem(
    `trucker.health:${server}`,
    JSON.stringify({ connectedAt: '2026-10-15T08:00:00.000Z', dismissed: ['x'] })
  );
  const alerts = mockAlerts();
  const user = userEvent.setup();
  await renderInApp(<HealthCard />);
  expect(await screen.findByText('Connected since 15 Oct 2026')).toBeOnTheScreen();
  await user.press(screen.getByRole('button', { name: 'Disconnect' }));
  await alerts.press('Disconnect');
  expect(await screen.findByRole('button', { name: 'Connect Apple Health' })).toBeOnTheScreen();
  expect(JSON.parse((await AsyncStorage.getItem(`trucker.health:${server}`))!)).toEqual({
    connectedAt: null,
    dismissed: [],
  });
});
