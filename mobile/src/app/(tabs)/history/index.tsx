import { Link } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import type { CardioWorkout, Workout } from '@/api/types';
import { SwipeToDelete, type SwipeRow } from '@/components/swipe-to-delete';
import { ThemedText } from '@/components/themed-text';
import { Card, Message, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { CardioSummary } from '@/health/cardio-summary';
import { useHealthImports, useHealthState } from '@/health/health-state';
import { HealthImportBanner } from '@/health/import-banner';
import { useQuery } from '@/hooks/use-query';
import { SettingsButton } from '@/settings/settings-button';
import { useSettings } from '@/settings/settings-context';
import { confirmDeleteCardio, confirmDeleteWorkout } from '@/workout/confirm-delete';
import { describeSets } from '@/workout/draft';
import { formatDate, formatKg, volumeOf } from '@/workout/format';

type Entry = { kind: 'strength'; workout: Workout } | { kind: 'cardio'; workout: CardioWorkout };

/**
 * Lifting and cardio workouts, newest day first. Within a day, cardio comes
 * latest start first, then lifting workouts, which have no time.
 */
function timeline(workouts: Workout[], cardio: CardioWorkout[]): Entry[] {
  const entries: Entry[] = [
    ...cardio.map((workout) => ({ kind: 'cardio' as const, workout })),
    ...workouts.map((workout) => ({ kind: 'strength' as const, workout })),
  ];
  // Both lists come newest first, which a stable sort by date keeps.
  return entries.sort((a, b) => b.workout.date.localeCompare(a.workout.date));
}

export default function HistoryScreen() {
  const { api, serverUrl } = useSettings();
  const workouts = useQuery(`workouts:${serverUrl}`, api.listWorkouts);
  const cardio = useQuery(`cardio:${serverUrl}`, () => api.listCardio());
  const plans = useQuery(`plans:${serverUrl}`, api.listPlans);
  const imports = useHealthImports();
  const { dismiss } = useHealthState();
  const planName = (id?: number) => plans.data?.find((p) => p.id === id)?.name;
  // Keyed by kind too, since lifting and cardio IDs overlap.
  const [deleting, setDeleting] = useState<string | null>(null);

  const deleteEntry = async (entry: Entry, row?: SwipeRow) => {
    const key = `${entry.kind}:${entry.workout.id}`;
    setDeleting(key);
    try {
      if (entry.kind === 'strength') {
        await api.deleteWorkout(entry.workout.id);
        workouts.refresh();
      } else {
        await api.deleteCardio(entry.workout.id);
        // Deleted on purpose, so don't offer it for import again.
        if (entry.workout.source_uuid) await dismiss([entry.workout.source_uuid]);
        cardio.refresh();
      }
    } catch (e) {
      Alert.alert("Couldn't delete workout", (e as Error).message);
      row?.close();
    } finally {
      setDeleting(null);
    }
  };

  // A full swipe is deliberate enough to skip the confirmation.
  const onDelete = (entry: Entry, row?: SwipeRow, fullSwipe = false) =>
    fullSwipe
      ? deleteEntry(entry, row)
      : (entry.kind === 'strength' ? confirmDeleteWorkout : confirmDeleteCardio)(
          () => deleteEntry(entry, row),
          () => row?.close()
        );

  const loaded = workouts.data && cardio.data;
  const entries = loaded ? timeline(workouts.data!, cardio.data!) : [];

  return (
    <Screen
      title="History"
      action={<SettingsButton />}
      refreshing={workouts.refreshing || cardio.refreshing}
      onRefresh={() => {
        workouts.refresh();
        cardio.refresh();
        plans.refresh();
        imports.refresh();
      }}>
      <HealthImportBanner count={imports.candidates.length} />
      {!loaded ? (
        <Message loading={!workouts.error && !cardio.error} error={workouts.error ?? cardio.error} />
      ) : entries.length === 0 ? (
        <Message>No workouts yet. Log one from the Today tab.</Message>
      ) : (
        entries.map((entry) => {
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

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
});
