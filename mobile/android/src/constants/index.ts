/**
 * RxGuard Mobile — constants/index.ts
 *
 * Single source of truth for all magic values used across the app.
 * Import from '@constants' via the tsconfig path alias.
 */

/* ─────────────────────────────────────────────────────────────────
   API
───────────────────────────────────────────────────────────────── */
export const API_BASE_URL = __DEV__
  ? 'http://10.0.2.2:8000/api/v1'    // Android emulator → host machine localhost
  : 'https://api.rxguard.ng/api/v1';  // Production

/** Timeout values in milliseconds */
export const TIMEOUTS = {
  DEFAULT  : 15_000,
  UPLOAD   : 60_000,
  ANALYSE  : 90_000,
  CHATBOT  : 30_000,
} as const;

/* ─────────────────────────────────────────────────────────────────
   Secure storage keys  (react-native-keychain / MMKV)
───────────────────────────────────────────────────────────────── */
export const STORAGE_KEYS = {
  ACCESS_TOKEN  : 'rxguard_access_token',
  REFRESH_TOKEN : 'rxguard_refresh_token',
  USER          : 'rxguard_user',
  THEME         : 'rxguard_theme',
  BIOMETRIC_ENABLED: 'rxguard_biometric',
  LAST_SYNC     : 'rxguard_last_sync',
} as const;

/* ─────────────────────────────────────────────────────────────────
   User roles — must match backend enum exactly
───────────────────────────────────────────────────────────────── */
export const USER_ROLES = {
  CONSUMER   : 'consumer',
  PHARMACIST : 'pharmacist',
  PHYSICIAN  : 'physician',
  ADMIN      : 'admin',
} as const;

export type UserRole = typeof USER_ROLES[keyof typeof USER_ROLES];

/* ─────────────────────────────────────────────────────────────────
   Prescription statuses — must match backend enum exactly
───────────────────────────────────────────────────────────────── */
export const RX_STATUS = {
  PENDING          : 'pending',
  EXTRACTED        : 'extracted',
  AWAITING_REVIEW  : 'awaiting_review',
  PROCESSING       : 'processing',
  COMPLETED        : 'completed',
  FLAGGED          : 'flagged',
  APPROVED         : 'approved',
} as const;

export type RxStatus = typeof RX_STATUS[keyof typeof RX_STATUS];

/* ─────────────────────────────────────────────────────────────────
   Interaction severity levels
───────────────────────────────────────────────────────────────── */
export const SEVERITY = {
  MAJOR           : 'major',
  MODERATE        : 'moderate',
  MINOR           : 'minor',
  CONTRAINDICATED : 'contraindicated',
} as const;

export type SeverityLevel = typeof SEVERITY[keyof typeof SEVERITY];

/* ─────────────────────────────────────────────────────────────────
   Design tokens — brand colours
───────────────────────────────────────────────────────────────── */
export const COLORS = {
  /* Primary */
  BLUE          : '#0A4FA6',
  BLUE_DARK     : '#083D85',
  BLUE_MID      : '#185FA5',
  BLUE_LIGHT    : '#EBF2FC',
  BLUE_XLIGHT   : '#F4F8FE',

  /* Success */
  GREEN         : '#1D9E75',
  GREEN_DARK    : '#0F6E56',
  GREEN_LIGHT   : '#E1F5EE',

  /* Danger */
  RED           : '#E24B4A',
  RED_DARK      : '#A32D2D',
  RED_LIGHT     : '#FCEBEB',

  /* Warning */
  AMBER         : '#E5A50A',
  AMBER_DARK    : '#854F0B',
  AMBER_LIGHT   : '#FAEEDA',

  /* Neutrals */
  GRAY_50       : '#F8F9FA',
  GRAY_100      : '#F1F3F5',
  GRAY_200      : '#E9ECEF',
  GRAY_300      : '#DEE2E6',
  BORDER        : '#E4E9F0',
  MUTED         : '#637389',
  TEXT          : '#1A2332',
  TEXT_SECONDARY: '#4A5568',

  /* Surfaces */
  BACKGROUND    : '#F4F7FB',
  SURFACE       : '#FFFFFF',
  SURFACE_ALT   : '#F8FAFE',

  /* Dark mode */
  DARK_BG       : '#0F172A',
  DARK_SURFACE  : '#1E293B',
  DARK_SURFACE_ALT: '#243348',
  DARK_BORDER   : '#2D3E55',
  DARK_TEXT     : '#E2E8F0',
  DARK_TEXT_SECONDARY: '#B6C2D4',
  DARK_MUTED    : '#8393AC',

  /* Dark-mode accent variants — muted/desaturated so badges and light
     accent chips (BLUE_LIGHT, RED_LIGHT, etc.) don't look pastel/washed
     out against a dark background. Used by the theme system below. */
  DARK_BLUE_LIGHT  : '#16233D',
  DARK_GREEN_LIGHT : '#123C30',
  DARK_RED_LIGHT   : '#3D1F1F',
  DARK_AMBER_LIGHT : '#3D2F0F',
} as const;

/* ─────────────────────────────────────────────────────────────────
   Typography
───────────────────────────────────────────────────────────────── */
export const FONT_SIZE = {
  XS   : 11,
  SM   : 13,
  BASE : 15,
  LG   : 17,
  XL   : 20,
  XXL  : 24,
  XXXL : 30,
} as const;

export const FONT_WEIGHT = {
  NORMAL    : '400' as const,
  MEDIUM    : '500' as const,
  SEMIBOLD  : '600' as const,
  BOLD      : '700' as const,
  EXTRABOLD : '800' as const,
} as const;

/* ─────────────────────────────────────────────────────────────────
   Spacing scale (matches 4-pt grid)
───────────────────────────────────────────────────────────────── */
export const SPACING = {
  XS  : 4,
  SM  : 8,
  MD  : 12,
  LG  : 16,
  XL  : 20,
  XXL : 24,
  XXXL: 32,
  XXXXL:48,
} as const;

export const RADIUS = {
  SM   : 6,
  MD   : 10,
  LG   : 14,
  XL   : 20,
  FULL : 9999,
} as const;

/* ─────────────────────────────────────────────────────────────────
   File upload constraints — must match backend config
───────────────────────────────────────────────────────────────── */
export const UPLOAD = {
  MAX_BYTES        : 10 * 1024 * 1024,   // 10 MB
  MIN_BYTES        : 2048,
  ALLOWED_MIME     : ['image/jpeg', 'image/png', 'application/pdf'],
  ALLOWED_EXTENSIONS: ['jpg', 'jpeg', 'png', 'pdf'],
} as const;

/* ─────────────────────────────────────────────────────────────────
   BMI category thresholds
───────────────────────────────────────────────────────────────── */
export const BMI = {
  UNDERWEIGHT : 18.5,
  NORMAL_MAX  : 24.9,
  OVERWEIGHT  : 25.0,
  OVERWEIGHT_MAX: 29.9,
  OBESE_I     : 30.0,
  OBESE_I_MAX : 34.9,
  OBESE_II    : 35.0,
  OBESE_II_MAX: 39.9,
  OBESE_III   : 40.0,
} as const;

/* ─────────────────────────────────────────────────────────────────
   Pagination
───────────────────────────────────────────────────────────────── */
export const PAGINATION = {
  DEFAULT_PAGE_SIZE : 15,
  HISTORY_PAGE_SIZE : 20,
} as const;

/* ─────────────────────────────────────────────────────────────────
   Screen names — used in navigation (typed)
───────────────────────────────────────────────────────────────── */
export const SCREENS = {
  // Auth stack
  SPLASH      : 'Splash',
  LOGIN       : 'Login',
  REGISTER    : 'Register',
  FORGOT_PW   : 'ForgotPassword',
  RESET_PW    : 'ResetPassword',

  // Main tab navigator
  DASHBOARD   : 'Dashboard',
  SCAN        : 'Scan',
  CHECKER     : 'Checker',
  CHATBOT     : 'Chatbot',
  BMI         : 'BMI',

  // Stack screens within tabs
  SCAN_RESULT     : 'ScanResult',
  PRESCRIPTION_DETAIL: 'PrescriptionDetail',
  CHECKER_RESULT  : 'CheckerResult',
  CHAT_SESSION    : 'ChatSession',
  BMI_HISTORY     : 'BMIHistory',
  PROFILE         : 'Profile',
  SETTINGS        : 'Settings',
  NOTIFICATIONS   : 'Notifications',
} as const;

export type ScreenName = typeof SCREENS[keyof typeof SCREENS];