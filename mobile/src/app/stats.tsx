import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import type { StatisticsData } from '@/api/types';
import { ThemedText } from '@/components/themed-text';
import { Card, Chip, Message, Screen, SectionLabel } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useQuery } from '@/hooks/use-query';
import { useTheme } from '@/hooks/use-theme';
import { useSettings } from '@/settings/settings-context';
import { formatDate, formatKg } from '@/workout/format';

const CHART_SESSIONS = 12;
const CHART_HEIGHT = 140;

export default function StatsScreen() {
  const { api, serverUrl } = useSettings();
  const [selected, setSelected] = useState<string | null>(null);
  const names = useQuery(`stats:${serverUrl}`, async () => (await api.statistics()).exercises);

  const exercises = names.data ?? [];
  const exercise = selected && exercises.includes(selected) ? selected : (exercises[0] ?? null);
  const series = useQuery(exercise === null ? null : `stats:${serverUrl}:${exercise}`, async () =>
    (await api.statistics(exercise!)).data.sort((a, b) => a.date.localeCompare(b.date))
  );

  return (
    <Screen
      title="Progress"
      refreshing={names.refreshing}
      onRefresh={() => {
        names.refresh();
        series.refresh();
      }}>
      {!names.data ? (
        <Message loading={!names.error} error={names.error} />
      ) : exercises.length === 0 ? (
        <Message>Log a workout to see your progress.</Message>
      ) : (
        <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}
            style={styles.chipScroller}>
            {exercises.map((name) => (
              <Chip key={name} label={name} selected={name === exercise} onPress={() => setSelected(name)} />
            ))}
          </ScrollView>
          {!series.data || series.data.length === 0 ? (
            <Message loading={!series.error} error={series.error} />
          ) : (
            <ExerciseStats data={series.data} />
          )}
        </>
      )}
    </Screen>
  );
}

function ExerciseStats({ data }: { data: StatisticsData[] }) {
  const latest = data.at(-1)!;
  const best = Math.max(...data.map((d) => d.estimated_1rm));
  const first = data[0].estimated_1rm;
  const change = latest.estimated_1rm - first;

  return (
    <>
      <View style={styles.tiles}>
        <Tile label="Est. 1RM" value={`${latest.estimated_1rm.toFixed(1)} kg`} />
        <Tile label="Best" value={`${best.toFixed(1)} kg`} />
        <Tile
          label={`Since ${formatDate(data[0].date, { month: 'short', day: 'numeric' })}`}
          value={`${change >= 0 ? '+' : ''}${change.toFixed(1)} kg`}
        />
      </View>

      <Card>
        <ThemedText type="smallBold">Estimated 1RM</ThemedText>
        <BarChart data={data.slice(-CHART_SESSIONS)} />
      </Card>

      <SectionLabel>Sessions</SectionLabel>
      <Card>
        {[...data].reverse().map((d) => (
          <View key={d.date} style={styles.sessionRow}>
            <ThemedText style={{ flex: 1 }}>{formatDate(d.date)}</ThemedText>
            <ThemedText style={styles.num}>{d.estimated_1rm.toFixed(1)} kg</ThemedText>
            <ThemedText themeColor="textSecondary" style={[styles.num, { width: 90 }]}>
              {formatKg(d.total_volume)}
            </ThemedText>
          </View>
        ))}
      </Card>
    </>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <Card style={styles.tile}>
      <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
        {label}
      </ThemedText>
      <ThemedText style={[styles.num, { fontSize: 20, fontWeight: 700 }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </ThemedText>
    </Card>
  );
}

function BarChart({ data }: { data: StatisticsData[] }) {
  const theme = useTheme();
  const values = data.map((d) => d.estimated_1rm);
  const max = Math.max(...values);
  // Start the axis below the lowest value so changes are visible.
  const min = Math.max(0, Math.min(...values) * 0.8);
  const span = max - min || 1;

  return (
    <View>
      <View style={[styles.bars, { height: CHART_HEIGHT }]}>
        {data.map((d, i) => (
          <View
            key={d.date}
            accessibilityLabel={`${formatDate(d.date)}: ${d.estimated_1rm.toFixed(1)} kg`}
            style={[
              styles.bar,
              {
                height: Math.max(4, ((d.estimated_1rm - min) / span) * CHART_HEIGHT),
                backgroundColor: i === data.length - 1 ? theme.accent : theme.backgroundSelected,
              },
            ]}
          />
        ))}
      </View>
      <View style={styles.axis}>
        <ThemedText type="small" themeColor="textSecondary">
          {formatDate(data[0].date, { month: 'short', day: 'numeric' })}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {formatDate(data.at(-1)!.date, { month: 'short', day: 'numeric' })}
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chipScroller: {
    marginHorizontal: -Spacing.three,
    flexGrow: 0,
  },
  chips: {
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  tiles: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  tile: {
    flex: 1,
    gap: Spacing.one,
    padding: Spacing.three,
  },
  bars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.one,
  },
  bar: {
    flex: 1,
    borderRadius: 4,
  },
  axis: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Spacing.one,
  },
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  num: {
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
});
