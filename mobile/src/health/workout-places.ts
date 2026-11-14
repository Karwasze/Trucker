import type { Api } from '@/api/client';
import type { CardioWorkout } from '@/api/types';
import { healthWorkoutIndoor } from '@/health/healthkit';

/**
 * Records, from Apple Health, whether workouts imported before their place
 * was kept were indoors, so their distance can be entered and insights say
 * so. Ones Health doesn't say for are left unknown. Returns how many places
 * were recorded.
 */
export async function syncWorkoutPlaces(api: Api, workouts: CardioWorkout[]): Promise<number> {
  let recorded = 0;
  for (const w of workouts) {
    if (w.indoor !== undefined || !w.source_uuid) continue;
    const indoor = await healthWorkoutIndoor(w.source_uuid);
    if (indoor === undefined) continue;
    await api.setCardioPlace(w.id, indoor);
    recorded++;
  }
  return recorded;
}
