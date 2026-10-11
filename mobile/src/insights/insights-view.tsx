import { useState, type ReactNode } from 'react';
import { Alert, StyleSheet, TextInput, View } from 'react-native';

import { localDate } from '@/api/client';
import type { BodyweightEntry, Insights, MuscleVolume, Recommendation, StrengthLevel, VolumeStatus } from '@/api/types';
import { LineChart } from '@/components/line-chart';
import { ThemedText } from '@/components/themed-text';
import { TIMESPANS, TimespanChips, timespanStart, type Timespan } from '@/components/timespan';
import { Button, Card, Message, Screen, SectionLabel } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useQuery } from '@/hooks/use-query';
import { useTheme } from '@/hooks/use-theme';
import { useSettings } from '@/settings/settings-context';
import { formatDate } from '@/workout/format';

// Mirror VolumeLowBelow / VolumeHighAbove in internal/store/insights.go.
const VOLUME_LOW = 10;
const VOLUME_HIGH = 20;

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const formatNumber = (n: number) => String(Math.round(n * 10) / 10);

/** Training analysis and bodyweight log, shown on the Progress tab. */
export function InsightsView({ header }: { header: ReactNode }) {
  const { api, serverUrl } = useSettings();
  const today = localDate();
  const insights = useQuery(`insights:${serverUrl}:${today}`, async () => {
    const [analysis, bodyweight] = await Promise.all([api.insights(today), api.listBodyweight()]);
    return { analysis, bodyweight };
  });

  return (
    <Screen title="Progress" refreshing={insights.refreshing} onRefresh={insights.refresh}>
      {header}
      {!insights.data ? (
        <Message loading={!insights.error} error={insights.error} />
      ) : (
        <InsightsContent
          data={insights.data.analysis}
          bodyweight={insights.data.bodyweight}
          onChange={insights.refresh}
        />
      )}
    </Screen>
  );
}

function InsightsContent({
  data,
  bodyweight,
  onChange,
}: {
  data: Insights;
  bodyweight: BodyweightEntry[];
  onChange: () => void;
}) {
  return (
    <>
      <BodyweightCard data={data} onSaved={onChange} />
      {bodyweight.length > 0 && <BodyweightChart history={bodyweight} today={data.date} />}

      <SectionLabel>Recommendations</SectionLabel>
      <Card>
        {data.recommendations.map((r, i) => (
          <RecommendationRow key={i} recommendation={r} />
        ))}
      </Card>

      <SectionLabel>Weekly sets per muscle</SectionLabel>
      <Card>
        <ThemedText type="small" themeColor="textSecondary">
          Last 4 weeks · {formatNumber(data.sessions_per_week)} sessions a week. Aim for {VOLUME_LOW}–
          {VOLUME_HIGH} sets; secondary muscles count half.
        </ThemedText>
        {data.muscles.map((m) => (
          <VolumeRow
            key={m.muscle}
            volume={m}
            scale={Math.max(VOLUME_HIGH + 5, ...data.muscles.map((v) => v.weekly_sets))}
          />
        ))}
      </Card>

      {data.strength.length > 0 && (
        <>
          <SectionLabel>Strength</SectionLabel>
          <Card>
            {data.strength.map((s) => (
              <StrengthRow key={s.exercise} level={s} />
            ))}
          </Card>
        </>
      )}

      {data.stalled.length > 0 && (
        <>
          <SectionLabel>Stalled lifts</SectionLabel>
          <Card>
            {data.stalled.map((s) => (
              <View key={s.exercise} style={styles.row}>
                <ThemedText style={{ flex: 1 }}>{s.exercise}</ThemedText>
                <ThemedText themeColor="textSecondary" style={styles.num}>
                  {formatNumber(s.previous_1rm)} → {formatNumber(s.recent_1rm)} kg
                </ThemedText>
              </View>
            ))}
          </Card>
        </>
      )}

      {data.untagged.length > 0 && (
        <>
          <SectionLabel>Untagged exercises</SectionLabel>
          <Card>
            <ThemedText>{data.untagged.join(', ')}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              These don&apos;t count towards muscle volume. Tag them in Settings → Muscles.
            </ThemedText>
          </Card>
        </>
      )}
    </>
  );
}

function BodyweightCard({ data, onSaved }: { data: Insights; onSaved: () => void }) {
  const theme = useTheme();
  const { api } = useSettings();
  const [input, setInput] = useState('');
  const [saving, setSaving] = useState(false);
  const bw = data.bodyweight;
  const weight = Number(input.replace(',', '.'));
  const valid = input.trim() !== '' && Number.isFinite(weight) && weight > 0;

  const save = async () => {
    if (!valid) return;
    setSaving(true);
    try {
      await api.saveBodyweight({ date: localDate(), weight });
      setInput('');
      onSaved();
    } catch (e) {
      Alert.alert("Couldn't save bodyweight", (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <ThemedText type="smallBold">Bodyweight</ThemedText>
      {bw ? (
        <View style={styles.row}>
          <ThemedText style={[styles.num, { fontSize: 24, fontWeight: 700 }]}>
            {formatNumber(bw.weight)} kg
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={{ flex: 1 }}>
            {bw.change !== undefined && bw.change_since
              ? `${bw.change >= 0 ? '+' : ''}${formatNumber(bw.change)} kg since ${formatDate(bw.change_since, { month: 'short', day: 'numeric' })}`
              : formatDate(bw.date, { month: 'short', day: 'numeric' })}
          </ThemedText>
        </View>
      ) : (
        <ThemedText type="small" themeColor="textSecondary">
          Add your bodyweight to see how strong your lifts are for your size.
        </ThemedText>
      )}
      <View style={styles.row}>
        <TextInput
          value={input}
          onChangeText={setInput}
          onSubmitEditing={save}
          placeholder={bw?.date === data.date ? `Today: ${formatNumber(bw.weight)} kg` : "Today's weight (kg)"}
          placeholderTextColor={theme.textSecondary}
          keyboardType="decimal-pad"
          returnKeyType="done"
          accessibilityLabel="Today's bodyweight in kilograms"
          style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundSelected }]}
        />
        <Button title="Save" compact disabled={!valid} loading={saving} onPress={save} />
      </View>
    </Card>
  );
}

function BodyweightChart({ history: all, today }: { history: BodyweightEntry[]; today: string }) {
  const [timespan, setTimespan] = useState<Timespan>(TIMESPANS[0]);
  const start = timespanStart(timespan);
  const history = start ? all.filter((e) => e.date >= start) : all;

  return (
    <>
      <TimespanChips value={timespan} onChange={setTimespan} />
      {history.length === 0 ? (
        <Message>No weigh-ins in the last {timespan.label}.</Message>
      ) : (
        <Card>
          <ThemedText type="smallBold">Bodyweight</ThemedText>
          <LineChart
            points={history.map((e) => ({ date: e.date, value: e.weight }))}
            from={start ?? history[0].date}
            to={today}
            unit="kg"
          />
        </Card>
      )}
    </>
  );
}

function RecommendationRow({ recommendation }: { recommendation: Recommendation }) {
  const theme = useTheme();
  const color = {
    warning: theme.warning,
    info: theme.accent,
    good: theme.success,
  }[recommendation.kind];
  return (
    <View style={styles.recommendation}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <ThemedText style={{ flex: 1 }}>{recommendation.text}</ThemedText>
    </View>
  );
}

const STATUS_LABELS: Record<VolumeStatus, string> = {
  untrained: 'None',
  low: 'Low',
  optimal: 'Good',
  high: 'High',
};

function VolumeRow({ volume, scale }: { volume: MuscleVolume; scale: number }) {
  const theme = useTheme();
  const color = {
    untrained: theme.textSecondary,
    low: theme.warning,
    optimal: theme.success,
    high: theme.danger,
  }[volume.status];
  const pct = (n: number) => `${Math.min(100, (n / scale) * 100)}%` as const;

  return (
    <View
      style={styles.row}
      accessible
      accessibilityLabel={`${volume.muscle}: ${formatNumber(volume.weekly_sets)} sets a week, ${STATUS_LABELS[volume.status]}`}>
      <ThemedText type="small" style={styles.muscle}>
        {capitalize(volume.muscle)}
      </ThemedText>
      <View style={[styles.track, { backgroundColor: theme.backgroundSelected }]}>
        <View
          style={[
            styles.band,
            {
              left: pct(VOLUME_LOW),
              width: pct(VOLUME_HIGH - VOLUME_LOW),
              backgroundColor: `${theme.success}33`,
            },
          ]}
        />
        <View style={[styles.fill, { width: pct(volume.weekly_sets), backgroundColor: color }]} />
      </View>
      <ThemedText type="small" style={[styles.num, { width: 32 }]}>
        {formatNumber(volume.weekly_sets)}
      </ThemedText>
      <ThemedText type="small" style={{ width: 40, color }}>
        {STATUS_LABELS[volume.status]}
      </ThemedText>
    </View>
  );
}

function StrengthRow({ level }: { level: StrengthLevel }) {
  return (
    <View style={styles.strength}>
      <View style={styles.row}>
        <ThemedText style={{ flex: 1 }}>{level.exercise}</ThemedText>
        <ThemedText type="smallBold">{level.level ? capitalize(level.level) : 'Below beginner'}</ThemedText>
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        {formatNumber(level.best_1rm)} kg est. 1RM · {level.ratio.toFixed(2)}× BW
        {level.next_level ? ` · +${formatNumber(level.next_level_kg)} kg to ${level.next_level}` : ''}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  input: {
    flex: 1,
    height: 36,
    borderRadius: 10,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
  },
  recommendation: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 8,
  },
  muscle: {
    width: 84,
  },
  track: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  band: {
    position: 'absolute',
    top: 0,
    bottom: 0,
  },
  fill: {
    height: '100%',
    borderRadius: 4,
  },
  strength: {
    gap: Spacing.half,
  },
  num: {
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
});
