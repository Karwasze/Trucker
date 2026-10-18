import { Pressable, StyleSheet, View } from 'react-native';

import { localDate } from '@/api/client';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export const TIMESPANS = [
  { key: 'all', label: 'From beginning', short: 'All', months: null },
  { key: '1y', label: '1 year', short: '1Y', months: 12 },
  { key: '6m', label: '6 months', short: '6M', months: 6 },
  { key: '3m', label: '3 months', short: '3M', months: 3 },
  { key: '1m', label: '1 month', short: '1M', months: 1 },
] as const;

export type Timespan = (typeof TIMESPANS)[number];

/** First date (YYYY-MM-DD) inside the timespan, or null for all time. */
export function timespanStart(span: Timespan) {
  if (span.months === null) return null;
  const d = new Date();
  d.setMonth(d.getMonth() - span.months);
  return localDate(d);
}

/** Segmented control for picking a timespan, sized to sit inside a Card. */
export function TimespanControl({ value, onChange }: { value: Timespan; onChange: (timespan: Timespan) => void }) {
  const theme = useTheme();
  return (
    <View style={[styles.track, { backgroundColor: theme.backgroundSelected }]} accessibilityRole="tablist">
      {TIMESPANS.map((t) => {
        const selected = t.key === value.key;
        return (
          <Pressable
            key={t.key}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={t.label}
            onPress={() => onChange(t)}
            style={[styles.segment, selected && { backgroundColor: theme.background }]}>
            <ThemedText type={selected ? 'smallBold' : 'small'} themeColor={selected ? 'text' : 'textSecondary'}>
              {t.short}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    borderRadius: 9,
    borderCurve: 'continuous',
    padding: Spacing.half,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.one + Spacing.half,
    borderRadius: 7,
    borderCurve: 'continuous',
  },
});
