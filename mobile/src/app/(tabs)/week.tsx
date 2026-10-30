import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import type { PlannedSession, PlanToday } from '@/api/types';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Message, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { SessionDetails } from '@/goals/session-card';
import { useQuery } from '@/hooks/use-query';
import { useTheme } from '@/hooks/use-theme';
import { useToday } from '@/hooks/use-today';
import { SettingsButton } from '@/settings/settings-button';
import { useSettings } from '@/settings/settings-context';
import { describeSets } from '@/workout/draft';
import { formatDate } from '@/workout/format';
import { currentWeek, weekProgress } from '@/workout/week';

const formatDay = (date: string) => formatDate(date, { weekday: 'long', month: 'short', day: 'numeric' });
const formatShort = (date: string) => formatDate(date, { month: 'short', day: 'numeric' });

/**
 * This week's lifting from the selected plan and sessions from the active
 * goal, day by day, and how many of them are done.
 */
export default function WeekScreen() {
  const { api, planId, serverUrl } = useSettings();
  const { today, recheck: recheckToday } = useToday();
  const dates = currentWeek(today);

  const plans = useQuery(`plans:${serverUrl}`, api.listPlans);
  const week = useQuery(`week:${serverUrl}:${planId}:${today}`, async () => {
    const [days, sessions] = await Promise.all([
      planId === null ? [] : Promise.all(dates.map((date) => api.planToday(planId, date))),
      api.listGoals().then((goals) => {
        const goal = goals.find((g) => g.active);
        return goal ? api.goalSessions(goal.id, today, dates[0], dates[6]) : [];
      }),
    ]);
    return { days, sessions };
  });
  const planName = plans.data?.find((p) => p.id === planId)?.name;

  const refresh = () => {
    recheckToday();
    plans.refresh();
    week.refresh();
  };

  const subtitle = [`${formatShort(dates[0])} – ${formatShort(dates[6])}`, planName].filter(Boolean).join(' · ');
  const days = week.data?.days ?? [];
  const sessions = week.data?.sessions ?? [];
  const empty = days.every((d) => d.exercises.length === 0 && !d.workout) && sessions.length === 0;

  return (
    <Screen
      title="Current week"
      subtitle={subtitle}
      action={<SettingsButton />}
      refreshing={week.refreshing}
      onRefresh={refresh}>
      {!week.data ? (
        <Message loading={!week.error} error={week.error}>
          {null}
        </Message>
      ) : empty ? (
        <Card>
          <ThemedText type="smallBold">Nothing scheduled</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {planId === null
              ? 'Pick a training plan or set an endurance goal to see the week ahead.'
              : 'Your plan and goal have no workouts this week.'}
          </ThemedText>
          {planId === null && (
            <Button title="Choose plan" variant="secondary" compact onPress={() => router.navigate('/plans')} />
          )}
        </Card>
      ) : (
        <>
          <WeekProgress {...weekProgress(days, sessions)} />
          {dates.map((date) => (
            <DayCard
              key={date}
              date={date}
              today={today}
              day={days.find((d) => d.date === date)}
              sessions={sessions.filter((s) => s.date === date)}
            />
          ))}
        </>
      )}
    </Screen>
  );
}

function WeekProgress({ done, planned }: { done: number; planned: number }) {
  const theme = useTheme();
  if (planned === 0) return null;
  const label = `${done} of ${planned} ${planned === 1 ? 'training' : 'trainings'} done`;
  const complete = done >= planned;
  return (
    <Card>
      <ThemedText type="smallBold">{label}</ThemedText>
      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={label}
        accessibilityValue={{ min: 0, max: planned, now: done }}
        style={[styles.track, { backgroundColor: theme.backgroundSelected }]}>
        <View
          style={[
            styles.fill,
            { width: `${(done / planned) * 100}%`, backgroundColor: complete ? theme.success : theme.accent },
          ]}
        />
      </View>
    </Card>
  );
}

function DayCard({
  date,
  today,
  day,
  sessions,
}: {
  date: string;
  today: string;
  day: PlanToday | undefined;
  sessions: PlannedSession[];
}) {
  const theme = useTheme();
  const logged = day?.workout;
  const exercises = logged?.exercises ?? day?.exercises ?? [];
  const heading = formatDay(date);
  const status = logged
    ? { label: 'Logged ✓', color: theme.success }
    : date < today && exercises.length > 0
      ? { label: 'Not logged', color: theme.danger }
      : date === today
        ? { label: 'Today', color: theme.accent }
        : null;

  const content = (
    <Card style={date === today && { borderWidth: 1, borderColor: theme.accent }}>
      <View style={styles.row}>
        <ThemedText type="smallBold" style={styles.name}>
          {heading}
        </ThemedText>
        {status && (
          <ThemedText type="smallBold" style={{ color: status.color }}>
            {status.label}
          </ThemedText>
        )}
      </View>
      {exercises.map((e, i) => (
        <View key={`${e.name}-${i}`} style={styles.row}>
          <ThemedText style={styles.name}>{e.name}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {describeSets(e.sets)}
          </ThemedText>
        </View>
      ))}
      {sessions.map((s) => (
        <SessionDetails key={s.id} session={s} compact />
      ))}
      {exercises.length === 0 && sessions.length === 0 && (
        <ThemedText type="small" themeColor="textSecondary">
          Rest day
        </ThemedText>
      )}
    </Card>
  );

  if (!logged) {
    return (
      <View accessible accessibilityLabel={heading}>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={heading}
      onPress={() => router.navigate({ pathname: '/history/[id]', params: { id: logged.id } }, { withAnchor: true })}
      style={({ pressed }) => pressed && { opacity: 0.6 }}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  name: {
    flex: 1,
  },
  track: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 4,
  },
});
