/**
 * RxGuard Mobile — screens/prescriptions/BMIHistoryScreen.tsx
 */

import React, { useCallback, useEffect, useMemo} from 'react';
import { View, Text, FlatList, StyleSheet, RefreshControl, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BmiService } from '@services';
import { usePagination } from '@hooks';
import { FONT_SIZE, SPACING, RADIUS } from '@constants';
import { DateUtils } from '@utils';
import type { BmiRecord } from '@types';
import { useTheme, type ThemeColors } from '@context/ThemeContext';

export default function BMIHistoryScreen() {
  const { colors } = useTheme();
  const s = useMemo(() => createStyles(colors), [colors]);

  const { data, loading, refreshing, error, load, refresh, loadMore } = usePagination<BmiRecord>({
    fetcher: ({ page }) => BmiService.history(page),
  });

  useEffect(() => { load(); }, [load]);

  const renderItem = useCallback(({ item }: { item: BmiRecord }) => (
    <View style={s.card}>
      <View>
        <Text style={[s.bmiValue, { color: item.category_color }]}>{item.bmi_value}</Text>
        <Text style={s.date}>{DateUtils.display(item.recorded_at)}</Text>
      </View>
      <Text style={[s.category, { color: item.category_color }]}>{item.category_label}</Text>
    </View>
  ), []);

  if (loading && data.length === 0) {
    return (
      <SafeAreaView style={s.container}>
        <ActivityIndicator size="large" color={colors.blue} style={{ marginTop: SPACING.XXXL }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={['bottom']}>
      <FlatList
        data={data}
        keyExtractor={item => String(item.id)}
        renderItem={renderItem}
        contentContainerStyle={s.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.blue} />}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        ListEmptyComponent={
          <View style={s.empty}>
            <Text style={s.emptyText}>No BMI records yet.</Text>
          </View>
        }
      />
      {error && <Text style={s.errorText}>{error.message}</Text>}
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  listContent: { padding: SPACING.LG, paddingBottom: SPACING.XXXL },
  card: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: RADIUS.MD, padding: SPACING.MD,
    marginBottom: SPACING.SM, borderWidth: 1, borderColor: colors.border,
  },
  bmiValue: { fontSize: FONT_SIZE.XL, fontWeight: '800' },
  date: { fontSize: FONT_SIZE.XS, color: colors.muted, marginTop: 2 },
  category: { fontSize: FONT_SIZE.SM, fontWeight: '600' },
  empty: { alignItems: 'center', paddingVertical: SPACING.XXXL },
  emptyText: { fontSize: FONT_SIZE.SM, color: colors.muted },
  errorText: { color: colors.red, fontSize: FONT_SIZE.SM, textAlign: 'center', padding: SPACING.MD },
  });
}
