/**
 * RxGuard Mobile — App.tsx
 *
 * Root component. Wires together:
 *   - GestureHandlerRootView (required by react-native-gesture-handler)
 *   - AuthProvider (global auth state)
 *   - Toast notifications
 *   - AppNavigation (all navigators)
 */

import React from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Toast from 'react-native-toast-message';

import { AuthProvider } from '@context/AuthContext';
import { ThemeProvider } from '@context/ThemeContext';
import AppNavigation from '@navigation';
import ErrorBoundary from '@components/ErrorBoundary';
import OfflineBanner from '@components/OfflineBanner';
import AppStatusBar from '@components/AppStatusBar';
import { COLORS } from '@constants';

export default function App() {
  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={styles.root}>
        <ThemeProvider>
          <AppStatusBar />
          <AuthProvider>
            <OfflineBanner />
            <AppNavigation />
          </AuthProvider>
          <Toast />
        </ThemeProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.BACKGROUND },
});