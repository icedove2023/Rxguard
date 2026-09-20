/**
 * RxGuard Mobile — screens/main/ScanScreen.tsx
 *
 * Mirrors the web pipeline exactly:
 *   Upload -> Tesseract OCR extract -> review screen (edit raw text
 *   and/or ask Gemini to suggest corrections) -> approve -> EMDEX/
 *   OpenFDA validation -> navigate to ScanResult with the safety report.
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
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { launchCamera, launchImageLibrary, type Asset } from 'react-native-image-picker';
import DocumentPicker from 'react-native-document-picker';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { PrescriptionService } from '@services';
import { ApiError } from '@services/api';
import { FONT_SIZE, SPACING, RADIUS, SCREENS, UPLOAD } from '@constants';
import type { RootStackParamList } from '@types';
import { useTheme, type ThemeColors } from '@context/ThemeContext';

type Props = NativeStackScreenProps<RootStackParamList, 'Main'>;

type Step = 'upload' | 'uploading' | 'extracting' | 'review' | 'validating';

interface PickedFile { uri: string; type: string; name: string; }

export default function ScanScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const s = useMemo(() => createStyles(colors), [colors]);

  const [step, setStep]                 = useState<Step>('upload');
  const [file, setFile]                 = useState<PickedFile | null>(null);
  const [prescriptionId, setPrescriptionId] = useState<number | null>(null);
  const [rawText, setRawText]           = useState('');
  const [baselineText, setBaselineText] = useState('');
  const [baselineSource, setBaselineSource] = useState<'manual' | 'gemini'>('manual');
  const [ocrMeta, setOcrMeta]           = useState<{ engine: string; confidence: number } | null>(null);
  const [suggestion, setSuggestion]     = useState<{ text: string; notes: string[] } | null>(null);
  const [suggesting, setSuggesting]     = useState(false);
  const [error, setError]               = useState<string | null>(null);

  /* ── File pickers ── */
  const pickFromCamera = useCallback(async () => {
    const result = await launchCamera({ mediaType: 'photo', quality: 0.85 });
    const asset: Asset | undefined = result.assets?.[0];
    if (asset?.uri) {
      setFile({ uri: asset.uri, type: asset.type || 'image/jpeg', name: asset.fileName || 'scan.jpg' });
      setError(null);
    }
  }, []);

  const pickFromGallery = useCallback(async () => {
    const result = await launchImageLibrary({ mediaType: 'photo', quality: 0.85 });
    const asset: Asset | undefined = result.assets?.[0];
    if (asset?.uri) {
      setFile({ uri: asset.uri, type: asset.type || 'image/jpeg', name: asset.fileName || 'scan.jpg' });
      setError(null);
    }
  }, []);

  const pickPdf = useCallback(async () => {
    try {
      const [doc] = await DocumentPicker.pick({ type: [DocumentPicker.types.pdf] });
      if (doc.size && doc.size > UPLOAD.MAX_BYTES) {
        setError('File too large — maximum 10MB.');
        return;
      }
      setFile({ uri: doc.uri, type: doc.type || 'application/pdf', name: doc.name || 'prescription.pdf' });
      setError(null);
    } catch (err) {
      if (!DocumentPicker.isCancel(err)) setError('Could not open that file.');
    }
  }, []);

  /* ── Upload + extract (Tesseract) ── */
  const startScan = useCallback(async () => {
    if (!file) { setError('Please select a prescription file first.'); return; }

    setStep('uploading');
    setError(null);

    try {
      const uploadRes = await PrescriptionService.upload(file.uri, file.type, file.name);
      const id = uploadRes.data.prescription_id;
      setPrescriptionId(id);

      setStep('extracting');
      const extractRes = await PrescriptionService.extract(id);

      setRawText(extractRes.data.raw_text);
      setBaselineText(extractRes.data.raw_text);
      setBaselineSource('manual');
      setOcrMeta({ engine: extractRes.data.ocr_engine, confidence: extractRes.data.ocr_confidence });
      setStep('review');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Extraction failed. Please try again.');
      setStep('upload');
    }
  }, [file]);

  /* ── Ask Gemini to suggest corrections (optional) ── */
  const handleSuggest = useCallback(async () => {
    if (!prescriptionId) return;
    setSuggesting(true);
    try {
      const res = await PrescriptionService.suggest(prescriptionId);
      setSuggestion({ text: res.data.suggested_text, notes: res.data.notes });
    } catch (err) {
      Alert.alert('Suggestion unavailable', err instanceof ApiError ? err.message : 'Gemini is temporarily unavailable. You can still edit the text manually.');
    } finally {
      setSuggesting(false);
    }
  }, [prescriptionId]);

  const useSuggestion = useCallback(() => {
    if (!suggestion) return;
    setRawText(suggestion.text);
    setBaselineText(suggestion.text);
    setBaselineSource('gemini');
  }, [suggestion]);

  /* ── Approve + validate ── */
  const handleApprove = useCallback(async () => {
    if (!prescriptionId) return;
    const finalText = rawText.trim();
    if (finalText.length < 5) { setError('The extracted text looks too short to validate.'); return; }

    const editSource = finalText === baselineText ? baselineSource : 'hybrid';

    setStep('validating');
    setError(null);
    try {
      await PrescriptionService.confirm(prescriptionId, finalText, editSource);
      // Reset local wizard state and hand off to the report screen.
      const idToShow = prescriptionId;
      resetWizard();
      navigation.navigate(SCREENS.SCAN_RESULT as never, { prescriptionId: idToShow } as never);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Validation failed. Please try again shortly.');
      setStep('review');
    }
  }, [prescriptionId, rawText, baselineText, baselineSource, navigation]);

  const resetWizard = useCallback(() => {
    setStep('upload');
    setFile(null);
    setPrescriptionId(null);
    setRawText('');
    setBaselineText('');
    setBaselineSource('manual');
    setOcrMeta(null);
    setSuggestion(null);
    setError(null);
  }, []);

  /* ─────────────────────────────────────────────────────────────
     Render
  ───────────────────────────────────────────────────────────── */
  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <ScrollView contentContainerStyle={s.scrollContent} keyboardShouldPersistTaps="handled">
        <Text style={s.pageTitle}>📷 Scan Prescription</Text>

        <StepIndicator step={step} s={s} />

        {(step === 'upload') && (
          <View>
            {!file ? (
              <View style={s.pickerGrid}>
                <PickerButton icon="📷" label="Camera" onPress={pickFromCamera} s={s} />
                <PickerButton icon="🖼️" label="Gallery" onPress={pickFromGallery} s={s} />
                <PickerButton icon="📄" label="PDF" onPress={pickPdf} s={s} />
              </View>
            ) : (
              <View style={s.fileCard}>
                <Text style={s.fileName}>📎 {file.name}</Text>
                <TouchableOpacity onPress={() => setFile(null)}>
                  <Text style={s.linkText}>Remove</Text>
                </TouchableOpacity>
              </View>
            )}

            {error && <Text style={s.errorText}>{error}</Text>}

            <TouchableOpacity
              style={[s.primaryBtn, !file && s.btnDisabled]}
              disabled={!file}
              onPress={startScan}
            >
              <Text style={s.primaryBtnText}>🔍 Extract Text (Tesseract OCR)</Text>
            </TouchableOpacity>
          </View>
        )}

        {(step === 'uploading' || step === 'extracting' || step === 'validating') && (
          <View style={s.loadingBox}>
            <ActivityIndicator size="large" color={colors.blue} />
            <Text style={s.loadingText}>
              {step === 'uploading' && 'Uploading prescription…'}
              {step === 'extracting' && 'Running Tesseract OCR — extracting raw text…'}
              {step === 'validating' && 'Validating with EMDEX + OpenFDA…'}
            </Text>
          </View>
        )}

        {step === 'review' && (
          <View>
            <Text style={s.sectionTitle}>📝 Review Extracted Text</Text>
            {ocrMeta && (
              <Text style={s.metaText}>Engine: {ocrMeta.engine} · Confidence: {ocrMeta.confidence}%</Text>
            )}
            <Text style={s.helperText}>
              This came straight from open-source OCR and may contain misreads. Edit it
              directly, or ask Gemini to suggest corrections — nothing is checked against
              EMDEX/OpenFDA until you approve.
            </Text>

            <TextInput
              style={s.textArea}
              multiline
              value={rawText}
              onChangeText={setRawText}
              textAlignVertical="top"
            />

            <TouchableOpacity
              style={[s.outlineBtn, suggesting && s.btnDisabled]}
              onPress={handleSuggest}
              disabled={suggesting}
            >
              {suggesting
                ? <ActivityIndicator color={colors.blue} size="small" />
                : <Text style={s.outlineBtnText}>✨ Ask Gemini to Suggest Corrections</Text>}
            </TouchableOpacity>

            {suggestion && (
              <View style={s.suggestionBox}>
                <View style={s.suggestionHeader}>
                  <Text style={s.suggestionTitle}>✨ Gemini's suggested version</Text>
                  <TouchableOpacity onPress={useSuggestion}>
                    <Text style={s.linkText}>Use This Version</Text>
                  </TouchableOpacity>
                </View>
                <ScrollView style={s.suggestionScroll}>
                  <Text style={s.suggestionText}>{suggestion.text}</Text>
                </ScrollView>
                {suggestion.notes.length > 0 && (
                  <Text style={s.suggestionNotes}>
                    Notes: {suggestion.notes.join(' · ')}
                  </Text>
                )}
              </View>
            )}

            {error && <Text style={s.errorText}>{error}</Text>}

            <TouchableOpacity style={s.primaryBtn} onPress={handleApprove}>
              <Text style={s.primaryBtnText}>✅ Approve & Validate</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

type Styles = ReturnType<typeof createStyles>;

function StepIndicator({ step, s }: { step: Step; s: Styles }) {
  const idx = { upload: 0, uploading: 0, extracting: 1, review: 2, validating: 3 }[step];
  const labels = ['Upload', 'OCR Extract', 'Review', 'Validate'];
  return (
    <View style={s.stepRow}>
      {labels.map((label, i) => (
        <View key={label} style={s.stepItem}>
          <View style={[s.stepDot, i <= idx && s.stepDotActive]}>
            <Text style={[s.stepDotText, i <= idx && s.stepDotTextActive]}>{i + 1}</Text>
          </View>
          <Text style={[s.stepLabel, i <= idx && s.stepLabelActive]}>{label}</Text>
        </View>
      ))}
    </View>
  );
}

function PickerButton({ icon, label, onPress, s }: { icon: string; label: string; onPress: () => void; s: Styles }) {
  return (
    <TouchableOpacity style={s.pickerBtn} onPress={onPress}>
      <Text style={s.pickerIcon}>{icon}</Text>
      <Text style={s.pickerLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollContent: { padding: SPACING.LG, paddingBottom: SPACING.XXXL },
  pageTitle: { fontSize: FONT_SIZE.XL, fontWeight: '700', color: colors.text, marginBottom: SPACING.LG },

  stepRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: SPACING.XL },
  stepItem: { alignItems: 'center', flex: 1 },
  stepDot: {
    width: 28, height: 28, borderRadius: RADIUS.FULL, backgroundColor: colors.border,
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  stepDotActive: { backgroundColor: colors.blue },
  stepDotText: { fontSize: FONT_SIZE.XS, fontWeight: '700', color: colors.muted },
  stepDotTextActive: { color: '#fff' },
  stepLabel: { fontSize: 10, color: colors.muted, textAlign: 'center' },
  stepLabelActive: { color: colors.blue, fontWeight: '600' },

  pickerGrid: { flexDirection: 'row', gap: SPACING.SM, marginBottom: SPACING.LG },
  pickerBtn: {
    flex: 1, backgroundColor: colors.surface, borderRadius: RADIUS.LG, paddingVertical: SPACING.XL,
    alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed',
  },
  pickerIcon: { fontSize: 28, marginBottom: SPACING.XS },
  pickerLabel: { fontSize: FONT_SIZE.SM, fontWeight: '600', color: colors.text },

  fileCard: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: RADIUS.MD, padding: SPACING.MD,
    marginBottom: SPACING.LG, borderWidth: 1, borderColor: colors.border,
  },
  fileName: { fontSize: FONT_SIZE.SM, color: colors.text, flex: 1 },

  loadingBox: { alignItems: 'center', paddingVertical: SPACING.XXXL },
  loadingText: { fontSize: FONT_SIZE.SM, color: colors.muted, marginTop: SPACING.MD, textAlign: 'center' },

  sectionTitle: { fontSize: FONT_SIZE.LG, fontWeight: '700', color: colors.text, marginBottom: SPACING.XS },
  metaText: { fontSize: FONT_SIZE.XS, color: colors.muted, marginBottom: SPACING.SM },
  helperText: { fontSize: FONT_SIZE.SM, color: colors.muted, marginBottom: SPACING.MD, lineHeight: 20 },

  textArea: {
    borderWidth: 1, borderColor: colors.border, borderRadius: RADIUS.MD, padding: SPACING.MD,
    fontSize: FONT_SIZE.SM, color: colors.text, backgroundColor: colors.surface,
    minHeight: 180, fontFamily: 'monospace', marginBottom: SPACING.MD,
  },

  outlineBtn: {
    borderWidth: 1, borderColor: colors.blue, borderRadius: RADIUS.MD, paddingVertical: SPACING.SM,
    alignItems: 'center', marginBottom: SPACING.MD,
  },
  outlineBtnText: { color: colors.blue, fontWeight: '600', fontSize: FONT_SIZE.SM },

  suggestionBox: {
    backgroundColor: colors.surfaceAlt, borderRadius: RADIUS.MD, borderWidth: 1,
    borderColor: colors.border, borderStyle: 'dashed', padding: SPACING.MD, marginBottom: SPACING.MD,
  },
  suggestionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.SM },
  suggestionTitle: { fontSize: FONT_SIZE.SM, fontWeight: '700', color: colors.text },
  suggestionScroll: { maxHeight: 160 },
  suggestionText: { fontSize: FONT_SIZE.XS, fontFamily: 'monospace', color: colors.text },
  suggestionNotes: { fontSize: FONT_SIZE.XS, color: colors.muted, marginTop: SPACING.SM },

  linkText: { color: colors.blue, fontWeight: '700', fontSize: FONT_SIZE.XS },
  errorText: { color: colors.red, fontSize: FONT_SIZE.SM, marginBottom: SPACING.MD },

  primaryBtn: { backgroundColor: colors.blue, borderRadius: RADIUS.MD, paddingVertical: SPACING.MD, alignItems: 'center' },
  btnDisabled: { opacity: 0.5 },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: FONT_SIZE.BASE },
  });
}
