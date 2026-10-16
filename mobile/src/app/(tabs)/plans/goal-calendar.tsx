import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { localDate } from '@/api/client';
import type { PlannedSession } from '@/api/types';
import { ThemedText } from '@/components/themed-text';
import { Card, HeaderButton, Message, Screen, SectionLabel } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { PHASE_NAMES } from '@/goals/presets';
import { SessionDetails } from '@/goals/session-card';
import { useQuery } from '@/hooks/use-query';
import { useToday } from '@/hooks/use-today';
import { useTheme } from '@/hooks/use-theme';
import { useSettings } from '@/settings/settings-context';
import { formatDate } from '@/workout/format';

/** The Monday of a date's week. */
function weekOf(date: string) {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return localDate(d);
}

/** A goal's plan week by week, with how each session went. */
export default function GoalCalendarScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api, serverUrl } = useSettings();
  const theme = useTheme();
  const { today } = useToday();
  const goals = useQuery(`goals:${serverUrl}`, api.listGoals);
  const sessions = useQuery(`goal-sessions:${serverUrl}:${id}:${today}`, () => api.goalSessions(Number(id), today));
  const goal = goals.data?.find((g) => g.id === Number(id));
  const [open, setOpen] = useState<number | null>(null);

  const weeks: { monday: string; sessions: PlannedSession[] }[] = [];
  for (const s of sessions.data ?? []) {
    const monday = weekOf(s.date);
    if (weeks.at(-1)?.monday !== monday) weeks.push({ monday, sessions: [] });
    weeks.at(-1)!.sessions.push(s);
  }
  const thisWeek = weekOf(today);

  return (
    <Screen
      hasHeader
      refreshing={sessions.refreshing}
      onRefresh={() => {
        goals.refresh();
        sessions.refresh();
      }}>
      <Stack.Screen
        options={{
          title: goal?.name ?? 'Goal',
          headerRight: () =>
            goal && (
              <HeaderButton
                title="Edit"
                onPress={() => router.push({ pathname: '/plans/goal', params: { id: goal.id } })}
              />
            ),
        }}
      />
      {goal && (
        <ThemedText themeColor="textSecondary">
          Race day {formatDate(goal.race_date, { weekday: 'long', month: 'long', day: 'numeric' })}
        </ThemedText>
      )}
      {!sessions.data ? (
        <Message loading={!sessions.error} error={sessions.error} />
      ) : (
        weeks.map((week, i) => {
          const done = week.sessions.filter((s) => s.verdict?.status === 'met').length;
          return (
            <View key={week.monday} style={{ gap: Spacing.two }}>
              <SectionLabel>
                {`Week ${i + 1} · ${PHASE_NAMES[week.sessions[0].phase]}${week.monday === thisWeek ? ' · this week' : ''}`}
              </SectionLabel>
              <Card style={week.monday === thisWeek && { borderWidth: 2, borderColor: theme.accent }}>
                {week.sessions.map((s) => (
                  <Pressable
                    key={s.id}
                    onPress={() => setOpen(open === s.id ? null : s.id)}
                    style={({ pressed }) => [styles.session, pressed && { opacity: 0.6 }]}>
                    <ThemedText type="small" themeColor="textSecondary" style={styles.day}>
                      {formatDate(s.date, { weekday: 'short', day: 'numeric' })}
                    </ThemedText>
                    <View style={{ flex: 1 }}>
                      <SessionDetails session={s} compact={open !== s.id} />
                    </View>
                  </Pressable>
                ))}
                {week.monday < thisWeek && (
                  <ThemedText type="small" themeColor="textSecondary">
                    {done} of {week.sessions.length} met
                  </ThemedText>
                )}
              </Card>
            </View>
          );
        })
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  session: {
    flexDirection: 'row',
    gap: Spacing.two,
    paddingVertical: Spacing.one,
  },
  day: {
    width: 56,
    paddingTop: 2,
  },
});
