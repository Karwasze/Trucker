import { useState } from 'react';
import { Rect } from 'react-native-svg';

import { ChartFrame, LABEL_WIDTH, yPixel } from '@/components/chart-frame';
import { addDays, mondayOf, xScale, yScale } from '@/components/chart-scale';
import { useTheme } from '@/hooks/use-theme';
import { formatDate } from '@/workout/format';

/** A week's total; `week` is its Monday as YYYY-MM-DD. */
export type WeekTotal = { week: string; value: number };

/** Share of each week's width left empty, split either side of its bar. */
const GAP = 0.25;

const dayMonth = (date: string) => formatDate(date, { day: 'numeric', month: 'short' });

/**
 * Bar chart of weekly totals, one bar spanning each week's Monday to Sunday.
 * The X axis runs from the week of `from` to the end of the week of `to`, so
 * every bar is whole; the Y axis starts at zero. Touch and drag across it to
 * read individual weeks.
 */
export function WeeklyBarChart({
  weeks,
  from,
  to,
  unit,
  formatValue = (v) => `${v.toFixed(1)} ${unit}`,
  height = 180,
}: {
  weeks: WeekTotal[];
  from: string;
  to: string;
  unit: string;
  /** Formats a value for the readout; "12.3 unit" by default. */
  formatValue?: (value: number) => string;
  height?: number;
}) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);

  const start = mondayOf(from);
  const end = addDays(mondayOf(to), 6);
  const axis = yScale(
    weeks.map((w) => w.value),
    true
  );
  const x = xScale(start, end, LABEL_WIDTH, Math.max(width - LABEL_WIDTH, 1));
  const weekWidth = x.pxPerDay * 7;
  const barWidth = Math.max(weekWidth * (1 - GAP), 1.5);
  const bars =
    width > 0
      ? weeks.map((w) => {
          const top = yPixel(axis, height, Math.max(w.value, 0));
          const left = x.at(w.week) + (weekWidth - barWidth) / 2;
          return { left, centre: left + barWidth / 2, top, height: yPixel(axis, height, 0) - top };
        })
      : [];

  const highlight = active ?? weeks.length - 1;
  const shown = weeks[highlight];

  return (
    <ChartFrame
      height={height}
      axis={axis}
      from={start}
      to={end}
      xs={bars.map((b) => b.centre)}
      active={active}
      onActive={setActive}
      onWidth={setWidth}
      value={formatValue(shown.value)}
      caption={`Week of ${dayMonth(shown.week)} – ${dayMonth(addDays(shown.week, 6))}`}
      accessibilityLabel={`${unit} per week chart, ${weeks.length} weeks, latest ${formatValue(weeks.at(-1)!.value)}`}>
      {bars.map((b, i) => (
        <Rect
          key={weeks[i].week}
          x={b.left}
          y={b.top}
          width={barWidth}
          height={b.height}
          rx={Math.min(barWidth / 4, 3)}
          fill={theme.accent}
          opacity={active === null || i === active ? 1 : 0.4}
        />
      ))}
    </ChartFrame>
  );
}
