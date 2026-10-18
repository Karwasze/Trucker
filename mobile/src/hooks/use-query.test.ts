import { act, renderHook, waitFor } from '@testing-library/react-native';

import { useQuery } from '@/hooks/use-query';

/** A promise and the functions that settle it, to control when a fetch finishes. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

test('loads on mount and reports loading meanwhile', async () => {
  const request = deferred<string>();
  const { result } = await renderHook(() => useQuery('a', () => request.promise));
  expect(result.current).toMatchObject({ data: undefined, loading: true, error: null });
  await act(async () => request.resolve('data'));
  expect(result.current).toMatchObject({ data: 'data', loading: false, error: null });
});

test('errors are reported as messages', async () => {
  const { result } = await renderHook(() => useQuery('a', () => Promise.reject(new Error('Server down'))));
  await waitFor(() => expect(result.current.error).toBe('Server down'));
  expect(result.current.loading).toBe(false);
});

test('a null key disables the query', async () => {
  const fetcher = jest.fn(() => Promise.resolve(1));
  const { result } = await renderHook(() => useQuery(null, fetcher));
  expect(fetcher).not.toHaveBeenCalled();
  expect(result.current).toMatchObject({ data: undefined, loading: false });
});

test('data for a previous key is never shown for a new one', async () => {
  const requests: Record<string, ReturnType<typeof deferred<string>>> = { a: deferred(), b: deferred() };
  const { result, rerender } = await renderHook(
    ({ key }: { key: string }) => useQuery(key, () => requests[key].promise),
    {
      initialProps: { key: 'a' },
    }
  );
  await act(async () => requests.a.resolve('A'));
  expect(result.current.data).toBe('A');

  await rerender({ key: 'b' });
  expect(result.current.data).toBeUndefined();
  await act(async () => requests.b.resolve('B'));
  expect(result.current.data).toBe('B');
});

test('a slow earlier response doesn’t overwrite a newer one', async () => {
  const requests: Record<string, ReturnType<typeof deferred<string>>> = { a: deferred(), b: deferred() };
  const { result, rerender } = await renderHook(
    ({ key }: { key: string }) => useQuery(key, () => requests[key].promise),
    {
      initialProps: { key: 'a' },
    }
  );
  await rerender({ key: 'b' });
  await act(async () => requests.b.resolve('B'));
  await act(async () => requests.a.resolve('A, late'));
  expect(result.current).toMatchObject({ data: 'B', loading: false });
});

test('refresh refetches and reports refreshing, keeping the old data meanwhile', async () => {
  let n = 0;
  const next = deferred<number>();
  const { result } = await renderHook(() => useQuery('a', () => (n++ === 0 ? Promise.resolve(1) : next.promise)));
  await waitFor(() => expect(result.current.data).toBe(1));

  await act(async () => result.current.refresh());
  expect(result.current).toMatchObject({ data: 1, refreshing: true, loading: false });
  await act(async () => next.resolve(2));
  expect(result.current).toMatchObject({ data: 2, refreshing: false });
});
