import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { EditExercise, EditSet } from '@/plans/edit-model';

type Props = {
  exercise: EditExercise;
  onChange: (exercise: EditExercise) => void;
  onRemove: () => void;
};

const decimal = (v: string) => v.replace(',', '.');
const whole = (v: string) => v.replace(/\D/g, '');

export function PlanExerciseEditor({ exercise, onChange, onRemove }: Props) {
  const theme = useTheme();
  const set = (patch: Partial<EditExercise>) => onChange({ ...exercise, ...patch });

  const updateSet = (index: number, patch: Partial<EditSet>) =>
    set({ sets: exercise.sets.map((s, i) => (i === index ? { ...s, ...patch } : s)) });

  const addSet = () => {
    const last = exercise.sets.at(-1);
    set({ sets: [...exercise.sets, { weight: last?.weight ?? '20', reps: last?.reps ?? '5' }] });
  };

  const deloads = Number(exercise.deloadAfter) > 0;

  return (
    <Card>
      <View style={styles.row}>
        <ThemedText style={{ flex: 1, fontWeight: 700, fontSize: 18 }}>{exercise.name}</ThemedText>
        <Pressable onPress={onRemove} hitSlop={10} accessibilityLabel={`Remove ${exercise.name}`}>
          <ThemedText themeColor="textSecondary" style={{ fontSize: 20 }}>
            ×
          </ThemedText>
        </Pressable>
      </View>

      {exercise.misses > 0 && (
        <ThemedText type="small" style={{ color: theme.danger }}>
          Missed {exercise.misses}× in a row (saving resets this)
        </ThemedText>
      )}

      <View style={styles.row}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.setCol}>
          Set
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.inputCol}>
          kg
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.inputCol}>
          Reps
        </ThemedText>
        <View style={styles.removeCol} />
      </View>
      {exercise.sets.map((s, i) => (
        <View key={i} style={styles.row}>
          <ThemedText themeColor="textSecondary" style={styles.setCol}>
            {i + 1}
          </ThemedText>
          <NumberInput
            value={s.weight}
            onChangeText={(v) => updateSet(i, { weight: decimal(v) })}
            keyboardType="decimal-pad"
            accessibilityLabel={`Set ${i + 1} target weight`}
            style={styles.inputCol}
          />
          <NumberInput
            value={s.reps}
            onChangeText={(v) => updateSet(i, { reps: whole(v) })}
            keyboardType="number-pad"
            accessibilityLabel={`Set ${i + 1} target reps`}
            style={styles.inputCol}
          />
          <Pressable
            onPress={() => set({ sets: exercise.sets.filter((_, j) => j !== i) })}
            disabled={exercise.sets.length === 1}
            hitSlop={6}
            accessibilityLabel={`Remove set ${i + 1}`}
            style={[styles.removeCol, { opacity: exercise.sets.length === 1 ? 0.3 : 1 }]}>
            <ThemedText themeColor="textSecondary" style={{ fontSize: 22, textAlign: 'center' }}>
              −
            </ThemedText>
          </Pressable>
        </View>
      ))}
      <Pressable onPress={addSet} style={styles.link} accessibilityRole="button">
        <ThemedText type="smallBold" style={{ color: theme.accent }}>
          + Add set
        </ThemedText>
      </Pressable>

      <View style={[styles.divider, { backgroundColor: theme.backgroundSelected }]} />
      <ThemedText type="smallBold" themeColor="textSecondary">
        When all sets are hit
      </ThemedText>
      <View style={styles.row}>
        <Rule label="+ kg" value={exercise.weightIncrement} onChange={(v) => set({ weightIncrement: decimal(v) })} decimalPad />
        <Rule label="+ reps" value={exercise.repsIncrement} onChange={(v) => set({ repsIncrement: whole(v) })} />
      </View>
      <ThemedText type="smallBold" themeColor="textSecondary">
        Deload
      </ThemedText>
      <View style={styles.row}>
        <Rule label="after misses" value={exercise.deloadAfter} onChange={(v) => set({ deloadAfter: whole(v) })} />
        <Rule
          label="by %"
          value={exercise.deloadPercent}
          onChange={(v) => set({ deloadPercent: decimal(v) })}
          decimalPad
          disabled={!deloads}
        />
      </View>
      {!deloads && (
        <ThemedText type="small" themeColor="textSecondary">
          0 misses = never deload
        </ThemedText>
      )}
    </Card>
  );
}

function NumberInput({ style, ...rest }: TextInputProps) {
  const theme = useTheme();
  return (
    <TextInput
      selectTextOnFocus
      style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundSelected }, style]}
      {...rest}
    />
  );
}

function Rule({
  label,
  value,
  onChange,
  decimalPad,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  decimalPad?: boolean;
  disabled?: boolean;
}) {
  return (
    <View style={[styles.rule, disabled && { opacity: 0.4 }]}>
      <NumberInput
        value={value}
        onChangeText={onChange}
        editable={!disabled}
        keyboardType={decimalPad ? 'decimal-pad' : 'number-pad'}
        accessibilityLabel={label}
        style={styles.ruleInput}
      />
      <ThemedText type="small" themeColor="textSecondary" style={{ flex: 1 }}>
        {label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  setCol: {
    width: 32,
    textAlign: 'center',
  },
  inputCol: {
    flex: 1,
  },
  removeCol: {
    width: 32,
  },
  input: {
    height: 40,
    borderRadius: 10,
    fontSize: 17,
    fontWeight: 600,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  link: {
    alignSelf: 'flex-start',
    paddingVertical: Spacing.one,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: Spacing.one,
  },
  rule: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  ruleInput: {
    width: 64,
  },
});
