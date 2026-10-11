import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Lets the delete handler put the row back, e.g. when deletion is cancelled or fails. */
export type SwipeRow = {
  /** Slides the row back into place. */
  close: () => void;
  /** Snaps the row back into place without animating. */
  reset: () => void;
};

type Props = {
  children: ReactNode;
  /**
   * Runs when the revealed action is tapped (`fullSwipe` false) or the row is
   * swiped all the way across (`fullSwipe` true). After a full swipe the row
   * stays off-screen until the caller removes it or calls `row.close()`.
   */
  onDelete: (row: SwipeRow, fullSwipe: boolean) => void;
  label?: string;
  accessibilityLabel: string;
  loading?: boolean;
  /** Horizontal drag needed before the swipe starts. Nested rows need a smaller value than their parent so they win the gesture. */
  dragOffset?: number;
  compact?: boolean;
  /** Background behind the row's content, so the action stays hidden until the row moves. */
  backgroundColor?: string;
  style?: StyleProp<ViewStyle>;
};

// Releasing past this fraction of the row's width deletes without a tap.
const FULL_SWIPE_RATIO = 0.6;
// A quick flick counts as a full swipe if it is already past the action.
const FLICK_VELOCITY = 1500;
const DURATION = 200;

/**
 * Reveals a red delete action when the row is swiped from the right. Swiping
 * all the way across deletes straight away.
 */
export function SwipeToDelete({
  children,
  onDelete,
  label = 'Delete',
  accessibilityLabel,
  loading,
  dragOffset = 10,
  compact,
  backgroundColor,
  style,
}: Props) {
  const theme = useTheme();
  const actionWidth = (compact ? 72 : 88) + Spacing.two;
  const width = useSharedValue(0);
  const offset = useSharedValue(0);
  const start = useSharedValue(0);
  const [open, setOpen] = useState(false);

  const row: SwipeRow = {
    close: () => {
      offset.set(withTiming(0, { duration: DURATION }));
      setOpen(false);
    },
    reset: () => {
      offset.set(0);
      setOpen(false);
    },
  };
  const deleteFullSwipe = () => onDelete(row, true);

  const pan = Gesture.Pan()
    .enabled(!loading)
    // A closed row only reacts to leftward drags; an open one can be dragged shut.
    .activeOffsetX([-dragOffset, open ? dragOffset : Number.MAX_SAFE_INTEGER])
    .failOffsetY([-15, 15])
    .onBegin(() => {
      start.set(offset.get());
    })
    .onUpdate((e) => {
      offset.set(Math.min(0, Math.max(-width.get(), start.get() + e.translationX)));
    })
    .onEnd((e) => {
      const travelled = -offset.get();
      const flicked = e.velocityX < -FLICK_VELOCITY && travelled > actionWidth;
      if (travelled > width.get() * FULL_SWIPE_RATIO || flicked) {
        offset.set(
          withTiming(-width.get(), { duration: DURATION }, (finished) => {
            if (finished) scheduleOnRN(deleteFullSwipe);
          })
        );
      } else if (travelled > actionWidth / 2 && e.velocityX < FLICK_VELOCITY) {
        offset.set(withTiming(-actionWidth, { duration: DURATION }));
        scheduleOnRN(setOpen, true);
      } else {
        offset.set(withTiming(0, { duration: DURATION }));
        scheduleOnRN(setOpen, false);
      }
    });

  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: offset.get() }],
  }));

  // The action grows with the drag, so a full swipe fills the row with red.
  const actionStyle = useAnimatedStyle(() => ({
    opacity: offset.get() < 0 ? 1 : 0,
    width: Math.max(actionWidth, -offset.get()) - Spacing.two,
  }));

  return (
    <View
      style={[styles.container, style]}
      onLayout={(e) => {
        width.set(e.nativeEvent.layout.width);
      }}>
      <Animated.View
        style={[styles.action, compact && styles.actionCompact, { backgroundColor: theme.danger }, actionStyle]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          onPress={() => onDelete(row, false)}
          style={({ pressed }) => [styles.actionButton, { opacity: pressed ? 0.7 : 1 }]}>
          <View style={[styles.actionLabel, { width: actionWidth - Spacing.two }]}>
            {loading ? (
              <ActivityIndicator color={theme.onAccent} />
            ) : (
              <ThemedText type="smallBold" style={{ color: theme.onAccent }} numberOfLines={1}>
                {label}
              </ThemedText>
            )}
          </View>
        </Pressable>
      </Animated.View>
      <GestureDetector gesture={pan}>
        <Animated.View style={[backgroundColor ? { backgroundColor } : undefined, rowStyle]}>
          {children}
          {/* While open, a tap on the row closes it instead of hitting its content. */}
          {open && <Pressable style={StyleSheet.absoluteFill} onPress={row.close} />}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
  action: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    borderRadius: 16,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  actionCompact: {
    borderRadius: 10,
  },
  // The label stays next to the row's edge as the action grows.
  actionButton: {
    flex: 1,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  actionLabel: {
    alignItems: 'center',
  },
});
