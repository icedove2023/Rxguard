/**
 * RxGuard Mobile — screens/auth/RegisterScreen.tsx
 *
 * Registration screen supporting Consumer and Professional roles.
 * Professional roles (Pharmacist / Physician) reveal additional
 * licence and institution fields, matching the web register.html.
 * Uses useAuth().register() which calls POST /api/v1/auth/register.
 */

import React, { useState, useRef, useCallback, useMemo} from 'react';
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

import { useAuth }                 from '@context/AuthContext';
import { FONT_SIZE, SPACING, RADIUS, SCREENS, USER_ROLES } from '@constants';
import { Validate }                from '@utils';
import { ApiError }                from '@services/api';
import type { AuthStackParamList, UserRole } from '@types';
import { useTheme, type ThemeColors } from '@context/ThemeContext';

type Props = NativeStackScreenProps<AuthStackParamList, 'Register'>;

/* ─────────────────────────────────────────────────────────────────
   Types
───────────────────────────────────────────────────────────────── */
type RoleOption = { role: UserRole; label: string; icon: string; description: string };

const ROLE_OPTIONS: RoleOption[] = [
  {
    role       : USER_ROLES.CONSUMER,
    label      : 'Consumer',
    icon       : '👤',
    description: 'Scan prescriptions, check drug interactions, AI health assistant',
  },
  {
    role       : USER_ROLES.PHARMACIST,
    label      : 'Pharmacist',
    icon       : '💊',
    description: 'PCN-licensed. Review prescriptions and access clinical tools',
  },
  {
    role       : USER_ROLES.PHYSICIAN,
    label      : 'Physician',
    icon       : '🩺',
    description: 'MDCN-registered. Upload prescriptions, monitor patient records',
  },
];

interface FormFields {
  name                  : string;
  email                 : string;
  phone                 : string;
  password              : string;
  password_confirmation : string;
  license_number        : string;
  institution           : string;
  specialty             : string;
}

interface FormErrors extends Partial<Record<keyof FormFields, string>> {
  general?: string;
}

/* ─────────────────────────────────────────────────────────────────
   Sub-components
───────────────────────────────────────────────────────────────── */
type Styles = ReturnType<typeof createStyles>;

function FieldError({ message, s }: { message?: string; s: Styles }) {
  if (!message) return null;
  return <Text style={s.fieldError}>{message}</Text>;
}

function SectionDivider({ label, s }: { label: string; s: Styles }) {
  return (
    <View style={s.sectionDivider}>
      <View style={s.sectionDividerLine} />
      <Text style={s.sectionDividerText}>{label}</Text>
      <View style={s.sectionDividerLine} />
    </View>
  );
}

function PasswordStrengthBar({ password, s, colors }: { password: string; s: Styles; colors: ThemeColors }) {
  if (!password) return null;

  let score = 0;
  if (password.length >= 8)            score++;
  if (password.length >= 12)           score++;
  if (/[A-Z]/.test(password))          score++;
  if (/[0-9]/.test(password))          score++;
  if (/[^A-Za-z0-9]/.test(password))  score++;

  const levels = [
    { color: colors.red,   label: 'Very weak'  },
    { color: colors.red,   label: 'Weak'       },
    { color: colors.amber, label: 'Fair'       },
    { color: colors.green, label: 'Strong'     },
    { color: colors.green, label: 'Very strong'},
  ];
  const lvl = levels[Math.min(score, 4)];
  const pct = ((score + 1) / 5) * 100;

  return (
    <View style={s.strengthWrap}>
      <View style={s.strengthTrack}>
        <View style={[s.strengthFill, { width: `${pct}%` as any, backgroundColor: lvl.color }]} />
      </View>
      <Text style={[s.strengthLabel, { color: lvl.color }]}>{lvl.label}</Text>
    </View>
  );
}

/* ─────────────────────────────────────────────────────────────────
   Screen
───────────────────────────────────────────────────────────────── */
export default function RegisterScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const s = useMemo(() => createStyles(colors), [colors]);

  const { register, isLoading } = useAuth();

  const [role,       setRole    ] = useState<UserRole>(USER_ROLES.CONSUMER);
  const [fields,     setFields  ] = useState<FormFields>({
    name: '', email: '', phone: '', password: '',
    password_confirmation: '', license_number: '',
    institution: '', specialty: '',
  });
  const [showPwd,    setShowPwd ] = useState(false);
  const [showConfirm,setShowConfirm] = useState(false);
  const [errors,     setErrors  ] = useState<FormErrors>({});
  const [consent,    setConsent ] = useState(false);

  /* Refs for keyboard navigation */
  const emailRef       = useRef<TextInputType>(null);
  const phoneRef       = useRef<TextInputType>(null);
  const licenceRef     = useRef<TextInputType>(null);
  const institutionRef = useRef<TextInputType>(null);
  const specialtyRef   = useRef<TextInputType>(null);
  const passwordRef    = useRef<TextInputType>(null);
  const confirmRef     = useRef<TextInputType>(null);

  const isPro = role === USER_ROLES.PHARMACIST || role === USER_ROLES.PHYSICIAN;

  /* ── Field setter ── */
  const set = useCallback((key: keyof FormFields, value: string) => {
    setFields(f => ({ ...f, [key]: value }));
    setErrors(e => ({ ...e, [key]: undefined, general: undefined }));
  }, []);

  /* ── Role select ── */
  const selectRole = useCallback((r: UserRole) => {
    setRole(r);
    setErrors({});
  }, []);

  /* ── Validate ── */
  const validate = useCallback((): FormErrors => {
    const e: FormErrors = {};

    const nameErr = Validate.required(fields.name, 'Full name');
    if (nameErr) e.name = nameErr;
    if (fields.name.trim().length < 2) e.name = 'Full name must be at least 2 characters.';

    const emailErr = Validate.email(fields.email);
    if (emailErr) e.email = emailErr;

    const phoneErr = Validate.phone(fields.phone);
    if (phoneErr) e.phone = phoneErr;

    const pwdErr = Validate.password(fields.password);
    if (pwdErr) e.password = pwdErr;

    const matchErr = Validate.passwordMatch(fields.password, fields.password_confirmation);
    if (matchErr) e.password_confirmation = matchErr;

    if (isPro) {
      const licErr = Validate.licenceNumber(fields.license_number, role);
      if (licErr) e.license_number = licErr;

      const instErr = Validate.required(fields.institution, 'Hospital or pharmacy name');
      if (instErr) e.institution = instErr;
    }

    if (!consent) {
      e.general = 'You must accept the Terms of Service and Privacy Policy to continue.';
    }

    return e;
  }, [fields, isPro, role, consent]);

  /* ── Submit ── */
  const handleRegister = useCallback(async () => {
    const validationErrors = validate();
    if (Object.keys(validationErrors).length) {
      setErrors(validationErrors);
      return;
    }

    setErrors({});

    try {
      const { requiresConfirmation } = await register({
        name                 : fields.name.trim(),
        email                : fields.email.trim(),
        phone                : fields.phone.trim() || null,
        password             : fields.password,
        password_confirmation: fields.password_confirmation,
        role,
        ...(isPro && {
          license_number: fields.license_number.trim(),
          institution   : fields.institution.trim(),
          specialty     : fields.specialty.trim() || undefined,
        }),
      });

      if (requiresConfirmation) {
        Alert.alert(
          'Almost there!',
          'Check your email to confirm your address before logging in.',
          [{ text: 'OK', onPress: () => navigation.navigate('Login' as never) }]
        );
      }
      // Otherwise: navigation is handled automatically by RootNavigator
      // on auth state change (a live session was issued immediately).
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.validationErrors) {
          const mapped: FormErrors = {};
          Object.entries(err.allFieldErrors()).forEach(([k, v]) => {
            (mapped as Record<string, string>)[k] = v;
          });
          setErrors(mapped);
        } else {
          setErrors({ general: err.message });
        }
      }
    }
  }, [validate, register, fields, role, isPro]);

  /* ─────────────────────────────────────────────────────────────
     Render
  ───────────────────────────────────────────────────────────── */
  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView
        style={s.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
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
            <Text style={s.title}>Create your account</Text>
            <Text style={s.subtitle}>
              Free for consumers · Professional verification required for clinical roles
            </Text>
          </View>

          <View style={s.card}>

            {/* ── General error ── */}
            {errors.general ? (
              <View style={s.errorBanner}>
                <Text style={s.errorBannerText}>⛔  {errors.general}</Text>
              </View>
            ) : null}

            {/* ── Role selector ── */}
            <Text style={s.sectionLabel}>I am registering as</Text>
            <View style={s.roleGrid}>
              {ROLE_OPTIONS.map(opt => {
                const active = role === opt.role;
                return (
                  <TouchableOpacity
                    key={opt.role}
                    style={[s.roleCard, active && s.roleCardActive]}
                    onPress={() => selectRole(opt.role)}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: active }}
                    accessibilityLabel={opt.label}
                  >
                    <Text style={s.roleIcon}>{opt.icon}</Text>
                    <Text style={[s.roleLabel, active && s.roleLabelActive]}>{opt.label}</Text>
                    <Text style={[s.roleDesc, active && s.roleDescActive]} numberOfLines={2}>
                      {opt.description}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <SectionDivider label="Personal information" s={s} />

            {/* ── Name ── */}
            <View style={s.formGroup}>
              <Text style={s.label}>Full name</Text>
              <TextInput
                style={[s.input, errors.name ? s.inputError : null]}
                value={fields.name}
                onChangeText={v => set('name', v)}
                placeholder="Chukwuemeka Obi"
                placeholderTextColor={colors.muted}
                autoComplete="name"
                autoCapitalize="words"
                returnKeyType="next"
                onSubmitEditing={() => emailRef.current?.focus()}
                editable={!isLoading}
              />
              <FieldError message={errors.name} s={s} />
            </View>

            {/* ── Email ── */}
            <View style={s.formGroup}>
              <Text style={s.label}>Email address</Text>
              <TextInput
                ref={emailRef}
                style={[s.input, errors.email ? s.inputError : null]}
                value={fields.email}
                onChangeText={v => set('email', v)}
                placeholder="you@example.com"
                placeholderTextColor={colors.muted}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                returnKeyType="next"
                onSubmitEditing={() => phoneRef.current?.focus()}
                editable={!isLoading}
              />
              <FieldError message={errors.email} s={s} />
            </View>

            {/* ── Phone ── */}
            <View style={s.formGroup}>
              <Text style={s.label}>
                Phone number{' '}
                <Text style={s.optional}>(optional)</Text>
              </Text>
              <TextInput
                ref={phoneRef}
                style={[s.input, errors.phone ? s.inputError : null]}
                value={fields.phone}
                onChangeText={v => set('phone', v)}
                placeholder="+2348012345678"
                placeholderTextColor={colors.muted}
                keyboardType="phone-pad"
                autoComplete="tel"
                returnKeyType={isPro ? 'next' : 'next'}
                onSubmitEditing={() =>
                  isPro ? licenceRef.current?.focus() : passwordRef.current?.focus()
                }
                editable={!isLoading}
              />
              <FieldError message={errors.phone} s={s} />
            </View>

            {/* ── Professional credentials ── */}
            {isPro && (
              <>
                <SectionDivider label="Professional credentials" s={s} />

                {/* Licence number */}
                <View style={s.formGroup}>
                  <Text style={s.label}>
                    Licence number{' '}
                    <Text style={s.hint}>
                      ({role === USER_ROLES.PHARMACIST ? 'PCN/…' : 'MDCN/…'})
                    </Text>
                  </Text>
                  <TextInput
                    ref={licenceRef}
                    style={[s.input, s.monoInput, errors.license_number ? s.inputError : null]}
                    value={fields.license_number}
                    onChangeText={v => set('license_number', v)}
                    placeholder={
                      role === USER_ROLES.PHARMACIST ? 'PCN/2022/000123' : 'MDCN/2020/012345'
                    }
                    placeholderTextColor={colors.muted}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    returnKeyType="next"
                    onSubmitEditing={() => institutionRef.current?.focus()}
                    editable={!isLoading}
                  />
                  <FieldError message={errors.license_number} s={s} />
                </View>

                {/* Institution */}
                <View style={s.formGroup}>
                  <Text style={s.label}>
                    {role === USER_ROLES.PHARMACIST ? 'Pharmacy name' : 'Hospital name'}
                  </Text>
                  <TextInput
                    ref={institutionRef}
                    style={[s.input, errors.institution ? s.inputError : null]}
                    value={fields.institution}
                    onChangeText={v => set('institution', v)}
                    placeholder="Lagos Island General Hospital"
                    placeholderTextColor={colors.muted}
                    autoCapitalize="words"
                    returnKeyType="next"
                    onSubmitEditing={() => specialtyRef.current?.focus()}
                    editable={!isLoading}
                  />
                  <FieldError message={errors.institution} s={s} />
                </View>

                {/* Specialty */}
                <View style={s.formGroup}>
                  <Text style={s.label}>
                    Specialty{' '}
                    <Text style={s.optional}>(optional)</Text>
                  </Text>
                  <TextInput
                    ref={specialtyRef}
                    style={s.input}
                    value={fields.specialty}
                    onChangeText={v => set('specialty', v)}
                    placeholder={
                      role === USER_ROLES.PHARMACIST ? 'e.g. Clinical Pharmacy' : 'e.g. Internal Medicine'
                    }
                    placeholderTextColor={colors.muted}
                    autoCapitalize="words"
                    returnKeyType="next"
                    onSubmitEditing={() => passwordRef.current?.focus()}
                    editable={!isLoading}
                  />
                </View>

                {/* Verification notice */}
                <View style={s.verificationNotice}>
                  <Text style={s.verificationIcon}>ℹ️</Text>
                  <Text style={s.verificationText}>
                    Your licence will be verified by our admin team within 24 hours before
                    professional access is activated.
                  </Text>
                </View>
              </>
            )}

            <SectionDivider label="Account security" s={s} />

            {/* ── Password ── */}
            <View style={s.formGroup}>
              <Text style={s.label}>Password</Text>
              <View style={s.inputRow}>
                <TextInput
                  ref={passwordRef}
                  style={[s.input, s.inputFlex, errors.password ? s.inputError : null]}
                  value={fields.password}
                  onChangeText={v => set('password', v)}
                  placeholder="Min. 8 characters"
                  placeholderTextColor={colors.muted}
                  secureTextEntry={!showPwd}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="password-new"
                  returnKeyType="next"
                  onSubmitEditing={() => confirmRef.current?.focus()}
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
              <PasswordStrengthBar password={fields.password} s={s} colors={colors} />
              <FieldError message={errors.password} s={s} />
            </View>

            {/* ── Confirm password ── */}
            <View style={s.formGroup}>
              <Text style={s.label}>Confirm password</Text>
              <View style={s.inputRow}>
                <TextInput
                  ref={confirmRef}
                  style={[s.input, s.inputFlex, errors.password_confirmation ? s.inputError : null]}
                  value={fields.password_confirmation}
                  onChangeText={v => set('password_confirmation', v)}
                  placeholder="Repeat password"
                  placeholderTextColor={colors.muted}
                  secureTextEntry={!showConfirm}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="password-new"
                  returnKeyType="done"
                  onSubmitEditing={handleRegister}
                  editable={!isLoading}
                />
                <TouchableOpacity
                  style={s.eyeBtn}
                  onPress={() => setShowConfirm(v => !v)}
                  accessibilityLabel={showConfirm ? 'Hide confirm password' : 'Show confirm password'}
                >
                  <Text style={s.eyeIcon}>{showConfirm ? '🙈' : '👁'}</Text>
                </TouchableOpacity>
              </View>
              <FieldError message={errors.password_confirmation} s={s} />
            </View>

            {/* ── Consent checkbox ── */}
            <TouchableOpacity
              style={s.consentRow}
              onPress={() => setConsent(v => !v)}
              activeOpacity={0.7}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: consent }}
            >
              <View style={[s.checkbox, consent && s.checkboxChecked]}>
                {consent && <Text style={s.checkmark}>✓</Text>}
              </View>
              <Text style={s.consentText}>
                I agree to the{' '}
                <Text style={s.consentLink}>Terms of Service</Text>
                {', '}
                <Text style={s.consentLink}>Privacy Policy (NDPR)</Text>
                {isPro && (
                  <>
                    {', and '}
                    <Text style={s.consentLink}>Professional Code of Conduct</Text>
                  </>
                )}
                {'.'}
              </Text>
            </TouchableOpacity>

            {/* ── Submit ── */}
            <TouchableOpacity
              style={[s.primaryBtn, isLoading && s.primaryBtnDisabled]}
              onPress={handleRegister}
              disabled={isLoading}
              accessibilityRole="button"
              accessibilityLabel="Create account"
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={s.primaryBtnText}>
                  {isPro ? 'Create Professional Account' : 'Create Free Account'}
                </Text>
              )}
            </TouchableOpacity>

          </View>

          {/* ── Sign in link ── */}
          <View style={s.footer}>
            <Text style={s.footerText}>Already have an account? </Text>
            <TouchableOpacity
              onPress={() => navigation.navigate(SCREENS.LOGIN as 'Login')}
              accessibilityRole="link"
            >
              <Text style={s.footerLink}>Sign in</Text>
            </TouchableOpacity>
          </View>

          <Text style={s.legal}>
            NDPR compliant · NAFDAC integrated · Not a substitute for medical advice
          </Text>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/* ─────────────────────────────────────────────────────────────────
   Styles
───────────────────────────────────────────────────────────────── */
function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  safe  : { flex: 1, backgroundColor: colors.background },
  flex  : { flex: 1 },
  scroll: { flexGrow: 1, padding: SPACING.XL },

  /* Header */
  header   : { alignItems: 'center', paddingVertical: SPACING.XL },
  logoBox  : {
    width: 56, height: 56, borderRadius: RADIUS.LG,
    backgroundColor: colors.blue,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: SPACING.MD,
  },
  logoText : { color: '#fff', fontSize: FONT_SIZE.XL, fontWeight: '800' },
  title    : { fontSize: FONT_SIZE.XXL, fontWeight: '700', color: colors.text, marginBottom: SPACING.XS },
  subtitle : { fontSize: FONT_SIZE.SM, color: colors.muted, textAlign: 'center', lineHeight: 20 },

  /* Card */
  card: {
    backgroundColor: colors.surface,
    borderRadius   : RADIUS.XL,
    padding        : SPACING.XL,
    shadowColor    : colors.blue,
    shadowOffset   : { width: 0, height: 4 },
    shadowOpacity  : 0.08,
    shadowRadius   : 20,
    elevation      : 4,
    marginBottom   : SPACING.XL,
  },

  /* Error */
  errorBanner    : {
    backgroundColor: colors.redLight,
    borderRadius   : RADIUS.MD,
    padding        : SPACING.MD,
    marginBottom   : SPACING.LG,
    borderLeftWidth: 4,
    borderLeftColor: colors.red,
  },
  errorBannerText: { fontSize: FONT_SIZE.SM, color: colors.redDark },

  /* Role selector */
  sectionLabel: { fontSize: FONT_SIZE.SM, fontWeight: '600', color: colors.muted, marginBottom: SPACING.SM },
  roleGrid    : { flexDirection: 'row', gap: SPACING.SM, marginBottom: SPACING.LG },
  roleCard    : {
    flex          : 1,
    borderWidth   : 1.5,
    borderColor   : colors.border,
    borderRadius  : RADIUS.LG,
    padding       : SPACING.MD,
    alignItems    : 'center',
    backgroundColor: colors.surface,
  },
  roleCardActive : { borderColor: colors.blue, backgroundColor: colors.blueLight },
  roleIcon       : { fontSize: 22, marginBottom: SPACING.XS },
  roleLabel      : { fontSize: FONT_SIZE.XS, fontWeight: '700', color: colors.muted, marginBottom: 2 },
  roleLabelActive: { color: colors.blue },
  roleDesc       : { fontSize: 10, color: colors.muted, textAlign: 'center', lineHeight: 13 },
  roleDescActive : { color: colors.blue },

  /* Section divider */
  sectionDivider    : { flexDirection: 'row', alignItems: 'center', marginVertical: SPACING.LG },
  sectionDividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
  sectionDividerText: { marginHorizontal: SPACING.SM, fontSize: FONT_SIZE.XS, fontWeight: '600', color: colors.muted },

  /* Form */
  formGroup : { marginBottom: SPACING.LG },
  label     : { fontSize: FONT_SIZE.SM, fontWeight: '500', color: colors.textSecondary, marginBottom: SPACING.XS },
  optional  : { fontWeight: '400', color: colors.muted },
  hint      : { fontWeight: '400', color: colors.muted },
  input     : {
    borderWidth      : 1.5,
    borderColor      : colors.border,
    borderRadius     : RADIUS.MD,
    paddingVertical  : 12,
    paddingHorizontal: 14,
    fontSize         : FONT_SIZE.BASE,
    color            : colors.text,
    backgroundColor  : colors.surface,
  },
  monoInput : { fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', letterSpacing: 0.5 },
  inputError: { borderColor: colors.red },
  inputRow  : { flexDirection: 'row', alignItems: 'center' },
  inputFlex : { flex: 1 },
  eyeBtn    : { paddingHorizontal: SPACING.MD, paddingVertical: SPACING.SM },
  eyeIcon   : { fontSize: 18 },
  fieldError: { fontSize: FONT_SIZE.XS, color: colors.red, marginTop: SPACING.XS },

  /* Strength meter */
  strengthWrap : { marginTop: SPACING.XS },
  strengthTrack: { height: 4, backgroundColor: colors.border, borderRadius: RADIUS.FULL, overflow: 'hidden', marginBottom: 3 },
  strengthFill : { height: '100%', borderRadius: RADIUS.FULL },
  strengthLabel: { fontSize: FONT_SIZE.XS },

  /* Verification notice */
  verificationNotice: {
    flexDirection  : 'row',
    gap            : SPACING.SM,
    backgroundColor: colors.blueLight,
    borderRadius   : RADIUS.MD,
    padding        : SPACING.MD,
    marginBottom   : SPACING.LG,
  },
  verificationIcon: { fontSize: 16, flexShrink: 0 },
  verificationText: { flex: 1, fontSize: FONT_SIZE.XS, color: colors.blue, lineHeight: 18 },

  /* Consent */
  consentRow    : { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.SM, marginBottom: SPACING.LG },
  checkbox      : {
    width: 20, height: 20, borderRadius: RADIUS.SM,
    borderWidth: 1.5, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0, marginTop: 1,
    backgroundColor: colors.surface,
  },
  checkboxChecked: { backgroundColor: colors.blue, borderColor: colors.blue },
  checkmark      : { color: '#fff', fontSize: 12, fontWeight: '800' },
  consentText    : { flex: 1, fontSize: FONT_SIZE.SM, color: colors.muted, lineHeight: 20 },
  consentLink    : { color: colors.blue, fontWeight: '500' },

  /* Primary button */
  primaryBtn        : {
    backgroundColor: colors.blue,
    borderRadius   : RADIUS.MD,
    paddingVertical: 14,
    alignItems     : 'center',
  },
  primaryBtnDisabled: { opacity: 0.65 },
  primaryBtnText    : { color: '#fff', fontSize: FONT_SIZE.BASE, fontWeight: '600' },

  /* Footer */
  footer    : { flexDirection: 'row', justifyContent: 'center', marginBottom: SPACING.LG },
  footerText: { fontSize: FONT_SIZE.SM, color: colors.muted },
  footerLink: { fontSize: FONT_SIZE.SM, color: colors.blue, fontWeight: '600' },

  /* Legal */
  legal: { fontSize: FONT_SIZE.XS, color: colors.muted, textAlign: 'center', lineHeight: 18, marginBottom: SPACING.XL },
  });
}