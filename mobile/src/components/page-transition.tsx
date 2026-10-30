import { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, type SharedValue } from 'react-native-reanimated';

import { ringDistance } from '@/components/carousel-model';

/** Pages glide into place without overshooting, so no empty edge shows. */
const PAGE_SPRING = { damping: 22, stiffness: 160, mass: 0.9, overshootClamping: true };
/** Pages sink back this much mid-swap, and rise again as they land. */
const PAGE_DIP = 0.06;

/** A page of a pager: its key, what it shows, and where it sits, in pages. */
type Placed<T> = { key: string; value: T; slot: number };

export type Pager<T> = {
  /** Where the pages are scrolled to, in pages. */
  position: SharedValue<number>;
  /** The page shown, and the one it took over from, which slides out. */
  current: Placed<T>;
  previous: Placed<T> | null;
};

/**
 * Pages side by side, like locations in Apple Weather. When `key` changes, the
 * new page slides in beside the old one as it slides out: from the right when
 * `direction` says the move went onwards (positive), from the left when back.
 * However far the move, the pages are always one page apart.
 */
export function usePager<T>(key: string, value: T, direction: (from: T, to: T) => number): Pager<T> {
  const position = useSharedValue(0);
  const [pages, setPages] = useState<{ current: Placed<T>; previous: Placed<T> | null }>({
    current: { key, value, slot: 0 },
    previous: null,
  });
  if (key !== pages.current.key) {
    const step = direction(pages.current.value, value) < 0 ? -1 : 1;
    setPages({ current: { key, value, slot: pages.current.slot + step }, previous: pages.current });
  }

  const slot = pages.current.slot;
  useEffect(() => {
    position.set(withSpring(slot, PAGE_SPRING));
  }, [slot, position]);

  // The page shown always reflects the latest value; the one leaving keeps its last.
  return { position, current: { ...pages.current, value }, previous: pages.previous };
}

/** Which way to slide between two pages on a ring of `count`: the shorter way round. */
export const ringDirection = (count: number) => (from: number, to: number) => ringDistance(from, to, count);

/** One level of a nested choice, e.g. a category and then a series within it. */
export type Level = { index: number; count: number; ring: boolean };

/**
 * Which way content moved between two nested choices: judged by the
 * outermost level that changed, the shorter way round a ring. Positive is
 * onwards, negative back.
 */
export function slideDirection(from: Level[], to: Level[]) {
  const changed = to.findIndex((l, i) => l.index !== from[i]?.index);
  if (changed === -1) return 0;
  const { index, count, ring } = to[changed];
  const before = from[changed].index;
  return ring ? ringDistance(before, index, count) : index - before;
}

/**
 * One page of a pager, filling its container. Only the page shown and the one
 * leaving are drawn; the one leaving can't be touched or read out.
 */
export function PagerPage<T>({ pager, pageKey, children }: { pager: Pager<T>; pageKey: string; children: ReactNode }) {
  const { width } = useWindowDimensions();
  const { position, current, previous } = pager;
  const shown = pageKey === current.key;
  const slot = shown ? current.slot : pageKey === previous?.key ? previous.slot : null;

  const style = useAnimatedStyle(() => {
    if (slot === null) return {};
    const between = Math.min(1, Math.abs(position.get() - Math.round(position.get())) * 2);
    return {
      transform: [{ translateX: (slot - position.get()) * width }, { scale: 1 - PAGE_DIP * between }],
    };
  });

  return (
    <Animated.View
      pointerEvents={shown ? 'auto' : 'none'}
      accessibilityElementsHidden={!shown}
      importantForAccessibility={shown ? 'auto' : 'no-hide-descendants'}
      style={[StyleSheet.absoluteFill, slot === null && styles.hidden, style]}>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  hidden: {
    display: 'none',
  },
});
