import { Link } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { localDate } from '@/api/client';
import type { Triathlon, TriathlonClass } from '@/api/types';
import { LineChart } from '@/components/line-chart';
import { ThemedText } from '@/components/themed-text';
import { TimespanControl, timespanStart, type Timespan } from '@/components/timespan';
import { Card, Chip, Message, SectionLabel } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { Tile, TileRow } from '@/progress/tile';
import { TriathlonOverview } from '@/triathlon/triathlon-overview';
import { TRIATHLON_CLASS_NAMES, TRIATHLON_CLASSES } from '@/triathlon/triathlon';
import { formatDuration } from '@/workout/format';

/**
 * Triathlons on the Progress tab, one distance class at a time since only
 * those compare: best and latest total, total time per triathlon and the
 * triathlons themselves. `all` is sorted by date.
 */
export function TriathlonStats({
  triathlons: all,
  timespan,
  onTimespanChange,
}: {
  triathlons: Triathlon[];
  timespan: Timespan;
  onTimespanChange: (timespan: Timespan) => void;
}) {
  const classes = TRIATHLON_CLASSES.filter((c) => all.some((t) => t.class === c));
  const [picked, setPicked] = useState<TriathlonClass>();
  // The latest triathlon's class until another is picked.
  const cls = picked && classes.includes(picked) ? picked : (all.at(-1)?.class ?? 'custom');

  const start = timespanStart(timespan);
  const ofClass = all.filter((t) => t.class === cls);
  const triathlons = start ? ofClass.filter((t) => t.date >= start) : ofClass;
  const best = triathlons.reduce<Triathlon | undefined>(
    (b, t) => (!b || t.total_seconds < b.total_seconds ? t : b),
    undefined
  );
  const latest = triathlons.at(-1);

  return (
    <>
      {classes.length > 1 && (
        <View style={styles.chips}>
          {classes.map((c) => (
            <Chip key={c} label={TRIATHLON_CLASS_NAMES[c]} selected={c === cls} onPress={() => setPicked(c)} />
          ))}
        </View>
      )}
      {latest && best && (
        <TileRow>
          <Tile label="Triathlons" value={String(triathlons.length)} />
          <Tile label="Best" value={formatDuration(best.total_seconds)} />
          <Tile label="Latest" value={formatDuration(latest.total_seconds)} />
        </TileRow>
      )}
      <Card>
        <ThemedText type="smallBold">Total time · {TRIATHLON_CLASS_NAMES[cls]}</ThemedText>
        <TimespanControl value={timespan} onChange={onTimespanChange} />
        {triathlons.length === 0 ? (
          <Message>
            No {cls === 'custom' ? 'custom-distance' : TRIATHLON_CLASS_NAMES[cls].toLowerCase()} triathlons in the last{' '}
            {timespan.label}.
          </Message>
        ) : (
          <LineChart
            points={triathlons.map((t) => ({ date: t.date, value: t.total_seconds / 60 }))}
            from={start ?? triathlons[0].date}
            to={localDate()}
            unit="min"
            formatValue={(minutes) => formatDuration(minutes * 60)}
          />
        )}
        {cls === 'custom' && (
          <ThemedText type="small" themeColor="textSecondary">
            Custom distances differ from day to day, so their times don&apos;t compare.
          </ThemedText>
        )}
      </Card>

      {triathlons.length > 0 && (
        <>
          <SectionLabel>Triathlons</SectionLabel>
          {[...triathlons].reverse().map((t) => (
            <Link key={t.date} href={{ pathname: '/history/triathlon/[date]', params: { date: t.date } }} asChild>
              <Pressable style={({ pressed }) => pressed && { opacity: 0.6 }}>
                <Card>
                  <TriathlonOverview triathlon={t} />
                </Card>
              </Pressable>
            </Link>
          ))}
        </>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
});
