import { StyleSheet, View } from 'react-native';

import type { Triathlon } from '@/api/types';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { SplitBar } from '@/triathlon/split-bar';
import { TRIATHLON_LEGS, triathlonName } from '@/triathlon/triathlon';
import { ACTIVITY_ICONS, formatDate, formatDuration } from '@/workout/format';

/** A triathlon's date, class, total and leg times, for cards and lists. */
export function TriathlonOverview({ triathlon: t }: { triathlon: Triathlon }) {
  return (
    <View style={{ flex: 1, gap: Spacing.one }}>
      <View style={styles.row}>
        <ThemedText style={{ fontWeight: 700, flex: 1 }}>{formatDate(t.date)}</ThemedText>
        {t.pr && (
          <ThemedText type="smallBold" themeColor="success">
            PR
          </ThemedText>
        )}
        <ThemedText type="smallBold">{formatDuration(t.total_seconds)}</ThemedText>
      </View>
      <ThemedText type="small">
        {TRIATHLON_LEGS.map((l) => ACTIVITY_ICONS[l.activity]).join('')} {triathlonName(t)}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {TRIATHLON_LEGS.map((l) => `${ACTIVITY_ICONS[l.activity]} ${formatDuration(t[l.key].duration_seconds)}`).join(
          ' · '
        )}
      </ThemedText>
      <SplitBar triathlon={t} />
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
