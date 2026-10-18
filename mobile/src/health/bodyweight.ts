import type { Api } from '@/api/client';
import type { BodyweightEntry } from '@/api/types';
import { connectHealth, healthBodyweight } from '@/health/healthkit';

/** How long reading Health's weigh-ins may take before the sync gives up. */
export const HEALTH_TIMEOUT_MS = 20_000;

/**
 * Replaces the server's bodyweight log with every weigh-in in Apple Health,
 * and returns the log, oldest first. Asks for access first, so lifters who
 * connected before weight was read get the prompt. When Health has no
 * weigh-ins (or access to weight was denied, which reads the same) it returns
 * null and leaves the log alone, rather than wiping it. Throws when Health
 * doesn't answer within HEALTH_TIMEOUT_MS, so a stalled read can't hang the sync.
 */
export async function syncBodyweight(api: Api): Promise<BodyweightEntry[] | null> {
  // Not timed: the access prompt waits on the lifter.
  await connectHealth();
  const [fromHealth, stored] = await Promise.all([withTimeout(healthBodyweight()), api.listBodyweight()]);
  if (fromHealth.length === 0) return null;
  const sorted = [...stored].sort((a, b) => a.date.localeCompare(b.date));
  if (JSON.stringify(sorted) === JSON.stringify(fromHealth)) return sorted;
  return api.replaceBodyweight(fromHealth);
}

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error('Apple Health didn’t return your weigh-ins in time.')),
      HEALTH_TIMEOUT_MS
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
