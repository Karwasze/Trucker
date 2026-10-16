import { Platform } from 'react-native';

import { localDate } from '@/api/client';
import type { CardioActivity, NewCardioWorkout } from '@/api/types';
import { bucketSamples, lapsFrom, type Reading } from '@/health/samples';

type HealthKitModule = typeof import('@kingstinct/react-native-healthkit');
type Workout = Awaited<ReturnType<HealthKitModule['queryWorkoutSamples']>>[number];
type Quantity = { unit: string; quantity: number };

// Needs the native module, which Expo Go, Android and the web don't have.
const healthkit: HealthKitModule | null = (() => {
  if (Platform.OS !== 'ios') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@kingstinct/react-native-healthkit');
  } catch {
    return null;
  }
})();

// HKWorkoutActivityType raw values, so the enum doesn't load the native module.
const ACTIVITIES: Record<number, CardioActivity> = {
  37: 'running',
  13: 'cycling',
  46: 'swimming',
  52: 'walking',
  24: 'hiking',
};

// HKWorkoutEventType raw values.
const EVENT_LAP = 3;
const EVENT_SEGMENT = 7;

const DISTANCE = {
  running: 'HKQuantityTypeIdentifierDistanceWalkingRunning',
  walking: 'HKQuantityTypeIdentifierDistanceWalkingRunning',
  hiking: 'HKQuantityTypeIdentifierDistanceWalkingRunning',
  cycling: 'HKQuantityTypeIdentifierDistanceCycling',
  swimming: 'HKQuantityTypeIdentifierDistanceSwimming',
} as const satisfies Record<CardioActivity, string>;

const HEART_RATE = 'HKQuantityTypeIdentifierHeartRate';

/** Whether Apple Health can be read on this device. */
export function isHealthAvailable(): boolean {
  try {
    return healthkit?.isHealthDataAvailable() ?? false;
  } catch {
    return false;
  }
}

/**
 * Asks for read access to workouts and what they measured. iOS only shows
 * the prompt once; afterwards access is changed in the Health app, and
 * reads of denied types just come back empty.
 */
export async function connectHealth(): Promise<void> {
  if (!healthkit) throw new Error('Apple Health is only available in the iOS app.');
  await healthkit.requestAuthorization({
    toRead: [
      'HKWorkoutTypeIdentifier',
      'HKQuantityTypeIdentifierDistanceWalkingRunning',
      'HKQuantityTypeIdentifierDistanceCycling',
      'HKQuantityTypeIdentifierDistanceSwimming',
      'HKQuantityTypeIdentifierActiveEnergyBurned',
      'HKQuantityTypeIdentifierSwimmingStrokeCount',
      HEART_RATE,
    ],
  });
}

/**
 * Health workouts of a known activity that started at or after `since`,
 * oldest first, leaving out the ones whose UUID is in `skip` before reading
 * their samples.
 */
export async function healthWorkoutsSince(since: Date, skip: ReadonlySet<string>): Promise<NewCardioWorkout[]> {
  if (!healthkit) return [];
  const workouts = await healthkit.queryWorkoutSamples({
    limit: 0,
    ascending: true,
    filter: { date: { startDate: since } },
  });
  const imported: NewCardioWorkout[] = [];
  for (const workout of workouts) {
    const activity = ACTIVITIES[workout.workoutActivityType];
    if (activity && workout.startDate.getTime() >= since.getTime() && !skip.has(workout.uuid)) {
      imported.push(await toCardioWorkout(healthkit, workout, activity));
    }
  }
  return imported;
}

async function toCardioWorkout(
  hk: HealthKitModule,
  workout: Workout,
  activity: CardioActivity
): Promise<NewCardioWorkout> {
  const start = workout.startDate.getTime();
  const end = workout.endDate.getTime();

  const [distanceSamples, heartRateSamples, heartRate] = await Promise.all([
    hk
      .queryQuantitySamples(DISTANCE[activity], { limit: 0, ascending: true, unit: 'm', filter: { workout } })
      .catch(() => []),
    hk
      .queryQuantitySamples(HEART_RATE, { limit: 0, ascending: true, unit: 'count/min', filter: { workout } })
      .catch(() => []),
    workout.getStatistic(HEART_RATE, 'count/min').catch(() => undefined),
  ]);
  const reading = (s: { startDate: Date; endDate: Date; quantity: number }): Reading => ({
    start: s.startDate.getTime(),
    end: s.endDate.getTime(),
    value: s.quantity,
  });
  const samples = bucketSamples(start, end, distanceSamples.map(reading), heartRateSamples.map(reading));

  // Swims mark every pool length as a lap; other workouts mark segments
  // (or laps) when the lifter does.
  const events = (workout.events ?? []).map((e) => ({
    type: e.type as number,
    start: e.startDate.getTime(),
    end: e.endDate.getTime(),
  }));
  const segments = events.filter((e) => e.type === EVENT_SEGMENT);
  const lapEvents =
    activity === 'swimming' || segments.length === 0 ? events.filter((e) => e.type === EVENT_LAP) : segments;
  const lapLength = metres(workout.metadata?.HKLapLength as Quantity | undefined);
  const laps = lapsFrom(start, lapEvents, samples).map((lap) =>
    activity === 'swimming' && lapLength ? { ...lap, d: lapLength } : lap
  );

  return {
    date: localDate(workout.startDate),
    started_at: isoWithOffset(workout.startDate),
    activity,
    duration_seconds: seconds(workout.duration) ?? (end - start) / 1000,
    distance_m: metres(workout.totalDistance),
    energy_kcal: kilocalories(workout.totalEnergyBurned),
    avg_heart_rate: round(heartRate?.averageQuantity?.quantity),
    max_heart_rate: round(heartRate?.maximumQuantity?.quantity),
    swim_strokes: round(workout.totalSwimmingStrokeCount?.quantity),
    lap_length_m: lapLength,
    samples: distanceSamples.length > 0 || heartRateSamples.length > 0 ? samples : undefined,
    laps: laps.length > 0 ? laps : undefined,
    source: workout.sourceRevision?.source?.name,
    source_uuid: workout.uuid,
  };
}

const round = (n?: number) => (n === undefined ? undefined : Math.round(n));

function metres(q?: Quantity): number | undefined {
  if (!q) return undefined;
  const factor: Record<string, number> = { m: 1, km: 1000, cm: 0.01, mi: 1609.344, yd: 0.9144, ft: 0.3048 };
  const f = factor[q.unit];
  return f === undefined ? undefined : Math.round(q.quantity * f * 10) / 10;
}

function seconds(q?: Quantity): number | undefined {
  if (!q) return undefined;
  const factor: Record<string, number> = { s: 1, min: 60, hr: 3600, h: 3600, ms: 0.001 };
  const f = factor[q.unit];
  return f === undefined ? undefined : q.quantity * f;
}

function kilocalories(q?: Quantity): number | undefined {
  if (!q) return undefined;
  const factor: Record<string, number> = { kcal: 1, Cal: 1, cal: 0.001, kJ: 1 / 4.184, J: 1 / 4184 };
  const f = factor[q.unit];
  return f === undefined ? undefined : Math.round(q.quantity * f);
}

/** An RFC3339 timestamp in the device's time zone, e.g. 2026-10-16T07:05:00+02:00. */
export function isoWithOffset(d: Date): string {
  const pad = (n: number) => String(Math.floor(Math.abs(n))).padStart(2, '0');
  const offset = -d.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  return (
    `${localDate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    `${sign}${pad(offset / 60)}:${pad(offset % 60)}`
  );
}
