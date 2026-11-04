import { Link } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import type { CardioWorkout, Triathlon, Workout } from '@/api/types';
import { SwipeToDelete, type SwipeRow } from '@/components/swipe-to-delete';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Message, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { CardioSummary } from '@/health/cardio-summary';
import { useHealthImports, useHealthState } from '@/health/health-state';
import { HealthImportBanner } from '@/health/import-banner';
import { useQuery } from '@/hooks/use-query';
import { useToday } from '@/hooks/use-today';
import { useSettings } from '@/settings/settings-context';
import { TriathlonOverview } from '@/triathlon/triathlon-overview';
import { confirmDeleteCardio, confirmDeleteWorkout } from '@/workout/confirm-delete';
import { describeSets } from '@/workout/draft';
import { formatDate, formatKg, volumeOf } from '@/workout/format';
import { formatMonth, MonthCalendar, monthOf, monthRange } from '@/workout/month-calendar';

type Entry =
  | { kind: 'strength'; workout: Workout; date: string }
  | { kind: 'cardio'; workout: CardioWorkout; date: string }
  | { kind: 'triathlon'; triathlon: Triathlon; date: string };

/**
 * Lifting and cardio workouts, newest day first, with a triathlon's swims,
 * rides and runs as one entry. Within a day, a triathlon comes first, then
 * cardio latest start first, then lifting workouts, which have no time.
 */
function timeline(workouts: Workout[], cardio: CardioWorkout[], triathlons: Triathlon[] = []): Entry[] {
  const legs = new Set(triathlons.flatMap((t) => [...t.swim.workout_ids, ...t.bike.workout_ids, ...t.run.workout_ids]));
  const entries: Entry[] = [
    ...triathlons.map((triathlon) => ({ kind: 'triathlon' as const, triathlon, date: triathlon.date })),
    ...cardio
      .filter((w) => !legs.has(w.id))
      .map((workout) => ({ kind: 'cardio' as const, workout, date: workout.date })),
    ...workouts.map((workout) => ({ kind: 'strength' as const, workout, date: workout.date })),
  ];
  // Every list comes newest first, which a stable sort by date keeps.
  return entries.sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * One month of workouts at a time, this month's unless another is picked on
 * the calendar, which goes back as far as the oldest workout.
 */
export default function HistoryScreen() {
  const { api, serverUrl } = useSettings();
  const { today } = useToday();
  // Null follows today, so the screen moves on to a new month by itself.
  const [picked, setPicked] = useState<string | null>(null);
  const month = picked ?? monthOf(today);
  const range = monthRange(month);
  const [day, setDay] = useState<string | null>(null);
  const oldest = useQuery(`history:${serverUrl}`, api.oldestWorkoutDate);
  const workouts = useQuery(`workouts:${serverUrl}:${month}`, () => api.listWorkouts(range));
  const cardio = useQuery(`cardio:${serverUrl}:${month}`, () => api.listCardio(undefined, range));
  const triathlons = useQuery(`triathlons:${serverUrl}:${month}`, () => api.listTriathlons(range));
  const plans = useQuery(`plans:${serverUrl}`, api.listPlans);
  const imports = useHealthImports();
  const { dismiss } = useHealthState();
  const planName = (id?: number) => plans.data?.find((p) => p.id === id)?.name;
  // Keyed by kind too, since lifting and cardio IDs overlap.
  const [deleting, setDeleting] = useState<string | null>(null);

  const deleteEntry = async (entry: Exclude<Entry, { kind: 'triathlon' }>, row?: SwipeRow) => {
    const key = `${entry.kind}:${entry.workout.id}`;
    setDeleting(key);
    try {
      if (entry.kind === 'strength') {
        await api.deleteWorkout(entry.workout.id);
        workouts.refresh();
        oldest.refresh();
      } else {
        await api.deleteCardio(entry.workout.id);
        // Deleted on purpose, so don't offer it for import again.
        if (entry.workout.source_uuid) await dismiss([entry.workout.source_uuid]);
        cardio.refresh();
        triathlons.refresh();
        oldest.refresh();
      }
    } catch (e) {
      Alert.alert("Couldn't delete workout", (e as Error).message);
      row?.close();
    } finally {
      setDeleting(null);
    }
  };

  // A full swipe is deliberate enough to skip the confirmation.
  const onDelete = (entry: Exclude<Entry, { kind: 'triathlon' }>, row?: SwipeRow, fullSwipe = false) =>
    fullSwipe
      ? deleteEntry(entry, row)
      : (entry.kind === 'strength' ? confirmDeleteWorkout : confirmDeleteCardio)(
          () => deleteEntry(entry, row),
          () => row?.close()
        );

  // Triathlons only group what's loaded, so a failure to load them leaves the legs apart.
  const loaded = workouts.data && cardio.data;
  const entries = loaded ? timeline(workouts.data!, cardio.data!, triathlons.data) : [];
  // A day stays picked only while it has workouts, e.g. not after deleting its last.
  const selected = entries.some((e) => e.date === day) ? day : null;
  const shown = selected ? entries.filter((e) => e.date === selected) : entries;
  const thisMonth = monthOf(today);

  const changeMonth = (next: string) => {
    setPicked(next === thisMonth ? null : next);
    setDay(null);
  };

  return (
    <Screen
      title="History"
      // Months back, a way home without stepping through each one.
      action={
        month !== thisMonth && (
          <Button title="This month" variant="secondary" compact onPress={() => changeMonth(thisMonth)} />
        )
      }
      refreshing={workouts.refreshing || cardio.refreshing}
      onRefresh={() => {
        workouts.refresh();
        cardio.refresh();
        triathlons.refresh();
        plans.refresh();
        imports.refresh();
        oldest.refresh();
      }}>
      <HealthImportBanner count={imports.candidates.length} error={imports.error} />
      <MonthCalendar
        month={month}
        // Until the oldest workout is known, there's nowhere earlier to go.
        earliest={oldest.data ? monthOf(oldest.data) : month}
        latest={thisMonth}
        today={today}
        marked={new Set(entries.map((e) => e.date))}
        selected={selected}
        onMonthChange={changeMonth}
        onSelect={setDay}
      />
      {!loaded ? (
        <Message loading={!workouts.error && !cardio.error} error={workouts.error ?? cardio.error} />
      ) : entries.length === 0 ? (
        <Message>
          {oldest.data === null
            ? 'No workouts yet. Log one from the Today tab.'
            : `No workouts in ${formatMonth(month)}.`}
        </Message>
      ) : (
        shown.map((entry) => {
          if (entry.kind === 'triathlon')
            return <TriathlonRow key={`triathlon:${entry.date}`} triathlon={entry.triathlon} />;
          const key = `${entry.kind}:${entry.workout.id}`;
          const onEntryDelete = (row?: SwipeRow, fullSwipe?: boolean) => onDelete(entry, row, fullSwipe);
          return entry.kind === 'strength' ? (
            <WorkoutRow
              key={key}
              workout={entry.workout}
              planName={planName(entry.workout.plan_id)}
              deleting={deleting === key}
              onDelete={onEntryDelete}
            />
          ) : (
            <CardioRow key={key} workout={entry.workout} deleting={deleting === key} onDelete={onEntryDelete} />
          );
        })
      )}
    </Screen>
  );
}

/** A history card that reveals a Delete action when swiped from the right. */
function WorkoutRow({
  workout: w,
  planName,
  deleting,
  onDelete,
}: {
  workout: Workout;
  planName?: string;
  deleting: boolean;
  onDelete: (row?: SwipeRow, fullSwipe?: boolean) => void;
}) {
  return (
    <SwipeToDelete
      onDelete={onDelete}
      loading={deleting}
      accessibilityLabel={`Delete workout from ${formatDate(w.date)}`}>
      <Link href={{ pathname: '/history/[id]', params: { id: w.id } }} asChild>
        <Pressable
          onLongPress={() => onDelete()}
          disabled={deleting}
          style={({ pressed }) => [pressed && { opacity: 0.6 }, deleting && { opacity: 0.4 }]}>
          <Card>
            <View style={styles.row}>
              <ThemedText style={{ fontWeight: 700, flex: 1 }}>{formatDate(w.date)}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {formatKg(volumeOf(w.exercises))}
              </ThemedText>
            </View>
            {planName && (
              <ThemedText type="small" themeColor="textSecondary">
                {planName}
              </ThemedText>
            )}
            {w.exercises.map((e, i) => (
              <View key={i} style={styles.row}>
                <ThemedText type="small" style={{ flex: 1 }}>
                  {e.name}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {describeSets(e.sets)}
                </ThemedText>
              </View>
            ))}
          </Card>
        </Pressable>
      </Link>
    </SwipeToDelete>
  );
}

/** A cardio history card, swiped like WorkoutRow. */
function CardioRow({
  workout: w,
  deleting,
  onDelete,
}: {
  workout: CardioWorkout;
  deleting: boolean;
  onDelete: (row?: SwipeRow, fullSwipe?: boolean) => void;
}) {
  return (
    <SwipeToDelete
      onDelete={onDelete}
      loading={deleting}
      accessibilityLabel={`Delete workout from ${formatDate(w.date)}`}>
      <Link href={{ pathname: '/history/cardio/[id]', params: { id: w.id } }} asChild>
        <Pressable
          onLongPress={() => onDelete()}
          disabled={deleting}
          style={({ pressed }) => [pressed && { opacity: 0.6 }, deleting && { opacity: 0.4 }]}>
          <Card>
            <CardioSummary workout={w} />
          </Card>
        </Pressable>
      </Link>
    </SwipeToDelete>
  );
}

/**
 * A triathlon's swims, rides and runs as one card. Its legs are deleted one
 * by one from their own screens, a tap away.
 */
function TriathlonRow({ triathlon: t }: { triathlon: Triathlon }) {
  return (
    <Link href={{ pathname: '/history/triathlon/[date]', params: { date: t.date } }} asChild>
      <Pressable style={({ pressed }) => pressed && { opacity: 0.6 }}>
        <Card>
          <TriathlonOverview triathlon={t} />
        </Card>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
});
