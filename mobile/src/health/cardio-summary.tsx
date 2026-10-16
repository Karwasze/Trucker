import { StyleSheet, View } from 'react-native';

import type { NewCardioWorkout } from '@/api/types';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import {
  ACTIVITY_ICONS,
  ACTIVITY_NAMES,
  formatDate,
  formatDistance,
  formatDuration,
  formatPace,
  formatTime,
} from '@/workout/format';

/** A cardio workout's date, activity and headline numbers, for cards and lists. */
export function CardioSummary({ workout: w }: { workout: NewCardioWorkout }) {
  const stats = [
    w.distance_m ? formatDistance(w.distance_m, w.activity) : null,
    formatDuration(w.duration_seconds),
    formatPace(w.activity, w.distance_m, w.duration_seconds),
    w.avg_heart_rate ? `${w.avg_heart_rate} bpm` : null,
  ].filter(Boolean);
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <View style={styles.row}>
        <ThemedText style={{ fontWeight: 700, flex: 1 }}>{formatDate(w.date)}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {formatTime(w.started_at)}
        </ThemedText>
      </View>
      <ThemedText type="small">
        {ACTIVITY_ICONS[w.activity]} {ACTIVITY_NAMES[w.activity]}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {stats.join(' · ')}
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
});
