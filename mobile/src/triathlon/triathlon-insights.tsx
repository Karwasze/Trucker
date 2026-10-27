import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import type { Triathlon, TriathlonSummary } from '@/api/types';
import { ThemedText } from '@/components/themed-text';
import type { Timespan } from '@/components/timespan';
import { Card, SectionLabel } from '@/components/ui';
import { Spacing, type ThemeColor } from '@/constants/theme';
import { SplitBar, useLegColors } from '@/triathlon/split-bar';
import { legSpeed, percent, TRIATHLON_CLASS_NAMES, TRIATHLON_LEGS, triathlonName } from '@/triathlon/triathlon';
import { ACTIVITY_ICONS, ACTIVITY_NAMES, formatDate, formatDuration, formatPace } from '@/workout/format';

const shortDate = (date: string) => formatDate(date, { month: 'short', day: 'numeric' });

/**
 * Triathlons on the Insights tab: the latest against its class record, how
 * its time split between the legs against a typical split, each leg's pace
 * since the first triathlon of the timespan, and the record of each class.
 */
export function TriathlonInsights({ summary: s, timespan }: { summary: TriathlonSummary; timespan: Timespan }) {
  const colors = useLegColors();
  const t = s.latest;
  const record = s.records.find((r) => r.class === t.class);
  const behind = record && record.date !== t.date ? t.total_seconds - record.total_seconds : 0;
  const weakest = s.weakest && TRIATHLON_LEGS.find((l) => l.key === s.weakest)!;

  return (
    <>
      <SectionLabel>Triathlon</SectionLabel>
      <Pressable
        onPress={() =>
          router.navigate({ pathname: '/stats/cardio', params: { series: 'triathlon', span: timespan.key } })
        }
        style={({ pressed }) => pressed && { opacity: 0.6 }}
        accessibilityRole="button"
        accessibilityHint="Opens the triathlon chart">
        <Card>
          <View style={styles.row}>
            <ThemedText type="smallBold" style={{ flex: 1 }}>
              Latest · {triathlonName(t)} · {shortDate(t.date)}
            </ThemedText>
            <ThemedText themeColor="textSecondary">›</ThemedText>
          </View>
          <View style={[styles.row, { alignItems: 'baseline' }]}>
            <ThemedText style={[styles.big, { flex: 1 }]}>{formatDuration(t.total_seconds)}</ThemedText>
            {record && (
              <ThemedText type="smallBold" themeColor={behind > 0 ? 'textSecondary' : 'success'}>
                {behind > 0 ? `+${formatDuration(behind)} off your best` : 'Class record'}
              </ThemedText>
            )}
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            {s.count === 1 ? '1 triathlon' : `${s.count} triathlons`}
            {timespan.months === null ? ' in total' : ` in the last ${timespan.label}`}
          </ThemedText>

          <SplitBar triathlon={t} typical={s.typical_share} />
          {TRIATHLON_LEGS.map(({ key, activity }) => (
            <View key={key} style={styles.row}>
              <View style={[styles.dot, { backgroundColor: colors[key] }]} />
              <ThemedText type="small" style={{ flex: 1 }}>
                {ACTIVITY_ICONS[activity]} {ACTIVITY_NAMES[activity]} · {formatDuration(t[key].duration_seconds)}
              </ThemedText>
              <ThemedText type="smallBold" style={styles.num}>
                {percent(s.share[key])}
              </ThemedText>
              {s.typical_share && (
                <ThemedText type="small" themeColor="textSecondary" style={[styles.num, { width: 84 }]}>
                  typical {percent(s.typical_share[key])}
                </ThemedText>
              )}
            </View>
          ))}
          <ThemedText type="small" themeColor="textSecondary">
            {weakest
              ? `Your ${ACTIVITY_NAMES[weakest.activity].toLowerCase()} takes ${percent(s.share[weakest.key])} of your time, against a typical ${percent(s.typical_share![weakest.key])}: the leg with the most to gain.`
              : s.typical_share
                ? 'Your split is close to typical: no leg is holding you back.'
                : 'Custom distances have no typical split to compare with.'}
          </ThemedText>
        </Card>
      </Pressable>

      {s.first && <PaceTrend first={s.first} latest={t} />}

      {s.records.length > 0 && (
        <Card>
          <ThemedText type="smallBold">Best times</ThemedText>
          {s.records.map((r) => (
            <View key={r.class} style={styles.row}>
              <ThemedText style={{ flex: 1 }}>{TRIATHLON_CLASS_NAMES[r.class]}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {shortDate(r.date)}
              </ThemedText>
              <ThemedText type="smallBold" style={[styles.num, { width: 72 }]}>
                {formatDuration(r.total_seconds)}
              </ThemedText>
            </View>
          ))}
        </Card>
      )}
    </>
  );
}

/** Each leg's pace in the first triathlon of the timespan and the latest. */
function PaceTrend({ first, latest }: { first: Triathlon; latest: Triathlon }) {
  return (
    <Card>
      <ThemedText type="smallBold">Pace since {shortDate(first.date)}</ThemedText>
      {TRIATHLON_LEGS.map(({ key, activity }) => {
        const before = legSpeed(first[key]);
        const now = legSpeed(latest[key]);
        const pace = (t: Triathlon) => formatPace(activity, t[key].distance_m, t[key].duration_seconds) || '–';
        const change = before && now ? (now - before) / before : undefined;
        const color: ThemeColor =
          change === undefined || Math.abs(change) < 0.005 ? 'textSecondary' : change > 0 ? 'success' : 'danger';
        const arrow = change === undefined ? '' : Math.abs(change) < 0.005 ? '±' : change > 0 ? '▲' : '▼';
        return (
          <View key={key} style={styles.row}>
            <ThemedText type="small" style={{ flex: 1 }}>
              {ACTIVITY_ICONS[activity]} {pace(first)} → {pace(latest)}
            </ThemedText>
            <ThemedText type="smallBold" themeColor={color} style={styles.num}>
              {change === undefined ? '–' : `${arrow} ${Math.round(Math.abs(change) * 1000) / 10}%`}
            </ThemedText>
          </View>
        );
      })}
      <ThemedText type="small" themeColor="textSecondary">
        Faster is better. Paces compare across distances, so a longer race can read as slower.
      </ThemedText>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  big: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: 700,
    fontVariant: ['tabular-nums'],
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  num: {
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
});
