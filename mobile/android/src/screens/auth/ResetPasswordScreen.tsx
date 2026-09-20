/**
 * RxGuard Mobile — screens/auth/ResetPasswordScreen.tsx
 *
 * Completes a Supabase password reset. Supabase's recovery email links
 * to a web URL (SUPABASE_AUTH_REDIRECT_URL) carrying the session token
 * in a URL *fragment* — fragments aren't delivered to native apps via
 * standard Android/iOS deep-linking without additional native
 * configuration (custom URL scheme + Supabase-side mobile redirect
 * URL) that's out of scope for this pass.
 *
 * Recommended path (works today, no extra setup): the user taps the
 * emailed link, it opens in their phone's browser, and completes the
 * reset there — the web flow already handles this fully.
 *
 * This screen exists as a fallback / advanced path: paste the access
 * token from the reset link manually. Wiring a proper deep link is a
 * follow-up (see AndroidManifest intent-filter + Supabase mobile
 * redirect URL).
 */

import React, { useState, useCallback, useMemo} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { AuthService } from '@services';
import { ApiError } from '@services/api';
import { FONT_SIZE, SPACING, RADIUS } from '@constants';
import type { AuthStackParamList } from '@types';
import { useTheme, type ThemeColors } from '@context/ThemeContext';

type Props = NativeStackScreenProps<AuthStackParamList, 'ResetPassword'>;

export default function ResetPasswordScreen({ route, navigation }: Props) {
  const { colors } = useTheme();
  const s = useMemo(() => createStyles(colors), [colors]);

  const [accessToken, setAccessToken] = useState(route.params?.accessToken ?? '');
  const [password, setPassword]       = useState('');
  const [confirm, setConfirm]         = useState('');
  const [error, setError]             = useState<string | null>(null);
  const [loading, setLoading]         = useState(false);
  const [done, setDone]               = useState(false);

  const handleSubmit = useCallback(async () => {
    if (!accessToken.trim()) { setError('Paste the reset code from your email link.'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }

    setError(null);
    setLoading(true);
    try {
      await AuthService.resetPassword(accessToken.trim(), password, confirm);
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reset password. The link may have expired.');
    } finally {
      setLoading(false);
    }
  }, [accessToken, password, confirm]);

  if (done) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.centeredContent}>
          <Text style={s.emoji}>✅</Text>
          <Text style={s.title}>Password updated</Text>
          <Text style={s.subtitle}>Please log in with your new password.</Text>
          <TouchableOpacity style={s.primaryBtn} onPress={() => navigation.navigate('Login' as never)}>
            <Text style={s.primaryBtnText}>Go to Sign In</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          <Text style={s.title}>Set a new password</Text>
          <Text style={s.subtitle}>
            Tap the link from your reset email — it opens in your browser and finishes
            there. If you were sent here with a code already, it's pre-filled below.
          </Text>

          <Text style={s.label}>Reset code (from email link)</Text>
          <TextInput
            style={s.input}
            placeholder="Paste the access token here"
            placeholderTextColor={colors.muted}
            value={accessToken}
            onChangeText={setAccessToken}
            autoCapitalize="none"
            multiline
            editable={!loading}
          />

          <Text style={s.label}>New password</Text>
          <TextInput
            style={s.input}
            placeholder="••••••••"
            placeholderTextColor={colors.muted}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            editable={!loading}
          />

          <Text style={s.label}>Confirm new password</Text>
          <TextInput
            style={s.input}
            placeholder="••••••••"
            placeholderTextColor={colors.muted}
            value={confirm}
            onChangeText={setConfirm}
            secureTextEntry
            editable={!loading}
          />

          {error && <Text style={s.fieldError}>{error}</Text>}

          <TouchableOpacity
            style={[s.primaryBtn, loading && s.btnDisabled]}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryBtnText}>Reset Password</Text>}
          </TouchableOpacity>

          <TouchableOpacity style={s.linkBtn} onPress={() => navigation.navigate('ForgotPassword' as never)}>
            <Text style={s.linkText}>Need a new reset link?</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: SPACING.XXL, flexGrow: 1, justifyContent: 'center' },
  centeredContent: { flex: 1, padding: SPACING.XXL, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 48, marginBottom: SPACING.MD },
  title: { fontSize: FONT_SIZE.XXL, fontWeight: '700', color: colors.text, marginBottom: SPACING.SM, textAlign: 'center' },
  subtitle: { fontSize: FONT_SIZE.BASE, color: colors.muted, marginBottom: SPACING.XL, textAlign: 'center', lineHeight: 22 },
  label: { fontSize: FONT_SIZE.SM, fontWeight: '600', color: colors.text, marginBottom: SPACING.XS, marginTop: SPACING.SM },
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: RADIUS.MD,
    paddingHorizontal: SPACING.LG, paddingVertical: SPACING.MD,
    fontSize: FONT_SIZE.BASE, color: colors.text, backgroundColor: colors.surface,
  },
  fieldError: { color: colors.red, fontSize: FONT_SIZE.XS, marginTop: SPACING.SM },
  primaryBtn: {
    backgroundColor: colors.blue, borderRadius: RADIUS.MD, paddingVertical: SPACING.MD,
    alignItems: 'center', marginTop: SPACING.XL,
  },
  btnDisabled: { opacity: 0.6 },
  primaryBtnText: { color: '#fff', fontSize: FONT_SIZE.BASE, fontWeight: '700' },
  linkBtn: { marginTop: SPACING.XL, alignItems: 'center' },
  linkText: { color: colors.blue, fontSize: FONT_SIZE.SM, fontWeight: '600' },
  });
}
