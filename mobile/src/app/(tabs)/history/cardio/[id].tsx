import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, TextInput, View } from 'react-native';

import { localDate } from '@/api/client';
import type { CardioWorkout, PlannedSession } from '@/api/types';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Chip, Message, Screen, SectionLabel } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { SessionDetails } from '@/goals/session-card';
import { useHealthState } from '@/health/health-state';
import { useQuery } from '@/hooks/use-query';
import { useTheme } from '@/hooks/use-theme';
import { useSettings } from '@/settings/settings-context';
import { confirmDeleteCardio } from '@/workout/confirm-delete';
import {
  ACTIVITY_ICONS,
  ACTIVITY_NAMES,
  formatDate,
  formatDistance,
  formatDuration,
  formatPace,
  formatTime,
} from '@/workout/format';

export default function CardioDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api, serverUrl } = useSettings();
  const { dismiss } = useHealthState();
  const workout = useQuery(`cardio:${serverUrl}:${id}`, () => api.getCardio(Number(id)));
  const [deleting, setDeleting] = useState(false);
  // The active goal's sessions on the workout's day, to say which it fills.
  const date = workout.data?.date;
  const sessions = useQuery(date ? `cardio-sessions:${serverUrl}:${id}:${date}` : null, async () => {
    const goal = (await api.listGoals()).find((g) => g.active);
    return goal ? api.goalSessions(goal.id, localDate(), date, date) : [];
  });
  const [matching, setMatching] = useState(false);

  const match = async (session: PlannedSession | null, current: PlannedSession | undefined) => {
    setMatching(true);
    try {
      if (session) await api.matchSession(session.id, Number(id), localDate());
      else if (current) await api.matchSession(current.id, null, localDate());
      sessions.refresh();
    } catch (e) {
      Alert.alert("Couldn't change the session", (e as Error).message);
    } finally {
      setMatching(false);
    }
  };

  const confirmDelete = (w: CardioWorkout) =>
    confirmDeleteCardio(async () => {
      setDeleting(true);
      try {
        await api.deleteCardio(w.id);
        if (w.source_uuid) await dismiss([w.source_uuid]);
        router.back();
      } catch (e) {
        Alert.alert("Couldn't delete workout", (e as Error).message);
        setDeleting(false);
      }
    });

  const w = workout.data;
  return (
    <Screen hasHeader refreshing={workout.refreshing} onRefresh={workout.refresh}>
      {!w ? (
        <Message loading={!workout.error} error={workout.error} />
      ) : (
        <>
          <Card>
            <ThemedText style={{ fontSize: 22, fontWeight: 700 }}>
              {ACTIVITY_ICONS[w.activity]} {ACTIVITY_NAMES[w.activity]}
            </ThemedText>
            <ThemedText themeColor="textSecondary">
              {formatDate(w.date)} · {formatTime(w.started_at)}
              {w.source ? ` · ${w.source}` : ''}
            </ThemedText>
          </Card>
          <Card>
            {stats(w).map(([label, value]) => (
              <View key={label} style={styles.row}>
                <ThemedText style={{ flex: 1 }}>{label}</ThemedText>
                <ThemedText style={{ fontWeight: 600, fontVariant: ['tabular-nums'] }}>{value}</ThemedText>
              </View>
            ))}
          </Card>
          {(!w.distance_m || w.manual_distance) && (
            <DistanceEntry
              workout={w}
              onSaved={() => {
                workout.refresh();
                sessions.refresh();
              }}
            />
          )}
          {w.laps && w.laps.length > 0 && (
            <Card>
              <ThemedText type="smallBold">
                {w.activity === 'swimming' ? 'Lengths' : 'Laps'} · {w.laps.length}
              </ThemedText>
              {w.activity !== 'swimming' &&
                w.laps.map((lap, i) => (
                  <View key={i} style={styles.row}>
                    <ThemedText type="small" themeColor="textSecondary" style={{ width: 32 }}>
                      {i + 1}
                    </ThemedText>
                    <ThemedText type="small" style={{ flex: 1 }}>
                      {formatDistance(lap.d, w.activity)} in {formatDuration(lap.duration)}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {formatPace(w.activity, lap.d, lap.duration)}
                    </ThemedText>
                  </View>
                ))}
            </Card>
          )}
          {sessions.data && sessions.data.length > 0 && (
            <CountsAs
              workoutId={w.id}
              sessions={sessions.data}
              disabled={matching}
              onMatch={match}
            />
          )}
          <Button title="Delete workout" variant="danger" loading={deleting} onPress={() => confirmDelete(w)} />
        </>
      )}
    </Screen>
  );
}

/**
 * Enters the distance of a workout Apple Health has none for, such as an
 * indoor ride without a speed sensor, or corrects one entered before. Swims
 * are in metres, the rest in km.
 */
function DistanceEntry({ workout: w, onSaved }: { workout: CardioWorkout; onSaved: () => void }) {
  const theme = useTheme();
  const { api } = useSettings();
  const metres = w.activity === 'swimming';
  const shown = (m?: number) => (m ? String(metres ? Math.round(m) : Math.round(m) / 1000) : '');
  const [input, setInput] = useState(shown(w.distance_m));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const value = parseFloat(input.replace(',', '.'));
    if (!(value > 0)) {
      Alert.alert("Can't save distance", 'Enter a distance above 0.');
      return;
    }
    setSaving(true);
    try {
      await api.setCardioDistance(w.id, metres ? value : value * 1000, localDate());
      onSaved();
    } catch (e) {
      Alert.alert("Couldn't save distance", (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <ThemedText type="smallBold">{w.manual_distance ? 'Distance entered by hand' : 'No distance recorded'}</ThemedText>
      {!w.manual_distance && (
        <ThemedText type="small" themeColor="textSecondary">
          Apple Health has no distance for this workout. Enter it, e.g. from your bike computer or the machine, so
          it counts toward your plan.
        </ThemedText>
      )}
      <View style={styles.row}>
        <TextInput
          value={input}
          onChangeText={setInput}
          keyboardType="decimal-pad"
          placeholder={metres ? 'Metres' : 'Kilometres'}
          placeholderTextColor={theme.textSecondary}
          accessibilityLabel={metres ? 'Distance in metres' : 'Distance in kilometres'}
          style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundSelected }]}
        />
        <ThemedText themeColor="textSecondary">{metres ? 'm' : 'km'}</ThemedText>
        <Button
          title={w.manual_distance ? 'Update' : 'Save'}
          compact
          loading={saving}
          disabled={input === shown(w.distance_m)}
          onPress={save}
        />
      </View>
    </Card>
  );
}

/** Which of the day's planned sessions the workout fills, and how it went. */
function CountsAs({
  workoutId,
  sessions,
  disabled,
  onMatch,
}: {
  workoutId: number;
  sessions: PlannedSession[];
  disabled: boolean;
  onMatch: (session: PlannedSession | null, current: PlannedSession | undefined) => void;
}) {
  const current = sessions.find((s) => s.cardio_workout_id === workoutId);
  // Sessions another workout filled aren't offered.
  const options = sessions.filter((s) => !s.cardio_workout_id || s.cardio_workout_id === workoutId);
  return (
    <>
      <SectionLabel>Counts as</SectionLabel>
      <Card>
        {current && <SessionDetails session={current} />}
        <View style={styles.chips}>
          {options.map((s) => (
            <Chip
              key={s.id}
              label={s.description.split(' · ')[0].split(':')[0]}
              selected={current?.id === s.id}
              inCard
              onPress={() => !disabled && current?.id !== s.id && onMatch(s, current)}
            />
          ))}
          <Chip
            label="No session"
            selected={!current}
            inCard
            onPress={() => !disabled && current && onMatch(null, current)}
          />
        </View>
      </Card>
    </>
  );
}

function stats(w: CardioWorkout): [string, string][] {
  const rows: [string, string | null][] = [
    ['Distance', w.distance_m ? formatDistance(w.distance_m, w.activity) : null],
    ['Time', formatDuration(w.duration_seconds)],
    [w.activity === 'cycling' ? 'Speed' : 'Pace', formatPace(w.activity, w.distance_m, w.duration_seconds) || null],
    ['Avg heart rate', w.avg_heart_rate ? `${w.avg_heart_rate} bpm` : null],
    ['Max heart rate', w.max_heart_rate ? `${w.max_heart_rate} bpm` : null],
    ['Active energy', w.energy_kcal ? `${w.energy_kcal} kcal` : null],
    ['Strokes', w.swim_strokes ? String(w.swim_strokes) : null],
    ['Pool length', w.lap_length_m ? `${w.lap_length_m} m` : null],
  ];
  return rows.filter((r): r is [string, string] => r[1] !== null);
}

const styles = StyleSheet.create({
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: 2,
  },
});
