/**
 * RxGuard Mobile — screens/prescriptions/PrescriptionReportScreen.tsx
 *
 * Full safety report for a prescription: score, patient/prescriber
 * info, drug table, interactions. Used for both the ScanResult route
 * (just-confirmed scan) and PrescriptionDetail route (viewing history)
 * — same data shape (PrescriptionService.show -> fullReport()).
 */

import React, { useCallback, useState, useMemo} from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { PrescriptionService } from '@services';
import { ApiError } from '@services/api';
import { FONT_SIZE, SPACING, RADIUS } from '@constants';
import { DateUtils, safetyColor, safetyBgColor, severityColor, severityBgColor, severityLabel } from '@utils';
import type { RootStackParamList, Prescription } from '@types';
import { useTheme, type ThemeColors } from '@context/ThemeContext';

type Props = NativeStackScreenProps<RootStackParamList, 'ScanResult' | 'PrescriptionDetail'>;

export default function PrescriptionReportScreen({ route }: Props) {
  const { colors } = useTheme();
  const s = useMemo(() => createStyles(colors), [colors]);

  const { prescriptionId } = route.params;

  const [report, setReport]   = useState<Prescription | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await PrescriptionService.show(prescriptionId);
      setReport(res.data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load this prescription.');
    } finally {
      setLoading(false);
    }
  }, [prescriptionId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) {
    return (
      <SafeAreaView style={s.container}>
        <ActivityIndicator size="large" color={colors.blue} style={{ marginTop: SPACING.XXXL }} />
      </SafeAreaView>
    );
  }

  if (error || !report) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.centered}>
          <Text style={s.errorText}>{error || 'Prescription not found.'}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const score = report.safety_score;
  const geminiUsed = report.edit_source === 'gemini' || report.edit_source === 'hybrid';

  return (
    <SafeAreaView style={s.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={s.scrollContent}>
        {/* Safety score */}
        <View style={[s.scoreCard, { backgroundColor: safetyBgColor(score) }]}>
          <Text style={[s.scoreValue, { color: safetyColor(score) }]}>
            {score !== null ? `${Math.round(score)}%` : '—'}
          </Text>
          <Text style={[s.scoreLabel, { color: safetyColor(score) }]}>{report.safety_label}</Text>
          {report.completeness_score !== null && (
            <Text style={s.completenessText}>Completeness: {Math.round(report.completeness_score)}%</Text>
          )}
        </View>

        {/* OCR meta */}
        <Text style={s.ocrMeta}>
          OCR: {report.ocr_engine || 'Tesseract'}
          {report.ocr_confidence ? ` (${report.ocr_confidence}% confidence)` : ''}
          {geminiUsed ? ` · Reviewed with Gemini's suggestions (${report.edit_source})` : ' · Manually reviewed'}
        </Text>

        {/* Flags */}
        {(report.flags.has_interactions || report.flags.has_errors) && (
          <View style={s.flagsRow}>
            {report.flags.has_interactions && (
              <View style={s.flagBadge}><Text style={s.flagBadgeText}>⚠ Drug interactions found</Text></View>
            )}
            {report.flags.has_errors && (
              <View style={s.flagBadge}><Text style={s.flagBadgeText}>⛔ Possible errors detected</Text></View>
            )}
          </View>
        )}

        {/* Patient / prescriber info */}
        <View style={s.infoCard}>
          <InfoRow label="Patient" value={report.patient.name || '—'} s={s} />
          <InfoRow label="Age / Gender" value={`${report.patient.age ?? '—'} · ${report.patient.gender ?? '—'}`} s={s} />
          <InfoRow label="Prescriber" value={report.prescriber.name || '—'} s={s} />
          <InfoRow label="Hospital" value={report.prescriber.hospital || '—'} s={s} />
          <InfoRow label="Date" value={report.prescription_date ? DateUtils.display(report.prescription_date) : '—'} s={s} />
        </View>

        {/* Drugs */}
        <Text style={s.sectionTitle}>Drugs ({report.drugs.length})</Text>
        {report.drugs.length === 0 ? (
          <Text style={s.emptyText}>No drugs extracted from this prescription.</Text>
        ) : (
          report.drugs.map(d => (
            <View key={d.id} style={s.drugCard}>
              <View style={{ flex: 1 }}>
                <Text style={s.drugName}>{d.display_name || d.drug_name}</Text>
                <Text style={s.drugMeta}>
                  {[d.strength, d.dosage_form, d.dose_instructions].filter(Boolean).join(' · ') || '—'}
                </Text>
                {d.brands.length > 0 && (
                  <View style={s.brandRow}>
                    {d.brands.slice(0, 3).map(b => (
                      <View key={b} style={s.brandChip}><Text style={s.brandChipText}>{b}</Text></View>
                    ))}
                  </View>
                )}
              </View>
              <Text style={{ fontSize: 18 }}>{d.has_warning ? '⚠️' : '✅'}</Text>
            </View>
          ))
        )}

        {/* Interactions */}
        <Text style={s.sectionTitle}>Interactions ({report.interactions.length})</Text>
        {report.interactions.length === 0 ? (
          <Text style={s.emptyText}>No interactions detected. ✅</Text>
        ) : (
          report.interactions.map(i => (
            <View key={i.id} style={[s.interactionCard, { backgroundColor: severityBgColor(i.severity) }]}>
              <View style={s.interactionHeader}>
                <Text style={s.interactionDrugs}>{i.drug_a} + {i.drug_b}</Text>
                <View style={[s.severityBadge, { backgroundColor: severityColor(i.severity) }]}>
                  <Text style={s.severityBadgeText}>{severityLabel(i.severity)}</Text>
                </View>
              </View>
              {i.clinical_effect && <Text style={s.interactionText}>{i.clinical_effect}</Text>}
              {i.recommendation && <Text style={s.interactionRec}>💡 {i.recommendation}</Text>}
            </View>
          ))
        )}

        {/* Review status (professional sign-off, if any) */}
        {report.review.status && (
          <View style={s.reviewCard}>
            <Text style={s.reviewTitle}>
              {report.review.status === 'approved' ? '✅ Clinically Reviewed' : '🚩 Flagged for Review'}
            </Text>
            {report.review.reviewed_by && (
              <Text style={s.reviewMeta}>
                By {report.review.reviewed_by.name} ({report.review.reviewed_by.role}) ·{' '}
                {DateUtils.display(report.review.reviewed_at)}
              </Text>
            )}
            {report.review.flag_reason && <Text style={s.reviewMeta}>Reason: {report.review.flag_reason}</Text>}
          </View>
        )}
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
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.XL },
  errorText: { color: colors.red, fontSize: FONT_SIZE.BASE, textAlign: 'center' },

  scoreCard: { borderRadius: RADIUS.LG, padding: SPACING.XL, alignItems: 'center', marginBottom: SPACING.SM },
  scoreValue: { fontSize: 40, fontWeight: '800' },
  scoreLabel: { fontSize: FONT_SIZE.BASE, fontWeight: '600', marginTop: 2 },
  completenessText: { fontSize: FONT_SIZE.XS, color: colors.muted, marginTop: SPACING.SM },

  ocrMeta: { fontSize: FONT_SIZE.XS, color: colors.muted, textAlign: 'center', marginBottom: SPACING.LG },

  flagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.SM, marginBottom: SPACING.LG },
  flagBadge: { backgroundColor: colors.redLight, borderRadius: RADIUS.FULL, paddingHorizontal: SPACING.MD, paddingVertical: 6 },
  flagBadgeText: { color: colors.redDark, fontSize: FONT_SIZE.XS, fontWeight: '600' },

  infoCard: {
    backgroundColor: colors.surface, borderRadius: RADIUS.LG, padding: SPACING.MD,
    marginBottom: SPACING.LG, borderWidth: 1, borderColor: colors.border,
  },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  infoLabel: { fontSize: FONT_SIZE.SM, color: colors.muted },
  infoValue: { fontSize: FONT_SIZE.SM, color: colors.text, fontWeight: '600', flexShrink: 1, textAlign: 'right' },

  sectionTitle: { fontSize: FONT_SIZE.LG, fontWeight: '700', color: colors.text, marginBottom: SPACING.SM, marginTop: SPACING.SM },
  emptyText: { fontSize: FONT_SIZE.SM, color: colors.muted, marginBottom: SPACING.LG },

  drugCard: {
    flexDirection: 'row', alignItems: 'flex-start', backgroundColor: colors.surface,
    borderRadius: RADIUS.MD, padding: SPACING.MD, marginBottom: SPACING.SM,
    borderWidth: 1, borderColor: colors.border,
  },
  drugName: { fontSize: FONT_SIZE.BASE, fontWeight: '700', color: colors.text },
  drugMeta: { fontSize: FONT_SIZE.XS, color: colors.muted, marginTop: 2 },
  brandRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: SPACING.XS },
  brandChip: { backgroundColor: colors.greenLight, borderRadius: RADIUS.FULL, paddingHorizontal: SPACING.SM, paddingVertical: 2 },
  brandChipText: { fontSize: 10, color: colors.greenDark, fontWeight: '600' },

  interactionCard: { borderRadius: RADIUS.MD, padding: SPACING.MD, marginBottom: SPACING.SM },
  interactionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.XS },
  interactionDrugs: { fontSize: FONT_SIZE.SM, fontWeight: '700', color: colors.text, flex: 1 },
  severityBadge: { borderRadius: RADIUS.FULL, paddingHorizontal: SPACING.SM, paddingVertical: 2 },
  severityBadgeText: { fontSize: 10, fontWeight: '700', color: '#fff' },
  interactionText: { fontSize: FONT_SIZE.XS, color: colors.textSecondary, marginBottom: 4 },
  interactionRec: { fontSize: FONT_SIZE.XS, color: colors.text, fontStyle: 'italic' },

  reviewCard: {
    backgroundColor: colors.blueLight, borderRadius: RADIUS.MD, padding: SPACING.MD, marginTop: SPACING.MD,
  },
  reviewTitle: { fontSize: FONT_SIZE.SM, fontWeight: '700', color: colors.blueDark },
  reviewMeta: { fontSize: FONT_SIZE.XS, color: colors.textSecondary, marginTop: 2 },
  });
}
