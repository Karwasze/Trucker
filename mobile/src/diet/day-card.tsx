import { StyleSheet, View } from 'react-native';

import type { DietDay } from '@/api/types';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Chip } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { formatDate } from '@/workout/format';

/** Asks whether a day's diet was kept to, and once answered offers to clear it. */
export function DayCard({
  date,
  today,
  day,
  saving,
  onSave,
  onClear,
}: {
  date: string;
  today: string;
  day: DietDay | undefined;
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
        <View style={styles.row}>
          <Button title="Clear day" variant="secondary" compact loading={saving} onPress={onClear} />
        </View>
      ) : (
        <ThemedText type="small" themeColor="textSecondary">
          {date === today ? 'Not logged yet.' : 'Not logged.'}
        </ThemedText>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
});
