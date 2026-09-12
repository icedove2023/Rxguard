/**
 * RxGuard Mobile — utils/index.ts
 *
 * Pure utility functions shared across screens and components.
 * No React imports — safe to use in services and hooks too.
 */

import { format, formatDistanceToNow, parseISO } from 'date-fns';
import { COLORS, BMI, SEVERITY, type UserRole } from '@constants';
import type { BmiCategory, SeverityLevel } from '@types';

/* ─────────────────────────────────────────────────────────────────
   Date formatting
───────────────────────────────────────────────────────────────── */

export const DateUtils = {
  /** "12 Jun 2025" */
  display: (iso: string | null | undefined): string => {
    if (!iso) return '—';
    try { return format(parseISO(iso), 'd MMM yyyy'); }
    catch { return '—'; }
  },

  /** "12 Jun 2025, 09:30 AM" */
  displayFull: (iso: string | null | undefined): string => {
    if (!iso) return '—';
    try { return format(parseISO(iso), 'd MMM yyyy, hh:mm aa'); }
    catch { return '—'; }
  },

  /** "3h ago", "2 days ago", "Just now" */
  relative: (iso: string | null | undefined): string => {
    if (!iso) return '';
    try {
      const dist = formatDistanceToNow(parseISO(iso), { addSuffix: true });
      return dist === 'less than a minute ago' ? 'Just now' : dist;
    } catch { return ''; }
  },

  /** Short time "09:30 AM" */
  time: (iso: string | null | undefined): string => {
    if (!iso) return '';
    try { return format(parseISO(iso), 'hh:mm aa'); }
    catch { return ''; }
  },
};

/* ─────────────────────────────────────────────────────────────────
   Number / size formatting
───────────────────────────────────────────────────────────────── */

export function formatBytes(bytes: number): string {
  if (bytes < 1024)             return `${bytes} B`;
  if (bytes < 1024 * 1024)      return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function formatPercent(value: number | null | undefined, decimals = 0): string {
  if (value === null || value === undefined) return '—';
  return `${value.toFixed(decimals)}%`;
}

/* ─────────────────────────────────────────────────────────────────
   Safety score helpers
───────────────────────────────────────────────────────────────── */

export function safetyLabel(score: number | null | undefined): string {
  if (score === null || score === undefined) return 'Pending';
  if (score >= 90) return 'Safe';
  if (score >= 70) return 'Review Needed';
  return 'Flagged';
}

export function safetyColor(score: number | null | undefined): string {
  if (score === null || score === undefined) return COLORS.MUTED;
  if (score >= 90) return COLORS.GREEN;
  if (score >= 70) return COLORS.AMBER;
  return COLORS.RED;
}

export function safetyBgColor(score: number | null | undefined): string {
  if (score === null || score === undefined) return COLORS.GRAY_100;
  if (score >= 90) return COLORS.GREEN_LIGHT;
  if (score >= 70) return COLORS.AMBER_LIGHT;
  return COLORS.RED_LIGHT;
}

/* ─────────────────────────────────────────────────────────────────
   Severity helpers
───────────────────────────────────────────────────────────────── */

export function severityColor(severity: SeverityLevel | string): string {
  switch (severity) {
    case SEVERITY.CONTRAINDICATED:
    case SEVERITY.MAJOR:    return COLORS.RED;
    case SEVERITY.MODERATE: return COLORS.AMBER;
    case SEVERITY.MINOR:    return COLORS.GREEN;
    default:                return COLORS.MUTED;
  }
}

export function severityBgColor(severity: SeverityLevel | string): string {
  switch (severity) {
    case SEVERITY.CONTRAINDICATED:
    case SEVERITY.MAJOR:    return COLORS.RED_LIGHT;
    case SEVERITY.MODERATE: return COLORS.AMBER_LIGHT;
    case SEVERITY.MINOR:    return COLORS.GREEN_LIGHT;
    default:                return COLORS.GRAY_100;
  }
}

export function severityLabel(severity: SeverityLevel | string): string {
  return String(severity).replace('_', ' ').toUpperCase();
}

/* ─────────────────────────────────────────────────────────────────
   BMI helpers
───────────────────────────────────────────────────────────────── */

export function calcBmi(heightCm: number, weightKg: number): number {
  const h = heightCm / 100;
  return Math.round((weightKg / (h * h)) * 10) / 10;
}

export function bmiCategory(bmi: number): BmiCategory {
  if (bmi < BMI.UNDERWEIGHT)    return 'underweight';
  if (bmi < BMI.OVERWEIGHT)     return 'normal';
  if (bmi < BMI.OBESE_I)        return 'overweight';
  if (bmi < BMI.OBESE_II)       return 'obese_I';
  if (bmi < BMI.OBESE_III)      return 'obese_II';
  return 'obese_III';
}

export function bmiCategoryLabel(cat: BmiCategory): string {
  const labels: Record<BmiCategory, string> = {
    underweight : 'Underweight',
    normal      : 'Normal Weight',
    overweight  : 'Overweight',
    obese_I     : 'Obese (Class I)',
    obese_II    : 'Obese (Class II)',
    obese_III   : 'Obese (Class III)',
  };
  return labels[cat] ?? cat;
}

export function bmiColor(bmi: number): string {
  if (bmi < BMI.UNDERWEIGHT) return '#3B9ECE';
  if (bmi < BMI.OVERWEIGHT)  return COLORS.GREEN;
  if (bmi < BMI.OBESE_I)     return COLORS.AMBER;
  return COLORS.RED;
}

export function bmiGaugePercent(bmi: number): number {
  // Map BMI 10–45 to 0–100%
  return Math.min(100, Math.max(0, ((bmi - 10) / 35) * 100));
}

/* ─────────────────────────────────────────────────────────────────
   Role helpers
───────────────────────────────────────────────────────────────── */

export function roleLabel(role: UserRole | string): string {
  const labels: Record<string, string> = {
    consumer   : 'Consumer',
    pharmacist : 'Pharmacist',
    physician  : 'Physician',
    admin      : 'Administrator',
  };
  return labels[role] ?? role;
}

export function roleColor(role: UserRole | string): string {
  switch (role) {
    case 'admin':      return COLORS.RED;
    case 'physician':  return COLORS.BLUE;
    case 'pharmacist': return COLORS.GREEN;
    default:           return COLORS.MUTED;
  }
}

export function roleBgColor(role: UserRole | string): string {
  switch (role) {
    case 'admin':      return COLORS.RED_LIGHT;
    case 'physician':  return COLORS.BLUE_LIGHT;
    case 'pharmacist': return COLORS.GREEN_LIGHT;
    default:           return COLORS.GRAY_100;
  }
}

/* ─────────────────────────────────────────────────────────────────
   String helpers
───────────────────────────────────────────────────────────────── */

export function initials(name: string | null | undefined): string {
  if (!name) return '?';
  return name
    .split(' ')
    .slice(0, 2)
    .map(n => n.charAt(0).toUpperCase())
    .join('');
}

export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen).trimEnd() + '…';
}

/* ─────────────────────────────────────────────────────────────────
   Validation helpers (used in form screens)
───────────────────────────────────────────────────────────────── */

export const Validate = {
  email: (v: string): string | null => {
    if (!v.trim()) return 'Email is required.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return 'Enter a valid email address.';
    return null;
  },

  password: (v: string): string | null => {
    if (!v) return 'Password is required.';
    if (v.length < 8) return 'Password must be at least 8 characters.';
    if (!/[A-Z]/.test(v)) return 'Password must contain at least one uppercase letter.';
    if (!/[0-9]/.test(v)) return 'Password must contain at least one number.';
    return null;
  },

  passwordMatch: (a: string, b: string): string | null => {
    if (a !== b) return 'Passwords do not match.';
    return null;
  },

  required: (v: string, label = 'This field'): string | null => {
    if (!v.trim()) return `${label} is required.`;
    return null;
  },

  phone: (v: string): string | null => {
    if (!v) return null; // optional
    if (!/^\+?[0-9]{10,15}$/.test(v.replace(/\s/g, '')))
      return 'Enter a valid phone number (e.g. +2348012345678).';
    return null;
  },

  licenceNumber: (v: string, role: string): string | null => {
    if (!v.trim()) return 'Licence number is required.';
    if (role === 'pharmacist' && !v.toUpperCase().startsWith('PCN'))
      return 'PCN licence numbers begin with "PCN".';
    if (role === 'physician' && !v.toUpperCase().startsWith('MDCN'))
      return 'MDCN licence numbers begin with "MDCN".';
    return null;
  },
};