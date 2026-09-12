/**
 * RxGuard API Client — api.js
 *
 * Centralised HTTP client for all backend API calls.
 * Handles: JWT token storage & refresh, request/response
 * interceptors, error normalisation, and CSRF protection.
 */

'use strict';

// -----------------------------------------------------------------------
// Configuration
// -----------------------------------------------------------------------
const API_BASE     = (window.RXGUARD_CONFIG?.apiBase) || 'http://localhost:8000/api/v1';
const TOKEN_KEY    = 'rxguard_access_token';
const REFRESH_KEY  = 'rxguard_refresh_token';
const USER_KEY     = 'rxguard_user';

// -----------------------------------------------------------------------
// Token helpers
// -----------------------------------------------------------------------
const TokenStore = {
  getAccess  : ()    => localStorage.getItem(TOKEN_KEY),
  getRefresh : ()    => localStorage.getItem(REFRESH_KEY),
  setTokens  : (a,r) => { localStorage.setItem(TOKEN_KEY, a); localStorage.setItem(REFRESH_KEY, r); },
  clearTokens: ()    => { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(REFRESH_KEY); localStorage.removeItem(USER_KEY); },
  setUser    : (u)   => localStorage.setItem(USER_KEY, JSON.stringify(u)),
  getUser    : ()    => { try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch { return null; } },
};

// -----------------------------------------------------------------------
// Core fetch wrapper
// -----------------------------------------------------------------------

let _refreshPromise = null;   // Deduplicate concurrent refresh calls

/**
 * Make an authenticated API request.
 *
 * @param {string} endpoint      — path relative to API_BASE (e.g. '/auth/me')
 * @param {object} [options]     — fetch options override
 * @param {boolean} [retry=true] — retry once after token refresh
 */
async function apiRequest(endpoint, options = {}, retry = true) {
  const url     = `${API_BASE}${endpoint}`;
  const token   = TokenStore.getAccess();

  const headers = {
    'Accept'      : 'application/json',
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) headers['Authorization'] = `Bearer ${token}`;

  // FormData requests must NOT have Content-Type set (browser adds boundary)
  if (options.body instanceof FormData) {
    delete headers['Content-Type'];
  }

  let response;
  try {
    response = await fetch(url, { ...options, headers });
  } catch (networkError) {
    console.error(networkError);
    throw new RxGuardApiError('Network error. Please check your connection.', 0);
  }

  // Token expired → attempt refresh, then retry once
  if (response.status === 401 && retry) {
    const refreshed = await attemptTokenRefresh();
    if (refreshed) {
      return apiRequest(endpoint, options, false);
    } else {
      TokenStore.clearTokens();
      window.dispatchEvent(new CustomEvent('rxguard:unauthenticated'));
      throw new RxGuardApiError('Session expired. Please log in again.', 401);
    }
  }

  // Parse response body
  let data;
  const contentType = response.headers.get('Content-Type') || '';
  if (contentType.includes('application/json')) {
    data = await response.json();
  } else {
    data = { message: await response.text() };
  }

  if (!response.ok) {
    const message = data.message || data.error || `Request failed (${response.status})`;
    const error   = new RxGuardApiError(message, response.status, data.errors);
    throw error;
  }

  return data;
}

async function attemptTokenRefresh() {
  if (_refreshPromise) return _refreshPromise;

  _refreshPromise = (async () => {
    const refreshToken = TokenStore.getRefresh();
    if (!refreshToken) return false;

    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method : 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body   : JSON.stringify({ refresh_token: refreshToken }),
      });

      if (!res.ok) return false;

      const data = await res.json();
      TokenStore.setTokens(data.data.access_token, data.data.refresh_token);
      return true;
    } catch {
      return false;
    } finally {
      _refreshPromise = null;
    }
  })();

  return _refreshPromise;
}


// -----------------------------------------------------------------------
// Custom error class
// -----------------------------------------------------------------------
class RxGuardApiError extends Error {
  constructor(message, status = 0, validationErrors = null) {
    super(message);
    this.name             = 'RxGuardApiError';
    this.status           = status;
    this.validationErrors = validationErrors;
  }

  /** Return the first validation error for a given field. */
  fieldError(field) {
    return this.validationErrors?.[field]?.[0] ?? null;
  }

  /** Return all validation errors as a flat object { field: message }. */
  allFieldErrors() {
    if (!this.validationErrors) return {};
    const flat = {};
    for (const [field, msgs] of Object.entries(this.validationErrors)) {
      flat[field] = Array.isArray(msgs) ? msgs[0] : msgs;
    }
    return flat;
  }
}

// -----------------------------------------------------------------------
// Convenience HTTP methods
// -----------------------------------------------------------------------
const get    = (path, params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return apiRequest(qs ? `${path}?${qs}` : path, { method: 'GET' });
};

const post   = (path, body = {}) => apiRequest(path, {
  method: 'POST',
  body  : body instanceof FormData ? body : JSON.stringify(body),
});

const put    = (path, body = {}) => apiRequest(path, {
  method: 'PUT',
  body  : JSON.stringify(body),
});

const del    = (path, body = null) => apiRequest(path, {
  method: 'DELETE',
  ...(body ? { body: JSON.stringify(body) } : {}),
});

// -----------------------------------------------------------------------
// Auth API
// -----------------------------------------------------------------------
const Auth = {
  async register(payload) {
    const data = await post('/auth/register', payload);
    if (data.data?.access_token) {
      TokenStore.setTokens(data.data.access_token, data.data.refresh_token);
      TokenStore.setUser(data.data.user);
    }
    return data;
  },

  async login(email, password) {
    const data = await post('/auth/login', { email, password });
    if (data.data?.access_token) {
      TokenStore.setTokens(data.data.access_token, data.data.refresh_token);
      TokenStore.setUser(data.data.user);
    }
    return data;
  },

  async logout() {
    try { await post('/auth/logout'); } catch {}
    TokenStore.clearTokens();
    window.location.href = '/pages/login.html';
  },

  async me() {
    const data = await get('/auth/me');
    TokenStore.setUser(data.data);
    return data.data;
  },

  // Sends a Supabase password-recovery email (delivered via Resend).
  async forgotPassword(email) { return post('/auth/forgot-password', { email }); },

  // `accessToken` comes from the Supabase recovery link's URL fragment
  // (see auth-callback.html), not a locally-issued token.
  async resetPassword(accessToken, password, confirmPassword) {
    return post('/auth/reset-password', {
      access_token: accessToken,
      password,
      password_confirmation: confirmPassword,
    });
  },

  async resendConfirmation(email) { return post('/auth/resend-confirmation', { email }); },

  isAuthenticated : ()  => !!TokenStore.getAccess(),
  currentUser     : ()  => TokenStore.getUser(),
  currentRole     : ()  => TokenStore.getUser()?.role ?? null,
  isAdmin         : ()  => Auth.currentRole() === 'admin',
  isProfessional  : ()  => ['pharmacist','physician'].includes(Auth.currentRole()),
};

// -----------------------------------------------------------------------
// Prescriptions API
// -----------------------------------------------------------------------
const Prescriptions = {
  list   : (params = {}) => get('/prescriptions', params),
  show   : (id)          => get(`/prescriptions/${id}`),
  destroy: (id)          => del(`/prescriptions/${id}`),
  // Returns a blob object-URL for the private scan image (auth header
  // required — a plain <img src> can't include it, so we fetch as a
  // blob). Caller should URL.revokeObjectURL() when done with it.
  async fetchScanBlobUrl(id) {
    const res = await fetch(`${API_BASE}/prescriptions/${id}/scan`, {
      headers: { Authorization: `Bearer ${TokenStore.getAccess()}` },
    });
    if (!res.ok) throw new Error('Could not load scan image');
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  },

  async upload(file) {
    const fd = new FormData();
    fd.append('prescription', file);
    return post('/prescriptions/upload', fd);
  },

  // Step 2 — Tesseract OCR (free, open-source, CLI-based)
  extract: (id) => post(`/prescriptions/${id}/extract`),

  // Step 3 — Gemini suggests corrections/cleansing (optional)
  suggest: (id) => post(`/prescriptions/${id}/suggest`),

  // Step 4 — user-approved text only now triggers EMDEX/OpenFDA validation
  confirm: (id, approvedText, editSource) =>
    post(`/prescriptions/${id}/confirm`, {
      approved_text: approvedText,
      edit_source: editSource, // 'manual' | 'gemini' | 'hybrid'
    }),
};

// -----------------------------------------------------------------------
// Drug API
// -----------------------------------------------------------------------
const Drugs = {
  lookup       : (name)          => get(`/drugs/${encodeURIComponent(name)}`),
  brands       : (name)          => get(`/drugs/${encodeURIComponent(name)}/brands`),
  interactions : (drugs, flags)  => post('/drugs/interactions', { drugs, ...flags }),
};

// -----------------------------------------------------------------------
// Chatbot API
// -----------------------------------------------------------------------
const Chatbot = {
  message : (message, sessionId = null) => post('/chatbot/message', { message, session_id: sessionId }),
  history : ()                          => get('/chatbot/history'),
  session : (id)                        => get(`/chatbot/${id}`),
  destroy : (id)                        => del(`/chatbot/${id}`),
};

// -----------------------------------------------------------------------
// BMI API
// -----------------------------------------------------------------------
const Bmi = {
  calculate: (heightCm, weightKg, age, gender) =>
    post('/bmi/calculate', { height_cm: heightCm, weight_kg: weightKg, age, gender }),
  history: () => get('/bmi/history'),
};

// -----------------------------------------------------------------------
// User API
// -----------------------------------------------------------------------
const User = {
  profile               : ()      => get('/user/profile'),
  updateProfile         : (data)  => put('/user/profile', data),
  updatePassword        : (currentPassword, password, confirmPassword) =>
    put('/user/password', {
      current_password: currentPassword,
      password,
      password_confirmation: confirmPassword,
    }),
  deleteAccount         : (password, reason = null) => del('/user/account', { password, reason }),
  notifications         : ()      => get('/user/notifications'),
  markNotificationsRead : ()      => post('/user/notifications/read'),

  async uploadAvatar(file) {
    const fd = new FormData();
    fd.append('avatar', file);
    return post('/user/profile/avatar', fd);
  },
};

// -----------------------------------------------------------------------
// Admin API
// -----------------------------------------------------------------------
const Admin = {
  users               : (params = {})       => get('/admin/users', params),
  user                : (id)                => get(`/admin/users/${id}`),
  updateUserStatus    : (id, isActive)      => put(`/admin/users/${id}/status`, { is_active: isActive }),
  pendingProfessionals: ()                  => get('/admin/professionals/pending'),
  verifyProfessional  : (id, approved, note) => post(`/admin/professionals/${id}/verify`, { approved, note }),
  analytics           : ()                  => get('/admin/analytics'),
  auditLogs           : (params = {})       => get('/admin/audit-logs', params),
};

// -----------------------------------------------------------------------
// Route guard (call at top of each protected page)
// -----------------------------------------------------------------------
function requireAuth(allowedRoles = []) {
  if (!Auth.isAuthenticated()) {
    window.location.href = `/pages/login.html?redirect=${encodeURIComponent(window.location.href)}`;
    return false;
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(Auth.currentRole())) {
    window.location.href = '/pages/dashboard.html';
    return false;
  }

  return true;
}

// -----------------------------------------------------------------------
// Event: session expiry listener
// -----------------------------------------------------------------------
window.addEventListener('rxguard:unauthenticated', () => {
  Toast.show('error', 'Session Expired', 'Please log in again.');
  setTimeout(() => Auth.logout(), 1500);
});

// -----------------------------------------------------------------------
// Toast utility (lightweight, no dependencies)
// -----------------------------------------------------------------------
const Toast = {
  container: null,

  _ensureContainer() {
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.className = 'toast-container';
      document.body.appendChild(this.container);
    }
    return this.container;
  },

  show(type = 'info', title, message = '', duration = 4000) {
    const c     = this._ensureContainer();
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };

    toast.innerHTML = `
      <span style="font-size:1.1rem">${icons[type] || ''}</span>
      <div style="flex:1">
        <div class="toast-title">${title}</div>
        ${message ? `<div class="toast-body">${message}</div>` : ''}
      </div>
      <button class="toast-close" aria-label="Close">×</button>
    `;

    toast.querySelector('.toast-close').onclick = () => toast.remove();
    c.appendChild(toast);

    if (duration > 0) setTimeout(() => toast.remove(), duration);
    return toast;
  },

  success: (title, msg)  => Toast.show('success', title, msg),
  error  : (title, msg)  => Toast.show('error',   title, msg),
  warning: (title, msg)  => Toast.show('warning', title, msg),
  info   : (title, msg)  => Toast.show('info',    title, msg),
};

// -----------------------------------------------------------------------
// Exports — available as window.RxGuard in browsers
// -----------------------------------------------------------------------
window.RxGuard = {
  api: { get, post, put, del },
  Auth,
  Prescriptions,
  Drugs,
  Chatbot,
  Bmi,
  User,
  Admin,
  Toast,
  TokenStore,
  requireAuth,
  RxGuardApiError,
};