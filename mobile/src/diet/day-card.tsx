import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import type { DietDay } from '@/api/types';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Chip } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { formatGrams, parseGrams } from '@/diet/grams';
import { useTheme } from '@/hooks/use-theme';
import { formatDate } from '@/workout/format';

/**
 * Asks whether a day's diet was kept to and, once answered, the protein
 * eaten, compared with the target if one is set.
 */
export function DayCard({
  date,
  today,
  day,
  targetG,
  saving,
  onSave,
  onClear,
}: {
  date: string;
  today: string;
  day: DietDay | undefined;
  targetG: number | null;
  saving: boolean;
  onSave: (day: DietDay) => void;
  onClear: () => void;
}) {
  const answer = (adhered: boolean) => onSave({ ...day, date, adhered });
  return (
    <Card>
      <ThemedText type="smallBold">
        {date === today ? 'Today' : formatDate(date, { weekday: 'long', day: 'numeric', month: 'long' })}
      </ThemedText>
      <ThemedText>Did you stick to your diet?</ThemedText>
      <View style={styles.row}>
        <Chip label="Yes" selected={day?.adhered === true} inCard onPress={() => answer(true)} />
        <Chip label="No" selected={day?.adhered === false} inCard onPress={() => answer(false)} />
      </View>
      {day ? (
        <>
          {/* Keyed so the input starts from what's saved, for each day. */}
          <ProteinInput key={`${date}:${day.protein_g}`} day={day} targetG={targetG} onSave={onSave} />
          <View style={styles.row}>
            <Button title="Clear day" variant="secondary" compact loading={saving} onPress={onClear} />
          </View>
        </>
      ) : (
        <ThemedText type="small" themeColor="textSecondary">
          {date === today ? 'Not logged yet.' : 'Not logged.'}
        </ThemedText>
      )}
    </Card>
  );
}

function ProteinInput({
  day,
  targetG,
  onSave,
}: {
  day: DietDay;
  targetG: number | null;
  onSave: (day: DietDay) => void;
}) {
  const theme = useTheme();
  const [text, setText] = useState(day.protein_g === undefined ? '' : String(day.protein_g));
  const grams = parseGrams(text);
  const invalid = Number.isNaN(grams);

  const save = () => {
    if (invalid || grams === day.protein_g) return;
    onSave({ ...day, protein_g: grams });
  };

  const saved = day.protein_g;
  const hint =
    targetG === null
      ? 'Optional. Set a daily target below.'
      : saved === undefined
        ? `Target ${formatGrams(targetG)}`
        : saved >= targetG
          ? `Target ${formatGrams(targetG)} reached ✓`
          : `${formatGrams(targetG - saved)} short of ${formatGrams(targetG)}`;

  return (
    <View style={styles.protein}>
      <View style={styles.row}>
        <ThemedText style={{ flex: 1 }}>Protein</ThemedText>
        <TextInput
          value={text}
          onChangeText={setText}
          onBlur={save}
          onSubmitEditing={save}
          placeholder="g"
          placeholderTextColor={theme.textSecondary}
          keyboardType="decimal-pad"
          returnKeyType="done"
          accessibilityLabel="Protein in grams"
          style={[
            styles.input,
            { color: theme.text, backgroundColor: theme.backgroundSelected },
            invalid && { borderWidth: 1, borderColor: theme.danger },
          ]}
        />
      </View>
      <ThemedText
        type="small"
        style={{
          color: invalid
            ? theme.danger
            : saved !== undefined && targetG !== null && saved >= targetG
              ? theme.success
              : theme.textSecondary,
        }}>
        {invalid ? 'Enter grams of protein, e.g. 150.' : hint}
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
  protein: {
    gap: Spacing.one,
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
