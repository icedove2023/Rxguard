/**
 * RxGuard Mobile — screens/prescriptions/CheckerResultScreen.tsx
 * Shows the interaction-check result passed via navigation params.
 */

import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { FONT_SIZE, SPACING, RADIUS } from '@constants';
import { severityColor, severityBgColor, severityLabel } from '@utils';
import type { RootStackParamList } from '@types';
import { useTheme, type ThemeColors } from '@context/ThemeContext';

type Props = NativeStackScreenProps<RootStackParamList, 'CheckerResult'>;

export default function CheckerResultScreen({ route }: Props) {
  const { colors } = useTheme();
  const s = useMemo(() => createStyles(colors), [colors]);

  const { result } = route.params;

  return (
    <SafeAreaView style={s.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={s.scrollContent}>
        <View style={[s.summaryCard, { backgroundColor: result.has_major ? colors.redLight : colors.greenLight }]}>
          <Text style={[s.summaryValue, { color: result.has_major ? colors.redDark : colors.greenDark }]}>
            {result.interaction_count}
          </Text>
          <Text style={[s.summaryLabel, { color: result.has_major ? colors.redDark : colors.greenDark }]}>
            {result.interaction_count === 0 ? 'No interactions found ✅' : 'Interaction(s) found'}
          </Text>
        </View>

        <Text style={s.drugsChecked}>Checked: {result.drugs.join(', ')}</Text>

        {result.interactions.map(i => (
          <View key={i.id} style={[s.interactionCard, { backgroundColor: severityBgColor(i.severity) }]}>
            <View style={s.interactionHeader}>
              <Text style={s.interactionDrugs}>{i.drug_a} + {i.drug_b}</Text>
              <View style={[s.severityBadge, { backgroundColor: severityColor(i.severity) }]}>
                <Text style={s.severityBadgeText}>{severityLabel(i.severity)}</Text>
              </View>
            </View>
            {i.mechanism && <Text style={s.interactionText}>{i.mechanism}</Text>}
            {i.clinical_effect && <Text style={s.interactionText}>{i.clinical_effect}</Text>}
            {i.recommendation && <Text style={s.interactionRec}>💡 {i.recommendation}</Text>}

            {i.alternatives.length > 0 && (
              <View style={s.altBox}>
                <Text style={s.altTitle}>Suggested alternatives</Text>
                {i.alternatives.map((a, idx) => (
                  <Text key={idx} style={s.altText}>
                    • {a.generic} {a.brands.length ? `(${a.brands.join(', ')})` : ''} — {a.reason}
                  </Text>
                ))}
              </View>
            )}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollContent: { padding: SPACING.LG, paddingBottom: SPACING.XXXL },

  summaryCard: { borderRadius: RADIUS.LG, padding: SPACING.XL, alignItems: 'center', marginBottom: SPACING.SM },
  summaryValue: { fontSize: 36, fontWeight: '800' },
  summaryLabel: { fontSize: FONT_SIZE.BASE, fontWeight: '600', marginTop: 2 },

  drugsChecked: { fontSize: FONT_SIZE.SM, color: colors.muted, textAlign: 'center', marginBottom: SPACING.LG },

  interactionCard: { borderRadius: RADIUS.MD, padding: SPACING.MD, marginBottom: SPACING.SM },
  interactionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.XS },
  interactionDrugs: { fontSize: FONT_SIZE.SM, fontWeight: '700', color: colors.text, flex: 1 },
  severityBadge: { borderRadius: RADIUS.FULL, paddingHorizontal: SPACING.SM, paddingVertical: 2 },
  severityBadgeText: { fontSize: 10, fontWeight: '700', color: '#fff' },
  interactionText: { fontSize: FONT_SIZE.XS, color: colors.textSecondary, marginBottom: 4 },
  interactionRec: { fontSize: FONT_SIZE.XS, color: colors.text, fontStyle: 'italic', marginBottom: 4 },

  altBox: { marginTop: SPACING.SM, paddingTop: SPACING.SM, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.08)' },
  altTitle: { fontSize: FONT_SIZE.XS, fontWeight: '700', color: colors.text, marginBottom: 4 },
  altText: { fontSize: FONT_SIZE.XS, color: colors.textSecondary, marginBottom: 2 },
  });
}
