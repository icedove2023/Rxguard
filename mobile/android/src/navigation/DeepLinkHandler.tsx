/**
 * RxGuard Mobile — navigation/DeepLinkHandler.tsx
 *
 * Renders nothing. Listens for the `rxguard://auth-callback` deep link
 * (Supabase Auth's email-confirmation / password-recovery redirect) and
 * routes it appropriately:
 *   - type=recovery      -> navigate to ResetPassword with the token
 *   - type=signup/other  -> hydrate the session directly (user is now
 *                           confirmed and Supabase already issued a
 *                           live session)
 *   - error present      -> surface a toast; the relevant screen's own
 *                           "request a new link" affordance covers retry
 *
 * Must be rendered inside both <AuthProvider> and <NavigationContainer>.
 */

import { useEffect } from 'react';
import { Linking } from 'react-native';
import Toast from 'react-native-toast-message';

import { useAuth } from '@context/AuthContext';
import { parseAuthCallbackUrl } from '@services/deepLinking';
import { navigate } from './navigationRef';
import { SCREENS } from '@constants';

export default function DeepLinkHandler(): null {
  const { hydrateSession } = useAuth();

  useEffect(() => {
    const handleUrl = async (url: string | null) => {
      if (!url) return;
      const parsed = parseAuthCallbackUrl(url);
      if (!parsed) return; // not one of ours — ignore

      if (parsed.errorCode) {
        Toast.show({
          type: 'error',
          text1: 'Link invalid or expired',
          text2: parsed.errorDescription || 'Please request a new link and try again.',
        });
        return;
      }

      if (!parsed.accessToken) return;

      if (parsed.type === 'recovery') {
        // ResetPassword lives inside the nested Auth stack, which is only
        // mounted while the user is signed out — recovery links are
        // expected to be opened in that state. If a still-logged-in user
        // opens one, this is a no-op; they'd need to sign out first.
        navigate('Auth', { screen: SCREENS.RESET_PW, params: { accessToken: parsed.accessToken } });
        return;
      }

      // Signup confirmation or magic link: Supabase already issued a
      // live session tied to this token — adopt it directly.
      try {
        await hydrateSession(parsed.accessToken, parsed.refreshToken ?? '');
        Toast.show({ type: 'success', text1: 'Email confirmed!', text2: 'Welcome to RxGuard.' });
      } catch {
        Toast.show({
          type: 'error',
          text1: 'Could not start your session',
          text2: 'Please log in with your email and password.',
        });
      }
    };

    // App opened cold via the link
    Linking.getInitialURL().then(handleUrl).catch(() => {});

    // App already running, link opened while foregrounded/backgrounded
    const sub = Linking.addEventListener('url', ({ url }) => handleUrl(url));

    return () => sub.remove();
  }, [hydrateSession]);

  return null;
}
