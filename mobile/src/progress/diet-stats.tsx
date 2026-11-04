import type { DietDay } from '@/api/types';
import { WeeklyBarChart } from '@/components/bar-chart';
import { mondayOf } from '@/components/chart-scale';
import { ThemedText } from '@/components/themed-text';
import { timespanStart, type Timespan } from '@/components/timespan';
import { Card, Message } from '@/components/ui';
import { Tile, TileRow } from '@/progress/tile';

const plural = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`;

/**
 * Diet adherence over the timespan, a series under Bodyweight on the Progress
 * tab: the days kept to and missed, and the days kept to each week. `days`
 * are those logged in the timespan, oldest first.
 */
export function DietStats({ days, timespan, today }: { days: DietDay[]; timespan: Timespan; today: string }) {
  if (days.length === 0) {
    return (
      <Message>
        {timespan.months === null
          ? 'No days logged yet. Log your diet on the Diet tab.'
          : `No days logged in the last ${timespan.label}.`}
      </Message>
    );
  }
  const kept = days.filter((d) => d.adhered).length;
  const weekly = new Map<string, number>();
  for (const d of days) {
    const week = mondayOf(d.date);
    weekly.set(week, (weekly.get(week) ?? 0) + (d.adhered ? 1 : 0));
  }
  const weeks = [...weekly].map(([week, value]) => ({ week, value }));
  return (
    <>
      <TileRow>
        <Tile label="Days kept" value={String(kept)} />
        <Tile label="Missed" value={String(days.length - kept)} />
        <Tile label="Kept" value={`${Math.round((kept / days.length) * 100)}%`} />
      </TileRow>
      <Card>
        <ThemedText type="smallBold">Days kept per week</ThemedText>
        <WeeklyBarChart
          weeks={weeks}
          from={timespanStart(timespan) ?? days[0].date}
          to={today}
          unit="days"
          formatValue={plural}
        />
      </Card>
    </>
  );
}
