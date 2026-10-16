import { Link, router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import type { Goal, TrainingPlan } from '@/api/types';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Message, Screen, SectionLabel } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useQuery } from '@/hooks/use-query';
import { useToday } from '@/hooks/use-today';
import { useTheme } from '@/hooks/use-theme';
import { scheduleOf } from '@/plans/edit-model';
import { SettingsButton } from '@/settings/settings-button';
import { useSettings } from '@/settings/settings-context';
import { formatDate } from '@/workout/format';

export default function PlansScreen() {
  const { api, serverUrl, planId, update } = useSettings();
  const plans = useQuery(`plans:${serverUrl}`, api.listPlans);
  const goals = useQuery(`goals:${serverUrl}`, api.listGoals);
  const activeGoal = goals.data?.find((g) => g.active);

  return (
    <Screen
      title="Training plans"
      action={<SettingsButton />}
      refreshing={plans.refreshing || goals.refreshing}
      onRefresh={() => {
        plans.refresh();
        goals.refresh();
      }}>
      <SectionLabel>Goal</SectionLabel>
      {goals.data && !activeGoal && (
        <Card>
          <ThemedText type="small" themeColor="textSecondary">
            Training for a race? Set a goal like a 10k or a triathlon and get a plan of runs, rides and swims
            that builds up to race day, filled in from Apple Health.
          </ThemedText>
          <Button
            title="+ New goal"
            variant="secondary"
            onPress={() => router.push({ pathname: '/plans/goal', params: { id: 'new' } })}
          />
        </Card>
      )}
      {activeGoal && <GoalCard goal={activeGoal} />}

      <SectionLabel>Strength</SectionLabel>
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

function GoalCard({ goal }: { goal: Goal }) {
  const theme = useTheme();
  const { today } = useToday();
  const days = Math.round(
    (new Date(`${goal.race_date}T12:00:00`).getTime() - new Date(`${today}T12:00:00`).getTime()) / 86_400_000
  );
  const legs = [
    goal.swim_m && `swim ${goal.swim_m} m`,
    goal.bike_m && `bike ${goal.bike_m / 1000} km`,
    goal.run_m && `run ${goal.run_m / 1000} km`,
  ].filter(Boolean);
  return (
    <Link href={{ pathname: '/plans/goal-calendar', params: { id: goal.id } }} asChild>
      <Pressable style={({ pressed }) => pressed && { opacity: 0.6 }}>
        <Card style={{ borderWidth: 2, borderColor: theme.accent }}>
          <View style={styles.row}>
            <ThemedText style={{ flex: 1, fontWeight: 700, fontSize: 18 }}>{goal.name}</ThemedText>
            <ThemedText type="smallBold" style={{ color: theme.accent }}>
              {days >= 0 ? `${Math.ceil(days / 7)} weeks to go` : 'Done'}
            </ThemedText>
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            {formatDate(goal.race_date)} · {legs.join(', ')}
          </ThemedText>
          <ThemedText type="small" style={{ color: theme.accent }}>
            See the plan ›
          </ThemedText>
        </Card>
      </Pressable>
    </Link>
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
