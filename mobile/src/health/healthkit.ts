import { Platform } from 'react-native';

import { localDate } from '@/api/client';
import type { BodyweightEntry, CardioActivity, NewCardioWorkout } from '@/api/types';
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
const BODY_MASS = 'HKQuantityTypeIdentifierBodyMass';

/** Whether Apple Health can be read on this device. */
export function isHealthAvailable(): boolean {
  try {
    return healthkit?.isHealthDataAvailable() ?? false;
  } catch {
    return false;
  }
}

/**
 * Asks for read access to workouts, what they measured and weight. iOS only
 * shows the prompt once per type (asking again just prompts for types added
 * since); afterwards access is changed in the Health app, and reads of
 * denied types just come back empty.
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
      BODY_MASS,
    ],
  });
}

/**
 * Every weigh-in recorded in Health, in kg, oldest first: the latest one of
 * each day in the device's time zone, as the server keeps one per date.
 */
export async function healthBodyweight(): Promise<BodyweightEntry[]> {
  if (!healthkit) return [];
  const samples = await healthkit.queryQuantitySamples(BODY_MASS, { limit: 0, ascending: true, unit: 'kg' });
  const byDate = new Map<string, number>();
  for (const s of samples) byDate.set(localDate(s.startDate), Math.round(s.quantity * 100) / 100);
  return [...byDate].map(([date, weight]) => ({ date, weight }));
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

/** Why a Health workout is or isn't offered for import. */
export type HealthWorkoutStatus = 'offered' | 'too-old' | 'unsupported' | 'imported' | 'dismissed';

export type HealthWorkoutReport = {
  uuid: string;
  start: Date;
  activityType: number;
  activity?: CardioActivity;
  /** The name Apple Health shows, e.g. "Outdoor Run" or "Pool Swim". */
  name: string;
  source?: string;
  status: HealthWorkoutStatus;
};

// HKWorkoutSwimmingLocationType raw values.
const SWIM_POOL = 1;
const SWIM_OPEN_WATER = 2;

/** The workout's name as Apple Health shows it, from its activity and metadata. */
export function appleWorkoutName(activity: CardioActivity | undefined, metadata?: Record<string, unknown>): string {
  const indoor = metadata?.HKIndoorWorkout;
  const place = indoor === true ? 'Indoor' : indoor === false ? 'Outdoor' : undefined;
  switch (activity) {
    case 'running':
      return place ? `${place} Run` : 'Run';
    case 'cycling':
      return place ? `${place} Cycle` : 'Cycle';
    case 'walking':
      return place ? `${place} Walk` : 'Walk';
    case 'hiking':
      return 'Hiking';
    case 'swimming': {
      const location = metadata?.HKSwimmingLocationType;
      return location === SWIM_POOL ? 'Pool Swim' : location === SWIM_OPEN_WATER ? 'Open Water Swim' : 'Swim';
    }
    default:
      return 'Unsupported workout';
  }
}

/**
 * Every Health workout from `lookbackDays` before `since` on, with why each
 * is or isn't offered, for diagnosing workouts that don't show up.
 */
export async function healthWorkoutReport(
  since: Date,
  imported: ReadonlySet<string>,
  dismissed: ReadonlySet<string>,
  lookbackDays = 7
): Promise<HealthWorkoutReport[]> {
  if (!healthkit) return [];
  const from = new Date(since.getTime() - lookbackDays * 24 * 60 * 60 * 1000);
  const workouts = await healthkit.queryWorkoutSamples({
    limit: 0,
    ascending: false,
    filter: { date: { startDate: from } },
  });
  return workouts.map((w) => {
    const activity = ACTIVITIES[w.workoutActivityType];
    const status: HealthWorkoutStatus = !activity
      ? 'unsupported'
      : w.startDate.getTime() < since.getTime()
        ? 'too-old'
        : imported.has(w.uuid)
          ? 'imported'
          : dismissed.has(w.uuid)
            ? 'dismissed'
            : 'offered';
    return {
      uuid: w.uuid,
      start: w.startDate,
      activityType: w.workoutActivityType,
      activity,
      name: appleWorkoutName(activity, w.metadata as Record<string, unknown> | undefined),
      source: w.sourceRevision?.source?.name,
      status,
    };
  });
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
    // Falls back to the distance samples, so an unknown unit can't drop it.
    distance_m: metres(workout.totalDistance) ?? sampledDistance(samples),
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

/** The distance the samples covered, or undefined when they have none. */
function sampledDistance(samples: { d: number }[]): number | undefined {
  const total = samples.at(-1)?.d ?? 0;
  return total > 0 ? total : undefined;
}

const round = (n?: number) => (n === undefined ? undefined : Math.round(n));

function metres(q?: Quantity): number | undefined {
  if (!q) return undefined;
  // The workout's total distance comes as "meters", samples and metadata as "m".
  const factor: Record<string, number> = {
    m: 1,
    meter: 1,
    meters: 1,
    km: 1000,
    cm: 0.01,
    mi: 1609.344,
    yd: 0.9144,
    ft: 0.3048,
  };
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
