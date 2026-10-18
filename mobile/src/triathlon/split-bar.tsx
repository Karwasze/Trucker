import { StyleSheet, View } from 'react-native';

import type { Triathlon, TriathlonLegKey } from '@/api/types';
import { useTheme } from '@/hooks/use-theme';
import { percent, TRIATHLON_LEGS } from '@/triathlon/triathlon';
import { ACTIVITY_NAMES } from '@/workout/format';

/**
 * A bar split into the time each leg of a triathlon took, with ticks where
 * the legs would end on a `typical` split.
 */
export function SplitBar({
  triathlon: t,
  typical,
}: {
  triathlon: Triathlon;
  typical?: Record<TriathlonLegKey, number>;
}) {
  const theme = useTheme();
  const colors = useLegColors();
  const label = TRIATHLON_LEGS.map(
    ({ key, activity }) => `${ACTIVITY_NAMES[activity]} ${percent(t[key].duration_seconds / t.total_seconds)}`
  ).join(', ');
  const ticks = typical ? [typical.swim, typical.swim + typical.bike] : [];
  return (
    <View accessible accessibilityLabel={label} style={styles.bar}>
      {TRIATHLON_LEGS.map(({ key }) => (
        <View key={key} style={{ flex: t[key].duration_seconds, backgroundColor: colors[key] }} />
      ))}
      {ticks.map((at, i) => (
        <View key={i} style={[styles.tick, { left: `${at * 100}%`, backgroundColor: theme.text }]} />
      ))}
    </View>
  );
}

/** The color of a leg in SplitBar, for legends. */
export function useLegColors(): Record<TriathlonLegKey, string> {
  const theme = useTheme();
  return { swim: theme.accent, bike: theme.warning, run: theme.success };
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
    gap: 2,
  },
  tick: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    marginLeft: -1,
  },
});
