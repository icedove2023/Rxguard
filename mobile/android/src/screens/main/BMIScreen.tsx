/**
 * RxGuard Mobile — screens/main/BMIScreen.tsx
 * BMI calculator with gauge, category, and nutrition/lifestyle tips.
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

import { BmiService } from '@services';
import { ApiError } from '@services/api';
import { FONT_SIZE, SPACING, RADIUS, SCREENS } from '@constants';
import type { RootStackParamList, BmiRecord } from '@types';
import { useTheme, type ThemeColors } from '@context/ThemeContext';

type Props = NativeStackScreenProps<RootStackParamList, 'Main'>;

export default function BMIScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const s = useMemo(() => createStyles(colors), [colors]);

  const [height, setHeight]   = useState('');
  const [weight, setWeight]   = useState('');
  const [age, setAge]         = useState('');
  const [gender, setGender]   = useState<'male' | 'female'>('female');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [result, setResult]   = useState<BmiRecord | null>(null);

  const handleCalculate = useCallback(async () => {
    const h = Number(height), w = Number(weight), a = Number(age);
    if (!h || h < 50 || h > 250) { setError('Enter a valid height in cm.'); return; }
    if (!w || w < 10 || w > 400) { setError('Enter a valid weight in kg.'); return; }
    if (!a || a < 1 || a > 120)  { setError('Enter a valid age.'); return; }

    setError(null);
    setLoading(true);
    try {
      const res = await BmiService.calculate({ height_cm: h, weight_kg: w, age: a, gender });
      setResult(res.data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not calculate BMI.');
    } finally {
      setLoading(false);
    }
  }, [height, weight, age, gender]);

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <ScrollView contentContainerStyle={s.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={s.headerRow}>
          <Text style={s.pageTitle}>⚖️ BMI Calculator</Text>
          <TouchableOpacity onPress={() => navigation.navigate(SCREENS.BMI_HISTORY as never)}>
            <Text style={s.linkText}>History →</Text>
          </TouchableOpacity>
        </View>

        <View style={s.genderRow}>
          {(['female', 'male'] as const).map(g => (
            <TouchableOpacity
              key={g}
              style={[s.genderBtn, gender === g && s.genderBtnActive]}
              onPress={() => setGender(g)}
            >
              <Text style={[s.genderBtnText, gender === g && s.genderBtnTextActive]}>
                {g === 'female' ? '♀ Female' : '♂ Male'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={s.label}>Height (cm)</Text>
        <TextInput style={s.input} keyboardType="numeric" value={height} onChangeText={setHeight} placeholder="e.g. 170" placeholderTextColor={colors.muted} />

        <Text style={s.label}>Weight (kg)</Text>
        <TextInput style={s.input} keyboardType="numeric" value={weight} onChangeText={setWeight} placeholder="e.g. 68" placeholderTextColor={colors.muted} />

        <Text style={s.label}>Age</Text>
        <TextInput style={s.input} keyboardType="numeric" value={age} onChangeText={setAge} placeholder="e.g. 30" placeholderTextColor={colors.muted} />

        {error && <Text style={s.errorText}>{error}</Text>}

        <TouchableOpacity style={[s.primaryBtn, loading && s.btnDisabled]} onPress={handleCalculate} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryBtnText}>Calculate BMI</Text>}
        </TouchableOpacity>

        {result && (
          <View style={s.resultCard}>
            <Text style={[s.bmiValue, { color: result.category_color }]}>{result.bmi_value}</Text>
            <Text style={[s.bmiCategory, { color: result.category_color }]}>{result.category_label}</Text>

            <View style={s.gaugeTrack}>
              <View style={[s.gaugeFill, { width: `${result.gauge_percent}%`, backgroundColor: result.category_color }]} />
            </View>

            <Text style={s.idealWeight}>
              Ideal weight range: {result.ideal_weight_kg.min_kg}–{result.ideal_weight_kg.max_kg} kg
            </Text>

            {result.nutrition_recs.length > 0 && (
              <View style={s.tipsSection}>
                <Text style={s.tipsTitle}>🍽 Nutrition tips</Text>
                {result.nutrition_recs.map((t, i) => <Text key={i} style={s.tipText}>• {t}</Text>)}
              </View>
            )}

            {result.lifestyle_recs.length > 0 && (
              <View style={s.tipsSection}>
                <Text style={s.tipsTitle}>🏃 Lifestyle tips</Text>
                {result.lifestyle_recs.map((t, i) => <Text key={i} style={s.tipText}>• {t}</Text>)}
              </View>
            )}

            {result.medical_note && (
              <Text style={s.medicalNote}>ℹ️ {result.medical_note}</Text>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollContent: { padding: SPACING.LG, paddingBottom: SPACING.XXXL },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.LG },
  pageTitle: { fontSize: FONT_SIZE.XL, fontWeight: '700', color: colors.text },
  linkText: { color: colors.blue, fontWeight: '600', fontSize: FONT_SIZE.SM },

  genderRow: { flexDirection: 'row', gap: SPACING.SM, marginBottom: SPACING.LG },
  genderBtn: {
    flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: RADIUS.MD,
    paddingVertical: SPACING.SM, alignItems: 'center', backgroundColor: colors.surface,
  },
  genderBtnActive: { backgroundColor: colors.blueLight, borderColor: colors.blue },
  genderBtnText: { fontSize: FONT_SIZE.SM, color: colors.muted, fontWeight: '600' },
  genderBtnTextActive: { color: colors.blue },

  label: { fontSize: FONT_SIZE.SM, fontWeight: '600', color: colors.text, marginBottom: SPACING.XS, marginTop: SPACING.SM },
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: RADIUS.MD, paddingHorizontal: SPACING.MD,
    paddingVertical: SPACING.SM, fontSize: FONT_SIZE.BASE, color: colors.text, backgroundColor: colors.surface,
  },
  errorText: { color: colors.red, fontSize: FONT_SIZE.SM, marginTop: SPACING.MD },

  primaryBtn: { backgroundColor: colors.blue, borderRadius: RADIUS.MD, paddingVertical: SPACING.MD, alignItems: 'center', marginTop: SPACING.LG },
  btnDisabled: { opacity: 0.6 },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: FONT_SIZE.BASE },

  resultCard: { backgroundColor: colors.surface, borderRadius: RADIUS.LG, padding: SPACING.LG, marginTop: SPACING.XL, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  bmiValue: { fontSize: 40, fontWeight: '800' },
  bmiCategory: { fontSize: FONT_SIZE.BASE, fontWeight: '600', marginBottom: SPACING.MD },
  gaugeTrack: { width: '100%', height: 8, backgroundColor: colors.border, borderRadius: RADIUS.FULL, overflow: 'hidden', marginBottom: SPACING.MD },
  gaugeFill: { height: '100%', borderRadius: RADIUS.FULL },
  idealWeight: { fontSize: FONT_SIZE.SM, color: colors.muted, marginBottom: SPACING.MD },

  tipsSection: { width: '100%', marginTop: SPACING.SM },
  tipsTitle: { fontSize: FONT_SIZE.SM, fontWeight: '700', color: colors.text, marginBottom: SPACING.XS },
  tipText: { fontSize: FONT_SIZE.XS, color: colors.textSecondary, marginBottom: 2 },
  medicalNote: { fontSize: FONT_SIZE.XS, color: colors.muted, marginTop: SPACING.MD, fontStyle: 'italic', textAlign: 'center' },
  });
}
