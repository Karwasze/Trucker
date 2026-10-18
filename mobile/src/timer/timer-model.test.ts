import {
  clampDuration,
  DEFAULT_TIMER_SETTINGS,
  endsAt,
  formatClock,
  MAX_DURATION_SEC,
  MIN_DURATION_SEC,
  parseTimerSettings,
} from '@/timer/timer-model';

test('clampDuration keeps durations within bounds and whole', () => {
  expect(clampDuration(1)).toBe(MIN_DURATION_SEC);
  expect(clampDuration(99999)).toBe(MAX_DURATION_SEC);
  expect(clampDuration(90.4)).toBe(90);
});

test('formatClock rounds down to whole seconds and never goes negative', () => {
  expect(formatClock(0)).toBe('0:00');
  expect(formatClock(9999)).toBe('0:09');
  expect(formatClock(180_000)).toBe('3:00');
  expect(formatClock(-500)).toBe('0:00');
});

test('parseTimerSettings falls back to defaults for missing or broken input', () => {
  expect(parseTimerSettings(null)).toEqual(DEFAULT_TIMER_SETTINGS);
  expect(parseTimerSettings('not json')).toEqual(DEFAULT_TIMER_SETTINGS);
  expect(parseTimerSettings('{}')).toEqual(DEFAULT_TIMER_SETTINGS);
});

test('parseTimerSettings reads stored values and clamps the duration', () => {
  expect(parseTimerSettings(JSON.stringify({ durationSec: 5, animation: false, vibration: true }))).toEqual({
    durationSec: MIN_DURATION_SEC,
    animation: false,
    vibration: true,
  });
});

test('parseTimerSettings upgrades the old single onFinish choice', () => {
  expect(parseTimerSettings(JSON.stringify({ durationSec: 120, onFinish: 'vibration' }))).toEqual({
    durationSec: 120,
    animation: false,
    vibration: true,
  });
  // An unknown old choice keeps the defaults.
  expect(parseTimerSettings(JSON.stringify({ onFinish: 'none' }))).toEqual(DEFAULT_TIMER_SETTINGS);
});

test('endsAt adds the duration to the start', () => {
  expect(endsAt({ startedAt: 1000, durationMs: 180_000 })).toBe(181_000);
});
