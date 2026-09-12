/**
 * RxGuard Mobile — screens/auth/LoginScreen.tsx
 *
 * Login screen using useAuth() from AuthContext.
 * Validates client-side before calling the API.
 * Maps server validation errors to individual fields.
 */

import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  StyleSheet,
  Alert,
  type TextInput as TextInputType,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { useAuth }                    from '@context/AuthContext';
import { COLORS, FONT_SIZE, SPACING, RADIUS, SCREENS } from '@constants';
import { Validate }                   from '@utils';
import { ApiError }                   from '@services/api';
import type { AuthStackParamList }    from '@types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

/* ─────────────────────────────────────────────────────────────────
   Field error component
───────────────────────────────────────────────────────────────── */
function FieldError({ message }: { message: string | null }) {
  if (!message) return null;
  return <Text style={s.fieldError}>{message}</Text>;
}

/* ─────────────────────────────────────────────────────────────────
   Screen
───────────────────────────────────────────────────────────────── */
export default function LoginScreen({ navigation }: Props) {
  const { login, isLoading } = useAuth();

  const [email,       setEmail      ] = useState('');
  const [password,    setPassword   ] = useState('');
  const [showPwd,     setShowPwd    ] = useState(false);
  const [errors,      setErrors     ] = useState<{ email?: string; password?: string; general?: string }>({});

  const passwordRef = useRef<TextInputType>(null);

  /* ── Validate and submit ── */
  const handleLogin = useCallback(async () => {
    const newErrors: typeof errors = {};

    const emailErr = Validate.email(email);
    if (emailErr) newErrors.email = emailErr;

    if (!password) newErrors.password = 'Password is required.';

    if (Object.keys(newErrors).length) {
      setErrors(newErrors);
      return;
    }

    setErrors({});

    try {
      await login({ email: email.trim(), password });
      // Navigation handled automatically by RootNavigator on auth state change
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.validationErrors) {
          setErrors({
            email   : err.fieldError('email')    ?? undefined,
            password: err.fieldError('password') ?? undefined,
            general : !err.validationErrors.email && !err.validationErrors.password
              ? err.message : undefined,
          });
        } else {
          setErrors({ general: err.message });
        }
      }
    }
  }, [email, password, login]);

  /* ─────────────────────────────────────────────────────────────
     Render
  ───────────────────────────────────────────────────────────── */
  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView
        style={s.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          contentContainerStyle={s.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >

          {/* ── Header ── */}
          <View style={s.header}>
            <View style={s.logoBox}>
              <Text style={s.logoText}>Rx</Text>
            </View>
            <Text style={s.title}>Welcome back</Text>
            <Text style={s.subtitle}>Sign in to your RxGuard account</Text>
          </View>

          {/* ── Form card ── */}
          <View style={s.card}>

            {/* General error banner */}
            {errors.general ? (
              <View style={s.errorBanner}>
                <Text style={s.errorBannerText}>⛔  {errors.general}</Text>
              </View>
            ) : null}

            {/* Email */}
            <View style={s.formGroup}>
              <Text style={s.label}>Email address</Text>
              <TextInput
                style={[s.input, errors.email ? s.inputError : null]}
                value={email}
                onChangeText={v => { setEmail(v); setErrors(e => ({ ...e, email: undefined })); }}
                placeholder="you@example.com"
                placeholderTextColor={COLORS.MUTED}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                returnKeyType="next"
                onSubmitEditing={() => passwordRef.current?.focus()}
                editable={!isLoading}
              />
              <FieldError message={errors.email ?? null} />
            </View>

            {/* Password */}
            <View style={s.formGroup}>
              <Text style={s.label}>Password</Text>
              <View style={s.inputRow}>
                <TextInput
                  ref={passwordRef}
                  style={[s.input, s.inputFlex, errors.password ? s.inputError : null]}
                  value={password}
                  onChangeText={v => { setPassword(v); setErrors(e => ({ ...e, password: undefined })); }}
                  placeholder="••••••••"
                  placeholderTextColor={COLORS.MUTED}
                  secureTextEntry={!showPwd}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="password"
                  returnKeyType="done"
                  onSubmitEditing={handleLogin}
                  editable={!isLoading}
                />
                <TouchableOpacity
                  style={s.eyeBtn}
                  onPress={() => setShowPwd(v => !v)}
                  accessibilityLabel={showPwd ? 'Hide password' : 'Show password'}
                >
                  <Text style={s.eyeIcon}>{showPwd ? '🙈' : '👁'}</Text>
                </TouchableOpacity>
              </View>
              <FieldError message={errors.password ?? null} />
            </View>

            {/* Remember / Forgot row */}
            <View style={s.rememberRow}>
              <TouchableOpacity
                onPress={() => navigation.navigate(SCREENS.FORGOT_PW as 'ForgotPassword')}
                accessibilityRole="link"
              >
                <Text style={s.forgotLink}>Forgot password?</Text>
              </TouchableOpacity>
            </View>

            {/* Submit */}
            <TouchableOpacity
              style={[s.primaryBtn, isLoading && s.primaryBtnDisabled]}
              onPress={handleLogin}
              disabled={isLoading}
              accessibilityRole="button"
              accessibilityLabel="Sign in"
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={s.primaryBtnText}>Sign In to RxGuard</Text>
              )}
            </TouchableOpacity>

          </View>

          {/* ── Register link ── */}
          <View style={s.footer}>
            <Text style={s.footerText}>Don't have an account? </Text>
            <TouchableOpacity
              onPress={() => navigation.navigate(SCREENS.REGISTER as 'Register')}
              accessibilityRole="link"
            >
              <Text style={s.footerLink}>Create one free</Text>
            </TouchableOpacity>
          </View>

          {/* ── Legal note ── */}
          <Text style={s.legal}>
            Not a substitute for professional medical advice.
            {'\n'}NDPR compliant · NAFDAC integrated
          </Text>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/* ─────────────────────────────────────────────────────────────────
   Styles
───────────────────────────────────────────────────────────────── */
const s = StyleSheet.create({
  safe  : { flex: 1, backgroundColor: COLORS.BACKGROUND },
  flex  : { flex: 1 },
  scroll: { flexGrow: 1, padding: SPACING.XL, justifyContent: 'center' },

  /* Header */
  header     : { alignItems: 'center', marginBottom: SPACING.XL },
  logoBox    : {
    width: 56, height: 56, borderRadius: RADIUS.LG,
    backgroundColor: COLORS.BLUE,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: SPACING.MD,
  },
  logoText   : { color: '#fff', fontSize: FONT_SIZE.XL, fontWeight: '800' },
  title      : { fontSize: FONT_SIZE.XXL, fontWeight: '700', color: COLORS.TEXT, marginBottom: SPACING.XS },
  subtitle   : { fontSize: FONT_SIZE.SM, color: COLORS.MUTED },

  /* Card */
  card: {
    backgroundColor: COLORS.SURFACE,
    borderRadius   : RADIUS.XL,
    padding        : SPACING.XL,
    shadowColor    : COLORS.BLUE,
    shadowOffset   : { width: 0, height: 4 },
    shadowOpacity  : 0.08,
    shadowRadius   : 20,
    elevation      : 4,
    marginBottom   : SPACING.XL,
  },

  /* Error banner */
  errorBanner    : {
    backgroundColor: COLORS.RED_LIGHT,
    borderRadius   : RADIUS.MD,
    padding        : SPACING.MD,
    marginBottom   : SPACING.LG,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.RED,
  },
  errorBannerText: { fontSize: FONT_SIZE.SM, color: COLORS.RED_DARK },

  /* Form */
  formGroup: { marginBottom: SPACING.LG },
  label    : { fontSize: FONT_SIZE.SM, fontWeight: '500', color: COLORS.TEXT_SECONDARY, marginBottom: SPACING.XS },
  input    : {
    borderWidth   : 1.5,
    borderColor   : COLORS.BORDER,
    borderRadius  : RADIUS.MD,
    paddingVertical  : 12,
    paddingHorizontal: 14,
    fontSize      : FONT_SIZE.BASE,
    color         : COLORS.TEXT,
    backgroundColor: COLORS.SURFACE,
  },
  inputError: { borderColor: COLORS.RED },
  inputRow  : { flexDirection: 'row', alignItems: 'center' },
  inputFlex : { flex: 1 },
  eyeBtn    : { paddingHorizontal: SPACING.MD, paddingVertical: SPACING.SM },
  eyeIcon   : { fontSize: 18 },
  fieldError: { fontSize: FONT_SIZE.XS, color: COLORS.RED, marginTop: SPACING.XS },

  /* Forgot row */
  rememberRow: { alignItems: 'flex-end', marginBottom: SPACING.LG, marginTop: -SPACING.SM },
  forgotLink : { fontSize: FONT_SIZE.SM, color: COLORS.BLUE, fontWeight: '500' },

  /* Primary button */
  primaryBtn        : {
    backgroundColor: COLORS.BLUE,
    borderRadius   : RADIUS.MD,
    paddingVertical: 14,
    alignItems     : 'center',
    marginBottom   : SPACING.LG,
  },
  primaryBtnDisabled: { opacity: 0.65 },
  primaryBtnText    : { color: '#fff', fontSize: FONT_SIZE.BASE, fontWeight: '600' },

  /* Divider */


  /* Footer */
  footer    : { flexDirection: 'row', justifyContent: 'center', marginBottom: SPACING.LG },
  footerText: { fontSize: FONT_SIZE.SM, color: COLORS.MUTED },
  footerLink: { fontSize: FONT_SIZE.SM, color: COLORS.BLUE, fontWeight: '600' },

  /* Legal */
  legal: {
    fontSize  : FONT_SIZE.XS,
    color     : COLORS.MUTED,
    textAlign : 'center',
    lineHeight: 18,
  },
});