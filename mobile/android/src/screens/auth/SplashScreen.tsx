/**
 * RxGuard Mobile — screens/auth/SplashScreen.tsx
 *
 * Shown briefly on cold start. RootNavigator already shows its own
 * loading spinner while auth state initialises (see navigation/index.tsx),
 * so in practice this screen is rarely visible for long — it exists as
 * an explicit stack entry for branding and as a safe landing spot.
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FONT_SIZE, SPACING, RADIUS } from '@constants';
import { useTheme, type ThemeColors } from '@context/ThemeContext';

export default function SplashScreen() {
  const { colors } = useTheme();
  const s = useMemo(() => createStyles(colors), [colors]);

  return (
    <SafeAreaView style={s.container}>
      <View style={s.logo}>
        <Text style={s.logoText}>Rx</Text>
      </View>
      <Text style={s.title}>RxGuard</Text>
      <Text style={s.subtitle}>Nigeria's Prescription Safety Platform</Text>
      <ActivityIndicator size="small" color={colors.blue} style={{ marginTop: SPACING.XXL }} />
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  logo: {
    width: 64, height: 64, borderRadius: RADIUS.LG, backgroundColor: colors.blue,
    alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.LG,
  },
  logoText: { color: '#fff', fontSize: FONT_SIZE.XXL, fontWeight: '800' },
  title: { fontSize: FONT_SIZE.XXL, fontWeight: '700', color: colors.text },
  subtitle: { fontSize: FONT_SIZE.SM, color: colors.muted, marginTop: SPACING.XS },
  });
}
