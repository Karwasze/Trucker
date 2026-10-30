import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import { StyleSheet, Text } from 'react-native';
import { State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';

import HistoryLayout from '@/app/(tabs)/history/_layout';
import PlansLayout from '@/app/(tabs)/plans/_layout';
import AppTabs, { TABS } from '@/components/app-tabs';

// These tests navigate for real, through the tabs.
jest.unmock('expo-router');
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(async () => {}) }));

function page(title: string) {
  return function Page() {
    return <Text>{title} screen</Text>;
  };
}

async function renderTabs() {
  await renderRouter(
    {
      '(tabs)/_layout': AppTabs,
      '(tabs)/(today)/index': page('Today'),
      '(tabs)/week': page('Current week'),
      '(tabs)/plans/_layout': PlansLayout,
      '(tabs)/plans/index': page('Training Plan'),
      '(tabs)/plans/goal': page('Goal'),
      '(tabs)/plans/[id]': page('Plan'),
      '(tabs)/plans/goal-calendar': page('Goal calendar'),
      '(tabs)/history/_layout': HistoryLayout,
      '(tabs)/history/index': page('History'),
      '(tabs)/history/[id]': page('Workout detail'),
      '(tabs)/history/cardio/[id]': page('Cardio detail'),
      '(tabs)/history/triathlon/[date]': page('Triathlon'),
      '(tabs)/stats/index': page('Progress'),
      '(tabs)/insights/index': page('Insights'),
      '(tabs)/achievements': page('Achievements'),
    },
    { initialUrl: '/' }
  );
}

function bar() {
  return screen.getByRole('adjustable', { name: 'Tabs' });
}

/** The focused tab, as the bar tells screen readers. */
function selectedTab() {
  return bar().props.accessibilityValue.text.split(',')[0];
}

/** Drags the bar by `dx` points and lets go at `velocityX`. */
async function swipe(dx: number, velocityX = 0) {
  await act(async () => {
    fireGestureHandler(getByGestureTestId('tabs-pan'), [
      { state: State.BEGAN, translationX: 0, velocityX: 0 },
      { state: State.ACTIVE, translationX: dx / 2, velocityX },
      { state: State.ACTIVE, translationX: dx, velocityX },
      { state: State.END, translationX: dx, velocityX },
    ]);
  });
  // The release hands the new tab back to React in a microtask, which the
  // animation library's fake timers hold until flushed.
  await act(async () => jest.runAllTicks());
}

test('all seven sections are tabs in the carousel, Today first', async () => {
  await renderTabs();
  expect(TABS.map((t) => t.name)).toEqual(['(today)', 'week', 'plans', 'history', 'stats', 'insights', 'achievements']);
  expect(bar().props.accessibilityValue.text).toBe('Today, 1 of 7');
  expect(screen.getByText('Today screen')).toBeOnTheScreen();
});

// The test window makes the bar 420 points wide: five 84-point slots.
const SLOT_CENTRES = { farLeft: 42, left: 126, centre: 210, right: 294, farRight: 378 };

/** Taps the bar `x` points from its left edge. */
async function tap(x: number) {
  await act(async () => {
    fireGestureHandler(getByGestureTestId('tabs-tap'), [
      { state: State.BEGAN, x },
      { state: State.ACTIVE, x },
      { state: State.END, x },
    ]);
  });
  await act(async () => jest.runAllTicks());
}

test('tapping a tab beside the centre opens it', async () => {
  await renderTabs();
  await tap(SLOT_CENTRES.right);
  expect(selectedTab()).toBe('Current week');
  expect(screen.getByText('Current week screen')).toBeOnTheScreen();

  await tap(SLOT_CENTRES.farLeft);
  expect(selectedTab()).toBe('Achievements');
});

test('tapping the far left tab from Today goes round the ring', async () => {
  await renderTabs();
  await tap(SLOT_CENTRES.farLeft);
  expect(selectedTab()).toBe('Insights');
});

test('tapping the centred tab goes back to its first screen', async () => {
  const { router } = jest.requireActual('expo-router');
  await renderTabs();
  await act(async () => router.navigate('/history/42'));
  expect(screen.getByText('Workout detail screen')).toBeOnTheScreen();

  await tap(SLOT_CENTRES.centre);
  expect(screen.getByText('History screen')).toBeOnTheScreen();
  expect(selectedTab()).toBe('History');
});

test('the bar has no buttons of its own to press', async () => {
  await renderTabs();
  await fireEvent.press(screen.getByText('Current week'));
  expect(selectedTab()).toBe('Today');
});

test('screen readers turn the bar by swiping up or down on it, round the ring', async () => {
  await renderTabs();
  await fireEvent(bar(), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
  expect(screen.getByText('Current week screen')).toBeOnTheScreen();
  expect(bar().props.accessibilityValue.text).toBe('Current week, 2 of 7');

  await fireEvent(bar(), 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
  await fireEvent(bar(), 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
  expect(screen.getByText('Achievements screen')).toBeOnTheScreen();
  expect(selectedTab()).toBe('Achievements');
});

test('swiping left turns to the next tab, and right back again', async () => {
  await renderTabs();
  await swipe(-100);
  expect(selectedTab()).toBe('Current week');
  expect(screen.getByText('Current week screen')).toBeOnTheScreen();

  await swipe(100);
  expect(selectedTab()).toBe('Today');
});

test('a short flick still turns one tab', async () => {
  await renderTabs();
  await swipe(-20, -800);
  expect(selectedTab()).toBe('Current week');
});

test('a hard flick spins past several tabs', async () => {
  await renderTabs();
  await swipe(-40, -2200);
  expect(selectedTab()).toBe('Insights');
  expect(screen.getByText('Insights screen')).toBeOnTheScreen();
});

test('a small drag springs back to the same tab', async () => {
  await renderTabs();
  await swipe(-20);
  expect(selectedTab()).toBe('Today');
});

test('the tabs go round in a ring: right from Today is Achievements, and left from there is Today', async () => {
  await renderTabs();
  await swipe(100);
  expect(selectedTab()).toBe('Achievements');
  expect(screen.getByText('Achievements screen')).toBeOnTheScreen();

  await swipe(-100);
  expect(selectedTab()).toBe('Today');
  expect(screen.getByText('Today screen')).toBeOnTheScreen();
});

test('swiping keeps going round past the ends', async () => {
  await renderTabs();
  await swipe(250);
  expect(selectedTab()).toBe('Progress');
});

test('the app opens on Today, which has "/" to itself', async () => {
  await renderTabs();
  expect(selectedTab()).toBe('Today');
  expect(screen.getByText('Today screen')).toBeOnTheScreen();
  await swipe(200);
  expect(selectedTab()).toBe('Insights');
});

/** Whether a style on `element` or around it takes it out of the layout. */
function undrawn(element: { props: { style?: unknown }; parent: unknown }) {
  for (let node: any = element; node; node = node.parent) {
    if (StyleSheet.flatten(node.props.style)?.display === 'none') return true;
  }
  return false;
}

test('the page sliding out can’t be read or touched, and others aren’t drawn', async () => {
  await renderTabs();
  await tap(SLOT_CENTRES.right);
  expect(screen.getByText('Current week screen')).toBeOnTheScreen();
  // Today is still drawn, sliding away, but hidden from screen readers.
  expect(screen.queryByText('Today screen')).toBeNull();
  expect(undrawn(screen.getByText('Today screen', { includeHiddenElements: true }))).toBe(false);

  // Two tabs on, Today stays loaded, keeping its state, but isn't drawn.
  await tap(SLOT_CENTRES.right);
  expect(screen.getByText('Training Plan screen')).toBeOnTheScreen();
  expect(undrawn(screen.getByText('Today screen', { includeHiddenElements: true }))).toBe(true);
  expect(undrawn(screen.getByText('Current week screen', { includeHiddenElements: true }))).toBe(false);
});

test('every tab shows its name', async () => {
  await renderTabs();
  for (const tab of TABS) expect(screen.getByText(tab.label)).toBeOnTheScreen();
});

test('follows navigation from elsewhere in the app', async () => {
  const { router } = jest.requireActual('expo-router');
  await renderTabs();
  await act(async () => router.navigate('/stats'));
  expect(screen.getByText('Progress screen')).toBeOnTheScreen();
  expect(selectedTab()).toBe('Progress');
});

test('a workout opened from elsewhere shows under History, and a goal under Training Plan', async () => {
  const { router } = jest.requireActual('expo-router');
  await renderTabs();
  await act(async () => router.navigate('/history/42'));
  expect(screen.getByText('Workout detail screen')).toBeOnTheScreen();
  expect(selectedTab()).toBe('History');

  await act(async () => router.navigate({ pathname: '/plans/goal', params: { id: 'new' } }));
  expect(screen.getByText('Goal screen')).toBeOnTheScreen();
  expect(selectedTab()).toBe('Training Plan');
});
