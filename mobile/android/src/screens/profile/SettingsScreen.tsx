/**
 * RxGuard Mobile — screens/profile/SettingsScreen.tsx
 * Change password and delete account both revoke Supabase sessions
 * server-side, matching the web profile page's behaviour exactly.
 */

import React, { useState, useCallback, useEffect, useMemo} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Modal,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@context/AuthContext';
import { useTheme, type ThemePreference } from '@context/ThemeContext';
import { UserService, AuthService } from '@services';
import { TokenStore, ApiError } from '@services/api';
import {
  getSupportedBiometryType,
  isBiometricLoginEnabled,
  enableBiometricLogin,
  disableBiometricLogin,
  type BiometryKind,
} from '@services/biometrics';
import { FONT_SIZE, SPACING, RADIUS } from '@constants';
import { Validate } from '@utils';

export default function SettingsScreen() {
  const { logout } = useAuth();
  const { preference, setPreference, colors } = useTheme();
  const s = useMemo(() => createStyles(colors), [colors]);

  /* ── Biometric login ── */
  const [biometryKind, setBiometryKind] = useState<BiometryKind>(null);
  const [biometricOn, setBiometricOn]   = useState(isBiometricLoginEnabled());
  const [biometricBusy, setBiometricBusy] = useState(false);

  useEffect(() => {
    getSupportedBiometryType().then(setBiometryKind);
  }, []);

  const handleToggleBiometric = useCallback(async (value: boolean) => {
    setBiometricBusy(true);
    try {
      if (value) {
        const refreshToken = TokenStore.getRefresh();
        if (!refreshToken) {
          Alert.alert('Could not enable', 'Please log out and back in, then try again.');
          return;
        }
        const ok = await enableBiometricLogin(refreshToken);
        if (!ok) {
          Alert.alert('Could not enable', 'Your device may not support biometric authentication, or no fingerprint/face is enrolled in your phone\'s settings.');
          return;
        }
      } else {
        await disableBiometricLogin();
      }
      setBiometricOn(value);
    } finally {
      setBiometricBusy(false);
    }
  }, []);

  const biometryLabel = biometryKind === 'FaceID' ? 'Face ID'
    : biometryKind === 'TouchID' ? 'Touch ID'
    : biometryKind ? 'Fingerprint'
    : null;

  /* ── Change password ── */
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd]         = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [pwdError, setPwdError]     = useState<string | null>(null);
  const [savingPwd, setSavingPwd]   = useState(false);

  const handleChangePassword = useCallback(async () => {
    if (!currentPwd) { setPwdError('Enter your current password.'); return; }
    const pwdErr = Validate.password(newPwd);
    if (pwdErr) { setPwdError(pwdErr); return; }
    if (newPwd !== confirmPwd) { setPwdError('New passwords do not match.'); return; }

    setPwdError(null);
    setSavingPwd(true);
    try {
      await UserService.updatePassword(currentPwd, newPwd, confirmPwd);
      // Backend revokes every session (including this one) — the stored
      // biometric refresh token is now dead too, so clear it locally.
      await disableBiometricLogin();
      Alert.alert(
        'Password updated',
        'For your security you have been signed out. Please log in again.',
        [{ text: 'OK', onPress: () => { TokenStore.clearTokens(); logout(); } }]
      );
    } catch (err) {
      setPwdError(err instanceof ApiError ? err.message : 'Could not update password.');
    } finally {
      setSavingPwd(false);
    }
  }, [currentPwd, newPwd, confirmPwd, logout]);

  /* ── Delete account ── */
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deletePwd, setDeletePwd]     = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting]       = useState(false);

  const handleDeleteAccount = useCallback(async () => {
    if (!deletePwd) { setDeleteError('Enter your password to confirm.'); return; }
    if (deleteConfirm !== 'DELETE') { setDeleteError('Please type DELETE exactly.'); return; }

    setDeleteError(null);
    setDeleting(true);
    try {
      await UserService.deleteAccount(deletePwd);
      await disableBiometricLogin();
      TokenStore.clearTokens();
      setDeleteModalVisible(false);
      await logout();
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : 'Could not delete account.');
    } finally {
      setDeleting(false);
    }
  }, [deletePwd, deleteConfirm, logout]);

  /* ── Logout ── */
  const handleLogout = useCallback(() => {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: () => logout() },
    ]);
  }, [logout]);

  const handleLogoutAll = useCallback(() => {
    Alert.alert('Sign out everywhere', 'This signs you out of every other device. Continue?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out All Others', onPress: async () => {
          try {
            await AuthService.logoutAllDevices();
            Alert.alert('Done', 'All other sessions have been revoked.');
          } catch (err) {
            Alert.alert('Failed', err instanceof ApiError ? err.message : 'Could not complete this action.');
          }
        },
      },
    ]);
  }, []);

  return (
    <SafeAreaView style={s.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={s.scrollContent}>
        <Text style={s.sectionTitle}>Appearance</Text>
        <View style={s.card}>
          <View style={s.themeRow}>
            {(['system', 'light', 'dark'] as ThemePreference[]).map(opt => (
              <TouchableOpacity
                key={opt}
                style={[s.themeOption, preference === opt && s.themeOptionActive]}
                onPress={() => setPreference(opt)}
                accessibilityRole="radio"
                accessibilityState={{ checked: preference === opt }}
              >
                <Text style={[s.themeOptionText, preference === opt && s.themeOptionTextActive]}>
                  {opt === 'system' ? '⚙️ System' : opt === 'light' ? '☀️ Light' : '🌙 Dark'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {biometryLabel && (
          <>
            <Text style={s.sectionTitle}>Security</Text>
            <View style={s.card}>
              <View style={s.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.switchLabel}>Unlock with {biometryLabel}</Text>
                  <Text style={s.helperText}>Skip typing your password next time you open the app.</Text>
                </View>
                {biometricBusy
                  ? <ActivityIndicator color={colors.blue} size="small" />
                  : <Switch value={biometricOn} onValueChange={handleToggleBiometric} trackColor={{ true: colors.blue }} />}
              </View>
            </View>
          </>
        )}

        <Text style={s.sectionTitle}>Change Password</Text>
        <View style={s.card}>
          <Text style={s.helperText}>
            Changing your password signs you out of all devices, including this one.
          </Text>
          <TextInput style={s.input} placeholder="Current password" placeholderTextColor={colors.muted} secureTextEntry value={currentPwd} onChangeText={setCurrentPwd} />
          <TextInput style={s.input} placeholder="New password" placeholderTextColor={colors.muted} secureTextEntry value={newPwd} onChangeText={setNewPwd} />
          <TextInput style={s.input} placeholder="Confirm new password" placeholderTextColor={colors.muted} secureTextEntry value={confirmPwd} onChangeText={setConfirmPwd} />
          {pwdError && <Text style={s.errorText}>{pwdError}</Text>}
          <TouchableOpacity style={[s.primaryBtn, savingPwd && s.btnDisabled]} onPress={handleChangePassword} disabled={savingPwd}>
            {savingPwd ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryBtnText}>Update Password</Text>}
          </TouchableOpacity>
        </View>

        <Text style={s.sectionTitle}>Sessions</Text>
        <TouchableOpacity style={s.rowCard} onPress={handleLogoutAll}>
          <Text style={s.rowText}>Sign Out All Other Devices</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.rowCard} onPress={handleLogout}>
          <Text style={s.rowText}>Sign Out</Text>
        </TouchableOpacity>

        <Text style={s.sectionTitle}>Danger Zone</Text>
        <View style={s.dangerCard}>
          <Text style={s.dangerText}>
            Deleting your account is permanent and cannot be undone. It removes your login
            and profile data immediately.
          </Text>
          <TouchableOpacity style={s.dangerBtn} onPress={() => setDeleteModalVisible(true)}>
            <Text style={s.dangerBtnText}>Delete My Account</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <Modal visible={deleteModalVisible} transparent animationType="fade" onRequestClose={() => setDeleteModalVisible(false)}>
        <View style={s.modalBackdrop}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>Delete Account</Text>
            <Text style={s.helperText}>This is permanent. Enter your password and type DELETE to confirm.</Text>
            <TextInput style={s.input} placeholder="Password" placeholderTextColor={colors.muted} secureTextEntry value={deletePwd} onChangeText={setDeletePwd} />
            <TextInput style={s.input} placeholder="Type DELETE" placeholderTextColor={colors.muted} value={deleteConfirm} onChangeText={setDeleteConfirm} autoCapitalize="characters" />
            {deleteError && <Text style={s.errorText}>{deleteError}</Text>}
            <View style={s.modalActions}>
              <TouchableOpacity style={s.outlineBtn} onPress={() => setDeleteModalVisible(false)}>
                <Text style={s.outlineBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.dangerBtnSm, deleting && s.btnDisabled]} onPress={handleDeleteAccount} disabled={deleting}>
                {deleting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.dangerBtnText}>Delete</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollContent: { padding: SPACING.LG, paddingBottom: SPACING.XXXL },
  sectionTitle: { fontSize: FONT_SIZE.SM, fontWeight: '700', color: colors.muted, textTransform: 'uppercase', marginTop: SPACING.LG, marginBottom: SPACING.SM },

  card: { backgroundColor: colors.surface, borderRadius: RADIUS.LG, padding: SPACING.LG, borderWidth: 1, borderColor: colors.border },
  helperText: { fontSize: FONT_SIZE.XS, color: colors.muted, marginBottom: SPACING.MD, lineHeight: 18 },

  themeRow: { flexDirection: 'row', gap: SPACING.SM },
  themeOption: {
    flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: RADIUS.MD,
    paddingVertical: SPACING.SM, alignItems: 'center', backgroundColor: colors.background,
  },
  themeOptionActive: { backgroundColor: colors.blueLight, borderColor: colors.blue },
  themeOptionText: { fontSize: FONT_SIZE.SM, color: colors.muted, fontWeight: '600' },
  themeOptionTextActive: { color: colors.blue },

  switchRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.MD },
  switchLabel: { fontSize: FONT_SIZE.SM, fontWeight: '700', color: colors.text },
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: RADIUS.MD, paddingHorizontal: SPACING.MD,
    paddingVertical: SPACING.SM, fontSize: FONT_SIZE.BASE, color: colors.text, backgroundColor: colors.background,
    marginBottom: SPACING.SM,
  },
  errorText: { color: colors.red, fontSize: FONT_SIZE.SM, marginBottom: SPACING.SM },
  primaryBtn: { backgroundColor: colors.blue, borderRadius: RADIUS.MD, paddingVertical: SPACING.MD, alignItems: 'center', marginTop: SPACING.XS },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: FONT_SIZE.SM },
  btnDisabled: { opacity: 0.6 },

  rowCard: {
    backgroundColor: colors.surface, borderRadius: RADIUS.MD, padding: SPACING.MD,
    marginBottom: SPACING.SM, borderWidth: 1, borderColor: colors.border,
  },
  rowText: { fontSize: FONT_SIZE.SM, fontWeight: '600', color: colors.text },

  dangerCard: { backgroundColor: colors.redLight, borderRadius: RADIUS.LG, padding: SPACING.LG },
  dangerText: { fontSize: FONT_SIZE.XS, color: colors.redDark, marginBottom: SPACING.MD, lineHeight: 18 },
  dangerBtn: { backgroundColor: colors.red, borderRadius: RADIUS.MD, paddingVertical: SPACING.SM, alignItems: 'center' },
  dangerBtnText: { color: '#fff', fontWeight: '700', fontSize: FONT_SIZE.SM },
  dangerBtnSm: { flex: 1, backgroundColor: colors.red, borderRadius: RADIUS.MD, paddingVertical: SPACING.SM, alignItems: 'center' },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: SPACING.XL },
  modalCard: { backgroundColor: colors.surface, borderRadius: RADIUS.LG, padding: SPACING.LG, width: '100%' },
  modalTitle: { fontSize: FONT_SIZE.LG, fontWeight: '700', color: colors.text, marginBottom: SPACING.SM },
  modalActions: { flexDirection: 'row', gap: SPACING.SM, marginTop: SPACING.SM },
  outlineBtn: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: RADIUS.MD, paddingVertical: SPACING.SM, alignItems: 'center' },
  outlineBtnText: { color: colors.text, fontWeight: '600', fontSize: FONT_SIZE.SM },
  });
}
