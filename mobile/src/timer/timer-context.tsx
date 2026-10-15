import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';

import {
  cancelFinishAlert,
  scheduleFinishAlert,
  syncLiveActivity,
  vibrate,
} from '@/timer/native';
import {
  clampDuration,
  endsAt,
  parseTimerSettings,
  DEFAULT_TIMER_SETTINGS,
  type RunningTimer,
  type TimerSettings,
} from '@/timer/timer-model';

const SETTINGS_KEY = 'trucker.timer.settings';
const RUNNING_KEY = 'trucker.timer.running';

/** A timer that ended longer ago than this while the app was closed is dropped quietly. */
const STALE_FINISH_MS = 5 * 60 * 1000;

type TimerContextValue = {
  settings: TimerSettings;
  updateSettings: (patch: Partial<TimerSettings>) => void;
  running: RunningTimer | null;
  start: () => void;
  stop: () => void;
  /** Bumped each time a finish animation should play. */
  celebration: number;
};

const TimerContext = createContext<TimerContextValue | null>(null);

export function TimerProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<TimerSettings>(DEFAULT_TIMER_SETTINGS);
  const [running, setRunningState] = useState<RunningTimer | null>(null);
  const [celebration, setCelebration] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.multiGet([SETTINGS_KEY, RUNNING_KEY])
      .then(([[, rawSettings], [, rawRunning]]) => {
        setSettings(parseTimerSettings(rawSettings));
        if (rawRunning) setRunningState(JSON.parse(rawRunning) as RunningTimer);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const setRunning = useCallback((next: RunningTimer | null) => {
    setRunningState(next);
    if (next) AsyncStorage.setItem(RUNNING_KEY, JSON.stringify(next)).catch(() => {});
    else AsyncStorage.removeItem(RUNNING_KEY).catch(() => {});
  }, []);

  const stop = useCallback(() => {
    setRunning(null);
    cancelFinishAlert();
  }, [setRunning]);

  const start = useCallback(() => {
    const timer = { startedAt: Date.now(), durationMs: settings.durationSec * 1000 };
    setRunning(timer);
  }, [settings.durationSec, setRunning]);

  // The background alert follows the setting, even when it changes mid-timer.
  // Scheduling again replaces the previous alert.
  useEffect(() => {
    if (running && settings.vibration) scheduleFinishAlert(running);
    else cancelFinishAlert();
  }, [running, settings.vibration]);

  // Waits for the stored timer, so a relaunch keeps the activity it left running.
  useEffect(() => {
    if (loaded) syncLiveActivity(running);
  }, [loaded, running]);

  // Fires the finish behavior once the target is reached. While the app is in
  // the background nothing runs, so this also catches up when it returns.
  useEffect(() => {
    if (!running) return;
    const finish = () => {
      if (AppState.currentState !== 'active') return;
      const late = Date.now() - endsAt(running);
      if (late < 0) return;
      stop();
      if (late > STALE_FINISH_MS) return;
      if (settings.animation) setCelebration((n) => n + 1);
      // Within a second the phone was awake to vibrate; otherwise the scheduled alert already did.
      if (settings.vibration && late < 1000) vibrate();
    };
    // A little slack so the timeout can't fire a moment before the end and be missed.
    const timeout = setTimeout(finish, Math.max(0, endsAt(running) - Date.now()) + 50);
    const subscription = AppState.addEventListener('change', finish);
    return () => {
      clearTimeout(timeout);
      subscription.remove();
    };
  }, [running, stop, settings.animation, settings.vibration]);

  const value = useMemo<TimerContextValue>(
    () => ({
      settings,
      updateSettings: (patch) =>
        setSettings((s) => {
          const next = { ...s, ...patch };
          next.durationSec = clampDuration(next.durationSec);
          AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next)).catch(() => {});
          return next;
        }),
      running,
      start,
      stop,
      celebration,
    }),
    [settings, running, start, stop, celebration]
  );

  return <TimerContext value={value}>{children}</TimerContext>;
}

export function useTimer() {
  const ctx = use(TimerContext);
  if (!ctx) throw new Error('useTimer must be used inside TimerProvider');
  return ctx;
}
