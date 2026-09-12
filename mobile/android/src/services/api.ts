/**
 * RxGuard Mobile — services/api.ts
 *
 * Centralised Axios HTTP client.
 * Mirrors the fetch-based api.js from the web frontend,
 * adapted for React Native with:
 *   - Axios instance with base URL + default headers
 *   - Request interceptor: injects Bearer token from MMKV
 *   - Response interceptor: transparent token refresh on 401
 *   - Typed ApiError with validation error helpers
 *   - Offline detection via NetInfo
 */

import axios, {
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from 'axios';
import axiosRetry from 'axios-retry';
import NetInfo from '@react-native-community/netinfo';
import { MMKV } from 'react-native-mmkv';

import { API_BASE_URL, STORAGE_KEYS, TIMEOUTS } from '@constants';
import type { ApiResponse } from '@types';

/* ─────────────────────────────────────────────────────────────────
   MMKV storage  (synchronous, faster than AsyncStorage)
───────────────────────────────────────────────────────────────── */

export const storage = new MMKV({ id: 'rxguard-storage' });

export const TokenStore = {
  getAccess      : ()        => storage.getString(STORAGE_KEYS.ACCESS_TOKEN)  ?? null,
  getRefresh     : ()        => storage.getString(STORAGE_KEYS.REFRESH_TOKEN) ?? null,
  setTokens      : (a: string, r: string) => {
    storage.set(STORAGE_KEYS.ACCESS_TOKEN,  a);
    storage.set(STORAGE_KEYS.REFRESH_TOKEN, r);
  },
  clearTokens    : ()        => {
    storage.delete(STORAGE_KEYS.ACCESS_TOKEN);
    storage.delete(STORAGE_KEYS.REFRESH_TOKEN);
    storage.delete(STORAGE_KEYS.USER);
  },
  getUser        : <T = unknown>(): T | null => {
    const raw = storage.getString(STORAGE_KEYS.USER);
    if (!raw) return null;
    try { return JSON.parse(raw) as T; } catch { return null; }
  },
  setUser        : (user: unknown) => storage.set(STORAGE_KEYS.USER, JSON.stringify(user)),
};

/* ─────────────────────────────────────────────────────────────────
   Custom error class
───────────────────────────────────────────────────────────────── */

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number        = 0,
    public readonly validationErrors: Record<string, string[]> | null = null,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** First validation error message for a specific field */
  fieldError(field: string): string | null {
    return this.validationErrors?.[field]?.[0] ?? null;
  }

  /** All validation errors flattened to { field: firstMessage } */
  allFieldErrors(): Record<string, string> {
    if (!this.validationErrors) return {};
    return Object.fromEntries(
      Object.entries(this.validationErrors).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])
    );
  }

  get isNetworkError() { return this.status === 0; }
  get isAuthError()    { return this.status === 401; }
  get isForbidden()    { return this.status === 403; }
  get isNotFound()     { return this.status === 404; }
  get isServerError()  { return this.status >= 500; }
}

/* ─────────────────────────────────────────────────────────────────
   Axios instance
───────────────────────────────────────────────────────────────── */

const apiClient: AxiosInstance = axios.create({
  baseURL        : API_BASE_URL,
  timeout        : TIMEOUTS.DEFAULT,
  headers        : {
    'Accept'      : 'application/json',
    'Content-Type': 'application/json',
    'X-Platform'  : 'android',
  },
});

/* ── Retry: 3 attempts on network errors and 5xx only ── */
axiosRetry(apiClient, {
  retries           : 3,
  retryDelay        : axiosRetry.exponentialDelay,
  retryCondition    : err =>
    axiosRetry.isNetworkError(err) ||
    (err.response?.status !== undefined && err.response.status >= 500),
});

/* ─────────────────────────────────────────────────────────────────
   Request interceptor — inject access token
───────────────────────────────────────────────────────────────── */

apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = TokenStore.getAccess();
    if (token && config.headers) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
  },
  error => Promise.reject(error),
);

/* ─────────────────────────────────────────────────────────────────
   Response interceptor — refresh on 401, normalise errors
───────────────────────────────────────────────────────────────── */

let _refreshing    = false;
let _refreshQueue: Array<(token: string | null) => void> = [];

async function drainRefreshQueue(token: string | null) {
  _refreshQueue.forEach(cb => cb(token));
  _refreshQueue = [];
}

apiClient.interceptors.response.use(
  (response: AxiosResponse) => response,

  async error => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    /* ── Offline ── */
    const netState = await NetInfo.fetch();
    if (!netState.isConnected) {
      return Promise.reject(
        new ApiError('No network connection. Check your internet and try again.', 0, null, 'NETWORK_ERROR')
      );
    }

    /* ── 401: attempt token refresh once ── */
    if (error.response?.status === 401 && !originalRequest._retry) {
      if (_refreshing) {
        // Queue requests that arrive while refresh is in flight
        return new Promise((resolve, reject) => {
          _refreshQueue.push(newToken => {
            if (newToken) {
              originalRequest.headers['Authorization'] = `Bearer ${newToken}`;
              resolve(apiClient(originalRequest));
            } else {
              reject(new ApiError('Session expired. Please log in again.', 401));
            }
          });
        });
      }

      originalRequest._retry = true;
      _refreshing             = true;

      const refreshToken = TokenStore.getRefresh();

      if (!refreshToken) {
        _refreshing = false;
        TokenStore.clearTokens();
        await drainRefreshQueue(null);
        return Promise.reject(new ApiError('Session expired.', 401));
      }

      try {
        const res = await axios.post<ApiResponse<{
          access_token: string;
          refresh_token: string;
        }>>(`${API_BASE_URL}/auth/refresh`, { refresh_token: refreshToken });

        const { access_token, refresh_token } = res.data.data;
        TokenStore.setTokens(access_token, refresh_token);

        apiClient.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;
        originalRequest.headers['Authorization']           = `Bearer ${access_token}`;

        await drainRefreshQueue(access_token);
        return apiClient(originalRequest);

      } catch {
        TokenStore.clearTokens();
        await drainRefreshQueue(null);
        return Promise.reject(new ApiError('Session expired. Please log in again.', 401));

      } finally {
        _refreshing = false;
      }
    }

    /* ── Normalise all other errors ── */
    return Promise.reject(normaliseError(error));
  }
);

function normaliseError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;

  if (axios.isAxiosError(error)) {
    const status  = error.response?.status ?? 0;
    const body    = error.response?.data as Partial<ApiResponse<unknown>> | undefined;
    const message = body?.message ?? error.message ?? 'An unexpected error occurred.';
    const valErrors = (body?.errors as Record<string, string[]>) ?? null;

    if (status === 422 && valErrors) {
      return new ApiError('Validation failed.', 422, valErrors, 'VALIDATION_ERROR');
    }
    if (status === 403) {
      return new ApiError(message || 'You do not have permission.', 403, null, 'FORBIDDEN');
    }
    if (status === 404) {
      return new ApiError(message || 'Resource not found.', 404, null, 'NOT_FOUND');
    }
    if (status >= 500) {
      return new ApiError('A server error occurred. Please try again.', status, null, 'SERVER_ERROR');
    }
    return new ApiError(message, status, valErrors);
  }

  const msg = error instanceof Error ? error.message : 'Unknown error';
  return new ApiError(msg, 0, null, 'UNKNOWN');
}

/* ─────────────────────────────────────────────────────────────────
   Typed convenience methods
───────────────────────────────────────────────────────────────── */

export async function get<T>(
  path: string,
  params?: Record<string, unknown>,
  config?: AxiosRequestConfig,
): Promise<ApiResponse<T>> {
  const res = await apiClient.get<ApiResponse<T>>(path, { params, ...config });
  return res.data;
}

export async function post<T>(
  path: string,
  body?: unknown,
  config?: AxiosRequestConfig,
): Promise<ApiResponse<T>> {
  const res = await apiClient.post<ApiResponse<T>>(path, body, config);
  return res.data;
}

export async function put<T>(
  path: string,
  body?: unknown,
  config?: AxiosRequestConfig,
): Promise<ApiResponse<T>> {
  const res = await apiClient.put<ApiResponse<T>>(path, body, config);
  return res.data;
}

export async function del<T>(
  path: string,
  config?: AxiosRequestConfig,
): Promise<ApiResponse<T>> {
  const res = await apiClient.delete<ApiResponse<T>>(path, config);
  return res.data;
}

export async function upload<T>(
  path: string,
  formData: FormData,
  onUploadProgress?: (pct: number) => void,
): Promise<ApiResponse<T>> {
  const res = await apiClient.post<ApiResponse<T>>(path, formData, {
    timeout: TIMEOUTS.UPLOAD,
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: event => {
      if (onUploadProgress && event.total) {
        onUploadProgress(Math.round((event.loaded / event.total) * 100));
      }
    },
  });
  return res.data;
}

export default apiClient;