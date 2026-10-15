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

type RestActivityModule = typeof import('@/timer/rest-activity');

// Needs the native widget extension, which Expo Go and the web don't have.
const restActivity: RestActivityModule['default'] | null = (() => {
  if (Platform.OS !== 'ios') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return (require('@/timer/rest-activity') as RestActivityModule).default;
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

/**
 * Shows the timer as a Live Activity on the lock screen and in the Dynamic
 * Island, or removes it when there is no timer. Reuses an activity left over
 * from a previous launch instead of stacking another one.
 */
export function syncLiveActivity(timer: RunningTimer | null) {
  if (!restActivity) return;
  try {
    const [current, ...extra] = restActivity.getInstances();
    for (const activity of extra) activity.end('immediate').catch(() => {});
    if (!timer || endsAt(timer) <= Date.now()) {
      current?.end('immediate').catch(() => {});
      return;
    }
    const props = { startedAt: timer.startedAt, endsAt: endsAt(timer) };
    // Past the stale date the activity shows as finished, without the app running.
    const staleDate = new Date(props.endsAt);
    if (current) current.update(props, staleDate).catch(() => {});
    else restActivity.start(props, undefined, staleDate);
  } catch {
    // Live Activities turned off for the app, or unsupported (iOS < 16.2).
  }
}

/** Three firm buzzes; iOS ignores durations and uses the pauses between them. */
export function vibrate() {
  Vibration.vibrate(Platform.OS === 'android' ? [0, 400, 200, 400, 200, 400] : [0, 500, 500]);
}
