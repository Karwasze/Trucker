import AsyncStorage from '@react-native-async-storage/async-storage';
import { screen, userEvent } from '@testing-library/react-native';
import { router } from 'expo-router';

import { MUSCLES, type CardioActivity, type Goal, type Insights } from '@/api/types';
import InsightsTab from '@/app/(tabs)/insights/index';
import { connectHealth, healthHeartRateProfile } from '@/health/healthkit';
import { mockServer, renderInApp, selectPlan, setNow, TEST_ZONES, pickTimespan, type Request } from '@/test-utils';

jest.mock('@/health/healthkit', () => ({
  isHealthAvailable: jest.fn(() => true),
  connectHealth: jest.fn(async () => {}),
  healthHeartRateProfile: jest.fn(async () => ({})),
}));

const TODAY = '2026-10-18';

const empty: Insights = {
  date: TODAY,
  bodyweight: null,
  sessions_per_week: 0,
  muscles: [],
  adherence: null,
  stalls: [],
  progression: [],
  tonnage: { total: 0, weekly: [], by_exercise: [] },
  strength: [],
  untagged: [],
  cardio: [],
  cardio_progression: [],
  goal: null,
  triathlon: null,
};

const full: Insights = {
  ...empty,
  bodyweight: { latest: 82, change: 0 } as unknown as Insights['bodyweight'],
  muscles: MUSCLES.map((muscle) => ({
    muscle,
    weekly_sets: muscle === 'hamstrings' ? 0 : muscle === 'quads' ? 6 : 2,
    days_per_week: 1,
    status: 'low' as const,
  })),
  adherence: {
    plan: 'Strength',
    since: '2026-09-01',
    scheduled: 20,
    completed: 15,
    extra: 1,
    streak: 3,
    missed: ['2026-10-16', '2026-10-14', '2026-10-09', '2026-10-07', '2026-10-02', '2026-09-30'],
  },
  stalls: [
    { exercise: 'Bench Press', status: 'missing', weight: 80, misses: 2, date: '2026-10-16', deload_next: true },
    { exercise: 'Pull-up', status: 'deloaded', weight: 0, misses: 3, date: '2026-10-02' },
  ],
  progression: [
    {
      exercise: 'Squat',
      sessions: 6,
      first_1rm: 100,
      first_date: '2026-09-01',
      best_1rm: 120,
      best_date: '2026-10-16',
      latest_1rm: 110,
      per_month: 5,
      record_1rm: 120,
      record_date: '2026-10-16',
    },
  ],
  tonnage: {
    total: 12000,
    weekly: [
      { week: '2026-10-05', tonnage: 5000 },
      { week: '2026-10-12', tonnage: 7000 },
    ],
    by_exercise: [{ exercise: 'Squat', tonnage: 12000 }],
  },
  strength: [
    { exercise: 'Squat', best_1rm: 120, ratio: 1.46, level: 'intermediate', next_level: 'advanced', next_level_kg: 25 },
  ],
  untagged: ['Farmer Carry'],
  cardio: [{ activity: 'cycling', sessions: 1, distance_m: 45200, duration_seconds: 8178, weekly_distance_m: 45200 }],
  goal: {
    goal: { id: 3, name: 'Marathon', race_date: '2027-04-11', active: true, run_m: 42195 } as Goal,
    weeks_to_race: 25,
    phase: 'base',
    met: 2,
    partial: 1,
    missed: 0,
    pending: 2,
    planned_m: { running: 30000 },
    done_m: { running: 12500 },
    threshold: { running: 1000 / 270 },
  },
};

beforeEach(async () => {
  jest.clearAllMocks();
  setNow(`${TODAY}T09:00:00+02:00`);
  await AsyncStorage.clear();
});
afterEach(() => jest.useRealTimers());

/** Insights on one of its pages, over all time unless `allTime` is false. */
async function renderPage(page: 'Strength' | 'Cardio', { allTime = true } = {}) {
  await renderInApp(<InsightsTab />);
  if (page === 'Cardio') await userEvent.setup().press(screen.getByRole('tab', { name: 'Cardio' }));
  if (allTime) await pickTimespan('All time');
}
const renderStrength = (options?: { allTime?: boolean }) => renderPage('Strength', options);
const renderCardio = (options?: { allTime?: boolean }) => renderPage('Cardio', options);

test('with nothing logged each section says what to do', async () => {
  mockServer({ 'GET /api/insights': empty });
  await selectPlan(null);
  await renderStrength();
  expect(await screen.findByText('Pick a plan under Training to track adherence and stalled lifts.')).toBeOnTheScreen();
  expect(screen.getByText('Pick a plan under Training to follow the progression of its lifts.')).toBeOnTheScreen();
  // Over all time there's no "last" period to name.
  expect(screen.queryByText(/From beginning/)).not.toBeOnTheScreen();
  expect(screen.getByText(/import your bodyweight and see how strong/)).toBeOnTheScreen();
  expect(screen.getByText(/^No tagged lifts\. Tag exercises/)).toBeOnTheScreen();
});

test('with no cardio the Cardio page says so', async () => {
  mockServer({ 'GET /api/insights': empty });
  await renderCardio();
  expect(await screen.findByText('No cardio workouts.')).toBeOnTheScreen();
});

test('adherence, stalls, progression and strength levels are summarised on Strength', async () => {
  mockServer({ 'GET /api/insights': full });
  await selectPlan(1);
  await renderStrength();

  expect(await screen.findByText('Strength Plan')).toBeOnTheScreen();
  expect(screen.getByText('15 / 20')).toBeOnTheScreen();
  expect(screen.getByText('75%')).toBeOnTheScreen();
  expect(screen.getByText('Strength since 1 Sept · 1 extra session')).toBeOnTheScreen();
  expect(screen.getByText('Missed 16 Oct, 14 Oct, 9 Oct, 7 Oct, 2 Oct and 1 more')).toBeOnTheScreen();

  expect(screen.getByText('2 misses at 80 kg')).toBeOnTheScreen();
  expect(screen.getByText('Last on 16 Oct · deloads next session')).toBeOnTheScreen();
  expect(screen.getByText('After 3 misses at bodyweight on 2 Oct')).toBeOnTheScreen();

  // A tile per lift: its est. 1RM against the record. The change over time is on Progress.
  expect(screen.getByText('Progression · from beginning')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: /Squat/ })).toHaveTextContent('Squat110 kg92% of record');
  expect(screen.queryByText('Since 1 Sept')).not.toBeOnTheScreen();
  expect(screen.queryByText('+5 kg / month')).not.toBeOnTheScreen();

  // Tonnage lives on Progress.
  expect(screen.queryByText('Tonnage')).not.toBeOnTheScreen();
  expect(screen.queryByText('Latest · Week of 12 Oct – 18 Oct')).not.toBeOnTheScreen();
  // Muscles trained over the timespan: here all time.
  expect(screen.getByText('Muscles · from beginning')).toBeOnTheScreen();
  expect(screen.getByText('Never trained: Hamstrings.')).toBeOnTheScreen();
  expect(screen.getByText('6 sets / wk')).toBeOnTheScreen();

  expect(screen.getByText('Strength levels')).toBeOnTheScreen();
  expect(screen.getByText('Intermediate')).toBeOnTheScreen();
  expect(screen.getByText('120 kg est. 1RM · 1.46× BW · +25 kg to advanced')).toBeOnTheScreen();
  expect(screen.getByText('Farmer Carry')).toBeOnTheScreen();

  // Cardio and the race goal live on the Cardio page.
  expect(screen.queryByText('🚴 Ride · 1 session')).not.toBeOnTheScreen();
  expect(screen.queryByText('Marathon')).not.toBeOnTheScreen();
});

test('the race goal and cardio are summarised on Cardio', async () => {
  mockServer({ 'GET /api/insights': full });
  await selectPlan(1);
  await renderCardio();

  expect(await screen.findByText('🚴 Ride · 1 session')).toBeOnTheScreen();
  expect(screen.getByText('Marathon')).toBeOnTheScreen();
  expect(screen.getByText('Base · 25 weeks to race day')).toBeOnTheScreen();
  expect(screen.getByText('🏃 12.5 km of 30.0 km this week')).toBeOnTheScreen();
  expect(screen.getByText('Threshold: 🏃 4:30/km')).toBeOnTheScreen();
});

test('tapping the race goal opens its calendar with the plans list to go back to', async () => {
  mockServer({ 'GET /api/insights': full });
  await renderCardio();
  await userEvent.setup().press(await screen.findByText('Base · 25 weeks to race day'));
  expect(router.navigate).toHaveBeenLastCalledWith(
    { pathname: '/plans/goal-calendar', params: { id: 3 } },
    { withAnchor: true }
  );
});

test('cardio progression says whether the pace of each activity improved', async () => {
  mockServer({
    'GET /api/insights': {
      ...full,
      cardio_progression: [
        {
          activity: 'running',
          sessions: 8,
          first_date: '2026-09-02',
          last_date: '2026-10-16',
          start_speed: 1000 / 330,
          end_speed: 1000 / 315,
        },
        {
          activity: 'cycling',
          sessions: 4,
          first_date: '2026-09-10',
          last_date: '2026-10-12',
          start_speed: 8,
          end_speed: 7.6,
        },
        {
          activity: 'swimming',
          sessions: 3,
          first_date: '2026-10-01',
          last_date: '2026-10-15',
          start_speed: 0.8,
          end_speed: 0.802,
        },
      ],
    },
  });
  const user = userEvent.setup();
  await renderCardio();

  expect(await screen.findByText('Progression · from beginning')).toBeOnTheScreen();
  expect(screen.getByText('▲ 5% faster')).toBeOnTheScreen();
  expect(screen.getByText('5:30/km → 5:15/km · 8 sessions since 2 Sept')).toBeOnTheScreen();
  // Speed for rides.
  expect(screen.getByText('▼ 5% slower')).toBeOnTheScreen();
  expect(screen.getByText('28.8 km/h → 27.4 km/h · 4 sessions since 10 Sept')).toBeOnTheScreen();
  expect(screen.getByText('Steady')).toBeOnTheScreen();
  expect(screen.getByText('2:05/100 m → 2:05/100 m · 3 sessions since 1 Oct')).toBeOnTheScreen();

  await user.press(screen.getByText('5:30/km → 5:15/km · 8 sessions since 2 Sept'));
  expect(router.navigate).toHaveBeenLastCalledWith({
    pathname: '/stats',
    params: { activity: 'running', span: 'all' },
  });
});

test('activities without a pace trend say what they still need, whatever the distances', async () => {
  // A swim, a ride and a run are three sessions, but one of each.
  const summary = (activity: CardioActivity, sessions: number) => ({
    activity,
    sessions,
    distance_m: 10000,
    duration_seconds: 3600,
    weekly_distance_m: 10000,
  });
  mockServer({
    'GET /api/insights': {
      ...empty,
      cardio: [summary('running', 1), summary('cycling', 3), summary('swimming', 2)],
      cardio_progression: [],
    },
  });
  await renderCardio();

  expect(await screen.findByText('Progression · from beginning')).toBeOnTheScreen();
  expect(screen.getAllByText('No trend yet')).toHaveLength(3);
  expect(screen.getByText('1 of the 3 sessions needed · any distance counts')).toBeOnTheScreen();
  expect(screen.getByText('2 of the 3 sessions needed · any distance counts')).toBeOnTheScreen();
  // E.g. indoor rides, with no distance to work out a speed from.
  expect(screen.getByText('Needs a recorded distance on 3 sessions, on more than one day')).toBeOnTheScreen();
});

test('a server too old for cardio progression says to update it', async () => {
  const { cardio_progression: _, ...old } = full;
  mockServer({ 'GET /api/insights': old });
  await renderCardio();
  expect(await screen.findByText('Update the server to see whether your pace is improving.')).toBeOnTheScreen();
  expect(screen.queryByText('No trend yet')).not.toBeOnTheScreen();
});

test('it opens on the last month, then asks for insights from each timespan’s start', async () => {
  const requests = mockServer({ 'GET /api/insights': empty });
  await selectPlan(2);
  await renderStrength({ allTime: false });
  await screen.findByText('No weighted plan lifts in the last 1 month.');
  expect(requests.at(-1)?.query.get('from')).toBe('2026-09-18');
  expect(requests.at(-1)?.query.get('plan_id')).toBe('2');

  await pickTimespan('3 months');
  await screen.findByText('No weighted plan lifts in the last 3 months.');
  expect(screen.getByText('Progression · last 3 months')).toBeOnTheScreen();
  // Muscle volume follows the timespan too.
  expect(screen.getByText('Muscles · last 3 months')).toBeOnTheScreen();
  expect(screen.getByText(/^No tagged lifts in the last 3 months\./)).toBeOnTheScreen();
  expect((requests.at(-1) as Request).query.get('from')).toBe('2026-07-18');
});

test('buttons switch between Strength and Cardio, which share the timespan and one request', async () => {
  const requests = mockServer({ 'GET /api/insights': empty });
  await selectPlan(1);
  const user = userEvent.setup();
  await renderStrength({ allTime: false });
  // The Cardio page reads the heart rate zones too.
  const insightsRequests = () => requests.filter((r) => r.path === '/api/insights');
  await screen.findByText('No weighted plan lifts in the last 1 month.');
  expect(screen.getByRole('tab', { name: 'Strength' })).toBeSelected();
  expect(screen.queryByText('No cardio in the last 1 month.')).not.toBeOnTheScreen();

  await pickTimespan('3 months');
  await screen.findByText('No weighted plan lifts in the last 3 months.');
  const before = insightsRequests().length;
  await user.press(screen.getByRole('tab', { name: 'Cardio' }));
  expect(screen.getByRole('tab', { name: 'Cardio' })).toBeSelected();
  expect(await screen.findByText('No cardio in the last 3 months.')).toBeOnTheScreen();
  expect(screen.queryByText('No weighted plan lifts in the last 3 months.')).not.toBeOnTheScreen();
  // Switching asks for nothing new: both pages show the same insights.
  expect(insightsRequests()).toHaveLength(before);
  expect(insightsRequests().at(-1)?.query.get('from')).toBe('2026-07-18');
});

test('tapping a lift or an activity opens its chart on Progress with the same timespan', async () => {
  mockServer({ 'GET /api/insights': full });
  await selectPlan(1);
  const user = userEvent.setup();
  await renderStrength();
  await user.press(await screen.findByRole('button', { name: /Squat/ }));
  expect(router.navigate).toHaveBeenLastCalledWith({ pathname: '/stats', params: { exercise: 'Squat', span: 'all' } });
  await screen.unmount();
  await renderCardio();
  await user.press(await screen.findByText('🚴 Ride · 1 session'));
  expect(router.navigate).toHaveBeenLastCalledWith({
    pathname: '/stats',
    params: { activity: 'cycling', span: 'all' },
  });
});

describe('heart rate zones', () => {
  // Health state is cached per server, so each test connecting Health uses a server of its own.
  let count = 0;
  async function connect() {
    const url = `http://insights-${++count}:8081`;
    await selectPlan(null, url);
    await AsyncStorage.setItem(`trucker.health:${url}`, JSON.stringify({ connectedAt: '2026-10-01T08:00:00.000Z' }));
  }

  // The server's zones: none until the app sends Health's heart rates.
  function server(stored: typeof TEST_ZONES | null = null) {
    return mockServer({
      'GET /api/insights': empty,
      'GET /api/heart-rate-zones': stored,
      'PUT /api/heart-rate-zones': ({ body }: Request) => ({ ...TEST_ZONES, ...(body as object) }),
    });
  }

  test('are worked out on the server from the birth date and resting heart rate in Health', async () => {
    jest.mocked(healthHeartRateProfile).mockResolvedValue({
      dateOfBirth: new Date('1991-03-02T00:00:00'),
      restingHeartRate: 55,
    });
    const requests = server();
    await connect();
    await renderCardio();

    expect(await screen.findByText('< 133 bpm')).toBeOnTheScreen();
    expect(screen.getByText('133–145 bpm')).toBeOnTheScreen();
    expect(screen.getByText('146–158 bpm')).toBeOnTheScreen();
    expect(screen.getByText('159–171 bpm')).toBeOnTheScreen();
    expect(screen.getByText('172+ bpm')).toBeOnTheScreen();
    expect(screen.getByText(/max heart rate of 185 bpm \(by age\) and resting heart rate of 55 bpm/)).toBeOnTheScreen();
    // Age 35: a max of 185, sent for sessions to be judged by.
    expect(requests.find((r) => r.method === 'PUT')?.body).toEqual({ date: TODAY, max_hr: 185, resting_hr: 55 });
    // Asks for access to the birth date and resting heart rate when connected before they were read.
    expect(connectHealth).toHaveBeenCalled();
  });

  test('say what Health is missing for them', async () => {
    jest.mocked(healthHeartRateProfile).mockResolvedValue({ restingHeartRate: 55 });
    server();
    await connect();
    await renderCardio();
    expect(
      await screen.findByText('Add your birth date to Apple Health to see your heart rate zones.')
    ).toBeOnTheScreen();
  });

  test('show the server’s without Health connected', async () => {
    server(TEST_ZONES);
    await renderCardio();
    expect(await screen.findByText('146–158 bpm')).toBeOnTheScreen();
    expect(healthHeartRateProfile).not.toHaveBeenCalled();
  });

  test('are left out without Health connected or any on the server', async () => {
    server();
    await renderCardio();
    expect(await screen.findByText('No cardio workouts.')).toBeOnTheScreen();
    expect(screen.queryByText('Heart rate zones')).not.toBeOnTheScreen();
  });
});
