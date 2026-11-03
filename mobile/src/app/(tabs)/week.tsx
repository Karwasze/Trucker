import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { PlannedSession, PlanToday } from '@/api/types';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Message, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { SessionLink } from '@/goals/session-card';
import { useQuery } from '@/hooks/use-query';
import { useTheme } from '@/hooks/use-theme';
import { useToday } from '@/hooks/use-today';
import { SettingsButton } from '@/settings/settings-button';
import { useSettings } from '@/settings/settings-context';
import { describeSets } from '@/workout/draft';
import { formatDate } from '@/workout/format';
import { currentWeek, dayStatus, type DayStatus, weekProgress } from '@/workout/week';

const formatDay = (date: string) => formatDate(date, { weekday: 'long', month: 'short', day: 'numeric' });
const formatShort = (date: string) => formatDate(date, { month: 'short', day: 'numeric' });
const formatLetter = (date: string) => formatDate(date, { weekday: 'narrow' });

const statusLabels: Record<DayStatus, string> = {
  done: 'done',
  missed: 'missed',
  planned: 'planned',
  rest: 'rest day',
};

/**
 * This week's lifting from the selected plan and sessions from the active
 * goal: how many of them are done, a dot for each day, and the details of
 * the day picked (today to begin with).
 */
export default function WeekScreen() {
  const { api, planId, serverUrl } = useSettings();
  const { today, recheck: recheckToday } = useToday();
  const dates = currentWeek(today);
  const [picked, setPicked] = useState(today);
  // Back to today once the week rolls over.
  const selected = dates.includes(picked) ? picked : today;

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
          <WeekStrip
            dates={dates}
            today={today}
            selected={selected}
            onSelect={setPicked}
            days={days}
            sessions={sessions}
          />
          <DayCard
            key={selected}
            date={selected}
            today={today}
            day={days.find((d) => d.date === selected)}
            sessions={sessions.filter((s) => s.date === selected)}
          />
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

/** A dot for each day, coloured by how it went; pressing one picks that day. */
function WeekStrip({
  dates,
  today,
  selected,
  onSelect,
  days,
  sessions,
}: {
  dates: string[];
  today: string;
  selected: string;
  onSelect: (date: string) => void;
  days: PlanToday[];
  sessions: PlannedSession[];
}) {
  const theme = useTheme();
  const dots: Record<DayStatus, object> = {
    done: { backgroundColor: theme.success },
    missed: { backgroundColor: theme.danger },
    planned: { borderWidth: 2, borderColor: theme.textSecondary },
    rest: [styles.restDot, { backgroundColor: theme.backgroundSelected }],
  };
  return (
    <Card style={styles.strip}>
      {dates.map((date) => {
        const status = dayStatus(
          date,
          today,
          days.find((d) => d.date === date),
          sessions.filter((s) => s.date === date)
        );
        const isSelected = date === selected;
        return (
          <Pressable
            key={date}
            accessibilityRole="button"
            accessibilityLabel={`${formatDay(date)}, ${statusLabels[status]}`}
            accessibilityState={{ selected: isSelected }}
            onPress={() => onSelect(date)}
            style={[styles.stripDay, isSelected && { backgroundColor: theme.backgroundSelected }]}>
            <ThemedText
              type="smallBold"
              themeColor={date === today ? undefined : 'textSecondary'}
              style={date === today && { color: theme.accent }}>
              {formatLetter(date)}
            </ThemedText>
            <View style={[styles.dot, dots[status]]} />
          </Pressable>
        );
      })}
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

  const lifting = (
    <View style={styles.section}>
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
      {exercises.length === 0 && sessions.length === 0 && (
        <ThemedText type="small" themeColor="textSecondary">
          Rest day
        </ThemedText>
      )}
    </View>
  );

  // The logged workout and each session done open on their own.
  const card = (
    <Card style={date === today && { borderWidth: 1, borderColor: theme.accent }}>
      {logged ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={heading}
          onPress={() =>
            router.navigate({ pathname: '/history/[id]', params: { id: logged.id } }, { withAnchor: true })
          }
          style={({ pressed }) => pressed && styles.pressed}>
          {lifting}
        </Pressable>
      ) : (
        lifting
      )}
      {sessions.map((s) => (
        <SessionLink key={s.id} session={s} compact />
      ))}
    </Card>
  );

  if (logged) return card;
  return (
    // Read out as one, unless it has a session to open.
    <View accessible={!sessions.some((s) => s.cardio_workout_id)} accessibilityLabel={heading}>
      {card}
    </View>
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
  section: {
    gap: Spacing.two,
  },
  pressed: {
    opacity: 0.6,
  },
  strip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  stripDay: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    borderRadius: 12,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  restDot: {
    width: 6,
    height: 6,
    marginVertical: 3,
    borderRadius: 3,
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
