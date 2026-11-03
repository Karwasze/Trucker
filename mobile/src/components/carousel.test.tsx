import { act, render, screen } from '@testing-library/react-native';
import { isLiquidGlassAvailable } from 'expo-glass-effect';
import { StyleSheet, View } from 'react-native';
import { getAnimatedStyle } from 'react-native-reanimated';

import { Carousel } from '@/components/carousel';
import { Colors } from '@/constants/theme';

jest.mock('expo-glass-effect', () => {
  const { View } = jest.requireActual('react-native');
  return {
    isLiquidGlassAvailable: jest.fn(() => false),
    GlassView: (props: object) => <View testID="glass" {...props} />,
  };
});

// On a device, a shared value set from React only changes on the UI thread
// later; reading it straight back still gives the old value. Tests that set
// this get shared values that do the same, a timer late.
let mockLateWrites = false;
jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated');
  const { useMemo } = jest.requireActual('react');
  return {
    __esModule: true,
    ...actual,
    default: actual.default,
    useSharedValue: (initial: unknown) => {
      const value = actual.useSharedValue(initial);
      return useMemo(() => {
        if (!mockLateWrites) return value;
        const set = value.set.bind(value);
        return Object.defineProperty(Object.create(value), 'set', { value: (v: unknown) => setTimeout(() => set(v)) });
      }, [value]);
    },
  };
});

const items = ['Strength', 'Cardio', 'Bodyweight'].map((label) => ({ key: label, label }));

function renderCarousel({ floating }: { floating: boolean }) {
  return render(
    <View>
      <Carousel
        items={items}
        index={0}
        onChange={() => {}}
        visible={3}
        floating={floating}
        accessibilityLabel="Category"
      />
    </View>
  );
}

const barStyle = () => StyleSheet.flatten(screen.getByRole('adjustable', { name: 'Category' }).props.style);

test('floating over content, it is Liquid Glass where iOS has it', async () => {
  jest.mocked(isLiquidGlassAvailable).mockReturnValue(true);
  await renderCarousel({ floating: true });
  expect(screen.getByTestId('glass')).toBeOnTheScreen();
  expect(barStyle().backgroundColor).toBeUndefined();
});

test('floating without Liquid Glass, it is solid in the page colour, unlike the cards behind it', async () => {
  jest.mocked(isLiquidGlassAvailable).mockReturnValue(false);
  await renderCarousel({ floating: true });
  expect(screen.queryByTestId('glass')).toBeNull();
  expect(barStyle().backgroundColor).toBe(Colors.light.background);
  expect(barStyle().backgroundColor).not.toBe(Colors.light.backgroundElement);
  expect(barStyle().boxShadow).toBeDefined();
});

test('inside a page, it stays a plain capsule', async () => {
  jest.mocked(isLiquidGlassAvailable).mockReturnValue(true);
  await renderCarousel({ floating: false });
  expect(screen.queryByTestId('glass')).toBeNull();
  expect(barStyle().backgroundColor).toBe(Colors.light.backgroundElement);
});

/** The style of the item showing `label`, where the carousel has turned it. */
function itemStyle(label: string) {
  let node: any = screen.getByText(label);
  while (!StyleSheet.flatten(node.props.style)?.transform) node = node.parent;
  return getAnimatedStyle(node);
}

test('it turns to an item selected from outside, though writes reach the UI thread late', async () => {
  mockLateWrites = true;
  jest.useFakeTimers();
  try {
    const carousel = (index: number) => (
      <View>
        <Carousel items={items} index={index} onChange={() => {}} visible={3} accessibilityLabel="Category" />
      </View>
    );
    await render(carousel(0));
    await screen.rerender(carousel(2));
    await act(async () => jest.advanceTimersByTime(2000));
    expect(itemStyle('Bodyweight').transform).toContainEqual({ translateX: 0 });
  } finally {
    mockLateWrites = false;
    jest.useRealTimers();
  }
});
