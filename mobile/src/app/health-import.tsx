import { router } from 'expo-router';
import { useState } from 'react';

import { localDate } from '@/api/client';
import type { NewCardioWorkout, PlannedSession } from '@/api/types';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Chip, Message, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { CardioSummary } from '@/health/cardio-summary';
import { IMPORT_LOOKBACK_DAYS, useHealthImports, useHealthReport, useHealthState } from '@/health/health-state';
import type { HealthWorkoutStatus } from '@/health/healthkit';
import { useQuery } from '@/hooks/use-query';
import { useTheme } from '@/hooks/use-theme';
import { useSettings } from '@/settings/settings-context';

/** "Easy run 6 km" from "Easy run 6 km · 5:45–6:15/km". */
const shortName = (s: PlannedSession) => s.description.split(' · ')[0].split(':')[0];

/**
 * Pairs each workout with the open session of the same activity on its
 * date, at most one workout per session.
 */
function defaultMatches(workouts: NewCardioWorkout[], sessions: PlannedSession[]) {
  const matches = new Map<string, number | null>();
  const taken = new Set<number>();
  workouts.forEach((w, i) => {
    const session = sessions.find(
      (s) => !s.workout && !taken.has(s.id) && s.date === w.date && s.activity === w.activity
    );
    if (session) taken.add(session.id);
    matches.set(w.source_uuid ?? String(i), session?.id ?? null);
  });
  return matches;
}

/**
 * Reviews the Health workouts not imported yet: ticked ones are imported,
 * filling the planned session they count as, and the rest are dismissed so
 * they aren't offered again.
 */
export default function HealthImportScreen() {
  const theme = useTheme();
  const { api, serverUrl } = useSettings();
  const { dismiss } = useHealthState();
  const imports = useHealthImports();
  // Ticked by default, so only unticked UUIDs are tracked.
  const [unticked, setUnticked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  // The active goal's sessions on the workouts' dates.
  const dates = imports.candidates.map((w) => w.date).sort();
  const sessions = useQuery(
    dates.length > 0 ? `import-sessions:${serverUrl}:${dates[0]}:${dates.at(-1)}` : null,
    async () => {
      const goal = (await api.listGoals()).find((g) => g.active);
      return goal ? api.goalSessions(goal.id, localDate(), dates[0], dates.at(-1)) : [];
    }
  );
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

  const save = async (importing: typeof ticked, skipping: typeof skipped) => {
    setSaving(true);
    try {
      if (importing.length > 0) {
        await api.importCardio(
          importing.map((w) => {
            const sessionId = matchOf(keyOf(w));
            return sessionId === null ? w : { ...w, planned_session_id: sessionId };
          })
        );
      }
      await dismiss(skipping.flatMap((w) => (w.source_uuid ? [w.source_uuid] : [])));
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
          <HealthReport />
        </>
      ) : (
        <>
          <ThemedText type="small" themeColor="textSecondary">
            Untick workouts you don&apos;t want in Trucker. They won&apos;t be offered again.
          </ThemedText>
          {imports.candidates.map((w, i) => {
            const uuid = uuidOf(i);
            const checked = !unticked.has(uuid);
            const options = (sessions.data ?? []).filter((s) => s.date === w.date && !s.workout);
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
                {checked && !w.distance_m && (
                  <ThemedText type="small" themeColor="textSecondary">
                    No distance from Apple Health. Add it after importing, from the workout in History.
                  </ThemedText>
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
                          label={shortName(s)}
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
        </>
      )}
    </Screen>
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
