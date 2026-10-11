import { StyleSheet, View } from 'react-native';

import { localDate } from '@/api/client';
import { Chip } from '@/components/ui';
import { Spacing } from '@/constants/theme';

export const TIMESPANS = [
  { key: 'all', label: 'From beginning', months: null },
  { key: '1y', label: '1 year', months: 12 },
  { key: '6m', label: '6 months', months: 6 },
  { key: '3m', label: '3 months', months: 3 },
  { key: '1m', label: '1 month', months: 1 },
] as const;

export type Timespan = (typeof TIMESPANS)[number];

/** First date (YYYY-MM-DD) inside the timespan, or null for all time. */
export function timespanStart(span: Timespan) {
  if (span.months === null) return null;
  const d = new Date();
  d.setMonth(d.getMonth() - span.months);
  return localDate(d);
}

/** Wrapping row of timespan chips. */
export function TimespanChips({
  value,
  onChange,
}: {
  value: Timespan;
  onChange: (timespan: Timespan) => void;
}) {
  return (
    <View style={styles.chips}>
      {TIMESPANS.map((t) => (
        <Chip key={t.key} label={t.label} selected={t.key === value.key} onPress={() => onChange(t)} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
});
