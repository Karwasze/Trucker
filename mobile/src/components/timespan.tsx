import { localDate } from '@/api/client';
import { Carousel } from '@/components/carousel';
import { useTabBarWidth } from '@/components/carousel-tab-bar';

export const TIMESPANS = [
  { key: 'all', label: 'From beginning', short: 'All', months: null },
  { key: '1y', label: '1 year', short: '1Y', months: 12 },
  { key: '6m', label: '6 months', short: '6M', months: 6 },
  { key: '3m', label: '3 months', short: '3M', months: 3 },
  { key: '1m', label: '1 month', short: '1M', months: 1 },
] as const;

export type Timespan = (typeof TIMESPANS)[number];

/** What Progress and Insights open on: the last month. */
export const DEFAULT_TIMESPAN: Timespan = TIMESPANS[4];

/** First date (YYYY-MM-DD) inside the timespan, or null for all time. */
export function timespanStart(span: Timespan) {
  if (span.months === null) return null;
  const d = new Date();
  d.setMonth(d.getMonth() - span.months);
  return localDate(d);
}

/** Floating carousel for picking a timespan, for the stack above the tab bar. */
export function TimespanCarousel({ value, onChange }: { value: Timespan; onChange: (timespan: Timespan) => void }) {
  return (
    <Carousel
      items={TIMESPANS.map((t) => ({ key: t.key, label: t.key === 'all' ? 'All time' : t.label }))}
      index={TIMESPANS.findIndex((t) => t.key === value.key)}
      onChange={(i) => onChange(TIMESPANS[i])}
      visible={3}
      floating
      width={useTabBarWidth()}
      accessibilityLabel="Timespan"
      testID="timespan"
    />
  );
}
