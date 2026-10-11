import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { localDate } from '@/api/client';
import type { Exercise, ProgressionResult } from '@/api/types';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Message, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useQuery } from '@/hooks/use-query';
import { useTheme } from '@/hooks/use-theme';
import { useSettings } from '@/settings/settings-context';
import {
  completedSetCount,
  draftExercise,
  draftFromPlan,
  toWorkout,
  useDraft,
  type Draft,
} from '@/workout/draft';
import { ExerciseCard } from '@/workout/exercise-card';
import { ExercisePicker } from '@/workout/exercise-picker';
import { formatDate, formatKg, volumeOf } from '@/workout/format';

const hasProgress = (d: Draft) => !d.logged && completedSetCount(d) > 0;

const formatDay = (date: string) =>
  formatDate(date, { weekday: 'long', month: 'short', day: 'numeric' });

export default function TodayScreen() {
  const { api, planId, serverUrl } = useSettings();
  const today = localDate();
  const { draft, setDraft } = useDraft();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const plans = useQuery(`plans:${serverUrl}`, api.listPlans);
  const planDay = useQuery(planId === null ? null : `today:${serverUrl}:${planId}:${today}`, () =>
    api.planToday(planId!, today)
  );
  const planName = plans.data?.find((p) => p.id === planId)?.name;
  const planReady = planId === null || planDay.data?.plan_id === planId;

  // Start a fresh draft from the plan unless there is unsaved work to keep.
  useEffect(() => {
    if (draft === undefined || !planReady) return;
    const stale =
      draft === null ||
      (draft.logged && draft.date !== today) ||
      (!hasProgress(draft) && (draft.date !== today || draft.basedOn !== planId));
    if (stale) setDraft(draftFromPlan(today, planId, planDay.data?.exercises ?? []));
  }, [draft, planReady, planId, today, planDay.data, setDraft]);

  const resetToPlan = () => setDraft(draftFromPlan(today, planId, planDay.data?.exercises ?? []));

  const confirmReset = () =>
    Alert.alert('Discard this workout?', 'Your entered sets will be cleared.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: resetToPlan },
    ]);

  const addExercise = async (name: string) => {
    const sets = await api.latestSets(name).catch(() => []);
    const exercise = draftExercise(name, sets.length ? sets : [{ weight: 0, reps: 0 }]);
    setDraft((d) => ({ ...d, exercises: [...d.exercises, exercise] }));
  };

  const finish = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const logged = await api.createWorkout(toWorkout(draft));
      setDraft({ ...draft, logged });
    } catch (e) {
      Alert.alert("Couldn't save workout", (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const subtitle = [formatDay(draft?.date ?? today), planName].filter(Boolean).join(' · ');

  if (draft?.logged) {
    return (
      <Screen title="Today" subtitle={subtitle}>
        <LoggedSummary
          progression={draft.logged.progression ?? []}
          exercises={draft.logged.exercises}
        />
        <Button
          title="Start another workout"
          variant="secondary"
          onPress={() => setDraft({ date: today, planId: null, basedOn: planId, exercises: [] })}
        />
      </Screen>
    );
  }

  const loadingPlan = planId !== null && !planReady;
  const doneSets = draft ? completedSetCount(draft) : 0;
  const isRestDay = planId !== null && planReady && planDay.data?.exercises.length === 0;

  return (
    <Screen
      title="Today"
      subtitle={subtitle}
      refreshing={planDay.refreshing}
      onRefresh={() => {
        plans.refresh();
        planDay.refresh();
      }}>
      {draft && draft.date !== today && (
        <Card>
          <ThemedText type="smallBold">Unfinished workout from {formatDay(draft.date)}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Finish it to log it on that date, or discard it to start today&apos;s plan.
          </ThemedText>
        </Card>
      )}

      {loadingPlan || draft === undefined ? (
        <Message loading={!planDay.error} error={planDay.error}>
          {null}
        </Message>
      ) : (
        <>
          {planId === null && draft?.exercises.length === 0 && (
            <Card>
              <ThemedText type="smallBold">No training plan selected</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Pick a plan in Settings to get today&apos;s targets, or add exercises freely.
              </ThemedText>
              <Button title="Choose plan" variant="secondary" compact onPress={() => router.navigate('/settings')} />
            </Card>
          )}
          {isRestDay && draft?.exercises.length === 0 && (
            <Message>Rest day 😴{'\n'}Nothing scheduled — add exercises if you train anyway.</Message>
          )}

          {draft?.exercises.map((exercise) => (
            <ExerciseCard
              key={exercise.key}
              exercise={exercise}
              onChange={(updated) =>
                setDraft((d) => ({
                  ...d,
                  exercises: d.exercises.map((e) => (e.key === updated.key ? updated : e)),
                }))
              }
              onRemove={() =>
                setDraft((d) => ({ ...d, exercises: d.exercises.filter((e) => e.key !== exercise.key) }))
              }
            />
          ))}

          <Button title="+ Add exercise" variant="secondary" onPress={() => setPickerOpen(true)} />

          {draft && draft.exercises.length > 0 && (
            <View style={styles.footer}>
              <Button
                title={doneSets ? `Finish workout · ${doneSets} sets` : 'Tick off sets as you go'}
                disabled={doneSets === 0}
                loading={saving}
                onPress={finish}
              />
              <Button title="Discard" variant="secondary" compact onPress={confirmReset} />
            </View>
          )}
        </>
      )}

      <ExercisePicker visible={pickerOpen} onClose={() => setPickerOpen(false)} onPick={addExercise} />
    </Screen>
  );
}

const RESULT_LABEL: Record<ProgressionResult['result'], string> = {
  progressed: 'Weight goes up next time',
  missed: 'Missed — same target next time',
  deloaded: 'Deloaded — target reduced',
};

function LoggedSummary({
  progression,
  exercises,
}: {
  progression: ProgressionResult[];
  exercises: Exercise[];
}) {
  const theme = useTheme();
  const colorFor = (r: ProgressionResult['result']) =>
    r === 'progressed' ? theme.success : r === 'deloaded' ? theme.danger : theme.textSecondary;

  return (
    <>
      <Card>
        <ThemedText style={{ fontSize: 22, fontWeight: 700 }}>Workout logged ✓</ThemedText>
        <ThemedText themeColor="textSecondary">
          {exercises.length} exercises · {exercises.reduce((n, e) => n + e.sets.length, 0)} sets ·{' '}
          {formatKg(volumeOf(exercises))} volume
        </ThemedText>
      </Card>
      {progression.length > 0 && (
        <Card>
          <ThemedText type="smallBold">Plan progression</ThemedText>
          {progression.map((p) => (
            <View key={p.exercise} style={styles.progressionRow}>
              <ThemedText style={{ flex: 1 }}>{p.exercise}</ThemedText>
              <ThemedText type="small" style={{ color: colorFor(p.result) }}>
                {RESULT_LABEL[p.result]}
              </ThemedText>
            </View>
          ))}
        </Card>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  footer: {
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  progressionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
});
