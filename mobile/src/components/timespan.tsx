import { Pressable, StyleSheet, View } from 'react-native';

import { localDate } from '@/api/client';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export const TIMESPANS = [
  { key: '1m', label: '1 month', short: '1M', months: 1 },
  { key: '3m', label: '3 months', short: '3M', months: 3 },
  { key: '6m', label: '6 months', short: '6M', months: 6 },
  { key: '1y', label: '1 year', short: '1Y', months: 12 },
  { key: 'all', label: 'From beginning', short: 'All', months: null },
] as const;

export type Timespan = (typeof TIMESPANS)[number];

/** What Progress and Insights open on: the last month. */
export const DEFAULT_TIMESPAN: Timespan = TIMESPANS[0];

/** First date (YYYY-MM-DD) inside the timespan, or null for all time. */
export function timespanStart(span: Timespan) {
  if (span.months === null) return null;
  const d = new Date();
  d.setMonth(d.getMonth() - span.months);
  return localDate(d);
}

/** Segmented control for picking a timespan, shortest first, at the top of a page. */
export function TimespanPicker({ value, onChange }: { value: Timespan; onChange: (timespan: Timespan) => void }) {
  const theme = useTheme();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel="Timespan"
      style={[styles.track, { backgroundColor: theme.backgroundElement }]}>
      {TIMESPANS.map((t) => {
        const selected = t.key === value.key;
        return (
          <Pressable
            key={t.key}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            accessibilityLabel={t.key === 'all' ? 'All time' : t.label}
            onPress={() => onChange(t)}
            style={[styles.segment, selected && { backgroundColor: theme.backgroundSelected }]}>
            <ThemedText type="smallBold" themeColor={selected ? 'text' : 'textSecondary'}>
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
    borderRadius: 12,
    padding: 3,
    gap: 3,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.two,
    borderRadius: 9,
  },
});
