import { Platform } from 'react-native';

import heartRateZones from '../../modules/heart-rate-zones';

/**
 * Where zones 2 and up start (bpm, ascending) as Apple Watch has them in
 * Health, automatic or set by hand; undefined before iOS 27, which added
 * reading them, without any, or when Health can't be read.
 */
export async function watchHeartRateZoneStarts(): Promise<number[] | undefined> {
  if (Platform.OS !== 'ios' || !heartRateZones) return undefined;
  const starts = await heartRateZones.preferredZoneStarts().catch(() => null);
  return starts && starts.length > 0 ? starts : undefined;
}
