import { createApi } from '@/api/client';
import { connectHealth, healthHeartRateProfile } from '@/health/healthkit';
import { watchHeartRateZoneStarts } from '@/health/watch-zones';
import { syncHeartRateZones } from '@/health/zones-sync';
import { mockServer, setNow, TEST_ZONES, type Request } from '@/test-utils';

jest.mock('@/health/healthkit', () => ({
  connectHealth: jest.fn(async () => {}),
  healthHeartRateProfile: jest.fn(async () => ({})),
}));
// Before iOS 27 unless a test says otherwise.
jest.mock('@/health/watch-zones', () => ({ watchHeartRateZoneStarts: jest.fn(async () => undefined) }));

const api = createApi('http://zones:8081');
// Age 35 on Oct 27 2026: a max heart rate of 185.
const born = new Date('1991-03-02T00:00:00');

beforeEach(() => {
  jest.clearAllMocks();
  setNow('2026-10-27T09:00:00+01:00');
});
afterEach(() => jest.useRealTimers());

function server(stored: typeof TEST_ZONES | null) {
  return mockServer({
    'GET /api/heart-rate-zones': stored,
    'PUT /api/heart-rate-zones': ({ body }: Request) => ({ ...TEST_ZONES, date: '2026-10-27', ...(body as object) }),
  });
}

test('sends the max and resting heart rate from Health when the server has none', async () => {
  jest.mocked(healthHeartRateProfile).mockResolvedValue({ dateOfBirth: born, restingHeartRate: 55 });
  const requests = server(null);
  const { zones, missing } = await syncHeartRateZones(api, true);
  expect(connectHealth).toHaveBeenCalled();
  expect(requests.find((r) => r.method === 'PUT')?.body).toEqual({ date: '2026-10-27', max_hr: 185, resting_hr: 55 });
  expect(zones?.max_hr).toBe(185);
  expect(missing).toEqual([]);
});

test('sends nothing while Health matches the server', async () => {
  jest.mocked(healthHeartRateProfile).mockResolvedValue({ dateOfBirth: born, restingHeartRate: 55 });
  const requests = server(TEST_ZONES);
  expect((await syncHeartRateZones(api, true)).zones).toEqual(TEST_ZONES);
  expect(requests.some((r) => r.method === 'PUT')).toBe(false);
});

test('updates the server when the resting heart rate changes', async () => {
  jest.mocked(healthHeartRateProfile).mockResolvedValue({ dateOfBirth: born, restingHeartRate: 52 });
  const requests = server(TEST_ZONES);
  expect((await syncHeartRateZones(api, true)).zones?.resting_hr).toBe(52);
  expect(requests.find((r) => r.method === 'PUT')?.body).toEqual({ date: '2026-10-27', max_hr: 185, resting_hr: 52 });
});

test('keeps the server’s zones and says what Health lacks', async () => {
  jest.mocked(healthHeartRateProfile).mockResolvedValue({ restingHeartRate: 55 });
  const requests = server(TEST_ZONES);
  expect(await syncHeartRateZones(api, true)).toEqual({ zones: TEST_ZONES, missing: ['birth date'] });
  expect(requests.some((r) => r.method === 'PUT')).toBe(false);
});

test('without Health it only reads the server’s zones', async () => {
  server(TEST_ZONES);
  expect(await syncHeartRateZones(api, false)).toEqual({ zones: TEST_ZONES, missing: [] });
  expect(healthHeartRateProfile).not.toHaveBeenCalled();
});

describe('from iOS 27', () => {
  const starts = [136.8, 147.6, 158, 169.2];
  const watchZones = { date: '2026-10-20', zone_starts: starts, zones: TEST_ZONES.zones };

  test('sends the zones Apple Watch has in place of working them out', async () => {
    jest.mocked(watchHeartRateZoneStarts).mockResolvedValueOnce(starts);
    jest.mocked(healthHeartRateProfile).mockResolvedValue({ dateOfBirth: born, restingHeartRate: 55 });
    const requests = server(TEST_ZONES);
    const { zones, missing } = await syncHeartRateZones(api, true);
    expect(requests.find((r) => r.method === 'PUT')?.body).toEqual({ date: '2026-10-27', zone_starts: starts });
    expect(zones?.zone_starts).toEqual(starts);
    expect(missing).toEqual([]);
    // Nothing else from Health is needed for them.
    expect(healthHeartRateProfile).not.toHaveBeenCalled();
  });

  test('sends nothing while the watch’s zones match the server’s', async () => {
    jest.mocked(watchHeartRateZoneStarts).mockResolvedValueOnce([...starts]);
    const requests = server(watchZones);
    expect((await syncHeartRateZones(api, true)).zones).toEqual(watchZones);
    expect(requests.some((r) => r.method === 'PUT')).toBe(false);
  });

  test('sends the watch’s zones when they changed', async () => {
    jest.mocked(watchHeartRateZoneStarts).mockResolvedValueOnce([137, 148, 159, 170]);
    const requests = server(watchZones);
    await syncHeartRateZones(api, true);
    expect(requests.find((r) => r.method === 'PUT')?.body).toEqual({
      date: '2026-10-27',
      zone_starts: [137, 148, 159, 170],
    });
  });
});
