import { localDate } from '@/api/client';

/**
 * The dates, Monday to Sunday, of the week containing `today` (YYYY-MM-DD),
 * or of next week on a Sunday, when this week is all but over.
 */
export function upcomingWeek(today: string) {
  const [y, m, d] = today.split('-').map(Number);
  // Noon, so a DST change never moves a date across midnight.
  const date = new Date(y, m - 1, d, 12);
  const sinceMonday = (date.getDay() + 6) % 7;
  const monday = d - sinceMonday + (sinceMonday === 6 ? 7 : 0);
  return Array.from({ length: 7 }, (_, i) => localDate(new Date(y, m - 1, monday + i, 12)));
}
