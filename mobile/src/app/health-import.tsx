import { router } from 'expo-router';
import { useState } from 'react';

import { useAchievements } from '@/achievements/achievements-context';
import { localDate } from '@/api/client';
import type { NewCardioWorkout, PlannedSession } from '@/api/types';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Chip, Message, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { canFill, matchRange, sessionLabel } from '@/goals/session-match';
import { CardioSummary } from '@/health/cardio-summary';
import { IMPORT_LOOKBACK_DAYS, useHealthImports, useHealthReport, useHealthState } from '@/health/health-state';
import type { HealthWorkoutStatus } from '@/health/healthkit';
import { useQuery } from '@/hooks/use-query';
import { useTheme } from '@/hooks/use-theme';
import { useSettings } from '@/settings/settings-context';
import { ACTIVITY_NAMES, formatDate, formatDistance } from '@/workout/format';

/**
 * Pairs each workout with the open session of its activity on its
 * date or, failing that, the earliest open one of its week, at most one
 * workout per session. Sessions come by date, so a skipped day is caught up
 * before a later one is done early.
 */
function defaultMatches(workouts: NewCardioWorkout[], sessions: PlannedSession[]) {
  const matches = new Map<string, number | null>();
  const taken = new Set<number>();
  for (const sameDay of [true, false]) {
    workouts.forEach((w, i) => {
      const key = w.source_uuid ?? String(i);
      if (matches.get(key)) return;
      const session = sessions.find(
        (s) => !s.workout && !taken.has(s.id) && canFill(s, w) && (!sameDay || s.date === w.date)
      );
      if (session) taken.add(session.id);
      matches.set(key, session?.id ?? null);
    });
  }
  return matches;
}

/**
 * Reviews the Health workouts not imported yet: ticked ones are imported,
 * filling the planned session they count as, and the rest are dismissed so
 * they aren't offered again, unless restored before the week is over.
 */
export default function HealthImportScreen() {
  const theme = useTheme();
  const { api, serverUrl } = useSettings();
  const achievements = useAchievements();
  const { dismiss, restore } = useHealthState();
  const imports = useHealthImports();
  // Ticked by default, so only unticked UUIDs are tracked.
  const [unticked, setUnticked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  // The active goal's sessions the workouts may count as.
  const range = imports.candidates.length > 0 ? matchRange(imports.candidates.map((w) => w.date)) : null;
  const sessions = useQuery(range ? `import-sessions:${serverUrl}:${range[0]}:${range[1]}` : null, async () => {
    const goal = (await api.listGoals()).find((g) => g.active);
    return goal ? api.goalSessions(goal.id, localDate(), range![0], range![1]) : [];
  });
  // Matches the lifter changed; the rest follow defaultMatches.
  const [chosen, setChosen] = useState<Map<string, number | null>>(new Map());
  const defaults = defaultMatches(imports.candidates, sessions.data ?? []);
  const matchOf = (uuid: string) => (chosen.has(uuid) ? chosen.get(uuid)! : (defaults.get(uuid) ?? null));
  const choose = (uuid: string, sessionId: number | null) => setChosen((c) => new Map(c).set(uuid, sessionId));

  const uuidOf = (i: number) => imports.candidates[i].source_uuid ?? String(i);
  // Workouts without a Health UUID are keyed by position, like everywhere else here.
  const keyOf = (w: NewCardioWorkout) => uuidOf(imports.candidates.indexOf(w));
  const toggle = (uuid: string) =>
    setUnticked((u) => {
      const next = new Set(u);
      if (!next.delete(uuid)) next.add(uuid);
      return next;
    });

  const ticked = imports.candidates.filter((_, i) => !unticked.has(uuidOf(i)));
  const skipped = imports.candidates.filter((_, i) => unticked.has(uuidOf(i)));

  // Distances typed for workouts Health measured none for or only estimated.
  const [distances, setDistances] = useState<Map<string, string>>(new Map());
  const setDistance = (uuid: string, text: string) => setDistances((d) => new Map(d).set(uuid, text));
  /**
   * The workout with the distance typed for it, if any, or why it can't be
   * imported: one Health has no distance for needs one entered.
   */
  const withDistance = (w: NewCardioWorkout): NewCardioWorkout | string => {
    const text = distances.get(keyOf(w))?.trim();
    if (!asksDistance(w)) return w;
    if (!text) {
      return w.distance_m
        ? w
        : `Enter the distance of the ${ACTIVITY_NAMES[w.activity].toLowerCase()} on ${formatDate(w.date, { day: 'numeric', month: 'short' })}, as Apple Health has none.`;
    }
    const value = parseFloat(text.replace(',', '.'));
    if (!(value > 0)) return 'Enter a distance above 0.';
    return { ...w, distance_m: w.activity === 'swimming' ? value : value * 1000, manual_distance: true };
  };

  const save = async (importing: typeof ticked, skipping: typeof skipped) => {
    const entered = importing.map(withDistance);
    const problem = entered.find((e) => typeof e === 'string');
    if (problem) {
      Alert.alert("Can't import workouts", problem);
      return;
    }
    setSaving(true);
    try {
      if (importing.length > 0) {
        await api.importCardio(
          (entered as NewCardioWorkout[]).map((w, i) => {
            const sessionId = matchOf(keyOf(importing[i]));
            return sessionId === null ? w : { ...w, planned_session_id: sessionId };
          })
        );
      }
      await dismiss(skipping.flatMap((w) => (w.source_uuid ? [w.source_uuid] : [])));
      if (importing.length > 0) achievements.check();
      router.back();
    } catch (e) {
      Alert.alert("Couldn't import workouts", (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen hasHeader refreshing={imports.refreshing} onRefresh={imports.refresh}>
      {!imports.data ? (
        <Message loading={!imports.error} error={imports.error} />
      ) : imports.candidates.length === 0 ? (
        <>
          <Message>No new workouts in Apple Health.</Message>
          <Dismissed workouts={imports.dismissedThisWeek} onRestore={restore} />
          <HealthReport />
        </>
      ) : (
        <>
          <ThemedText type="small" themeColor="textSecondary">
            Untick workouts you don&apos;t want in Trucker. You can restore them until the week is over.
          </ThemedText>
          {imports.candidates.map((w, i) => {
            const uuid = uuidOf(i);
            const checked = !unticked.has(uuid);
            const options = (sessions.data ?? []).filter((s) => canFill(s, w) && !s.workout);
            const match = matchOf(uuid);
            return (
              <Card key={uuid} style={!checked && { opacity: 0.5 }}>
                <Pressable
                  onPress={() => toggle(uuid)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked }}
                  style={styles.row}>
                  <CardioSummary workout={w} />
                  <View style={[styles.check, { backgroundColor: checked ? theme.success : theme.backgroundSelected }]}>
                    <ThemedText style={{ color: checked ? '#fff' : theme.textSecondary, fontWeight: 700 }}>
                      ✓
                    </ThemedText>
                  </View>
                </Pressable>
                {checked && asksDistance(w) && (
                  <DistanceInput workout={w} value={distances.get(uuid) ?? ''} onChange={(t) => setDistance(uuid, t)} />
                )}
                {checked && options.length > 0 && (
                  <>
                    <ThemedText type="small" themeColor="textSecondary">
                      Counts as
                    </ThemedText>
                    <View style={styles.chips}>
                      {options.map((s) => (
                        <Chip
                          key={s.id}
                          label={sessionLabel(s, w.date)}
                          selected={match === s.id}
                          inCard
                          onPress={() => choose(uuid, s.id)}
                        />
                      ))}
                      <Chip label="No session" selected={match === null} inCard onPress={() => choose(uuid, null)} />
                    </View>
                  </>
                )}
              </Card>
            );
          })}
          <View style={styles.footer}>
            <Button
              title={
                ticked.length === 0
                  ? 'Skip all'
                  : `Import ${ticked.length} ${ticked.length === 1 ? 'workout' : 'workouts'}`
              }
              variant={ticked.length === 0 ? 'secondary' : 'primary'}
              loading={saving}
              onPress={() => save(ticked, skipped)}
            />
            {ticked.length > 0 && (
              <Button
                title="Skip all"
                variant="secondary"
                compact
                disabled={saving}
                onPress={() => save([], imports.candidates)}
              />
            )}
          </View>
          <Dismissed workouts={imports.dismissedThisWeek} onRestore={restore} />
        </>
      )}
    </Screen>
  );
}

/** Whether a workout's distance should be entered: Health has none, or only the watch's indoor estimate. */
const asksDistance = (w: NewCardioWorkout) => !w.distance_m || w.indoor === true;

/**
 * Enters the distance of a workout being imported, e.g. from the treadmill
 * or bike computer. Swims are in metres, the rest in km. Left empty, the
 * workout keeps what Health has.
 */
function DistanceInput({
  workout: w,
  value,
  onChange,
}: {
  workout: NewCardioWorkout;
  value: string;
  onChange: (text: string) => void;
}) {
  const theme = useTheme();
  const metres = w.activity === 'swimming';
  return (
    <>
      <ThemedText type="small" themeColor="textSecondary">
        {w.distance_m
          ? 'Indoors the watch only estimates the distance. Enter the machine’s, or leave it empty to keep the estimate.'
          : 'No distance from Apple Health. Enter it, e.g. from your bike computer or the machine.'}{' '}
      </ThemedText>
      <View style={styles.distance}>
        <TextInput
          value={value}
          onChangeText={onChange}
          keyboardType="decimal-pad"
          placeholder={w.distance_m ? formatDistance(w.distance_m, w.activity) : metres ? 'Metres' : 'Kilometres'}
          placeholderTextColor={theme.textSecondary}
          accessibilityLabel={metres ? 'Distance in metres' : 'Distance in kilometres'}
          style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundSelected }]}
        />
        <ThemedText themeColor="textSecondary">{metres ? 'm' : 'km'}</ThemedText>
      </View>
    </>
  );
}

/** This week's dismissed workouts, each of which can go back on the list to import. */
function Dismissed({ workouts, onRestore }: { workouts: NewCardioWorkout[]; onRestore: (uuids: string[]) => void }) {
  if (workouts.length === 0) return null;
  return (
    <>
      <ThemedText type="smallBold">Dismissed this week</ThemedText>
      {workouts.map((w) => (
        <Card key={w.source_uuid}>
          <View style={styles.row}>
            <CardioSummary workout={w} />
            <Button title="Restore" variant="secondary" compact onPress={() => onRestore([w.source_uuid!])} />
          </View>
        </Card>
      ))}
    </>
  );
}

const STATUS: Record<HealthWorkoutStatus, string> = {
  offered: 'offered',
  'too-old': `over ${IMPORT_LOOKBACK_DAYS} days before you connected`,
  unsupported: 'activity not supported',
  imported: 'already imported',
  dismissed: 'dismissed',
};

/** What Apple Health returns around the connection, for finding missing workouts. */
function HealthReport() {
  const { state } = useHealthState();
  const report = useHealthReport(true);
  const connectedAt = state.connectedAt ? new Date(state.connectedAt) : null;
  return (
    <Card>
      <ThemedText type="smallBold">What Apple Health returned</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Connected {connectedAt?.toLocaleString() ?? 'never'}. Workouts from {2 * IMPORT_LOOKBACK_DAYS} days before that
        on:
      </ThemedText>
      {report.error ? (
        <ThemedText type="small">Error: {report.error}</ThemedText>
      ) : !report.data ? (
        <ThemedText type="small" themeColor="textSecondary">
          Loading…
        </ThemedText>
      ) : report.data.length === 0 ? (
        <ThemedText type="small">None. Apple Health returned no workouts at all.</ThemedText>
      ) : (
        report.data.map((w) => (
          <ThemedText key={w.uuid} type="small">
            {w.start.toLocaleString()} · {w.activity ? w.name : `${w.name} (type ${w.activityType})`}
            {w.source ? ` · ${w.source}` : ''} · {STATUS[w.status]}
          </ThemedText>
        ))
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  check: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  distance: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  input: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  footer: {
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
});
