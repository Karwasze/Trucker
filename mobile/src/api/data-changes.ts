/**
 * Tells screens showing derived data (insights) that something was saved:
 * a workout, a run, a weigh-in, a diet day. The API client reports every
 * successful write here, whatever kind it was, as they all feed each other.
 */
const listeners = new Set<() => void>();

/** Reports that data on the server changed. */
export function dataChanged() {
  listeners.forEach((listener) => listener());
}

/** Calls `listener` after every change until the returned function is called. */
export function onDataChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
