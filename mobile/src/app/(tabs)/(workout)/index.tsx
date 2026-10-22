import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import type { Exercise, ProgressionResult } from '@/api/types';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Message, Screen } from '@/components/ui';
import { useAchievements } from '@/achievements/achievements-context';
import { SettingsButton } from '@/settings/settings-button';
import { Spacing } from '@/constants/theme';
import { EnduranceToday } from '@/goals/endurance-today';
import { useHealthImports } from '@/health/health-state';
import { HealthImportBanner } from '@/health/import-banner';
import { useQuery } from '@/hooks/use-query';
import { useTheme } from '@/hooks/use-theme';
import { useToday } from '@/hooks/use-today';
import { useSettings } from '@/settings/settings-context';
import {
  completedSetCount,
  describeSets,
  draftExercise,
  draftFromPlan,
  planFingerprint,
  toExercises,
  toWorkout,
  useDraft,
  type Draft,
} from '@/workout/draft';
import { ExerciseCard } from '@/workout/exercise-card';
import { ExercisePicker } from '@/workout/exercise-picker';
import { formatDate, formatKg, volumeOf } from '@/workout/format';

const hasProgress = (d: Draft) => !d.logged && completedSetCount(d) > 0;

const formatDay = (date: string) => formatDate(date, { weekday: 'long', month: 'short', day: 'numeric' });

export default function TodayScreen() {
  const { api, planId, serverUrl } = useSettings();
  const achievements = useAchievements();
  const { today, recheck: recheckToday } = useToday();
  const { draft, setDraft } = useDraft();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const plans = useQuery(`plans:${serverUrl}`, api.listPlans);
  const planDay = useQuery(planId === null ? null : `today:${serverUrl}:${planId}:${today}`, () =>
    api.planToday(planId!, today)
  );
  const planName = plans.data?.find((p) => p.id === planId)?.name;
  const planReady = planId === null || planDay.data?.plan_id === planId;

  // A logged workout, or an untouched "start another" draft after one, only
  // stands while today's workout exists: deleting it in History brings back
  // the plan. Checked on focus against a fresh workout list, never a cached
  // one, so a workout that was just logged isn't mistaken for a deleted one.
  const afterLogging =
    !!draft && draft.date === today && (!!draft.logged || (draft.source === undefined && !hasProgress(draft)));
  useFocusEffect(
    useCallback(() => {
      if (!afterLogging) return;
      let cancelled = false;
      api
        .listWorkouts()
        .then((workouts) => {
          if (cancelled) return;
          const ids = workouts.filter((w) => w.date === today).map((w) => w.id);
          setDraft((d) => {
            if (d.date !== today) return d;
            if (d.logged) return ids.includes(d.logged.id) ? d : null;
            return d.source === undefined && !hasProgress(d) && ids.length === 0 ? null : d;
          });
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }, [afterLogging, api, today, setDraft])
  );

  // Start a fresh draft from the plan unless there is unsaved work to keep.
  // If the plan's workout for today is already logged (e.g. the stored draft
  // was lost), show it as logged instead of offering it again.
  useEffect(() => {
    if (draft === undefined || !planReady) return;
    const stale =
      draft === null ||
      (draft.logged && draft.date !== today) ||
      (!hasProgress(draft) &&
        (draft.date !== today ||
          draft.basedOn !== planId ||
          // The plan was edited; skip drafts not built from it ("start another").
          // Logging progresses the plan, so a logged draft never counts as edited.
          (!draft.logged &&
            draft.source !== undefined &&
            draft.source !== planFingerprint(planDay.data?.exercises ?? []))));
    if (!stale) return;
    // Wait for a refetch on focus, so a workout just deleted in History isn't
    // brought back from the previous response.
    if (planDay.loading) return;
    const logged = planDay.data?.workout;
    setDraft(
      logged
        ? { date: today, planId, basedOn: planId, exercises: [], logged }
        : draftFromPlan(today, planId, planDay.data?.exercises ?? [])
    );
  }, [draft, planReady, planId, today, planDay.data, planDay.loading, setDraft]);

  // Pull-to-refresh rebuilds a plan draft nothing has been ticked in from the
  // refreshed targets, bringing back exercises removed from it.
  const rebuildOnRefresh = useRef(false);
  useEffect(() => {
    if (!rebuildOnRefresh.current) return;
    if (planDay.error) {
      rebuildOnRefresh.current = false;
      return;
    }
    if (!planReady) return;
    rebuildOnRefresh.current = false;
    setDraft((d) =>
      !d.logged && d.source !== undefined && !hasProgress(d)
        ? draftFromPlan(today, planId, planDay.data?.exercises ?? [])
        : d
    );
  }, [planDay.data, planDay.error, planReady, planId, today, setDraft]);

  const imports = useHealthImports();
  const waitingToday = imports.candidates.some((w) => w.date === today);

  const refresh = () => {
    recheckToday();
    plans.refresh();
    imports.refresh();
    if (planId !== null) {
      rebuildOnRefresh.current = true;
      planDay.refresh();
    }
  };

  const resetToPlan = () => setDraft(draftFromPlan(today, planId, planDay.data?.exercises ?? []));

  const confirmReset = () =>
    Alert.alert('Discard this workout?', 'Your entered sets will be cleared.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: resetToPlan },
    ]);

  const addExercise = async (name: string) => {
    const { sets, reason } = await api
      .exerciseTarget(name, draft?.date ?? today)
      .catch(() => ({ sets: [], reason: undefined }));
    const exercise = sets.length
      ? draftExercise(name, sets, describeSets(sets), reason)
      : draftExercise(name, [{ weight: 0, reps: 0 }]);
    setDraft((d) => ({
      ...d,
      exercises: [...d.exercises, { ...exercise, free: true }],
    }));
  };

  // Replaces a free exercise's sets with the target for another scheme,
  // progressed from the sessions done in it.
  const changeScheme = async (key: string, sets: number, reps: number) => {
    const exercise = draft?.exercises.find((e) => e.key === key);
    if (!exercise) return;
    try {
      const target = await api.exerciseTarget(exercise.name, draft?.date ?? today, { sets, reps });
      const updated = draftExercise(exercise.name, target.sets, describeSets(target.sets), target.reason);
      setDraft((d) => ({
        ...d,
        exercises: d.exercises.map((e) => (e.key === key ? { ...updated, key, free: true } : e)),
      }));
    } catch (e) {
      Alert.alert("Couldn't load target", (e as Error).message);
    }
  };

  const finish = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const logged = await api.createWorkout(toWorkout(draft));
      setDraft({ ...draft, logged });
      achievements.check();
    } catch (e) {
      Alert.alert("Couldn't save workout", (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const confirmFinish = () => {
    if (!draft) return;
    const done = completedSetCount(draft);
    const skipped = toExercises(draft.exercises, false).reduce((n, e) => n + e.sets.length, 0) - done;
    Alert.alert(
      'Finish workout?',
      `${done} ${done === 1 ? 'set' : 'sets'} will be logged.` +
        (skipped > 0 ? ` ${skipped} unticked ${skipped === 1 ? 'set' : 'sets'} will be left out.` : ''),
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Finish', onPress: finish },
      ]
    );
  };

  const subtitle = [formatDay(draft?.date ?? today), planName].filter(Boolean).join(' · ');

  if (draft?.logged) {
    return (
      <Screen title="Today" subtitle={subtitle} action={<SettingsButton />} hasHeader>
        <HealthImportBanner count={imports.candidates.length} error={imports.error} />
        <LoggedSummary progression={draft.logged.progression ?? []} exercises={draft.logged.exercises} />
        <EnduranceToday date={today} waiting={waitingToday} />
        <Button
          title="Start another workout"
          variant="secondary"
          onPress={() =>
            setDraft({
              date: today,
              planId: null,
              basedOn: planId,
              exercises: [],
            })
          }
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
      action={<SettingsButton />}
      hasHeader
      refreshing={planDay.refreshing}
      onRefresh={refresh}>
      <HealthImportBanner count={imports.candidates.length} error={imports.error} />
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
              <Button title="Choose plan" variant="secondary" compact onPress={() => router.navigate('/plans')} />
            </Card>
          )}
          {isRestDay && draft?.exercises.length === 0 && (
            <Message>No lifting today 😴{'\n'}Add exercises if you train anyway.</Message>
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
                setDraft((d) => ({
                  ...d,
                  exercises: d.exercises.filter((e) => e.key !== exercise.key),
                }))
              }
              onChangeScheme={exercise.free ? (sets, reps) => changeScheme(exercise.key, sets, reps) : undefined}
            />
          ))}

          <Button title="+ Add exercise" variant="secondary" onPress={() => setPickerOpen(true)} />

          <EnduranceToday date={today} waiting={waitingToday} />

          {draft && draft.exercises.length > 0 && (
            <View style={styles.footer}>
              <Button
                title={doneSets ? `Finish workout · ${doneSets} sets` : 'Tick off sets as you go'}
                disabled={doneSets === 0}
                loading={saving}
                onPress={confirmFinish}
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
  missed: 'Missed — same weight, one more rep next time',
  deloaded: 'Deloaded — 10% lighter next time',
};

/** Bodyweight exercises progress by reps, not weight. */
const isBodyweight = (exercises: Exercise[], name: string) =>
  exercises.filter((e) => e.name === name).every((e) => e.sets.every((s) => s.weight === 0));

const resultLabel = (p: ProgressionResult, exercises: Exercise[]) =>
  p.result === 'progressed' && isBodyweight(exercises, p.exercise) ? 'One more rep next time' : RESULT_LABEL[p.result];

function LoggedSummary({ progression, exercises }: { progression: ProgressionResult[]; exercises: Exercise[] }) {
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
              <ThemedText style={styles.progressionName}>{p.exercise}</ThemedText>
              <ThemedText type="small" style={[styles.progressionResult, { color: colorFor(p.result) }]}>
                {resultLabel(p, exercises)}
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
  progressionName: {
    flexShrink: 1,
  },
  progressionResult: {
    flexShrink: 1,
    marginLeft: 'auto',
    textAlign: 'right',
  },
});
