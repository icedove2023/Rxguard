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
import { ActivityIndicator, View, StyleSheet, Text } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useAuth } from '@context/AuthContext';
import { useTheme } from '@context/ThemeContext';
import { SCREENS, FONT_SIZE, SPACING } from '@constants';
import type {
  AuthStackParamList,
  MainTabParamList,
  RootStackParamList,
} from '@types';

/* Auth screens */
import SplashScreen         from '@screens/auth/SplashScreen';
import LoginScreen          from '@screens/auth/LoginScreen';
import RegisterScreen       from '@screens/auth/RegisterScreen';
import ForgotPasswordScreen from '@screens/auth/ForgotPasswordScreen';
import ResetPasswordScreen  from '@screens/auth/ResetPasswordScreen';

/* Main tab screens */
import DashboardScreen from '@screens/main/DashboardScreen';
import ScanScreen      from '@screens/main/ScanScreen';
import CheckerScreen   from '@screens/main/CheckerScreen';
import ChatbotScreen   from '@screens/main/ChatbotScreen';
import BMIScreen       from '@screens/main/BMIScreen';

/* Stack screens within Main */
import PrescriptionReportScreen from '@screens/prescriptions/PrescriptionReportScreen';
import CheckerResultScreen      from '@screens/prescriptions/CheckerResultScreen';
import ChatSessionScreen        from '@screens/prescriptions/ChatSessionScreen';
import BMIHistoryScreen         from '@screens/prescriptions/BMIHistoryScreen';
import ProfileScreen            from '@screens/profile/ProfileScreen';
import SettingsScreen           from '@screens/profile/SettingsScreen';
import NotificationsScreen      from '@screens/profile/NotificationsScreen';

import { navigationRef } from './navigationRef';
import DeepLinkHandler from './DeepLinkHandler';

/* ─────────────────────────────────────────────────────────────────
   Deep linking
   Only registers the scheme so Android/RN route rxguard:// URLs to
   this app. The actual auth-callback routing is handled manually by
   DeepLinkHandler (Supabase's session lives in a URL *fragment*,
   which React Navigation's own path-based linking config can't read).
───────────────────────────────────────────────────────────────── */
const LINKING_CONFIG = {
  prefixes: ['rxguard://'],
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
  const icons = TAB_ICONS[name] ?? { active: '●', inactive: '○' };
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
      <AuthStack.Screen name={SCREENS.SPLASH as 'Splash'}   component={SplashScreen} />
      <AuthStack.Screen name={SCREENS.LOGIN as 'Login'}     component={LoginScreen} />
      <AuthStack.Screen name={SCREENS.REGISTER as 'Register'} component={RegisterScreen} />
      <AuthStack.Screen
        name={SCREENS.FORGOT_PW as 'ForgotPassword'}
        component={ForgotPasswordScreen}
        options={{ headerShown: true, title: 'Forgot Password', headerBackTitle: 'Back' }}
      />
      <AuthStack.Screen
        name={SCREENS.RESET_PW as 'ResetPassword'}
        component={ResetPasswordScreen}
        options={{ headerShown: true, title: 'Reset Password', headerBackTitle: 'Back' }}
      />
    </AuthStack.Navigator>
  );
}

/* ─────────────────────────────────────────────────────────────────
   Main tab bar
───────────────────────────────────────────────────────────────── */

function MainTabs() {
  const { colors } = useTheme();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon    : ({ focused }) => <TabIcon name={route.name} focused={focused} />,
        tabBarActiveTintColor  : colors.blue,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle   : {
          backgroundColor  : colors.surface,
          borderTopColor   : colors.border,
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
      <Tab.Screen name={SCREENS.DASHBOARD as 'Dashboard'} component={DashboardScreen} options={{ title: 'Dashboard'  }} />
      <Tab.Screen name={SCREENS.SCAN      as 'Scan'}      component={ScanScreen}      options={{ title: 'Scan Rx'    }} />
      <Tab.Screen name={SCREENS.CHECKER   as 'Checker'}   component={CheckerScreen}   options={{ title: 'Drug Check' }} />
      <Tab.Screen name={SCREENS.CHATBOT   as 'Chatbot'}   component={ChatbotScreen}   options={{ title: 'AI Chat'    }} />
      <Tab.Screen name={SCREENS.BMI       as 'BMI'}       component={BMIScreen}       options={{ title: 'BMI'        }} />
    </Tab.Navigator>
  );
}

/* ─────────────────────────────────────────────────────────────────
   Main stack  (wraps tabs + modal-style screens)
───────────────────────────────────────────────────────────────── */

function getMainHeader(colors: ReturnType<typeof useTheme>['colors']) {
  return {
    headerStyle     : { backgroundColor: colors.surface },
    headerTintColor : colors.blue,
    headerTitleStyle: { fontSize: FONT_SIZE.LG, fontWeight: '600' as const, color: colors.text },
    headerBackTitle : 'Back',
  };
}

function MainNavigator() {
  const { colors } = useTheme();
  const MAIN_HEADER = getMainHeader(colors);

  return (
    <MainStack.Navigator screenOptions={{ headerShown: false }}>
      <MainStack.Screen
        name={'Main' as any}
        component={MainTabs}
      />
      <MainStack.Screen
        name={SCREENS.SCAN_RESULT as any}
        component={PrescriptionReportScreen}
        options={{ ...MAIN_HEADER, headerShown: true, title: 'Scan Report' }}
      />
      <MainStack.Screen
        name={SCREENS.PRESCRIPTION_DETAIL as any}
        component={PrescriptionReportScreen}
        options={{ ...MAIN_HEADER, headerShown: true, title: 'Prescription' }}
      />
      <MainStack.Screen
        name={SCREENS.CHECKER_RESULT as any}
        component={CheckerResultScreen}
        options={{ ...MAIN_HEADER, headerShown: true, title: 'Interaction Report' }}
      />
      <MainStack.Screen
        name={SCREENS.CHAT_SESSION as any}
        component={ChatSessionScreen}
        options={{ ...MAIN_HEADER, headerShown: true, title: 'Conversation' }}
      />
      <MainStack.Screen
        name={SCREENS.BMI_HISTORY as any}
        component={BMIHistoryScreen}
        options={{ ...MAIN_HEADER, headerShown: true, title: 'BMI History' }}
      />
      <MainStack.Screen
        name={SCREENS.PROFILE as any}
        component={ProfileScreen}
        options={{ ...MAIN_HEADER, headerShown: true, title: 'My Profile' }}
      />
      <MainStack.Screen
        name={SCREENS.SETTINGS as any}
        component={SettingsScreen}
        options={{ ...MAIN_HEADER, headerShown: true, title: 'Settings' }}
      />
      <MainStack.Screen
        name={SCREENS.NOTIFICATIONS as any}
        component={NotificationsScreen}
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
  const { colors } = useTheme();

  if (!isInitialised) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.blue} />
      </View>
    );
  }

  return (
    <>
      <DeepLinkHandler />
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        {isAuthenticated ? (
          <RootStack.Screen name={'Main' as any} component={MainNavigator} />
        ) : (
          <RootStack.Screen name={'Auth' as any} component={AuthNavigator} />
        )}
      </RootStack.Navigator>
    </>
  );
}
/* ─────────────────────────────────────────────────────────────────
   App navigation root  (exported and used in App.tsx)
───────────────────────────────────────────────────────────────── */

export default function AppNavigation() {
  return (
    <SafeAreaProvider>
      <NavigationContainer ref={navigationRef} linking={LINKING_CONFIG}>
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
  },
});