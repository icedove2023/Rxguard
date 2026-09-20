/**
 * RxGuard Mobile — screens/auth/ForgotPasswordScreen.tsx
 *
 * Sends a Supabase password-recovery email (delivered via Resend).
 * The email link opens in the device browser and completes on the
 * web reset-password flow — see note in ResetPasswordScreen.tsx for
 * why we don't do native deep-link parsing here.
 */

import React, { useState, useCallback, useMemo} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { AuthService } from '@services';
import { ApiError } from '@services/api';
import { FONT_SIZE, SPACING, RADIUS } from '@constants';
import { Validate } from '@utils';
import type { AuthStackParamList } from '@types';
import { useTheme, type ThemeColors } from '@context/ThemeContext';

type Props = NativeStackScreenProps<AuthStackParamList, 'ForgotPassword'>;

export default function ForgotPasswordScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const s = useMemo(() => createStyles(colors), [colors]);

  const [email, setEmail]     = useState('');
  const [error, setError]     = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent]       = useState(false);

  const handleSubmit = useCallback(async () => {
    const err = Validate.email(email);
    if (err) { setError(err); return; }

    setError(null);
    setLoading(true);
    try {
      await AuthService.forgotPassword(email.trim());
    } catch {
      // Swallow — never reveal whether the email exists.
    } finally {
      setLoading(false);
      setSent(true);
    }
  }, [email]);

  if (sent) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.centeredContent}>
          <Text style={s.emoji}>📬</Text>
          <Text style={s.title}>Check your email</Text>
          <Text style={s.subtitle}>
            If an account exists for {email.trim()}, a password reset link is on its way.
            Open it from your phone to reset your password in the browser.
          </Text>
          <TouchableOpacity style={s.primaryBtn} onPress={() => navigation.goBack()}>
            <Text style={s.primaryBtnText}>Back to Sign In</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={s.content}>
          <Text style={s.title}>Forgot your password?</Text>
          <Text style={s.subtitle}>Enter your email and we'll send you a reset link.</Text>

          <Text style={s.label}>Email address</Text>
          <TextInput
            style={[s.input, error && s.inputError]}
            placeholder="you@example.com"
            placeholderTextColor={colors.muted}
            value={email}
            onChangeText={t => { setEmail(t); setError(null); }}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            editable={!loading}
          />
          {error && <Text style={s.fieldError}>{error}</Text>}

          <TouchableOpacity
            style={[s.primaryBtn, loading && s.btnDisabled]}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.primaryBtnText}>Send Reset Link</Text>}
          </TouchableOpacity>

          <TouchableOpacity style={s.linkBtn} onPress={() => navigation.goBack()}>
            <Text style={s.linkText}>← Back to sign in</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, padding: SPACING.XXL, justifyContent: 'center' },
  centeredContent: { flex: 1, padding: SPACING.XXL, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 48, marginBottom: SPACING.MD },
  title: { fontSize: FONT_SIZE.XXL, fontWeight: '700', color: colors.text, marginBottom: SPACING.SM, textAlign: 'center' },
  subtitle: { fontSize: FONT_SIZE.BASE, color: colors.muted, marginBottom: SPACING.XXL, textAlign: 'center', lineHeight: 22 },
  label: { fontSize: FONT_SIZE.SM, fontWeight: '600', color: colors.text, marginBottom: SPACING.XS },
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: RADIUS.MD,
    paddingHorizontal: SPACING.LG, paddingVertical: SPACING.MD,
    fontSize: FONT_SIZE.BASE, color: colors.text, backgroundColor: colors.surface,
    marginBottom: SPACING.SM,
  },
  inputError: { borderColor: colors.red },
  fieldError: { color: colors.red, fontSize: FONT_SIZE.XS, marginBottom: SPACING.SM },
  primaryBtn: {
    backgroundColor: colors.blue, borderRadius: RADIUS.MD, paddingVertical: SPACING.MD,
    alignItems: 'center', marginTop: SPACING.MD,
  },
  btnDisabled: { opacity: 0.6 },
  primaryBtnText: { color: '#fff', fontSize: FONT_SIZE.BASE, fontWeight: '700' },
  linkBtn: { marginTop: SPACING.XL, alignItems: 'center' },
  linkText: { color: colors.blue, fontSize: FONT_SIZE.SM, fontWeight: '600' },
  });
}
