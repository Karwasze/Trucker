import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

import { useQuery } from '@/hooks/use-query';
import { healthWorkoutsSince, isHealthAvailable } from '@/health/healthkit';
import { useSettings } from '@/settings/settings-context';

/**
 * Apple Health import state, per server since each has its own workouts:
 * when Health was connected (only workouts from then on are offered) and
 * the Health workouts the lifter chose not to import.
 */
export type HealthState = {
  connectedAt: string | null;
  dismissed: string[];
};

const EMPTY: HealthState = { connectedAt: null, dismissed: [] };
const storageKey = (serverUrl: string) => `trucker.health:${serverUrl}`;

// Shared between screens, so dismissing in the import sheet updates History.
const cache = new Map<string, HealthState>();
const listeners = new Set<() => void>();

async function load(serverUrl: string): Promise<HealthState> {
  const cached = cache.get(serverUrl);
  if (cached) return cached;
  let state = EMPTY;
  try {
    const raw = await AsyncStorage.getItem(storageKey(serverUrl));
    if (raw) state = { ...EMPTY, ...(JSON.parse(raw) as Partial<HealthState>) };
  } catch {}
  cache.set(serverUrl, state);
  return state;
}

async function save(serverUrl: string, update: (s: HealthState) => HealthState) {
  const next = update(await load(serverUrl));
  cache.set(serverUrl, next);
  listeners.forEach((l) => l());
  await AsyncStorage.setItem(storageKey(serverUrl), JSON.stringify(next)).catch(() => {});
}

/** The active server's Health state, and ways to change it. */
export function useHealthState() {
  const { serverUrl } = useSettings();
  const [state, setState] = useState<HealthState | undefined>(cache.get(serverUrl));

  useEffect(() => {
    let active = true;
    const sync = () => load(serverUrl).then((s) => active && setState(s));
    sync();
    listeners.add(sync);
    return () => {
      active = false;
      listeners.delete(sync);
    };
  }, [serverUrl]);

  const connect = useCallback(
    () => save(serverUrl, (s) => ({ ...s, connectedAt: s.connectedAt ?? new Date().toISOString() })),
    [serverUrl]
  );
  const disconnect = useCallback(() => save(serverUrl, () => EMPTY), [serverUrl]);
  const dismiss = useCallback(
    (uuids: string[]) =>
      save(serverUrl, (s) => ({ ...s, dismissed: [...new Set([...s.dismissed, ...uuids])] })),
    [serverUrl]
  );

  return { state: state ?? EMPTY, loaded: state !== undefined, connect, disconnect, dismiss };
}

/**
 * Health workouts since Health was connected that aren't imported or
 * dismissed yet, oldest first. Refreshes when the screen gains focus.
 */
export function useHealthImports() {
  const { api, serverUrl } = useSettings();
  const { state } = useHealthState();
  const connectedAt = state.connectedAt;
  const query = useQuery(
    connectedAt && isHealthAvailable() ? `health-imports:${serverUrl}:${connectedAt}` : null,
    async () => {
      const imported = await api.listCardio();
      const known = new Set(imported.flatMap((w) => (w.source_uuid ? [w.source_uuid] : [])));
      // Dismissals read fresh, so a dismissal made since the last load counts.
      (await load(serverUrl)).dismissed.forEach((uuid) => known.add(uuid));
      return healthWorkoutsSince(new Date(connectedAt!), known);
    }
  );
  const dismissed = new Set(state.dismissed);
  const candidates = (query.data ?? []).filter((w) => !w.source_uuid || !dismissed.has(w.source_uuid));
  return { ...query, candidates };
}
