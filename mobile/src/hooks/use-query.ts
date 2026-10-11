import { useFocusEffect } from 'expo-router';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';

type QueryState<T> = {
  data: T | undefined;
  error: string | null;
  loading: boolean;
  refreshing: boolean;
  refresh: () => void;
};

/**
 * Loads data whenever the screen gains focus or `key` changes, so tabs stay
 * fresh after edits made elsewhere. `refresh` is for pull-to-refresh. A null
 * key disables the query.
 */
export function useQuery<T>(key: string | null, fetcher: () => Promise<T>): QueryState<T> {
  const [result, setResult] = useState<{ key: string; data: T }>();
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const fetcherRef = useRef(fetcher);
  useLayoutEffect(() => {
    fetcherRef.current = fetcher;
  });
  const requestId = useRef(0);

  const run = useCallback(
    (isRefresh: boolean) => {
      if (key === null) return;
      const id = ++requestId.current;
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      fetcherRef
        .current()
        .then((data) => {
          if (id !== requestId.current) return;
          setResult({ key, data });
          setFailure(null);
        })
        .catch((e: unknown) => {
          if (id !== requestId.current) return;
          setFailure({ key, message: e instanceof Error ? e.message : String(e) });
        })
        .finally(() => {
          if (id !== requestId.current) return;
          setLoading(false);
          setRefreshing(false);
        });
    },
    [key]
  );

  useFocusEffect(
    useCallback(() => {
      run(false);
    }, [run])
  );

  // Results for a different key are stale (e.g. another exercise).
  const data = result?.key === key ? result.data : undefined;
  const error = failure?.key === key ? failure.message : null;
  return { data, error, loading, refreshing, refresh: () => run(true) };
}
