import type { PlannedSession } from '@/api/types';
import { addDays, matchRange, sessionLabel, withinMatch } from '@/goals/session-match';

const session = (date: string): PlannedSession => ({
  id: 1,
  goal_id: 3,
  date,
  activity: 'running',
  kind: 'easy',
  phase: 'base',
  intensity: 'easy',
  description: 'Easy run 6 km · 5:45–6:15/km',
});

test('addDays crosses months and the DST change', () => {
  expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
  expect(addDays('2026-11-01', -1)).toBe('2026-10-31');
  expect(addDays('2026-10-25', 1)).toBe('2026-10-26');
});

test('matchRange spans the weeks of the workout dates, Monday to Sunday', () => {
  expect(matchRange(['2026-10-28', '2026-10-20'])).toEqual(['2026-10-19', '2026-11-01']);
  // A Sunday is the end of its week, across the DST change.
  expect(matchRange(['2026-10-25'])).toEqual(['2026-10-19', '2026-10-25']);
});

test('a workout counts as any session of its week, not the next or last', () => {
  expect(withinMatch(session('2026-10-26'), '2026-10-28')).toBe(true);
  expect(withinMatch(session('2026-10-28'), '2026-10-28')).toBe(true);
  expect(withinMatch(session('2026-11-01'), '2026-10-28')).toBe(true);
  expect(withinMatch(session('2026-10-25'), '2026-10-28')).toBe(false);
  expect(withinMatch(session('2026-11-02'), '2026-10-28')).toBe(false);
});

test('a session on another day is labelled with its weekday', () => {
  expect(sessionLabel(session('2026-10-28'), '2026-10-28')).toBe('Easy run 6 km');
  expect(sessionLabel(session('2026-10-27'), '2026-10-28')).toBe('Easy run 6 km · Tue');
});
