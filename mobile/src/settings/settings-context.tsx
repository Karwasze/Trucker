import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { createContext, use, useEffect, useMemo, useState, type ReactNode } from 'react';

import { createApi, type Api } from '@/api/client';

const STORAGE_KEY = 'trucker.settings';
const API_PORT = 8081;

type Settings = {
  serverUrl: string;
  planId: number | null;
};

type SettingsContextValue = Settings & {
  loaded: boolean;
  api: Api;
  update: (patch: Partial<Settings>) => void;
};

/**
 * Picks a starting server URL: EXPO_PUBLIC_API_URL if set, otherwise the
 * machine running the Expo dev server (the Go API usually runs there too).
 */
function defaultServerUrl() {
  if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL;
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  return `http://${host ?? 'localhost'}:${API_PORT}`;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>({ serverUrl: defaultServerUrl(), planId: null });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) setSettings((s) => ({ ...s, ...JSON.parse(raw) }));
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const value = useMemo<SettingsContextValue>(
    () => ({
      ...settings,
      loaded,
      api: createApi(settings.serverUrl),
      update: (patch) =>
        setSettings((s) => {
          const next = { ...s, ...patch };
          AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
          return next;
        }),
    }),
    [settings, loaded]
  );

  return <SettingsContext value={value}>{children}</SettingsContext>;
}

export function useSettings() {
  const ctx = use(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside SettingsProvider');
  return ctx;
}
