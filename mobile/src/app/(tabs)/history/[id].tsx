import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { useAchievements } from '@/achievements/achievements-context';
import type { Workout } from '@/api/types';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, HeaderButton, Message, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useQuery } from '@/hooks/use-query';
import { useSettings } from '@/settings/settings-context';
import { confirmDeleteWorkout } from '@/workout/confirm-delete';
import { draftExercise, invalidSetCount, toExercises, type DraftExercise } from '@/workout/draft';
import { ExerciseCard } from '@/workout/exercise-card';
import { ExercisePicker } from '@/workout/exercise-picker';
import { formatDate, formatKg, volumeOf } from '@/workout/format';

export default function WorkoutDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api, serverUrl } = useSettings();
  const achievements = useAchievements();
  const [deleting, setDeleting] = useState(false);
  // There is no single-workout endpoint, so read it from the list.
  const workouts = useQuery(`workouts:${serverUrl}`, api.listWorkouts);
  const workout = workouts.data?.find((w) => w.id === Number(id));

  // The exercises being edited, or null when just viewing.
  const [edit, setEdit] = useState<DraftExercise[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const dirty =
    edit !== null &&
    workout !== undefined &&
    JSON.stringify(toExercises(edit, false)) !== JSON.stringify(workout.exercises);
  const invalid = edit !== null && invalidSetCount(edit, false) > 0;

  const startEditing = (w: Workout) => setEdit(w.exercises.map((e) => draftExercise(e.name, e.sets)));

  const updateExercise = (fn: (list: DraftExercise[]) => DraftExercise[]) => setEdit((list) => list && fn(list));

  const addExercise = async (name: string) => {
    const sets = await api.latestSets(name).catch(() => []);
    const exercise = draftExercise(name, sets.length ? sets : [{ weight: 0, reps: 0 }]);
    updateExercise((list) => [...list, exercise]);
  };

  const save = async () => {
    if (!edit || !workout || invalid) return;
    const exercises = toExercises(edit, false);
    if (exercises.length === 0) {
      Alert.alert("Can't save workout", 'Keep at least one set, or delete the workout instead.');
      return;
    }
    setSaving(true);
    try {
      await api.updateWorkout({ ...workout, exercises });
      workouts.refresh();
      achievements.check();
      setEdit(null);
    } catch (e) {
      Alert.alert("Couldn't save workout", (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const cancel = () => {
    if (!dirty) return setEdit(null);
    Alert.alert('Discard changes?', undefined, [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => setEdit(null) },
    ]);
  };

  const confirmDelete = () =>
    confirmDeleteWorkout(async () => {
      setDeleting(true);
      try {
        await api.deleteWorkout(Number(id));
        router.back();
      } catch (e) {
        Alert.alert("Couldn't delete workout", (e as Error).message);
        setDeleting(false);
      }
    });

  const editing = edit !== null;

  return (
    <Screen hasHeader>
      <Stack.Screen
        options={{
          title: workout ? formatDate(workout.date) : 'Workout',
          // While editing, leaving goes through Cancel.
          headerBackVisible: !editing,
          gestureEnabled: !editing,
          headerLeft: editing ? () => <HeaderButton title="Cancel" onPress={cancel} /> : undefined,
          headerRight: !workout
            ? undefined
            : editing
              ? () => <HeaderButton title="Save" onPress={save} disabled={saving || invalid} bold />
              : () => <HeaderButton title="Edit" onPress={() => startEditing(workout)} />,
        }}
      />
      {!workout ? (
        <Message loading={!workouts.data && !workouts.error} error={workouts.error}>
          Workout not found.
        </Message>
      ) : edit ? (
        <>
          {edit.map((exercise) => (
            <ExerciseCard
              key={exercise.key}
              exercise={exercise}
              trackDone={false}
              onChange={(updated) => updateExercise((list) => list.map((e) => (e.key === updated.key ? updated : e)))}
              onRemove={() => updateExercise((list) => list.filter((e) => e.key !== exercise.key))}
            />
          ))}
          <Button title="+ Add exercise" variant="secondary" onPress={() => setPickerOpen(true)} />
          <View style={styles.footer}>
            <Button
              title={invalid ? 'Fix the weight or reps in red' : 'Save changes'}
              loading={saving}
              disabled={invalid}
              onPress={save}
            />
            <Button title="Cancel" variant="secondary" compact onPress={cancel} />
          </View>
        </>
      ) : (
        <>
          <ThemedText themeColor="textSecondary">
            {formatDate(workout.date, {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            })}
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
          <View style={styles.footer}>
            <Button title="Edit workout" variant="secondary" onPress={() => startEditing(workout)} />
            <Button title="Delete workout" variant="danger" loading={deleting} onPress={confirmDelete} />
          </View>
        </>
      )}

      <ExercisePicker visible={pickerOpen} onClose={() => setPickerOpen(false)} onPick={addExercise} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  setRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  setNum: {
    width: 20,
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
  footer: {
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
});
