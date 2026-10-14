import { useState } from 'react';
import { Alert, StyleSheet, TextInput, View } from 'react-native';

import { createApi } from '@/api/client';
import type { ExerciseDB } from '@/api/types';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Chip, Message, Screen, SectionLabel } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useQuery } from '@/hooks/use-query';
import { useTheme } from '@/hooks/use-theme';
import { ExerciseMuscles } from '@/settings/exercise-muscles';
import { ENVIRONMENT_NAMES, useSettings, type Environment } from '@/settings/settings-context';
import { useTimer } from '@/timer/timer-context';
import {
  DURATION_STEP_SEC,
  FINISH_BEHAVIOR_NAMES,
  MAX_DURATION_SEC,
  MIN_DURATION_SEC,
  formatClock,
  type FinishBehavior,
} from '@/timer/timer-model';

export default function SettingsScreen() {
  const { api, serverUrl, environment, serverLocked, selectEnvironment } = useSettings();
  const exercises = useQuery(`exercises:${serverUrl}`, api.listExercises);
  const [removing, setRemoving] = useState<number | null>(null);
  const customExercises = (exercises.data ?? [])
    .filter((e) => !e.is_default)
    .sort((a, b) => a.name.localeCompare(b.name));

  const confirmRemove = (exercise: ExerciseDB) =>
    Alert.alert(
      `Remove ${exercise.name}?`,
      'It will no longer be offered when adding exercises. Logged workouts are kept.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setRemoving(exercise.id);
            try {
              await api.deleteExercise(exercise.id);
              exercises.refresh();
            } catch (e) {
              Alert.alert("Couldn't remove exercise", (e as Error).message);
            } finally {
              setRemoving(null);
            }
          },
        },
      ]
    );

  return (
    <Screen
      hasHeader
      refreshing={exercises.refreshing}
      onRefresh={exercises.refresh}>
      <SectionLabel>Server</SectionLabel>
      {!serverLocked && (
        <View style={styles.chips}>
          {ENVIRONMENTS.map((env) => (
            <Chip
              key={env}
              label={ENVIRONMENT_NAMES[env]}
              selected={env === environment}
              onPress={() => selectEnvironment(env)}
            />
          ))}
        </View>
      )}
      {/* Keyed so the input and status start fresh for each server. */}
      <ServerCard key={environment} />

      <SectionLabel>Rest timer</SectionLabel>
      <TimerCard />

      <SectionLabel>Exercises</SectionLabel>
      {!exercises.data ? (
        <Message loading={!exercises.error} error={exercises.error} />
      ) : customExercises.length === 0 ? (
        <Message>
          No custom exercises. Exercises you create while logging a workout show up here.
        </Message>
      ) : (
        <Card style={{ gap: 0, paddingVertical: Spacing.one }}>
          {customExercises.map((exercise) => (
            <View key={exercise.id} style={styles.option}>
              <ThemedText style={{ flex: 1 }}>{exercise.name}</ThemedText>
              <Button
                title="Remove"
                variant="secondary"
                compact
                loading={removing === exercise.id}
                onPress={() => confirmRemove(exercise)}
                accessibilityLabel={`Remove ${exercise.name}`}
              />
            </View>
          ))}
        </Card>
      )}
      {customExercises.length > 0 && (
        <ThemedText type="small" themeColor="textSecondary">
          Built-in exercises can&apos;t be removed.
        </ThemedText>
      )}

      <SectionLabel>Muscles</SectionLabel>
      {/* Keyed so a different server starts with its own tags. */}
      <ExerciseMuscles key={serverUrl} />
    </Screen>
  );
}

const ENVIRONMENTS: Environment[] = ['dev', 'prod'];

/** Edits and checks the active server's URL; a locked server can only be checked. */
function ServerCard() {
  const theme = useTheme();
  const { environment, serverUrl, serverLocked, setServerUrl } = useSettings();
  const [urlInput, setUrlInput] = useState(serverUrl);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [testing, setTesting] = useState(false);

  const saveAndTest = async () => {
    const url = urlInput.trim().replace(/\/+$/, '');
    setUrlInput(url);
    if (!url) {
      setStatus({ ok: false, text: 'Enter a server URL.' });
      return;
    }
    setTesting(true);
    setStatus(null);
    try {
      const exercises = await createApi(url).listExercises();
      setStatus({ ok: true, text: `Connected · ${exercises.length} exercises` });
    } catch (e) {
      setStatus({ ok: false, text: (e as Error).message });
    } finally {
      setTesting(false);
      setServerUrl(environment, url);
    }
  };

  return (
    <Card>
      {serverLocked ? (
        <ThemedText selectable accessibilityLabel={`${ENVIRONMENT_NAMES[environment]} server URL`}>
          {serverUrl}
        </ThemedText>
      ) : (
        <TextInput
          value={urlInput}
          onChangeText={setUrlInput}
          onSubmitEditing={saveAndTest}
          placeholder={environment === 'prod' ? 'https://trucker.example.com' : 'http://192.168.1.10:8081'}
          placeholderTextColor={theme.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="done"
          accessibilityLabel={`${ENVIRONMENT_NAMES[environment]} server URL`}
          style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundSelected }]}
        />
      )}
      {status ? (
        <ThemedText type="small" style={{ color: status.ok ? theme.success : theme.danger }}>
          {status.text}
        </ThemedText>
      ) : (
        !serverUrl && (
          <ThemedText type="small" themeColor="textSecondary">
            No {ENVIRONMENT_NAMES[environment].toLowerCase()} server set yet.
          </ThemedText>
        )
      )}
      <Button
        title={urlInput.trim() === serverUrl ? 'Test connection' : 'Save & test'}
        variant="secondary"
        compact
        loading={testing}
        onPress={saveAndTest}
      />
    </Card>
  );
}

const FINISH_BEHAVIORS: FinishBehavior[] = ['animation', 'vibration'];

/** Configures the floating rest timer's target and what happens when it's reached. */
function TimerCard() {
  const { settings, updateSettings } = useTimer();
  const { durationSec, animation, vibration } = settings;
  const step = (delta: number) => updateSettings({ durationSec: durationSec + delta });

  return (
    <Card>
      <View style={styles.option}>
        <ThemedText style={{ flex: 1 }}>Counts up to</ThemedText>
        <Button
          title="−"
          variant="secondary"
          compact
          disabled={durationSec <= MIN_DURATION_SEC}
          onPress={() => step(-DURATION_STEP_SEC)}
          accessibilityLabel={`Shorten by ${DURATION_STEP_SEC} seconds`}
        />
        <ThemedText style={styles.duration}>{formatClock(durationSec * 1000)}</ThemedText>
        <Button
          title="+"
          variant="secondary"
          compact
          disabled={durationSec >= MAX_DURATION_SEC}
          onPress={() => step(DURATION_STEP_SEC)}
          accessibilityLabel={`Lengthen by ${DURATION_STEP_SEC} seconds`}
        />
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        When it finishes
      </ThemedText>
      <View style={styles.chips}>
        {FINISH_BEHAVIORS.map((behavior) => (
          <Chip
            key={behavior}
            label={FINISH_BEHAVIOR_NAMES[behavior]}
            selected={settings[behavior]}
            inCard
            onPress={() => updateSettings({ [behavior]: !settings[behavior] })}
          />
        ))}
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        Starts when you tick off a set; tap the top of the screen to start it yourself.{' '}
        {animation && 'The island celebrates, or does once you next look at the app. '}
        {vibration && 'Vibrates even with the phone locked, using a notification.'}
      </ThemedText>
    </Card>
  );
}

const styles = StyleSheet.create({
  duration: {
    minWidth: 56,
    textAlign: 'center',
    fontSize: 20,
    fontWeight: 600,
    fontVariant: ['tabular-nums'],
  },
  input: {
    height: 44,
    borderRadius: 10,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
  },
  chips: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.two + 2,
    gap: Spacing.two,
  },
});
