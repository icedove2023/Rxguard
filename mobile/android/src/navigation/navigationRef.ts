/**
 * RxGuard Mobile — navigation/navigationRef.ts
 *
 * A ref to the top-level NavigationContainer, so code outside the
 * component tree (or components that don't have a `navigation` prop,
 * like the deep-link handler) can still trigger navigation.
 */

import { createNavigationContainerRef } from '@react-navigation/native';
import type { RootStackParamList } from '@types';

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

/**
 * Navigate once the container is ready. If called before the first
 * render (e.g. Linking.getInitialURL() resolving very early), retries
 * shortly after — NavigationContainer is normally ready within a frame
 * or two of mount.
 */
export function navigate(name: string, params?: object, retriesLeft = 10): void {
  if (navigationRef.isReady()) {
    // @ts-expect-error — generic name/params bridge for cross-stack navigation
    navigationRef.navigate(name, params);
    return;
  }
  if (retriesLeft > 0) {
    setTimeout(() => navigate(name, params, retriesLeft - 1), 150);
  }
}
