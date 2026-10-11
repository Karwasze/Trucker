import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { MUSCLES, type Muscle, type MuscleTarget } from '@/api/types';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Chip, Message } from '@/components/ui';
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
  // Tags saved since the list loaded.
  const [saved, setSaved] = useState<Record<string, MuscleTarget[]>>({});
  // Unsaved changes to the expanded exercise; discarded unless saved.
  const [draft, setDraft] = useState<{ name: string; tags: MuscleTarget[] } | null>(null);
  const [saving, setSaving] = useState(false);

  if (!data.data) return <Message loading={!data.error} error={data.error} />;

  const savedTags = (name: string) => saved[name] ?? data.data?.tags[name] ?? [];

  const toggle = (muscle: Muscle) => {
    if (!draft) return;
    const role = draft.tags.find((t) => t.muscle === muscle)?.role ?? 'none';
    const next = NEXT_ROLE[role];
    const others = draft.tags.filter((t) => t.muscle !== muscle);
    const tags = (next === 'none' ? others : [...others, { muscle, role: next }]).sort(
      (a, b) => MUSCLES.indexOf(a.muscle) - MUSCLES.indexOf(b.muscle)
    );
    setDraft({ ...draft, tags });
  };

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      await api.setExerciseMuscles(draft.name, draft.tags);
      setSaved((s) => ({ ...s, [draft.name]: draft.tags }));
      setDraft(null);
    } catch (e) {
      Alert.alert("Couldn't save muscles", (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <ThemedText type="small" themeColor="textSecondary">
        Tap an exercise, then tap a muscle once for primary and again for secondary, and Save.
        Secondary muscles count half a set in Insights.
      </ThemedText>
      <Card style={{ gap: 0, paddingVertical: Spacing.one }}>
        {data.data.names.map((name) => (
          <ExerciseRow
            key={name}
            name={name}
            tags={savedTags(name)}
            draft={draft?.name === name ? draft.tags : null}
            saving={saving}
            // Opening another exercise or closing this one discards unsaved changes.
            onPress={() => setDraft(draft?.name === name ? null : { name, tags: savedTags(name) })}
            onToggle={toggle}
            onSave={save}
            onCancel={() => setDraft(null)}
          />
        ))}
      </Card>
    </>
  );
}

const sameTags = (a: MuscleTarget[], b: MuscleTarget[]) =>
  a.length === b.length && a.every((t) => b.some((u) => u.muscle === t.muscle && u.role === t.role));

function ExerciseRow({
  name,
  tags: savedTags,
  draft,
  saving,
  onPress,
  onToggle,
  onSave,
  onCancel,
}: {
  name: string;
  tags: MuscleTarget[];
  /** Unsaved tags while the exercise is expanded, otherwise null. */
  draft: MuscleTarget[] | null;
  saving: boolean;
  onPress: () => void;
  onToggle: (muscle: Muscle) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const theme = useTheme();
  const expanded = draft !== null;
  const tags = draft ?? savedTags;
  const changed = draft !== null && !sameTags(draft, savedTags);
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
          {(changed ? 'Unsaved: ' : '') +
            (tags.length === 0
              ? 'Untagged'
              : [primary.map(capitalize).join(', '), secondary.join(', ')]
                  .filter(Boolean)
                  .join(' · '))}
        </ThemedText>
      </Pressable>
      {expanded && (
        <>
          <View style={styles.chips}>
            {MUSCLES.map((muscle) => {
              const role = tags.find((t) => t.muscle === muscle)?.role;
              return (
                <Chip
                  key={muscle}
                  label={role === 'secondary' ? `${capitalize(muscle)} ½` : capitalize(muscle)}
                  selected={!!role}
                  variant={role === 'secondary' ? 'secondary' : 'primary'}
                  inCard
                  onPress={() => onToggle(muscle)}
                  accessibilityLabel={`${muscle}: ${role ?? 'not worked'}`}
                />
              );
            })}
          </View>
          <View style={styles.actions}>
            <Button title="Cancel" variant="secondary" compact disabled={saving} onPress={onCancel} />
            <Button title="Save" compact disabled={!changed} loading={saving} onPress={onSave} />
          </View>
        </>
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
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.two,
  },
});
