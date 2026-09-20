/**
 * RxGuard Mobile — screens/profile/ProfileScreen.tsx
 */

import React, { useState, useCallback, useMemo} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { useAuth } from '@context/AuthContext';
import { UserService } from '@services';
import { ApiError } from '@services/api';
import { FONT_SIZE, SPACING, RADIUS, SCREENS } from '@constants';
import { initials, roleLabel, roleColor, roleBgColor, Validate, DateUtils } from '@utils';
import type { RootStackParamList } from '@types';
import { useTheme, type ThemeColors } from '@context/ThemeContext';

type Props = NativeStackScreenProps<RootStackParamList, 'Profile'>;

export default function ProfileScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const s = useMemo(() => createStyles(colors), [colors]);

  const { user, refreshUser } = useAuth();

  const [editing, setEditing] = useState(false);
  const [name, setName]       = useState(user?.name ?? '');
  const [phone, setPhone]     = useState(user?.phone ?? '');
  const [error, setError]     = useState<string | null>(null);
  const [saving, setSaving]   = useState(false);

  const handleSave = useCallback(async () => {
    const nameErr = Validate.required(name, 'Name');
    const phoneErr = Validate.phone(phone);
    if (nameErr || phoneErr) { setError(nameErr || phoneErr); return; }

    setError(null);
    setSaving(true);
    try {
      await UserService.updateProfile({ name: name.trim(), phone: phone.trim() || null });
      await refreshUser();
      setEditing(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update profile.');
    } finally {
      setSaving(false);
    }
  }, [name, phone, refreshUser]);

  if (!user) return null;

  const pp = user.professional_profile;

  return (
    <SafeAreaView style={s.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={s.scrollContent}>
        <View style={s.avatarSection}>
          <View style={[s.avatarCircle, { backgroundColor: roleBgColor(user.role) }]}>
            <Text style={[s.avatarText, { color: roleColor(user.role) }]}>{initials(user.name)}</Text>
          </View>
          <View style={[s.roleBadge, { backgroundColor: roleBgColor(user.role) }]}>
            <Text style={[s.roleBadgeText, { color: roleColor(user.role) }]}>{roleLabel(user.role)}</Text>
          </View>
          {user.is_verified
            ? <Text style={s.verifiedText}>✅ Email verified</Text>
            : <Text style={s.unverifiedText}>⏳ Email not confirmed yet</Text>}
        </View>

        <View style={s.card}>
          <View style={s.cardHeader}>
            <Text style={s.cardTitle}>Personal Information</Text>
            {!editing && (
              <TouchableOpacity onPress={() => setEditing(true)}>
                <Text style={s.linkText}>Edit</Text>
              </TouchableOpacity>
            )}
          </View>

          {editing ? (
            <>
              <Text style={s.label}>Name</Text>
              <TextInput style={s.input} value={name} onChangeText={setName} />
              <Text style={s.label}>Phone</Text>
              <TextInput style={s.input} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
              {error && <Text style={s.errorText}>{error}</Text>}
              <View style={s.editActions}>
                <TouchableOpacity style={s.outlineBtn} onPress={() => { setEditing(false); setName(user.name); setPhone(user.phone ?? ''); setError(null); }}>
                  <Text style={s.outlineBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.primaryBtnSm, saving && s.btnDisabled]} onPress={handleSave} disabled={saving}>
                  {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.primaryBtnSmText}>Save</Text>}
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              <InfoRow label="Name" value={user.name} s={s} />
              <InfoRow label="Email" value={user.email} s={s} />
              <InfoRow label="Phone" value={user.phone || '—'} s={s} />
              <InfoRow label="Member since" value={DateUtils.display(user.created_at)} s={s} />
            </>
          )}
        </View>

        {pp && (
          <View style={s.card}>
            <Text style={s.cardTitle}>Professional Profile</Text>
            <InfoRow label="Profession" value={pp.profession} s={s} />
            <InfoRow label="Licence #" value={pp.license_number} s={s} />
            <InfoRow label="Institution" value={pp.institution} s={s} />
            <InfoRow label="Status" value={pp.license_verified ? '✅ Verified' : '⏳ Pending verification'} s={s} />
          </View>
        )}

        <TouchableOpacity style={s.settingsRow} onPress={() => navigation.navigate(SCREENS.SETTINGS as never)}>
          <Text style={s.settingsRowText}>⚙️ Settings & Security</Text>
          <Text style={s.chevron}>›</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

type Styles = ReturnType<typeof createStyles>;

function InfoRow({ label, value, s }: { label: string; value: string; s: Styles }) {
  return (
    <View style={s.infoRow}>
      <Text style={s.infoLabel}>{label}</Text>
      <Text style={s.infoValue}>{value}</Text>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollContent: { padding: SPACING.LG, paddingBottom: SPACING.XXXL },

  avatarSection: { alignItems: 'center', marginBottom: SPACING.XL },
  avatarCircle: { width: 84, height: 84, borderRadius: RADIUS.FULL, alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.SM },
  avatarText: { fontSize: FONT_SIZE.XXL, fontWeight: '800' },
  roleBadge: { paddingHorizontal: SPACING.MD, paddingVertical: 4, borderRadius: RADIUS.FULL, marginBottom: SPACING.XS },
  roleBadgeText: { fontSize: FONT_SIZE.XS, fontWeight: '700' },
  verifiedText: { fontSize: FONT_SIZE.XS, color: colors.green },
  unverifiedText: { fontSize: FONT_SIZE.XS, color: colors.amberDark },

  card: {
    backgroundColor: colors.surface, borderRadius: RADIUS.LG, padding: SPACING.LG,
    marginBottom: SPACING.LG, borderWidth: 1, borderColor: colors.border,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.SM },
  cardTitle: { fontSize: FONT_SIZE.BASE, fontWeight: '700', color: colors.text, marginBottom: SPACING.SM },
  linkText: { color: colors.blue, fontWeight: '600', fontSize: FONT_SIZE.SM },

  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  infoLabel: { fontSize: FONT_SIZE.SM, color: colors.muted },
  infoValue: { fontSize: FONT_SIZE.SM, color: colors.text, fontWeight: '600', flexShrink: 1, textAlign: 'right' },

  label: { fontSize: FONT_SIZE.SM, fontWeight: '600', color: colors.text, marginBottom: SPACING.XS, marginTop: SPACING.SM },
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: RADIUS.MD, paddingHorizontal: SPACING.MD,
    paddingVertical: SPACING.SM, fontSize: FONT_SIZE.BASE, color: colors.text, backgroundColor: colors.background,
  },
  errorText: { color: colors.red, fontSize: FONT_SIZE.SM, marginTop: SPACING.SM },
  editActions: { flexDirection: 'row', gap: SPACING.SM, marginTop: SPACING.MD },
  outlineBtn: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: RADIUS.MD, paddingVertical: SPACING.SM, alignItems: 'center' },
  outlineBtnText: { color: colors.text, fontWeight: '600', fontSize: FONT_SIZE.SM },
  primaryBtnSm: { flex: 1, backgroundColor: colors.blue, borderRadius: RADIUS.MD, paddingVertical: SPACING.SM, alignItems: 'center' },
  primaryBtnSmText: { color: '#fff', fontWeight: '700', fontSize: FONT_SIZE.SM },
  btnDisabled: { opacity: 0.6 },

  settingsRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: RADIUS.LG, padding: SPACING.LG,
    borderWidth: 1, borderColor: colors.border,
  },
  settingsRowText: { fontSize: FONT_SIZE.BASE, fontWeight: '600', color: colors.text },
  chevron: { fontSize: FONT_SIZE.XL, color: colors.muted },
  });
}
