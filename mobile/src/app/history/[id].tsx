import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Message, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useQuery } from '@/hooks/use-query';
import { useSettings } from '@/settings/settings-context';
import { formatDate, formatKg, volumeOf } from '@/workout/format';

export default function WorkoutDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api, serverUrl } = useSettings();
  const [deleting, setDeleting] = useState(false);
  // There is no single-workout endpoint, so read it from the list.
  const workouts = useQuery(`workouts:${serverUrl}`, api.listWorkouts);
  const workout = workouts.data?.find((w) => w.id === Number(id));

  const confirmDelete = () =>
    Alert.alert(
      'Delete workout?',
      'This removes the logged sets. Plan progression already applied is not undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await api.deleteWorkout(Number(id));
              router.back();
            } catch (e) {
              Alert.alert("Couldn't delete workout", (e as Error).message);
              setDeleting(false);
            }
          },
        },
      ]
    );

  return (
    <Screen hasHeader>
      <Stack.Screen options={{ title: workout ? formatDate(workout.date) : 'Workout' }} />
      {!workout ? (
        <Message loading={!workouts.data && !workouts.error} error={workouts.error}>
          Workout not found.
        </Message>
      ) : (
        <>
          <ThemedText themeColor="textSecondary">
            {formatDate(workout.date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
            {' · '}
            {formatKg(volumeOf(workout.exercises))} volume
          </ThemedText>
          {workout.exercises.map((e, i) => (
            <Card key={i}>
              <ThemedText style={{ fontWeight: 700, fontSize: 18 }}>{e.name}</ThemedText>
              {e.sets.map((s, j) => (
                <View key={j} style={styles.setRow}>
                  <ThemedText themeColor="textSecondary" style={styles.setNum}>
                    {j + 1}
                  </ThemedText>
                  <ThemedText style={styles.tabular}>
                    {s.weight} kg × {s.reps}
                  </ThemedText>
                </View>
              ))}
            </Card>
          ))}
          <Button title="Delete workout" variant="danger" loading={deleting} onPress={confirmDelete} />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  setRow: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  setNum: {
    width: 20,
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
});
