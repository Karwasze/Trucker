import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { SwipeToDelete } from '@/components/swipe-to-delete';
import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { DraftExercise, DraftSet } from '@/workout/draft';

type Props = {
  exercise: DraftExercise;
  onChange: (exercise: DraftExercise) => void;
  onRemove: () => void;
};

export function ExerciseCard({ exercise, onChange, onRemove }: Props) {
  const theme = useTheme();

  const updateSet = (index: number, patch: Partial<DraftSet>) =>
    onChange({
      ...exercise,
      sets: exercise.sets.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    });

  const addSet = () => {
    const last = exercise.sets.at(-1);
    onChange({
      ...exercise,
      sets: [...exercise.sets, { weight: last?.weight ?? '', reps: last?.reps ?? '', done: false }],
    });
  };

  const removeSet = (index: number) =>
    onChange({ ...exercise, sets: exercise.sets.filter((_, i) => i !== index) });

  const doneCount = exercise.sets.filter((s) => s.done).length;

  // The card needs a longer drag than its set rows, so a swipe on a set row
  // removes the set and a swipe anywhere else removes the exercise.
  return (
    <SwipeToDelete
      onDelete={onRemove}
      label="Remove"
      accessibilityLabel={`Remove ${exercise.name}`}
      dragOffset={30}>
      <Card>
        <View style={styles.titleRow}>
          <View style={{ flex: 1 }}>
            <ThemedText type="default" style={{ fontWeight: 700, fontSize: 18 }}>
              {exercise.name}
            </ThemedText>
            {exercise.target && (
              <ThemedText type="small" themeColor="textSecondary">
                Target {exercise.target}
              </ThemedText>
            )}
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            {doneCount}/{exercise.sets.length}
          </ThemedText>
        </View>

        <View style={styles.headerRow}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.setCol}>
            Set
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.inputCol}>
            kg
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.inputCol}>
            Reps
          </ThemedText>
          <View style={styles.doneCol} />
        </View>

        {exercise.sets.map((set, i) => (
          <SwipeToDelete
            key={i}
            compact
            label="Remove"
            accessibilityLabel={`Remove set ${i + 1}`}
            backgroundColor={theme.backgroundElement}
            onDelete={(row) => {
              // Rows are keyed by index, so the next set takes over this row:
              // snap it back so it doesn't appear swiped away.
              row.reset();
              removeSet(i);
            }}>
            <View style={styles.setRow}>
              <Pressable
                onLongPress={() => removeSet(i)}
                accessibilityHint="Long press to remove this set"
                style={styles.setCol}>
                <ThemedText themeColor="textSecondary">{i + 1}</ThemedText>
              </Pressable>
              <TextInput
                value={set.weight}
                onChangeText={(weight) => updateSet(i, { weight: weight.replace(',', '.') })}
                keyboardType="decimal-pad"
                selectTextOnFocus
                accessibilityLabel={`Set ${i + 1} weight`}
                style={[
                  styles.input,
                  styles.inputCol,
                  { color: theme.text, backgroundColor: theme.backgroundSelected },
                ]}
              />
              <TextInput
                value={set.reps}
                onChangeText={(reps) => updateSet(i, { reps: reps.replace(/\D/g, '') })}
                keyboardType="number-pad"
                selectTextOnFocus
                accessibilityLabel={`Set ${i + 1} reps`}
                style={[
                  styles.input,
                  styles.inputCol,
                  { color: theme.text, backgroundColor: theme.backgroundSelected },
                ]}
              />
              <Pressable
                onPress={() => updateSet(i, { done: !set.done })}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: set.done }}
                accessibilityLabel={`Set ${i + 1} done`}
                style={[
                  styles.check,
                  styles.doneCol,
                  { backgroundColor: set.done ? theme.success : theme.backgroundSelected },
                ]}>
                <ThemedText style={{ color: set.done ? '#fff' : theme.textSecondary, fontWeight: 700 }}>
                  ✓
                </ThemedText>
              </Pressable>
            </View>
          </SwipeToDelete>
        ))}

        <Pressable onPress={addSet} style={styles.addSet} accessibilityRole="button">
          <ThemedText type="smallBold" style={{ color: theme.accent }}>
            + Add set
          </ThemedText>
        </Pressable>
      </Card>
    </SwipeToDelete>
  );
}

const styles = StyleSheet.create({
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  setCol: {
    width: 32,
    alignItems: 'center',
    textAlign: 'center',
  },
  inputCol: {
    flex: 1,
    textAlign: 'center',
  },
  doneCol: {
    width: 44,
  },
  input: {
    height: 44,
    borderRadius: 10,
    fontSize: 18,
    fontWeight: 600,
    fontVariant: ['tabular-nums'],
  },
  check: {
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addSet: {
    alignSelf: 'flex-start',
    paddingVertical: Spacing.one,
  },
});
