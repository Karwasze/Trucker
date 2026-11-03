import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { healthWorkoutsSince, isHealthAvailable } from '@/health/healthkit';
import { importSince, useHealthImports, useHealthState } from '@/health/health-state';
import { SettingsProvider } from '@/settings/settings-context';
import { setNow } from '@/test-utils';

jest.mock('@/health/healthkit', () => ({
  isHealthAvailable: jest.fn(() => true),
  healthWorkoutsSince: jest.fn(async () => []),
  healthWorkoutReport: jest.fn(async () => []),
}));

const fetchMock = jest.fn();
globalThis.fetch = fetchMock;

const wrapper = ({ children }: { children: ReactNode }) => <SettingsProvider>{children}</SettingsProvider>;

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  jest.mocked(isHealthAvailable).mockReturnValue(true);
  fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
});

test('workouts are offered from a week before connecting', () => {
  expect(importSince('2026-10-18T10:00:00.000Z')).toEqual(new Date('2026-10-11T10:00:00.000Z'));
});

// State is cached per server for the whole app, so each test uses its own server.
async function renderOnServer<T>(server: string, hook: () => T) {
  await AsyncStorage.setItem(
    'trucker.settings',
    JSON.stringify({
      environment: 'dev',
      servers: { dev: { url: server, planId: null }, prod: { url: 'x', planId: null } },
    })
  );
  return renderHook(hook, { wrapper });
}

test('connecting is remembered per server and keeps the first connection time', async () => {
  const { result } = await renderOnServer('http://a', () => useHealthState());
  await waitFor(() => expect(result.current.loaded).toBe(true));
  expect(result.current.state).toEqual({ connectedAt: null, dismissed: [] });

  await act(() => result.current.connect());
  const connectedAt = result.current.state.connectedAt;
  expect(connectedAt).not.toBeNull();
  await act(() => result.current.connect());
  expect(result.current.state.connectedAt).toBe(connectedAt);
  expect(JSON.parse((await AsyncStorage.getItem('trucker.health:http://a'))!)).toMatchObject({ connectedAt });

  await act(() => result.current.disconnect());
  expect(result.current.state).toEqual({ connectedAt: null, dismissed: [] });
});

test('dismissals are kept without duplicates', async () => {
  const { result } = await renderOnServer('http://b', () => useHealthState());
  await waitFor(() => expect(result.current.loaded).toBe(true));
  await act(() => result.current.dismiss(['x', 'y']));
  await act(() => result.current.dismiss(['y', 'z']));
  expect(result.current.state.dismissed).toEqual(['x', 'y', 'z']);

  await act(() => result.current.restore(['y']));
  expect(result.current.state.dismissed).toEqual(['x', 'z']);
});

test('imports skip workouts already imported or dismissed', async () => {
  await AsyncStorage.setItem(
    'trucker.health:http://c',
    JSON.stringify({ connectedAt: '2026-10-18T10:00:00.000Z', dismissed: ['gone'] })
  );
  fetchMock.mockResolvedValue({ ok: true, json: async () => [{ id: 1, source_uuid: 'done' }, { id: 2 }] });
  jest.mocked(healthWorkoutsSince).mockResolvedValue([
    {
      source_uuid: 'new',
      date: '2026-10-18',
      started_at: '2026-10-18T07:00:00+02:00',
      activity: 'running',
      duration_seconds: 60,
    },
  ]);

  const { result } = await renderOnServer('http://c', () => useHealthImports());
  await waitFor(() => expect(result.current.candidates).toHaveLength(1));
  expect(fetchMock).toHaveBeenCalledWith('http://c/api/cardio', expect.anything());
  const [since, known] = jest.mocked(healthWorkoutsSince).mock.calls[0];
  expect(since).toEqual(new Date('2026-10-11T10:00:00.000Z'));
  expect([...known].sort()).toEqual(['done', 'gone']);
});

test('nothing is imported until Health is connected, or where it’s unavailable', async () => {
  const notConnected = await renderOnServer('http://d', () => useHealthImports());
  await act(async () => {});
  expect(notConnected.result.current.candidates).toEqual([]);

  jest.mocked(isHealthAvailable).mockReturnValue(false);
  await AsyncStorage.setItem('trucker.health:http://e', JSON.stringify({ connectedAt: '2026-10-18T10:00:00.000Z' }));
  await renderOnServer('http://e', () => useHealthImports());
  await act(async () => {});
  expect(healthWorkoutsSince).not.toHaveBeenCalled();
});

afterEach(() => jest.useRealTimers());

test('workouts dismissed this week can be restored to the imports', async () => {
  setNow('2026-10-31T12:00:00+01:00');
  await AsyncStorage.setItem(
    'trucker.health:http://f',
    JSON.stringify({ connectedAt: '2026-10-18T10:00:00.000Z', dismissed: ['thu', 'old'] })
  );
  fetchMock.mockResolvedValue({ ok: true, json: async () => [{ id: 1, source_uuid: 'done' }] });
  const thu = {
    source_uuid: 'thu',
    date: '2026-10-29',
    started_at: '2026-10-29T07:00:00+01:00',
    activity: 'running' as const,
    duration_seconds: 2400,
  };
  // Health leaves out what it's told to skip; a workout not dismissed isn't restorable.
  jest
    .mocked(healthWorkoutsSince)
    .mockImplementation(async (_since, skip) =>
      [thu, { ...thu, source_uuid: 'other' }].filter((w) => !skip.has(w.source_uuid))
    );

  const { result } = await renderOnServer('http://f', () => [useHealthImports(), useHealthState()] as const);
  await waitFor(() => expect(result.current[0].dismissedThisWeek).toEqual([thu]));
  expect(result.current[0].candidates.map((w) => w.source_uuid)).toEqual(['other']);
  // Only from this week's Monday, local time.
  const [since, skip] = jest.mocked(healthWorkoutsSince).mock.calls[1];
  expect(since).toEqual(new Date('2026-10-26T00:00:00+01:00'));
  expect([...skip].sort()).toEqual(['done', 'other']);

  await act(() => result.current[1].restore(['thu']));
  expect(result.current[0].candidates.map((w) => w.source_uuid)).toEqual(['other', 'thu']);
  expect(result.current[0].dismissedThisWeek).toEqual([]);
});
