import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Ellipse, G, Path } from 'react-native-svg';

import type { Muscle, MuscleVolume } from '@/api/types';
import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { BACK, FRONT, HEAD, HEIGHT, WIDTH, type Shape } from '@/insights/body-shapes';
import { formatDate } from '@/workout/format';

/**
 * Weekly sets from which each tier starts. Deliberately low: the
 * point is to show what's trained at all, not to hold light lifting to a
 * bodybuilding range.
 */
export const VOLUME_STEPS = [0, 3, 6, 10];
export const STEP_LABELS = ['Under 3', '3–6', '6–10', '10+'];

/**
 * Item-rarity tiers: grey for none, then white, green, blue and purple for one
 * step each. Blue and purple differ in lightness too, so they stay apart for
 * colour-blind eyes; the body underneath is darker than white in light mode.
 */
const TIERS = {
  light: { none: '#8E9196', steps: ['#FFFFFF', '#22A447', '#1A56C8', '#B36BF0'], body: '#CDD0D6' },
  dark: { none: '#666A70', steps: ['#F4F4F5', '#2FB453', '#2A62D6', '#BE86F8'], body: '#2E3135' },
};

/** The tier step a muscle's weekly sets fall in, or -1 when it wasn't trained. */
export function volumeStep(weeklySets: number) {
  if (weeklySets <= 0) return -1;
  return VOLUME_STEPS.findLastIndex((from) => weeklySets >= from);
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const formatNumber = (n: number) => String(Math.round(n * 10) / 10);
const shortDate = (date: string) => formatDate(date, { day: 'numeric', month: 'short' });

/**
 * Front and back figures with each muscle group coloured by its weekly sets
 * over `span`, e.g. "the last 3 months", or all time for null; untrained ones
 * are grey with a dashed outline. Tapping a muscle, on a figure or in the list
 * below, picks it.
 */
export function BodyMap({ muscles, span }: { muscles: MuscleVolume[]; span: string | null }) {
  const theme = useTheme();
  const tiers = TIERS[useColorScheme() === 'dark' ? 'dark' : 'light'];
  const color = (weeklySets: number) => {
    const step = volumeStep(weeklySets);
    return step < 0 ? tiers.none : tiers.steps[step];
  };
  const [selected, setSelected] = useState<Muscle | null>(null);
  const toggle = (muscle: Muscle) => setSelected((s) => (s === muscle ? null : muscle));
  const volumes = new Map(muscles.map((m) => [m.muscle, m]));
  const untrained = muscles.filter((m) => m.weekly_sets <= 0);
  const trained = muscles.filter((m) => m.weekly_sets > 0).sort((a, b) => b.weekly_sets - a.weekly_sets);

  const shape = (s: Shape, i: number) => {
    if (!s.muscle) return <Path key={i} d={s.d} fill={tiers.body} />;
    const sets = volumes.get(s.muscle)?.weekly_sets ?? 0;
    const step = volumeStep(sets);
    const isSelected = s.muscle === selected;
    return (
      <Path
        key={i}
        testID={`muscle-${s.muscle}`}
        d={s.d}
        fill={color(sets)}
        stroke={isSelected ? theme.text : step < 0 ? theme.textSecondary : theme.backgroundElement}
        strokeWidth={isSelected ? 2 : 1.2}
        strokeDasharray={step < 0 && !isSelected ? '2.5 2' : undefined}
        strokeLinejoin="round"
        onPress={() => toggle(s.muscle!)}
      />
    );
  };
  const figure = (shapes: Shape[], label: string) => (
    <View style={styles.figure} accessible={false}>
      <Svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} style={styles.svg}>
        <G>
          <Ellipse {...HEAD} fill={tiers.body} />
          {shapes.map(shape)}
        </G>
      </Svg>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
    </View>
  );

  return (
    <>
      <Card>
        <ThemedText type="small" themeColor={untrained.length ? 'text' : 'textSecondary'}>
          {untrained.length === 0
            ? 'Every muscle group got some work.'
            : `${span ? `Not trained in ${span}` : 'Never trained'}: ${untrained.map((m) => capitalize(m.muscle)).join(', ')}.`}
        </ThemedText>
        <View style={styles.figures} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {figure(FRONT, 'Front')}
          {figure(BACK, 'Back')}
        </View>
        <View style={styles.legend} accessibilityLabel="Sets a week">
          <ThemedText type="small" themeColor="textSecondary">
            Sets / week
          </ThemedText>
          <View style={styles.legendItem}>
            <Swatch color={tiers.none} dashed />
            <ThemedText type="small" themeColor="textSecondary">
              None
            </ThemedText>
          </View>
          {STEP_LABELS.map((label, i) => (
            <View key={label} style={styles.legendItem}>
              <Swatch color={tiers.steps[i]} />
              <ThemedText type="small" themeColor="textSecondary">
                {label}
              </ThemedText>
            </View>
          ))}
        </View>
      </Card>
      <Card>
        {[...trained, ...untrained].map((m) => (
          <MuscleRow
            key={m.muscle}
            volume={m}
            color={color(m.weekly_sets)}
            selected={m.muscle === selected}
            onPress={() => toggle(m.muscle)}
          />
        ))}
        <ThemedText type="small" themeColor="textSecondary">
          Weekly average over {span ?? 'all time'}, from your first workout if that came later. A set counts in full for
          the muscles an exercise mainly works and half for the ones it helps with.
        </ThemedText>
      </Card>
    </>
  );
}

/** A tier's colour in the legend and list; outlined so white shows on a light card. */
function Swatch({ color, dashed }: { color: string; dashed?: boolean }) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.swatch,
        { backgroundColor: color, borderColor: dashed ? theme.textSecondary : theme.backgroundSelected },
        dashed && { borderStyle: 'dashed' },
      ]}
    />
  );
}

function MuscleRow({
  volume: m,
  color,
  selected,
  onPress,
}: {
  volume: MuscleVolume;
  color: string;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const detail =
    m.weekly_sets > 0
      ? `${formatNumber(m.days_per_week)} days / week${m.last_trained ? ` · last ${shortDate(m.last_trained)}` : ''}`
      : m.last_trained
        ? `Last trained ${shortDate(m.last_trained)}`
        : 'Never trained';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        selected && { backgroundColor: theme.backgroundSelected },
        pressed && { opacity: 0.6 },
      ]}>
      <Swatch color={color} dashed={m.weekly_sets <= 0} />
      <View style={{ flex: 1 }}>
        <ThemedText>{capitalize(m.muscle)}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {detail}
        </ThemedText>
      </View>
      <ThemedText type="smallBold" style={styles.num}>
        {m.weekly_sets > 0 ? `${formatNumber(m.weekly_sets)} sets / wk` : '–'}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  figures: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.three,
  },
  figure: {
    flex: 1,
    maxWidth: 160,
    alignItems: 'center',
    gap: Spacing.one,
  },
  svg: {
    width: '100%',
    aspectRatio: WIDTH / HEIGHT,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: Spacing.three,
    rowGap: Spacing.one,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  swatch: {
    width: 12,
    height: 12,
    borderRadius: 3,
    borderWidth: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginHorizontal: -Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: 8,
  },
  num: {
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
});
