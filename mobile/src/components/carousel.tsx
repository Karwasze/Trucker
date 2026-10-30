import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import * as Haptics from 'expo-haptics';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { StyleSheet, useWindowDimensions, View, type StyleProp, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import {
  carouselTransform,
  highlightWidth,
  isRing,
  itemDistance,
  moving,
  ringDistance,
  rubberBand,
  snapIndex,
  spinDuration,
  tabAt,
  tapTurn,
} from '@/components/carousel-model';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type CarouselEntry = {
  key: string;
  label: string;
  /** Shown above the label; without one, the label is larger. */
  icon?: SymbolViewProps['name'];
};

type Props = {
  items: CarouselEntry[];
  /** The selected item. */
  index: number;
  onChange: (index: number) => void;
  /** Runs when the centred item is tapped. */
  onReselect?: (index: number) => void;
  /** Items shown across at once: the centred one and the same number to each side. */
  visible?: number;
  /** Fixed width; otherwise it fills its container. */
  width?: number;
  /** Names the control for screen readers, e.g. "Tabs". */
  accessibilityLabel: string;
  /** Gesture test IDs are this with "-pan" and "-tap". */
  testID?: string;
  /**
   * Floats over content, e.g. above the tab bar: Liquid Glass where iOS has
   * it, else a solid capsule set apart from the cards behind it.
   */
  floating?: boolean;
  /** Overrides whether it goes round in a ring, e.g. off for a scale like timespans. */
  ring?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** Height of a carousel of labels alone; one with icons is taller. */
export const TEXT_CAROUSEL_HEIGHT = 44;
const ICON_CAROUSEL_HEIGHT = 64;
/** A settle that overshoots a little, so the item lands with a bounce. */
const SPRING = { damping: 15, stiffness: 170, mass: 0.8 };
/** The highlight squeezes on release, then pops back. */
const POP_SPRING = { damping: 7, stiffness: 320, mass: 0.6 };
/** A tap is a quick touch that barely moves; anything else is the start of a swipe. */
const TAP_MAX_DISTANCE = 6;
const TAP_MAX_DURATION = 300;

/**
 * A capsule showing the selected item in the middle, with its neighbours at
 * either side turning away like faces of a wheel. Swipe it to turn to another
 * item, or flick it hard to spin past several; each item passing the middle
 * ticks. Tap an item to turn to it. With as many items as slots it goes round
 * in a ring; with fewer it stops at its ends. With a screen reader it is one
 * adjustable control, swiped up or down.
 */
export function Carousel({
  items,
  index,
  onChange,
  onReselect,
  visible = 5,
  width: fixedWidth,
  accessibilityLabel,
  testID = 'carousel',
  floating = false,
  ring: ringOverride,
  style,
}: Props) {
  const theme = useTheme();
  const window = useWindowDimensions();
  // Until laid out, a guess at a full-width carousel inside the page's padding.
  const [measuredWidth, setMeasuredWidth] = useState(window.width - Spacing.three * 2);
  const width = fixedWidth ?? measuredWidth;
  const slot = width / visible;
  const left = (width - slot) / 2;
  const count = items.length;
  // A ring needs as many items as slots, or the one going round the back shows.
  const ring = (ringOverride ?? true) && isRing(count, visible);
  const glass = floating && isLiquidGlassAvailable();
  const half = Math.floor(visible / 2);
  const height = items.some((item) => item.icon) ? ICON_CAROUSEL_HEIGHT : TEXT_CAROUSEL_HEIGHT;

  // In a ring, positions count on past the ends; see carousel-model.
  const position = useSharedValue(index);
  const target = useSharedValue(index);
  const start = useSharedValue(index);
  const pop = useSharedValue(1);
  /** Each item's label width, as laid out, for the highlight to fit around. */
  const labels = useSharedValue<number[]>(items.map(() => 0));
  const [centred, setCentred] = useState(index);

  const measure = (i: number, labelWidth: number) =>
    labels.modify((all) => {
      'worklet';
      all[i] = labelWidth;
      return all;
    });

  const settle = (to: number, velocity = 0) => {
    'worklet';
    target.set(to);
    const distance = to - position.get();
    // A long spin coasts to a stop, ticking past each item, rather than
    // springing there; the highlight pops as it lands.
    const spin = Math.abs(distance) > 1.5 && Math.sign(velocity) === Math.sign(distance);
    const landing = spin ? spinDuration(distance, velocity) : 0;
    position.set(
      spin
        ? withTiming(to, { duration: landing, easing: Easing.out(Easing.cubic) })
        : withSpring(to, { ...SPRING, velocity })
    );
    pop.set(withDelay(landing * 0.85, withSequence(withTiming(0.88, { duration: 80 }), withSpring(1, POP_SPRING))));
  };

  /** Where to settle to turn `by` items from `from`: on in a ring, or no further than the ends. */
  const destination = (from: number, by: number) => {
    'worklet';
    return ring ? from + by : Math.max(0, Math.min(count - 1, from + by));
  };

  // Follow the selection when something else changes it, e.g. a link,
  // turning the shorter way round a ring.
  useEffect(() => {
    if (index === tabAt(target.get(), count, ring)) return;
    target.set(ring ? target.get() + ringDistance(target.get(), index, count) : index);
    position.set(withSpring(target.get(), SPRING));
  }, [index, count, ring, position, target]);

  const tick = (i: number) => {
    setCentred(i);
    Haptics.selectionAsync().catch(() => {});
  };
  useAnimatedReaction(
    () => tabAt(position.get(), count, ring),
    (now, previous) => {
      if (previous !== null && now !== previous) scheduleOnRN(tick, now);
    }
  );

  /** Turns `by` items, for screen readers, which can't swipe. */
  const turn = (by: number) => {
    const to = destination(target.get(), by);
    if (to === target.get()) return;
    settle(to);
    onChange(tabAt(to, count, ring));
  };

  const pan = Gesture.Pan()
    .withTestId(`${testID}-pan`)
    .activeOffsetX([-8, 8])
    .failOffsetY([-15, 15])
    .onBegin(() => {
      start.set(target.get());
    })
    .onStart((e) => {
      // Dragging a carousel that's still spinning catches it where it is.
      if (moving(position.get(), target.get())) start.set(position.get() + e.translationX / slot);
    })
    .onUpdate((e) => {
      // Content follows the finger, so dragging left brings in the next item.
      const dragged = start.get() - e.translationX / slot;
      position.set(ring ? dragged : rubberBand(dragged, count));
    })
    .onEnd((e) => {
      const velocity = -e.velocityX / slot;
      const snapped = snapIndex(Math.round(start.get()), position.get(), velocity);
      const next = ring ? snapped : Math.max(0, Math.min(count - 1, snapped));
      const changed = next !== target.get();
      settle(next, velocity);
      if (changed) scheduleOnRN(onChange, tabAt(next, count, ring));
    });

  // Taps wait for the swipe to fail, so a swipe that starts on another item
  // never selects it; and they're ignored while the carousel is still moving.
  const tap = Gesture.Tap()
    .withTestId(`${testID}-tap`)
    .maxDistance(TAP_MAX_DISTANCE)
    .maxDuration(TAP_MAX_DURATION)
    .onEnd((e, success) => {
      const current = target.get();
      const by = success ? tapTurn(e.x, width, visible, position.get(), current) : null;
      if (by === null) return;
      if (by === 0) {
        if (onReselect) scheduleOnRN(onReselect, tabAt(current, count, ring));
        return;
      }
      const to = destination(current, by);
      // Past the end of a carousel with ends is empty space.
      if (to !== current + by) return;
      settle(to);
      scheduleOnRN(onChange, tabAt(to, count, ring));
    });
  const gestures = Gesture.Exclusive(pan, tap);

  // The highlight fits the centred label, and stretches between items
  // mid-swipe like a drop of liquid.
  const highlightStyle = useAnimatedStyle(() => {
    const between = Math.abs(position.get() - Math.round(position.get()));
    const pill = highlightWidth(position.get(), labels.get(), slot - 4);
    return {
      width: pill,
      left: (width - pill) / 2,
      transform: [{ scaleX: (1 + between * 0.7) * pop.get() }, { scaleY: (1 - between * 0.3) * pop.get() }],
    };
  });

  return (
    <GestureDetector gesture={gestures}>
      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={accessibilityLabel}
        accessibilityValue={{ text: `${items[index]?.label ?? ''}, ${index + 1} of ${count}` }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => turn(e.nativeEvent.actionName === 'increment' ? 1 : -1)}
        onLayout={fixedWidth === undefined ? (e) => setMeasuredWidth(e.nativeEvent.layout.width) : undefined}
        style={[
          styles.bar,
          { height, borderRadius: height / 2 },
          // Glass brings its own depth; the solid fallback takes the page's
          // colour, unlike the cards, with an outline and a shadow.
          !glass && { backgroundColor: floating ? theme.background : theme.backgroundElement },
          floating && !glass && styles.floating,
          fixedWidth !== undefined && { width: fixedWidth },
          style,
        ]}>
        {glass && (
          <GlassView
            glassEffectStyle="regular"
            isInteractive
            style={[StyleSheet.absoluteFill, { borderRadius: height / 2 }]}
          />
        )}
        {/* Clipped inside, so a shadow outside the capsule still shows. */}
        <View
          style={[
            styles.clip,
            { borderRadius: height / 2, borderColor: theme.backgroundSelected },
            floating && !glass && styles.floatingOutline,
            glass && styles.glassOutline,
          ]}>
          <Animated.View
            style={[
              styles.highlight,
              { top: 6, height: height - 12, borderRadius: (height - 12) / 2, backgroundColor: theme.accent + '22' },
              highlightStyle,
            ]}
          />
          {items.map((item, i) => (
            <Item
              key={item.key}
              item={item}
              index={i}
              count={count}
              ring={ring}
              half={half}
              position={position}
              slot={slot}
              left={left}
              height={height}
              centred={i === centred}
              onMeasure={(labelWidth) => measure(i, labelWidth)}
            />
          ))}
        </View>
      </View>
    </GestureDetector>
  );
}

type ItemProps = {
  item: CarouselEntry;
  index: number;
  count: number;
  ring: boolean;
  half: number;
  position: SharedValue<number>;
  slot: number;
  left: number;
  height: number;
  centred: boolean;
  /** Reports the label's laid-out width. */
  onMeasure: (labelWidth: number) => void;
};

function Item({ item, index, count, ring, half, position, slot, left, height, centred, onMeasure }: ItemProps) {
  const theme = useTheme();
  const color = centred ? theme.accent : theme.text;

  const itemStyle = useAnimatedStyle(() => {
    const distance = itemDistance(position.get(), index, count, ring);
    const t = carouselTransform(distance, half);
    return {
      opacity: t.opacity,
      transform: [
        { perspective: 500 },
        { translateX: distance * slot },
        { rotateY: `${t.rotate}deg` },
        { scale: t.scale },
      ],
    };
  });

  return (
    <Animated.View style={[styles.item, { left, width: slot, height }, itemStyle]}>
      <View style={styles.itemContent}>
        {item.icon && (
          <SymbolView
            name={item.icon}
            size={24}
            weight={centred ? 'semibold' : 'regular'}
            tintColor={color}
            fallback={<View style={[styles.iconFallback, { backgroundColor: color }]} />}
          />
        )}
        <ThemedText
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
          onLayout={(e) => onMeasure(e.nativeEvent.layout.width)}
          style={[item.icon ? styles.smallLabel : styles.label, { color }]}>
          {item.label}
        </ThemedText>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bar: {
    borderCurve: 'continuous',
  },
  floating: {
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.25)',
  },
  floatingOutline: {
    borderWidth: 1,
  },
  glassOutline: {
    borderWidth: 0,
  },
  clip: {
    flex: 1,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  highlight: {
    position: 'absolute',
    borderCurve: 'continuous',
  },
  item: {
    position: 'absolute',
    top: 0,
  },
  itemContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: 2,
  },
  iconFallback: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  smallLabel: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: 600,
  },
  label: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: 600,
  },
});
