/**
 * RxGuard Mobile — screens/prescriptions/ChatSessionScreen.tsx
 * With a sessionId param: shows that conversation's full history (read-only).
 * Without one: lists past sessions to pick from.
 */

import React, { useCallback, useEffect, useState, useMemo} from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { ChatbotService } from '@services';
import { ApiError } from '@services/api';
import { FONT_SIZE, SPACING, RADIUS } from '@constants';
import { DateUtils, truncate } from '@utils';
import type { RootStackParamList, ChatSession, ChatMessage } from '@types';
import { useTheme, type ThemeColors } from '@context/ThemeContext';

type Props = NativeStackScreenProps<RootStackParamList, 'ChatSession'>;

export default function ChatSessionScreen({ route, navigation }: Props) {
  const { colors } = useTheme();
  const s = useMemo(() => createStyles(colors), [colors]);

  const sessionId = route.params?.sessionId;

  const [session, setSession]   = useState<ChatSession | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (sessionId) {
        const res = await ChatbotService.session(sessionId);
        setSession(res.data);
        navigation.setOptions?.({ title: res.data.title || 'Conversation' });
      } else {
        const res = await ChatbotService.history(1);
        setSessions(res.data.data);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load conversation history.');
    } finally {
      setLoading(false);
    }
  }, [sessionId, navigation]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = useCallback(async (id: number) => {
    try {
      await ChatbotService.deleteSession(id);
      setSessions(prev => prev.filter(s => s.id !== id));
    } catch {
      /* non-fatal */
    }
  }, []);

  if (loading) {
    return (
      <SafeAreaView style={s.container}>
        <ActivityIndicator size="large" color={colors.blue} style={{ marginTop: SPACING.XXXL }} />
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.centered}><Text style={s.errorText}>{error}</Text></View>
      </SafeAreaView>
    );
  }

  // Single-session view
  if (sessionId && session) {
    return (
      <SafeAreaView style={s.container} edges={['bottom']}>
        <FlatList
          data={session.messages || []}
          keyExtractor={(m: ChatMessage) => String(m.id)}
          contentContainerStyle={s.listContent}
          renderItem={({ item }) => (
            <View style={[s.bubble, item.role === 'user' ? s.bubbleUser : s.bubbleAssistant]}>
              <Text style={[s.bubbleText, item.role === 'user' && s.bubbleTextUser]}>{item.content}</Text>
              <Text style={s.timeText}>{DateUtils.time(item.created_at)}</Text>
            </View>
          )}
          ListEmptyComponent={<Text style={s.emptyText}>No messages in this conversation.</Text>}
        />
      </SafeAreaView>
    );
  }

  // Session list view
  return (
    <SafeAreaView style={s.container} edges={['bottom']}>
      <FlatList
        data={sessions}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={s.listContent}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={s.sessionCard}
            onPress={() => navigation.push('ChatSession' as never, { sessionId: item.id } as never)}
          >
            <View style={{ flex: 1 }}>
              <Text style={s.sessionTitle}>{item.title ? truncate(item.title, 40) : 'Conversation'}</Text>
              <Text style={s.sessionMeta}>{item.message_count} messages · {DateUtils.relative(item.updated_at)}</Text>
            </View>
            <TouchableOpacity onPress={() => handleDelete(item.id)}>
              <Text style={s.deleteText}>🗑</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={s.emptyText}>No past conversations yet.</Text>}
      />
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.XL },
  errorText: { color: colors.red, fontSize: FONT_SIZE.BASE, textAlign: 'center' },
  listContent: { padding: SPACING.LG, paddingBottom: SPACING.XXXL },
  emptyText: { textAlign: 'center', color: colors.muted, fontSize: FONT_SIZE.SM, marginTop: SPACING.XXXL },

  bubble: { maxWidth: '85%', borderRadius: RADIUS.LG, padding: SPACING.MD, marginBottom: SPACING.SM },
  bubbleUser: { backgroundColor: colors.blue, alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  bubbleAssistant: { backgroundColor: colors.surface, alignSelf: 'flex-start', borderBottomLeftRadius: 4, borderWidth: 1, borderColor: colors.border },
  bubbleText: { fontSize: FONT_SIZE.SM, color: colors.text, lineHeight: 20 },
  bubbleTextUser: { color: '#fff' },
  timeText: { fontSize: 10, color: colors.muted, marginTop: 4 },

  sessionCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface,
    borderRadius: RADIUS.MD, padding: SPACING.MD, marginBottom: SPACING.SM,
    borderWidth: 1, borderColor: colors.border,
  },
  sessionTitle: { fontSize: FONT_SIZE.SM, fontWeight: '700', color: colors.text },
  sessionMeta: { fontSize: FONT_SIZE.XS, color: colors.muted, marginTop: 2 },
  deleteText: { fontSize: FONT_SIZE.LG, paddingHorizontal: SPACING.SM },
  });
}
