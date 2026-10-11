import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { createContext, use, useEffect, useMemo, useState, type ReactNode } from 'react';

import { createApi, type Api } from '@/api/client';

const STORAGE_KEY = 'trucker.settings';
const API_PORT = 8081;
const PROD_URL = 'https://trucker.tail135e5e.ts.net';

export type Environment = 'dev' | 'prod';

export const ENVIRONMENT_NAMES: Record<Environment, string> = {
  dev: 'Development',
  prod: 'Production',
};

/** Each server keeps its own active plan, since plan IDs differ between databases. */
type ServerSettings = {
  url: string;
  planId: number | null;
};

type Settings = {
  environment: Environment;
  servers: Record<Environment, ServerSettings>;
};

type SettingsContextValue = {
  loaded: boolean;
  environment: Environment;
  servers: Record<Environment, ServerSettings>;
  /** The active server's URL and plan. */
  serverUrl: string;
  planId: number | null;
  api: Api;
  /** Updates the active server's plan. */
  update: (patch: { planId: number | null }) => void;
  selectEnvironment: (environment: Environment) => void;
  setServerUrl: (environment: Environment, url: string) => void;
};

/**
 * Picks a starting development URL: EXPO_PUBLIC_API_URL if set, otherwise the
 * machine running the Expo dev server (the Go API usually runs there too).
 */
function defaultDevUrl() {
  if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL;
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  return `http://${host ?? 'localhost'}:${API_PORT}`;
}

const defaults: Settings = {
  // Release builds start on production; dev builds on the local API.
  environment: __DEV__ ? 'dev' : 'prod',
  servers: {
    dev: { url: defaultDevUrl(), planId: null },
    prod: { url: process.env.EXPO_PUBLIC_PROD_API_URL ?? PROD_URL, planId: null },
  },
};

/** Reads stored settings, upgrading the old single-server format. */
function parseStored(raw: string): Settings {
  const stored = JSON.parse(raw);
  if (stored.servers) {
    // A server saved without a URL falls back to the default one.
    const server = (env: Environment): ServerSettings => {
      const saved = stored.servers[env];
      return saved?.url ? saved : { ...defaults.servers[env], planId: saved?.planId ?? null };
    };
    return {
      environment: stored.environment ?? defaults.environment,
      servers: { dev: server('dev'), prod: server('prod') },
    };
  }
  // Before environments existed there was one server URL; keep it as dev.
  return {
    environment: 'dev',
    servers: {
      ...defaults.servers,
      dev: { url: stored.serverUrl ?? defaults.servers.dev.url, planId: stored.planId ?? null },
    },
  };
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(defaults);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) setSettings(parseStored(raw));
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const value = useMemo<SettingsContextValue>(() => {
    const save = (change: (s: Settings) => Settings) =>
      setSettings((s) => {
        const next = change(s);
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
        return next;
      });
    const patchServer = (s: Settings, env: Environment, patch: Partial<ServerSettings>) => ({
      ...s,
      servers: { ...s.servers, [env]: { ...s.servers[env], ...patch } },
    });
    const active = settings.servers[settings.environment];

    return {
      loaded,
      environment: settings.environment,
      servers: settings.servers,
      serverUrl: active.url,
      planId: active.planId,
      api: createApi(active.url),
      update: (patch) => save((s) => patchServer(s, s.environment, patch)),
      selectEnvironment: (environment) => save((s) => ({ ...s, environment })),
      // A different server has different plans, so its selection no longer applies.
      setServerUrl: (env, url) =>
        save((s) => (s.servers[env].url === url ? s : patchServer(s, env, { url, planId: null }))),
    };
  }, [settings, loaded]);

  return <SettingsContext value={value}>{children}</SettingsContext>;
}

export function useSettings() {
  const ctx = use(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside SettingsProvider');
  return ctx;
}
