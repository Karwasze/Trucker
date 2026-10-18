import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, screen, userEvent } from '@testing-library/react-native';
import { AppState } from 'react-native';

import { renderInApp, selectPlan } from '@/test-utils';
import { TimerIsland } from '@/timer/timer-island';

beforeEach(async () => {
  jest.useFakeTimers({ now: new Date('2026-10-18T10:00:00Z'), advanceTimers: true });
  Object.assign(AppState, { currentState: 'active' });
  await AsyncStorage.clear();
  await selectPlan(null);
});
afterEach(() => jest.useRealTimers());

// On an iPhone with a Dynamic Island, where the idle island can be tapped.
const island = () => screen.getByRole('button', { name: /timer|Rest over/ });

test('tapping the idle island starts the timer, which counts up', async () => {
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
  await renderInApp(<TimerIsland />, { topInset: 59 });
  expect(island()).toHaveAccessibleName('Start rest timer');
  await user.press(island());
  expect(island()).toHaveAccessibleName('Rest timer, 0:00 of 3:00. Tap to expand.');
  await act(async () => jest.advanceTimersByTime(65_000));
  expect(island()).toHaveAccessibleName('Rest timer, 1:05 of 3:00. Tap to expand.');
});

test('expanded, the timer can be restarted or stopped', async () => {
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
  await renderInApp(<TimerIsland />, { topInset: 59 });
  await user.press(island());
  await act(async () => jest.advanceTimersByTime(30_000));
  await user.press(island());
  expect(screen.getByText('Rest')).toBeOnTheScreen();

  await user.press(screen.getByRole('button', { name: 'Restart' }));
  expect(screen.getByText('0:00')).toBeOnTheScreen();
  await user.press(screen.getByRole('button', { name: 'Stop' }));
  expect(island()).toHaveAccessibleName('Start rest timer');
});

test('finishing celebrates until dismissed', async () => {
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
  await renderInApp(<TimerIsland />, { topInset: 59 });
  await user.press(island());
  await act(async () => jest.advanceTimersByTime(181_000));
  expect(island()).toHaveAccessibleName('Rest over. Tap to dismiss.');
  await user.press(island());
  expect(island()).toHaveAccessibleName('Start rest timer');
});

test('the celebration goes by itself after a few seconds', async () => {
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
  await renderInApp(<TimerIsland />, { topInset: 59 });
  await user.press(island());
  await act(async () => jest.advanceTimersByTime(181_000));
  await act(async () => jest.advanceTimersByTime(3_000));
  expect(island()).toHaveAccessibleName('Start rest timer');
});

test('without a notch or island, the idle island isn’t a tap target', async () => {
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
  await renderInApp(<TimerIsland />, { topInset: 20 });
  await user.press(island());
  expect(island()).toHaveAccessibleName('Start rest timer');
});
