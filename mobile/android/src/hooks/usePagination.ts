/**
 * RxGuard Mobile — hooks/usePagination.ts
 *
 * Generic hook for paginated API endpoints (Laravel paginator shape).
 * Handles:
 *   - Initial load
 *   - Pull-to-refresh
 *   - Load-more (infinite scroll)
 *   - Error state per operation
 */

import { useState, useCallback, useRef } from 'react';
import type { PaginatedData } from '@types';
import { ApiError } from '@services/api';

interface UsePaginationOptions<T> {
  /** The API function to call. Must accept { page } and return PaginatedData<T>. */
  fetcher : (params: { page: number } & Record<string, unknown>) => Promise<{ data: PaginatedData<T> }>;
  /** Extra params forwarded to fetcher alongside page. */
  params? : Record<string, unknown>;
}

interface UsePaginationResult<T> {
  data         : T[];
  loading      : boolean;
  refreshing   : boolean;
  loadingMore  : boolean;
  error        : ApiError | null;
  hasMore      : boolean;
  currentPage  : number;
  totalItems   : number;
  load         : () => Promise<void>;
  refresh      : () => Promise<void>;
  loadMore     : () => Promise<void>;
}

export function usePagination<T>({
  fetcher,
  params = {},
}: UsePaginationOptions<T>): UsePaginationResult<T> {
  const [data,       setData      ] = useState<T[]>([]);
  const [loading,    setLoading   ] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore,setLoadingMore] = useState(false);
  const [error,      setError     ] = useState<ApiError | null>(null);
  const [currentPage,setCurrentPage] = useState(1);
  const [lastPage,   setLastPage  ] = useState(1);
  const [total,      setTotal     ] = useState(0);

  const mountedRef = useRef(true);

  const fetchPage = useCallback(async (
    page     : number,
    mode     : 'load' | 'refresh' | 'more',
  ) => {
    if (mode === 'load')    setLoading(true);
    if (mode === 'refresh') setRefreshing(true);
    if (mode === 'more')    setLoadingMore(true);
    setError(null);

    try {
      const res  = await fetcher({ page, ...params });
      const body = res.data;

      if (!mountedRef.current) return;

      setCurrentPage(body.current_page);
      setLastPage(body.last_page);
      setTotal(body.total);
      setData(prev => mode === 'more' ? [...prev, ...body.data] : body.data);

    } catch (err) {
      if (!mountedRef.current) return;
      const apiErr = err instanceof ApiError
        ? err
        : new ApiError(err instanceof Error ? err.message : 'Failed to load data.');
      setError(apiErr);
    } finally {
      if (!mountedRef.current) return;
      if (mode === 'load')    setLoading(false);
      if (mode === 'refresh') setRefreshing(false);
      if (mode === 'more')    setLoadingMore(false);
    }
  }, [fetcher, params]);

  const load    = useCallback(() => fetchPage(1, 'load'),              [fetchPage]);
  const refresh = useCallback(() => fetchPage(1, 'refresh'),           [fetchPage]);
  const loadMore= useCallback(() => {
    if (currentPage < lastPage && !loadingMore) {
      return fetchPage(currentPage + 1, 'more');
    }
    return Promise.resolve();
  }, [fetchPage, currentPage, lastPage, loadingMore]);

  return {
    data,
    loading,
    refreshing,
    loadingMore,
    error,
    hasMore    : currentPage < lastPage,
    currentPage,
    totalItems : total,
    load,
    refresh,
    loadMore,
  };
}