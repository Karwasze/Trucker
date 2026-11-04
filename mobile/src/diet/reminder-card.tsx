import { StyleSheet, Switch, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useDietReminder } from '@/diet/reminder-context';
import { formatReminderTime, REMINDER_STEP_MIN, stepReminderTime } from '@/diet/reminder-model';

/** This device's evening check-in, asking whether the diet was kept to. */
export function DietReminderCard() {
  const reminder = useDietReminder();
  return (
    <Card>
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
  time: {
    minWidth: 64,
    textAlign: 'center',
    fontSize: 20,
    fontWeight: 600,
    fontVariant: ['tabular-nums'],
  },
});
