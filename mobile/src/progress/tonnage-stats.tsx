import { StyleSheet, View } from 'react-native';

import type { Tonnage } from '@/api/types';
import { WeeklyBarChart } from '@/components/bar-chart';
import { ThemedText } from '@/components/themed-text';
import type { Timespan } from '@/components/timespan';
import { Card, Message, SectionLabel } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { Tile, TileRow } from '@/progress/tile';
import { formatDate, formatKg } from '@/workout/format';

/** Weight lifted over the timespan, across all lifts: in total, per week and per lift. */
export function TonnageStats({ tonnage, timespan, today }: { tonnage: Tonnage; timespan: Timespan; today: string }) {
  if (tonnage.total === 0) {
    return (
      <Message>{timespan.months === null ? 'No workouts.' : `Nothing lifted in the last ${timespan.label}.`}</Message>
    );
  }
  const best = tonnage.weekly.reduce((a, b) => (b.tonnage > a.tonnage ? b : a));
  return (
    <>
      <TileRow>
        <Tile label="Total" value={formatKg(tonnage.total)} />
        <Tile
          label={`Best week (${formatDate(best.week, { month: 'short', day: 'numeric' })})`}
          value={formatKg(best.tonnage)}
        />
      </TileRow>
      {tonnage.weekly.length > 1 && (
        <Card>
          <ThemedText type="smallBold">Weekly tonnage</ThemedText>
          <WeeklyBarChart
            weeks={tonnage.weekly.map((w) => ({ week: w.week, value: w.tonnage }))}
            from={tonnage.weekly[0].week}
            to={today}
            unit="kg"
            formatValue={formatKg}
          />
        </Card>
      )}
      <SectionLabel>By lift</SectionLabel>
      <Card>
        {tonnage.by_exercise.map((e) => (
          <View key={e.exercise} style={styles.row}>
            <ThemedText style={{ flex: 1 }}>{e.exercise}</ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.num}>
              {formatKg(e.tonnage)}
            </ThemedText>
          </View>
        ))}
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  num: {
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
});
