import { render, screen } from '@testing-library/react-native';
import { isLiquidGlassAvailable } from 'expo-glass-effect';
import { StyleSheet, View } from 'react-native';

import { Carousel } from '@/components/carousel';
import { Colors } from '@/constants/theme';

jest.mock('expo-glass-effect', () => {
  const { View } = jest.requireActual('react-native');
  return {
    isLiquidGlassAvailable: jest.fn(() => false),
    GlassView: (props: object) => <View testID="glass" {...props} />,
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
