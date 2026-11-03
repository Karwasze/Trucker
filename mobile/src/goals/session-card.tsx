import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

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
 * A session's description split into its name, like "Easy run 8 km", and
 * the target after it, like " · zone 2", which starts at the first " · ",
 * ": ", " in zone" or " @ ". Sessions planned before zones were described
 * as "130–145 bpm", @ before intervals' and tempo's. A description without
 * a zone or bpm is all name.
 */
export function splitDescription(description: string) {
  const at = description.search(/ · |: | in zone| @ /);
  if (at < 0 || !/zone|bpm/.test(description.slice(at))) return { name: description, details: '' };
  return { name: description.slice(0, at), details: description.slice(at) };
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
  const { name, details } = splitDescription(s.description);
  return (
    <View style={{ gap: 2 }}>
      <View style={styles.row}>
        <ThemedText style={{ flex: 1, fontWeight: 600 }}>
          {ACTIVITY_ICONS[s.activity]} {name}
          {details && (
            <ThemedText themeColor="textSecondary" style={{ fontWeight: 400 }}>
              {details}
            </ThemedText>
          )}
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

/**
 * A planned session, opening the workout that filled it once done, at
 * `pathname` in the tab it is shown in, so going back returns there.
 */
export function SessionLink({
  session,
  compact,
  pathname,
}: {
  session: PlannedSession;
  compact?: boolean;
  pathname: '/cardio/[id]' | '/week/cardio/[id]';
}) {
  const id = session.cardio_workout_id;
  if (!id) return <SessionDetails session={session} compact={compact} />;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${session.description}, done`}
      onPress={() => router.push({ pathname, params: { id } })}
      style={({ pressed }) => pressed && styles.pressed}>
      <SessionDetails session={session} compact={compact} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  pressed: {
    opacity: 0.6,
  },
});
