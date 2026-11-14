import { createApi } from '@/api/client';
import type { CardioWorkout } from '@/api/types';
import { healthWorkoutIndoor } from '@/health/healthkit';
import { syncWorkoutPlaces } from '@/health/workout-places';
import { mockServer } from '@/test-utils';

jest.mock('@/health/healthkit', () => ({ healthWorkoutIndoor: jest.fn() }));

const api = createApi('http://places:8081');

const ride = (id: number, extra: Partial<CardioWorkout> = {}): CardioWorkout => ({
  id,
  date: '2026-11-01',
  started_at: '2026-11-01T16:44:18+01:00',
  activity: 'cycling',
  duration_seconds: 3600,
  source_uuid: `ride-${id}`,
  ...extra,
});

beforeEach(() => jest.clearAllMocks());

test('records the place Health has for workouts imported before it was kept', async () => {
  const places: Record<string, boolean | undefined> = { 'ride-1': true, 'ride-2': false, 'ride-3': undefined };
  jest.mocked(healthWorkoutIndoor).mockImplementation(async (uuid) => places[uuid]);
  const requests = mockServer({ 'PATCH /api/cardio': {} });

  const workouts = [
    ride(1, { manual_distance: true, distance_m: 30000 }),
    ride(2),
    // Health doesn't say.
    ride(3),
    // Known already, or not from Health.
    ride(4, { indoor: true }),
    ride(5, { source_uuid: undefined }),
  ];
  expect(await syncWorkoutPlaces(api, workouts)).toBe(2);
  expect(healthWorkoutIndoor).toHaveBeenCalledTimes(3);
  expect(requests).toMatchObject([
    { method: 'PATCH', path: '/api/cardio', body: { indoor: true } },
    { method: 'PATCH', path: '/api/cardio', body: { indoor: false } },
  ]);
  expect(requests.map((r) => r.query.get('id'))).toEqual(['1', '2']);
});

test('asks nothing when every place is known', async () => {
  const requests = mockServer({});
  expect(await syncWorkoutPlaces(api, [ride(1, { indoor: false })])).toBe(0);
  expect(healthWorkoutIndoor).not.toHaveBeenCalled();
  expect(requests).toEqual([]);
});
