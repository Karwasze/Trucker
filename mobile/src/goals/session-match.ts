import { localDate } from '@/api/client';
import type { PlannedSession } from '@/api/types';
import { formatDate } from '@/workout/format';

/** The YYYY-MM-DD date `days` after `date` (before, when negative). */
export function addDays(date: string, days: number) {
  const [y, m, d] = date.split('-').map(Number);
  // Noon, so a DST change never moves a date across midnight.
  return localDate(new Date(y, m - 1, d + days, 12));
}

/** The Monday of the week of `date` (YYYY-MM-DD). */
function mondayOf(date: string) {
  const [y, m, d] = date.split('-').map(Number);
  const weekday = (new Date(y, m - 1, d, 12).getDay() + 6) % 7;
  return addDays(date, -weekday);
}

/** The from and to dates of the sessions workouts on `dates` may count as. */
export function matchRange(dates: string[]): [string, string] {
  const sorted = [...dates].sort();
  return [mondayOf(sorted[0]), addDays(mondayOf(sorted.at(-1)!), 6)];
}

/**
 * Whether a workout on `date` may count as the session: any of its week,
 * Monday to Sunday, as the week's goals count for the whole week.
 */
export function withinMatch(session: PlannedSession, date: string) {
  return mondayOf(session.date) === mondayOf(date);
}

/**
 * "Easy run 6 km" from "Easy run 6 km · 5:45–6:15/km", with the session's
 * weekday when it isn't on the workout's date: "Easy run 6 km · Tue".
 */
export function sessionLabel(session: PlannedSession, date: string) {
  const name = session.description.split(' · ')[0].split(':')[0];
  return session.date === date ? name : `${name} · ${formatDate(session.date, { weekday: 'short' })}`;
}
