/**
 * RxGuard Mobile — hooks/useOffline.ts
 *
 * Subscribes to NetInfo and exposes:
 *   - isOnline   boolean
 *   - isOffline  boolean
 *   - connectionType  'wifi' | 'cellular' | 'none' | 'unknown'
 *   - wasOffline boolean — true if the connection was recently lost
 *     (useful for showing a "back online" toast)
 */

import { useState, useEffect, useRef } from 'react';
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';

interface OfflineState {
  isOnline        : boolean;
  isOffline       : boolean;
  connectionType  : string;
  wasOffline      : boolean;
}

export function useOffline(): OfflineState {
  const [state, setState] = useState<OfflineState>({
    isOnline      : true,
    isOffline     : false,
    connectionType: 'unknown',
    wasOffline    : false,
  });

  const previouslyOffline = useRef(false);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((netState: NetInfoState) => {
      const online = netState.isConnected === true && netState.isInternetReachable !== false;

      setState({
        isOnline      : online,
        isOffline     : !online,
        connectionType: netState.type ?? 'unknown',
        wasOffline    : previouslyOffline.current && online,
      });

      previouslyOffline.current = !online;
    });

    return unsubscribe;
  }, []);

  return state;
}