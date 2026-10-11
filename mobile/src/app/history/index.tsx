import { Link } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card, Message, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useQuery } from '@/hooks/use-query';
import { useSettings } from '@/settings/settings-context';
import { describeSets } from '@/workout/draft';
import { formatDate, formatKg, volumeOf } from '@/workout/format';

export default function HistoryScreen() {
  const { api, serverUrl } = useSettings();
  const workouts = useQuery(`workouts:${serverUrl}`, api.listWorkouts);
  const plans = useQuery(`plans:${serverUrl}`, api.listPlans);
  const planName = (id?: number) => plans.data?.find((p) => p.id === id)?.name;

  return (
    <Screen
      title="History"
      refreshing={workouts.refreshing}
      onRefresh={() => {
        workouts.refresh();
        plans.refresh();
      }}>
      {!workouts.data ? (
        <Message loading={!workouts.error} error={workouts.error} />
      ) : workouts.data.length === 0 ? (
        <Message>No workouts yet. Log one from the Today tab.</Message>
      ) : (
        workouts.data.map((w) => (
          <Link key={w.id} href={{ pathname: '/history/[id]', params: { id: w.id } }} asChild>
            <Pressable style={({ pressed }) => pressed && { opacity: 0.6 }}>
              <Card>
                <View style={styles.row}>
                  <ThemedText style={{ fontWeight: 700, flex: 1 }}>{formatDate(w.date)}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {formatKg(volumeOf(w.exercises))}
                  </ThemedText>
                </View>
                {planName(w.plan_id) && (
                  <ThemedText type="small" themeColor="textSecondary">
                    {planName(w.plan_id)}
                  </ThemedText>
                )}
                {w.exercises.map((e, i) => (
                  <View key={i} style={styles.row}>
                    <ThemedText type="small" style={{ flex: 1 }}>
                      {e.name}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {describeSets(e.sets)}
                    </ThemedText>
                  </View>
                ))}
              </Card>
            </Pressable>
          </Link>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
});
