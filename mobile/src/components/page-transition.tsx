import { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import Animated, {
  FadeOut,
  SlideInLeft,
  SlideInRight,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';

import { itemDistance, ringDistance } from '@/components/carousel-model';
import { Spacing } from '@/constants/theme';

/** Pages glide into place without overshooting, so no empty edge shows. */
const PAGE_SPRING = { damping: 22, stiffness: 160, mass: 0.9, overshootClamping: true };
/** Pages sink back this much mid-swap, and rise again as they land. */
const PAGE_DIP = 0.06;

export type Pager = {
  /** Where the pages are, in pages; counts on past the ends of a ring. */
  position: SharedValue<number>;
  count: number;
  ring: boolean;
  /** The page shown, and the one it took over from, which slides out. */
  current: number;
  previous: number;
};

/**
 * Pages side by side, like locations in Apple Weather: when `index` changes,
 * the old page slides out as the new one slides in beside it, the shorter way
 * round a ring.
 */
export function usePager(index: number, count: number, ring: boolean): Pager {
  const position = useSharedValue(index);
  const target = useSharedValue(index);
  const [pages, setPages] = useState({ current: index, previous: index });
  if (index !== pages.current) setPages({ current: index, previous: pages.current });

  useEffect(() => {
    const from = target.get();
    const to = ring ? from + ringDistance(from, index, count) : index;
    if (to === from) return;
    target.set(to);
    position.set(withSpring(to, PAGE_SPRING));
  }, [index, count, ring, position, target]);

  return { position, count, ring, ...pages };
}

/**
 * One page of a pager, filling its container. Only the page shown and the one
 * leaving are drawn; the one leaving can't be touched or read out.
 */
export function PagerPage({ pager, index, children }: { pager: Pager; index: number; children: ReactNode }) {
  const { width } = useWindowDimensions();
  const { position, count, ring, current, previous } = pager;
  const shown = index === current;

  const style = useAnimatedStyle(() => {
    const distance = itemDistance(position.get(), index, count, ring);
    const between = Math.min(1, Math.abs(position.get() - Math.round(position.get())) * 2);
    return {
      transform: [{ translateX: distance * width }, { scale: 1 - PAGE_DIP * between }],
    };
  });

  return (
    <Animated.View
      pointerEvents={shown ? 'auto' : 'none'}
      accessibilityElementsHidden={!shown}
      importantForAccessibility={shown ? 'auto' : 'no-hide-descendants'}
      style={[StyleSheet.absoluteFill, !shown && index !== previous && styles.hidden, style]}>
      {children}
    </Animated.View>
  );
}

type Level = { index: number; count: number; ring: boolean };

/**
 * Which way content moved when one of `levels` (e.g. a category, then a
 * series within it) changed: 1 onwards, -1 back, judged by the outermost level
 * that changed, the shorter way round a ring.
 */
export function useSlideDirection(levels: Level[]) {
  const [last, setLast] = useState({ indexes: levels.map((l) => l.index), direction: 1 });
  const changed = levels.findIndex((l, i) => l.index !== last.indexes[i]);
  if (changed !== -1) {
    const { index, count, ring } = levels[changed];
    const before = last.indexes[changed];
    const moved = ring ? ringDistance(before, index, count) : index - before;
    setLast({ indexes: levels.map((l) => l.index), direction: moved < 0 ? -1 : 1 });
  }
  return last.direction;
}

/**
 * Content that slides in from the side it was swiped towards when `pageKey`
 * changes, while what it replaces fades away.
 */
export function SlideIn({ pageKey, direction, children }: { pageKey: string; direction: number; children: ReactNode }) {
  const entering = (direction < 0 ? SlideInLeft : SlideInRight).springify().damping(22).stiffness(160);
  return (
    <Animated.View key={pageKey} entering={entering} exiting={FadeOut.duration(140)} style={styles.slide}>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  hidden: {
    display: 'none',
  },
  // Spaced like the page around it.
  slide: {
    gap: Spacing.three,
  },
});
