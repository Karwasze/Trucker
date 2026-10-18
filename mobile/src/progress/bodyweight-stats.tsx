import { useState } from 'react';
import { Alert, StyleSheet, TextInput, View } from 'react-native';

import { localDate } from '@/api/client';
import type { BodyweightEntry } from '@/api/types';
import { LineChart } from '@/components/line-chart';
import { ThemedText } from '@/components/themed-text';
import { TimespanControl, timespanStart, type Timespan } from '@/components/timespan';
import { Button, Card, Message } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { Tile, TileRow } from '@/progress/tile';
import { useSettings } from '@/settings/settings-context';
import { formatDate } from '@/workout/format';

const formatNumber = (n: number) => String(Math.round(n * 10) / 10);

/** Bodyweight log and chart, shown as a series on the Progress tab. `history` is sorted by date. */
export function BodyweightStats({
  history: all,
  timespan,
  onTimespanChange,
  onSaved,
}: {
  history: BodyweightEntry[];
  timespan: Timespan;
  onTimespanChange: (timespan: Timespan) => void;
  onSaved: () => void;
}) {
  const start = timespanStart(timespan);
  const history = start ? all.filter((e) => e.date >= start) : all;
  const latest = history.at(-1);
  const change = latest ? latest.weight - history[0].weight : 0;

  return (
    <>
      <WeighIn latest={all.at(-1)} onSaved={onSaved} />
      {all.length === 0 ? (
        <Message>Add your bodyweight to track it over time.</Message>
      ) : (
        <>
          {latest && (
            <TileRow>
              <Tile label="Current" value={`${formatNumber(latest.weight)} kg`} />
              <Tile
                label={`Since ${formatDate(history[0].date, { month: 'short', day: 'numeric' })}`}
                value={`${change >= 0 ? '+' : ''}${formatNumber(change)} kg`}
              />
            </TileRow>
          )}
          <Card>
            <ThemedText type="smallBold">Bodyweight</ThemedText>
            <TimespanControl value={timespan} onChange={onTimespanChange} />
            {!latest ? (
              <Message>No weigh-ins in the last {timespan.label}.</Message>
            ) : (
              <LineChart
                points={history.map((e) => ({ date: e.date, value: e.weight }))}
                from={start ?? history[0].date}
                to={localDate()}
                unit="kg"
              />
            )}
          </Card>
        </>
      )}
    </>
  );
}

function WeighIn({ latest, onSaved }: { latest: BodyweightEntry | undefined; onSaved: () => void }) {
  const theme = useTheme();
  const { api } = useSettings();
  const [input, setInput] = useState('');
  const [saving, setSaving] = useState(false);
  const today = localDate();
  const weight = Number(input.replace(',', '.'));
  const valid = input.trim() !== '' && Number.isFinite(weight) && weight > 0;

  const save = async () => {
    if (!valid) return;
    setSaving(true);
    try {
      await api.saveBodyweight({ date: today, weight });
      setInput('');
      onSaved();
    } catch (e) {
      Alert.alert("Couldn't save bodyweight", (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <View style={styles.row}>
        <TextInput
          value={input}
          onChangeText={setInput}
          onSubmitEditing={save}
          placeholder={latest?.date === today ? `Today: ${formatNumber(latest.weight)} kg` : "Today's weight (kg)"}
          placeholderTextColor={theme.textSecondary}
          keyboardType="decimal-pad"
          returnKeyType="done"
          accessibilityLabel="Today's bodyweight in kilograms"
          style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundSelected }]}
        />
        <Button title="Save" compact disabled={!valid} loading={saving} onPress={save} />
      </View>
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
    flex: 1,
    height: 36,
    borderRadius: 10,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
  },
});
