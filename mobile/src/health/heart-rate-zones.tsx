import { StyleSheet, View } from 'react-native';

import type { CardioSample } from '@/api/types';
import { ThemedText } from '@/components/themed-text';
import { Card, SectionLabel } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useHeartRateZones, type HeartRateZones } from '@/health/health-state';
import { formatZoneRange, timeInZones } from '@/health/zones';
import { useTheme } from '@/hooks/use-theme';
import { formatDuration } from '@/workout/format';

/** The color of each zone, easiest first. */
function useZoneColors(): string[] {
  const theme = useTheme();
  return [theme.textSecondary, theme.accent, theme.success, theme.warning, theme.danger];
}

const missingText = (z: HeartRateZones) =>
  'missing' in z ? `Add your ${z.missing.join(' and ')} to Apple Health to see your heart rate zones.` : '';

/** The time a workout spent in each heart rate zone, when Health has the zones and the workout heart rate. */
export function WorkoutZones({ samples }: { samples?: CardioSample[] }) {
  const { data } = useHeartRateZones();
  const colors = useZoneColors();
  if (!data || !samples?.some((s) => s.hr !== undefined)) return null;
  if (!('zones' in data)) {
    return (
      <Card>
        <ThemedText type="smallBold">Heart rate zones</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {missingText(data)}
        </ThemedText>
      </Card>
    );
  }
  const seconds = timeInZones(samples, data.zones);
  const total = seconds.reduce((a, b) => a + b, 0);
  return (
    <Card>
      <ThemedText type="smallBold">Heart rate zones</ThemedText>
      {data.zones.map((z, i) => (
        <View key={z.zone} style={styles.row} accessibilityLabel={`Zone ${z.zone}, ${formatDuration(seconds[i])}`}>
          <ThemedText type="small" style={styles.zone}>
            Zone {z.zone}
          </ThemedText>
          <View style={styles.track}>
            <View style={[styles.fill, { flex: seconds[i], backgroundColor: colors[i] }]} />
            <View style={{ flex: total - seconds[i] }} />
          </View>
          <ThemedText type="small" style={styles.time}>
            {formatDuration(seconds[i])}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.share}>
            {total > 0 ? `${Math.round((seconds[i] / total) * 100)}%` : '–'}
          </ThemedText>
        </View>
      ))}
    </Card>
  );
}

/** The lifter's heart rate zones and what they're worked out from, while Health is connected. */
export function ZoneRanges() {
  const { data, error } = useHeartRateZones();
  if (!data && !error) return null;
  return (
    <>
      <SectionLabel>Heart rate zones</SectionLabel>
      <ZoneRangesCard data={data} error={error} />
    </>
  );
}

function ZoneRangesCard({ data, error }: { data?: HeartRateZones; error: string | null }) {
  const colors = useZoneColors();
  if (!data) {
    return (
      <Card>
        <ThemedText type="small" themeColor="textSecondary">
          Couldn&apos;t read your heart rate zones: {error}
        </ThemedText>
      </Card>
    );
  }
  if (!('zones' in data)) {
    return (
      <Card>
        <ThemedText type="small" themeColor="textSecondary">
          {missingText(data)}
        </ThemedText>
      </Card>
    );
  }
  return (
    <Card>
      {data.zones.map((z, i) => (
        <View key={z.zone} style={styles.row}>
          <View style={[styles.dot, { backgroundColor: colors[i] }]} />
          <ThemedText style={{ flex: 1 }}>Zone {z.zone}</ThemedText>
          <ThemedText style={{ fontWeight: 600, fontVariant: ['tabular-nums'] }}>{formatZoneRange(z)}</ThemedText>
        </View>
      ))}
      <ThemedText type="small" themeColor="textSecondary">
        From your max heart rate of {data.max} bpm (by age) and resting heart rate of {data.resting} bpm in Apple
        Health, as Apple Watch works out its zones. If you set zones on the watch by hand, they may differ.
      </ThemedText>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: 2,
  },
  zone: { width: 56 },
  track: { flex: 1, flexDirection: 'row', height: 8 },
  fill: { borderRadius: 4 },
  time: { width: 56, textAlign: 'right', fontVariant: ['tabular-nums'] },
  share: { width: 40, textAlign: 'right', fontVariant: ['tabular-nums'] },
  dot: { width: 10, height: 10, borderRadius: 5 },
});
