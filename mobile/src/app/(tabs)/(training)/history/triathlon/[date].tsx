import { Link, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card, Message, Screen, SectionLabel } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { CardioSummary } from '@/health/cardio-summary';
import { useQuery } from '@/hooks/use-query';
import { Tile, TileRow } from '@/progress/tile';
import { useSettings } from '@/settings/settings-context';
import { SplitBar, useLegColors } from '@/triathlon/split-bar';
import { classRecord, percent, TRIATHLON_LEGS, triathlonName } from '@/triathlon/triathlon';
import {
  ACTIVITY_ICONS,
  ACTIVITY_NAMES,
  formatDate,
  formatDistance,
  formatDuration,
  formatPace,
} from '@/workout/format';

/** A triathlon day: its total against the class record, the split and each leg's workouts. */
export default function TriathlonDetailScreen() {
  const { date } = useLocalSearchParams<{ date: string }>();
  const { api, serverUrl } = useSettings();
  const triathlons = useQuery(`triathlons:${serverUrl}`, api.listTriathlons);
  const cardio = useQuery(`cardio:${serverUrl}`, () => api.listCardio());
  const colors = useLegColors();

  const t = triathlons.data?.find((o) => o.date === date);
  const record = t && classRecord(t, triathlons.data!);
  const loading = !triathlons.data || !cardio.data;
  return (
    <Screen
      hasHeader
      refreshing={triathlons.refreshing}
      onRefresh={() => {
        triathlons.refresh();
        cardio.refresh();
      }}>
      {loading ? (
        <Message loading={!triathlons.error && !cardio.error} error={triathlons.error ?? cardio.error} />
      ) : !t ? (
        <Message>No triathlon on this day any more.</Message>
      ) : (
        <>
          <Card>
            <ThemedText style={{ fontSize: 22, fontWeight: 700 }}>{triathlonName(t)}</ThemedText>
            <ThemedText themeColor="textSecondary">{formatDate(t.date)}</ThemedText>
          </Card>
          <TileRow>
            <Tile label="Total" value={formatDuration(t.total_seconds)} />
            {record && (
              <Tile
                label={
                  record.date === t.date
                    ? 'Class record'
                    : `Best · ${formatDate(record.date, { month: 'short', day: 'numeric' })}`
                }
                value={record.date === t.date ? 'PR' : `+${formatDuration(t.total_seconds - record.total_seconds)}`}
              />
            )}
          </TileRow>
          <Card>
            <ThemedText type="smallBold">Split</ThemedText>
            <SplitBar triathlon={t} />
            {TRIATHLON_LEGS.map(({ key, activity }) => {
              const leg = t[key];
              return (
                <View key={key}>
                  <View style={styles.row}>
                    <View style={[styles.dot, { backgroundColor: colors[key] }]} />
                    <ThemedText style={{ flex: 1 }}>
                      {ACTIVITY_ICONS[activity]} {ACTIVITY_NAMES[activity]}
                    </ThemedText>
                    <ThemedText style={styles.num}>{formatDuration(leg.duration_seconds)}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary" style={[styles.num, { width: 40 }]}>
                      {percent(leg.duration_seconds / t.total_seconds)}
                    </ThemedText>
                  </View>
                  <ThemedText type="small" themeColor="textSecondary" style={{ marginLeft: 8 + Spacing.two }}>
                    {[
                      leg.distance_m ? formatDistance(leg.distance_m, activity) : 'No distance',
                      formatPace(activity, leg.distance_m, leg.duration_seconds),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </ThemedText>
                </View>
              );
            })}
            <ThemedText type="small" themeColor="textSecondary">
              Transitions aren&apos;t counted: the total adds up the legs.
            </ThemedText>
          </Card>

          <SectionLabel>Workouts</SectionLabel>
          {TRIATHLON_LEGS.flatMap(({ key }) => t[key].workout_ids).map((id) => {
            const w = cardio.data!.find((c) => c.id === id);
            return (
              w && (
                <Link key={id} href={{ pathname: '/history/cardio/[id]', params: { id } }} asChild>
                  <Pressable style={({ pressed }) => pressed && { opacity: 0.6 }}>
                    <Card>
                      <CardioSummary workout={w} />
                    </Card>
                  </Pressable>
                </Link>
              )
            );
          })}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
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
