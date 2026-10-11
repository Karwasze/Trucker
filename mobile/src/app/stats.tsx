import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { localDate } from '@/api/client';
import type { StatisticsData } from '@/api/types';
import { LineChart } from '@/components/line-chart';
import { ThemedText } from '@/components/themed-text';
import { Card, Chip, Message, Screen, SectionLabel } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useQuery } from '@/hooks/use-query';
import { useSettings } from '@/settings/settings-context';
import { formatDate, formatKg } from '@/workout/format';

const TIMESPANS = [
  { key: 'all', label: 'From beginning', months: null },
  { key: '1y', label: '1 year', months: 12 },
  { key: '6m', label: '6 months', months: 6 },
  { key: '3m', label: '3 months', months: 3 },
  { key: '1m', label: '1 month', months: 1 },
] as const;

type Timespan = (typeof TIMESPANS)[number];

/** First date (YYYY-MM-DD) inside the timespan, or null for all time. */
function timespanStart(span: Timespan) {
  if (span.months === null) return null;
  const d = new Date();
  d.setMonth(d.getMonth() - span.months);
  return localDate(d);
}

export default function StatsScreen() {
  const { api, serverUrl } = useSettings();
  const [selected, setSelected] = useState<string | null>(null);
  const [timespan, setTimespan] = useState<Timespan>(TIMESPANS[0]);
  const names = useQuery(`stats:${serverUrl}`, async () => (await api.statistics()).exercises);

  const exercises = names.data ?? [];
  const exercise = selected && exercises.includes(selected) ? selected : (exercises[0] ?? null);
  const series = useQuery(exercise === null ? null : `stats:${serverUrl}:${exercise}`, async () =>
    (await api.statistics(exercise!)).data.sort((a, b) => a.date.localeCompare(b.date))
  );

  return (
    <Screen
      title="Progress"
      refreshing={names.refreshing}
      onRefresh={() => {
        names.refresh();
        series.refresh();
      }}>
      {!names.data ? (
        <Message loading={!names.error} error={names.error} />
      ) : exercises.length === 0 ? (
        <Message>Log a workout to see your progress.</Message>
      ) : (
        <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}
            style={styles.chipScroller}>
            {exercises.map((name) => (
              <Chip key={name} label={name} selected={name === exercise} onPress={() => setSelected(name)} />
            ))}
          </ScrollView>
          <View style={styles.timespans}>
            {TIMESPANS.map((t) => (
              <Chip
                key={t.key}
                label={t.label}
                selected={t.key === timespan.key}
                onPress={() => setTimespan(t)}
              />
            ))}
          </View>
          {!series.data || series.data.length === 0 ? (
            <Message loading={!series.error} error={series.error} />
          ) : (
            <ExerciseStats data={series.data} timespan={timespan} />
          )}
        </>
      )}
    </Screen>
  );
}

function ExerciseStats({ data: all, timespan }: { data: StatisticsData[]; timespan: Timespan }) {
  const start = timespanStart(timespan);
  const data = start ? all.filter((d) => d.date >= start) : all;
  if (data.length === 0) {
    return <Message>No sessions in the last {timespan.label}.</Message>;
  }

  const latest = data.at(-1)!;
  const best = Math.max(...data.map((d) => d.estimated_1rm));
  const first = data[0].estimated_1rm;
  const change = latest.estimated_1rm - first;

  return (
    <>
      <View style={styles.tiles}>
        <Tile label="Est. 1RM" value={`${latest.estimated_1rm.toFixed(1)} kg`} />
        <Tile label="Best" value={`${best.toFixed(1)} kg`} />
        <Tile
          label={`Since ${formatDate(data[0].date, { month: 'short', day: 'numeric' })}`}
          value={`${change >= 0 ? '+' : ''}${change.toFixed(1)} kg`}
        />
      </View>

      <Card>
        <ThemedText type="smallBold">Estimated 1RM</ThemedText>
        <LineChart
          points={data.map((d) => ({ date: d.date, value: d.estimated_1rm }))}
          from={start ?? data[0].date}
          to={localDate()}
          unit="kg"
        />
      </Card>

      <SectionLabel>Sessions</SectionLabel>
      <Card>
        {[...data].reverse().map((d) => (
          <View key={d.date} style={styles.sessionRow}>
            <ThemedText style={{ flex: 1 }}>{formatDate(d.date)}</ThemedText>
            <ThemedText style={styles.num}>{d.estimated_1rm.toFixed(1)} kg</ThemedText>
            <ThemedText themeColor="textSecondary" style={[styles.num, { width: 90 }]}>
              {formatKg(d.total_volume)}
            </ThemedText>
          </View>
        ))}
      </Card>
    </>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <Card style={styles.tile}>
      <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
        {label}
      </ThemedText>
      <ThemedText style={[styles.num, { fontSize: 20, fontWeight: 700 }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </ThemedText>
    </Card>
  );
}

const styles = StyleSheet.create({
  chipScroller: {
    marginHorizontal: -Spacing.three,
    flexGrow: 0,
  },
  chips: {
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  tiles: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  tile: {
    flex: 1,
    gap: Spacing.one,
    padding: Spacing.three,
  },
  timespans: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  num: {
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
});
