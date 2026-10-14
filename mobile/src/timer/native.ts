import Constants, { ExecutionEnvironment } from 'expo-constants';
import type { LiveActivityFactory } from 'expo-widgets';
import { Platform, Vibration } from 'react-native';

import type { RestTimerActivityProps } from '@/timer/rest-timer-activity';
import { endsAt, formatClock, type RunningTimer } from '@/timer/timer-model';

/**
 * Live Activities need a development or release build: Expo Go lacks the
 * widget extension and loading the module throws there.
 */
const activity: LiveActivityFactory<RestTimerActivityProps> | null = (() => {
  if (Platform.OS !== 'ios' || Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
    return null;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@/timer/rest-timer-activity').default;
  } catch {
    return null;
  }
})();

export const lockScreenSupported = activity !== null;

/** Ends every timer Live Activity, including ones left over from a previous launch. */
export function endLiveActivities() {
  if (!activity) return;
  try {
    for (const instance of activity.getInstances()) instance.end('immediate').catch(() => {});
  } catch {}
}

/** Shows the timer on the Lock Screen and in the Dynamic Island. */
export function startLiveActivity(timer: RunningTimer) {
  if (!activity) return;
  endLiveActivities();
  try {
    activity.start(
      { startedAt: timer.startedAt, endsAt: endsAt(timer), target: formatClock(timer.durationMs) },
      'trucker://',
      // The app can't end it while suspended, so it is dimmed once the timer is up.
      new Date(endsAt(timer))
    );
  } catch {
    // The user turned Live Activities off for the app.
  }
}

type NotificationsModule = typeof import('expo-notifications');

const notifications: NotificationsModule | null = (() => {
  if (Platform.OS === 'web') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-notifications');
  } catch {
    return null;
  }
})();

const NOTIFICATION_ID = 'rest-timer';

/**
 * Schedules a vibrating alert for when the timer ends, so it still goes off
 * with the phone locked. In the foreground the app vibrates itself and the
 * alert stays hidden, since no notification handler is set.
 */
export async function scheduleFinishAlert(timer: RunningTimer) {
  if (!notifications || endsAt(timer) <= Date.now()) return;
  try {
    const { granted } = await notifications.requestPermissionsAsync();
    if (!granted) return;
    await notifications.scheduleNotificationAsync({
      identifier: NOTIFICATION_ID,
      content: {
        title: 'Rest over',
        body: `${formatClock(timer.durationMs)} is up. Time for the next set.`,
        sound: 'default',
      },
      trigger: { type: notifications.SchedulableTriggerInputTypes.DATE, date: endsAt(timer) },
    });
  } catch {}
}

export function cancelFinishAlert() {
  notifications?.cancelScheduledNotificationAsync(NOTIFICATION_ID).catch(() => {});
}

/** Three firm buzzes; iOS ignores durations and uses the pauses between them. */
export function vibrate() {
  Vibration.vibrate(Platform.OS === 'android' ? [0, 400, 200, 400, 200, 400] : [0, 500, 500]);
}
