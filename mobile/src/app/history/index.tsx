import { Link } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import type { Workout } from '@/api/types';
import { SwipeToDelete, type SwipeRow } from '@/components/swipe-to-delete';
import { ThemedText } from '@/components/themed-text';
import { Card, Message, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useQuery } from '@/hooks/use-query';
import { useSettings } from '@/settings/settings-context';
import { confirmDeleteWorkout } from '@/workout/confirm-delete';
import { describeSets } from '@/workout/draft';
import { formatDate, formatKg, volumeOf } from '@/workout/format';

export default function HistoryScreen() {
  const { api, serverUrl } = useSettings();
  const workouts = useQuery(`workouts:${serverUrl}`, api.listWorkouts);
  const plans = useQuery(`plans:${serverUrl}`, api.listPlans);
  const planName = (id?: number) => plans.data?.find((p) => p.id === id)?.name;
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const deleteWorkout = async (id: number, row?: SwipeRow) => {
    setDeletingId(id);
    try {
      await api.deleteWorkout(id);
      workouts.refresh();
    } catch (e) {
      Alert.alert("Couldn't delete workout", (e as Error).message);
      row?.close();
    } finally {
      setDeletingId(null);
    }
  };

  // A full swipe is deliberate enough to skip the confirmation.
  const onDelete = (id: number, row?: SwipeRow, fullSwipe = false) =>
    fullSwipe
      ? deleteWorkout(id, row)
      : confirmDeleteWorkout(
          () => deleteWorkout(id, row),
          () => row?.close()
        );

  return (
    <Screen
      title="History"
      refreshing={workouts.refreshing}
      onRefresh={() => {
        workouts.refresh();
        plans.refresh();
      }}>
      {!workouts.data ? (
        <Message loading={!workouts.error} error={workouts.error} />
      ) : workouts.data.length === 0 ? (
        <Message>No workouts yet. Log one from the Today tab.</Message>
      ) : (
        workouts.data.map((w) => (
          <WorkoutRow
            key={w.id}
            workout={w}
            planName={planName(w.plan_id)}
            deleting={deletingId === w.id}
            onDelete={(row, fullSwipe) => onDelete(w.id, row, fullSwipe)}
          />
        ))
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

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
});
