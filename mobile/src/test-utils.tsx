import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { Alert, type AlertButton } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { TestInstance } from 'test-renderer';

import { SettingsProvider } from '@/settings/settings-context';
import { TimerProvider } from '@/timer/timer-context';

/** The development server the app talks to in tests, unless settings say otherwise. */
export const SERVER = 'http://localhost:8081';

/** A request the fake server received. */
export type Request = { method: string; path: string; query: URLSearchParams; body: unknown };

/**
 * Answers fetches from `routes`, keyed by "METHOD /path" (no query string),
 * with either a JSON body or a function of the request returning one. Other
 * requests fail with 404. Returns the requests received, in order.
 */
export function mockServer(routes: Record<string, unknown>) {
  const requests: Request[] = [];
  globalThis.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    const request = {
      method,
      path: url.pathname,
      query: url.searchParams,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    };
    requests.push(request);
    const key = `${method} ${url.pathname}`;
    if (!(key in routes)) {
      return { ok: false, status: 404, text: async () => `No route for ${key}` } as Response;
    }
    const route = routes[key];
    const data = typeof route === 'function' ? await route(request) : route;
    return { ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data) } as Response;
  });
  return requests;
}

/**
 * Stores app settings with `planId` active on the development server, at
 * `server`. Apple Health state is cached per server for the app's lifetime,
 * so tests that change it use a server of their own.
 */
export const selectPlan = (planId: number | null, server = SERVER) =>
  AsyncStorage.setItem(
    'trucker.settings',
    JSON.stringify({ environment: 'dev', servers: { dev: { url: server, planId }, prod: { url: '', planId: null } } })
  );

/**
 * Renders a screen inside the providers the app wraps every screen in, on a
 * 390 × 844 pt screen with `topInset` above the content (59 on an iPhone with
 * a Dynamic Island).
 */
export const renderInApp = (ui: ReactElement, { topInset = 0 } = {}) =>
  render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: topInset, left: 0, right: 0, bottom: 0 },
      }}>
      <SettingsProvider>
        <TimerProvider>{ui}</TimerProvider>
      </SettingsProvider>
    </SafeAreaProvider>
  );

/**
 * Records Alert.alert calls; `press` taps a button of the latest one by its
 * text, as the user would in the dialog.
 */
export function mockAlerts() {
  const spy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const latest = () => {
    const call = spy.mock.calls.at(-1);
    if (!call) throw new Error('No alert was shown');
    const [title, message, buttons] = call;
    return { title, message, buttons: (buttons ?? []) as AlertButton[] };
  };
  return {
    latest,
    press: async (text: string) => {
      const button = latest().buttons.find((b) => b.text === text);
      if (!button) throw new Error(`No "${text}" button in the alert`);
      await act(async () => button.onPress?.());
    },
  };
}

/** Lays out `element` at `width` pixels, as onLayout would on a device. */
export const layout = (element: TestInstance, width: number) =>
  fireEvent(element, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width, height: 180 } } });

/** Touches a chart `x` pixels from its left edge, then optionally lets go. */
export async function touchChart(chart: TestInstance, x: number) {
  await fireEvent(chart, 'responderGrant', { nativeEvent: { locationX: x } });
}
export const releaseChart = (chart: TestInstance) => fireEvent(chart, 'responderRelease', {});

/** Host elements of a native type, e.g. the RNSVGRect bars of a chart. */
export const allOfType = (type: string) => screen.container.queryAll((node) => node.type === type);

/**
 * Sets the current date and time; the clock keeps running from there, so
 * timers fire and waits time out as usual. Undo with jest.useRealTimers().
 */
export function setNow(iso: string) {
  jest.useFakeTimers({ now: new Date(iso), advanceTimers: true });
}
