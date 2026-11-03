import { Pressable, StyleSheet, View } from 'react-native';

import { localDate } from '@/api/client';
import type { DietDay } from '@/api/types';
import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDate } from '@/workout/format';
import { MonthButton } from '@/workout/month-calendar';
import { currentWeek } from '@/workout/week';

/** The date (YYYY-MM-DD) `days` days after `date`. */
export function addDays(date: string, days: number) {
  const [y, m, d] = date.split('-').map(Number);
  // Noon, so a DST change never moves a date across midnight.
  return localDate(new Date(y, m - 1, d + days, 12));
}

/** The Monday of the week containing `date`. */
export const weekOf = (date: string) => currentWeek(date)[0];

/** A week's span, e.g. "12 – 18 Oct" or "28 Sept – 4 Oct". */
export function formatWeek(monday: string) {
  const sunday = addDays(monday, 6);
  const end = formatDate(sunday, { day: 'numeric', month: 'short' });
  const start = formatDate(
    monday,
    monday.slice(5, 7) === sunday.slice(5, 7) ? { day: 'numeric' } : { day: 'numeric', month: 'short' }
  );
  return `${start} – ${end}`;
}

const status = (day: DietDay | undefined) => (!day ? 'not logged' : day.adhered ? 'kept to' : 'missed');

/**
 * A week of days from `monday`, each kept to (green), missed (red) or not
 * logged, stepping back to the week of `earliest` and on to `latest` (both
 * Mondays). Days up to today can be selected.
 */
export function WeekCalendar({
  monday,
  earliest,
  latest,
  today,
  days,
  selected,
  onWeekChange,
  onSelect,
}: {
  monday: string;
  earliest: string;
  latest: string;
  today: string;
  days: DietDay[];
  selected: string;
  onWeekChange: (monday: string) => void;
  onSelect: (date: string) => void;
}) {
  const theme = useTheme();
  return (
    <Card style={{ gap: Spacing.two }}>
      <View style={styles.header}>
        <MonthButton
          label="Previous week"
          symbol={{ ios: 'chevron.left', android: 'chevron_left', web: 'chevron_left' }}
          fallback="‹"
          disabled={monday <= earliest}
          onPress={() => onWeekChange(addDays(monday, -7))}
        />
        <ThemedText style={{ fontWeight: 700 }}>{formatWeek(monday)}</ThemedText>
        <MonthButton
          label="Next week"
          symbol={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
          fallback="›"
          disabled={monday >= latest}
          onPress={() => onWeekChange(addDays(monday, 7))}
        />
      </View>
      <View style={styles.week}>
        {currentWeek(monday).map((date) => {
          const day = days.find((d) => d.date === date);
          const future = date > today;
          const isSelected = date === selected;
          const fill = day ? (day.adhered ? theme.success : theme.danger) : undefined;
          return (
            <Pressable
              key={date}
              accessibilityRole="button"
              accessibilityLabel={`${formatDate(date, { weekday: 'long', day: 'numeric', month: 'short' })}, ${future ? 'to come' : status(day)}`}
              accessibilityState={{ selected: isSelected, disabled: future }}
              disabled={future}
              onPress={() => onSelect(date)}
              style={[styles.cell, isSelected && { backgroundColor: theme.backgroundSelected }]}>
              <ThemedText type="small" themeColor="textSecondary">
                {formatDate(date, { weekday: 'narrow' })}
              </ThemedText>
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
    </Card>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  week: {
    flexDirection: 'row',
    gap: 2,
  },
  cell: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.one,
    paddingVertical: Spacing.one,
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
