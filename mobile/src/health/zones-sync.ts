import { localDate, type Api } from '@/api/client';
import type { HeartRateZones } from '@/api/types';
import { connectHealth, healthHeartRateProfile } from '@/health/healthkit';
import { maxHeartRate } from '@/health/zones';

/** What Apple Health lacks to work out heart rate zones from. */
export type MissingForZones = ('birth date' | 'resting heart rate')[];

/** The zones the server judges sessions by, and what Health lacks to update them. */
export type ZonesState = { zones: HeartRateZones | null; missing: MissingForZones };

/**
 * The server's heart rate zones for today, first updated from Apple Health
 * when `fromHealth`: the max heart rate from the birth date (220 less the
 * age) and the resting heart rate, sent only when either changed, so the
 * server keeps a dated history for judging sessions by the zones of their
 * day. Asks for access first, for lifters who connected before these were
 * read.
 */
export async function syncHeartRateZones(api: Api, fromHealth: boolean): Promise<ZonesState> {
  const today = localDate();
  const stored = await api.heartRateZones(today);
  if (!fromHealth) return { zones: stored, missing: [] };

  await connectHealth();
  const { dateOfBirth, restingHeartRate } = await healthHeartRateProfile();
  if (!dateOfBirth || !restingHeartRate) {
    const missing: MissingForZones = [];
    if (!dateOfBirth) missing.push('birth date');
    if (!restingHeartRate) missing.push('resting heart rate');
    return { zones: stored, missing };
  }
  const max = maxHeartRate(dateOfBirth, new Date());
  if (stored && stored.max_hr === max && stored.resting_hr === restingHeartRate) return { zones: stored, missing: [] };
  return { zones: await api.setHeartRateProfile(today, max, restingHeartRate), missing: [] };
}
