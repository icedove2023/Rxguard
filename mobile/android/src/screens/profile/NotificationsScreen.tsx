/**
 * RxGuard Mobile — screens/profile/NotificationsScreen.tsx
 */

import React, { useEffect, useCallback, useMemo} from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { UserService } from '@services';
import { usePagination } from '@hooks';
import { FONT_SIZE, SPACING, RADIUS } from '@constants';
import { DateUtils } from '@utils';
import type { AppNotification } from '@types';
import { useTheme, type ThemeColors } from '@context/ThemeContext';

export default function NotificationsScreen() {
  const { colors } = useTheme();
  const s = useMemo(() => createStyles(colors), [colors]);

  const { data, loading, refreshing, load, refresh, loadMore } = usePagination<AppNotification>({
    fetcher: ({ page }) => UserService.notifications(page),
  });

  useEffect(() => { load(); }, [load]);

  const handleMarkAllRead = useCallback(async () => {
    try {
      await UserService.markNotificationsRead();
      refresh();
    } catch {
      /* non-fatal */
    }
  }, [refresh]);

  const unreadCount = data.filter(n => !n.read_at).length;

  if (loading && data.length === 0) {
    return (
      <SafeAreaView style={s.container}>
        <ActivityIndicator size="large" color={colors.blue} style={{ marginTop: SPACING.XXXL }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={['bottom']}>
      {unreadCount > 0 && (
        <TouchableOpacity style={s.markReadBtn} onPress={handleMarkAllRead}>
          <Text style={s.markReadText}>Mark all {unreadCount} as read</Text>
        </TouchableOpacity>
      )}
      <FlatList
        data={data}
        keyExtractor={item => item.id}
        contentContainerStyle={s.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.blue} />}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        renderItem={({ item }) => (
          <View style={[s.card, !item.read_at && s.cardUnread]}>
            <Text style={s.title}>{item.title}</Text>
            <Text style={s.body}>{item.body}</Text>
            <Text style={s.time}>{DateUtils.relative(item.created_at)}</Text>
          </View>
        )}
        ListEmptyComponent={
          <View style={s.empty}>
            <Text style={{ fontSize: 32, marginBottom: SPACING.SM }}>🔔</Text>
            <Text style={s.emptyText}>No notifications yet.</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  markReadBtn: { padding: SPACING.MD, alignItems: 'center', backgroundColor: colors.blueLight },
  markReadText: { color: colors.blue, fontWeight: '600', fontSize: FONT_SIZE.SM },
  listContent: { padding: SPACING.LG, paddingBottom: SPACING.XXXL },
  card: {
    backgroundColor: colors.surface, borderRadius: RADIUS.MD, padding: SPACING.MD,
    marginBottom: SPACING.SM, borderWidth: 1, borderColor: colors.border,
  },
  cardUnread: { borderColor: colors.blue, backgroundColor: colors.blue_XLIGHT },
  title: { fontSize: FONT_SIZE.SM, fontWeight: '700', color: colors.text },
  body: { fontSize: FONT_SIZE.XS, color: colors.textSecondary, marginTop: 2 },
  time: { fontSize: 10, color: colors.muted, marginTop: 4 },
  empty: { alignItems: 'center', paddingVertical: SPACING.XXXL },
  emptyText: { fontSize: FONT_SIZE.SM, color: colors.muted },
  });
}
