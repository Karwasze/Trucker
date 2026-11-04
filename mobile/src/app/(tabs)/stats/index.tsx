import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { localDate } from '@/api/client';
import type { BodyweightEntry, CardioActivity, CardioWorkout, StatisticsData, Triathlon } from '@/api/types';
import { LineChart } from '@/components/line-chart';
import { Select } from '@/components/select';
import { ThemedText } from '@/components/themed-text';
import { TimespanPicker, timespanStart, type Timespan } from '@/components/timespan';
import { Card, Message, Screen, SectionLabel } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { syncBodyweight } from '@/health/bodyweight';
import { useHealthState } from '@/health/health-state';
import { isHealthAvailable } from '@/health/healthkit';
import { useQuery } from '@/hooks/use-query';
import { BodyweightStats } from '@/progress/bodyweight-stats';
import { CardioStats } from '@/progress/cardio-stats';
import { DietStats } from '@/progress/diet-stats';
import { useOpenedWith, useProgressTimespan } from '@/progress/progress-context';
import { personalRecords } from '@/progress/records';
import { CATEGORIES, categoryOf, seriesKey, seriesLabel, type Category, type Series } from '@/progress/series';
import { Tile, TileButton, TileRow } from '@/progress/tile';
import { TonnageStats } from '@/progress/tonnage-stats';
import { TriathlonStats } from '@/progress/triathlon-stats';
import { useSettings } from '@/settings/settings-context';
import { formatDate, formatKg } from '@/workout/format';

/**
 * Progress: buttons for the categories (strength, cardio, bodyweight), a
 * select of the lifts, activities or bodyweight and diet in the chosen one,
 * the timespan, and that series' charts and sessions below.
 */
export default function ProgressScreen() {
  const { api, serverUrl } = useSettings();
  const { timespan, setTimespan } = useProgressTimespan();
  const [category, setCategory] = useState<Category | null>(null);
  // The series last picked in each category, to come back to.
  const [picked, setPicked] = useState<Partial<Record<Category, Series>>>({});
  const names = useQuery(`stats:${serverUrl}`, async () => (await api.statistics()).exercises);
  // Oldest first, for the charts.
  const cardio = useQuery(`cardio:${serverUrl}`, async () => (await api.listCardio()).reverse());
  const triathlons = useQuery(`triathlons:${serverUrl}`, async () => (await api.listTriathlons()).reverse());
  // Loaded with the screen and handed to the page, so it's there the moment
  // Bodyweight is picked, with no fetch of its own to wait for.
  const bodyweight = useQuery(`bodyweight:${serverUrl}`, async () =>
    (await api.listBodyweight()).sort((a, b) => a.date.localeCompare(b.date))
  );
  // Opened on a series from elsewhere, e.g. Insights.
  useOpenedWith((params) => {
    const series: Series = params.exercise
      ? { kind: 'exercise', name: params.exercise }
      : params.activity
        ? { kind: 'cardio', activity: params.activity as CardioActivity }
        : { kind: 'triathlon' };
    setCategory(categoryOf(series));
    setPicked((p) => ({ ...p, [categoryOf(series)]: series }));
  });

  const workouts = cardio.data ?? [];
  const options: Record<Category, Series[]> = {
    strength: [
      ...(names.data ?? []).map((name) => ({ kind: 'exercise' as const, name })),
      ...((names.data ?? []).length > 0 ? [{ kind: 'tonnage' as const }] : []),
    ],
    cardio: [
      ...[...new Set(workouts.map((w) => w.activity))].map((activity) => ({ kind: 'cardio' as const, activity })),
      ...((triathlons.data ?? []).length > 0 ? [{ kind: 'triathlon' as const }] : []),
    ],
    bodyweight: [{ kind: 'bodyweight' }, { kind: 'diet' }],
  };
  // Until one is picked: lifts if there are any, else cardio, else bodyweight.
  // A list that failed to load leaves its category empty, saying why.
  const loaded = !!(names.data || names.error) && !!(cardio.data || cardio.error);
  const shown: Category | null =
    category ??
    (!loaded ? null : options.strength.length ? 'strength' : options.cardio.length ? 'cardio' : 'bodyweight');
  const choices = shown ? options[shown] : [];
  // Cardio defaults to the activity done last.
  const latest = workouts.at(-1);
  const preferred =
    picked[shown ?? 'bodyweight'] ??
    (shown === 'cardio' && latest ? { kind: 'cardio' as const, activity: latest.activity } : undefined);
  const series = choices.find((c) => preferred && seriesKey(c) === seriesKey(preferred)) ?? choices[0] ?? null;

  if (!shown) {
    return (
      <Screen title="Progress">
        <Message loading />
      </Screen>
    );
  }

  const controls = (
    <>
      <View accessibilityRole="tablist" accessibilityLabel="Category" style={styles.categories}>
        {CATEGORIES.map((c) => (
          <TileButton key={c.key} label={c.label} selected={c.key === shown} onPress={() => setCategory(c.key)} />
        ))}
      </View>
      {series && (
        <Select
          label={shown === 'strength' ? 'Exercise' : shown === 'cardio' ? 'Activity' : 'Show'}
          options={choices.map((c) => ({ key: seriesKey(c), label: seriesLabel(c) }))}
          value={seriesKey(series)}
          onChange={(key) => setPicked((p) => ({ ...p, [shown]: choices.find((c) => seriesKey(c) === key) }))}
        />
      )}
      <TimespanPicker value={timespan} onChange={setTimespan} />
    </>
  );

  return (
    <ProgressPage
      category={shown}
      series={series}
      controls={controls}
      timespan={timespan}
      names={names}
      cardio={cardio}
      triathlons={triathlons.data ?? []}
      storedBodyweight={bodyweight}
      onRefresh={() => {
        names.refresh();
        cardio.refresh();
        triathlons.refresh();
      }}
    />
  );
}

type Query<T> = { data?: T | null; error?: string | null; refreshing?: boolean };

/** One series' page under the controls: its charts and sessions, loading what it needs itself. */
function ProgressPage({
  category,
  series,
  controls,
  timespan,
  names,
  cardio,
  triathlons,
  storedBodyweight,
  onRefresh,
}: {
  category: Category;
  series: Series | null;
  controls: ReactNode;
  timespan: Timespan;
  names: Query<string[]>;
  cardio: Query<CardioWorkout[]>;
  triathlons: Triathlon[];
  storedBodyweight: Query<BodyweightEntry[]> & { refresh: () => void };
  onRefresh: () => void;
}) {
  const { api, serverUrl } = useSettings();
  const exercise = series?.kind === 'exercise' ? series.name : null;
  const exerciseData = useQuery(exercise === null ? null : `stats:${serverUrl}:${exercise}`, async () =>
    (await api.statistics(exercise!)).data.sort((a, b) => a.date.localeCompare(b.date))
  );
  // Tonnage comes with insights, over the timespan; no plan, since none of it depends on one.
  const isTonnage = series?.kind === 'tonnage';
  const today = localDate();
  const from = timespanStart(timespan);
  const tonnage = useQuery(
    isTonnage ? `tonnage:${serverUrl}:${today}:${from}` : null,
    async () => (await api.insights(today, from, null)).tonnage
  );
  const isDiet = series?.kind === 'diet';
  const diet = useQuery(isDiet ? `diet:${serverUrl}:${from}:${today}` : null, () =>
    api.listDiet(from ? { from, to: today } : undefined)
  );
  // Bodyweight shows the stored log and syncs it from Apple Health alongside,
  // so a slow or stalled Health read can't hold the log back.
  const health = useHealthState();
  const healthConnected = !!health.state.connectedAt && isHealthAvailable();
  const isBodyweight = series?.kind === 'bodyweight';
  const healthSync = useQuery(
    isBodyweight && health.loaded && healthConnected ? `bodyweight-sync:${serverUrl}` : null,
    () => syncBodyweight(api)
  );
  // Health's log once synced; null means Health had no weigh-ins.
  const bodyweight = healthSync.data ?? storedBodyweight.data;

  const refresh = () => {
    onRefresh();
    if (exercise !== null) exerciseData.refresh();
    if (isTonnage) tonnage.refresh();
    if (isDiet) diet.refresh();
    if (isBodyweight) {
      storedBodyweight.refresh();
      if (healthConnected) healthSync.refresh();
    }
  };

  return (
    <Screen title="Progress" refreshing={!!(names.refreshing || cardio.refreshing)} onRefresh={refresh}>
      {controls}
      {!series ? (
        <Message error={category === 'strength' ? names.error : cardio.error}>
          {category === 'strength'
            ? 'No lifts logged yet. Finish a workout to see your progress here.'
            : 'No cardio workouts yet. Connect Apple Health in Settings to import them.'}
        </Message>
      ) : series.kind === 'bodyweight' ? (
        !bodyweight ? (
          <Message loading={!storedBodyweight.error} error={storedBodyweight.error} />
        ) : (
          <BodyweightStats
            history={bodyweight}
            timespan={timespan}
            healthConnected={healthConnected}
            healthSyncing={healthSync.loading}
            healthSyncError={healthSync.error}
            onSynced={healthSync.refresh}
          />
        )
      ) : series.kind === 'diet' ? (
        !diet.data ? (
          <Message loading={!diet.error} error={diet.error} />
        ) : (
          <DietStats days={diet.data} timespan={timespan} today={today} />
        )
      ) : series.kind === 'tonnage' ? (
        !tonnage.data ? (
          <Message loading={!tonnage.error} error={tonnage.error} />
        ) : (
          <TonnageStats tonnage={tonnage.data} timespan={timespan} today={today} />
        )
      ) : series.kind === 'triathlon' ? (
        <TriathlonStats triathlons={triathlons} timespan={timespan} />
      ) : series.kind === 'cardio' ? (
        <CardioStats
          activity={series.activity}
          workouts={(cardio.data ?? []).filter((w) => w.activity === series.activity)}
          timespan={timespan}
        />
      ) : !exerciseData.data || exerciseData.data.length === 0 ? (
        <Message loading={!exerciseData.error} error={exerciseData.error} />
      ) : (
        <ExerciseStats data={exerciseData.data} timespan={timespan} />
      )}
    </Screen>
  );
}

function ExerciseStats({ data: all, timespan }: { data: StatisticsData[]; timespan: Timespan }) {
  const start = timespanStart(timespan);
  const data = start ? all.filter((d) => d.date >= start) : all;
  const chartCard = (
    <Card>
      <ThemedText type="smallBold">Estimated 1RM</ThemedText>
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
  categories: {
    flexDirection: 'row',
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
