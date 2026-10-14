import { StyleSheet, View } from 'react-native';

import { localDate } from '@/api/client';
import type { Insights, StrengthLevel } from '@/api/types';
import { ThemedText } from '@/components/themed-text';
import { Card, Message, Screen, SectionLabel } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useQuery } from '@/hooks/use-query';
import { SettingsButton } from '@/settings/settings-button';
import { useSettings } from '@/settings/settings-context';

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const formatNumber = (n: number) => String(Math.round(n * 10) / 10);

/** Training analysis, shown on the Insights tab. Charts live on the Progress tab. */
export function InsightsView() {
  const { api, serverUrl } = useSettings();
  const today = localDate();
  const insights = useQuery(`insights:${serverUrl}:${today}`, () => api.insights(today));

  return (
    <Screen
      title="Insights"
      subtitle="Strength levels and lifts that need attention"
      action={<SettingsButton />}
      refreshing={insights.refreshing}
      onRefresh={insights.refresh}>
      {!insights.data ? (
        <Message loading={!insights.error} error={insights.error} />
      ) : (
        <InsightsContent data={insights.data} />
      )}
    </Screen>
  );
}

function InsightsContent({ data }: { data: Insights }) {
  return (
    <>
      <SectionLabel>Strength</SectionLabel>
      <Card>
        {!data.bodyweight ? (
          <ThemedText type="small" themeColor="textSecondary">
            Log your bodyweight on the Progress tab to see how strong your lifts are for your size.
          </ThemedText>
        ) : data.strength.length === 0 ? (
          <ThemedText type="small" themeColor="textSecondary">
            Log a squat, bench press, deadlift or overhead press to see your strength level.
          </ThemedText>
        ) : (
          data.strength.map((s) => <StrengthRow key={s.exercise} level={s} />)
        )}
      </Card>

      {data.stalled.length > 0 && (
        <>
          <SectionLabel>Stalled lifts</SectionLabel>
          <Card>
            {data.stalled.map((s) => (
              <View key={s.exercise} style={styles.row}>
                <ThemedText style={{ flex: 1 }}>{s.exercise}</ThemedText>
                <ThemedText themeColor="textSecondary" style={styles.num}>
                  {formatNumber(s.previous_1rm)} → {formatNumber(s.recent_1rm)} kg
                </ThemedText>
              </View>
            ))}
          </Card>
        </>
      )}

      {data.untagged.length > 0 && (
        <>
          <SectionLabel>Untagged exercises</SectionLabel>
          <Card>
            <ThemedText>{data.untagged.join(', ')}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              These don&apos;t count towards muscle volume. Tag them in Settings → Muscles.
            </ThemedText>
          </Card>
        </>
      )}
    </>
  );
}

function StrengthRow({ level }: { level: StrengthLevel }) {
  return (
    <View style={styles.strength}>
      <View style={styles.row}>
        <ThemedText style={{ flex: 1 }}>{level.exercise}</ThemedText>
        <ThemedText type="smallBold">{level.level ? capitalize(level.level) : 'Below beginner'}</ThemedText>
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        {formatNumber(level.best_1rm)} kg est. 1RM · {level.ratio.toFixed(2)}× BW
        {level.next_level ? ` · +${formatNumber(level.next_level_kg)} kg to ${level.next_level}` : ''}
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
  strength: {
    gap: Spacing.half,
  },
  num: {
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
});
