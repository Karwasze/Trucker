import { useState } from 'react';
import { Circle, Path } from 'react-native-svg';

import { ChartFrame, LABEL_WIDTH, yPixel } from '@/components/chart-frame';
import { xScale, yScale } from '@/components/chart-scale';
import { useTheme } from '@/hooks/use-theme';
import { formatDate } from '@/workout/format';

export type ChartPoint = { date: string; value: number };

/** Keeps points on the first and last day clear of the edges, wider than the highlight dot. */
const PAD_X = 6;

/**
 * Line chart of values over time, each point on its own day between `from`
 * and `to` (YYYY-MM-DD, inclusive; points outside are the caller's to
 * filter). The Y axis fits the data. Touch and drag across it to read
 * individual points.
 */
export function LineChart({
  points,
  from,
  to,
  unit,
  formatValue = (v) => `${v.toFixed(1)} ${unit}`,
  height = 180,
}: {
  points: ChartPoint[];
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

  const axis = yScale(
    points.map((p) => p.value),
    false
  );
  const x = xScale(from, to, LABEL_WIDTH + PAD_X, Math.max(width - LABEL_WIDTH - 2 * PAD_X, 1));
  const coords = width > 0 ? points.map((p) => ({ x: x.point(p.date), y: yPixel(axis, height, p.value) })) : [];
  const path = coords.map((c, i) => `${i ? 'L' : 'M'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');

  const highlight = active ?? points.length - 1;
  const shown = points[highlight];

  return (
    <ChartFrame
      height={height}
      axis={axis}
      from={from}
      to={to}
      xs={coords.map((c) => c.x)}
      active={active}
      onActive={setActive}
      onWidth={setWidth}
      value={formatValue(shown.value)}
      caption={formatDate(shown.date)}
      accessibilityLabel={`${unit} chart, ${points.length} sessions, latest ${formatValue(points.at(-1)!.value)}`}>
      <Path d={path} stroke={theme.accent} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" fill="none" />
      {coords.map((c, i) => (
        <Circle
          key={points[i].date}
          cx={c.x}
          cy={c.y}
          r={i === highlight ? 5 : points.length > 40 ? 0 : 2.5}
          fill={i === highlight ? theme.accent : theme.backgroundElement}
          stroke={theme.accent}
          strokeWidth={i === highlight ? 0 : 1.5}
        />
      ))}
    </ChartFrame>
  );
}
