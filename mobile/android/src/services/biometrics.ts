/**
 * RxGuard Mobile — services/biometrics.ts
 *
 * Biometric "unlock" for returning users. We never store the user's
 * actual password (Supabase owns that) — instead, the refresh token is
 * placed behind a biometric-gated Keychain entry. Unlocking retrieves
 * the refresh token (triggering the OS Face ID / fingerprint prompt),
 * which is then exchanged for a fresh access token via the normal
 * refresh-token flow, exactly like a silent session restore.
 */

import * as Keychain from 'react-native-keychain';
import { storage } from './api';
import { STORAGE_KEYS } from '@constants';

const KEYCHAIN_SERVICE = 'ng.rxguard.biometric';

export type BiometryKind = 'FaceID' | 'TouchID' | 'Fingerprint' | 'Face' | 'Iris' | null;

/** Fast, synchronous check — no OS prompt, no Keychain hit. Used to
 *  decide whether to even show a "Unlock with biometrics" button. */
export function isBiometricLoginEnabled(): boolean {
  return storage.getBoolean(STORAGE_KEYS.BIOMETRIC_ENABLED) ?? false;
}

/** Does this device have biometric hardware enrolled at all? */
export async function getSupportedBiometryType(): Promise<BiometryKind> {
  try {
    const type = await Keychain.getSupportedBiometryType();
    return (type as BiometryKind) ?? null;
  } catch {
    return null;
  }
}

/**
 * Turn on biometric login: stashes the current refresh token behind a
 * biometric-gated Keychain entry. Call right after a successful
 * password login, while a valid refresh token is available.
 */
export async function enableBiometricLogin(refreshToken: string): Promise<boolean> {
  try {
    await Keychain.setGenericPassword('rxguard', refreshToken, {
      service       : KEYCHAIN_SERVICE,
      accessControl : Keychain.ACCESS_CONTROL.BIOMETRY_CURRENT_SET,
      accessible    : Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
    storage.set(STORAGE_KEYS.BIOMETRIC_ENABLED, true);
    return true;
  } catch {
    return false;
  }
}

export async function disableBiometricLogin(): Promise<void> {
  try {
    await Keychain.resetGenericPassword({ service: KEYCHAIN_SERVICE });
  } catch {
    /* best-effort */
  } finally {
    storage.set(STORAGE_KEYS.BIOMETRIC_ENABLED, false);
  }
}

/**
 * Triggers the OS biometric prompt and returns the stored refresh
 * token on success, or null if the user cancelled/failed/it's disabled.
 * Caller should exchange this for a fresh access token via
 * AuthService.refreshToken() / AuthContext session restore.
 */
export async function unlockWithBiometrics(): Promise<string | null> {
  if (!isBiometricLoginEnabled()) return null;

  try {
    const result = await Keychain.getGenericPassword({
      service               : KEYCHAIN_SERVICE,
      authenticationPrompt  : { title: 'Unlock RxGuard', subtitle: 'Confirm it\'s you to continue' },
    });
    return result ? result.password : null;
  } catch {
    return null; // user cancelled, or biometry failed/was removed
  }
}

/** Keep the biometric-enabled flag consistent with the account it was
 *  set up for — call this from logout/delete-account so a fresh
 *  install-free logout doesn't leave a stale biometric entry around. */
export async function clearBiometricLoginOnLogout(): Promise<void> {
  await disableBiometricLogin();
}
