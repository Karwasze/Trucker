import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { localDate } from '@/api/client';
import type { Adherence, Insights, LiftProgress, PlanStall, StrengthLevel, Tonnage } from '@/api/types';
import { LineChart } from '@/components/line-chart';
import { ThemedText } from '@/components/themed-text';
import { TIMESPANS, TimespanControl, timespanStart, type Timespan } from '@/components/timespan';
import { Card, Message, Screen, SectionLabel } from '@/components/ui';
import { Spacing, type ThemeColor } from '@/constants/theme';
import { useQuery } from '@/hooks/use-query';
import { useTheme } from '@/hooks/use-theme';
import { Tile, TileRow } from '@/progress/tile';
import { SettingsButton } from '@/settings/settings-button';
import { useSettings } from '@/settings/settings-context';
import { formatDate, formatKg } from '@/workout/format';

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const formatNumber = (n: number) => String(Math.round(n * 10) / 10);
const shortDate = (date: string) => formatDate(date, { month: 'short', day: 'numeric' });
const plural = (n: number, word: string, words = `${word}s`) => `${n} ${n === 1 ? word : words}`;
/** Missed days listed before collapsing the rest into a count. */
const MISSED_SHOWN = 5;

/** Training analysis, shown on the Insights tab. Charts per lift live on the Progress tab, a tap away. */
export function InsightsView() {
  const { api, planId, serverUrl } = useSettings();
  const [timespan, setTimespan] = useState<Timespan>(TIMESPANS[0]);
  const today = localDate();
  const from = timespanStart(timespan);
  const insights = useQuery(`insights:${serverUrl}:${today}:${from}:${planId}`, () =>
    api.insights(today, from, planId)
  );

  return (
    <Screen
      title="Insights"
      subtitle="Plan adherence, progression and strength"
      action={<SettingsButton />}
      refreshing={insights.refreshing}
      onRefresh={insights.refresh}>
      <TimespanControl value={timespan} onChange={setTimespan} />
      {!insights.data ? (
        <Message loading={!insights.error} error={insights.error} />
      ) : (
        <InsightsContent data={insights.data} timespan={timespan} hasPlan={planId !== null} />
      )}
    </Screen>
  );
}

function InsightsContent({ data, timespan, hasPlan }: { data: Insights; timespan: Timespan; hasPlan: boolean }) {
  const span = `the last ${timespan.label}`;
  return (
    <>
      <SectionLabel>Plan</SectionLabel>
      {!hasPlan || !data.adherence ? (
        <Card>
          <ThemedText type="small" themeColor="textSecondary">
            Pick a plan on the Plans tab to track adherence and stalled lifts.
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

      <SectionLabel>Progression</SectionLabel>
      {data.progression.length === 0 ? (
        <Card>
          <ThemedText type="small" themeColor="textSecondary">
            No weighted {hasPlan ? 'plan ' : ''}lifts in {span}.
          </ThemedText>
        </Card>
      ) : (
        data.progression.map((p) => <ProgressCard key={p.exercise} progress={p} timespan={timespan} />)
      )}

      <SectionLabel>Tonnage</SectionLabel>
      {data.tonnage.total === 0 ? (
        <Card>
          <ThemedText type="small" themeColor="textSecondary">
            Nothing lifted in {span}.
          </ThemedText>
        </Card>
      ) : (
        <TonnageSection tonnage={data.tonnage} today={data.date} />
      )}

      <SectionLabel>Strength</SectionLabel>
      <Card>
        {!data.bodyweight ? (
          <ThemedText type="small" themeColor="textSecondary">
            Log your bodyweight on the Progress tab to see how strong your lifts are for your size.
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

function ProgressCard({ progress: p, timespan }: { progress: LiftProgress; timespan: Timespan }) {
  const theme = useTheme();
  const change = p.latest_1rm - p.first_1rm;
  const single = p.sessions === 1;
  const trend: ThemeColor = single || change === 0 ? 'textSecondary' : change > 0 ? 'success' : 'danger';
  const arrow = change > 0 ? '▲' : change < 0 ? '▼' : '±';
  const percent = Math.round((Math.abs(change) / p.first_1rm) * 1000) / 10;
  const atRecord = p.latest_1rm >= p.record_1rm;
  const share = Math.min(p.latest_1rm / p.record_1rm, 1);
  const rate =
    p.per_month === undefined ? '–' : `${p.per_month >= 0 ? '+' : '−'}${formatNumber(Math.abs(p.per_month))} kg`;
  return (
    <Pressable
      onPress={() => router.navigate({ pathname: '/stats', params: { exercise: p.exercise, span: timespan.key } })}
      style={({ pressed }) => pressed && { opacity: 0.6 }}
      accessibilityRole="button"
      accessibilityHint={`Opens the ${p.exercise} chart`}>
      <Card>
        <View style={styles.row}>
          <ThemedText type="smallBold" style={{ flex: 1 }}>
            {p.exercise}
          </ThemedText>
          <ThemedText themeColor="textSecondary">›</ThemedText>
        </View>
        <View style={[styles.row, { alignItems: 'baseline' }]}>
          <ThemedText style={styles.big}>{formatNumber(p.latest_1rm)} kg</ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={{ flex: 1 }}>
            est. 1RM
          </ThemedText>
          <ThemedText type="smallBold" themeColor={trend} style={styles.num}>
            {single ? '–' : `${arrow} ${formatNumber(Math.abs(change))} kg (${percent}%)`}
          </ThemedText>
        </View>
        <View style={styles.row}>
          <View style={[styles.bar, { backgroundColor: theme.backgroundSelected }]}>
            <View
              style={[styles.fill, { width: `${share * 100}%`, backgroundColor: atRecord ? theme.success : theme.accent }]}
            />
          </View>
          <ThemedText type="small" themeColor={atRecord ? 'success' : 'textSecondary'} style={styles.num}>
            {atRecord ? 'Record' : `${Math.round(share * 100)}% of record`}
          </ThemedText>
        </View>
        <View style={styles.row}>
          <Stat label={`Record · ${shortDate(p.record_date)}`} value={`${formatNumber(p.record_1rm)} kg`} />
          <Stat label="Per month" value={rate} />
          <Stat label="PRs" value={String(p.prs)} />
        </View>
      </Card>
    </Pressable>
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

function TonnageSection({ tonnage, today }: { tonnage: Tonnage; today: string }) {
  const best = tonnage.weekly.reduce((a, b) => (b.tonnage > a.tonnage ? b : a));
  return (
    <>
      <TileRow>
        <Tile label="Total" value={formatKg(tonnage.total)} />
        <Tile label={`Best week (${shortDate(best.week)})`} value={formatKg(best.tonnage)} />
      </TileRow>
      {tonnage.weekly.length > 1 && (
        <Card>
          <ThemedText type="smallBold">Weekly tonnage</ThemedText>
          <LineChart
            points={tonnage.weekly.map((w) => ({
              date: w.week,
              value: w.tonnage,
            }))}
            from={tonnage.weekly[0].week}
            to={today}
            unit="kg"
          />
        </Card>
      )}
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
  bar: {
    flex: 1,
    height: 8,
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
