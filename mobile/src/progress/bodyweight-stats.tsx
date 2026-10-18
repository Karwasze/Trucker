import { router } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

import { localDate } from '@/api/client';
import type { BodyweightEntry } from '@/api/types';
import { LineChart } from '@/components/line-chart';
import { ThemedText } from '@/components/themed-text';
import { TimespanControl, timespanStart, type Timespan } from '@/components/timespan';
import { Button, Card, Message } from '@/components/ui';
import { syncBodyweight } from '@/health/bodyweight';
import { isHealthAvailable } from '@/health/healthkit';
import { Tile, TileRow } from '@/progress/tile';
import { useSettings } from '@/settings/settings-context';
import { formatDate } from '@/workout/format';

const formatNumber = (n: number) => String(Math.round(n * 10) / 10);

/** Bodyweight log, synced from Apple Health, and chart, shown as a series on the Progress tab. `history` is sorted by date. */
export function BodyweightStats({
  history: all,
  timespan,
  onTimespanChange,
  healthConnected,
  healthSyncing = false,
  healthSyncError = null,
  onSynced,
}: {
  history: BodyweightEntry[];
  timespan: Timespan;
  onTimespanChange: (timespan: Timespan) => void;
  healthConnected: boolean;
  /** Whether the sync on opening is still reading Health. */
  healthSyncing?: boolean;
  /** Why the sync on opening failed, if it did. */
  healthSyncError?: string | null;
  onSynced: () => void;
}) {
  const start = timespanStart(timespan);
  const history = start ? all.filter((e) => e.date >= start) : all;
  const latest = history.at(-1);
  const change = latest ? latest.weight - history[0].weight : 0;

  return (
    <>
      <HealthSync
        connected={healthConnected}
        autoSyncing={healthSyncing}
        autoSyncError={healthSyncError}
        onSynced={onSynced}
      />
      {all.length === 0 ? (
        <Message>No weigh-ins yet.</Message>
      ) : (
        <>
          {latest && (
            <TileRow>
              <Tile label="Current" value={`${formatNumber(latest.weight)} kg`} />
              <Tile
                label={`Since ${formatDate(history[0].date, { month: 'short', day: 'numeric' })}`}
                value={`${change >= 0 ? '+' : ''}${formatNumber(change)} kg`}
              />
            </TileRow>
          )}
          <Card>
            <ThemedText type="smallBold">Bodyweight</ThemedText>
            <TimespanControl value={timespan} onChange={onTimespanChange} />
            {!latest ? (
              <Message>No weigh-ins in the last {timespan.label}.</Message>
            ) : (
              <LineChart
                points={history.map((e) => ({ date: e.date, value: e.weight }))}
                from={start ?? history[0].date}
                to={localDate()}
                unit="kg"
              />
            )}
          </Card>
        </>
      )}
    </>
  );
}

/**
 * Weigh-ins come from Apple Health only: syncing replaces the log with
 * Health's, and without Health the log is read-only.
 */
function HealthSync({
  connected,
  autoSyncing,
  autoSyncError,
  onSynced,
}: {
  connected: boolean;
  autoSyncing: boolean;
  autoSyncError: string | null;
  onSynced: () => void;
}) {
  const { api } = useSettings();
  const [syncing, setSyncing] = useState(false);

  if (!isHealthAvailable()) {
    return (
      <Card>
        <ThemedText type="small" themeColor="textSecondary">
          Bodyweight is imported from Apple Health in the iPhone app.
        </ThemedText>
      </Card>
    );
  }
  if (!connected) {
    return (
      <Card>
        <ThemedText type="small" themeColor="textSecondary">
          Connect Apple Health in Settings to import your weigh-ins.
        </ThemedText>
        <Button title="Open Settings" variant="secondary" onPress={() => router.push('/settings')} />
      </Card>
    );
  }

  const sync = async () => {
    setSyncing(true);
    try {
      if (await syncBodyweight(api)) onSynced();
      else
        Alert.alert(
          'No weigh-ins in Apple Health',
          'Your bodyweight log was left as it is. Check that Trucker can read Weight in the Health app: Sharing → Apps → Trucker.'
        );
    } catch (e) {
      Alert.alert("Couldn't sync bodyweight", (e as Error).message);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Card>
      <ThemedText type="small" themeColor="textSecondary">
        Weigh-ins are imported from Apple Health, replacing your bodyweight log.
      </ThemedText>
      {autoSyncing ? (
        <ThemedText type="small" themeColor="textSecondary">
          Syncing with Apple Health…
        </ThemedText>
      ) : autoSyncError ? (
        <ThemedText type="small" themeColor="textSecondary">
          Couldn’t sync with Apple Health: {autoSyncError}
        </ThemedText>
      ) : null}
      <Button title="Sync from Apple Health" variant="secondary" loading={syncing || autoSyncing} onPress={sync} />
    </Card>
  );
}
