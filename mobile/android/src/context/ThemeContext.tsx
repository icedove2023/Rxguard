/**
 * RxGuard Mobile — context/ThemeContext.tsx
 *
 * Theme system: 'system' | 'light' | 'dark', persisted via MMKV and
 * defaulting to the OS preference. Exposes a `colors` object with the
 * same keys screens already use from COLORS, so migrating a screen is
 * a mechanical find/replace of `COLORS.X` -> `colors.X` inside the
 * component (see MIGRATION NOTE below) — nothing else about a screen's
 * structure needs to change.
 *
 * Fully wired into: app chrome (status bar, tab bar, headers), Settings
 * (the theme picker), Dashboard. Other screens still use static light
 * COLORS and will render correctly in light mode; retrofitting them to
 * follow the device theme just means applying the same find/replace.
 */

import React, { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme, StatusBar } from 'react-native';

import { COLORS, STORAGE_KEYS } from '@constants';
import { storage } from '@services/api';

export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

/** Semantic palette — every screen references these keys, never a raw hex. */
export interface ThemeColors {
  background   : string;
  surface      : string;
  surfaceAlt   : string;
  border       : string;
  text         : string;
  textSecondary: string;
  muted        : string;

  blue        : string;
  blueDark    : string;
  blueLight   : string;
  green       : string;
  greenDark   : string;
  greenLight  : string;
  red         : string;
  redDark     : string;
  redLight    : string;
  amber       : string;
  amberDark   : string;
  amberLight  : string;

  statusBarStyle: 'dark-content' | 'light-content';
}

const LIGHT_COLORS: ThemeColors = {
  background   : COLORS.BACKGROUND,
  surface      : COLORS.SURFACE,
  surfaceAlt   : COLORS.SURFACE_ALT,
  border       : COLORS.BORDER,
  text         : COLORS.TEXT,
  textSecondary: COLORS.TEXT_SECONDARY,
  muted        : COLORS.MUTED,

  blue      : COLORS.BLUE,
  blueDark  : COLORS.BLUE_DARK,
  blueLight : COLORS.BLUE_LIGHT,
  green     : COLORS.GREEN,
  greenDark : COLORS.GREEN_DARK,
  greenLight: COLORS.GREEN_LIGHT,
  red       : COLORS.RED,
  redDark   : COLORS.RED_DARK,
  redLight  : COLORS.RED_LIGHT,
  amber     : COLORS.AMBER,
  amberDark : COLORS.AMBER_DARK,
  amberLight: COLORS.AMBER_LIGHT,

  statusBarStyle: 'dark-content',
};

const DARK_COLORS: ThemeColors = {
  background   : COLORS.DARK_BG,
  surface      : COLORS.DARK_SURFACE,
  surfaceAlt   : COLORS.DARK_SURFACE_ALT,
  border       : COLORS.DARK_BORDER,
  text         : COLORS.DARK_TEXT,
  textSecondary: COLORS.DARK_TEXT_SECONDARY,
  muted        : COLORS.DARK_MUTED,

  // Accent brand colors stay legible on dark backgrounds as-is; only the
  // pale "_LIGHT" chip backgrounds swap to their muted dark equivalents.
  blue      : COLORS.BLUE_MID,
  blueDark  : COLORS.BLUE,
  blueLight : COLORS.DARK_BLUE_LIGHT,
  green     : COLORS.GREEN,
  greenDark : COLORS.GREEN_DARK,
  greenLight: COLORS.DARK_GREEN_LIGHT,
  red       : COLORS.RED,
  redDark   : COLORS.RED_DARK,
  redLight  : COLORS.DARK_RED_LIGHT,
  amber     : COLORS.AMBER,
  amberDark : COLORS.AMBER_DARK,
  amberLight: COLORS.DARK_AMBER_LIGHT,

  statusBarStyle: 'light-content',
};

interface ThemeContextValue {
  preference    : ThemePreference;
  resolvedTheme : ResolvedTheme;
  colors        : ThemeColors;
  isDark        : boolean;
  setPreference : (pref: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme(); // 'light' | 'dark' | null

  const [preference, setPreferenceState] = useState<ThemePreference>(() => {
    const stored = storage.getString(STORAGE_KEYS.THEME);
    return (stored === 'light' || stored === 'dark' || stored === 'system') ? stored : 'system';
  });

  const resolvedTheme: ResolvedTheme = useMemo(() => {
    if (preference === 'system') return systemScheme === 'dark' ? 'dark' : 'light';
    return preference;
  }, [preference, systemScheme]);

  const colors = resolvedTheme === 'dark' ? DARK_COLORS : LIGHT_COLORS;

  const setPreference = (pref: ThemePreference) => {
    setPreferenceState(pref);
    storage.set(STORAGE_KEYS.THEME, pref);
  };

  // Keep the OS status bar in sync with the resolved theme everywhere,
  // so screens that don't (yet) consume `colors` still get a correct
  // status bar rather than dark-on-dark or light-on-light text.
  useEffect(() => {
    StatusBar.setBarStyle(colors.statusBarStyle, true);
  }, [colors.statusBarStyle]);

  const value: ThemeContextValue = {
    preference,
    resolvedTheme,
    colors,
    isDark: resolvedTheme === 'dark',
    setPreference,
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within <ThemeProvider>');
  return ctx;
}
