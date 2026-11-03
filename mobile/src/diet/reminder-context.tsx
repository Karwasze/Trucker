import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { createContext, use, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Alert, AppState } from 'react-native';

import { localDate } from '@/api/client';
import { checkInsFrom, DEFAULT_REMINDER, parseReminderPrefs, type ReminderPrefs } from '@/diet/reminder-model';
import {
  cancelCheckIns,
  listenForCheckIns,
  requestReminderPermission,
  scheduleCheckIns,
  type CheckInAnswer,
} from '@/diet/reminder-native';
import { useSettings } from '@/settings/settings-context';

const STORAGE_KEY = 'trucker.diet-reminder';

type DietReminderValue = ReminderPrefs & {
  /** Turns the check-in on, once notifications are allowed, or off. */
  setEnabled: (enabled: boolean) => Promise<void>;
  setMinutes: (minutes: number) => void;
  /** Reschedules check-ins, e.g. after today was logged or cleared. */
  sync: () => void;
  /** Goes up each time a check-in's answer is saved, so screens can reload. */
  answered: number;
};

const DietReminderContext = createContext<DietReminderValue | null>(null);

/**
 * Keeps the evening diet check-in scheduled on this device, skipping today
 * once it's logged, and records the answers given from the notification.
 */
export function DietReminderProvider({ children }: { children: ReactNode }) {
  const { api, serverUrl } = useSettings();
  const [prefs, setPrefs] = useState<ReminderPrefs>(DEFAULT_REMINDER);
  const [loaded, setLoaded] = useState(false);
  const [answered, setAnswered] = useState(0);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => setPrefs(parseReminderPrefs(raw)))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const save = useCallback((patch: Partial<ReminderPrefs>) => {
    setPrefs((p) => {
      const next = { ...p, ...patch };
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const sync = useCallback(async () => {
    if (!loaded) return;
    if (!prefs.enabled) {
      await cancelCheckIns();
      return;
    }
    const today = localDate();
    let todayLogged = false;
    try {
      todayLogged = (await api.listDiet({ from: today, to: today })).length > 0;
    } catch {
      // Offline: better a check-in too many than none.
    }
    await scheduleCheckIns(checkInsFrom(new Date(), prefs.minutes, todayLogged));
    // `api` follows serverUrl.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, prefs.enabled, prefs.minutes, serverUrl]);

  useEffect(() => {
    sync();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') sync();
    });
    return () => subscription.remove();
  }, [sync]);

  // The listener stays put, calling whatever is current.
  const onAnswer = useRef<(answer: CheckInAnswer) => void>(() => {});
  useLayoutEffect(() => {
    onAnswer.current = async ({ date, adhered }) => {
      router.navigate('/diet');
      if (adhered === null) return;
      try {
        // Keep the protein already counted for the day.
        const [logged] = await api.listDiet({ from: date, to: date });
        await api.saveDietDay({ ...logged, date, adhered });
        setAnswered((n) => n + 1);
        sync();
      } catch (e) {
        Alert.alert("Couldn't save check-in", (e as Error).message);
      }
    };
  });
  useEffect(() => listenForCheckIns((answer) => onAnswer.current(answer)), []);

  const setEnabled = async (enabled: boolean) => {
    if (enabled && !(await requestReminderPermission())) {
      Alert.alert('Notifications are off', 'Allow notifications for Trucker in Settings to get the check-in.');
      return;
    }
    save({ enabled });
  };

  return (
    <DietReminderContext value={{ ...prefs, setEnabled, setMinutes: (minutes) => save({ minutes }), sync, answered }}>
      {children}
    </DietReminderContext>
  );
}

export function useDietReminder() {
  const ctx = use(DietReminderContext);
  if (!ctx) throw new Error('useDietReminder must be used inside DietReminderProvider');
  return ctx;
}
