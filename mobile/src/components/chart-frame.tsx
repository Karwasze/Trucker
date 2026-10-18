import type { ReactNode } from 'react';
import { StyleSheet, View, type GestureResponderEvent } from 'react-native';
import Svg, { Line, Text as SvgText } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDate } from '@/workout/format';

/** Room on the left for the Y axis labels. */
export const LABEL_WIDTH = 40;
const PAD_TOP = 8;
const PAD_BOTTOM = 8;

export type YAxis = { min: number; max: number; ticks: number[] };

/** Y of `value` on a chart `height` pixels tall. */
export function yPixel(axis: YAxis, height: number, value: number) {
  return PAD_TOP + (1 - (value - axis.min) / (axis.max - axis.min)) * (height - PAD_TOP - PAD_BOTTOM);
}

const axisDate = (date: string) => formatDate(date, { month: 'short', day: 'numeric', year: '2-digit' });

/**
 * What the line and bar charts share: the readout above the plot, gridlines
 * with Y labels, the dates under each end of the X axis, and touch handling.
 * Touch and drag across the plot to pick the item nearest the finger (by
 * `xs`); letting go returns to the latest.
 */
export function ChartFrame({
  height,
  axis,
  from,
  to,
  xs,
  active,
  onActive,
  onWidth,
  value,
  caption,
  accessibilityLabel,
  children,
}: {
  height: number;
  axis: YAxis;
  /** Dates labelled under the left and right ends of the X axis. */
  from: string;
  to: string;
  /** X of each item, for picking the one nearest a touch. */
  xs: number[];
  active: number | null;
  onActive: (index: number | null) => void;
  /** Reports the plot's width once laid out; nothing is drawn before then. */
  onWidth: (width: number) => void;
  /** The readout: the shown item's value and what it covers. */
  value: string;
  caption: string;
  accessibilityLabel: string;
  /** SVG content drawn over the gridlines. */
  children: ReactNode;
}) {
  const theme = useTheme();
  const scrub = (e: GestureResponderEvent) => {
    const touchX = e.nativeEvent.locationX;
    let nearest = 0;
    xs.forEach((x, i) => {
      if (Math.abs(x - touchX) < Math.abs(xs[nearest] - touchX)) nearest = i;
    });
    onActive(nearest);
  };

  return (
    <View>
      <View style={styles.readout}>
        <ThemedText style={styles.value}>{value}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {active === null ? 'Latest · ' : ''}
          {caption}
        </ThemedText>
      </View>

      <View
        style={{ height }}
        onLayout={(e) => onWidth(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={scrub}
        onResponderMove={scrub}
        onResponderRelease={() => onActive(null)}
        onResponderTerminate={() => onActive(null)}
        accessible
        accessibilityLabel={accessibilityLabel}>
        {xs.length > 0 && (
          <Svg width="100%" height={height}>
            {axis.ticks.map((t) => (
              <Line
                key={`grid-${t}`}
                x1={LABEL_WIDTH}
                x2="100%"
                y1={yPixel(axis, height, t)}
                y2={yPixel(axis, height, t)}
                stroke={theme.backgroundSelected}
                strokeWidth={1}
              />
            ))}
            {axis.ticks.map((t) => (
              <SvgText
                key={`label-${t}`}
                x={LABEL_WIDTH - 8}
                y={yPixel(axis, height, t) + 4}
                fontSize={11}
                fill={theme.textSecondary}
                textAnchor="end">
                {Number.isInteger(t) ? t : t.toFixed(1)}
              </SvgText>
            ))}
            {active !== null && (
              <Line
                x1={xs[active]}
                x2={xs[active]}
                y1={PAD_TOP}
                y2={height - PAD_BOTTOM}
                stroke={theme.textSecondary}
                strokeWidth={1}
                strokeDasharray="3 3"
              />
            )}
            {children}
          </Svg>
        )}
      </View>

      <View style={[styles.axis, { marginLeft: LABEL_WIDTH }]}>
        <ThemedText type="small" themeColor="textSecondary">
          {axisDate(from)}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {axisDate(to)}
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
