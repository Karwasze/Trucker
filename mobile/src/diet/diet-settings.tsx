import { useState } from 'react';
import { Alert, StyleSheet, Switch, TextInput, View } from 'react-native';

import type { DietSettings } from '@/api/types';
import { ThemedText } from '@/components/themed-text';
import { Button, Card } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { parseGrams } from '@/diet/grams';
import { useDietReminder } from '@/diet/reminder-context';
import { formatReminderTime, REMINDER_STEP_MIN, stepReminderTime } from '@/diet/reminder-model';
import { useTheme } from '@/hooks/use-theme';
import { useSettings } from '@/settings/settings-context';

/** The daily protein target, kept on the server, and this device's evening check-in. */
export function DietSettingsCard({ settings, onSaved }: { settings: DietSettings; onSaved: () => void }) {
  const theme = useTheme();
  const { api } = useSettings();
  const reminder = useDietReminder();
  const saved = settings.protein_target_g;
  const [text, setText] = useState(saved === null ? '' : String(saved));
  const grams = parseGrams(text);
  const invalid = Number.isNaN(grams);

  const saveTarget = async () => {
    const target = grams ?? null;
    if (invalid || target === saved) return;
    try {
      await api.saveDietSettings({ protein_target_g: target });
      onSaved();
    } catch (e) {
      Alert.alert("Couldn't save protein target", (e as Error).message);
    }
  };

  return (
    <Card>
      <View style={styles.row}>
        <ThemedText style={{ flex: 1 }}>Daily protein target</ThemedText>
        <TextInput
          value={text}
          onChangeText={setText}
          onBlur={saveTarget}
          onSubmitEditing={saveTarget}
          placeholder="g"
          placeholderTextColor={theme.textSecondary}
          keyboardType="decimal-pad"
          returnKeyType="done"
          accessibilityLabel="Daily protein target in grams"
          style={[
            styles.input,
            { color: theme.text, backgroundColor: theme.backgroundSelected },
            invalid && { borderWidth: 1, borderColor: theme.danger },
          ]}
        />
      </View>
      {invalid && (
        <ThemedText type="small" style={{ color: theme.danger }}>
          Enter grams of protein, e.g. 160, or leave it empty.
        </ThemedText>
      )}
      <View style={styles.row}>
        <ThemedText style={{ flex: 1 }}>Evening check-in</ThemedText>
        <Switch value={reminder.enabled} onValueChange={reminder.setEnabled} accessibilityLabel="Evening check-in" />
      </View>
      {reminder.enabled && (
        <View style={styles.row}>
          <ThemedText style={{ flex: 1 }}>At</ThemedText>
          <Button
            title="−"
            variant="secondary"
            compact
            onPress={() => reminder.setMinutes(stepReminderTime(reminder.minutes, -1))}
            accessibilityLabel={`${REMINDER_STEP_MIN} minutes earlier`}
          />
          <ThemedText style={styles.time}>{formatReminderTime(reminder.minutes)}</ThemedText>
          <Button
            title="+"
            variant="secondary"
            compact
            onPress={() => reminder.setMinutes(stepReminderTime(reminder.minutes, 1))}
            accessibilityLabel={`${REMINDER_STEP_MIN} minutes later`}
          />
        </View>
      )}
      <ThemedText type="small" themeColor="textSecondary">
        {reminder.enabled
          ? 'Asks whether you stuck to your diet, unless today is already logged. Answer from the notification.'
          : 'A notification each evening asking whether you stuck to your diet.'}
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
  time: {
    minWidth: 64,
    textAlign: 'center',
    fontSize: 20,
    fontWeight: 600,
    fontVariant: ['tabular-nums'],
  },
});
