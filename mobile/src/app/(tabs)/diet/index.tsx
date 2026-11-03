import { useState } from 'react';
import { Alert } from 'react-native';

import type { DietDay } from '@/api/types';
import { ThemedText } from '@/components/themed-text';
import { Card, Message, Screen, SectionLabel } from '@/components/ui';
import { DayCard } from '@/diet/day-card';
import { DietSettingsCard } from '@/diet/diet-settings';
import { dietInsights } from '@/diet/insights';
import { useDietReminder } from '@/diet/reminder-context';
import { addDays, WeekCalendar, weekOf } from '@/diet/week-calendar';
import { useQuery } from '@/hooks/use-query';
import { useToday } from '@/hooks/use-today';
import { useSettings } from '@/settings/settings-context';

/** How many weeks before the first day logged can still be logged. */
const WEEKS_BACK = 4;

/**
 * A week of days kept to or not, this week's unless another is picked, with
 * the selected day's check-in, insights and settings below.
 */
export default function DietScreen() {
  const { api, serverUrl } = useSettings();
  const { today, recheck: recheckToday } = useToday();
  const reminder = useDietReminder();
  const thisWeek = weekOf(today);
  // Null follows today, so the screen moves on to a new week by itself.
  const [picked, setPicked] = useState<string | null>(null);
  const monday = picked ?? thisWeek;
  const sunday = addDays(monday, 6);
  const [day, setDay] = useState<string | null>(null);
  // Answers from a check-in reload everything, so they key the queries.
  const days = useQuery(`diet:${serverUrl}:${monday}:${reminder.answered}`, () =>
    api.listDiet({ from: monday, to: sunday })
  );
  const insights = useQuery(`diet-insights:${serverUrl}:${today}:${reminder.answered}`, () => api.dietInsights(today));
  const settings = useQuery(`diet-settings:${serverUrl}`, api.dietSettings);
  // Saved here but not reloaded yet, null once cleared; reset by a check-in's answer.
  const [pending, setPending] = useState<{ answered: number; days: Record<string, DietDay | null> }>({
    answered: 0,
    days: {},
  });
  const pendingDays = pending.answered === reminder.answered ? pending.days : {};
  const [pulling, setPulling] = useState(false);

  const shown = [
    ...(days.data ?? []).filter((d) => !(d.date in pendingDays)),
    ...Object.values(pendingDays).filter((d): d is DietDay => !!d && d.date >= monday && d.date <= sunday),
  ];
  // A day picked in this week, else today in this week or Sunday in an earlier one.
  const selected = day && day >= monday && day <= sunday ? day : sunday < today ? sunday : today;
  const firstDate = insights.data?.first_date;
  const earliest = addDays(firstDate && firstDate < thisWeek ? weekOf(firstDate) : thisWeek, -7 * WEEKS_BACK);

  const markPending = (date: string, value: DietDay | null | undefined) =>
    setPending((p) => {
      const next = p.answered === reminder.answered ? { ...p.days } : {};
      if (value === undefined) delete next[date];
      else next[date] = value;
      return { answered: reminder.answered, days: next };
    });

  const afterChange = (date: string) => {
    setPulling(false);
    days.refresh();
    insights.refresh();
    if (date === today) reminder.sync();
  };

  const save = async (d: DietDay) => {
    markPending(d.date, d);
    try {
      await api.saveDietDay(d);
    } catch (e) {
      markPending(d.date, undefined);
      Alert.alert("Couldn't save day", (e as Error).message);
      return;
    }
    afterChange(d.date);
  };

  const [clearing, setClearing] = useState(false);
  const clear = async (date: string) => {
    setClearing(true);
    try {
      await api.deleteDietDay(date);
      markPending(date, null);
      afterChange(date);
    } catch (e) {
      Alert.alert("Couldn't clear day", (e as Error).message);
    } finally {
      setClearing(false);
    }
  };

  const lines = insights.data ? dietInsights(insights.data) : [];

  return (
    <Screen
      title="Diet"
      refreshing={pulling && (days.refreshing || insights.refreshing)}
      onRefresh={() => {
        setPulling(true);
        recheckToday();
        days.refresh();
        insights.refresh();
        settings.refresh();
      }}>
      <WeekCalendar
        monday={monday}
        earliest={earliest}
        latest={thisWeek}
        today={today}
        days={shown}
        selected={selected}
        onWeekChange={(next) => {
          setPicked(next === thisWeek ? null : next);
          setDay(null);
        }}
        onSelect={setDay}
      />
      {!days.data ? (
        <Message loading={!days.error} error={days.error} />
      ) : (
        <DayCard
          date={selected}
          today={today}
          day={shown.find((d) => d.date === selected)}
          targetG={settings.data?.protein_target_g ?? null}
          saving={clearing}
          onSave={save}
          onClear={() => clear(selected)}
        />
      )}

      <SectionLabel>Insights</SectionLabel>
      {!insights.data ? (
        <Message loading={!insights.error} error={insights.error} />
      ) : lines.length === 0 ? (
        <Message>Log a few days to see how your diet is going.</Message>
      ) : (
        lines.map((line) => (
          <Card key={line.title}>
            <ThemedText type="smallBold">{line.title}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {line.body}
            </ThemedText>
          </Card>
        ))
      )}

      <SectionLabel>Settings</SectionLabel>
      {!settings.data ? (
        <Message loading={!settings.error} error={settings.error} />
      ) : (
        // Keyed so the target input starts from what's saved.
        <DietSettingsCard
          key={`${serverUrl}:${settings.data.protein_target_g}`}
          settings={settings.data}
          onSaved={() => {
            settings.refresh();
            insights.refresh();
          }}
        />
      )}
    </Screen>
  );
}
