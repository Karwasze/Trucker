import { useState } from 'react';
import { Alert, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { parseGrams } from '@/diet/grams';
import { useQuery } from '@/hooks/use-query';
import { useTheme } from '@/hooks/use-theme';
import { useSettings } from '@/settings/settings-context';

/**
 * The bodyweight the diet aims for, which Insights projects against. Saved
 * when the field is left; emptied, it clears the target.
 */
export function TargetWeightCard() {
  const { api, serverUrl } = useSettings();
  const target = useQuery(`diet-target:${serverUrl}`, () => api.dietTarget());
  if (target.data === undefined) return null;
  // Keyed so the field starts from what's saved.
  return <TargetInput key={String(target.data)} saved={target.data} onSaved={target.refresh} />;
}

function TargetInput({ saved, onSaved }: { saved: number | null; onSaved: () => void }) {
  const { api } = useSettings();
  const theme = useTheme();
  const [text, setText] = useState(saved === null ? '' : String(saved));
  // Positive decimals with a dot or comma, as for grams.
  const kg = parseGrams(text);
  const invalid = Number.isNaN(kg);

  const save = async () => {
    const next = kg ?? null;
    if (invalid || next === saved) return;
    try {
      await api.setDietTarget(next);
      onSaved();
    } catch (e) {
      Alert.alert("Couldn't save target weight", (e as Error).message);
    }
  };

  return (
    <Card>
      <View style={styles.row}>
        <ThemedText style={{ flex: 1 }}>Target weight</ThemedText>
        <TextInput
          value={text}
          onChangeText={setText}
          onBlur={save}
          onSubmitEditing={save}
          placeholder="kg"
          placeholderTextColor={theme.textSecondary}
          keyboardType="decimal-pad"
          returnKeyType="done"
          accessibilityLabel="Target weight in kg"
          style={[
            styles.input,
            { color: theme.text, backgroundColor: theme.backgroundSelected },
            invalid && { borderWidth: 1, borderColor: theme.danger },
          ]}
        />
      </View>
      <ThemedText type="small" style={{ color: invalid ? theme.danger : theme.textSecondary }}>
        {invalid
          ? 'Enter a weight in kg, e.g. 78.5.'
          : 'Insights → Bodyweight projects when you’ll reach it. Leave empty for none.'}
      </ThemedText>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  input: {
    width: 96,
    height: 40,
    borderRadius: 10,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
    textAlign: 'right',
  },
});
