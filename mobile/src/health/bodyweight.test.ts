import { createApi } from '@/api/client';
import { syncBodyweight } from '@/health/bodyweight';
import { connectHealth, healthBodyweight } from '@/health/healthkit';
import { mockServer, type Request } from '@/test-utils';

jest.mock('@/health/healthkit', () => ({
  connectHealth: jest.fn(async () => {}),
  healthBodyweight: jest.fn(async () => []),
}));

const api = createApi('http://host');
const server = (stored: { date: string; weight: number }[]) =>
  mockServer({
    'GET /api/bodyweight': stored,
    'PUT /api/bodyweight': ({ body }: Request) => body,
  });

beforeEach(() => jest.clearAllMocks());

test('Health’s weigh-ins replace the whole log, after asking for access', async () => {
  const requests = server([
    { date: '2026-10-01', weight: 84 },
    { date: '2026-10-16', weight: 82.4 },
  ]);
  jest.mocked(healthBodyweight).mockResolvedValue([
    { date: '2026-10-16', weight: 82.6 },
    { date: '2026-10-17', weight: 82.2 },
  ]);
  const log = await syncBodyweight(api);
  expect(connectHealth).toHaveBeenCalled();
  expect(requests.find((r) => r.method === 'PUT')?.body).toEqual([
    { date: '2026-10-16', weight: 82.6 },
    { date: '2026-10-17', weight: 82.2 },
  ]);
  expect(log).toEqual([
    { date: '2026-10-16', weight: 82.6 },
    { date: '2026-10-17', weight: 82.2 },
  ]);
});

test('a log that already matches Health isn’t rewritten', async () => {
  const requests = server([
    { date: '2026-10-17', weight: 82.2 },
    { date: '2026-10-16', weight: 82.6 },
  ]);
  jest.mocked(healthBodyweight).mockResolvedValue([
    { date: '2026-10-16', weight: 82.6 },
    { date: '2026-10-17', weight: 82.2 },
  ]);
  expect(await syncBodyweight(api)).toEqual([
    { date: '2026-10-16', weight: 82.6 },
    { date: '2026-10-17', weight: 82.2 },
  ]);
  expect(requests.some((r) => r.method === 'PUT')).toBe(false);
});

// Denied access reads as no weigh-ins, which mustn't wipe the log.
test('without weigh-ins in Health the log is left alone', async () => {
  const requests = server([{ date: '2026-10-16', weight: 82.4 }]);
  jest.mocked(healthBodyweight).mockResolvedValue([]);
  expect(await syncBodyweight(api)).toBeNull();
  expect(requests.some((r) => r.method === 'PUT')).toBe(false);
});
