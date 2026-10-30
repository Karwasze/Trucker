import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { localDate } from '@/api/client';
import type { CardioActivity, CardioWorkout, StatisticsData, Triathlon } from '@/api/types';
import { Carousel, TEXT_CAROUSEL_HEIGHT } from '@/components/carousel';
import { isRing } from '@/components/carousel-model';
import { AboveTabBar, useTabBarWidth } from '@/components/carousel-tab-bar';
import { LineChart } from '@/components/line-chart';
import { PagerPage, slideDirection, usePager, type Level } from '@/components/page-transition';
import { ThemedText } from '@/components/themed-text';
import { TimespanCarousel, timespanStart, type Timespan } from '@/components/timespan';
import { Card, Message, Screen, SectionLabel } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { syncBodyweight } from '@/health/bodyweight';
import { useHealthState } from '@/health/health-state';
import { isHealthAvailable } from '@/health/healthkit';
import { useQuery } from '@/hooks/use-query';
import { BodyweightStats } from '@/progress/bodyweight-stats';
import { CardioStats } from '@/progress/cardio-stats';
import { useOpenedWith, useProgressTimespan } from '@/progress/progress-context';
import { personalRecords } from '@/progress/records';
import { CATEGORIES, categoryOf, seriesKey, seriesLabel, type Category, type Series } from '@/progress/series';
import { Tile, TileRow } from '@/progress/tile';
import { TriathlonStats } from '@/progress/triathlon-stats';
import { SettingsButton } from '@/settings/settings-button';
import { useSettings } from '@/settings/settings-context';
import { formatDate, formatKg } from '@/workout/format';

/** A Progress page: a category, and the series in it shown, if it has any. */
type Page = { category: Category; series: Series | null; levels: Level[] };

/**
 * Progress: a carousel of categories (strength, cardio, bodyweight), a
 * carousel of the lifts or activities in the chosen one, and that series'
 * charts and sessions on a page of its own, sliding in beside the last as the
 * carousels turn, like the tabs do.
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
  // Loaded with the screen, so it's there the moment Bodyweight is picked.
  useQuery(`bodyweight:${serverUrl}`, async () =>
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
    strength: (names.data ?? []).map((name) => ({ kind: 'exercise', name })),
    cardio: [
      ...[...new Set(workouts.map((w) => w.activity))].map((activity) => ({ kind: 'cardio' as const, activity })),
      ...((triathlons.data ?? []).length > 0 ? [{ kind: 'triathlon' as const }] : []),
    ],
    bodyweight: [{ kind: 'bodyweight' }],
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

  const categoryIndex = CATEGORIES.findIndex((c) => c.key === shown);
  const page: Page | null = shown && {
    category: shown,
    series,
    levels: [
      { index: categoryIndex, count: CATEGORIES.length, ring: isRing(CATEGORIES.length, 3) },
      { index: series ? choices.indexOf(series) : 0, count: choices.length, ring: isRing(choices.length, 3) },
    ],
  };
  const pageKey = (p: Page | null) => (p ? `${p.category}:${p.series ? seriesKey(p.series) : ''}` : '');
  const pager = usePager(pageKey(page), page, (from, to) => (from && to ? slideDirection(from.levels, to.levels) : 0));

  // Carousels float above the tab bar: from the bottom up, the timespan,
  // the categories, then the category's series.
  const barWidth = useTabBarWidth();
  const seriesShown = shown !== null && shown !== 'bodyweight' && !!series;
  const floating = shown ? (seriesShown ? 3 : 2) : 0;

  const pageProps = {
    timespan,
    names,
    cardio,
    triathlons: triathlons.data ?? [],
    bottomInset: floating * (TEXT_CAROUSEL_HEIGHT + Spacing.two),
    onRefresh: () => {
      names.refresh();
      cardio.refresh();
      triathlons.refresh();
    },
  };

  return (
    <View style={styles.page}>
      {!page ? (
        <Screen title="Progress" action={<SettingsButton />}>
          <Message loading />
        </Screen>
      ) : (
        [pager.previous, pager.current].map(
          (p) =>
            p?.value && (
              <PagerPage key={p.key} pager={pager} pageKey={p.key}>
                <ProgressPage page={p.value} {...pageProps} />
              </PagerPage>
            )
        )
      )}
      {shown && (
        <AboveTabBar>
          {shown !== 'bodyweight' && series && (
            <Carousel
              // A fresh carousel for each category's list.
              key={shown}
              items={choices.map((c) => ({ key: seriesKey(c), label: seriesLabel(c) }))}
              index={choices.indexOf(series)}
              onChange={(i) => setPicked((p) => ({ ...p, [shown]: choices[i] }))}
              visible={3}
              accessibilityLabel={shown === 'strength' ? 'Exercise' : 'Activity'}
              testID="series"
              width={barWidth}
              floating
            />
          )}
          <Carousel
            items={CATEGORIES}
            index={categoryIndex}
            onChange={(i) => setCategory(CATEGORIES[i].key)}
            visible={3}
            accessibilityLabel="Category"
            testID="category"
            width={barWidth}
            floating
          />
          <TimespanCarousel value={timespan} onChange={setTimespan} />
        </AboveTabBar>
      )}
    </View>
  );
}

type Query<T> = { data?: T | null; error?: string | null; refreshing?: boolean };

/** One series' page: its charts and sessions, loading what it needs itself. */
function ProgressPage({
  page: { category, series },
  timespan,
  names,
  cardio,
  triathlons,
  bottomInset,
  onRefresh,
}: {
  page: Page;
  timespan: Timespan;
  names: Query<string[]>;
  cardio: Query<CardioWorkout[]>;
  triathlons: Triathlon[];
  bottomInset: number;
  onRefresh: () => void;
}) {
  const { api, serverUrl } = useSettings();
  const exercise = series?.kind === 'exercise' ? series.name : null;
  const exerciseData = useQuery(exercise === null ? null : `stats:${serverUrl}:${exercise}`, async () =>
    (await api.statistics(exercise!)).data.sort((a, b) => a.date.localeCompare(b.date))
  );
  // Bodyweight shows the stored log and syncs it from Apple Health alongside,
  // so a slow or stalled Health read can't hold the log back.
  const health = useHealthState();
  const healthConnected = !!health.state.connectedAt && isHealthAvailable();
  const isBodyweight = series?.kind === 'bodyweight';
  const storedBodyweight = useQuery(isBodyweight ? `bodyweight:${serverUrl}` : null, async () =>
    (await api.listBodyweight()).sort((a, b) => a.date.localeCompare(b.date))
  );
  const healthSync = useQuery(
    isBodyweight && health.loaded && healthConnected ? `bodyweight-sync:${serverUrl}` : null,
    () => syncBodyweight(api)
  );
  // Health's log once synced; null means Health had no weigh-ins.
  const bodyweight = healthSync.data ?? storedBodyweight.data;

  const refresh = () => {
    onRefresh();
    if (exercise !== null) exerciseData.refresh();
    if (isBodyweight) {
      storedBodyweight.refresh();
      if (healthConnected) healthSync.refresh();
    }
  };

  return (
    <Screen
      title="Progress"
      bottomInset={bottomInset}
      action={<SettingsButton />}
      refreshing={!!(names.refreshing || cardio.refreshing)}
      onRefresh={refresh}>
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
  page: {
    flex: 1,
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
