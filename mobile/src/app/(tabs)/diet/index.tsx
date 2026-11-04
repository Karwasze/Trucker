import { useState } from 'react';
import { Alert } from 'react-native';

import type { DietDay } from '@/api/types';
import { Button, Message, Screen } from '@/components/ui';
import { DayCard } from '@/diet/day-card';
import { DietCalendar } from '@/diet/month-calendar';
import { useDietReminder } from '@/diet/reminder-context';
import { useQuery } from '@/hooks/use-query';
import { useToday } from '@/hooks/use-today';
import { useSettings } from '@/settings/settings-context';
import { addMonths, monthOf, monthRange } from '@/workout/month-calendar';

/**
 * A month of days kept to or not, this month's unless another is picked,
 * with the selected day's check-in below. Insights are on the Insights tab
 * and the evening check-in in Settings.
 */
export default function DietScreen() {
  const { api, serverUrl } = useSettings();
  const { today, recheck: recheckToday } = useToday();
  const reminder = useDietReminder();
  const thisMonth = monthOf(today);
  // Null follows today, so the screen moves on to a new month by itself.
  const [picked, setPicked] = useState<string | null>(null);
  const month = picked ?? thisMonth;
  const range = monthRange(month);
  const [day, setDay] = useState<string | null>(null);
  // Answers from a check-in reload everything, so they key the queries.
  const days = useQuery(`diet:${serverUrl}:${month}:${reminder.answered}`, () => api.listDiet(range));
  // Only for the oldest day logged, which bounds the calendar.
  const insights = useQuery(`diet-insights:${serverUrl}:${today}:${reminder.answered}`, () => api.dietInsights(today));
  // Saved here but not reloaded yet, null once cleared; reset by a check-in's answer.
  const [pending, setPending] = useState<{ answered: number; days: Record<string, DietDay | null> }>({
    answered: 0,
    days: {},
  });
  const pendingDays = pending.answered === reminder.answered ? pending.days : {};
  const [pulling, setPulling] = useState(false);

  const inMonth = (date: string) => date >= range.from && date <= range.to;
  const shown = [
    ...(days.data ?? []).filter((d) => !(d.date in pendingDays)),
    ...Object.values(pendingDays).filter((d): d is DietDay => !!d && inMonth(d.date)),
  ];
  // A day picked in this month, else today in this month or the last day of an earlier one.
  const selected = day && inMonth(day) ? day : range.to < today ? range.to : today;
  const firstMonth = insights.data?.first_date ? monthOf(insights.data.first_date) : thisMonth;
  // A month before the first day logged can still be filled in.
  const earliest = addMonths(firstMonth < thisMonth ? firstMonth : thisMonth, -1);

  const changeMonth = (next: string) => {
    setPicked(next === thisMonth ? null : next);
    setDay(null);
  };

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

  return (
    <Screen
      title="Diet"
      // Months back, a way home without stepping through each one.
      action={
        month !== thisMonth && (
          <Button title="This month" variant="secondary" compact onPress={() => changeMonth(thisMonth)} />
        )
      }
      refreshing={pulling && days.refreshing}
      onRefresh={() => {
        setPulling(true);
        recheckToday();
        days.refresh();
        insights.refresh();
      }}>
      <DietCalendar
        month={month}
        earliest={earliest}
        latest={thisMonth}
        today={today}
        days={shown}
        selected={selected}
        onMonthChange={changeMonth}
        onSelect={setDay}
      />
      {!days.data ? (
        <Message loading={!days.error} error={days.error} />
      ) : (
        <DayCard
          date={selected}
          today={today}
          day={shown.find((d) => d.date === selected)}
          saving={clearing}
          onSave={save}
          onClear={() => clear(selected)}
        />
      )}
    </Screen>
  );
}
