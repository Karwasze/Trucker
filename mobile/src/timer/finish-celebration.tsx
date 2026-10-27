import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { useTimer } from '@/timer/timer-context';
import { formatClock } from '@/timer/timer-model';

const SHOW_MS = 3000;
const BURST_MS = 1300;
const PARTICLE_COUNT = 22;
const CHECK_SIZE = 44;
const CONFETTI = ['#FF5A45', '#3D9BF5', '#3FBF73', '#F7B750', '#A97CF8', '#2DD4BF'];

/** The celebration's content below the hardware, for sizing the island. */
export const CELEBRATION_CONTENT_HEIGHT = 74;

type Particle = { angle: number; distance: number; size: number; color: string; spin: number };

const makeParticles = (): Particle[] =>
  Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
    angle: (i / PARTICLE_COUNT) * Math.PI * 2 + Math.random() * 0.4,
    distance: 50 + Math.random() * 110,
    size: 4 + Math.random() * 4,
    color: CONFETTI[i % CONFETTI.length],
    spin: (Math.random() - 0.5) * 720,
  }));

/**
 * Whether the island should be celebrating a finished timer: from each finish
 * in animation mode until it's dismissed or a few seconds have passed.
 */
export function useCelebration() {
  const { celebration } = useTimer();
  const [dismissed, setDismissed] = useState(0);

  useEffect(() => {
    if (celebration === 0) return;
    const timeout = setTimeout(() => setDismissed(celebration), SHOW_MS);
    return () => clearTimeout(timeout);
  }, [celebration]);

  return {
    celebrating: celebration !== dismissed,
    /** Changes with each finish, so a fresh burst plays every time. */
    key: celebration,
    dismiss: () => setDismissed(celebration),
  };
}

/**
 * The island's finish animation: a check springs in and sends out a ring and
 * confetti, all clipped to the island.
 */
export function IslandCelebration({ paddingTop }: { paddingTop: number }) {
  const theme = useTheme();
  const { settings } = useTimer();
  const [particles] = useState(makeParticles);
  const burst = useSharedValue(0);
  const check = useSharedValue(0);
  const text = useSharedValue(0);

  useEffect(() => {
    // Waits for the island to open before bursting out of it.
    check.set(withDelay(150, withSpring(1, { damping: 8, stiffness: 180 })));
    burst.set(withDelay(200, withTiming(1, { duration: BURST_MS, easing: Easing.out(Easing.cubic) })));
    text.set(withDelay(280, withTiming(1, { duration: 260 })));
  }, [burst, check, text]);

  const checkStyle = useAnimatedStyle(() => ({
    transform: [{ scale: check.get() }, { rotate: `${interpolate(check.get(), [0, 1], [-45, 0])}deg` }],
  }));
  const textStyle = useAnimatedStyle(() => ({
    opacity: text.get(),
    transform: [{ translateX: interpolate(text.get(), [0, 1], [-12, 0]) }],
  }));

  return (
    <View style={[styles.content, { paddingTop }]}>
      <View style={styles.origin}>
        <Ring progress={burst} color={theme.success} delay={0} />
        <Ring progress={burst} color={theme.accent} delay={0.2} />
        {particles.map((p, i) => (
          <Confetti key={i} particle={p} progress={burst} />
        ))}
        <Animated.View style={[styles.check, { backgroundColor: theme.success }, checkStyle]}>
          <ThemedText style={styles.checkMark}>✓</ThemedText>
        </Animated.View>
      </View>
      <Animated.View style={[styles.caption, textStyle]}>
        <ThemedText style={styles.title}>Rest over</ThemedText>
        <ThemedText type="small" style={styles.subtitle}>
          {formatClock(settings.durationSec * 1000)} done · time for the next set
        </ThemedText>
      </Animated.View>
    </View>
  );
}

function Ring({ progress, color, delay }: { progress: SharedValue<number>; color: string; delay: number }) {
  const style = useAnimatedStyle(() => {
    const t = Math.max(0, (progress.get() - delay) / (1 - delay));
    return {
      opacity: interpolate(t, [0, 0.1, 1], [0, 0.9, 0]),
      transform: [{ scale: interpolate(t, [0, 1], [1, 4]) }],
    };
  });
  return <Animated.View style={[styles.ring, { borderColor: color }, style]} />;
}

function Confetti({ particle, progress }: { particle: Particle; progress: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    const t = progress.get();
    // Flies outward, flattened to the island's shape, then gravity pulls it down as it fades.
    const fall = t * t * 50;
    return {
      opacity: interpolate(t, [0, 0.05, 0.7, 1], [0, 1, 1, 0]),
      transform: [
        { translateX: Math.cos(particle.angle) * particle.distance * t },
        { translateY: Math.sin(particle.angle) * particle.distance * 0.6 * t + fall },
        { rotate: `${particle.spin * t}deg` },
        { scale: interpolate(t, [0, 0.2, 1], [0.2, 1, 0.6]) },
      ],
    };
  });
  return (
    <Animated.View
      style={[
        styles.confetti,
        { width: particle.size, height: particle.size * 1.6, backgroundColor: particle.color },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 14,
    gap: 14,
  },
  // The burst comes out of the check, so everything is centered on it.
  origin: {
    width: CHECK_SIZE,
    height: CHECK_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: CHECK_SIZE,
    height: CHECK_SIZE,
    borderRadius: CHECK_SIZE / 2,
    borderWidth: 3,
  },
  confetti: {
    position: 'absolute',
    borderRadius: 1.5,
  },
  check: {
    width: CHECK_SIZE,
    height: CHECK_SIZE,
    borderRadius: CHECK_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkMark: {
    color: '#fff',
    fontSize: 24,
    lineHeight: 28,
    fontWeight: 800,
  },
  caption: {
    flex: 1,
    gap: 2,
  },
  title: {
    color: '#fff',
    fontSize: 20,
    lineHeight: 24,
    fontWeight: 700,
  },
  subtitle: {
    color: '#8E8E93',
  },
});
