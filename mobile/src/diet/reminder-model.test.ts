import {
  checkInsFrom,
  DEFAULT_REMINDER,
  formatReminderTime,
  parseReminderPrefs,
  REMINDER_DAYS,
  stepReminderTime,
} from '@/diet/reminder-model';

test('formats the time of day', () => {
  expect(formatReminderTime(21 * 60)).toBe('21:00');
  expect(formatReminderTime(7 * 60 + 5)).toBe('07:05');
});

test('steps the time in quarter hours, round midnight', () => {
  expect(stepReminderTime(21 * 60, 1)).toBe(21 * 60 + 15);
  expect(stepReminderTime(23 * 60 + 45, 1)).toBe(0);
  expect(stepReminderTime(0, -1)).toBe(23 * 60 + 45);
});

test('reads stored prefs, defaulting what is missing or broken', () => {
  expect(parseReminderPrefs(null)).toEqual(DEFAULT_REMINDER);
  expect(parseReminderPrefs('not json')).toEqual(DEFAULT_REMINDER);
  expect(parseReminderPrefs('{"enabled":true,"minutes":1200}')).toEqual({ enabled: true, minutes: 1200 });
  expect(parseReminderPrefs('{"enabled":true,"minutes":5000}')).toEqual({ enabled: true, minutes: 21 * 60 });
});

test("schedules a check-in a day, today's included while it's to come and today isn't logged", () => {
  const now = new Date(2026, 9, 20, 18, 0);
  const checkIns = checkInsFrom(now, 21 * 60, false);
  expect(checkIns).toHaveLength(REMINDER_DAYS);
  expect(checkIns[0]).toEqual({ date: '2026-10-20', at: new Date(2026, 9, 20, 21, 0) });
  expect(checkIns.at(-1)!.date).toBe('2026-11-02');
});

test('skips today once logged, or once its time has passed', () => {
  const evening = new Date(2026, 9, 20, 18, 0);
  expect(checkInsFrom(evening, 21 * 60, true)[0].date).toBe('2026-10-21');

  const late = new Date(2026, 9, 20, 22, 0);
  const checkIns = checkInsFrom(late, 21 * 60, false);
  expect(checkIns[0].date).toBe('2026-10-21');
  expect(checkIns).toHaveLength(REMINDER_DAYS - 1);
});

test('keeps the time of day across a change to winter time', () => {
  // Clocks go back in Warsaw on 25 Oct 2026.
  const checkIns = checkInsFrom(new Date(2026, 9, 24, 12, 0), 21 * 60, false);
  expect(checkIns.map((c) => c.at.getHours())).toEqual(Array(REMINDER_DAYS).fill(21));
});
