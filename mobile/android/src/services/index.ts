/**
 * RxGuard Mobile — services/index.ts
 *
 * Domain-level API service functions.
 * Each section maps 1-to-1 with the backend route groups in api.php.
 * All functions return typed API response data or throw ApiError.
 */

import { get, post, put, del, upload } from './api';
import { API_BASE_URL } from '@constants';
import { TokenStore } from './api';
import type {
  ApiResponse,
  PaginatedData,
  AuthTokens,
  RegisterResult,
  User,
  LoginPayload,
  RegisterPayload,
  Prescription,
  PrescriptionListItem,
  UploadPrescriptionResponse,
  OcrExtractResult,
  SuggestionResult,
  InteractionCheckPayload,
  InteractionCheckResult,
  DrugMonograph,
  ChatMessagePayload,
  ChatMessageResponse,
  ChatSession,
  BmiCalculatePayload,
  BmiRecord,
  AppNotification,
} from '@types';

/* ─────────────────────────────────────────────────────────────────
   Auth  (Supabase Auth owns credentials, email verification,
   password reset/change — see backend AuthController for details)
───────────────────────────────────────────────────────────────── */

export const AuthService = {
  login: (payload: LoginPayload) =>
    post<AuthTokens & { user: User }>('/auth/login', payload),

  register: (payload: RegisterPayload) =>
    post<RegisterResult>('/auth/register', { ...payload, client: 'mobile' }),

  logout: () =>
    post<null>('/auth/logout'),

  logoutAllDevices: () =>
    post<null>('/auth/logout-all'),

  me: () =>
    get<User>('/auth/me'),

  forgotPassword: (email: string) =>
    post<null>('/auth/forgot-password', { email, client: 'mobile' }),

  /** accessToken comes from the Supabase recovery deep-link, not an emailed code. */
  resetPassword: (accessToken: string, password: string, passwordConfirmation: string) =>
    post<null>('/auth/reset-password', {
      access_token: accessToken,
      password,
      password_confirmation: passwordConfirmation,
    }),

  resendConfirmation: (email: string) =>
    post<null>('/auth/resend-confirmation', { email, client: 'mobile' }),

  /** Exchanges a refresh token for a fresh access token. Used directly
   *  by the biometric-unlock flow; the axios interceptor in api.ts also
   *  calls this same endpoint automatically on a 401. */
  refreshToken: (refreshToken: string) =>
    post<AuthTokens>('/auth/refresh', { refresh_token: refreshToken }),
};

/* ─────────────────────────────────────────────────────────────────
   User / Profile
───────────────────────────────────────────────────────────────── */

export const UserService = {
  profile: () =>
    get<User>('/user/profile'),

  updateProfile: (data: { name?: string; phone?: string | null }) =>
    put<User>('/user/profile', data),

  /** Backend revokes every Supabase session (incl. this one) on success —
   *  caller should clear local tokens and redirect to Login afterward. */
  updatePassword: (currentPassword: string, password: string, passwordConfirmation: string) =>
    put<null>('/user/password', {
      current_password: currentPassword,
      password,
      password_confirmation: passwordConfirmation,
    }),

  deleteAccount: (password: string, reason?: string | null) =>
    del<null>('/user/account', { data: { password, reason } }),

  uploadAvatar: (uri: string, mimeType: string) => {
    const formData = new FormData();
    formData.append('avatar', {
      uri,
      name : 'avatar.jpg',
      type : mimeType,
    } as unknown as Blob);
    return upload<{ avatar_url: string }>('/user/profile/avatar', formData);
  },

  notifications: (page = 1) =>
    get<PaginatedData<AppNotification>>('/user/notifications', { page }),

  markNotificationsRead: () =>
    post<null>('/user/notifications/read'),
};

/* ─────────────────────────────────────────────────────────────────
   Prescriptions — staged pipeline:
     upload -> extract (Tesseract) -> suggest (Gemini, optional) ->
     confirm (user-approved text -> EMDEX/OpenFDA validation)
───────────────────────────────────────────────────────────────── */

export const PrescriptionService = {
  list: (params?: { page?: number; status?: string }) =>
    get<PaginatedData<PrescriptionListItem>>('/prescriptions', params),

  show: (id: number) =>
    get<Prescription>(`/prescriptions/${id}`),

  upload: (
    uri      : string,
    mimeType : string,
    fileName : string,
    onProgress?: (pct: number) => void,
  ) => {
    const formData = new FormData();
    formData.append('prescription', {
      uri,
      name: fileName,
      type: mimeType,
    } as unknown as Blob);
    return upload<UploadPrescriptionResponse>(
      '/prescriptions/upload',
      formData,
      onProgress,
    );
  },

  /** Step 2 — free, open-source Tesseract OCR. Raw text only. */
  extract: (id: number) =>
    post<OcrExtractResult>(`/prescriptions/${id}/extract`),

  /** Step 3 (optional) — Gemini suggests corrections/cleansing. Advisory only. */
  suggest: (id: number) =>
    post<SuggestionResult>(`/prescriptions/${id}/suggest`),

  /** Step 4 — user-approved text triggers EMDEX + OpenFDA validation. */
  confirm: (id: number, approvedText: string, editSource: 'manual' | 'gemini' | 'hybrid') =>
    post<Prescription>(`/prescriptions/${id}/confirm`, {
      approved_text: approvedText,
      edit_source: editSource,
    }),

  destroy: (id: number) =>
    del<null>(`/prescriptions/${id}`),

  /** The scan file lives on a private disk — fetch with the auth header
   *  and hand the caller a URI usable directly in an <Image>. On RN,
   *  passing the Authorization header via Image source.headers works
   *  natively (unlike web's <img src>), so no blob conversion needed. */
  scanImageSource: (id: number) => ({
    uri: `${API_BASE_URL}/prescriptions/${id}/scan`,
    headers: { Authorization: `Bearer ${TokenStore.getAccess() ?? ''}` },
  }),
};

/* ─────────────────────────────────────────────────────────────────
   Drug checker
───────────────────────────────────────────────────────────────── */

export const DrugService = {
  lookup: (name: string) =>
    get<DrugMonograph>(`/drugs/${encodeURIComponent(name)}`),

  brands: (name: string) =>
    get<{ generic_name: string; brands: DrugMonograph['brands'] }>(
      `/drugs/${encodeURIComponent(name)}/brands`
    ),

  checkInteractions: (payload: InteractionCheckPayload) =>
    post<InteractionCheckResult>('/drugs/interactions', payload),
};

/* ─────────────────────────────────────────────────────────────────
   Chatbot
───────────────────────────────────────────────────────────────── */

export const ChatbotService = {
  sendMessage: (payload: ChatMessagePayload) =>
    post<ChatMessageResponse>('/chatbot/message', payload),

  history: (page = 1) =>
    get<PaginatedData<ChatSession>>('/chatbot/history', { page }),

  session: (id: number) =>
    get<ChatSession>(`/chatbot/${id}`),

  deleteSession: (id: number) =>
    del<null>(`/chatbot/${id}`),
};

/* ─────────────────────────────────────────────────────────────────
   BMI
───────────────────────────────────────────────────────────────── */

export const BmiService = {
  calculate: (payload: BmiCalculatePayload) =>
    post<BmiRecord>('/bmi/calculate', payload),

  history: (page = 1) =>
    get<PaginatedData<BmiRecord>>('/bmi/history', { page }),
};

/* ─────────────────────────────────────────────────────────────────
   Admin
───────────────────────────────────────────────────────────────── */

export const AdminService = {
  analytics: () =>
    get<Record<string, unknown>>('/admin/analytics'),

  users: (params?: { page?: number; role?: string; search?: string }) =>
    get<PaginatedData<User>>('/admin/users', params),

  user: (id: number) =>
    get<User>(`/admin/users/${id}`),

  updateUserStatus: (id: number, isActive: boolean) =>
    put<null>(`/admin/users/${id}/status`, { is_active: isActive }),

  pendingProfessionals: () =>
    get<PaginatedData<unknown>>('/admin/professionals/pending'),

  verifyProfessional: (id: number, approved: boolean, note?: string) =>
    post<null>(`/admin/professionals/${id}/verify`, { approved, note }),

  auditLogs: (params?: { page?: number; action?: string; from?: string; to?: string }) =>
    get<PaginatedData<unknown>>('/admin/audit-logs', params),

  apiUsage: () =>
    get<Record<string, unknown>>('/admin/api-usage'),
};

/* ─────────────────────────────────────────────────────────────────
   Professional review queue (pharmacist & physician)
───────────────────────────────────────────────────────────────── */

export const ProfessionalReviewService = {
  queue: (page = 1) =>
    get<{ pending_count: number; prescriptions: PaginatedData<PrescriptionListItem> }>(
      '/professional/prescriptions/queue', { page }
    ),

  approve: (id: number, notes?: string | null) =>
    post<null>(`/professional/prescriptions/${id}/approve`, { notes }),

  flag: (id: number, flagReason: string, severity?: 'low' | 'medium' | 'high' | 'critical') =>
    post<null>(`/professional/prescriptions/${id}/flag`, { flag_reason: flagReason, severity }),
};