import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { createContext, use, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';

import { createApi, type Api } from '@/api/client';

const STORAGE_KEY = 'trucker.settings';
const API_PORT = 8081;
const PROD_URL = 'https://trucker.tail135e5e.ts.net';

export type Environment = 'dev' | 'prod';

/**
 * Release builds (e.g. `npm run ios:release`) only talk to the production
 * server, and Settings can't switch or edit it.
 */
const SERVER_LOCKED = !__DEV__;

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
  /** Whether the server is fixed by the build (see SERVER_LOCKED). */
  serverLocked: boolean;
  /** The active server's URL and plan. */
  serverUrl: string;
  planId: number | null;
  api: Api;
  /** Updates the active server's plan. */
  update: (patch: { planId: number | null }) => void;
  /** These two do nothing while the server is locked. */
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

/**
 * Picks a starting production URL: EXPO_PUBLIC_PROD_API_URL if set; on the web,
 * the page's own origin (nginx proxies /api/ to the server); otherwise PROD_URL.
 */
function defaultProdUrl() {
  if (process.env.EXPO_PUBLIC_PROD_API_URL) return process.env.EXPO_PUBLIC_PROD_API_URL;
  if (Platform.OS === 'web' && typeof window !== 'undefined') return window.location.origin;
  return PROD_URL;
}

const defaults: Settings = {
  // Release builds use production; dev builds start on the local API.
  environment: SERVER_LOCKED ? 'prod' : 'dev',
  servers: {
    dev: { url: defaultDevUrl(), planId: null },
    prod: { url: defaultProdUrl(), planId: null },
  },
};

/**
 * Reads stored settings. In a release build, a plan picked while the
 * production URL was saved as the development server carries over to
 * production.
 */
function parseStored(raw: string): Settings {
  const settings = parseStoredServers(raw);
  const { dev, prod } = settings.servers;
  if (SERVER_LOCKED && prod.planId === null && dev.url === defaults.servers.prod.url) {
    return { ...settings, servers: { ...settings.servers, prod: { ...prod, planId: dev.planId } } };
  }
  return settings;
}

/** Reads stored settings, upgrading the old single-server format. */
function parseStoredServers(raw: string): Settings {
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
    // A locked build overrides whatever was stored.
    const environment = SERVER_LOCKED ? 'prod' : settings.environment;
    const servers = SERVER_LOCKED
      ? { ...settings.servers, prod: { ...settings.servers.prod, url: defaults.servers.prod.url } }
      : settings.servers;
    const active = servers[environment];

    return {
      loaded,
      environment,
      servers,
      serverLocked: SERVER_LOCKED,
      serverUrl: active.url,
      planId: active.planId,
      api: createApi(active.url),
      update: (patch) => save((s) => patchServer(s, environment, patch)),
      selectEnvironment: (env) => {
        if (!SERVER_LOCKED) save((s) => ({ ...s, environment: env }));
      },
      // A different server has different plans, so its selection no longer applies.
      setServerUrl: (env, url) => {
        if (SERVER_LOCKED) return;
        save((s) => (s.servers[env].url === url ? s : patchServer(s, env, { url, planId: null })));
      },
    };
  }, [settings, loaded]);

  return <SettingsContext value={value}>{children}</SettingsContext>;
}

export function useSettings() {
  const ctx = use(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside SettingsProvider');
  return ctx;
}
