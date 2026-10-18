import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';

import { cancelFinishAlert, scheduleFinishAlert, syncLiveActivity, vibrate } from '@/timer/native';
import { TimerProvider, useTimer } from '@/timer/timer-context';
import { MIN_DURATION_SEC } from '@/timer/timer-model';

jest.mock('@/timer/native', () => ({
  cancelFinishAlert: jest.fn(),
  scheduleFinishAlert: jest.fn(),
  syncLiveActivity: jest.fn(),
  vibrate: jest.fn(),
}));

const NOW = new Date('2026-10-18T10:00:00Z').getTime();

/** Sets what the (mocked) AppState reports, as the app moves to and from the background. */
const setAppState = (state: AppStateStatus) => Object.assign(AppState, { currentState: state });

/** Tells the timer's AppState listeners about a change. */
function emitAppState(state: AppStateStatus) {
  setAppState(state);
  for (const [, listener] of jest.mocked(AppState.addEventListener).mock.calls) listener(state);
}

async function renderTimer() {
  const hook = await renderHook(() => useTimer(), { wrapper: TimerProvider });
  // Let stored settings and any running timer load.
  await act(async () => {});
  return hook;
}

beforeEach(async () => {
  jest.useFakeTimers({ now: NOW });
  jest.clearAllMocks();
  setAppState('active');
  await AsyncStorage.clear();
});
afterEach(() => jest.useRealTimers());

test('start runs the timer for the set duration, and finishing celebrates', async () => {
  const { result } = await renderTimer();
  await act(async () => result.current.start());
  expect(result.current.running).toEqual({ startedAt: NOW, durationMs: 180_000 });
  expect(syncLiveActivity).toHaveBeenLastCalledWith({ startedAt: NOW, durationMs: 180_000 });

  await act(async () => jest.advanceTimersByTime(179_000));
  expect(result.current.running).not.toBeNull();
  await act(async () => jest.advanceTimersByTime(2_000));
  expect(result.current.running).toBeNull();
  expect(result.current.celebration).toBe(1);
  expect(vibrate).not.toHaveBeenCalled();
});

test('with vibration on, an alert is scheduled and the phone buzzes on finish', async () => {
  const { result } = await renderTimer();
  await act(async () => result.current.updateSettings({ vibration: true, animation: false }));
  await act(async () => result.current.start());
  expect(scheduleFinishAlert).toHaveBeenCalledWith(result.current.running);

  await act(async () => jest.advanceTimersByTime(181_000));
  expect(vibrate).toHaveBeenCalledTimes(1);
  expect(result.current.celebration).toBe(0);
});

test('stopping cancels the alert and forgets the timer', async () => {
  const { result } = await renderTimer();
  await act(async () => result.current.start());
  await act(async () => result.current.stop());
  expect(result.current.running).toBeNull();
  expect(cancelFinishAlert).toHaveBeenCalled();
  expect(await AsyncStorage.getItem('trucker.timer.running')).toBeNull();
});

test('settings are clamped and persisted', async () => {
  const { result } = await renderTimer();
  await act(async () => result.current.updateSettings({ durationSec: 1 }));
  expect(result.current.settings.durationSec).toBe(MIN_DURATION_SEC);
  expect(JSON.parse((await AsyncStorage.getItem('trucker.timer.settings'))!)).toMatchObject({
    durationSec: MIN_DURATION_SEC,
  });
});

test('a timer still running survives a relaunch', async () => {
  await AsyncStorage.setItem('trucker.timer.running', JSON.stringify({ startedAt: NOW - 60_000, durationMs: 180_000 }));
  const { result } = await renderTimer();
  expect(result.current.running).toEqual({ startedAt: NOW - 60_000, durationMs: 180_000 });
});

test('a timer that ended long ago while closed is dropped without celebrating', async () => {
  await AsyncStorage.setItem(
    'trucker.timer.running',
    JSON.stringify({ startedAt: NOW - 3_600_000, durationMs: 180_000 })
  );
  const { result } = await renderTimer();
  await act(async () => jest.advanceTimersByTime(100));
  expect(result.current.running).toBeNull();
  expect(result.current.celebration).toBe(0);
});

test('a timer that ends while backgrounded finishes when the app returns', async () => {
  const { result } = await renderTimer();
  await act(async () => result.current.start());
  setAppState('background');
  await act(async () => jest.advanceTimersByTime(181_000));
  expect(result.current.running).not.toBeNull();

  await act(async () => emitAppState('active'));
  expect(result.current.running).toBeNull();
  expect(result.current.celebration).toBe(1);
});
