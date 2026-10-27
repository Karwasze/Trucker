import { localDate } from '@/api/client';
import type { PlannedSession } from '@/api/types';
import { formatDate } from '@/workout/format';

/**
 * Days either side of a session's date a workout may still count as it,
 * so a session done a day early or late isn't missed.
 */
export const MATCH_DAYS = 1;

/** The YYYY-MM-DD date `days` after `date` (before, when negative). */
export function addDays(date: string, days: number) {
  const [y, m, d] = date.split('-').map(Number);
  // Noon, so a DST change never moves a date across midnight.
  return localDate(new Date(y, m - 1, d + days, 12));
}

/** The from and to dates of the sessions workouts on `dates` may count as. */
export function matchRange(dates: string[]): [string, string] {
  const sorted = [...dates].sort();
  return [addDays(sorted[0], -MATCH_DAYS), addDays(sorted.at(-1)!, MATCH_DAYS)];
}

/** Whether a workout on `date` may count as the session. */
export function withinMatch(session: PlannedSession, date: string) {
  return session.date >= addDays(date, -MATCH_DAYS) && session.date <= addDays(date, MATCH_DAYS);
}

/**
 * "Easy run 6 km" from "Easy run 6 km · 5:45–6:15/km", with the session's
 * weekday when it isn't on the workout's date: "Easy run 6 km · Tue".
 */
export function sessionLabel(session: PlannedSession, date: string) {
  const name = session.description.split(' · ')[0].split(':')[0];
  return session.date === date ? name : `${name} · ${formatDate(session.date, { weekday: 'short' })}`;
}
