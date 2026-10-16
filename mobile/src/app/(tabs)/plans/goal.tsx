import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, TextInput, View } from 'react-native';

import { localDate } from '@/api/client';
import type { NewGoal, Weekday } from '@/api/types';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Chip, Message, Screen, SectionLabel } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { GOAL_PRESETS } from '@/goals/presets';
import { useTheme } from '@/hooks/use-theme';
import { weekdayLabel, WEEKDAYS } from '@/plans/edit-model';
import { useSettings } from '@/settings/settings-context';
import { formatDate } from '@/workout/format';

/** Inputs are strings while editing; swims in metres, rides and runs in km. */
type EditGoal = {
  name: string;
  raceDate: string;
  swim: string;
  bike: string;
  run: string;
  weekdays: Weekday[];
  longDay: Weekday;
};

const blank: EditGoal = {
  name: '',
  raceDate: '',
  swim: '',
  bike: '',
  run: '',
  weekdays: ['tuesday', 'thursday', 'saturday', 'sunday'],
  longDay: 'sunday',
};

const km = (metres?: number) => (metres ? String(Math.round(metres) / 1000) : '');
const number = (input: string) => parseFloat(input.replace(',', '.'));

/** The Sunday `weeks` weeks from today, a typical race day. */
function sundayIn(weeks: number) {
  const d = new Date();
  d.setDate(d.getDate() + weeks * 7 + ((7 - d.getDay()) % 7));
  return localDate(d);
}

/** Creates the active endurance goal, or edits one (`id` of a goal). */
export default function GoalEditorScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isNew = !id || id === 'new';
  const theme = useTheme();
  const { api } = useSettings();
  const [edit, setEdit] = useState<EditGoal | null>(isNew ? blank : null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Load once; refetching would overwrite unsaved edits.
  useEffect(() => {
    if (isNew) return;
    api
      .listGoals()
      .then((goals) => {
        const g = goals.find((goal) => goal.id === Number(id));
        if (!g) throw new Error('Goal not found');
        setEdit({
          name: g.name,
          raceDate: g.race_date,
          swim: g.swim_m ? String(g.swim_m) : '',
          bike: km(g.bike_m),
          run: km(g.run_m),
          weekdays: g.weekdays,
          longDay: g.long_day,
        });
      })
      .catch((e: Error) => setLoadError(e.message));
  }, [api, id, isNew]);

  if (!edit) {
    return (
      <Screen hasHeader>
        <Message loading={!loadError} error={loadError} />
      </Screen>
    );
  }
  const set = (patch: Partial<EditGoal>) => setEdit((e) => e && { ...e, ...patch });

  const toGoal = (): NewGoal | string => {
    const legs = {
      swim_m: edit.swim ? number(edit.swim) : undefined,
      bike_m: edit.bike ? number(edit.bike) * 1000 : undefined,
      run_m: edit.run ? number(edit.run) * 1000 : undefined,
    };
    if (Object.values(legs).some((v) => v !== undefined && !(v > 0))) return 'Distances must be positive numbers.';
    if (Object.values(legs).every((v) => v === undefined)) return 'Set at least one distance.';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(edit.raceDate)) return 'Set the race date as YYYY-MM-DD.';
    if (edit.raceDate <= localDate()) return 'The race must be after today.';
    if (edit.weekdays.length === 0) return 'Pick at least one training day.';
    return {
      ...(isNew ? {} : { id: Number(id) }),
      name: edit.name.trim() || 'My race',
      race_date: edit.raceDate,
      ...legs,
      weekdays: WEEKDAYS.filter((d) => edit.weekdays.includes(d)),
      long_day: edit.weekdays.includes(edit.longDay) ? edit.longDay : edit.weekdays.at(-1)!,
    };
  };

  const save = async () => {
    const goal = toGoal();
    if (typeof goal === 'string') {
      Alert.alert("Can't save goal", goal);
      return;
    }
    setSaving(true);
    try {
      const saved =
        goal.id === undefined
          ? await api.createGoal(goal, localDate())
          : await api.updateGoal({ ...goal, id: goal.id }, localDate());
      const open = () =>
        router.replace({ pathname: '/plans/goal-calendar', params: { id: saved.goal.id } });
      if (saved.warnings.length > 0) Alert.alert('Plan created', saved.warnings.join('\n\n'), [{ text: 'OK', onPress: open }]);
      else open();
    } catch (e) {
      Alert.alert("Couldn't save goal", (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = () =>
    Alert.alert('Delete goal?', 'Its plan is deleted too. Imported workouts are kept.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteGoal(Number(id));
            router.back();
          } catch (e) {
            Alert.alert("Couldn't delete goal", (e as Error).message);
          }
        },
      },
    ]);

  const toggleDay = (day: Weekday) =>
    set({ weekdays: edit.weekdays.includes(day) ? edit.weekdays.filter((d) => d !== day) : [...edit.weekdays, day] });

  const inputStyle = [styles.input, { color: theme.text, backgroundColor: theme.backgroundSelected }];
  const preset = GOAL_PRESETS.find(
    (p) => km(p.legs.bike_m) === edit.bike && km(p.legs.run_m) === edit.run && (p.legs.swim_m ? String(p.legs.swim_m) : '') === edit.swim
  );

  return (
    <Screen hasHeader>
      <Stack.Screen options={{ title: isNew ? 'New goal' : 'Edit goal' }} />

      <SectionLabel>Race</SectionLabel>
      <Card>
        <View style={styles.chips}>
          {GOAL_PRESETS.map((p) => (
            <Chip
              key={p.label}
              label={p.label}
              selected={preset === p}
              inCard
              onPress={() =>
                set({
                  name: edit.name || p.label,
                  swim: p.legs.swim_m ? String(p.legs.swim_m) : '',
                  bike: km(p.legs.bike_m),
                  run: km(p.legs.run_m),
                })
              }
            />
          ))}
        </View>
        <TextInput
          value={edit.name}
          onChangeText={(name) => set({ name })}
          placeholder="Name, e.g. City 10k"
          placeholderTextColor={theme.textSecondary}
          style={inputStyle}
        />
        <View style={styles.row}>
          {(
            [
              ['swim', 'Swim (m)'],
              ['bike', 'Bike (km)'],
              ['run', 'Run (km)'],
            ] as const
          ).map(([key, label]) => (
            <View key={key} style={{ flex: 1, gap: Spacing.one }}>
              <ThemedText type="small" themeColor="textSecondary">
                {label}
              </ThemedText>
              <TextInput
                value={edit[key]}
                onChangeText={(v) => set({ [key]: v })}
                keyboardType="decimal-pad"
                placeholder="–"
                placeholderTextColor={theme.textSecondary}
                accessibilityLabel={label}
                style={inputStyle}
              />
            </View>
          ))}
        </View>
      </Card>

      <SectionLabel>Race day</SectionLabel>
      <Card>
        <TextInput
          value={edit.raceDate}
          onChangeText={(raceDate) => set({ raceDate })}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={theme.textSecondary}
          autoCorrect={false}
          style={inputStyle}
        />
        <View style={styles.chips}>
          {[8, 12, 16, 20].map((weeks) => (
            <Chip
              key={weeks}
              label={`${weeks} weeks`}
              selected={edit.raceDate === sundayIn(weeks)}
              inCard
              onPress={() => set({ raceDate: sundayIn(weeks) })}
            />
          ))}
        </View>
        {/^\d{4}-\d{2}-\d{2}$/.test(edit.raceDate) && (
          <ThemedText type="small" themeColor="textSecondary">
            {formatDate(edit.raceDate, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </ThemedText>
        )}
      </Card>

      <SectionLabel>Training days</SectionLabel>
      <Card>
        <View style={styles.chips}>
          {WEEKDAYS.map((day) => (
            <Chip
              key={day}
              label={weekdayLabel(day, true)}
              selected={edit.weekdays.includes(day)}
              inCard
              onPress={() => toggleDay(day)}
            />
          ))}
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          Long session on
        </ThemedText>
        <View style={styles.chips}>
          {WEEKDAYS.filter((d) => edit.weekdays.includes(d)).map((day) => (
            <Chip
              key={day}
              label={weekdayLabel(day, true)}
              selected={edit.longDay === day}
              variant="secondary"
              inCard
              onPress={() => set({ longDay: day })}
            />
          ))}
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          One session a day; a triathlon adds a short run after the long ride. Your strength plan carries on
          alongside.
        </ThemedText>
      </Card>

      <Button title={isNew ? 'Create plan' : 'Save and replan'} loading={saving} onPress={save} />
      {!isNew && <Button title="Delete goal" variant="danger" compact onPress={confirmDelete} />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  input: {
    height: 40,
    borderRadius: 10,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
  },
});
