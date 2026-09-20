/**
 * RxGuard Mobile — services/deepLinking.ts
 *
 * Parses the `rxguard://auth-callback` deep link Supabase Auth sends
 * for email confirmation and password-recovery links. Supabase puts
 * the session in a URL *fragment* (after `#`), the same way it does
 * for the web flow (see frontend/pages/auth-callback.html) — Android
 * delivers the full URL including the fragment to the app untouched,
 * so we parse it by hand rather than relying on React Navigation's
 * path/query-based linking config (which does not parse fragments).
 */

export type AuthCallbackType = 'signup' | 'recovery' | 'magiclink' | 'invite' | 'email_change' | null;

export interface ParsedAuthCallback {
  type        : AuthCallbackType;
  accessToken : string | null;
  refreshToken: string | null;
  errorCode   : string | null;
  errorDescription: string | null;
}

const AUTH_CALLBACK_HOST = 'auth-callback';

/**
 * Returns null if the URL isn't one of our auth-callback deep links
 * (callers should ignore it and let other handlers/screens deal with it).
 */
export function parseAuthCallbackUrl(url: string): ParsedAuthCallback | null {
  if (!url || !url.startsWith('rxguard://')) return null;

  // rxguard://auth-callback#access_token=...&type=recovery
  //           ^^^^^^^^^^^^^ host           ^^^^^^^^^^^^^^^^ fragment
  const withoutScheme = url.replace('rxguard://', '');
  const [host, fragment = ''] = withoutScheme.split('#');
  const hostOnly = host.split('?')[0]; // tolerate an accidental query string too

  if (hostOnly !== AUTH_CALLBACK_HOST) return null;

  // Some Supabase error responses arrive as a query string instead of a
  // fragment (e.g. `?error=...&error_description=...`) — check both.
  const queryPart = host.includes('?') ? host.split('?')[1] : '';
  const params = parseQueryString(fragment || queryPart);

  return {
    type            : (params.type as AuthCallbackType) ?? null,
    accessToken     : params.access_token ?? null,
    refreshToken    : params.refresh_token ?? null,
    errorCode       : params.error ?? null,
    errorDescription: params.error_description ?? null,
  };
}

/**
 * Minimal `a=1&b=2` parser. Avoids depending on URLSearchParams, which
 * isn't guaranteed available in React Native's Hermes runtime without
 * the react-native-url-polyfill package (not installed in this project).
 */
function parseQueryString(input: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!input) return result;

  for (const pair of input.split('&')) {
    if (!pair) continue;
    const eqIndex = pair.indexOf('=');
    const key   = eqIndex === -1 ? pair : pair.slice(0, eqIndex);
    const value = eqIndex === -1 ? ''   : pair.slice(eqIndex + 1);
    if (!key) continue;
    result[decodeURIComponent(key)] = decodeURIComponent(value.replace(/\+/g, ' '));
  }
  return result;
}
