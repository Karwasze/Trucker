import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { MUSCLES, type Muscle, type MuscleTarget } from '@/api/types';
import { ThemedText } from '@/components/themed-text';
import { Card, Chip, Message } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useQuery } from '@/hooks/use-query';
import { useTheme } from '@/hooks/use-theme';
import { useSettings } from '@/settings/settings-context';

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Tapping a muscle chip cycles it through these roles. */
const NEXT_ROLE = {
  none: 'primary',
  primary: 'secondary',
  secondary: 'none',
} as const;

/**
 * Lists every exercise (library and logged) with its muscle tags, which the
 * Insights view uses to count weekly sets per muscle.
 */
export function ExerciseMuscles() {
  const { api, serverUrl } = useSettings();
  const data = useQuery(`exercise-muscles:${serverUrl}`, async () => {
    const [library, stats, tags] = await Promise.all([
      api.listExercises(),
      api.statistics(),
      api.exerciseMuscles(),
    ]);
    const names = [...new Set([...library.map((e) => e.name), ...stats.exercises])];
    return { names: names.sort((a, b) => a.localeCompare(b)), tags };
  });
  // Edits shown before the server confirms them.
  const [edits, setEdits] = useState<Record<string, MuscleTarget[]>>({});
  const [expanded, setExpanded] = useState<string | null>(null);

  if (!data.data) return <Message loading={!data.error} error={data.error} />;

  const tagsOf = (name: string) => edits[name] ?? data.data?.tags[name] ?? [];

  const toggle = async (name: string, muscle: Muscle) => {
    const current = tagsOf(name);
    const role = current.find((t) => t.muscle === muscle)?.role ?? 'none';
    const next = NEXT_ROLE[role];
    const others = current.filter((t) => t.muscle !== muscle);
    const updated = (next === 'none' ? others : [...others, { muscle, role: next }]).sort(
      (a, b) => MUSCLES.indexOf(a.muscle) - MUSCLES.indexOf(b.muscle)
    );
    setEdits((e) => ({ ...e, [name]: updated }));
    try {
      await api.setExerciseMuscles(name, updated);
    } catch (e) {
      setEdits((prev) => ({ ...prev, [name]: current }));
      Alert.alert("Couldn't save muscles", (e as Error).message);
    }
  };

  return (
    <>
      <ThemedText type="small" themeColor="textSecondary">
        Tap an exercise, then tap a muscle once for primary and again for secondary. Secondary
        muscles count half a set in Insights.
      </ThemedText>
      <Card style={{ gap: 0, paddingVertical: Spacing.one }}>
        {data.data.names.map((name) => (
          <ExerciseRow
            key={name}
            name={name}
            tags={tagsOf(name)}
            expanded={expanded === name}
            onPress={() => setExpanded(expanded === name ? null : name)}
            onToggle={(muscle) => toggle(name, muscle)}
          />
        ))}
      </Card>
    </>
  );
}

function ExerciseRow({
  name,
  tags,
  expanded,
  onPress,
  onToggle,
}: {
  name: string;
  tags: MuscleTarget[];
  expanded: boolean;
  onPress: () => void;
  onToggle: (muscle: Muscle) => void;
}) {
  const theme = useTheme();
  const primary = tags.filter((t) => t.role === 'primary').map((t) => t.muscle);
  const secondary = tags.filter((t) => t.role === 'secondary').map((t) => t.muscle);

  return (
    <View style={styles.exercise}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={onPress}
        style={({ pressed }) => [styles.header, { opacity: pressed ? 0.6 : 1 }]}>
        <ThemedText style={{ flex: 1 }}>{name}</ThemedText>
        <ThemedText
          type="small"
          numberOfLines={1}
          style={{ flexShrink: 1, color: tags.length ? theme.textSecondary : theme.warning }}>
          {tags.length === 0
            ? 'Untagged'
            : [primary.map(capitalize).join(', '), secondary.join(', ')].filter(Boolean).join(' · ')}
        </ThemedText>
      </Pressable>
      {expanded && (
        <View style={styles.chips}>
          {MUSCLES.map((muscle) => {
            const role = tags.find((t) => t.muscle === muscle)?.role;
            return (
              <Chip
                key={muscle}
                label={role === 'secondary' ? `${capitalize(muscle)} ½` : capitalize(muscle)}
                selected={!!role}
                variant={role === 'secondary' ? 'secondary' : 'primary'}
                onPress={() => onToggle(muscle)}
                accessibilityLabel={`${muscle}: ${role ?? 'not worked'}`}
              />
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  exercise: {
    paddingVertical: Spacing.two + 2,
    gap: Spacing.two,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
});
