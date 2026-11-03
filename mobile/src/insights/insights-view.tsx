import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { localDate } from '@/api/client';
import type {
  Adherence,
  CardioActivity,
  CardioProgress,
  CardioSummary,
  GoalSummary,
  Insights,
  LiftProgress,
  PlanStall,
  StrengthLevel,
} from '@/api/types';
import { ThemedText } from '@/components/themed-text';
import { DEFAULT_TIMESPAN, TimespanPicker, timespanStart, type Timespan } from '@/components/timespan';
import { Card, Message, Screen, SectionLabel } from '@/components/ui';
import { Spacing, type ThemeColor } from '@/constants/theme';
import { PHASE_NAMES } from '@/goals/presets';
import { BodyMap } from '@/insights/body-map';
import { ZoneRanges } from '@/health/heart-rate-zones';
import { useQuery } from '@/hooks/use-query';
import { useTheme } from '@/hooks/use-theme';
import { Tile, TileButton, TileRow } from '@/progress/tile';
import { TriathlonInsights } from '@/triathlon/triathlon-insights';
import { useSettings } from '@/settings/settings-context';
import {
  ACTIVITY_ICONS,
  ACTIVITY_NAMES,
  formatDate,
  formatDistance,
  formatDuration,
  formatPace,
} from '@/workout/format';

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const formatNumber = (n: number) => String(Math.round(n * 10) / 10);
/** Day and month, with the year for dates from another year. */
const shortDate = (date: string) =>
  formatDate(date, {
    month: 'short',
    day: 'numeric',
    year: date.slice(0, 4) === localDate().slice(0, 4) ? undefined : 'numeric',
  });
const plural = (n: number, word: string, words = `${word}s`) => `${n} ${n === 1 ? word : words}`;
/** Missed days listed before collapsing the rest into a count. */
const MISSED_SHOWN = 5;
/** Sessions with a distance an activity needs for a pace trend, as on the server. */
const CARDIO_PROGRESS_SESSIONS = 3;

type Page = 'strength' | 'cardio';

const PAGES: { key: Page; label: string; subtitle: string }[] = [
  { key: 'strength', label: 'Strength', subtitle: 'Plan adherence, progression and strength levels' },
  { key: 'cardio', label: 'Cardio', subtitle: 'Race goal, pace and triathlons' },
];

/**
 * Insights: buttons for lifting and endurance analysis, the timespan both
 * share, then the chosen one's content. Charts per lift or activity live on
 * the Progress tab, a tap away.
 */
export function InsightsScreen() {
  const { api, planId, serverUrl } = useSettings();
  const [page, setPage] = useState<Page>('strength');
  const [timespan, setTimespan] = useState<Timespan>(DEFAULT_TIMESPAN);
  const today = localDate();
  const from = timespanStart(timespan);
  // One request for both pages.
  const insights = useQuery(`insights:${serverUrl}:${today}:${from}:${planId}`, () =>
    api.insights(today, from, planId)
  );
  return (
    <Screen
      title="Insights"
      subtitle={PAGES.find((p) => p.key === page)!.subtitle}
      refreshing={insights.refreshing}
      onRefresh={insights.refresh}>
      <View accessibilityRole="tablist" accessibilityLabel="Insights" style={styles.pages}>
        {PAGES.map((p) => (
          <TileButton key={p.key} label={p.label} selected={p.key === page} onPress={() => setPage(p.key)} />
        ))}
      </View>
      <TimespanPicker value={timespan} onChange={setTimespan} />
      {!insights.data ? (
        <Message loading={!insights.error} error={insights.error} />
      ) : page === 'strength' ? (
        <StrengthContent data={insights.data} timespan={timespan} hasPlan={planId !== null} />
      ) : (
        <CardioContent data={insights.data} timespan={timespan} />
      )}
    </Screen>
  );
}

function StrengthContent({ data, timespan, hasPlan }: { data: Insights; timespan: Timespan; hasPlan: boolean }) {
  const span = `the last ${timespan.label}`;
  // "In the last From beginning" doesn't read; over all time there were simply none.
  const allTime = timespan.months === null;
  return (
    <>
      <SectionLabel>Strength Plan</SectionLabel>
      {!hasPlan || !data.adherence ? (
        <Card>
          <ThemedText type="small" themeColor="textSecondary">
            Pick a plan under Training to track adherence and stalled lifts.
          </ThemedText>
        </Card>
      ) : !data.adherence.since ? (
        <Card>
          <ThemedText type="small" themeColor="textSecondary">
            Log a workout from {data.adherence.plan} to start tracking adherence.
          </ThemedText>
        </Card>
      ) : (
        <>
          <AdherenceSection adherence={data.adherence} />
          <SectionLabel>Stalled lifts</SectionLabel>
          <Card>
            {data.stalls.length === 0 ? (
              <ThemedText type="small" themeColor="textSecondary">
                Every {data.adherence.plan} lift is progressing.
              </ThemedText>
            ) : (
              data.stalls.map((s) => <StallRow key={s.exercise} stall={s} />)
            )}
          </Card>
        </>
      )}

      <SectionLabel>Progression · {allTime ? 'from beginning' : `last ${timespan.label}`}</SectionLabel>
      {!hasPlan ? (
        <Card>
          <ThemedText type="small" themeColor="textSecondary">
            Pick a plan under Training to follow the progression of its lifts.
          </ThemedText>
        </Card>
      ) : data.progression.length === 0 ? (
        <Card>
          <ThemedText type="small" themeColor="textSecondary">
            {allTime ? 'No workouts.' : `No weighted plan lifts in ${span}.`}
          </ThemedText>
        </Card>
      ) : (
        pairs(data.progression).map((row) => (
          <TileRow key={row[0].exercise}>
            {row.map((p) => (
              <ProgressTile key={p.exercise} progress={p} timespan={timespan} />
            ))}
            {row.length === 1 && <View style={{ flex: 1 }} />}
          </TileRow>
        ))
      )}

      <SectionLabel>Muscles · {allTime ? 'from beginning' : `last ${timespan.label}`}</SectionLabel>
      {data.muscles.every((m) => m.weekly_sets <= 0) ? (
        <Card>
          <ThemedText type="small" themeColor="textSecondary">
            {allTime ? 'No tagged lifts.' : `No tagged lifts in ${span}.`} Tag exercises in Settings → Muscles to see
            which muscles they work.
          </ThemedText>
        </Card>
      ) : (
        <BodyMap muscles={data.muscles} span={allTime ? null : span} />
      )}

      <SectionLabel>Strength levels</SectionLabel>
      <Card>
        {!data.bodyweight ? (
          <ThemedText type="small" themeColor="textSecondary">
            Connect Apple Health in Settings to import your bodyweight and see how strong your lifts are for your size.
          </ThemedText>
        ) : data.strength.length === 0 ? (
          <ThemedText type="small" themeColor="textSecondary">
            Log a squat, bench press, deadlift, overhead press or Romanian deadlift to see your strength level.
          </ThemedText>
        ) : (
          data.strength.map((s) => <StrengthRow key={s.exercise} level={s} />)
        )}
      </Card>

      {data.untagged.length > 0 && (
        <>
          <SectionLabel>Untagged exercises</SectionLabel>
          <Card>
            <ThemedText>{data.untagged.join(', ')}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              These don&apos;t count towards muscle volume. Tag them in Settings → Muscles.
            </ThemedText>
          </Card>
        </>
      )}
    </>
  );
}

function CardioContent({ data, timespan }: { data: Insights; timespan: Timespan }) {
  const allTime = timespan.months === null;
  const trends = data.cardio_progression;
  return (
    <>
      {data.goal && <GoalSection summary={data.goal} />}

      <SectionLabel>Activities</SectionLabel>
      <Card>
        {data.cardio.length === 0 ? (
          <ThemedText type="small" themeColor="textSecondary">
            {allTime ? 'No cardio workouts.' : `No cardio in the last ${timespan.label}.`}
          </ThemedText>
        ) : (
          data.cardio.map((c) => <CardioRow key={c.activity} summary={c} timespan={timespan} />)
        )}
      </Card>

      {data.cardio.length > 0 && (
        <>
          <SectionLabel>Progression · {allTime ? 'from beginning' : `last ${timespan.label}`}</SectionLabel>
          <Card>
            {!trends ? (
              <ThemedText type="small" themeColor="textSecondary">
                Update the server to see whether your pace is improving.
              </ThemedText>
            ) : (
              <>
                {trends.map((p) => (
                  <PaceRow key={p.activity} progress={p} timespan={timespan} />
                ))}
                {data.cardio
                  .filter((c) => !trends.some((p) => p.activity === c.activity))
                  .map((c) => (
                    <NoPaceRow key={c.activity} summary={c} />
                  ))}
              </>
            )}
          </Card>
        </>
      )}

      <ZoneRanges />

      {data.triathlon && <TriathlonInsights summary={data.triathlon} timespan={timespan} />}
    </>
  );
}

function AdherenceSection({ adherence: a }: { adherence: Adherence }) {
  const missed = a.missed.slice(0, MISSED_SHOWN).map(shortDate).join(', ');
  const more = a.missed.length - MISSED_SHOWN;
  return (
    <>
      <TileRow>
        <Tile label="Done" value={`${a.completed} / ${a.scheduled}`} />
        <Tile label="Rate" value={a.scheduled > 0 ? `${Math.round((a.completed / a.scheduled) * 100)}%` : '–'} />
        <Tile label="Streak" value={String(a.streak)} />
      </TileRow>
      <Card>
        <ThemedText type="small" themeColor="textSecondary">
          {a.plan} since {shortDate(a.since!)}
          {a.extra > 0 ? ` · ${plural(a.extra, 'extra session')}` : ''}
        </ThemedText>
        {a.missed.length === 0 ? (
          <ThemedText>No missed sessions.</ThemedText>
        ) : (
          <ThemedText>
            Missed {missed}
            {more > 0 ? ` and ${more} more` : ''}
          </ThemedText>
        )}
      </Card>
    </>
  );
}

function StallRow({ stall: s }: { stall: PlanStall }) {
  const weight = s.weight > 0 ? `${formatNumber(s.weight)} kg` : 'bodyweight';
  return (
    <View style={styles.item}>
      <View style={styles.row}>
        <ThemedText style={{ flex: 1 }}>{s.exercise}</ThemedText>
        <ThemedText type="smallBold">
          {s.status === 'missing' ? `${plural(s.misses, 'miss', 'misses')} at ${weight}` : 'Deloaded'}
        </ThemedText>
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        {s.status === 'missing'
          ? `Last on ${shortDate(s.date)}${s.deload_next ? ' · deloads next session' : ''}`
          : `After ${plural(s.misses, 'miss', 'misses')} at ${weight} on ${shortDate(s.date)}`}
      </ThemedText>
    </View>
  );
}

/** Splits `items` into rows of two, for a grid of half-width tiles. */
const pairs = <T,>(items: T[]) =>
  Array.from({ length: Math.ceil(items.length / 2) }, (_, i) => items.slice(i * 2, i * 2 + 2));

/** A lift's latest est. 1RM against its record; its chart is on Progress, a tap away. */
function ProgressTile({ progress: p, timespan }: { progress: LiftProgress; timespan: Timespan }) {
  const theme = useTheme();
  const atRecord = p.latest_1rm >= p.record_1rm;
  const share = Math.min(p.latest_1rm / p.record_1rm, 1);
  return (
    <Pressable
      onPress={() => router.navigate({ pathname: '/stats', params: { exercise: p.exercise, span: timespan.key } })}
      style={({ pressed }) => [{ flex: 1 }, pressed && { opacity: 0.6 }]}
      accessibilityRole="button"
      accessibilityHint={`Opens the ${p.exercise} chart`}>
      <Card style={styles.tile}>
        <ThemedText type="smallBold" numberOfLines={1}>
          {p.exercise}
        </ThemedText>
        <ThemedText style={styles.big} numberOfLines={1} adjustsFontSizeToFit>
          {formatNumber(p.latest_1rm)} kg
        </ThemedText>
        <View style={[styles.bar, { backgroundColor: theme.backgroundSelected }]}>
          <View
            style={[
              styles.fill,
              { width: `${share * 100}%`, backgroundColor: atRecord ? theme.success : theme.accent },
            ]}
          />
        </View>
        <ThemedText type="small" themeColor={atRecord ? 'success' : 'textSecondary'} numberOfLines={1}>
          {atRecord ? 'Record' : `${Math.round(share * 100)}% of record`}
        </ThemedText>
      </Card>
    </Pressable>
  );
}

/** Where the active goal stands over its whole plan, and the paces its targets use. */
function GoalSection({ summary: g }: { summary: GoalSummary }) {
  const activities = (Object.keys(g.planned_m) as CardioActivity[]).sort();
  const thresholds = (Object.keys(g.threshold) as CardioActivity[]).filter((a) => g.threshold[a]);
  const threshold = (activity: CardioActivity) => {
    const speed = g.threshold[activity]!;
    if (activity === 'cycling') return `${(speed * 3.6).toFixed(1)} km/h`;
    if (activity === 'swimming') return `${formatDuration(100 / speed)}/100 m`;
    return `${formatDuration(1000 / speed)}/km`;
  };
  return (
    <>
      <SectionLabel>{g.goal.name}</SectionLabel>
      <Card>
        <ThemedText type="smallBold">
          {PHASE_NAMES[g.phase]} · week {g.week} of {g.weeks} ·{' '}
          {g.weeks_to_race === 0 ? 'race week' : `${plural(g.weeks_to_race, 'week')} to race day`}
        </ThemedText>
        <View style={{ flexDirection: 'row', gap: Spacing.two }}>
          <Stat label="Met" value={String(g.met)} />
          <Stat label="Partly" value={String(g.partial)} />
          <Stat label="Missed" value={String(g.missed)} />
          <Stat label="To do" value={String(g.pending)} />
        </View>
        {activities.map((a) => (
          <ThemedText key={a} type="small" themeColor="textSecondary">
            {ACTIVITY_ICONS[a]} {formatDistance(g.done_m[a] ?? 0, a)} of {formatDistance(g.due_m[a] ?? 0, a)} so far ·{' '}
            {formatDistance(g.planned_m[a] ?? 0, a)} in the plan
          </ThemedText>
        ))}
        {thresholds.length > 0 && (
          <ThemedText type="small" themeColor="textSecondary">
            Threshold: {thresholds.map((a) => `${ACTIVITY_ICONS[a]} ${threshold(a)}`).join(' · ')}
          </ThemedText>
        )}
      </Card>
    </>
  );
}

function CardioRow({ summary: c, timespan }: { summary: CardioSummary; timespan: Timespan }) {
  return (
    <Pressable
      onPress={() => router.navigate({ pathname: '/stats', params: { activity: c.activity, span: timespan.key } })}
      accessibilityRole="button"
      accessibilityHint={`Opens the ${ACTIVITY_NAMES[c.activity]} chart`}
      style={({ pressed }) => [{ gap: Spacing.one }, pressed && { opacity: 0.5 }]}>
      <ThemedText type="smallBold">
        {ACTIVITY_ICONS[c.activity]} {ACTIVITY_NAMES[c.activity]} · {plural(c.sessions, 'session')}
      </ThemedText>
      <View style={{ flexDirection: 'row', gap: Spacing.two }}>
        <Stat label="Per week" value={formatDistance(c.weekly_distance_m, c.activity)} />
        <Stat label="Total" value={formatDistance(c.distance_m, c.activity)} />
        <Stat label="Time" value={formatDuration(c.duration_seconds)} />
        <Stat
          label={c.activity === 'cycling' ? 'Avg speed' : 'Avg pace'}
          value={formatPace(c.activity, c.distance_m, c.duration_seconds) || '–'}
        />
      </View>
    </Pressable>
  );
}

/** Whether an activity's pace improved over the timespan; its chart is on Progress, a tap away. */
function PaceRow({ progress: p, timespan }: { progress: CardioProgress; timespan: Timespan }) {
  const change = (p.end_speed - p.start_speed) / p.start_speed;
  const percent = Math.round(Math.abs(change) * 100);
  const trend: ThemeColor = percent === 0 ? 'textSecondary' : change > 0 ? 'success' : 'danger';
  // Speed for rides, pace for the rest, as on Progress.
  const pace = (speed: number) => formatPace(p.activity, speed, 1);
  return (
    <Pressable
      onPress={() => router.navigate({ pathname: '/stats', params: { activity: p.activity, span: timespan.key } })}
      accessibilityRole="button"
      accessibilityHint={`Opens the ${ACTIVITY_NAMES[p.activity]} chart`}
      style={({ pressed }) => [styles.item, pressed && { opacity: 0.5 }]}>
      <View style={styles.row}>
        <ThemedText style={{ flex: 1 }}>
          {ACTIVITY_ICONS[p.activity]} {ACTIVITY_NAMES[p.activity]}
        </ThemedText>
        <ThemedText type="smallBold" themeColor={trend}>
          {percent === 0 ? 'Steady' : `${change > 0 ? '▲' : '▼'} ${percent}% ${change > 0 ? 'faster' : 'slower'}`}
        </ThemedText>
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        {pace(p.start_speed)} → {pace(p.end_speed)} · {plural(p.sessions, 'session')} since {shortDate(p.first_date)}
      </ThemedText>
    </Pressable>
  );
}

/** An activity without a pace trend yet, and what it still needs. */
function NoPaceRow({ summary: c }: { summary: CardioSummary }) {
  return (
    <View style={styles.item}>
      <View style={styles.row}>
        <ThemedText style={{ flex: 1 }}>
          {ACTIVITY_ICONS[c.activity]} {ACTIVITY_NAMES[c.activity]}
        </ThemedText>
        <ThemedText type="smallBold" themeColor="textSecondary">
          No trend yet
        </ThemedText>
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        {c.sessions < CARDIO_PROGRESS_SESSIONS
          ? `${c.sessions} of the ${CARDIO_PROGRESS_SESSIONS} sessions needed · any distance counts`
          : `Needs a recorded distance on ${CARDIO_PROGRESS_SESSIONS} sessions, on more than one day`}
      </ThemedText>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1 }}>
      <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
        {label}
      </ThemedText>
      <ThemedText type="smallBold" style={{ fontVariant: ['tabular-nums'] }}>
        {value}
      </ThemedText>
    </View>
  );
}

function StrengthRow({ level }: { level: StrengthLevel }) {
  return (
    <View style={styles.item}>
      <View style={styles.row}>
        <ThemedText style={{ flex: 1 }}>{level.exercise}</ThemedText>
        <ThemedText type="smallBold">{level.level ? capitalize(level.level) : 'Below beginner'}</ThemedText>
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        {formatNumber(level.best_1rm)} kg est. 1RM · {level.ratio.toFixed(2)}× BW
        {level.next_level ? ` · +${formatNumber(level.next_level_kg)} kg to ${level.next_level}` : ''}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  pages: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  item: {
    gap: Spacing.half,
  },
  num: {
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
  tile: {
    flex: 1,
    gap: Spacing.one,
    padding: Spacing.three,
  },
  bar: {
    height: 6,
    borderRadius: 4,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 4,
  },
  big: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: 700,
    fontVariant: ['tabular-nums'],
  },
});
