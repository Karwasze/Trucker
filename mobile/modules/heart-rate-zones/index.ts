import { requireOptionalNativeModule } from 'expo';

type HeartRateZonesModule = {
  /** Where zones 2 and up start (bpm, ascending), or null before iOS 27 or without zones in Health. */
  preferredZoneStarts(): Promise<number[] | null>;
};

/** Null without the native module: Expo Go, Android, the web and tests. */
export default requireOptionalNativeModule<HeartRateZonesModule>('HeartRateZones');
