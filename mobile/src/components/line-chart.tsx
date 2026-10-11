import { useState } from 'react';
import { StyleSheet, View, type GestureResponderEvent } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDate } from '@/workout/format';

export type ChartPoint = { date: string; value: number };

type Props = {
  points: ChartPoint[];
  /** X axis range as YYYY-MM-DD; points are placed by date within it. */
  from: string;
  to: string;
  unit: string;
  height?: number;
};

const LABEL_WIDTH = 40;
const PAD_TOP = 8;
const PAD_BOTTOM = 8;
const DAY_MS = 86_400_000;

const toTime = (date: string) => new Date(`${date}T12:00:00`).getTime();

/** A round step (1, 2, 2.5 or 5 × 10^n) giving about `count` intervals. */
function niceStep(span: number, count: number) {
  const raw = span / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].find((m) => m * magnitude >= raw)!;
  return step * magnitude;
}

/**
 * Line chart of values over time. Touch and drag across it to read
 * individual points.
 */
export function LineChart({ points, from, to, unit, height = 180 }: Props) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);

  const values = points.map((p) => p.value);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const step = niceStep(Math.max(rawMax - rawMin, rawMax * 0.1, 1), 3);
  const yMin = Math.floor(rawMin / step) * step;
  const yMax = Math.max(Math.ceil(rawMax / step) * step, yMin + step);
  const ticks: number[] = [];
  for (let t = yMin; t <= yMax + step / 2; t += step) ticks.push(t);

  const t0 = toTime(from);
  const t1 = Math.max(toTime(to), t0 + DAY_MS);
  const plotWidth = Math.max(width - LABEL_WIDTH, 1);
  const plotHeight = height - PAD_TOP - PAD_BOTTOM;
  const x = (date: string) => LABEL_WIDTH + ((toTime(date) - t0) / (t1 - t0)) * plotWidth;
  const y = (value: number) => PAD_TOP + (1 - (value - yMin) / (yMax - yMin)) * plotHeight;

  const coords = points.map((p) => ({ x: x(p.date), y: y(p.value) }));
  const path = coords.map((c, i) => `${i ? 'L' : 'M'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');

  const scrub = (e: GestureResponderEvent) => {
    const touchX = e.nativeEvent.locationX;
    let nearest = 0;
    coords.forEach((c, i) => {
      if (Math.abs(c.x - touchX) < Math.abs(coords[nearest].x - touchX)) nearest = i;
    });
    setActive(nearest);
  };

  const shown = points[active ?? points.length - 1];
  const highlight = active ?? points.length - 1;

  return (
    <View>
      <View style={styles.readout}>
        <ThemedText style={styles.value}>
          {shown.value.toFixed(1)} {unit}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {active === null ? 'Latest · ' : ''}
          {formatDate(shown.date)}
        </ThemedText>
      </View>

      <View
        style={{ height }}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={scrub}
        onResponderMove={scrub}
        onResponderRelease={() => setActive(null)}
        onResponderTerminate={() => setActive(null)}
        accessible
        accessibilityLabel={`${unit} chart, ${points.length} sessions, latest ${points.at(-1)!.value.toFixed(1)} ${unit}`}>
        {width > 0 && (
          <Svg width={width} height={height}>
            {ticks.map((t) => (
              <Line
                key={`grid-${t}`}
                x1={LABEL_WIDTH}
                x2={width}
                y1={y(t)}
                y2={y(t)}
                stroke={theme.backgroundSelected}
                strokeWidth={1}
              />
            ))}
            {ticks.map((t) => (
              <SvgText
                key={`label-${t}`}
                x={LABEL_WIDTH - 8}
                y={y(t) + 4}
                fontSize={11}
                fill={theme.textSecondary}
                textAnchor="end">
                {Number.isInteger(t) ? t : t.toFixed(1)}
              </SvgText>
            ))}

            {active !== null && (
              <Line
                x1={coords[active].x}
                x2={coords[active].x}
                y1={PAD_TOP}
                y2={height - PAD_BOTTOM}
                stroke={theme.textSecondary}
                strokeWidth={1}
                strokeDasharray="3 3"
              />
            )}

            <Path
              d={path}
              stroke={theme.accent}
              strokeWidth={2.5}
              strokeLinejoin="round"
              strokeLinecap="round"
              fill="none"
            />
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
          </Svg>
        )}
      </View>

      <View style={[styles.axis, { marginLeft: LABEL_WIDTH }]}>
        <ThemedText type="small" themeColor="textSecondary">
          {formatDate(from, { month: 'short', day: 'numeric', year: '2-digit' })}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {formatDate(to, { month: 'short', day: 'numeric', year: '2-digit' })}
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  readout: {
    marginBottom: Spacing.two,
  },
  value: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: 700,
    fontVariant: ['tabular-nums'],
  },
  axis: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Spacing.one,
  },
});
