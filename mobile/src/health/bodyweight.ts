import type { Api } from '@/api/client';
import type { BodyweightEntry } from '@/api/types';
import { connectHealth, healthBodyweight } from '@/health/healthkit';

/**
 * Replaces the server's bodyweight log with every weigh-in in Apple Health,
 * and returns the log, oldest first. Asks for access first, so lifters who
 * connected before weight was read get the prompt. When Health has no
 * weigh-ins (or access to weight was denied, which reads the same) it returns
 * null and leaves the log alone, rather than wiping it.
 */
export async function syncBodyweight(api: Api): Promise<BodyweightEntry[] | null> {
  await connectHealth();
  const [fromHealth, stored] = await Promise.all([healthBodyweight(), api.listBodyweight()]);
  if (fromHealth.length === 0) return null;
  const sorted = [...stored].sort((a, b) => a.date.localeCompare(b.date));
  if (JSON.stringify(sorted) === JSON.stringify(fromHealth)) return sorted;
  return api.replaceBodyweight(fromHealth);
}
