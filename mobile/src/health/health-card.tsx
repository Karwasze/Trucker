import { router } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card } from '@/components/ui';
import { syncBodyweight } from '@/health/bodyweight';
import { IMPORT_LOOKBACK_DAYS, useHealthState } from '@/health/health-state';
import { connectHealth, isHealthAvailable } from '@/health/healthkit';
import { useSettings } from '@/settings/settings-context';

/** Settings for importing workouts and bodyweight from Apple Health. */
export function HealthCard() {
  const { api } = useSettings();
  const { state, loaded, connect, disconnect } = useHealthState();
  const [connecting, setConnecting] = useState(false);

  if (!isHealthAvailable()) {
    return (
      <Card>
        <ThemedText type="small" themeColor="textSecondary">
          Apple Health is only available in the iPhone app.
        </ThemedText>
      </Card>
    );
  }

  const onConnect = async () => {
    setConnecting(true);
    try {
      await connectHealth();
      await connect();
      // In the background, so Insights has the bodyweight before Progress is opened.
      syncBodyweight(api).catch(() => {});
    } catch (e) {
      Alert.alert("Couldn't connect Apple Health", (e as Error).message);
    } finally {
      setConnecting(false);
    }
  };

  const confirmDisconnect = () =>
    Alert.alert(
      'Disconnect Apple Health?',
      `Imported workouts and bodyweight are kept. Reconnecting offers workouts from ${IMPORT_LOOKBACK_DAYS} days before then on.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Disconnect', style: 'destructive', onPress: disconnect },
      ]
    );

  if (!loaded) return null;
  if (!state.connectedAt) {
    return (
      <Card>
        <ThemedText type="small" themeColor="textSecondary">
          Import runs, rides and swims recorded on your Apple Watch. Workouts from the last {IMPORT_LOOKBACK_DAYS} days
          on are offered, and you choose which ones to import. Your bodyweight is imported from Health too.
        </ThemedText>
        <Button title="Connect Apple Health" loading={connecting} onPress={onConnect} />
      </Card>
    );
  }
  return (
    <Card>
      <ThemedText>
        Connected since {new Date(state.connectedAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        New workouts show up in History for you to review. To change what Trucker can read, use the Health app: Sharing
        → Apps → Trucker.
      </ThemedText>
      <Button title="Check for new workouts" variant="secondary" onPress={() => router.navigate('/health-import')} />
      <Button title="Disconnect" variant="secondary" compact onPress={confirmDisconnect} />
    </Card>
  );
}
