import { Vibration } from 'react-native';

// The real module, not the stand-in jest.setup gives every other test.
jest.unmock('@/timer/native');

jest.mock('expo-notifications', () => ({
  requestPermissionsAsync: jest.fn(async () => ({ granted: true })),
  scheduleNotificationAsync: jest.fn(async () => 'rest-timer'),
  cancelScheduledNotificationAsync: jest.fn(async () => {}),
  dismissNotificationAsync: jest.fn(async () => {}),
  setNotificationChannelAsync: jest.fn(async () => {}),
  AndroidImportance: { HIGH: 4 },
  SchedulableTriggerInputTypes: { TIME_INTERVAL: 'timeInterval' },
}));

jest.mock('@/timer/rest-activity', () => ({
  __esModule: true,
  default: { getInstances: jest.fn(() => []), start: jest.fn() },
}));

const notifications = jest.requireMock('expo-notifications');
const restActivity = jest.requireMock('@/timer/rest-activity').default;
// Imported after the mocks are registered, as it loads them when imported.
const { cancelFinishAlert, scheduleFinishAlert, syncLiveActivity, vibrate } =
  jest.requireActual<typeof import('@/timer/native')>('@/timer/native');

const NOW = new Date('2026-10-18T10:00:00Z').getTime();
const timer = { startedAt: NOW - 60_000, durationMs: 180_000 };

/** A Live Activity left running, as getInstances returns it. */
const activity = () => ({ end: jest.fn(async () => {}), update: jest.fn(async () => {}) });

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ now: NOW });
});
afterEach(() => jest.useRealTimers());

test('the finish alert goes off when the timer ends, with a time-sensitive buzz', async () => {
  await scheduleFinishAlert(timer);
  expect(notifications.scheduleNotificationAsync).toHaveBeenCalledWith({
    identifier: 'rest-timer',
    content: expect.objectContaining({
      title: 'Rest over',
      body: '3:00 is up. Time for the next set.',
      interruptionLevel: 'timeSensitive',
    }),
    trigger: expect.objectContaining({ type: 'timeInterval', seconds: 120 }),
  });
});

test('no alert without permission, or for a timer already over', async () => {
  notifications.requestPermissionsAsync.mockResolvedValueOnce({ granted: false });
  await scheduleFinishAlert(timer);
  await scheduleFinishAlert({ startedAt: NOW - 200_000, durationMs: 180_000 });
  expect(notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
});

test('a failure to schedule is swallowed', async () => {
  notifications.scheduleNotificationAsync.mockRejectedValueOnce(new Error('denied'));
  await expect(scheduleFinishAlert(timer)).resolves.toBeUndefined();
});

test('cancelling removes both the pending and the delivered alert', () => {
  cancelFinishAlert();
  expect(notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('rest-timer');
  expect(notifications.dismissNotificationAsync).toHaveBeenCalledWith('rest-timer');
});

test('a running timer starts a Live Activity that goes stale at the end', () => {
  syncLiveActivity(timer);
  const end = new Date(NOW + 120_000);
  expect(restActivity.start).toHaveBeenCalledWith(
    { startedAt: timer.startedAt, endsAt: end.getTime() },
    undefined,
    end
  );
});

test('an activity left from a previous launch is reused, and extras ended', () => {
  const current = activity();
  const extra = activity();
  restActivity.getInstances.mockReturnValueOnce([current, extra]);
  syncLiveActivity(timer);
  expect(current.update).toHaveBeenCalled();
  expect(extra.end).toHaveBeenCalledWith('immediate');
  expect(restActivity.start).not.toHaveBeenCalled();
});

test('without a timer the activity ends', () => {
  const current = activity();
  restActivity.getInstances.mockReturnValueOnce([current]);
  syncLiveActivity(null);
  expect(current.end).toHaveBeenCalledWith('immediate');
});

test('Live Activities being off doesn’t break the timer', () => {
  restActivity.getInstances.mockImplementationOnce(() => {
    throw new Error('Live Activities disabled');
  });
  expect(() => syncLiveActivity(timer)).not.toThrow();
});

test('vibrate buzzes once', () => {
  const spy = jest.spyOn(Vibration, 'vibrate').mockImplementation(() => {});
  vibrate();
  expect(spy).toHaveBeenCalledWith(400);
});
