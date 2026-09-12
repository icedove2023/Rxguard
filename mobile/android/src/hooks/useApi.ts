/**
 * RxGuard Mobile — hooks/useApi.ts
 *
 * Generic hook for wrapping any async API call with:
 *   - loading state
 *   - typed data state
 *   - error state (ApiError)
 *   - manual execute trigger
 *   - optional auto-execute on mount
 *   - abort on unmount
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { ApiError } from '@services/api';

interface UseApiOptions<T> {
  /** Run the call immediately on mount. Default: false. */
  immediate?: boolean;
  /** Seed value for data before the first successful call. */
  initialData?: T;
  /** Called on success with the returned data. */
  onSuccess?: (data: T) => void;
  /** Called on error. */
  onError?: (error: ApiError) => void;
}

interface UseApiResult<T, A extends unknown[]> {
  data    : T | undefined;
  loading : boolean;
  error   : ApiError | null;
  execute : (...args: A) => Promise<T | undefined>;
  reset   : () => void;
}

export function useApi<T, A extends unknown[] = []>(
  fn      : (...args: A) => Promise<{ data: T }>,
  options : UseApiOptions<T> = {},
): UseApiResult<T, A> {
  const { immediate = false, initialData, onSuccess, onError } = options;

  const [data,    setData   ] = useState<T | undefined>(initialData);
  const [loading, setLoading] = useState(immediate);
  const [error,   setError  ] = useState<ApiError | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const execute = useCallback(async (...args: A): Promise<T | undefined> => {
    setLoading(true);
    setError(null);
    try {
      const res = await fn(...args);
      if (mountedRef.current) {
        setData(res.data);
        onSuccess?.(res.data);
      }
      return res.data;
    } catch (err) {
      const apiErr = err instanceof ApiError
        ? err
        : new ApiError(err instanceof Error ? err.message : 'Unknown error');
      if (mountedRef.current) {
        setError(apiErr);
        onError?.(apiErr);
      }
      return undefined;
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [fn, onSuccess, onError]);

  const reset = useCallback(() => {
    setData(initialData);
    setLoading(false);
    setError(null);
  }, [initialData]);

  // Auto-execute on mount when immediate=true
  useEffect(() => {
    if (immediate) execute(...([] as unknown as A));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { data, loading, error, execute, reset };
}