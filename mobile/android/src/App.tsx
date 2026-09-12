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
import { StatusBar, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Toast from 'react-native-toast-message';

import { AuthProvider } from '@context/AuthContext';
import AppNavigation from '@navigation';
import { COLORS } from '@constants';

export default function App() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <StatusBar
        barStyle="dark-content"
        backgroundColor={COLORS.SURFACE}
        translucent={false}
      />
      <AuthProvider>
        <AppNavigation />
      </AuthProvider>
      <Toast />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.BACKGROUND },
});