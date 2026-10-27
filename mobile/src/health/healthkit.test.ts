import {
  appleWorkoutName,
  connectHealth,
  healthBodyweight,
  healthHeartRateProfile,
  healthWorkoutReport,
  healthWorkoutsSince,
  isHealthAvailable,
  isoWithOffset,
} from '@/health/healthkit';

// The module is loaded as soon as healthkit.ts is imported, so the mock is built in the factory.
jest.mock('@kingstinct/react-native-healthkit', () => ({
  isHealthDataAvailable: jest.fn(() => true),
  requestAuthorization: jest.fn(async () => true),
  queryWorkoutSamples: jest.fn(),
  queryQuantitySamples: jest.fn(),
  getDateOfBirthAsync: jest.fn(async () => undefined),
}));
const hk = jest.requireMock('@kingstinct/react-native-healthkit');

const at = (iso: string) => new Date(iso);

/** A Health workout as the native module returns it. */
function workout(overrides: Record<string, unknown> = {}) {
  return {
    uuid: 'run-1',
    workoutActivityType: 37, // Running
    startDate: at('2026-10-17T07:00:00+02:00'),
    endDate: at('2026-10-17T07:00:30+02:00'),
    duration: { unit: 's', quantity: 30 },
    totalDistance: { unit: 'meters', quantity: 100 },
    totalEnergyBurned: { unit: 'kJ', quantity: 41.84 },
    metadata: { HKIndoorWorkout: false },
    events: [],
    sourceRevision: { source: { name: 'Apple Watch' } },
    getStatistic: jest.fn(async () => ({ averageQuantity: { quantity: 140.4 }, maximumQuantity: { quantity: 171.6 } })),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  hk.queryQuantitySamples.mockResolvedValue([]);
});

test('Health is available when the native module says so, and not when it throws', () => {
  expect(isHealthAvailable()).toBe(true);
  hk.isHealthDataAvailable.mockImplementationOnce(() => {
    throw new Error('no');
  });
  expect(isHealthAvailable()).toBe(false);
});

test('connecting asks to read workouts, distances, heart rate, weight, resting heart rate and birth date', async () => {
  await connectHealth();
  const { toRead } = (hk.requestAuthorization.mock.calls[0] as unknown as [{ toRead: string[] }])[0];
  expect(toRead).toEqual(
    expect.arrayContaining([
      'HKWorkoutTypeIdentifier',
      'HKQuantityTypeIdentifierDistanceCycling',
      'HKQuantityTypeIdentifierHeartRate',
      'HKQuantityTypeIdentifierBodyMass',
      'HKQuantityTypeIdentifierRestingHeartRate',
      'HKCharacteristicTypeIdentifierDateOfBirth',
    ])
  );
});

test('bodyweight is every weigh-in in kg, keeping the latest of each local day', async () => {
  const sample = (iso: string, quantity: number) => ({ startDate: at(iso), endDate: at(iso), quantity });
  hk.queryQuantitySamples.mockResolvedValue([
    sample('2026-10-15T23:30:00+02:00', 83.2),
    sample('2026-10-16T07:00:00+02:00', 82.4),
    sample('2026-10-16T21:00:00+02:00', 83.0),
    // Past midnight UTC but still the 17th in Warsaw.
    sample('2026-10-17T23:30:00+02:00', 82.37216),
  ]);
  expect(await healthBodyweight()).toEqual([
    { date: '2026-10-15', weight: 83.2 },
    { date: '2026-10-16', weight: 83 },
    { date: '2026-10-17', weight: 82.37 },
  ]);
  expect(hk.queryQuantitySamples).toHaveBeenCalledWith('HKQuantityTypeIdentifierBodyMass', {
    limit: 0,
    ascending: true,
    unit: 'kg',
  });
});

test('a Health workout converts to the API shape, with units normalised', async () => {
  hk.queryWorkoutSamples.mockResolvedValue([workout()]);
  hk.queryQuantitySamples.mockImplementation(async (type: string) =>
    type === 'HKQuantityTypeIdentifierHeartRate'
      ? [{ startDate: at('2026-10-17T07:00:05+02:00'), endDate: at('2026-10-17T07:00:05+02:00'), quantity: 150 }]
      : [{ startDate: at('2026-10-17T07:00:00+02:00'), endDate: at('2026-10-17T07:00:30+02:00'), quantity: 100 }]
  );
  const [imported] = await healthWorkoutsSince(at('2026-10-10T00:00:00Z'), new Set());
  expect(imported).toEqual({
    date: '2026-10-17',
    started_at: '2026-10-17T07:00:00+02:00',
    activity: 'running',
    duration_seconds: 30,
    distance_m: 100,
    energy_kcal: 10,
    avg_heart_rate: 140,
    max_heart_rate: 172,
    swim_strokes: undefined,
    lap_length_m: undefined,
    samples: [
      { t: 0, d: 0 },
      { t: 10, d: 33.3, hr: 150 },
      { t: 20, d: 66.7 },
      { t: 30, d: 100 },
    ],
    laps: undefined,
    source: 'Apple Watch',
    source_uuid: 'run-1',
  });
});

test('workouts that are unsupported, too old or skipped aren’t imported', async () => {
  hk.queryWorkoutSamples.mockResolvedValue([
    workout({ uuid: 'yoga', workoutActivityType: 57 }),
    workout({ uuid: 'old', startDate: at('2026-10-01T07:00:00Z') }),
    workout({ uuid: 'known' }),
    workout({ uuid: 'new' }),
  ]);
  const imported = await healthWorkoutsSince(at('2026-10-10T00:00:00Z'), new Set(['known']));
  expect(imported.map((w) => w.source_uuid)).toEqual(['new']);
});

test('without a total distance, the sampled distance is used', async () => {
  hk.queryWorkoutSamples.mockResolvedValue([workout({ totalDistance: { unit: 'furlong', quantity: 1 } })]);
  hk.queryQuantitySamples.mockImplementation(async (type: string) =>
    type === 'HKQuantityTypeIdentifierHeartRate'
      ? []
      : [{ startDate: at('2026-10-17T07:00:00+02:00'), endDate: at('2026-10-17T07:00:30+02:00'), quantity: 80 }]
  );
  const [imported] = await healthWorkoutsSince(at('2026-10-10T00:00:00Z'), new Set());
  expect(imported.distance_m).toBe(80);
});

test('pool swims use the lap length for every length swum', async () => {
  const lap = (from: string, to: string) => ({ type: 3, startDate: at(from), endDate: at(to) });
  hk.queryWorkoutSamples.mockResolvedValue([
    workout({
      workoutActivityType: 46,
      metadata: { HKSwimmingLocationType: 1, HKLapLength: { unit: 'm', quantity: 25 } },
      totalDistance: { unit: 'yd', quantity: 54.68 },
      events: [
        lap('2026-10-17T07:00:00+02:00', '2026-10-17T07:00:15+02:00'),
        lap('2026-10-17T07:00:15+02:00', '2026-10-17T07:00:30+02:00'),
      ],
    }),
  ]);
  const [swim] = await healthWorkoutsSince(at('2026-10-10T00:00:00Z'), new Set());
  expect(swim).toMatchObject({ activity: 'swimming', lap_length_m: 25, distance_m: 50 });
  expect(swim.laps).toEqual([
    { t: 0, duration: 15, d: 25 },
    { t: 15, duration: 15, d: 25 },
  ]);
});

test('the report explains why each workout is or isn’t offered', async () => {
  hk.queryWorkoutSamples.mockResolvedValue([
    workout({ uuid: 'yoga', workoutActivityType: 57 }),
    workout({ uuid: 'old', startDate: at('2026-10-05T07:00:00Z') }),
    workout({ uuid: 'imported' }),
    workout({ uuid: 'dismissed' }),
    workout({ uuid: 'new' }),
  ]);
  const report = await healthWorkoutReport(at('2026-10-10T00:00:00Z'), new Set(['imported']), new Set(['dismissed']));
  expect(report.map((r) => [r.uuid, r.status, r.name])).toEqual([
    ['yoga', 'unsupported', 'Unsupported workout'],
    ['old', 'too-old', 'Outdoor Run'],
    ['imported', 'imported', 'Outdoor Run'],
    ['dismissed', 'dismissed', 'Outdoor Run'],
    ['new', 'offered', 'Outdoor Run'],
  ]);
  // It looks back a week before the connection too.
  expect(hk.queryWorkoutSamples.mock.calls[0][0].filter.date.startDate).toEqual(at('2026-10-03T00:00:00Z'));
});

test('workout names follow Apple Health', () => {
  expect(appleWorkoutName('running', { HKIndoorWorkout: true })).toBe('Indoor Run');
  expect(appleWorkoutName('cycling')).toBe('Cycle');
  expect(appleWorkoutName('swimming', { HKSwimmingLocationType: 2 })).toBe('Open Water Swim');
  expect(appleWorkoutName('hiking', { HKIndoorWorkout: false })).toBe('Hiking');
  expect(appleWorkoutName(undefined)).toBe('Unsupported workout');
});

test('isoWithOffset keeps local time and the offset in effect that day', () => {
  expect(isoWithOffset(at('2026-10-17T05:00:00Z'))).toBe('2026-10-17T07:00:00+02:00');
  // After the clocks go back.
  expect(isoWithOffset(at('2026-11-02T06:30:15Z'))).toBe('2026-11-02T07:30:15+01:00');
});

test('the heart rate profile is the birth date and resting heart rate averaged over the last 30 days', async () => {
  const born = new Date('1991-03-02T00:00:00');
  hk.getDateOfBirthAsync.mockResolvedValueOnce(born);
  hk.queryQuantitySamples.mockImplementation(async (type: string, options: { limit: number }) =>
    type === 'HKQuantityTypeIdentifierRestingHeartRate' && options.limit === 0
      ? [{ quantity: 54 }, { quantity: 57 }]
      : [{ quantity: 70 }]
  );
  expect(await healthHeartRateProfile()).toEqual({ dateOfBirth: born, restingHeartRate: 56 });
});

test('without recent resting heart rate the profile falls back to the latest reading', async () => {
  hk.queryQuantitySamples.mockImplementation(async (_type: string, options: { limit: number }) =>
    options.limit === 0 ? [] : [{ quantity: 61 }]
  );
  expect(await healthHeartRateProfile()).toEqual({ dateOfBirth: undefined, restingHeartRate: 61 });
});

// Resetting privacy on the phone undoes access while the app still counts
// Health as connected, and reading before asking again fails.
test('reading workouts asks for access first, so access undone in Settings is asked for again', async () => {
  hk.queryWorkoutSamples.mockResolvedValue([]);
  await healthWorkoutsSince(at('2026-10-10T00:00:00Z'), new Set());
  await healthWorkoutReport(at('2026-10-10T00:00:00Z'), new Set(), new Set());
  expect(hk.requestAuthorization).toHaveBeenCalledTimes(2);
  expect(hk.requestAuthorization.mock.invocationCallOrder[0]).toBeLessThan(
    hk.queryWorkoutSamples.mock.invocationCallOrder[0]
  );
});
