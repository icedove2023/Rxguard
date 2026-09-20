/**
 * RxGuard Mobile — components/ErrorBoundary.tsx
 *
 * Catches uncaught render/lifecycle errors anywhere below it and shows
 * a recoverable screen instead of a white screen / native crash dialog.
 * Class component because error boundaries are not expressible with
 * hooks (React has no useErrorBoundary equivalent).
 */

import React, { Component, type ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { COLORS, FONT_SIZE, SPACING, RADIUS } from '@constants';

interface Props { children: ReactNode; }
interface State { hasError: boolean; message: string | null; }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // In a production app this is where you'd forward to a crash
    // reporting service (Sentry, Bugsnag, etc.) — not wired here since
    // no such service is configured in this project.
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.error('RxGuard ErrorBoundary caught:', error, info.componentStack);
    }
  }

  handleReset = () => this.setState({ hasError: false, message: null });

  render() {
    if (this.state.hasError) {
      return (
        <View style={s.container}>
          <Text style={s.emoji}>⚠️</Text>
          <Text style={s.title}>Something went wrong</Text>
          <Text style={s.message}>
            The app hit an unexpected error. Your data is safe — try again, and if
            it keeps happening, please let us know what you were doing.
          </Text>
          <TouchableOpacity style={s.btn} onPress={this.handleReset}>
            <Text style={s.btnText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const s = StyleSheet.create({
  container: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    padding: SPACING.XXL, backgroundColor: COLORS.BACKGROUND,
  },
  emoji: { fontSize: 44, marginBottom: SPACING.MD },
  title: { fontSize: FONT_SIZE.XL, fontWeight: '700', color: COLORS.TEXT, marginBottom: SPACING.SM },
  message: { fontSize: FONT_SIZE.SM, color: COLORS.MUTED, textAlign: 'center', lineHeight: 20, marginBottom: SPACING.XL },
  btn: { backgroundColor: COLORS.BLUE, borderRadius: RADIUS.MD, paddingHorizontal: SPACING.XL, paddingVertical: SPACING.MD },
  btnText: { color: '#fff', fontWeight: '700', fontSize: FONT_SIZE.BASE },
});
