/** What can happen when the timer reaches its target; each is toggled on its own. */
export type FinishBehavior = 'animation' | 'vibration';

export type TimerSettings = {
  /** The target the timer counts up to, e.g. 180 for 3:00. */
  durationSec: number;
} & Record<FinishBehavior, boolean>;

/** A timer that is counting; stored as wall-clock times so it survives restarts. */
export type RunningTimer = {
  startedAt: number;
  durationMs: number;
};

export const DEFAULT_TIMER_SETTINGS: TimerSettings = {
  durationSec: 180,
  animation: true,
  vibration: false,
};

export const MIN_DURATION_SEC = 15;
export const MAX_DURATION_SEC = 30 * 60;
export const DURATION_STEP_SEC = 15;

export const FINISH_BEHAVIOR_NAMES: Record<FinishBehavior, string> = {
  animation: 'Animation',
  vibration: 'Vibration',
};

export const clampDuration = (sec: number) => Math.min(MAX_DURATION_SEC, Math.max(MIN_DURATION_SEC, Math.round(sec)));

/** Formats milliseconds as M:SS, rounding down to whole seconds. */
export function formatClock(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const seconds = total % 60;
  return `${Math.floor(total / 60)}:${seconds < 10 ? '0' : ''}${seconds}`;
}

/** Reads stored settings, falling back to the defaults for anything missing or invalid. */
export function parseTimerSettings(raw: string | null): TimerSettings {
  if (!raw) return DEFAULT_TIMER_SETTINGS;
  try {
    const stored = JSON.parse(raw);
    const flag = (behavior: FinishBehavior) =>
      typeof stored[behavior] === 'boolean'
        ? stored[behavior]
        : // Older versions stored a single choice as onFinish.
          stored.onFinish in FINISH_BEHAVIOR_NAMES
          ? stored.onFinish === behavior
          : DEFAULT_TIMER_SETTINGS[behavior];
    return {
      durationSec:
        typeof stored.durationSec === 'number' ? clampDuration(stored.durationSec) : DEFAULT_TIMER_SETTINGS.durationSec,
      animation: flag('animation'),
      vibration: flag('vibration'),
    };
  } catch {
    return DEFAULT_TIMER_SETTINGS;
  }
}

export const endsAt = (timer: RunningTimer) => timer.startedAt + timer.durationMs;
