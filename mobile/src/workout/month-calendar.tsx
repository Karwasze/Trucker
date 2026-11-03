import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import { localDate } from '@/api/client';
import type { DateRange } from '@/api/types';
import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDate } from '@/workout/format';

/** The month (YYYY-MM) of a YYYY-MM-DD date. */
export const monthOf = (date: string) => date.slice(0, 7);

const parse = (month: string) => month.split('-').map(Number) as [number, number];

/** The month (YYYY-MM) `delta` months after `month`. */
export function addMonths(month: string, delta: number) {
  const [year, m] = parse(month);
  return monthOf(localDate(new Date(year, m - 1 + delta, 1)));
}

/** A month's first and last day. */
export function monthRange(month: string): DateRange {
  const [year, m] = parse(month);
  return { from: `${month}-01`, to: localDate(new Date(year, m, 0)) };
}

/** A month's name and year, e.g. "October 2026". */
export const formatMonth = (month: string) => formatDate(`${month}-01`, { month: 'long', year: 'numeric' });

/** A month's days in weeks from Monday, with null for days of the months either side. */
function weeksOf(month: string) {
  const [year, m] = parse(month);
  const leading = (new Date(year, m - 1, 1).getDay() + 6) % 7;
  const days: (string | null)[] = Array(leading).fill(null);
  const { to } = monthRange(month);
  for (let d = 1; d <= Number(to.slice(8)); d++) days.push(`${month}-${String(d).padStart(2, '0')}`);
  while (days.length % 7) days.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  return weeks;
}

// 1 January 2024 was a Monday.
const WEEKDAYS = Array.from({ length: 7 }, (_, i) => formatDate(`2024-01-0${i + 1}`, { weekday: 'narrow' }));

/**
 * A month's days with the ones in `marked` highlighted, stepping back to
 * `earliest` and on to `latest` (both YYYY-MM). Marked days can be selected,
 * and pressed again to clear the selection.
 */
export function MonthCalendar({
  month,
  earliest,
  latest,
  today,
  marked,
  selected,
  onMonthChange,
  onSelect,
}: {
  month: string;
  earliest: string;
  latest: string;
  today: string;
  marked: Set<string>;
  selected: string | null;
  onMonthChange: (month: string) => void;
  onSelect: (date: string | null) => void;
}) {
  const theme = useTheme();
  return (
    <Card style={{ gap: Spacing.one }}>
      <View style={styles.header}>
        <MonthButton
          label="Previous month"
          symbol={{ ios: 'chevron.left', android: 'chevron_left', web: 'chevron_left' }}
          fallback="‹"
          disabled={month <= earliest}
          onPress={() => onMonthChange(addMonths(month, -1))}
        />
        <ThemedText style={{ fontWeight: 700 }}>{formatMonth(month)}</ThemedText>
        <MonthButton
          label="Next month"
          symbol={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
          fallback="›"
          disabled={month >= latest}
          onPress={() => onMonthChange(addMonths(month, 1))}
        />
      </View>
      <View style={styles.week}>
        {WEEKDAYS.map((name, i) => (
          <ThemedText key={i} type="small" themeColor="textSecondary" style={styles.weekday}>
            {name}
          </ThemedText>
        ))}
      </View>
      {weeksOf(month).map((week, i) => (
        <View key={i} style={styles.week}>
          {week.map((date, j) => {
            if (!date) return <View key={j} style={styles.cell} />;
            const isMarked = marked.has(date);
            const isSelected = date === selected;
            return (
              <Pressable
                key={j}
                accessibilityRole="button"
                accessibilityLabel={formatDate(date)}
                accessibilityState={{ selected: isSelected, disabled: !isMarked }}
                disabled={!isMarked}
                onPress={() => onSelect(isSelected ? null : date)}
                style={styles.cell}>
                <View
                  style={[
                    styles.day,
                    isMarked && { backgroundColor: isSelected ? theme.accent : `${theme.accent}33` },
                    date === today && { borderWidth: 1.5, borderColor: theme.accent },
                  ]}>
                  <ThemedText
                    type="small"
                    style={{
                      color: isSelected ? theme.onAccent : isMarked ? theme.accent : theme.textSecondary,
                      fontWeight: isMarked ? 700 : 400,
                    }}>
                    {Number(date.slice(8))}
                  </ThemedText>
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </Card>
  );
}

/** A chevron stepping the calendar back or on. */
export function MonthButton({
  label,
  symbol,
  fallback,
  disabled,
  onPress,
}: {
  label: string;
  symbol: SymbolViewProps['name'];
  fallback: string;
  disabled: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const color = disabled ? theme.backgroundSelected : theme.accent;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={12}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
      <SymbolView
        name={symbol}
        size={20}
        tintColor={color}
        fallback={<ThemedText style={{ color, fontSize: 22 }}>{fallback}</ThemedText>}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: Spacing.one,
  },
  week: {
    flexDirection: 'row',
  },
  weekday: {
    flex: 1,
    textAlign: 'center',
  },
  cell: {
    flex: 1,
    alignItems: 'center',
  },
  day: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
