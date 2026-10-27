import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

import { useQuery } from '@/hooks/use-query';
import {
  connectHealth,
  healthHeartRateProfile,
  healthWorkoutReport,
  healthWorkoutsSince,
  isHealthAvailable,
} from '@/health/healthkit';
import { heartRateZones, maxHeartRate, type HeartRateZone } from '@/health/zones';
import { useSettings } from '@/settings/settings-context';

/**
 * Apple Health import state, per server since each has its own workouts:
 * when Health was connected (workouts from IMPORT_LOOKBACK_DAYS before then
 * on are offered) and the Health workouts the lifter chose not to import.
 */
export type HealthState = {
  connectedAt: string | null;
  dismissed: string[];
};

/**
 * Days before connecting whose workouts are offered too, so connecting (or
 * reconnecting) after a workout still offers it. UUIDs keep them from being
 * imported twice.
 */
export const IMPORT_LOOKBACK_DAYS = 7;

/** The earliest start of a workout offered for import. */
export function importSince(connectedAt: string): Date {
  return new Date(new Date(connectedAt).getTime() - IMPORT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
}

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
    (uuids: string[]) => save(serverUrl, (s) => ({ ...s, dismissed: [...new Set([...s.dismissed, ...uuids])] })),
    [serverUrl]
  );

  return { state: state ?? EMPTY, loaded: state !== undefined, connect, disconnect, dismiss };
}

/**
 * Health workouts since importSince that aren't imported or dismissed yet,
 * oldest first. Refreshes when the screen gains focus.
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
      return healthWorkoutsSince(importSince(connectedAt!), known);
    }
  );
  const dismissed = new Set(state.dismissed);
  const candidates = (query.data ?? []).filter((w) => !w.source_uuid || !dismissed.has(w.source_uuid));
  return { ...query, candidates };
}

/**
 * Every Health workout around and since the connection, with why each is or
 * isn't offered. Only loads when `enabled`, as it's just for diagnosing.
 */
export function useHealthReport(enabled: boolean) {
  const { api, serverUrl } = useSettings();
  const { state } = useHealthState();
  const connectedAt = state.connectedAt;
  return useQuery(
    enabled && connectedAt && isHealthAvailable() ? `health-report:${serverUrl}:${connectedAt}` : null,
    async () => {
      const imported = await api.listCardio();
      const importedUuids = new Set(imported.flatMap((w) => (w.source_uuid ? [w.source_uuid] : [])));
      const dismissed = new Set((await load(serverUrl)).dismissed);
      return healthWorkoutReport(importSince(connectedAt!), importedUuids, dismissed);
    }
  );
}

/**
 * Heart rate zones worked out from the birth date and resting heart rate in
 * Health, or what's missing for them. Undefined until loaded, and while
 * Health isn't connected.
 */
export type HeartRateZones =
  { zones: HeartRateZone[]; max: number; resting: number } | { missing: ('birth date' | 'resting heart rate')[] };

export function useHeartRateZones() {
  const { state } = useHealthState();
  return useQuery<HeartRateZones>(state.connectedAt && isHealthAvailable() ? 'heart-rate-zones' : null, async () => {
    // Asks for the birth date and resting heart rate when connected before they were read.
    await connectHealth();
    const { dateOfBirth, restingHeartRate } = await healthHeartRateProfile();
    if (!dateOfBirth || !restingHeartRate) {
      return {
        missing: [
          ...(dateOfBirth ? [] : ['birth date' as const]),
          ...(restingHeartRate ? [] : ['resting heart rate' as const]),
        ],
      };
    }
    const max = maxHeartRate(dateOfBirth, new Date());
    return { zones: heartRateZones(max, restingHeartRate), max, resting: restingHeartRate };
  });
}
