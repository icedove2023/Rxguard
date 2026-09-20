/**
 * RxGuard Mobile — components/OfflineBanner.tsx
 * Slim banner shown app-wide when the device loses connectivity, and
 * briefly again ("back online") when it's restored. Uses the existing
 * useOffline hook, which was already built but never wired in.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Animated, Text, StyleSheet } from 'react-native';

import { useOffline } from '@hooks';
import { useTheme } from '@context/ThemeContext';
import { FONT_SIZE, SPACING } from '@constants';

export default function OfflineBanner() {
  const { isOffline, wasOffline } = useOffline();
  const { colors } = useTheme();
  const [visible, setVisible] = useState(false);
  const [label, setLabel] = useState('');
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isOffline) {
      setLabel('📡 No internet connection');
      setVisible(true);
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    } else if (wasOffline) {
      setLabel('✅ Back online');
      setVisible(true);
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }).start(() => {
        setTimeout(() => {
          Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true })
            .start(() => setVisible(false));
        }, 1500);
      });
    }
  }, [isOffline, wasOffline, opacity]);

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        s.banner,
        { opacity, backgroundColor: isOffline ? colors.amberDark : colors.greenDark },
      ]}
      accessibilityLiveRegion="polite"
    >
      <Text style={s.text}>{label}</Text>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  banner: {
    paddingVertical: SPACING.XS,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { color: '#fff', fontSize: FONT_SIZE.XS, fontWeight: '700' },
});
