import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { EditExercise } from '@/plans/edit-model';

type Props = {
  exercise: EditExercise;
  onChange: (exercise: EditExercise) => void;
  onRemove: () => void;
};

const whole = (v: string) => v.replace(/\D/g, '');

export function PlanExerciseEditor({ exercise, onChange, onRemove }: Props) {
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

      <View style={styles.row}>
        <NumberInput
          value={exercise.sets}
          onChangeText={(v) => onChange({ ...exercise, sets: whole(v) })}
          accessibilityLabel={`${exercise.name} sets`}
        />
        <ThemedText themeColor="textSecondary">sets ×</ThemedText>
        <NumberInput
          value={exercise.reps}
          onChangeText={(v) => onChange({ ...exercise, reps: whole(v) })}
          accessibilityLabel={`${exercise.name} reps`}
        />
        <ThemedText themeColor="textSecondary">reps</ThemedText>
      </View>
    </Card>
  );
}

function NumberInput({ style, ...rest }: TextInputProps) {
  const theme = useTheme();
  return (
    <TextInput
      selectTextOnFocus
      keyboardType="number-pad"
      style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundSelected }, style]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  input: {
    width: 56,
    height: 40,
    borderRadius: 10,
    fontSize: 17,
    fontWeight: 600,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
});
