import AsyncStorage from '@react-native-async-storage/async-storage';
import { screen, userEvent } from '@testing-library/react-native';

import type { NewWorkout, PlanToday, Workout } from '@/api/types';
import TodayScreen from '@/app/(tabs)/(today)/index';
import { syncLiveActivity } from '@/timer/native';
import { mockAlerts, mockServer, renderInApp, selectPlan, setNow, type Request } from '@/test-utils';

const TODAY = '2026-10-18';

const plan = { id: 1, name: 'Strength', days: [] };
const squatDay: PlanToday = {
  plan_id: 1,
  date: TODAY,
  weekday: 'sunday',
  exercises: [
    {
      name: 'Squat',
      sets: [
        { weight: 100, reps: 5 },
        { weight: 100, reps: 5 },
      ],
      reason: 'Weight up 2.5 kg',
    },
  ],
};

/**
 * The server, keeping workouts logged through it: Today checks the list to
 * notice a logged workout being deleted in History.
 */
function server(day: PlanToday = squatDay, { saves = true } = {}) {
  const workouts: Workout[] = day.workout ? [day.workout] : [];
  return mockServer({
    'GET /api/plans': [plan],
    'GET /api/plans/today': day,
    'GET /api/goals/today': { goal: null, sessions: [] },
    'GET /api/workouts': () => workouts,
    'GET /api/exercises': [{ id: 1, name: 'Bench Press', is_default: true, muscles: [] }],
    'GET /api/latest-exercise': { target: null },
    ...(saves && {
      'POST /api/workouts': ({ body }: Request) => {
        const workout = { id: workouts.length + 1, ...(body as NewWorkout) };
        workouts.push(workout);
        return { ...workout, progression: [{ exercise: 'Squat', result: 'progressed' }] };
      },
    }),
  });
}

beforeEach(async () => {
  setNow(`${TODAY}T09:00:00+02:00`);
  await AsyncStorage.clear();
});
afterEach(() => jest.useRealTimers());

test('without a plan it offers to choose one', async () => {
  server();
  await selectPlan(null);
  await renderInApp(<TodayScreen />);
  expect(await screen.findByText('No training plan selected')).toBeOnTheScreen();
  expect(screen.getByText('Sunday 18 Oct')).toBeOnTheScreen();
});

test('today’s plan targets become the workout to fill in', async () => {
  server();
  await selectPlan(1);
  await renderInApp(<TodayScreen />);
  expect(await screen.findByText('Squat')).toBeOnTheScreen();
  expect(screen.getByText('Target 2 × 5 @ 100 kg')).toBeOnTheScreen();
  expect(screen.getByText('Weight up 2.5 kg')).toBeOnTheScreen();
  expect(screen.getByText('Sunday 18 Oct · Strength')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Tick off sets as you go' })).toBeDisabled();
});

test('finishing logs only the ticked sets and shows the progression', async () => {
  const requests = server();
  await selectPlan(1);
  const alerts = mockAlerts();
  const user = userEvent.setup();
  await renderInApp(<TodayScreen />);

  await user.press(await screen.findByRole('checkbox', { name: 'Set 1 done' }));
  expect(screen.getByRole('checkbox', { name: 'Set 1 done' })).toBeChecked();
  await user.press(screen.getByRole('button', { name: 'Finish workout · 1 sets' }));
  expect(alerts.latest().message).toBe('1 set will be logged. 1 unticked set will be left out.');
  await alerts.press('Finish');

  expect(await screen.findByText('Workout logged ✓')).toBeOnTheScreen();
  expect(screen.getByText('Weight goes up next time')).toBeOnTheScreen();
  expect(requests.find((r) => r.method === 'POST')?.body).toEqual({
    date: TODAY,
    plan_id: 1,
    exercises: [{ name: 'Squat', sets: [{ weight: 100, reps: 5 }] }],
  });
});

test('edited weights and reps are what gets logged', async () => {
  const requests = server();
  await selectPlan(1);
  const alerts = mockAlerts();
  const user = userEvent.setup();
  await renderInApp(<TodayScreen />);

  const weight = await screen.findByLabelText('Set 1 weight');
  await user.clear(weight);
  await user.type(weight, '102,5');
  await user.press(screen.getByRole('checkbox', { name: 'Set 1 done' }));
  await user.press(screen.getByRole('button', { name: 'Finish workout · 1 sets' }));
  await alerts.press('Finish');
  await screen.findByText('Workout logged ✓');
  expect(requests.find((r) => r.method === 'POST')?.body).toMatchObject({
    exercises: [{ name: 'Squat', sets: [{ weight: 102.5, reps: 5 }] }],
  });
});

test('a failed save keeps the workout and says why', async () => {
  server(squatDay, { saves: false });
  await selectPlan(1);
  const alerts = mockAlerts();
  const user = userEvent.setup();
  await renderInApp(<TodayScreen />);
  await user.press(await screen.findByRole('checkbox', { name: 'Set 1 done' }));
  await user.press(screen.getByRole('button', { name: 'Finish workout · 1 sets' }));
  await alerts.press('Finish');
  expect(alerts.latest().title).toBe("Couldn't save workout");
  expect(screen.getByRole('checkbox', { name: 'Set 1 done' })).toBeChecked();
});

test('the entered workout survives the app being closed', async () => {
  server();
  await selectPlan(1);
  const user = userEvent.setup();
  const first = await renderInApp(<TodayScreen />);
  await user.press(await screen.findByRole('checkbox', { name: 'Set 2 done' }));
  await first.unmount();

  await renderInApp(<TodayScreen />);
  expect(await screen.findByRole('checkbox', { name: 'Set 2 done' })).toBeChecked();
});

test('a rest day says so', async () => {
  server({ ...squatDay, exercises: [] });
  await selectPlan(1);
  await renderInApp(<TodayScreen />);
  expect(await screen.findByText(/No lifting today/)).toBeOnTheScreen();
});

test('a workout already logged today from the plan shows as logged', async () => {
  server({
    ...squatDay,
    workout: { id: 3, date: TODAY, plan_id: 1, exercises: [{ name: 'Squat', sets: [{ weight: 100, reps: 5 }] }] },
  });
  await selectPlan(1);
  await renderInApp(<TodayScreen />);
  expect(await screen.findByText('Workout logged ✓')).toBeOnTheScreen();
  expect(screen.getByText('1 exercises · 1 sets · 500 kg volume')).toBeOnTheScreen();
});

test('discarding resets the workout to the plan', async () => {
  server();
  await selectPlan(1);
  const alerts = mockAlerts();
  const user = userEvent.setup();
  await renderInApp(<TodayScreen />);
  await user.press(await screen.findByRole('checkbox', { name: 'Set 1 done' }));
  await user.press(screen.getByRole('button', { name: 'Discard' }));
  await alerts.press('Discard');
  expect(screen.getByRole('checkbox', { name: 'Set 1 done' })).not.toBeChecked();
});

/** Ticks a set of today's plan, finishes it, and starts another workout. */
async function logAndStartAnother(user: ReturnType<typeof userEvent.setup>, alerts: ReturnType<typeof mockAlerts>) {
  await user.press(await screen.findByRole('checkbox', { name: 'Set 1 done' }));
  await user.press(screen.getByRole('button', { name: 'Finish workout · 1 sets' }));
  await alerts.press('Finish');
  await user.press(await screen.findByRole('button', { name: 'Start another workout' }));
}

test('another workout started after the plan’s can be cancelled, back to the logged one', async () => {
  server();
  await selectPlan(1);
  const alerts = mockAlerts();
  const user = userEvent.setup();
  await renderInApp(<TodayScreen />);
  await logAndStartAnother(user, alerts);

  await user.press(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.getByText('Workout logged ✓')).toBeOnTheScreen();
  expect(screen.queryByRole('checkbox', { name: 'Set 1 done' })).not.toBeOnTheScreen();
});

test('discarding another workout goes back to the logged one, not the plan again', async () => {
  server();
  await selectPlan(1);
  const alerts = mockAlerts();
  const user = userEvent.setup();
  await renderInApp(<TodayScreen />);
  await logAndStartAnother(user, alerts);

  await user.press(screen.getByRole('button', { name: '+ Add exercise' }));
  await user.press(await screen.findByText('Bench Press'));
  await user.press(await screen.findByRole('button', { name: 'Discard' }));
  await alerts.press('Discard');
  expect(await screen.findByText('Workout logged ✓')).toBeOnTheScreen();
  expect(screen.queryByText('Target 2 × 5 @ 100 kg')).not.toBeOnTheScreen();
});

test('deleting today’s logged workout elsewhere brings the plan back', async () => {
  const requests = server();
  await selectPlan(1);
  const alerts = mockAlerts();
  const user = userEvent.setup();
  const first = await renderInApp(<TodayScreen />);
  await user.press(await screen.findByRole('checkbox', { name: 'Set 1 done' }));
  await user.press(screen.getByRole('button', { name: 'Finish workout · 1 sets' }));
  await alerts.press('Finish');
  await screen.findByText('Workout logged ✓');
  await first.unmount();

  // Deleted in History: the list no longer has it.
  mockServer({
    'GET /api/plans': [plan],
    'GET /api/plans/today': squatDay,
    'GET /api/goals/today': { goal: null, sessions: [] },
    'GET /api/workouts': [],
  });
  await renderInApp(<TodayScreen />);
  expect(await screen.findByRole('checkbox', { name: 'Set 1 done' })).not.toBeChecked();
  expect(requests.some((r) => r.method === 'POST')).toBe(true);
});

test('a ticked set without a number for its weight can’t be logged', async () => {
  const requests = server();
  await selectPlan(1);
  const user = userEvent.setup();
  await renderInApp(<TodayScreen />);

  const weight = await screen.findByLabelText('Set 1 weight');
  await user.clear(weight);
  await user.type(weight, '.');
  await user.press(screen.getByRole('checkbox', { name: 'Set 1 done' }));
  expect(screen.getByRole('button', { name: 'Fix the weight or reps in red' })).toBeDisabled();

  await user.clear(weight);
  expect(screen.getByRole('button', { name: 'Fix the weight or reps in red' })).toBeDisabled();

  await user.type(weight, '100');
  expect(screen.getByRole('button', { name: 'Finish workout · 1 sets' })).toBeEnabled();
  expect(requests.some((r) => r.method === 'POST')).toBe(false);
});

test('an untouched plan draft gives way to the plan’s workout logged meanwhile', async () => {
  server();
  await selectPlan(1);
  const first = await renderInApp(<TodayScreen />);
  await screen.findByRole('checkbox', { name: 'Set 1 done' });
  await first.unmount();

  // Logged since, e.g. the stored logged draft was replaced by the plan's.
  server({
    ...squatDay,
    workout: { id: 3, date: TODAY, plan_id: 1, exercises: [{ name: 'Squat', sets: [{ weight: 100, reps: 5 }] }] },
  });
  await renderInApp(<TodayScreen />);
  expect(await screen.findByText('Workout logged ✓')).toBeOnTheScreen();
});

test('finishing the workout stops the rest timer the last set started', async () => {
  server();
  await selectPlan(1);
  const alerts = mockAlerts();
  const user = userEvent.setup();
  await renderInApp(<TodayScreen />);

  await user.press(await screen.findByRole('checkbox', { name: 'Set 1 done' }));
  expect(syncLiveActivity).toHaveBeenLastCalledWith(expect.objectContaining({ durationMs: expect.any(Number) }));
  await user.press(screen.getByRole('button', { name: 'Finish workout · 1 sets' }));
  await alerts.press('Finish');
  await screen.findByText('Workout logged ✓');
  expect(syncLiveActivity).toHaveBeenLastCalledWith(null);
});

test('a failed save leaves the rest timer running', async () => {
  server(squatDay, { saves: false });
  await selectPlan(1);
  const alerts = mockAlerts();
  const user = userEvent.setup();
  await renderInApp(<TodayScreen />);

  await user.press(await screen.findByRole('checkbox', { name: 'Set 1 done' }));
  await user.press(screen.getByRole('button', { name: 'Finish workout · 1 sets' }));
  await alerts.press('Finish');
  expect(alerts.latest().title).toBe("Couldn't save workout");
  expect(syncLiveActivity).not.toHaveBeenLastCalledWith(null);
});
