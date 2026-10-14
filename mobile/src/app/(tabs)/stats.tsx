import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { localDate } from '@/api/client';
import type { StatisticsData } from '@/api/types';
import { LineChart } from '@/components/line-chart';
import { ThemedText } from '@/components/themed-text';
import { TIMESPANS, TimespanControl, timespanStart, type Timespan } from '@/components/timespan';
import { Card, Message, Screen, SectionLabel } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useQuery } from '@/hooks/use-query';
import { BodyweightStats } from '@/progress/bodyweight-stats';
import { SeriesPicker, type Series } from '@/progress/series-picker';
import { Tile, TileRow } from '@/progress/tile';
import { SettingsButton } from '@/settings/settings-button';
import { useSettings } from '@/settings/settings-context';
import { formatDate, formatKg } from '@/workout/format';

export default function StatsScreen() {
  const { api, serverUrl } = useSettings();
  const [selected, setSelected] = useState<Series | null>(null);
  const [timespan, setTimespan] = useState<Timespan>(TIMESPANS[0]);
  const names = useQuery(`stats:${serverUrl}`, async () => (await api.statistics()).exercises);

  const exercises = names.data ?? [];
  // Default to the first exercise; bodyweight is the fallback before anything is logged.
  const fallback: Series | null = !names.data
    ? null
    : exercises.length > 0
      ? { kind: 'exercise', name: exercises[0] }
      : { kind: 'bodyweight' };
  const series =
    selected?.kind === 'bodyweight' || (selected && exercises.includes(selected.name)) ? selected : fallback;
  const exercise = series?.kind === 'exercise' ? series.name : null;

  const exerciseData = useQuery(exercise === null ? null : `stats:${serverUrl}:${exercise}`, async () =>
    (await api.statistics(exercise!)).data.sort((a, b) => a.date.localeCompare(b.date))
  );
  const bodyweight = useQuery(
    series?.kind === 'bodyweight' ? `bodyweight:${serverUrl}` : null,
    async () => (await api.listBodyweight()).sort((a, b) => a.date.localeCompare(b.date))
  );
  const data = series?.kind === 'bodyweight' ? bodyweight : exerciseData;

  return (
    <Screen
      title="Progress"
      subtitle="Your lifts and bodyweight over time"
      action={<SettingsButton />}
      refreshing={names.refreshing}
      onRefresh={() => {
        names.refresh();
        data.refresh();
      }}>
      {!names.data || !series ? (
        <Message loading={!names.error} error={names.error} />
      ) : (
        <>
          <SeriesPicker value={series} exercises={exercises} onChange={setSelected} />
          {series.kind === 'bodyweight' ? (
            !bodyweight.data ? (
              <Message loading={!bodyweight.error} error={bodyweight.error} />
            ) : (
              <BodyweightStats
                history={bodyweight.data}
                timespan={timespan}
                onTimespanChange={setTimespan}
                onSaved={bodyweight.refresh}
              />
            )
          ) : !exerciseData.data || exerciseData.data.length === 0 ? (
            <Message loading={!exerciseData.error} error={exerciseData.error} />
          ) : (
            <ExerciseStats data={exerciseData.data} timespan={timespan} onTimespanChange={setTimespan} />
          )}
        </>
      )}
    </Screen>
  );
}

function ExerciseStats({
  data: all,
  timespan,
  onTimespanChange,
}: {
  data: StatisticsData[];
  timespan: Timespan;
  onTimespanChange: (timespan: Timespan) => void;
}) {
  const start = timespanStart(timespan);
  const data = start ? all.filter((d) => d.date >= start) : all;
  const chartCard = (
    <Card>
      <ThemedText type="smallBold">Estimated 1RM</ThemedText>
      <TimespanControl value={timespan} onChange={onTimespanChange} />
      {data.length === 0 ? (
        <Message>No sessions in the last {timespan.label}.</Message>
      ) : (
        <LineChart
          points={data.map((d) => ({ date: d.date, value: d.estimated_1rm }))}
          from={start ?? data[0].date}
          to={localDate()}
          unit="kg"
        />
      )}
    </Card>
  );
  if (data.length === 0) return chartCard;

  const latest = data.at(-1)!;
  const best = Math.max(...data.map((d) => d.estimated_1rm));
  const first = data[0].estimated_1rm;
  const change = latest.estimated_1rm - first;

  return (
    <>
      <TileRow>
        <Tile label="Est. 1RM" value={`${latest.estimated_1rm.toFixed(1)} kg`} />
        <Tile label="Best" value={`${best.toFixed(1)} kg`} />
        <Tile
          label={`Since ${formatDate(data[0].date, { month: 'short', day: 'numeric' })}`}
          value={`${change >= 0 ? '+' : ''}${change.toFixed(1)} kg`}
        />
      </TileRow>

      {chartCard}

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

const styles = StyleSheet.create({
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
