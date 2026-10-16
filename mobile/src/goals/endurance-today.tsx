import { View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card, SectionLabel } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { SessionDetails } from '@/goals/session-card';
import { useHealthState } from '@/health/health-state';
import { useQuery } from '@/hooks/use-query';
import { useSettings } from '@/settings/settings-context';

/**
 * Today's sessions of the active goal and how they went. `waiting` is set
 * when a workout from that day can be imported, from the banner on Today.
 * Renders nothing without a goal or sessions.
 */
export function EnduranceToday({ date, waiting }: { date: string; waiting: boolean }) {
  const { api, serverUrl } = useSettings();
  const { state } = useHealthState();
  const today = useQuery(`goal-today:${serverUrl}:${date}`, () => api.goalToday(date));
  const sessions = today.data?.sessions ?? [];
  if (sessions.length === 0) return null;

  const open = sessions.filter((s) => !s.workout);

  return (
    <View style={{ gap: Spacing.two }}>
      <SectionLabel>{today.data?.goal?.name ?? 'Endurance'}</SectionLabel>
      <Card>
        {sessions.map((s) => (
          <SessionDetails key={s.id} session={s} />
        ))}
        {open.length > 0 &&
          (!state.connectedAt ? (
            <ThemedText type="small" themeColor="textSecondary">
              Connect Apple Health in Settings to fill this in from your watch.
            </ThemedText>
          ) : waiting ? (
            <ThemedText type="small" themeColor="textSecondary">
              Import today&apos;s workout from the Apple Health card above to fill this in.
            </ThemedText>
          ) : (
            <ThemedText type="small" themeColor="textSecondary">
              Waiting for Apple Health. Record it on your watch and it shows up here to import.
            </ThemedText>
          ))}
      </Card>
    </View>
  );
}
