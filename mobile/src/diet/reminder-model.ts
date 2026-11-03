/** The evening check-in asking whether the day's diet was kept to. */
export type ReminderPrefs = {
  enabled: boolean;
  /** Minutes after midnight, local time. */
  minutes: number;
};

export const DEFAULT_REMINDER: ReminderPrefs = { enabled: false, minutes: 21 * 60 };

/** How far ahead check-ins are scheduled; opening the app tops them up. */
export const REMINDER_DAYS = 14;
export const REMINDER_STEP_MIN = 15;
const DAY_MIN = 24 * 60;

/** The time of day as HH:MM, e.g. "21:00". */
export const formatReminderTime = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/** `minutes` moved by `steps` reminder steps, wrapping round midnight. */
export const stepReminderTime = (minutes: number, steps: number) =>
  (((minutes + steps * REMINDER_STEP_MIN) % DAY_MIN) + DAY_MIN) % DAY_MIN;

/** Reads stored prefs, falling back to the defaults for anything missing or broken. */
export function parseReminderPrefs(raw: string | null): ReminderPrefs {
  try {
    const stored = raw ? JSON.parse(raw) : {};
    const minutes = Number.isInteger(stored.minutes) && stored.minutes >= 0 && stored.minutes < DAY_MIN;
    return {
      enabled: stored.enabled === true,
      minutes: minutes ? stored.minutes : DEFAULT_REMINDER.minutes,
    };
  } catch {
    return DEFAULT_REMINDER;
  }
}

export type ScheduledCheckIn = { date: string; at: Date };

/**
 * The check-ins to schedule from `now` on, one a day for REMINDER_DAYS
 * days at `minutes`: today's only if it's still to come and today isn't
 * logged yet.
 */
export function checkInsFrom(now: Date, minutes: number, todayLogged: boolean): ScheduledCheckIn[] {
  const checkIns: ScheduledCheckIn[] = [];
  for (let i = 0; i < REMINDER_DAYS; i++) {
    const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, 0, minutes);
    if (i === 0 && (todayLogged || at <= now)) continue;
    const date = [at.getFullYear(), at.getMonth() + 1, at.getDate()].map((n) => String(n).padStart(2, '0')).join('-');
    checkIns.push({ date, at });
  }
  return checkIns;
}
