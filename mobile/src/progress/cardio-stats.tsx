import { router } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { localDate } from '@/api/client';
import type { CardioActivity, CardioWorkout } from '@/api/types';
import { WeeklyBarChart } from '@/components/bar-chart';
import { mondayOf } from '@/components/chart-scale';
import { LineChart } from '@/components/line-chart';
import { ThemedText } from '@/components/themed-text';
import { TimespanControl, timespanStart, type Timespan } from '@/components/timespan';
import { Card, Message, SectionLabel } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { Tile, TileRow } from '@/progress/tile';
import { formatDate, formatDistance, formatDuration, formatPace } from '@/workout/format';

/**
 * How fast a workout went, as the chart plots it: km/h for rides, minutes
 * per 100 m for swims and minutes per km otherwise.
 */
function speedValue(activity: CardioActivity, w: CardioWorkout) {
  const metres = w.distance_m ?? 0;
  if (activity === 'cycling') return (metres / w.duration_seconds) * 3.6;
  return w.duration_seconds / 60 / (metres / (activity === 'swimming' ? 100 : 1000));
}

/**
 * An activity's cardio workouts on the Progress tab: totals over the
 * timespan, weekly distance, speed per session and the sessions themselves.
 * `all` is sorted by date.
 */
export function CardioStats({
  activity,
  workouts: all,
  timespan,
  onTimespanChange,
}: {
  activity: CardioActivity;
  workouts: CardioWorkout[];
  timespan: Timespan;
  onTimespanChange: (timespan: Timespan) => void;
}) {
  const start = timespanStart(timespan);
  const workouts = start ? all.filter((w) => w.date >= start) : all;
  const from = start ?? workouts[0]?.date ?? localDate();
  const swim = activity === 'swimming';

  const distance = workouts.reduce((sum, w) => sum + (w.distance_m ?? 0), 0);
  const withDistance = workouts.filter((w) => w.distance_m);
  const timed = withDistance.reduce((sum, w) => sum + w.duration_seconds, 0);
  const coveredForPace = withDistance.reduce((sum, w) => sum + w.distance_m!, 0);

  const weekly = new Map<string, number>();
  for (const w of workouts) {
    const week = mondayOf(w.date);
    weekly.set(week, (weekly.get(week) ?? 0) + (w.distance_m ?? 0));
  }
  const weeklyTotals = [...weekly].map(([week, metres]) => ({
    week,
    value: swim ? metres : metres / 1000,
  }));
  const speedPoints = withDistance.map((w) => ({ date: w.date, value: speedValue(activity, w) }));

  if (workouts.length === 0) {
    return (
      <Card>
        <TimespanControl value={timespan} onChange={onTimespanChange} />
        <Message>No sessions in the last {timespan.label}.</Message>
      </Card>
    );
  }

  return (
    <>
      <TileRow>
        <Tile label="Sessions" value={String(workouts.length)} />
        <Tile label="Distance" value={formatDistance(distance, activity)} />
        <Tile
          label={activity === 'cycling' ? 'Avg speed' : 'Avg pace'}
          value={formatPace(activity, coveredForPace, timed) || '–'}
        />
      </TileRow>

      <Card>
        <ThemedText type="smallBold">Weekly distance</ThemedText>
        <TimespanControl value={timespan} onChange={onTimespanChange} />
        <WeeklyBarChart weeks={weeklyTotals} from={from} to={localDate()} unit={swim ? 'm' : 'km'} />
      </Card>

      {speedPoints.length > 0 && (
        <Card>
          <ThemedText type="smallBold">{activity === 'cycling' ? 'Speed' : 'Pace'}</ThemedText>
          <LineChart
            points={speedPoints}
            from={from}
            to={localDate()}
            unit={activity === 'cycling' ? 'km/h' : swim ? 'min/100 m' : 'min/km'}
            formatValue={(v) =>
              activity === 'cycling' ? `${v.toFixed(1)} km/h` : `${formatDuration(v * 60)}/${swim ? '100 m' : 'km'}`
            }
          />
        </Card>
      )}

      <SectionLabel>Sessions</SectionLabel>
      <Card>
        {[...workouts].reverse().map((w) => (
          <Pressable
            key={w.id}
            onPress={() => router.navigate({ pathname: '/history/cardio/[id]', params: { id: w.id } })}
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.5 }]}>
            <ThemedText style={{ flex: 1 }}>{formatDate(w.date)}</ThemedText>
            <ThemedText style={styles.num}>
              {w.distance_m ? formatDistance(w.distance_m, activity) : formatDuration(w.duration_seconds)}
            </ThemedText>
            <ThemedText themeColor="textSecondary" style={[styles.num, { width: 96 }]}>
              {formatPace(activity, w.distance_m, w.duration_seconds)}
            </ThemedText>
          </Pressable>
        ))}
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  num: {
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
});
