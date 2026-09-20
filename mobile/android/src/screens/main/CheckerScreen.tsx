/**
 * RxGuard Mobile — screens/main/CheckerScreen.tsx
 * Drug interaction checker: add multiple drug names, optional patient
 * context (pregnant, age), submit to /drugs/interactions.
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
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { DrugService } from '@services';
import { ApiError } from '@services/api';
import { FONT_SIZE, SPACING, RADIUS, SCREENS } from '@constants';
import type { RootStackParamList } from '@types';
import { useTheme, type ThemeColors } from '@context/ThemeContext';

type Props = NativeStackScreenProps<RootStackParamList, 'Main'>;

export default function CheckerScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const s = useMemo(() => createStyles(colors), [colors]);

  const [drugInput, setDrugInput] = useState('');
  const [drugs, setDrugs]         = useState<string[]>([]);
  const [pregnant, setPregnant]   = useState(false);
  const [age, setAge]             = useState('');
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);

  const addDrug = useCallback(() => {
    const name = drugInput.trim();
    if (!name) return;
    if (drugs.some(d => d.toLowerCase() === name.toLowerCase())) {
      setDrugInput('');
      return;
    }
    setDrugs(prev => [...prev, name]);
    setDrugInput('');
  }, [drugInput, drugs]);

  const removeDrug = useCallback((name: string) => {
    setDrugs(prev => prev.filter(d => d !== name));
  }, []);

  const handleCheck = useCallback(async () => {
    if (drugs.length < 2) {
      setError('Add at least two drugs to check for interactions.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await DrugService.checkInteractions({
        drugs,
        patient_pregnant: pregnant,
        patient_age: age ? Number(age) : null,
      });
      navigation.navigate(SCREENS.CHECKER_RESULT as never, { result: res.data } as never);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not check interactions. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [drugs, pregnant, age, navigation]);

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <ScrollView contentContainerStyle={s.scrollContent} keyboardShouldPersistTaps="handled">
        <Text style={s.pageTitle}>⚠️ Drug Interaction Checker</Text>
        <Text style={s.subtitle}>Add two or more drugs to check for known interactions.</Text>

        <View style={s.addRow}>
          <TextInput
            style={s.input}
            placeholder="e.g. Amoxicillin"
            placeholderTextColor={colors.muted}
            value={drugInput}
            onChangeText={setDrugInput}
            onSubmitEditing={addDrug}
            returnKeyType="done"
          />
          <TouchableOpacity style={s.addBtn} onPress={addDrug}>
            <Text style={s.addBtnText}>+ Add</Text>
          </TouchableOpacity>
        </View>

        {drugs.length > 0 && (
          <View style={s.chipsRow}>
            {drugs.map(d => (
              <TouchableOpacity key={d} style={s.chip} onPress={() => removeDrug(d)}>
                <Text style={s.chipText}>{d} ✕</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={s.optionRow}>
          <Text style={s.optionLabel}>Patient is pregnant</Text>
          <Switch value={pregnant} onValueChange={setPregnant} trackColor={{ true: colors.blue }} />
        </View>

        <Text style={s.label}>Patient age (optional)</Text>
        <TextInput
          style={s.input}
          placeholder="e.g. 34"
          placeholderTextColor={colors.muted}
          value={age}
          onChangeText={setAge}
          keyboardType="number-pad"
        />

        {error && <Text style={s.errorText}>{error}</Text>}

        <TouchableOpacity
          style={[s.primaryBtn, loading && s.btnDisabled]}
          onPress={handleCheck}
          disabled={loading}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryBtnText}>Check Interactions</Text>}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollContent: { padding: SPACING.LG, paddingBottom: SPACING.XXXL },
  pageTitle: { fontSize: FONT_SIZE.XL, fontWeight: '700', color: colors.text, marginBottom: SPACING.XS },
  subtitle: { fontSize: FONT_SIZE.SM, color: colors.muted, marginBottom: SPACING.LG },

  addRow: { flexDirection: 'row', gap: SPACING.SM, marginBottom: SPACING.MD },
  input: {
    flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: RADIUS.MD,
    paddingHorizontal: SPACING.MD, paddingVertical: SPACING.SM, fontSize: FONT_SIZE.BASE,
    color: colors.text, backgroundColor: colors.surface,
  },
  addBtn: { backgroundColor: colors.blueLight, borderRadius: RADIUS.MD, paddingHorizontal: SPACING.LG, justifyContent: 'center' },
  addBtnText: { color: colors.blue, fontWeight: '700', fontSize: FONT_SIZE.SM },

  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.SM, marginBottom: SPACING.LG },
  chip: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: RADIUS.FULL, paddingHorizontal: SPACING.MD, paddingVertical: 6 },
  chipText: { fontSize: FONT_SIZE.SM, color: colors.text },

  optionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.MD },
  optionLabel: { fontSize: FONT_SIZE.SM, color: colors.text, fontWeight: '600' },
  label: { fontSize: FONT_SIZE.SM, fontWeight: '600', color: colors.text, marginBottom: SPACING.XS },

  errorText: { color: colors.red, fontSize: FONT_SIZE.SM, marginBottom: SPACING.MD },
  primaryBtn: { backgroundColor: colors.blue, borderRadius: RADIUS.MD, paddingVertical: SPACING.MD, alignItems: 'center', marginTop: SPACING.LG },
  btnDisabled: { opacity: 0.6 },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: FONT_SIZE.BASE },
  });
}
