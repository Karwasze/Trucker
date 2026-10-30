import AsyncStorage from '@react-native-async-storage/async-storage';
import { screen, userEvent } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';

import type { TrainingPlan } from '@/api/types';
import PlanEditorScreen from '@/app/(tabs)/plans/[id]';
import PlansScreen from '@/app/(tabs)/plans/index';
import { mockAlerts, mockServer, renderInApp, selectPlan, setNow, type Request } from '@/test-utils';

const strength: TrainingPlan = {
  id: 1,
  name: 'Strength',
  days: [
    { weekday: 'friday', exercises: [{ name: 'Deadlift', sets: 1, reps: 5 }] },
    { weekday: 'monday', exercises: [{ name: 'Squat', sets: 3, reps: 5 }] },
  ],
};
const push: TrainingPlan = { id: 2, name: 'Push', days: [] };

const activePlan = async () =>
  JSON.parse((await AsyncStorage.getItem('trucker.settings')) ?? '{"servers":{"dev":{}}}').servers.dev.planId;

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
});

describe('plan list', () => {
  beforeEach(() => setNow('2026-10-18T09:00:00+02:00'));
  afterEach(() => jest.useRealTimers());

  const server = (goals: unknown[] = []) => mockServer({ 'GET /api/plans': [strength, push], 'GET /api/goals': goals });

  test('shows each plan’s schedule and which is active', async () => {
    server();
    await selectPlan(1);
    await renderInApp(<PlansScreen />);
    expect(await screen.findByText('Mon · Fri · 2 exercises')).toBeOnTheScreen();
    expect(screen.getByText('No training days · 0 exercises')).toBeOnTheScreen();
    expect(screen.getByText('✓ Active')).toBeOnTheScreen();
  });

  test('switching plans is remembered', async () => {
    server();
    await selectPlan(1);
    const user = userEvent.setup();
    await renderInApp(<PlansScreen />);
    await user.press(await screen.findByRole('button', { name: 'Use this plan' }));
    expect(await activePlan()).toBe(2);
  });

  test('there is no option to train without a plan', async () => {
    server();
    await selectPlan(1);
    await renderInApp(<PlansScreen />);
    await screen.findByText('✓ Active');
    expect(screen.queryByRole('button', { name: 'Train without a plan' })).not.toBeOnTheScreen();
  });

  test('an active goal shows its countdown and legs', async () => {
    server([
      {
        id: 5,
        name: 'Half triathlon',
        race_date: '2026-12-13',
        active: true,
        swim_m: 1900,
        bike_m: 90000,
        run_m: 21097,
      },
    ]);
    await selectPlan(null);
    await renderInApp(<PlansScreen />);
    expect(await screen.findByText('8 weeks to go')).toBeOnTheScreen();
    expect(screen.getByText('Sun, 13 Dec 2026 · swim 1900 m, bike 90 km, run 21.097 km')).toBeOnTheScreen();
  });

  test('without a goal it offers to set one', async () => {
    server();
    await selectPlan(null);
    const user = userEvent.setup();
    await renderInApp(<PlansScreen />);
    await user.press(await screen.findByRole('button', { name: '+ New goal' }));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/plans/goal', params: { id: 'new' } });
  });
});

describe('plan editor', () => {
  const editing = (id: string) => jest.mocked(useLocalSearchParams).mockReturnValue({ id });

  test('creating a plan saves it, makes it active when none was, and goes back', async () => {
    editing('new');
    const requests = mockServer({
      'GET /api/exercises': [{ id: 1, name: 'Bench Press', muscles: [] }],
      'GET /api/latest-exercise': {
        sets: [
          { weight: 60, reps: 8 },
          { weight: 60, reps: 8 },
        ],
      },
      'POST /api/plans': ({ body }: Request) => ({ id: 7, ...(body as object) }),
    });
    await selectPlan(null);
    const user = userEvent.setup();
    await renderInApp(<PlanEditorScreen />);

    await user.type(screen.getByPlaceholderText('Plan name, e.g. 5×5'), 'Push');
    await user.press(screen.getByRole('button', { name: 'Tue' }));
    await user.press(screen.getByRole('button', { name: '+ Add exercise to Tuesday' }));
    await user.press(await screen.findByText('Bench Press'));
    // Follows the last logged 2 × 8.
    expect(await screen.findByLabelText('Bench Press sets')).toHaveDisplayValue('2');
    expect(screen.getByLabelText('Bench Press reps')).toHaveDisplayValue('8');

    await user.press(screen.getByRole('button', { name: 'Create plan' }));
    expect(requests.find((r) => r.method === 'POST')?.body).toEqual({
      name: 'Push',
      days: [{ weekday: 'tuesday', exercises: [{ name: 'Bench Press', sets: 2, reps: 8 }] }],
    });
    expect(await activePlan()).toBe(7);
    expect(router.back).toHaveBeenCalled();
  });

  test('an invalid plan isn’t sent', async () => {
    editing('new');
    const requests = mockServer({});
    await selectPlan(null);
    const alerts = mockAlerts();
    const user = userEvent.setup();
    await renderInApp(<PlanEditorScreen />);
    await user.press(screen.getByRole('button', { name: 'Create plan' }));
    expect(alerts.latest()).toMatchObject({ title: "Can't save plan", message: 'Give the plan a name.' });
    expect(requests).toHaveLength(0);
  });

  test('editing loads the plan and saves the changes', async () => {
    editing('1');
    const requests = mockServer({ 'GET /api/plans': strength, 'PUT /api/plans': strength });
    await selectPlan(1);
    const user = userEvent.setup();
    await renderInApp(<PlanEditorScreen />);

    const reps = await screen.findByLabelText('Squat reps');
    await user.clear(reps);
    await user.type(reps, '8');
    await user.press(screen.getByLabelText('Remove Deadlift'));
    await user.press(screen.getByRole('button', { name: 'Save changes' }));

    expect(requests.at(-1)).toMatchObject({ method: 'PUT', path: '/api/plans' });
    expect(requests.at(-1)?.body).toEqual({
      id: 1,
      name: 'Strength',
      days: [
        { weekday: 'monday', exercises: [{ name: 'Squat', sets: 3, reps: 8 }] },
        { weekday: 'friday', exercises: [] },
      ],
    });
    expect(router.back).toHaveBeenCalled();
  });

  test('removing a day with exercises asks first', async () => {
    editing('1');
    mockServer({ 'GET /api/plans': strength });
    await selectPlan(1);
    const alerts = mockAlerts();
    const user = userEvent.setup();
    await renderInApp(<PlanEditorScreen />);
    await user.press(await screen.findByRole('button', { name: 'Mon' }));
    expect(alerts.latest().title).toBe('Remove Monday?');
    await alerts.press('Remove');
    expect(screen.queryByLabelText('Squat sets')).not.toBeOnTheScreen();
  });

  test('deleting the active plan clears it', async () => {
    editing('1');
    const requests = mockServer({ 'GET /api/plans': strength, 'DELETE /api/plans': { success: true } });
    await selectPlan(1);
    const alerts = mockAlerts();
    const user = userEvent.setup();
    await renderInApp(<PlanEditorScreen />);
    await user.press(await screen.findByRole('button', { name: 'Delete plan' }));
    expect(alerts.latest().title).toBe('Delete Strength?');
    await alerts.press('Delete');
    expect(requests.find((r) => r.method === 'DELETE')).toMatchObject({ path: '/api/plans' });
    expect(await activePlan()).toBeNull();
    expect(router.back).toHaveBeenCalled();
  });

  test('a plan that can’t be loaded says why', async () => {
    editing('9');
    mockServer({});
    await selectPlan(null);
    await renderInApp(<PlanEditorScreen />);
    expect(await screen.findByText('No route for GET /api/plans')).toBeOnTheScreen();
  });
});
