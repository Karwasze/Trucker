import type { PlannedSession, PlanToday } from '@/api/types';
import { currentWeek, dayStatus, weekProgress } from '@/workout/week';

test('a weekday gives this week, Monday to Sunday', () => {
  expect(currentWeek('2026-10-14')).toEqual([
    '2026-10-12',
    '2026-10-13',
    '2026-10-14',
    '2026-10-15',
    '2026-10-16',
    '2026-10-17',
    '2026-10-18',
  ]);
  expect(currentWeek('2026-10-12')[0]).toBe('2026-10-12');
  expect(currentWeek('2026-10-17')[0]).toBe('2026-10-12');
});

test('on Sunday it still gives this week, the one ending today', () => {
  expect(currentWeek('2026-10-18')[0]).toBe('2026-10-12');
  expect(currentWeek('2026-10-18')[6]).toBe('2026-10-18');
});

test('weeks run across month ends and the DST change', () => {
  expect(currentWeek('2026-10-28')).toEqual([
    '2026-10-26',
    '2026-10-27',
    '2026-10-28',
    '2026-10-29',
    '2026-10-30',
    '2026-10-31',
    '2026-11-01',
  ]);
  expect(currentWeek('2026-03-31')[6]).toBe('2026-04-05');
});

describe('weekProgress', () => {
  const squat = { name: 'Squat', sets: [{ weight: 100, reps: 5 }] };
  const day = (date: string, overrides: Partial<PlanToday> = {}): PlanToday => ({
    plan_id: 1,
    date,
    weekday: 'monday',
    exercises: [squat],
    ...overrides,
  });
  const logged = { id: 1, date: '', plan_id: 1, exercises: [squat] };
  const session = (date: string, done: boolean) =>
    ({ id: 1, date, cardio_workout_id: done ? 9 : undefined }) as PlannedSession;

  test('counts lifting days and goal sessions together, and which are done', () => {
    expect(
      weekProgress(
        [day('2026-10-12', { workout: logged }), day('2026-10-14'), day('2026-10-15', { exercises: [] })],
        [session('2026-10-13', true), session('2026-10-16', false)]
      )
    ).toEqual({ done: 2, planned: 4 });
  });

  test('a rest day doesn’t count, but a workout logged from the plan does even with no targets left', () => {
    expect(weekProgress([day('2026-10-15', { exercises: [] })], [])).toEqual({ done: 0, planned: 0 });
    expect(weekProgress([day('2026-10-15', { exercises: [], workout: logged })], [])).toEqual({
      done: 1,
      planned: 1,
    });
  });
});

describe('dayStatus', () => {
  const squat = { name: 'Squat', sets: [{ weight: 100, reps: 5 }] };
  const lifting: PlanToday = { plan_id: 1, date: '2026-10-13', weekday: 'tuesday', exercises: [squat] };
  const logged: PlanToday = { ...lifting, workout: { id: 1, date: '2026-10-13', exercises: [squat] } };
  const rest: PlanToday = { ...lifting, exercises: [] };
  const run: PlannedSession = {
    id: 3,
    goal_id: 7,
    date: '2026-10-13',
    activity: 'running',
    kind: 'easy',
    phase: 'base',
    intensity: 'easy',
    description: 'Easy run 5 km',
  };
  const ran = { ...run, cardio_workout_id: 9 };

  test('a day with nothing planned is a rest day', () => {
    expect(dayStatus('2026-10-13', '2026-10-14', rest, [])).toBe('rest');
    expect(dayStatus('2026-10-13', '2026-10-14', undefined, [])).toBe('rest');
  });

  test('it is done once the lifting is logged and every session is done', () => {
    expect(dayStatus('2026-10-13', '2026-10-14', logged, [ran])).toBe('done');
    expect(dayStatus('2026-10-13', '2026-10-14', rest, [ran])).toBe('done');
    // A workout logged on a rest day counts too.
    expect(dayStatus('2026-10-13', '2026-10-14', { ...logged, exercises: [] }, [])).toBe('done');
  });

  test('a past day left partly undone is missed, today and later are planned', () => {
    expect(dayStatus('2026-10-13', '2026-10-14', logged, [run])).toBe('missed');
    expect(dayStatus('2026-10-13', '2026-10-14', lifting, [ran])).toBe('missed');
    expect(dayStatus('2026-10-13', '2026-10-13', lifting, [])).toBe('planned');
    expect(dayStatus('2026-10-13', '2026-10-12', rest, [run])).toBe('planned');
  });
});
