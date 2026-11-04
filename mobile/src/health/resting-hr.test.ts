import { createApi } from '@/api/client';
import { healthRestingHeartRates } from '@/health/healthkit';
import { RESTING_SYNC_DAYS, syncRestingHeartRates } from '@/health/resting-hr';
import { mockServer } from '@/test-utils';

jest.mock('@/health/healthkit', () => ({ healthRestingHeartRates: jest.fn(async () => []) }));

const api = createApi('http://resting:8081');

beforeEach(() => jest.clearAllMocks());

test('sends each day’s resting heart rate from Health', async () => {
  const readings = [
    { date: '2026-10-26', bpm: 52 },
    { date: '2026-10-27', bpm: 51.5 },
  ];
  jest.mocked(healthRestingHeartRates).mockResolvedValueOnce(readings);
  const requests = mockServer({ 'PUT /api/resting-heart-rates': { saved: 2 } });
  expect(await syncRestingHeartRates(api)).toBe(2);
  expect(healthRestingHeartRates).toHaveBeenCalledWith(RESTING_SYNC_DAYS);
  expect(requests).toMatchObject([{ method: 'PUT', path: '/api/resting-heart-rates', body: readings }]);
});

test('sends nothing when Health has no readings', async () => {
  const requests = mockServer({});
  expect(await syncRestingHeartRates(api)).toBe(0);
  expect(requests).toEqual([]);
});
