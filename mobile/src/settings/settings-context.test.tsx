import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import { SettingsProvider, useSettings } from '@/settings/settings-context';

const STORAGE_KEY = 'trucker.settings';
const PROD_URL = 'https://trucker.tail135e5e.ts.net';

/** Renders useSettings with `stored` (if any) in storage, once loaded. */
async function renderSettings(stored?: object) {
  if (stored) await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  const hook = await renderHook(() => useSettings(), { wrapper: SettingsProvider });
  await waitFor(() => expect(hook.result.current.loaded).toBe(true));
  return hook;
}

const stored = async () => JSON.parse((await AsyncStorage.getItem(STORAGE_KEY))!);

beforeEach(() => AsyncStorage.clear());

test('a development build starts on the local development server', async () => {
  const { result } = await renderSettings();
  expect(result.current).toMatchObject({
    environment: 'dev',
    serverLocked: false,
    serverUrl: 'http://localhost:8081',
    planId: null,
  });
  expect(result.current.servers.prod.url).toBe(PROD_URL);
});

test('the old single-server format becomes the development server', async () => {
  const { result } = await renderSettings({ serverUrl: 'http://old:8081', planId: 4 });
  expect(result.current).toMatchObject({ environment: 'dev', serverUrl: 'http://old:8081', planId: 4 });
});

test('a server saved without a URL falls back to the default but keeps its plan', async () => {
  const { result } = await renderSettings({
    environment: 'prod',
    servers: { dev: { url: 'http://dev', planId: 1 }, prod: { url: '', planId: 9 } },
  });
  expect(result.current).toMatchObject({ environment: 'prod', serverUrl: PROD_URL, planId: 9 });
});

test('each server keeps its own plan', async () => {
  const { result } = await renderSettings();
  await act(async () => result.current.update({ planId: 3 }));
  await act(async () => result.current.selectEnvironment('prod'));
  expect(result.current).toMatchObject({ environment: 'prod', planId: null });
  await act(async () => result.current.update({ planId: 8 }));
  await act(async () => result.current.selectEnvironment('dev'));
  expect(result.current.planId).toBe(3);
  expect((await stored()).servers).toEqual({
    dev: { url: 'http://localhost:8081', planId: 3 },
    prod: { url: PROD_URL, planId: 8 },
  });
});

test('changing a server’s URL forgets its plan, keeping the same URL doesn’t', async () => {
  const { result } = await renderSettings();
  await act(async () => result.current.update({ planId: 3 }));
  await act(async () => result.current.setServerUrl('dev', 'http://localhost:8081'));
  expect(result.current.planId).toBe(3);
  await act(async () => result.current.setServerUrl('dev', 'http://other:8081'));
  expect(result.current).toMatchObject({ serverUrl: 'http://other:8081', planId: null });
});

test('the API client talks to the active server', async () => {
  const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => [] });
  globalThis.fetch = fetchMock;
  const { result } = await renderSettings();
  await act(async () => result.current.selectEnvironment('prod'));
  await result.current.api.listPlans();
  expect(fetchMock).toHaveBeenCalledWith(`${PROD_URL}/api/plans`, expect.anything());
});

test('useSettings outside the provider explains itself', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  await expect(renderHook(() => useSettings())).rejects.toThrow('useSettings must be used inside SettingsProvider');
});
