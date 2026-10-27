import { StyleSheet, View } from 'react-native';

import type { PlannedSession, VerdictStatus } from '@/api/types';
import { ThemedText } from '@/components/themed-text';
import { Spacing, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ACTIVITY_ICONS, formatDistance, formatDuration, formatPace } from '@/workout/format';

const VERDICT_LABELS: Record<VerdictStatus, string> = {
  met: 'Met',
  partial: 'Partly met',
  missed: 'Missed',
  pending: 'To do',
};

const VERDICT_COLORS: Record<VerdictStatus, ThemeColor> = {
  met: 'success',
  partial: 'warning',
  missed: 'danger',
  pending: 'textSecondary',
};

/** A small coloured label for how a session went. */
export function VerdictBadge({ status }: { status: VerdictStatus }) {
  const theme = useTheme();
  return (
    <ThemedText type="smallBold" style={{ color: theme[VERDICT_COLORS[status]] }}>
      {VERDICT_LABELS[status]}
    </ThemedText>
  );
}

/**
 * A planned session: what to do, and once done what was done, how it went
 * and each check against the target, with a warning on one passed by doing
 * more than planned. `compact` leaves out the checks.
 */
export function SessionDetails({ session: s, compact }: { session: PlannedSession; compact?: boolean }) {
  const theme = useTheme();
  const status = s.verdict?.status ?? 'pending';
  const w = s.workout;
  return (
    <View style={{ gap: 2 }}>
      <View style={styles.row}>
        <ThemedText style={{ flex: 1, fontWeight: 600 }}>
          {ACTIVITY_ICONS[s.activity]} {s.description}
        </ThemedText>
        <VerdictBadge status={status} />
      </View>
      {w && (
        <ThemedText type="small" themeColor="textSecondary">
          Done:{' '}
          {[
            w.distance_m ? formatDistance(w.distance_m, w.activity) : null,
            formatDuration(w.duration_seconds),
            formatPace(w.activity, w.distance_m, w.duration_seconds),
            w.avg_heart_rate ? `${w.avg_heart_rate} bpm` : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </ThemedText>
      )}
      {!compact &&
        s.verdict?.checks.map((c) => (
          <ThemedText key={c.name} type="small" style={{ color: c.ok ? theme.textSecondary : theme.warning }}>
            {c.ok ? '✓' : '✗'} {c.name} {c.actual} (target {c.target})
          </ThemedText>
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
});
