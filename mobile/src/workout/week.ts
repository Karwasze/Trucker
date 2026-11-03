import { localDate } from '@/api/client';
import type { PlannedSession, PlanToday } from '@/api/types';

/** The dates, Monday to Sunday, of the week containing `today` (YYYY-MM-DD). */
export function currentWeek(today: string) {
  const [y, m, d] = today.split('-').map(Number);
  // Noon, so a DST change never moves a date across midnight.
  const date = new Date(y, m - 1, d, 12);
  const monday = d - ((date.getDay() + 6) % 7);
  return Array.from({ length: 7 }, (_, i) => localDate(new Date(y, m - 1, monday + i, 12)));
}

/**
 * How many of the week's trainings are done: the plan's lifting days and the
 * goal's sessions together. A day with both counts as two.
 */
export function weekProgress(days: PlanToday[], sessions: PlannedSession[]) {
  const lifting = days.filter((d) => d.exercises.length > 0 || d.workout);
  return {
    done: lifting.filter((d) => d.workout).length + sessions.filter((s) => s.cardio_workout_id).length,
    planned: lifting.length + sessions.length,
  };
}

export type DayStatus = 'done' | 'missed' | 'planned' | 'rest';

/**
 * Where a day of the week stands: done once its lifting is logged and its
 * sessions are done, missed if it has passed without that, rest if nothing
 * was planned or done.
 */
export function dayStatus(
  date: string,
  today: string,
  day: PlanToday | undefined,
  sessions: PlannedSession[]
): DayStatus {
  const lifting = !!day && (day.exercises.length > 0 || !!day.workout);
  if (!lifting && sessions.length === 0) return 'rest';
  if ((!lifting || day?.workout) && sessions.every((s) => s.cardio_workout_id)) return 'done';
  return date < today ? 'missed' : 'planned';
}
