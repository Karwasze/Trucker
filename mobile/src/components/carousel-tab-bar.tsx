import { type SymbolViewProps } from 'expo-symbols';
import type { ReactNode } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Carousel } from '@/components/carousel';
import { Spacing } from '@/constants/theme';

export type CarouselTab = {
  name: string;
  label: string;
  icon: SymbolViewProps['name'];
};

type Props = {
  tabs: CarouselTab[];
  /** The focused tab. */
  index: number;
  onChange: (index: number) => void;
  /** Runs when the centred tab is tapped. */
  onReselect?: (index: number) => void;
};

/** Height of the bar itself, without the space below it. */
export const CAROUSEL_BAR_HEIGHT = 64;
const MAX_WIDTH = 420;

/** How wide the bar is, for carousels floating above it to match. */
export function useTabBarWidth() {
  const window = useWindowDimensions();
  return Math.min(window.width - Spacing.three * 2, MAX_WIDTH);
}

/** Space below the bar: the home indicator's, or a margin without one. */
function useBarBottom() {
  return Math.max(useSafeAreaInsets().bottom, Spacing.three);
}

/**
 * A floating bottom bar: a carousel of the tabs, five at a time, going round
 * in a ring. Tapping the centred tab goes back to its first screen.
 */
export function CarouselTabBar({ tabs, index, onChange, onReselect }: Props) {
  const width = useTabBarWidth();
  const bottom = useBarBottom();

  return (
    <View pointerEvents="box-none" style={[styles.container, { paddingBottom: bottom }]}>
      <Carousel
        items={tabs.map((tab) => ({ key: tab.name, label: tab.label, icon: tab.icon }))}
        index={index}
        onChange={onChange}
        onReselect={onReselect}
        width={width}
        accessibilityLabel="Tabs"
        testID="tabs"
        floating
      />
    </View>
  );
}

/**
 * Floats a screen's own carousels just above the tab bar, stacked with the
 * last child nearest the bar. Make them `floating`, with the bar's width
 * (useTabBarWidth), to match it.
 */
export function AboveTabBar({ children }: { children: ReactNode }) {
  const bottom = useBarBottom();
  return (
    <View
      pointerEvents="box-none"
      style={[styles.container, styles.stack, { bottom: bottom + CAROUSEL_BAR_HEIGHT + Spacing.two }]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
  },
  stack: {
    gap: Spacing.two,
  },
});
