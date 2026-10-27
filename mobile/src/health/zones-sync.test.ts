import { createApi } from '@/api/client';
import { connectHealth, healthHeartRateProfile } from '@/health/healthkit';
import { syncHeartRateZones } from '@/health/zones-sync';
import { mockServer, setNow, TEST_ZONES, type Request } from '@/test-utils';

jest.mock('@/health/healthkit', () => ({
  connectHealth: jest.fn(async () => {}),
  healthHeartRateProfile: jest.fn(async () => ({})),
}));

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
    'PUT /api/heart-rate-zones': ({ body }: Request) => {
      const { max_hr, resting_hr } = body as { max_hr: number; resting_hr: number };
      return { ...TEST_ZONES, date: '2026-10-27', max_hr, resting_hr };
    },
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
