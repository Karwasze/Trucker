import type { Api } from '@/api/client';
import { healthRestingHeartRates } from '@/health/healthkit';

/** Days of resting heart rate sent each sync; the server keeps older ones. */
export const RESTING_SYNC_DAYS = 120;

/**
 * Sends each day's resting heart rate over the last RESTING_SYNC_DAYS from
 * Apple Health to the server, for its trend and for heart rate based
 * insights. Days Health has none for are left alone. Returns how many days
 * were sent.
 */
export async function syncRestingHeartRates(api: Api): Promise<number> {
  const readings = await healthRestingHeartRates(RESTING_SYNC_DAYS);
  if (readings.length === 0) return 0;
  await api.saveRestingHeartRates(readings);
  return readings.length;
}
