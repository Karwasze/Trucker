import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, screen, userEvent, within } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';

import ProgressScreen from '@/app/(tabs)/stats/index';
import { healthBodyweight, isHealthAvailable } from '@/health/healthkit';
import { ProgressProvider } from '@/progress/progress-context';
import {
  allOfType,
  carouselValue,
  mockAlerts,
  mockServer,
  renderInApp,
  selectPlan,
  setNow,
  turnCarousel,
  type Request,
} from '@/test-utils';

jest.mock('@/health/healthkit', () => ({
  isHealthAvailable: jest.fn(() => true),
  connectHealth: jest.fn(async () => {}),
  healthBodyweight: jest.fn(async () => []),
}));

// The Progress layout provides the timespan.
const renderProgress = () =>
  renderInApp(
    <ProgressProvider>
      <ProgressScreen />
    </ProgressProvider>
  );

// Health state is cached per server, so each test connecting Health uses a server of its own.
let count = 0;
async function connectHealth() {
  const url = `http://progress-${++count}:8081`;
  await selectPlan(null, url);
  await AsyncStorage.setItem(`trucker.health:${url}`, JSON.stringify({ connectedAt: '2026-10-01T08:00:00.000Z' }));
}

function server({ exercises = ['Squat'], rides = true } = {}) {
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
    'GET /api/cardio': rides
      ? [
          {
            id: 1,
            date: '2026-10-17',
            started_at: '2026-10-17T10:00:00+02:00',
            activity: 'cycling',
            duration_seconds: 8178,
            distance_m: 45200,
          },
        ]
      : [],
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
  await renderProgress();
  expect(await screen.findByText('Since 9 Oct')).toBeOnTheScreen();
  // The tile, and the PR the latest session set.
  expect(screen.getAllByText('+3.4 kg')).toHaveLength(2);
  expect(screen.getByText('Latest · Fri, 16 Oct 2026')).toBeOnTheScreen();
});

test('personal records list the sessions that beat every earlier one, within the timespan', async () => {
  mockServer({
    'GET /api/statistics': ({ query }: Request) =>
      query.get('exercise') === 'Squat'
        ? {
            exercises: ['Squat'],
            data: [
              { date: '2020-03-05', estimated_1rm: 100, total_volume: 1000 },
              { date: '2020-04-02', estimated_1rm: 120, total_volume: 1000 },
              { date: '2026-09-10', estimated_1rm: 110, total_volume: 1000 },
              { date: '2026-10-16', estimated_1rm: 122.5, total_volume: 1000 },
            ],
          }
        : { exercises: ['Squat'], data: [] },
    'GET /api/cardio': [],
  });
  await renderProgress();
  await screen.findByText('Personal records');
  await turnCarousel('Timespan', 'All time');

  expect(screen.getByLabelText('PR on Fri, 16 Oct 2026: 122.5 kg, up 2.5 kg')).toBeOnTheScreen();
  expect(screen.getByLabelText('PR on Thu, 2 Apr 2020: 120.0 kg, up 20.0 kg')).toBeOnTheScreen();

  // The 2020 PR is outside the last month; the record it set still shows.
  await turnCarousel('Timespan', '1 month');
  expect(screen.getByLabelText('PR on Fri, 16 Oct 2026: 122.5 kg, up 2.5 kg')).toBeOnTheScreen();
  expect(screen.queryByLabelText(/PR on Thu, 2 Apr 2020/)).not.toBeOnTheScreen();
});

test('with no PR in the timespan it names the standing record', async () => {
  mockServer({
    'GET /api/statistics': ({ query }: Request) =>
      query.get('exercise') === 'Squat'
        ? {
            exercises: ['Squat'],
            data: [
              { date: '2020-03-05', estimated_1rm: 100, total_volume: 1000 },
              { date: '2020-04-02', estimated_1rm: 120, total_volume: 1000 },
              { date: '2026-10-16', estimated_1rm: 110, total_volume: 1000 },
            ],
          }
        : { exercises: ['Squat'], data: [] },
    'GET /api/cardio': [],
  });
  await renderProgress();
  await screen.findByText('Personal records');
  await turnCarousel('Timespan', '1 month');
  expect(screen.getByText('No PRs in the last 1 month. The record is 120.0 kg from 2 Apr 2020.')).toBeOnTheScreen();
});

test('with nothing lifted it falls back to bodyweight, which can’t be entered by hand', async () => {
  const requests = server({ exercises: [], rides: false });
  const user = userEvent.setup();
  await renderProgress();
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
  server({ exercises: [], rides: false });
  await renderProgress();
  expect(await screen.findByText('Bodyweight is imported from Apple Health in the iPhone app.')).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: 'Sync from Apple Health' })).toBeNull();
});

test('with Health connected, opening bodyweight replaces the log with Health’s', async () => {
  await connectHealth();
  jest.mocked(healthBodyweight).mockResolvedValue([
    { date: '2026-10-11', weight: 83.1 },
    { date: '2026-10-17', weight: 82.2 },
  ]);
  const requests = server({ exercises: [], rides: false });
  await renderProgress();
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
  const requests = server({ exercises: [], rides: false });
  const user = userEvent.setup();
  await renderProgress();
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
  const requests = server({ exercises: [], rides: false });
  const alerts = mockAlerts();
  const user = userEvent.setup();
  await renderProgress();
  await user.press(await screen.findByRole('button', { name: 'Sync from Apple Health' }));
  expect(alerts.latest().title).toBe('No weigh-ins in Apple Health');
  expect(screen.getAllByText('82.4 kg')[0]).toBeOnTheScreen();
  expect(requests.some((r) => r.method === 'PUT')).toBe(false);
});

// Regression: the weekly distance readout named a Monday instead of the ride's week.
test('opened on cycling from elsewhere, the weekly distance names the ride’s week', async () => {
  jest.mocked(useLocalSearchParams).mockReturnValue({ activity: 'cycling', span: '1y' });
  server();
  await renderProgress();
  expect(await screen.findByText('Latest · Week of 12 Oct – 18 Oct')).toBeOnTheScreen();
  expect(carouselValue('Timespan')).toBe('1 year, 2 of 5');
});

test('while Health is still reading, the stored log shows with a syncing note', async () => {
  await connectHealth();
  jest.mocked(healthBodyweight).mockReturnValue(new Promise(() => {}));
  const requests = server({ exercises: [], rides: false });
  await renderProgress();
  expect(await screen.findByText('Syncing with Apple Health…')).toBeOnTheScreen();
  expect(screen.getAllByText('82.4 kg')[0]).toBeOnTheScreen();
  expect(requests.some((r) => r.method === 'PUT')).toBe(false);
});

test('a failed Health sync keeps the stored log and says why', async () => {
  await connectHealth();
  jest.mocked(healthBodyweight).mockRejectedValue(new Error('Authorization not determined'));
  server({ exercises: [], rides: false });
  await renderProgress();
  expect(await screen.findByText('Couldn’t sync with Apple Health: Authorization not determined')).toBeOnTheScreen();
  expect(screen.getAllByText('82.4 kg')[0]).toBeOnTheScreen();
});

describe('category and series carousels', () => {
  test('open on Strength and its first lift', async () => {
    server({ exercises: ['Squat', 'Bench'] });
    await renderProgress();
    expect(await screen.findByText('Since 9 Oct')).toBeOnTheScreen();
    expect(carouselValue('Category')).toBe('Strength, 1 of 3');
    expect(carouselValue('Exercise')).toBe('Squat, 1 of 2');
  });

  test('float above the tab bar, outside the scrolling page', async () => {
    server({ exercises: ['Squat', 'Bench'] });
    await renderProgress();
    await screen.findByText('Since 9 Oct');
    const page = allOfType('RCTScrollView')[0];
    expect(within(page).getByText('Since 9 Oct')).toBeOnTheScreen();
    expect(within(page).queryByRole('adjustable', { name: 'Category' })).toBeNull();
    expect(within(page).queryByRole('adjustable', { name: 'Exercise' })).toBeNull();
  });

  test('a new category’s page slides in beside the last, like a tab, which stays drawn but hidden', async () => {
    server();
    await renderProgress();
    await screen.findByText('Since 9 Oct');
    await turnCarousel('Category', 'Cardio');
    expect(screen.getByText('Weekly distance')).toBeOnTheScreen();
    // Strength's page slides away: still drawn, but out of reach of screen readers.
    expect(screen.queryByText('Since 9 Oct')).toBeNull();
    expect(screen.getByText('Since 9 Oct', { includeHiddenElements: true })).toBeOnTheScreen();
    // Each page scrolls on its own.
    expect(allOfType('RCTScrollView')).toHaveLength(2);
  });

  test('Cardio lists only cardio, opening on the latest activity', async () => {
    server();
    await renderProgress();
    await screen.findByText('Since 9 Oct');
    await turnCarousel('Category', 'Cardio');
    expect(carouselValue('Activity')).toBe('Cycling, 1 of 1');
    expect(screen.getByText('Weekly distance')).toBeOnTheScreen();
  });

  // Regression: a spinner showed for a moment before the log, while it loaded.
  test('Bodyweight shows its log the moment it is picked', async () => {
    await connectHealth();
    jest.mocked(healthBodyweight).mockReturnValue(new Promise(() => {}));
    server();
    await renderProgress();
    await screen.findByText('Since 9 Oct');
    await turnCarousel('Category', 'Bodyweight');
    expect(screen.getAllByText('82.4 kg')[0]).toBeOnTheScreen();
    expect(screen.getByText('Syncing with Apple Health…')).toBeOnTheScreen();
  });

  test('Bodyweight has no second carousel', async () => {
    server();
    await renderProgress();
    await screen.findByText('Since 9 Oct');
    await turnCarousel('Category', 'Bodyweight');
    expect(screen.getAllByText('82.4 kg')[0]).toBeOnTheScreen();
    expect(screen.queryByRole('adjustable', { name: 'Exercise' })).not.toBeOnTheScreen();
    expect(screen.queryByRole('adjustable', { name: 'Activity' })).not.toBeOnTheScreen();
  });

  test('the categories are Strength, Cardio, then Bodyweight', async () => {
    server();
    await renderProgress();
    await screen.findByText('Since 9 Oct');
    await turnCarousel('Category', 'Cardio');
    expect(carouselValue('Category')).toBe('Cardio, 2 of 3');
    await turnCarousel('Category', 'Bodyweight');
    expect(carouselValue('Category')).toBe('Bodyweight, 3 of 3');
  });

  test('each category comes back to the series picked in it', async () => {
    server({ exercises: ['Squat', 'Bench'] });
    await renderProgress();
    await screen.findByText('Since 9 Oct');
    await turnCarousel('Exercise', 'Bench');
    await turnCarousel('Category', 'Cardio');
    await turnCarousel('Category', 'Strength');
    expect(carouselValue('Exercise')).toBe('Bench, 2 of 2');
  });

  test('Cardio without workouts says how to get them', async () => {
    server({ rides: false });
    await renderProgress();
    await screen.findByText('Since 9 Oct');
    await turnCarousel('Category', 'Cardio');
    expect(
      screen.getByText('No cardio workouts yet. Connect Apple Health in Settings to import them.')
    ).toBeOnTheScreen();
  });

  test('with nothing lifted, it opens on cardio', async () => {
    server({ exercises: [] });
    await renderProgress();
    expect(await screen.findByText('Weekly distance')).toBeOnTheScreen();
    expect(carouselValue('Category')).toBe('Cardio, 2 of 3');
  });

  test('the timespan starts at 1 month and goes round in a ring', async () => {
    server();
    await renderProgress();
    await screen.findByText('Since 9 Oct');
    expect(carouselValue('Timespan')).toBe('1 month, 5 of 5');
    await fireEvent(screen.getByRole('adjustable', { name: 'Timespan' }), 'accessibilityAction', {
      nativeEvent: { actionName: 'increment' },
    });
    expect(carouselValue('Timespan')).toBe('All time, 1 of 5');
  });

  test('the timespan carries across categories', async () => {
    server();
    await renderProgress();
    await screen.findByText('Since 9 Oct');
    await turnCarousel('Timespan', '1 year');
    await turnCarousel('Category', 'Cardio');
    expect(carouselValue('Timespan')).toBe('1 year, 2 of 5');
  });
});
