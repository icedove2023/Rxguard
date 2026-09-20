/**
 * RxGuard Mobile — components/AppStatusBar.tsx
 * Keeps the OS status bar in sync with the resolved theme (light/dark).
 */

import React from 'react';
import { StatusBar } from 'react-native';
import { useTheme } from '@context/ThemeContext';

export default function AppStatusBar() {
  const { colors } = useTheme();

  return (
    <StatusBar
      barStyle={colors.statusBarStyle}
      backgroundColor={colors.surface}
      translucent={false}
    />
  );
}
