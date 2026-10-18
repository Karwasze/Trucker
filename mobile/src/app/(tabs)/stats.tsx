import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { localDate } from '@/api/client';
import type { CardioActivity, StatisticsData } from '@/api/types';
import { LineChart } from '@/components/line-chart';
import { ThemedText } from '@/components/themed-text';
import { TIMESPANS, TimespanControl, timespanStart, type Timespan } from '@/components/timespan';
import { Card, Message, Screen, SectionLabel } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { syncBodyweight } from '@/health/bodyweight';
import { useHealthState } from '@/health/health-state';
import { isHealthAvailable } from '@/health/healthkit';
import { useQuery } from '@/hooks/use-query';
import { BodyweightStats } from '@/progress/bodyweight-stats';
import { CardioStats } from '@/progress/cardio-stats';
import { SeriesPicker, type Series } from '@/progress/series-picker';
import { Tile, TileRow } from '@/progress/tile';
import { TriathlonStats } from '@/progress/triathlon-stats';
import { SettingsButton } from '@/settings/settings-button';
import { useSettings } from '@/settings/settings-context';
import { formatDate, formatKg } from '@/workout/format';

export default function StatsScreen() {
  const { api, serverUrl } = useSettings();
  const [selected, setSelected] = useState<Series | null>(null);
  const [timespan, setTimespan] = useState<Timespan>(TIMESPANS[0]);
  const names = useQuery(`stats:${serverUrl}`, async () => (await api.statistics()).exercises);
  // Oldest first, for the charts.
  const cardio = useQuery(`cardio:${serverUrl}`, async () => (await api.listCardio()).reverse());
  const activities = [...new Set((cardio.data ?? []).map((w) => w.activity))] as CardioActivity[];
  // Oldest first, for the chart.
  const triathlons = useQuery(`triathlons:${serverUrl}`, async () => (await api.listTriathlons()).reverse());
  const hasTriathlons = (triathlons.data ?? []).length > 0;

  // Opened on a lift, cardio activity or triathlons from elsewhere, e.g.
  // Insights. The params are applied while rendering whenever they change,
  // then cleared, so opening the same series again applies them again.
  const params = useLocalSearchParams<{ exercise?: string; activity?: string; series?: string; span?: string }>();
  const request =
    params.exercise || params.activity || params.series === 'triathlon'
      ? JSON.stringify([params.exercise, params.activity, params.series, params.span])
      : undefined;
  const [appliedRequest, setAppliedRequest] = useState<string>();
  if (request !== appliedRequest) {
    setAppliedRequest(request);
    if (request) {
      setSelected(
        params.exercise
          ? { kind: 'exercise', name: params.exercise }
          : params.activity
            ? { kind: 'cardio', activity: params.activity as CardioActivity }
            : { kind: 'triathlon' }
      );
      const span = TIMESPANS.find((t) => t.key === params.span);
      if (span) setTimespan(span);
    }
  }
  useEffect(() => {
    if (request) router.setParams({ exercise: undefined, activity: undefined, series: undefined, span: undefined });
  }, [request]);

  const exercises = names.data ?? [];
  // Default to the first exercise; bodyweight is the fallback before anything is logged.
  const fallback: Series | null = !names.data
    ? null
    : exercises.length > 0
      ? { kind: 'exercise', name: exercises[0] }
      : { kind: 'bodyweight' };
  const series =
    selected?.kind === 'bodyweight' ||
    (selected?.kind === 'triathlon' && hasTriathlons) ||
    (selected?.kind === 'cardio' && activities.includes(selected.activity)) ||
    (selected?.kind === 'exercise' && exercises.includes(selected.name))
      ? selected
      : fallback;
  const exercise = series?.kind === 'exercise' ? series.name : null;

  const exerciseData = useQuery(exercise === null ? null : `stats:${serverUrl}:${exercise}`, async () =>
    (await api.statistics(exercise!)).data.sort((a, b) => a.date.localeCompare(b.date))
  );
  // Opening bodyweight syncs it from Apple Health, falling back to the
  // stored log when Health can't be read.
  const health = useHealthState();
  const healthConnected = !!health.state.connectedAt && isHealthAvailable();
  const bodyweight = useQuery(
    series?.kind === 'bodyweight' && health.loaded ? `bodyweight:${serverUrl}:${healthConnected}` : null,
    async () => {
      const synced = healthConnected ? await syncBodyweight(api).catch(() => null) : null;
      return (synced ?? (await api.listBodyweight())).sort((a, b) => a.date.localeCompare(b.date));
    }
  );
  const data = series?.kind === 'bodyweight' ? bodyweight : exerciseData;

  return (
    <Screen
      title="Progress"
      subtitle="Your lifts, cardio and bodyweight over time"
      action={<SettingsButton />}
      refreshing={names.refreshing}
      onRefresh={() => {
        names.refresh();
        cardio.refresh();
        triathlons.refresh();
        data.refresh();
      }}>
      {!names.data || !series ? (
        <Message loading={!names.error} error={names.error} />
      ) : (
        <>
          <SeriesPicker
            value={series}
            exercises={exercises}
            activities={activities}
            triathlon={hasTriathlons}
            onChange={setSelected}
          />
          {series.kind === 'triathlon' ? (
            <TriathlonStats triathlons={triathlons.data ?? []} timespan={timespan} onTimespanChange={setTimespan} />
          ) : series.kind === 'cardio' ? (
            <CardioStats
              activity={series.activity}
              workouts={(cardio.data ?? []).filter((w) => w.activity === series.activity)}
              timespan={timespan}
              onTimespanChange={setTimespan}
            />
          ) : series.kind === 'bodyweight' ? (
            !bodyweight.data ? (
              <Message loading={!bodyweight.error} error={bodyweight.error} />
            ) : (
              <BodyweightStats
                history={bodyweight.data}
                timespan={timespan}
                onTimespanChange={setTimespan}
                healthConnected={healthConnected}
                onSynced={bodyweight.refresh}
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
