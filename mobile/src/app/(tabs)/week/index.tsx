import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { Exercise, PlannedSession, PlanToday, Workout } from '@/api/types';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Message, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { SessionLink } from '@/goals/session-card';
import { useQuery } from '@/hooks/use-query';
import { useTheme } from '@/hooks/use-theme';
import { useToday } from '@/hooks/use-today';
import { useSettings } from '@/settings/settings-context';
import { describeSets } from '@/workout/draft';
import { ACTIVITY_ICONS, formatDate, formatDuration } from '@/workout/format';
import { currentWeek, dayStatus, type DayStatus, weekProgress } from '@/workout/week';

const formatDay = (date: string) => formatDate(date, { weekday: 'long', month: 'short', day: 'numeric' });
const formatShort = (date: string) => formatDate(date, { month: 'short', day: 'numeric' });
const formatDayShort = (date: string) => formatDate(date, { weekday: 'short', day: 'numeric' });

const statusLabels: Record<DayStatus, string> = {
  done: 'done',
  missed: 'missed',
  planned: 'planned',
  rest: 'rest day',
};

/**
 * This week's lifting from the selected plan and sessions from the active
 * goal, a line a day.
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
    <Screen title="Current week" subtitle={subtitle} refreshing={week.refreshing} onRefresh={refresh}>
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
        <WeekCard dates={dates} today={today} days={days} sessions={sessions} />
      )}
    </Screen>
  );
}

/**
 * The week in one card: how many trainings are done, then a line per day
 * with what it holds. Pressing a day opens its sets and sessions below it.
 */
function WeekCard({
  dates,
  today,
  days,
  sessions,
}: {
  dates: string[];
  today: string;
  days: PlanToday[];
  sessions: PlannedSession[];
}) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <Card style={styles.card}>
      <WeekProgress {...weekProgress(days, sessions)} />
      {dates.map((date) => (
        <DayRow
          key={date}
          date={date}
          today={today}
          day={days.find((d) => d.date === date)}
          sessions={sessions.filter((s) => s.date === date)}
          open={open === date}
          onToggle={() => setOpen((o) => (o === date ? null : date))}
        />
      ))}
    </Card>
  );
}

function WeekProgress({ done, planned }: { done: number; planned: number }) {
  const theme = useTheme();
  if (planned === 0) return null;
  const label = `${done} of ${planned} ${planned === 1 ? 'training' : 'trainings'} done`;
  return (
    <View style={[styles.row, styles.header]}>
      <ThemedText type="smallBold">{label}</ThemedText>
      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={label}
        accessibilityValue={{ min: 0, max: planned, now: done }}
        style={[styles.track, { backgroundColor: theme.backgroundSelected }]}>
        <View style={[styles.fill, { width: `${(done / planned) * 100}%`, backgroundColor: theme.success }]} />
      </View>
    </View>
  );
}

/** What a day holds, in one line: its exercises, then each session. */
function summarize(exercises: Exercise[], sessions: PlannedSession[]) {
  const parts = sessions.map((s) =>
    [`${ACTIVITY_ICONS[s.activity]} ${s.description}`, s.workout && formatDuration(s.workout.duration_seconds)]
      .filter(Boolean)
      .join(' · ')
  );
  if (exercises.length > 0) parts.unshift(exercises.map((e) => e.name).join(', '));
  return parts.join(' · ') || 'Rest';
}

/** A day's line in the week, opening onto its sets and sessions. */
function DayRow({
  date,
  today,
  day,
  sessions,
  open,
  onToggle,
}: {
  date: string;
  today: string;
  day: PlanToday | undefined;
  sessions: PlannedSession[];
  open: boolean;
  onToggle: () => void;
}) {
  const theme = useTheme();
  const logged = day?.workout;
  const exercises = logged?.exercises ?? day?.exercises ?? [];
  const status = dayStatus(date, today, day, sessions);
  const isToday = date === today;
  const dots: Record<DayStatus, object> = {
    done: { backgroundColor: theme.success },
    missed: { backgroundColor: theme.danger },
    planned: { borderWidth: 2, borderColor: isToday ? theme.accent : theme.textSecondary },
    rest: [styles.restDot, { backgroundColor: theme.backgroundSelected }],
  };
  // Days gone by step back, unless they were missed.
  const faded = date < today && status !== 'missed';

  return (
    <View style={[styles.day, open && { backgroundColor: theme.backgroundSelected }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${formatDay(date)}, ${statusLabels[status]}`}
        accessibilityState={{ expanded: open }}
        onPress={onToggle}
        style={[styles.row, styles.line, styles.top, faded && styles.faded]}>
        <ThemedText
          type="smallBold"
          themeColor={isToday ? undefined : 'textSecondary'}
          style={[styles.date, isToday && { color: theme.accent }]}>
          {formatDayShort(date)}
        </ThemedText>
        <View style={[styles.dot, dots[status]]} />
        <ThemedText type="small" themeColor={status === 'rest' ? 'textSecondary' : undefined} style={styles.name}>
          {summarize(exercises, sessions)}
        </ThemedText>
      </Pressable>
      {open && <DayDetails date={date} today={today} logged={logged} exercises={exercises} sessions={sessions} />}
    </View>
  );
}

/** A day's sets and sessions; what was logged opens in History. */
function DayDetails({
  date,
  today,
  logged,
  exercises,
  sessions,
}: {
  date: string;
  today: string;
  logged: Workout | undefined;
  exercises: Exercise[];
  sessions: PlannedSession[];
}) {
  const theme = useTheme();
  const lifting = exercises.length > 0 && (
    <View style={styles.section}>
      {logged ? (
        <ThemedText type="smallBold" style={{ color: theme.success }}>
          Logged ✓
        </ThemedText>
      ) : (
        date < today && (
          <ThemedText type="smallBold" style={{ color: theme.danger }}>
            Not logged
          </ThemedText>
        )
      )}
      {exercises.map((e, i) => (
        <View key={`${e.name}-${i}`} style={styles.row}>
          <ThemedText type="small" style={styles.name}>
            {e.name}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {describeSets(e.sets)}
          </ThemedText>
        </View>
      ))}
    </View>
  );

  return (
    <View style={styles.details}>
      {logged ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Workout on ${formatDay(date)}`}
          onPress={() => router.push({ pathname: '/week/workout/[id]', params: { id: logged.id } })}
          style={({ pressed }) => pressed && styles.pressed}>
          {lifting}
        </Pressable>
      ) : (
        lifting
      )}
      {sessions.map((s) => (
        <SessionLink key={s.id} session={s} compact pathname="/week/cardio/[id]" />
      ))}
      {exercises.length === 0 && sessions.length === 0 && (
        <ThemedText type="small" themeColor="textSecondary">
          Nothing planned
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 0,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two,
  },
  header: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
  },
  track: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 3,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  top: {
    alignItems: 'flex-start',
  },
  day: {
    borderRadius: 10,
  },
  line: {
    paddingHorizontal: Spacing.two,
    paddingVertical: 6,
  },
  date: {
    width: 52,
  },
  name: {
    flex: 1,
  },
  faded: {
    opacity: 0.6,
  },
  details: {
    gap: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingBottom: Spacing.two,
  },
  section: {
    gap: Spacing.one,
  },
  pressed: {
    opacity: 0.6,
  },
  dot: {
    width: 10,
    height: 10,
    marginTop: 5,
    borderRadius: 5,
  },
  restDot: {
    width: 6,
    height: 6,
    marginHorizontal: 2,
    marginTop: 7,
    borderRadius: 3,
  },
});
