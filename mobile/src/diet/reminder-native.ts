import { Platform } from 'react-native';

import type { ScheduledCheckIn } from '@/diet/reminder-model';

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

const PREFIX = 'diet-check-in:';
const CATEGORY_ID = 'diet-check-in';
const CHANNEL_ID = 'diet-check-in';

/** What a check-in was answered with: from its Yes or No buttons, or by opening it. */
export type CheckInAnswer = { date: string; adhered: boolean | null };

/** Asks for permission to notify; resolves whether it was granted. */
export async function requestReminderPermission() {
  if (!notifications) return false;
  try {
    const { granted } = await notifications.requestPermissionsAsync();
    return granted;
  } catch {
    return false;
  }
}

/** Replaces any scheduled check-ins with `checkIns`, if notifications are allowed. */
export async function scheduleCheckIns(checkIns: ScheduledCheckIn[]) {
  if (!notifications) return;
  try {
    await cancelCheckIns();
    const { granted } = await notifications.getPermissionsAsync();
    if (!granted) return;
    await notifications.setNotificationCategoryAsync(CATEGORY_ID, [
      { identifier: 'yes', buttonTitle: 'Yes', options: { opensAppToForeground: true } },
      { identifier: 'no', buttonTitle: 'No', options: { opensAppToForeground: true } },
    ]);
    if (Platform.OS === 'android') {
      await notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: 'Diet check-in',
        importance: notifications.AndroidImportance.DEFAULT,
      });
    }
    for (const { date, at } of checkIns) {
      await notifications.scheduleNotificationAsync({
        identifier: PREFIX + date,
        content: {
          title: 'Diet check-in',
          body: 'Did you stick to your diet today?',
          categoryIdentifier: CATEGORY_ID,
          data: { dietDate: date },
        },
        trigger: { type: notifications.SchedulableTriggerInputTypes.DATE, date: at, channelId: CHANNEL_ID },
      });
    }
  } catch {}
}

/** Cancels every scheduled check-in. */
export async function cancelCheckIns() {
  if (!notifications) return;
  try {
    const scheduled = await notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled
        .filter((n) => n.identifier.startsWith(PREFIX))
        .map((n) => notifications.cancelScheduledNotificationAsync(n.identifier))
    );
  } catch {}
}

function answerOf(response: import('expo-notifications').NotificationResponse): CheckInAnswer | null {
  const date = response.notification.request.content.data?.dietDate;
  if (typeof date !== 'string') return null;
  const action = response.actionIdentifier;
  return { date, adhered: action === 'yes' ? true : action === 'no' ? false : null };
}

/**
 * Calls `onAnswer` for each check-in answered, including the one that
 * launched the app. Returns a function to stop listening.
 */
export function listenForCheckIns(onAnswer: (answer: CheckInAnswer) => void) {
  if (!notifications) return () => {};
  const handle = (response: import('expo-notifications').NotificationResponse | null) => {
    const answer = response && answerOf(response);
    if (!answer) return;
    // Answered once, so a later launch doesn't record it again.
    notifications.clearLastNotificationResponseAsync().catch(() => {});
    onAnswer(answer);
  };
  notifications.getLastNotificationResponseAsync().then(handle, () => {});
  const subscription = notifications.addNotificationResponseReceivedListener(handle);
  return () => subscription.remove();
}
