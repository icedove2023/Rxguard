/**
 * RxGuard Mobile — screens/main/DashboardScreen.tsx
 *
 * Home tab. Mirrors the web dashboard: greeting, quick actions,
 * recent prescriptions, and a professional-licence-pending notice.
 */

import React, { useCallback, useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { useAuth } from '@context/AuthContext';
import { useTheme, type ThemeColors } from '@context/ThemeContext';
import { PrescriptionService, UserService } from '@services';
import { ApiError } from '@services/api';
import { FONT_SIZE, SPACING, RADIUS, SCREENS } from '@constants';
import { DateUtils, safetyColor, safetyBgColor, safetyLabel, roleLabel, initials } from '@utils';
import type { RootStackParamList, PrescriptionListItem, AppNotification } from '@types';

type Props = NativeStackScreenProps<RootStackParamList, 'Main'>;

export default function DashboardScreen({ navigation }: Props) {
  const { user, isProfessional, hasVerifiedLicence } = useAuth();
  const { colors } = useTheme();
  const s = useMemo(() => createStyles(colors), [colors]);

  const [prescriptions, setPrescriptions] = useState<PrescriptionListItem[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading]             = useState(true);
  const [refreshing, setRefreshing]       = useState(false);

  const load = useCallback(async () => {
    try {
      const [rxRes, notifRes] = await Promise.all([
        PrescriptionService.list({ page: 1 }),
        UserService.notifications(1),
      ]);
      setPrescriptions(rxRes.data.data.slice(0, 5));
      setNotifications(notifRes.data.data.slice(0, 3));
    } catch {
      // Non-fatal — dashboard still shows quick actions.
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = useCallback(() => { setRefreshing(true); load(); }, [load]);

  const metrics = {
    total: prescriptions.length,
    interactions: prescriptions.filter(p => p.has_interactions).length,
    avgSafety: prescriptions.length
      ? Math.round(
          prescriptions.reduce((sum, p) => sum + (p.safety_score ?? 0), 0) / prescriptions.length
        )
      : null,
  };

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={s.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.blue} />}
      >
        {/* Greeting */}
        <View style={s.greetingRow}>
          <View>
            <Text style={s.greetingHi}>Hi, {user?.name?.split(' ')[0] ?? 'there'} 👋</Text>
            <Text style={s.greetingRole}>{roleLabel(user?.role ?? 'consumer')}</Text>
          </View>
          <TouchableOpacity
            style={s.avatarCircle}
            onPress={() => navigation.navigate(SCREENS.PROFILE as never)}
          >
            <Text style={s.avatarText}>{initials(user?.name)}</Text>
          </TouchableOpacity>
        </View>

        {/* Professional licence pending notice */}
        {isProfessional && !hasVerifiedLicence && (
          <View style={s.noticeCard}>
            <Text style={s.noticeText}>
              ⏳ Your professional registration is under review. Full clinical features unlock
              once our admin team verifies your licence — usually within 24 hours.
            </Text>
          </View>
        )}

        {/* Metrics */}
        <View style={s.metricsRow}>
          <MetricCard label="Scans" value={String(metrics.total)} color={colors.text} s={s} />
          <MetricCard
            label="Interactions"
            value={String(metrics.interactions)}
            color={metrics.interactions > 0 ? colors.red : colors.green}
            s={s}
          />
          <MetricCard
            label="Avg Safety"
            value={metrics.avgSafety !== null ? `${metrics.avgSafety}%` : '—'}
            color={metrics.avgSafety !== null ? safetyColor(metrics.avgSafety) : colors.muted}
            s={s}
          />
        </View>

        {/* Quick actions */}
        <Text style={s.sectionTitle}>Quick Actions</Text>
        <View style={s.quickActionsGrid}>
          <QuickAction icon="📷" label="Scan Rx" onPress={() => navigation.navigate(SCREENS.SCAN as never)} s={s} />
          <QuickAction icon="⚠️" label="Drug Check" onPress={() => navigation.navigate(SCREENS.CHECKER as never)} s={s} />
          <QuickAction icon="🤖" label="AI Assistant" onPress={() => navigation.navigate(SCREENS.CHATBOT as never)} s={s} />
          <QuickAction icon="⚖️" label="BMI" onPress={() => navigation.navigate(SCREENS.BMI as never)} s={s} />
        </View>

        {/* Recent prescriptions */}
        <View style={s.sectionHeaderRow}>
          <Text style={s.sectionTitle}>Recent Prescriptions</Text>
          <TouchableOpacity onPress={() => navigation.navigate(SCREENS.SCAN as never)}>
            <Text style={s.seeAll}>See all →</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator color={colors.blue} style={{ marginVertical: SPACING.XL }} />
        ) : prescriptions.length === 0 ? (
          <EmptyState
            emoji="📋"
            text="No scans yet. Upload your first prescription."
            actionLabel="Scan a Prescription"
            onPress={() => navigation.navigate(SCREENS.SCAN as never)}
            s={s}
          />
        ) : (
          prescriptions.map(p => (
            <TouchableOpacity
              key={p.id}
              style={s.rxCard}
              onPress={() => navigation.navigate(SCREENS.PRESCRIPTION_DETAIL as never, { prescriptionId: p.id } as never)}
            >
              <View style={{ flex: 1 }}>
                <Text style={s.rxName}>{p.patient_name || 'Unnamed patient'}</Text>
                <Text style={s.rxMeta}>
                  {DateUtils.relative(p.created_at)}
                  {p.has_interactions ? ' · ⚠ Interactions found' : ''}
                </Text>
              </View>
              <View style={[s.scoreBadge, { backgroundColor: safetyBgColor(p.safety_score) }]}>
                <Text style={[s.scoreBadgeText, { color: safetyColor(p.safety_score) }]}>
                  {p.safety_score !== null ? `${Math.round(p.safety_score)}%` : safetyLabel(p.safety_score)}
                </Text>
              </View>
            </TouchableOpacity>
          ))
        )}

        {/* Notifications preview */}
        {notifications.length > 0 && (
          <>
            <View style={s.sectionHeaderRow}>
              <Text style={s.sectionTitle}>Notifications</Text>
              <TouchableOpacity onPress={() => navigation.navigate(SCREENS.NOTIFICATIONS as never)}>
                <Text style={s.seeAll}>See all →</Text>
              </TouchableOpacity>
            </View>
            {notifications.map(n => (
              <View key={n.id} style={s.notifCard}>
                <Text style={s.notifTitle}>{n.title}</Text>
                <Text style={s.notifBody} numberOfLines={2}>{n.body}</Text>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/* ── Small components ── */
type Styles = ReturnType<typeof createStyles>;

function MetricCard({ label, value, color, s }: { label: string; value: string; color: string; s: Styles }) {
  return (
    <View style={s.metricCard}>
      <Text style={[s.metricValue, { color }]}>{value}</Text>
      <Text style={s.metricLabel}>{label}</Text>
    </View>
  );
}

function QuickAction({ icon, label, onPress, s }: { icon: string; label: string; onPress: () => void; s: Styles }) {
  return (
    <TouchableOpacity style={s.quickAction} onPress={onPress}>
      <Text style={s.quickActionIcon}>{icon}</Text>
      <Text style={s.quickActionLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

function EmptyState({ emoji, text, actionLabel, onPress, s }: {
  emoji: string; text: string; actionLabel: string; onPress: () => void; s: Styles;
}) {
  return (
    <View style={s.emptyState}>
      <Text style={{ fontSize: 32, marginBottom: SPACING.SM }}>{emoji}</Text>
      <Text style={s.emptyStateText}>{text}</Text>
      <TouchableOpacity style={s.emptyStateBtn} onPress={onPress}>
        <Text style={s.emptyStateBtnText}>{actionLabel}</Text>
      </TouchableOpacity>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollContent: { padding: SPACING.LG, paddingBottom: SPACING.XXXL },

  greetingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.LG },
  greetingHi: { fontSize: FONT_SIZE.XL, fontWeight: '700', color: colors.text },
  greetingRole: { fontSize: FONT_SIZE.SM, color: colors.muted, marginTop: 2 },
  avatarCircle: {
    width: 44, height: 44, borderRadius: RADIUS.FULL, backgroundColor: colors.blueLight,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: colors.blue, fontWeight: '700', fontSize: FONT_SIZE.SM },

  noticeCard: {
    backgroundColor: colors.amberLight, borderRadius: RADIUS.MD, padding: SPACING.MD,
    marginBottom: SPACING.LG,
  },
  noticeText: { fontSize: FONT_SIZE.SM, color: colors.amberDark, lineHeight: 20 },

  metricsRow: { flexDirection: 'row', gap: SPACING.SM, marginBottom: SPACING.XL },
  metricCard: {
    flex: 1, backgroundColor: colors.surface, borderRadius: RADIUS.LG, padding: SPACING.MD,
    alignItems: 'center', borderWidth: 1, borderColor: colors.border,
  },
  metricValue: { fontSize: FONT_SIZE.XL, fontWeight: '700' },
  metricLabel: { fontSize: FONT_SIZE.XS, color: colors.muted, marginTop: 2 },

  sectionTitle: { fontSize: FONT_SIZE.LG, fontWeight: '700', color: colors.text, marginBottom: SPACING.SM },
  sectionHeaderRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: SPACING.LG, marginBottom: SPACING.SM,
  },
  seeAll: { color: colors.blue, fontSize: FONT_SIZE.SM, fontWeight: '600' },

  quickActionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.SM, marginBottom: SPACING.LG },
  quickAction: {
    width: '47%', backgroundColor: colors.surface, borderRadius: RADIUS.LG, paddingVertical: SPACING.LG,
    alignItems: 'center', borderWidth: 1, borderColor: colors.border,
  },
  quickActionIcon: { fontSize: 26, marginBottom: SPACING.XS },
  quickActionLabel: { fontSize: FONT_SIZE.SM, fontWeight: '600', color: colors.text },

  rxCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface,
    borderRadius: RADIUS.LG, padding: SPACING.MD, marginBottom: SPACING.SM,
    borderWidth: 1, borderColor: colors.border,
  },
  rxName: { fontSize: FONT_SIZE.BASE, fontWeight: '600', color: colors.text },
  rxMeta: { fontSize: FONT_SIZE.XS, color: colors.muted, marginTop: 2 },
  scoreBadge: { paddingHorizontal: SPACING.SM, paddingVertical: 4, borderRadius: RADIUS.FULL },
  scoreBadgeText: { fontSize: FONT_SIZE.XS, fontWeight: '700' },

  notifCard: {
    backgroundColor: colors.surface, borderRadius: RADIUS.MD, padding: SPACING.MD,
    marginBottom: SPACING.SM, borderWidth: 1, borderColor: colors.border,
  },
  notifTitle: { fontSize: FONT_SIZE.SM, fontWeight: '700', color: colors.text },
  notifBody: { fontSize: FONT_SIZE.XS, color: colors.muted, marginTop: 2 },

  emptyState: {
    alignItems: 'center', paddingVertical: SPACING.XXL, backgroundColor: colors.surface,
    borderRadius: RADIUS.LG, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed',
  },
  emptyStateText: { fontSize: FONT_SIZE.SM, color: colors.muted, marginBottom: SPACING.MD, textAlign: 'center', paddingHorizontal: SPACING.LG },
  emptyStateBtn: { backgroundColor: colors.blue, borderRadius: RADIUS.MD, paddingHorizontal: SPACING.LG, paddingVertical: SPACING.SM },
  emptyStateBtnText: { color: '#fff', fontWeight: '700', fontSize: FONT_SIZE.SM },
  });
}
