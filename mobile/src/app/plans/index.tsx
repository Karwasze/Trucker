import { Link, router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import type { TrainingPlan } from '@/api/types';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Message, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useQuery } from '@/hooks/use-query';
import { useTheme } from '@/hooks/use-theme';
import { scheduleOf } from '@/plans/edit-model';
import { useSettings } from '@/settings/settings-context';

export default function PlansScreen() {
  const { api, serverUrl, planId, update } = useSettings();
  const plans = useQuery(`plans:${serverUrl}`, api.listPlans);

  return (
    <Screen title="Training plans" refreshing={plans.refreshing} onRefresh={plans.refresh}>
      {!plans.data ? (
        <Message loading={!plans.error} error={plans.error} />
      ) : (
        <>
          {plans.data.length === 0 && (
            <Message>No plans yet. Create one to get daily targets on the Today tab.</Message>
          )}
          {plans.data.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              active={plan.id === planId}
              onActivate={() => update({ planId: plan.id })}
            />
          ))}
          {planId !== null && plans.data.length > 0 && (
            <Button title="Train without a plan" variant="secondary" compact onPress={() => update({ planId: null })} />
          )}
        </>
      )}
      <Button
        title="+ New plan"
        onPress={() => router.push({ pathname: '/plans/[id]', params: { id: 'new' } })}
      />
    </Screen>
  );
}

function PlanCard({
  plan,
  active,
  onActivate,
}: {
  plan: TrainingPlan;
  active: boolean;
  onActivate: () => void;
}) {
  const theme = useTheme();
  const exerciseCount = plan.days.reduce((n, d) => n + d.exercises.length, 0);

  return (
    <Link href={{ pathname: '/plans/[id]', params: { id: plan.id } }} asChild>
      <Pressable style={({ pressed }) => pressed && { opacity: 0.6 }}>
        <Card style={active && { borderWidth: 2, borderColor: theme.accent }}>
          <View style={styles.row}>
            <ThemedText style={{ flex: 1, fontWeight: 700, fontSize: 18 }}>{plan.name}</ThemedText>
            {active ? (
              <ThemedText type="smallBold" style={{ color: theme.accent }}>
                ✓ Active
              </ThemedText>
            ) : (
              <Button title="Use this plan" variant="secondary" compact onPress={onActivate} />
            )}
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            {scheduleOf(plan) || 'No training days'} · {exerciseCount} exercise
            {exerciseCount === 1 ? '' : 's'}
          </ThemedText>
        </Card>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
});
