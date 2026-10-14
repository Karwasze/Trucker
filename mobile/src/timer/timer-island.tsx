import { StatusBar } from 'expo-status-bar';
import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, FadeOut, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { CELEBRATION_CONTENT_HEIGHT, IslandCelebration, useCelebration } from '@/timer/finish-celebration';
import { useTimer } from '@/timer/timer-context';
import { endsAt, formatClock } from '@/timer/timer-model';

const SPRING = { damping: 20, stiffness: 220, mass: 0.8 };
/** Opening for a finish overshoots, so the island bounces. */
const BOUNCY_SPRING = { damping: 11, stiffness: 200, mass: 0.8 };
const GREY = '#8E8E93';
/** Expanded content below the hardware: the time row, the progress bar and the buttons. */
const EXPANDED_CONTENT_HEIGHT = 103;

/**
 * Where the island sits. On a notched iPhone it hangs from the top edge so the
 * notch seems to grow; on a Dynamic Island iPhone it lines up with the real
 * one. Hardware hides the middle of the island there, so compact content goes
 * to the sides, where the status bar is hidden to make room. Elsewhere it is a
 * small capsule in the middle of the status bar.
 */
function useIslandFrame() {
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const sideWidth = Math.min(window.width * 0.7, 300);
  if (Platform.OS === 'ios' && insets.top >= 54) {
    return { top: 11, height: 37, width: sideWidth, docked: false, hardware: true };
  }
  if (Platform.OS === 'ios' && insets.top >= 44) {
    return { top: 0, height: 37, width: sideWidth, docked: true, hardware: true };
  }
  const height = 28;
  return { top: Math.max(2, (insets.top - height) / 2), height, width: 132, docked: false, hardware: false };
}

/** Re-renders a few times a second while `active`, returning the current time. */
function useNow(active: boolean) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!active) return;
    const interval = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(interval);
  }, [active]);
  return now;
}

/**
 * A Dynamic Island style timer at the top of every screen, shown while the
 * timer runs. Compact, it shows the running time; tap to expand it for the
 * progress and buttons to restart or stop. When the timer finishes in
 * animation mode it springs open to celebrate, then shrinks away. While idle
 * it is invisible, but a tap on the notch or island starts the timer.
 */
export function TimerIsland() {
  const theme = useTheme();
  const window = useWindowDimensions();
  const frame = useIslandFrame();
  const { running, start, stop } = useTimer();
  const now = useNow(!!running);
  const [expandRequested, setExpandRequested] = useState(false);
  const expanded = expandRequested && !!running;
  const celebration = useCelebration();
  // A new timer, e.g. from ticking the next set, takes over from the celebration.
  const celebrating = celebration.celebrating && !running;
  const shown = !!running || celebrating;

  // `now` can trail a just-started timer until the first tick.
  const elapsed = running ? Math.min(Math.max(0, now - running.startedAt), running.durationMs) : 0;
  const progress = running ? elapsed / running.durationMs : 0;
  const color = running && endsAt(running) - now < 10_000 ? theme.success : theme.accent;

  const contentTop = frame.hardware ? frame.height + 2 : 12;
  const open = expanded || celebrating;
  const width = !shown ? frame.height * 3 : open ? Math.min(window.width - 16, 400) : frame.width;
  const height = expanded
    ? contentTop + EXPANDED_CONTENT_HEIGHT
    : celebrating
      ? contentTop + CELEBRATION_CONTENT_HEIGHT
      : frame.height;
  const radius = open ? 36 : frame.height / 2;
  const spring = celebrating ? BOUNCY_SPRING : SPRING;
  const shape = useAnimatedStyle(() => ({
    width: withSpring(width, spring),
    height: withSpring(height, spring),
    opacity: withSpring(shown ? 1 : 0, SPRING),
    borderBottomLeftRadius: withSpring(radius, spring),
    borderBottomRightRadius: withSpring(radius, spring),
    // Hanging from the top edge, the top corners stay square like the notch's.
    borderTopLeftRadius: frame.docked ? 0 : withSpring(radius, spring),
    borderTopRightRadius: frame.docked ? 0 : withSpring(radius, spring),
  }));

  const onPress = running
    ? () => setExpandRequested(!expanded)
    : celebrating
      ? celebration.dismiss
      : start;

  return (
    <>
      {/* The compact time sits where the clock and battery are; hide them meanwhile. */}
      {frame.hardware && <StatusBar hidden={shown} animated />}
      {/* While expanded, a tap anywhere else collapses it. */}
      {expanded && (
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => setExpandRequested(false)}
          accessibilityLabel="Collapse timer"
        />
      )}
      {/* Idle, only the notch or island itself is a tap target, as nothing shows elsewhere. */}
      <View
        style={[styles.anchor, { top: frame.top }]}
        pointerEvents={shown || frame.hardware ? 'box-none' : 'none'}>
        <Animated.View style={[styles.island, shape]}>
          <Pressable
            style={styles.fill}
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel={
              running
                ? `Rest timer, ${formatClock(elapsed)} of ${formatClock(running.durationMs)}. ` +
                  `Tap to ${expanded ? 'collapse' : 'expand'}.`
                : celebrating
                  ? 'Rest over. Tap to dismiss.'
                  : 'Start rest timer'
            }>
            {celebrating && (
              <Animated.View
                key={`celebration-${celebration.key}`}
                entering={FadeIn.duration(120)}
                exiting={FadeOut.duration(120)}
                style={styles.fill}>
                <IslandCelebration paddingTop={contentTop} />
              </Animated.View>
            )}
            {running &&
              (expanded ? (
                <Animated.View
                  key="expanded"
                  entering={FadeIn.duration(180).delay(120)}
                  exiting={FadeOut.duration(80)}
                  style={[styles.expanded, { paddingTop: contentTop }]}>
                  <View style={styles.row}>
                    <TimerIcon color={color} />
                    <ThemedText style={styles.label}>Rest</ThemedText>
                    <View style={{ flex: 1 }} />
                    <ThemedText style={[styles.bigTime, { color }]}>{formatClock(elapsed)}</ThemedText>
                    <ThemedText style={styles.ofTarget}> / {formatClock(running.durationMs)}</ThemedText>
                  </View>
                  <View style={styles.track}>
                    <View style={[styles.bar, { width: `${progress * 100}%`, backgroundColor: color }]} />
                  </View>
                  <View style={styles.row}>
                    <IslandButton title="Restart" onPress={start} />
                    <IslandButton title="Stop" onPress={stop} destructive />
                  </View>
                </Animated.View>
              ) : (
                <Animated.View
                  key="compact"
                  entering={FadeIn.duration(180).delay(120)}
                  exiting={FadeOut.duration(80)}
                  style={[styles.compact, { paddingHorizontal: frame.hardware ? 14 : 10 }]}>
                  <ProgressRing progress={progress} color={color} />
                  <ThemedText style={[styles.compactTime, { color }]}>{formatClock(elapsed)}</ThemedText>
                </Animated.View>
              ))}
          </Pressable>
        </Animated.View>
      </View>
    </>
  );
}

function TimerIcon({ color }: { color: string }) {
  return (
    <SymbolView
      name="timer"
      size={17}
      weight="semibold"
      tintColor={color}
      fallback={<ThemedText style={{ color, fontSize: 15 }}>⏱</ThemedText>}
    />
  );
}

const RING = 20;
const RING_STROKE = 3;
const RING_RADIUS = (RING - RING_STROKE) / 2;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

function ProgressRing({ progress, color }: { progress: number; color: string }) {
  return (
    <Svg width={RING} height={RING}>
      <Circle cx={RING / 2} cy={RING / 2} r={RING_RADIUS} stroke="#3A3A3C" strokeWidth={RING_STROKE} fill="none" />
      <Circle
        cx={RING / 2}
        cy={RING / 2}
        r={RING_RADIUS}
        stroke={color}
        strokeWidth={RING_STROKE}
        strokeLinecap="round"
        strokeDasharray={RING_LENGTH}
        strokeDashoffset={RING_LENGTH * (1 - progress)}
        fill="none"
        transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
      />
    </Svg>
  );
}

function IslandButton({
  title,
  onPress,
  destructive,
}: {
  title: string;
  onPress: () => void;
  destructive?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.button, { opacity: pressed ? 0.6 : 1 }]}>
      <ThemedText type="smallBold" style={{ color: destructive ? '#FF6961' : '#fff' }}>
        {title}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  anchor: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  island: {
    backgroundColor: '#000',
    overflow: 'hidden',
    borderCurve: 'continuous',
    boxShadow: '0 6px 16px rgba(0, 0, 0, 0.25)',
  },
  fill: {
    flex: 1,
  },
  compact: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
  },
  compactTime: {
    fontSize: 15,
    lineHeight: 18,
    fontWeight: 700,
    fontVariant: ['tabular-nums'],
  },
  expanded: {
    flex: 1,
    paddingHorizontal: 20,
    paddingBottom: 14,
    gap: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  label: {
    color: '#fff',
    fontWeight: 600,
  },
  bigTime: {
    fontSize: 28,
    lineHeight: 32,
    fontWeight: 700,
    fontVariant: ['tabular-nums'],
  },
  ofTarget: {
    color: GREY,
    fontSize: 17,
    fontWeight: 600,
    fontVariant: ['tabular-nums'],
  },
  track: {
    height: 5,
    borderRadius: 3,
    backgroundColor: '#3A3A3C',
    overflow: 'hidden',
  },
  bar: {
    height: '100%',
    borderRadius: 3,
  },
  button: {
    flex: 1,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#2C2C2E',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
