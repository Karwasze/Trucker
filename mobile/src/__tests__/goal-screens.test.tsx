import AsyncStorage from '@react-native-async-storage/async-storage';
import { screen, userEvent } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';

import type { Goal, PlannedSession } from '@/api/types';
import GoalCalendarScreen from '@/app/(tabs)/plans/goal-calendar';
import GoalEditorScreen from '@/app/(tabs)/plans/goal';
import { mockAlerts, mockServer, renderInApp, selectPlan, setNow, type Request } from '@/test-utils';

const TODAY = '2026-10-18'; // A Sunday.

const marathon: Goal = {
  id: 3,
  name: 'Spring Marathon',
  race_date: '2027-04-11',
  start_date: '2026-10-12',
  run_m: 42195,
  weekdays: ['tuesday', 'thursday', 'sunday'],
  long_day: 'sunday',
  active: true,
};

beforeEach(async () => {
  jest.clearAllMocks();
  setNow(`${TODAY}T09:00:00+02:00`);
  await AsyncStorage.clear();
  await selectPlan(null);
});
afterEach(() => jest.useRealTimers());

describe('goal editor', () => {
  const editing = (id: string) => jest.mocked(useLocalSearchParams).mockReturnValue({ id });

  test('a preset and a race date make a plan, then its calendar opens', async () => {
    editing('new');
    const requests = mockServer({
      'POST /api/goals': ({ body }: Request) => ({ goal: { ...(body as object), id: 9 }, warnings: null }),
    });
    const user = userEvent.setup();
    await renderInApp(<GoalEditorScreen />);
    await user.press(screen.getByRole('button', { name: 'Half triathlon' }));
    expect(screen.getByLabelText('Swim (m)')).toHaveDisplayValue('1900');
    expect(screen.getByLabelText('Bike (km)')).toHaveDisplayValue('90');
    await user.press(screen.getByRole('button', { name: '12 weeks' }));
    expect(screen.getByText('Sunday, 10 January 2027')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Create plan' }));

    const post = requests.find((r) => r.method === 'POST')!;
    expect(post.query.get('date')).toBe(TODAY);
    expect(post.body).toEqual({
      name: 'Half triathlon',
      race_date: '2027-01-10',
      swim_m: 1900,
      bike_m: 90000,
      run_m: 21097,
      weekdays: ['tuesday', 'thursday', 'saturday', 'sunday'],
      long_day: 'sunday',
    });
    expect(router.replace).toHaveBeenCalledWith({ pathname: '/plans/goal-calendar', params: { id: 9 } });
  });

  test.each([
    [{}, 'Set at least one distance.'],
    [{ run: '-5' }, 'Distances must be positive numbers.'],
    [{ run: '10', date: '18/10/2027' }, 'Set the race date as YYYY-MM-DD.'],
    [{ run: '10', date: TODAY }, 'The race must be after today.'],
  ])('an invalid goal isn’t sent: %j', async (input: { run?: string; date?: string }, error) => {
    editing('new');
    const requests = mockServer({});
    const alerts = mockAlerts();
    const user = userEvent.setup();
    await renderInApp(<GoalEditorScreen />);
    if (input.run) await user.type(screen.getByLabelText('Run (km)'), input.run);
    if (input.date) await user.type(screen.getByPlaceholderText('YYYY-MM-DD'), input.date);
    await user.press(screen.getByRole('button', { name: 'Create plan' }));
    expect(alerts.latest()).toMatchObject({ title: "Can't save goal", message: error });
    expect(requests).toHaveLength(0);
  });

  test('the long day moves to a training day when its day is dropped', async () => {
    editing('new');
    const requests = mockServer({ 'POST /api/goals': { goal: { id: 1 }, warnings: [] } });
    const user = userEvent.setup();
    await renderInApp(<GoalEditorScreen />);
    await user.type(screen.getByLabelText('Run (km)'), '10');
    await user.press(screen.getByRole('button', { name: '8 weeks' }));
    await user.press(screen.getAllByRole('button', { name: 'Sun' })[0]);
    await user.press(screen.getByRole('button', { name: 'Create plan' }));
    expect(requests[0].body).toMatchObject({ weekdays: ['tuesday', 'thursday', 'saturday'], long_day: 'saturday' });
  });

  test('editing replans from today, showing the server’s warnings first', async () => {
    editing('3');
    const requests = mockServer({
      'GET /api/goals': [marathon],
      'PUT /api/goals': { goal: marathon, warnings: ['Only 25 weeks: the base phase is short.'] },
    });
    const alerts = mockAlerts();
    const user = userEvent.setup();
    await renderInApp(<GoalEditorScreen />);
    expect(await screen.findByLabelText('Run (km)')).toHaveDisplayValue('42.195');
    await user.press(screen.getByRole('button', { name: 'Save and replan' }));
    expect(requests.find((r) => r.method === 'PUT')?.body).toMatchObject({ id: 3, run_m: 42195 });
    expect(alerts.latest()).toMatchObject({
      title: 'Plan created',
      message: 'Only 25 weeks: the base phase is short.',
    });
    expect(router.replace).not.toHaveBeenCalled();
    await alerts.press('OK');
    expect(router.replace).toHaveBeenCalledWith({ pathname: '/plans/goal-calendar', params: { id: 3 } });
  });

  test('deleting returns to the plans list', async () => {
    editing('3');
    mockServer({ 'GET /api/goals': [marathon], 'DELETE /api/goals': { success: true } });
    const alerts = mockAlerts();
    const user = userEvent.setup();
    await renderInApp(<GoalEditorScreen />);
    await user.press(await screen.findByRole('button', { name: 'Delete goal' }));
    await alerts.press('Delete');
    expect(router.dismissTo).toHaveBeenCalledWith('/plans');
  });

  test('a goal that no longer exists says so', async () => {
    editing('8');
    mockServer({ 'GET /api/goals': [marathon] });
    await renderInApp(<GoalEditorScreen />);
    expect(await screen.findByText('Goal not found')).toBeOnTheScreen();
  });
});

describe('goal calendar', () => {
  const session = (id: number, date: string, description: string, met?: boolean): PlannedSession => ({
    id,
    goal_id: 3,
    date,
    activity: 'running',
    kind: 'easy',
    phase: 'base',
    intensity: 'easy',
    description,
    verdict:
      met === undefined
        ? undefined
        : { status: met ? 'met' : 'missed', checks: [{ name: 'Distance', actual: '8 km', target: '8 km', ok: !!met }] },
  });

  test('sessions are grouped by week, with this week marked and past weeks scored', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: '3' });
    mockServer({
      'GET /api/goals': [marathon],
      'GET /api/goals/sessions': [
        session(0, '2026-10-08', 'Easy run 5 km', true),
        session(1, '2026-10-13', 'Easy run 8 km', true),
        session(2, '2026-10-15', 'Easy run 6 km', false),
        session(3, '2026-10-18', 'Long run 14 km'),
        session(4, '2026-10-20', 'Easy run 8 km'),
      ],
    });
    const user = userEvent.setup();
    await renderInApp(<GoalCalendarScreen />);
    expect(await screen.findByText('Race day Sunday 11 April')).toBeOnTheScreen();
    expect(screen.getByText('Week 1 · Base')).toBeOnTheScreen();
    expect(screen.getByText('1 of 1 met')).toBeOnTheScreen();
    expect(screen.getByText('Week 2 · Base · this week')).toBeOnTheScreen();
    expect(screen.getByText('Week 3 · Base')).toBeOnTheScreen();
    // Only finished weeks are scored.
    expect(screen.queryByText('1 of 3 met')).not.toBeOnTheScreen();
    expect(screen.getByText('Sun 18')).toBeOnTheScreen();

    // Checks show once a session is opened.
    expect(screen.queryByText('✓ Distance 8 km (target 8 km)')).not.toBeOnTheScreen();
    await user.press(screen.getAllByText('🏃 Easy run 8 km')[0]);
    expect(screen.getByText('✓ Distance 8 km (target 8 km)')).toBeOnTheScreen();
  });
});
