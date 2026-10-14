import { Platform, Vibration } from 'react-native';

import { endsAt, formatClock, type RunningTimer } from '@/timer/timer-model';

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
