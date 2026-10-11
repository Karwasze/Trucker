import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Chip, Message, Screen, SectionLabel } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  fromEditPlan,
  newEditExercise,
  sortDays,
  toEditPlan,
  weekdayLabel,
  WEEKDAYS,
  type EditExercise,
  type EditPlan,
  type Weekday,
} from '@/plans/edit-model';
import { PlanExerciseEditor } from '@/plans/plan-exercise-editor';
import { useSettings } from '@/settings/settings-context';
import { ExercisePicker } from '@/workout/exercise-picker';

export default function PlanEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const theme = useTheme();
  const { api, planId, update } = useSettings();

  const [edit, setEdit] = useState<EditPlan | null>(isNew ? toEditPlan() : null);
  const [saved, setSaved] = useState(() => JSON.stringify(edit));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pickerDay, setPickerDay] = useState<Weekday | null>(null);

  // Load once; refetching would overwrite unsaved edits.
  useEffect(() => {
    if (isNew) return;
    api
      .getPlan(Number(id))
      .then((plan) => {
        const loaded = toEditPlan(plan);
        setEdit(loaded);
        setSaved(JSON.stringify(loaded));
      })
      .catch((e: Error) => setLoadError(e.message));
  }, [api, id, isNew]);

  const dirty = edit !== null && JSON.stringify(edit) !== saved;

  const updateDay = (weekday: Weekday, fn: (exercises: EditExercise[]) => EditExercise[]) =>
    setEdit((p) =>
      p && {
        ...p,
        days: p.days.map((d) => (d.weekday === weekday ? { ...d, exercises: fn(d.exercises) } : d)),
      }
    );

  const toggleDay = (weekday: Weekday) => {
    if (!edit) return;
    const existing = edit.days.find((d) => d.weekday === weekday);
    if (!existing) {
      setEdit({ ...edit, days: sortDays([...edit.days, { weekday, exercises: [] }]) });
      return;
    }
    const remove = () =>
      setEdit((p) => p && { ...p, days: p.days.filter((d) => d.weekday !== weekday) });
    if (existing.exercises.length === 0) return remove();
    Alert.alert(`Remove ${weekdayLabel(weekday)}?`, 'Its exercises will be removed from the plan.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: remove },
    ]);
  };

  const addExercise = async (weekday: Weekday, name: string) => {
    const lastSets = await api.latestSets(name).catch(() => []);
    updateDay(weekday, (list) => [...list, newEditExercise(name, lastSets)]);
  };

  const save = async () => {
    if (!edit) return;
    const result = fromEditPlan(edit);
    if ('error' in result) {
      Alert.alert("Can't save plan", result.error);
      return;
    }
    setSaving(true);
    try {
      if (isNew) {
        const created = await api.createPlan(result.plan);
        if (planId === null) update({ planId: created.id });
      } else {
        await api.updatePlan(result.plan);
      }
      setSaved(JSON.stringify(edit));
      router.back();
    } catch (e) {
      Alert.alert("Couldn't save plan", (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const confirmDiscard = () =>
    Alert.alert('Discard changes?', undefined, [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => router.back() },
    ]);

  const confirmDelete = () =>
    Alert.alert(
      `Delete ${edit?.name || 'plan'}?`,
      'Workouts logged with it are kept.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.deletePlan(Number(id));
              if (planId === Number(id)) update({ planId: null });
              router.back();
            } catch (e) {
              Alert.alert("Couldn't delete plan", (e as Error).message);
            }
          },
        },
      ]
    );

  return (
    <Screen hasHeader>
      <Stack.Screen
        options={{
          title: isNew ? 'New plan' : 'Edit plan',
          // While there are unsaved changes, leaving goes through Cancel.
          headerBackVisible: !dirty,
          gestureEnabled: !dirty,
          headerLeft: dirty
            ? () => <HeaderButton title="Cancel" onPress={confirmDiscard} />
            : undefined,
          headerRight: edit
            ? () => <HeaderButton title="Save" onPress={save} disabled={saving} bold />
            : undefined,
        }}
      />

      {!edit ? (
        <Message loading={!loadError} error={loadError} />
      ) : (
        <>
          <TextInput
            value={edit.name}
            onChangeText={(name) => setEdit({ ...edit, name })}
            placeholder="Plan name, e.g. 5×5"
            placeholderTextColor={theme.textSecondary}
            style={[styles.name, { color: theme.text, backgroundColor: theme.backgroundElement }]}
          />

          <SectionLabel>Training days</SectionLabel>
          <View style={styles.days}>
            {WEEKDAYS.map((day) => (
              <Chip
                key={day}
                label={weekdayLabel(day, true)}
                selected={edit.days.some((d) => d.weekday === day)}
                onPress={() => toggleDay(day)}
              />
            ))}
          </View>
          {edit.days.length === 0 && <Message>Pick the days you train.</Message>}

          {edit.days.map((day) => (
            <View key={day.weekday} style={styles.day}>
              <SectionLabel>{weekdayLabel(day.weekday)}</SectionLabel>
              {day.exercises.map((exercise) => (
                <PlanExerciseEditor
                  key={exercise.key}
                  exercise={exercise}
                  onChange={(updated) =>
                    updateDay(day.weekday, (list) =>
                      list.map((e) => (e.key === updated.key ? updated : e))
                    )
                  }
                  onRemove={() =>
                    updateDay(day.weekday, (list) => list.filter((e) => e.key !== exercise.key))
                  }
                />
              ))}
              <Button
                title={`+ Add exercise to ${weekdayLabel(day.weekday)}`}
                variant="secondary"
                compact
                onPress={() => setPickerDay(day.weekday)}
              />
            </View>
          ))}

          <View style={styles.footer}>
            <Button title={isNew ? 'Create plan' : 'Save changes'} loading={saving} onPress={save} />
            {!isNew && <Button title="Delete plan" variant="danger" compact onPress={confirmDelete} />}
          </View>
        </>
      )}

      <ExercisePicker
        visible={pickerDay !== null}
        onClose={() => setPickerDay(null)}
        onPick={(name) => pickerDay && addExercise(pickerDay, name)}
      />
    </Screen>
  );
}

function HeaderButton({
  title,
  onPress,
  disabled,
  bold,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  bold?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable onPress={onPress} hitSlop={10} disabled={disabled}>
      <ThemedText style={{ color: theme.accent, fontWeight: bold ? 700 : 500 }}>{title}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  name: {
    height: 50,
    borderRadius: 14,
    paddingHorizontal: Spacing.three,
    fontSize: 18,
    fontWeight: 600,
  },
  days: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  day: {
    gap: Spacing.two,
  },
  footer: {
    gap: Spacing.two,
    marginTop: Spacing.three,
  },
});
