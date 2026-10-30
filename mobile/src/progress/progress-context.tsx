import { router, useLocalSearchParams } from 'expo-router';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { DEFAULT_TIMESPAN, TIMESPANS, type Timespan } from '@/components/timespan';

type ProgressState = { timespan: Timespan; setTimespan: (timespan: Timespan) => void };

const ProgressContext = createContext<ProgressState | null>(null);

/** Holds the Progress timespan, kept while switching between series. */
export function ProgressProvider({ children }: { children: ReactNode }) {
  const [timespan, setTimespan] = useState<Timespan>(DEFAULT_TIMESPAN);
  return <ProgressContext.Provider value={{ timespan, setTimespan }}>{children}</ProgressContext.Provider>;
}

export function useProgressTimespan() {
  const state = useContext(ProgressContext);
  if (!state) throw new Error('useProgressTimespan must be used within a ProgressProvider');
  return state;
}

/** What a Progress page was opened on from elsewhere, e.g. Insights. */
export type ProgressParams = { exercise?: string; activity?: string; series?: string; span?: string };

/**
 * Calls `open` with the params a Progress page was opened with, applying
 * their timespan too. The series is applied while rendering whenever the
 * params change, then they're cleared, so opening the same series again
 * applies them again. The timespan lives in the Progress layout, so it's set
 * after rendering.
 */
export function useOpenedWith(open: (params: ProgressParams) => void) {
  const { setTimespan } = useProgressTimespan();
  const params = useLocalSearchParams<ProgressParams>();
  const request =
    params.exercise || params.activity || params.series === 'triathlon'
      ? JSON.stringify([params.exercise, params.activity, params.series, params.span])
      : undefined;
  const [appliedRequest, setAppliedRequest] = useState<string>();
  if (request !== appliedRequest) {
    setAppliedRequest(request);
    if (request) open(params);
  }
  const span = request ? TIMESPANS.find((t) => t.key === params.span) : undefined;
  useEffect(() => {
    if (!request) return;
    if (span) setTimespan(span);
    router.setParams({ exercise: undefined, activity: undefined, series: undefined, span: undefined });
  }, [request, span, setTimespan]);
}
