/**
 * RxGuard Mobile — navigation/index.tsx
 *
 * Navigation architecture:
 *
 *   RootNavigator (NativeStack)
 *   ├── AuthStack (NativeStack)      — shown when unauthenticated
 *   │   ├── Splash
 *   │   ├── Login
 *   │   ├── Register
 *   │   ├── ForgotPassword
 *   │   └── ResetPassword
 *   └── MainStack (NativeStack)      — shown when authenticated
 *       ├── MainTabs (BottomTabs)    — persistent tab bar
 *       │   ├── Dashboard
 *       │   ├── Scan
 *       │   ├── Checker
 *       │   ├── Chatbot
 *       │   └── BMI
 *       ├── ScanResult
 *       ├── PrescriptionDetail
 *       ├── CheckerResult
 *       ├── ChatSession
 *       ├── BMIHistory
 *       ├── Profile
 *       ├── Settings
 *       └── Notifications
 *
 * Screen components are imported lazily so navigation is declared
 * independently of screen implementations.
 */

import React, { useEffect } from 'react';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useAuth } from '@context/AuthContext';
import { COLORS, SCREENS, FONT_SIZE, SPACING } from '@constants';
import type {
  AuthStackParamList,
  MainTabParamList,
  RootStackParamList,
} from '@types';

/* ─────────────────────────────────────────────────────────────────
   Placeholder screen component
   Remove once real screens are added.
───────────────────────────────────────────────────────────────── */

const PlaceholderScreen = ({ route }: { route: { name: string } }) => {
  const { View: V, Text } = require('react-native');
  return (
    <V style={styles.placeholder}>
      <Text style={styles.placeholderText}>{route.name}</Text>
    </V>
  );
};

/* ─────────────────────────────────────────────────────────────────
   Navigators
───────────────────────────────────────────────────────────────── */

const RootStack = createNativeStackNavigator<RootStackParamList>();
const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const MainStack = createNativeStackNavigator<RootStackParamList>();
const Tab       = createBottomTabNavigator<MainTabParamList>();

/* ─────────────────────────────────────────────────────────────────
   Tab bar icon helper
───────────────────────────────────────────────────────────────── */

const TAB_ICONS: Record<string, { active: string; inactive: string }> = {
  Dashboard : { active: '📊', inactive: '📊' },
  Scan      : { active: '📷', inactive: '📷' },
  Checker   : { active: '⚠️', inactive: '⚠️' },
  Chatbot   : { active: '🤖', inactive: '🤖' },
  BMI       : { active: '⚖️', inactive: '⚖️' },
};

function TabIcon({
  name,
  focused,
}: {
  name : string;
  focused: boolean;
}) {
  const { Text } = require('react-native');
  const icons    = TAB_ICONS[name] ?? { active: '●', inactive: '○' };
  return (
    <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.55 }}>
      {focused ? icons.active : icons.inactive}
    </Text>
  );
}

/* ─────────────────────────────────────────────────────────────────
   Auth stack
───────────────────────────────────────────────────────────────── */

function AuthNavigator() {
  return (
    <AuthStack.Navigator
      screenOptions={{
        headerShown: false,
        animation  : 'slide_from_right',
      }}
    >
      <AuthStack.Screen name={SCREENS.SPLASH as 'Splash'}   component={PlaceholderScreen} />
      <AuthStack.Screen name={SCREENS.LOGIN as 'Login'}     component={PlaceholderScreen} />
      <AuthStack.Screen name={SCREENS.REGISTER as 'Register'} component={PlaceholderScreen} />
      <AuthStack.Screen
        name={SCREENS.FORGOT_PW as 'ForgotPassword'}
        component={PlaceholderScreen}
        options={{ headerShown: true, title: 'Forgot Password', headerBackTitle: 'Back' }}
      />
      <AuthStack.Screen
        name={SCREENS.RESET_PW as 'ResetPassword'}
        component={PlaceholderScreen}
        options={{ headerShown: true, title: 'Reset Password', headerBackTitle: 'Back' }}
      />
    </AuthStack.Navigator>
  );
}

/* ─────────────────────────────────────────────────────────────────
   Main tab bar
───────────────────────────────────────────────────────────────── */

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon    : ({ focused }) => <TabIcon name={route.name} focused={focused} />,
        tabBarActiveTintColor  : COLORS.BLUE,
        tabBarInactiveTintColor: COLORS.MUTED,
        tabBarStyle   : {
          backgroundColor  : COLORS.SURFACE,
          borderTopColor   : COLORS.BORDER,
          borderTopWidth   : 1,
          paddingBottom    : SPACING.SM,
          paddingTop       : SPACING.XS,
          height           : 60,
        },
        tabBarLabelStyle: {
          fontSize  : FONT_SIZE.XS,
          fontWeight: '500',
          marginTop : -SPACING.XS,
        },
        headerShown: false,
      })}
    >
      <Tab.Screen name={SCREENS.DASHBOARD as 'Dashboard'} component={PlaceholderScreen} options={{ title: 'Dashboard'  }} />
      <Tab.Screen name={SCREENS.SCAN      as 'Scan'}      component={PlaceholderScreen} options={{ title: 'Scan Rx'    }} />
      <Tab.Screen name={SCREENS.CHECKER   as 'Checker'}   component={PlaceholderScreen} options={{ title: 'Drug Check' }} />
      <Tab.Screen name={SCREENS.CHATBOT   as 'Chatbot'}   component={PlaceholderScreen} options={{ title: 'AI Chat'    }} />
      <Tab.Screen name={SCREENS.BMI       as 'BMI'}       component={PlaceholderScreen} options={{ title: 'BMI'        }} />
    </Tab.Navigator>
  );
}

/* ─────────────────────────────────────────────────────────────────
   Main stack  (wraps tabs + modal-style screens)
───────────────────────────────────────────────────────────────── */

const MAIN_HEADER = {
  headerStyle     : { backgroundColor: COLORS.SURFACE },
  headerTintColor : COLORS.BLUE,
  headerTitleStyle: { fontSize: FONT_SIZE.LG, fontWeight: '600' as const },
  headerBackTitle : 'Back',
};

function MainNavigator() {
  return (
    <MainStack.Navigator screenOptions={{ headerShown: false }}>
      <MainStack.Screen
        name={'Main' as any}
        component={MainTabs}
      />
      <MainStack.Screen
        name={SCREENS.SCAN_RESULT as any}
        component={PlaceholderScreen}
        options={{ ...MAIN_HEADER, headerShown: true, title: 'Scan Report' }}
      />
      <MainStack.Screen
        name={SCREENS.PRESCRIPTION_DETAIL as any}
        component={PlaceholderScreen}
        options={{ ...MAIN_HEADER, headerShown: true, title: 'Prescription' }}
      />
      <MainStack.Screen
        name={SCREENS.CHECKER_RESULT as any}
        component={PlaceholderScreen}
        options={{ ...MAIN_HEADER, headerShown: true, title: 'Interaction Report' }}
      />
      <MainStack.Screen
        name={SCREENS.CHAT_SESSION as any}
        component={PlaceholderScreen}
        options={{ headerShown: false }}
      />
      <MainStack.Screen
        name={SCREENS.BMI_HISTORY as any}
        component={PlaceholderScreen}
        options={{ ...MAIN_HEADER, headerShown: true, title: 'BMI History' }}
      />
      <MainStack.Screen
        name={SCREENS.PROFILE as any}
        component={PlaceholderScreen}
        options={{ ...MAIN_HEADER, headerShown: true, title: 'My Profile' }}
      />
      <MainStack.Screen
        name={SCREENS.SETTINGS as any}
        component={PlaceholderScreen}
        options={{ ...MAIN_HEADER, headerShown: true, title: 'Settings' }}
      />
      <MainStack.Screen
        name={SCREENS.NOTIFICATIONS as any}
        component={PlaceholderScreen}
        options={{ ...MAIN_HEADER, headerShown: true, title: 'Notifications' }}
      />
    </MainStack.Navigator>
  );
}

/* ─────────────────────────────────────────────────────────────────
   Root navigator — switches Auth ↔ Main based on auth state
───────────────────────────────────────────────────────────────── */

function RootNavigator() {
  const { isAuthenticated, isInitialised } = useAuth();

  if (!isInitialised) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={COLORS.BLUE} />
      </View>
    );
  }

  return (
    <RootStack.Navigator screenOptions={{ headerShown: false }}>
      {isAuthenticated ? (
        <RootStack.Screen name={'Main' as any} component={MainNavigator} />
      ) : (
        <RootStack.Screen name={'Auth' as any} component={AuthNavigator} />
      )}
    </RootStack.Navigator>
  );
}

/* ─────────────────────────────────────────────────────────────────
   App navigation root  (exported and used in App.tsx)
───────────────────────────────────────────────────────────────── */

export default function AppNavigation() {
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <RootNavigator />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

/* ─────────────────────────────────────────────────────────────────
   Styles
───────────────────────────────────────────────────────────────── */

const styles = StyleSheet.create({
  loading: {
    flex           : 1,
    alignItems     : 'center',
    justifyContent : 'center',
    backgroundColor: COLORS.BACKGROUND,
  },
  placeholder: {
    flex           : 1,
    alignItems     : 'center',
    justifyContent : 'center',
    backgroundColor: COLORS.BACKGROUND,
  },
  placeholderText: {
    fontSize  : FONT_SIZE.XL,
    fontWeight: '600',
    color     : COLORS.MUTED,
  },
});