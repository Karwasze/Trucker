import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { localDate } from '@/api/client';
import type { StatisticsData } from '@/api/types';
import { LineChart } from '@/components/line-chart';
import { ThemedText } from '@/components/themed-text';
import { TimespanControl, timespanStart, type Timespan } from '@/components/timespan';
import { Card, Message, Screen, SectionLabel } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { syncBodyweight } from '@/health/bodyweight';
import { useHealthState } from '@/health/health-state';
import { isHealthAvailable } from '@/health/healthkit';
import { useQuery } from '@/hooks/use-query';
import { BodyweightStats } from '@/progress/bodyweight-stats';
import { useOpenedWith, useProgressTimespan } from '@/progress/progress-context';
import { personalRecords } from '@/progress/records';
import { SeriesPicker, type Series } from '@/progress/series-picker';
import { Tile, TileRow } from '@/progress/tile';
import { SettingsButton } from '@/settings/settings-button';
import { useSettings } from '@/settings/settings-context';
import { formatDate, formatKg } from '@/workout/format';

/** The first Progress page: each lift's estimated 1RM, and bodyweight. */
export default function StrengthProgressScreen() {
  const { api, serverUrl } = useSettings();
  const [selected, setSelected] = useState<Series | null>(null);
  const { timespan, setTimespan } = useProgressTimespan();
  const names = useQuery(`stats:${serverUrl}`, async () => (await api.statistics()).exercises);
  // Opened on a lift from elsewhere, e.g. Insights.
  useOpenedWith((params) => params.exercise && setSelected({ kind: 'exercise', name: params.exercise }));

  const exercises = names.data ?? [];
  // Default to the first exercise; bodyweight is the fallback before anything is logged.
  const fallback: Series | null = !names.data
    ? null
    : exercises.length > 0
      ? { kind: 'exercise', name: exercises[0] }
      : { kind: 'bodyweight' };
  const series =
    selected?.kind === 'bodyweight' || (selected?.kind === 'exercise' && exercises.includes(selected.name))
      ? selected
      : fallback;
  const exercise = series?.kind === 'exercise' ? series.name : null;

  const exerciseData = useQuery(exercise === null ? null : `stats:${serverUrl}:${exercise}`, async () =>
    (await api.statistics(exercise!)).data.sort((a, b) => a.date.localeCompare(b.date))
  );
  // Opening bodyweight shows the stored log and syncs it from Apple Health
  // alongside, so a slow or stalled Health read can't hold the log back.
  const health = useHealthState();
  const healthConnected = !!health.state.connectedAt && isHealthAvailable();
  const storedBodyweight = useQuery(series?.kind === 'bodyweight' ? `bodyweight:${serverUrl}` : null, async () =>
    (await api.listBodyweight()).sort((a, b) => a.date.localeCompare(b.date))
  );
  const healthSync = useQuery(
    series?.kind === 'bodyweight' && health.loaded && healthConnected ? `bodyweight-sync:${serverUrl}` : null,
    () => syncBodyweight(api)
  );
  // Health's log once synced; null means Health had no weigh-ins.
  const bodyweight = healthSync.data ?? storedBodyweight.data;
  const data =
    series?.kind === 'bodyweight'
      ? {
          refresh: () => {
            storedBodyweight.refresh();
            if (healthConnected) healthSync.refresh();
          },
        }
      : exerciseData;

  return (
    <Screen
      title="Strength"
      subtitle="Your lifts and bodyweight over time"
      action={<SettingsButton />}
      hasHeader
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
            !bodyweight ? (
              <Message loading={!storedBodyweight.error} error={storedBodyweight.error} />
            ) : (
              <BodyweightStats
                history={bodyweight}
                timespan={timespan}
                onTimespanChange={setTimespan}
                healthConnected={healthConnected}
                healthSyncing={healthSync.loading}
                healthSyncError={healthSync.error}
                onSynced={healthSync.refresh}
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
  // Judged against all history, so a PR has to beat records from before the timespan too.
  const records = personalRecords(all).filter((r) => !start || r.date >= start);
  const record = all.reduce((a, b) => (b.estimated_1rm > a.estimated_1rm ? b : a));

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

      <SectionLabel>Personal records</SectionLabel>
      <Card>
        {records.length === 0 ? (
          <ThemedText type="small" themeColor="textSecondary">
            {start
              ? `No PRs in the last ${timespan.label}. The record is ${record.estimated_1rm.toFixed(1)} kg from ${formatDate(record.date, { day: 'numeric', month: 'short', year: 'numeric' })}.`
              : 'No PRs yet. Beat your first session to set one.'}
          </ThemedText>
        ) : (
          records.map((r) => (
            <View
              key={r.date}
              style={styles.sessionRow}
              accessible
              accessibilityLabel={`PR on ${formatDate(r.date)}: ${r.estimated_1rm.toFixed(1)} kg, up ${r.gain.toFixed(1)} kg`}>
              <ThemedText style={{ flex: 1 }}>{formatDate(r.date)}</ThemedText>
              <ThemedText style={styles.num}>{r.estimated_1rm.toFixed(1)} kg</ThemedText>
              <ThemedText themeColor="success" style={[styles.num, { width: 90 }]}>
                +{r.gain.toFixed(1)} kg
              </ThemedText>
            </View>
          ))
        )}
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
