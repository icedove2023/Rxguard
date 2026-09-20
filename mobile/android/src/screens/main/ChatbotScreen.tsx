/**
 * RxGuard Mobile — screens/main/ChatbotScreen.tsx
 * Live chat with the Gemini-backed health assistant.
 */

import React, { useState, useCallback, useRef, useEffect, useMemo} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { ChatbotService } from '@services';
import { ApiError } from '@services/api';
import { FONT_SIZE, SPACING, RADIUS, SCREENS } from '@constants';
import type { RootStackParamList } from '@types';
import { useTheme, type ThemeColors } from '@context/ThemeContext';

type Props = NativeStackScreenProps<RootStackParamList, 'Main'>;

interface LocalMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: string[];
}

const DISCLAIMER = 'This assistant provides general health information and is not a substitute for professional medical advice.';

export default function ChatbotScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const s = useMemo(() => createStyles(colors), [colors]);

  const [messages, setMessages]   = useState<LocalMessage[]>([
    { id: 'intro', role: 'assistant', content: `Hi! I'm your RxGuard health assistant. Ask me about medications, dosages, or general health questions.\n\n${DISCLAIMER}` },
  ]);
  const [input, setInput]         = useState('');
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [sending, setSending]     = useState(false);
  const listRef = useRef<FlatList>(null);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;

    const userMsg: LocalMessage = { id: `u-${Date.now()}`, role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setSending(true);

    try {
      const res = await ChatbotService.sendMessage({ message: text, session_id: sessionId });
      setSessionId(res.data.session_id);
      setMessages(prev => [...prev, {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: res.data.assistant_reply,
        sources: res.data.sources,
      }]);
    } catch (err) {
      setMessages(prev => [...prev, {
        id: `e-${Date.now()}`,
        role: 'assistant',
        content: err instanceof ApiError ? `⚠️ ${err.message}` : '⚠️ Something went wrong. Please try again.',
      }]);
    } finally {
      setSending(false);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [input, sending, sessionId]);

  useEffect(() => {
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
  }, [messages.length]);

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.header}>
        <Text style={s.headerTitle}>🤖 AI Health Assistant</Text>
        {sessionId && (
          <TouchableOpacity onPress={() => navigation.navigate(SCREENS.CHAT_SESSION as never, { sessionId } as never)}>
            <Text style={s.linkText}>History</Text>
          </TouchableOpacity>
        )}
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }} keyboardVerticalOffset={90}>
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={m => m.id}
          contentContainerStyle={s.listContent}
          renderItem={({ item }) => (
            <View style={[s.bubble, item.role === 'user' ? s.bubbleUser : s.bubbleAssistant]}>
              <Text style={[s.bubbleText, item.role === 'user' && s.bubbleTextUser]}>{item.content}</Text>
              {item.sources && item.sources.length > 0 && (
                <Text style={s.sourcesText}>Sources: {item.sources.join(', ')}</Text>
              )}
            </View>
          )}
        />

        {sending && (
          <View style={s.typingRow}>
            <ActivityIndicator size="small" color={colors.muted} />
            <Text style={s.typingText}>Thinking…</Text>
          </View>
        )}

        <View style={s.inputRow}>
          <TextInput
            style={s.input}
            placeholder="Ask about a medication or health topic…"
            placeholderTextColor={colors.muted}
            value={input}
            onChangeText={setInput}
            multiline
            editable={!sending}
          />
          <TouchableOpacity
            style={[s.sendBtn, (!input.trim() || sending) && s.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!input.trim() || sending}
          >
            <Text style={s.sendBtnText}>➤</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: SPACING.LG, paddingVertical: SPACING.MD,
    borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface,
  },
  headerTitle: { fontSize: FONT_SIZE.LG, fontWeight: '700', color: colors.text },
  linkText: { color: colors.blue, fontWeight: '600', fontSize: FONT_SIZE.SM },

  listContent: { padding: SPACING.LG, gap: SPACING.SM },
  bubble: { maxWidth: '85%', borderRadius: RADIUS.LG, padding: SPACING.MD, marginBottom: SPACING.SM },
  bubbleUser: { backgroundColor: colors.blue, alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  bubbleAssistant: { backgroundColor: colors.surface, alignSelf: 'flex-start', borderBottomLeftRadius: 4, borderWidth: 1, borderColor: colors.border },
  bubbleText: { fontSize: FONT_SIZE.SM, color: colors.text, lineHeight: 20 },
  bubbleTextUser: { color: '#fff' },
  sourcesText: { fontSize: 10, color: colors.muted, marginTop: SPACING.XS, fontStyle: 'italic' },

  typingRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.SM, paddingHorizontal: SPACING.LG, paddingBottom: SPACING.SM },
  typingText: { fontSize: FONT_SIZE.XS, color: colors.muted },

  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end', gap: SPACING.SM, padding: SPACING.MD,
    borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface,
  },
  input: {
    flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: RADIUS.LG,
    paddingHorizontal: SPACING.MD, paddingVertical: SPACING.SM, fontSize: FONT_SIZE.SM,
    color: colors.text, maxHeight: 100, backgroundColor: colors.background,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: RADIUS.FULL, backgroundColor: colors.blue,
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.4 },
  sendBtnText: { color: '#fff', fontSize: FONT_SIZE.LG },
  });
}
