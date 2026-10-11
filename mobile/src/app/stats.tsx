import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { localDate } from '@/api/client';
import type { StatisticsData } from '@/api/types';
import { LineChart } from '@/components/line-chart';
import { ThemedText } from '@/components/themed-text';
import { TIMESPANS, TimespanChips, timespanStart, type Timespan } from '@/components/timespan';
import { Card, Chip, Message, Screen, SectionLabel } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useQuery } from '@/hooks/use-query';
import { InsightsView } from '@/insights/insights-view';
import { useSettings } from '@/settings/settings-context';
import { formatDate, formatKg } from '@/workout/format';

const VIEWS = [
  { key: 'charts', label: 'Charts' },
  { key: 'insights', label: 'Insights' },
] as const;

type ProgressView = (typeof VIEWS)[number]['key'];

export default function StatsScreen() {
  const [view, setView] = useState<ProgressView>('charts');
  // Kept here so the chart selection survives switching to Insights and back.
  const [selected, setSelected] = useState<string | null>(null);
  const [timespan, setTimespan] = useState<Timespan>(TIMESPANS[0]);

  const switcher = (
    <View style={styles.chips}>
      {VIEWS.map((v) => (
        <Chip key={v.key} label={v.label} selected={v.key === view} onPress={() => setView(v.key)} />
      ))}
    </View>
  );

  return view === 'insights' ? (
    <InsightsView header={switcher} />
  ) : (
    <ProgressCharts
      header={switcher}
      selected={selected}
      onSelect={setSelected}
      timespan={timespan}
      onTimespan={setTimespan}
    />
  );
}

function ProgressCharts({
  header,
  selected,
  onSelect: setSelected,
  timespan,
  onTimespan: setTimespan,
}: {
  header: ReactNode;
  selected: string | null;
  onSelect: (name: string) => void;
  timespan: Timespan;
  onTimespan: (timespan: Timespan) => void;
}) {
  const { api, serverUrl } = useSettings();
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
      {header}
      {!names.data ? (
        <Message loading={!names.error} error={names.error} />
      ) : exercises.length === 0 ? (
        <Message>Log a workout to see your progress.</Message>
      ) : (
        <>
          <View style={styles.chips}>
            {exercises.map((name) => (
              <Chip key={name} label={name} selected={name === exercise} onPress={() => setSelected(name)} />
            ))}
          </View>
          <TimespanChips value={timespan} onChange={setTimespan} />
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
  tiles: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  tile: {
    flex: 1,
    gap: Spacing.one,
    padding: Spacing.three,
  },
  chips: {
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
