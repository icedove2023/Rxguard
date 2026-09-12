/**
 * RxGuard Mobile — services/index.ts
 *
 * Domain-level API service functions.
 * Each section maps 1-to-1 with the backend route groups in api.php.
 * All functions return typed API response data or throw ApiError.
 */

import { get, post, put, del, upload } from './api';
import type {
  ApiResponse,
  PaginatedData,
  AuthTokens,
  User,
  LoginPayload,
  RegisterPayload,
  Prescription,
  PrescriptionListItem,
  UploadPrescriptionResponse,
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
   Auth
───────────────────────────────────────────────────────────────── */

export const AuthService = {
  login: (payload: LoginPayload) =>
    post<AuthTokens & { user: User }>('/auth/login', payload),

  register: (payload: RegisterPayload) =>
    post<AuthTokens & { user: User }>('/auth/register', payload),

  logout: () =>
    post<null>('/auth/logout'),

  me: () =>
    get<User>('/auth/me'),

  forgotPassword: (email: string) =>
    post<null>('/auth/forgot-password', { email }),

  resetPassword: (token: string, email: string, password: string, passwordConfirmation: string) =>
    post<null>('/auth/reset-password', {
      token,
      email,
      password,
      password_confirmation: passwordConfirmation,
    }),
};

/* ─────────────────────────────────────────────────────────────────
   User / Profile
───────────────────────────────────────────────────────────────── */

export const UserService = {
  profile: () =>
    get<User>('/user/profile'),

  updateProfile: (data: { name?: string; phone?: string | null }) =>
    put<User>('/user/profile', data),

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
   Prescriptions
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

  analyze: (id: number) =>
    post<Prescription>(`/prescriptions/${id}/analyze`),

  destroy: (id: number) =>
    del<null>(`/prescriptions/${id}`),
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

  updateUserStatus: (id: number, isActive: boolean) =>
    put<null>(`/admin/users/${id}/status`, { is_active: isActive }),

  pendingProfessionals: () =>
    get<PaginatedData<unknown>>('/admin/professionals/pending'),

  verifyProfessional: (id: number, approved: boolean, note?: string) =>
    post<null>(`/admin/professionals/${id}/verify`, { approved, note }),

  auditLogs: (params?: { page?: number; action?: string; from?: string; to?: string }) =>
    get<PaginatedData<unknown>>('/admin/audit-logs', params),
};