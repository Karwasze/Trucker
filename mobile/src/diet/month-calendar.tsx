import { Pressable, StyleSheet, View } from 'react-native';

import type { DietDay } from '@/api/types';
import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDate } from '@/workout/format';
import { MonthHeader, weeksOf } from '@/workout/month-calendar';

const status = (day: DietDay | undefined) => (!day ? 'not logged' : day.adhered ? 'kept to' : 'missed');

/**
 * A month of days, each kept to (green), missed (red) or not logged,
 * stepping back to `earliest` and on to `latest` (both YYYY-MM). Days up to
 * today can be selected.
 */
export function DietCalendar({
  month,
  earliest,
  latest,
  today,
  days,
  selected,
  onMonthChange,
  onSelect,
}: {
  month: string;
  earliest: string;
  latest: string;
  today: string;
  days: DietDay[];
  selected: string;
  onMonthChange: (month: string) => void;
  onSelect: (date: string) => void;
}) {
  const theme = useTheme();
  const byDate = new Map(days.map((d) => [d.date, d]));
  return (
    <Card style={{ gap: Spacing.one }}>
      <MonthHeader month={month} earliest={earliest} latest={latest} onMonthChange={onMonthChange} />
      {weeksOf(month).map((week, i) => (
        <View key={i} style={styles.week}>
          {week.map((date, j) => {
            if (!date) return <View key={j} style={styles.cell} />;
            const day = byDate.get(date);
            const future = date > today;
            const isSelected = date === selected;
            const fill = day ? (day.adhered ? theme.success : theme.danger) : undefined;
            return (
              <Pressable
                key={j}
                accessibilityRole="button"
                accessibilityLabel={`${formatDate(date, { weekday: 'long', day: 'numeric', month: 'short' })}, ${future ? 'to come' : status(day)}`}
                accessibilityState={{ selected: isSelected, disabled: future }}
                disabled={future}
                onPress={() => onSelect(date)}
                style={[styles.cell, isSelected && { backgroundColor: theme.backgroundSelected }]}>
                <View
                  style={[
                    styles.day,
                    fill
                      ? { backgroundColor: fill }
                      : { borderWidth: 1.5, borderColor: future ? theme.backgroundSelected : theme.textSecondary },
                    date === today && !fill && { borderColor: theme.accent },
                  ]}>
                  <ThemedText
                    type="small"
                    style={{
                      color: fill ? theme.onAccent : future ? theme.textSecondary : theme.text,
                      fontWeight: date === today ? 700 : 500,
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

const styles = StyleSheet.create({
  week: {
    flexDirection: 'row',
    gap: 2,
  },
  cell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 2,
    borderRadius: 10,
  },
  day: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
