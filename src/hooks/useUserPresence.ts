import { useState, useEffect, useRef } from 'react';
import { UserPresence, subscribeToUserPresence } from '../services/presenceService';
import { networkService } from '../services/networkService';

/**
 * Enhanced hook to get real-time presence updates for a specific user
 * Improved with more aggressive real-time tracking, better error handling, and connection quality monitoring
 */
export const useUserPresence = (userId: string) => {
  const [presence, setPresence] = useState<UserPresence | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [connectionError, setConnectionError] = useState(false);
  const retryCountRef = useRef(0);
  const lastUpdateRef = useRef<number>(0);

  useEffect(() => {
    if (!userId) {
      setIsLoading(false);
      return;
    }

    console.log(`[useUserPresence] Setting up presence subscription for user: ${userId}`);
    
    let isSubscribed = true;
    let retryTimeout: NodeJS.Timeout | null = null;
    let reconnectTimeout: NodeJS.Timeout | null = null;
    let unsubscribe: (() => void) | null = null;

    const subscribeToStatus = async () => {
      if (!isSubscribed) return () => {};

      try {
        setIsLoading(true);

        // Treat connectivity probes as advisory only.
        // Presence subscriptions should still proceed to avoid false "offline" status.
        try {
          const isConnected = await networkService.checkConnectivity();
          if (!isConnected) {
            console.warn(
              `[useUserPresence] Connectivity check reported disconnected for ${userId}; continuing RTDB subscription`,
            );
          }
        } catch (connectivityError) {
          console.warn(
            `[useUserPresence] Connectivity check failed for ${userId}; continuing RTDB subscription`,
            connectivityError,
          );
        }
        
        // Subscribe to real-time presence updates with enhanced logging
        const nextUnsubscribe = subscribeToUserPresence(userId, (userPresence) => {
          if (!isSubscribed) return; // Prevent race conditions
          
          const now = Date.now();
          lastUpdateRef.current = now;
          
          console.log(`[useUserPresence] Received presence update for ${userId}:`, 
            userPresence ? {
              state: userPresence.state,
              lastActive: userPresence.lastActive ? new Date(userPresence.lastActive).toISOString() : 'N/A',
              realTimeUpdate: userPresence.realTimeUpdate ? new Date(userPresence.realTimeUpdate).toISOString() : 'N/A',
              connections: userPresence.connections ? Object.keys(userPresence.connections).length : 0
            } : 'null');
          
          setPresence(userPresence);
          setConnectionError(false);
          setIsLoading(false);
          retryCountRef.current = 0; // Reset retry count on successful update
        });
        
        return nextUnsubscribe;
      } catch (error) {
        console.error(`[useUserPresence] Error subscribing to presence for ${userId}:`, error);
        setConnectionError(true);
        setIsLoading(false);
        
        // Retry with exponential backoff
        const retryDelay = Math.min(Math.pow(1.5, retryCountRef.current) * 1000, 30000); // Max 30 seconds
        retryCountRef.current++;
        
        // Retry subscription after a delay
        retryTimeout = setTimeout(() => {
          if (isSubscribed) {
            console.log(`[useUserPresence] Retrying presence subscription for ${userId} (attempt ${retryCountRef.current})`);
            subscribeToStatus().then((nextUnsubscribe) => {
              if (!isSubscribed) {
                nextUnsubscribe();
                return;
              }

              unsubscribe = nextUnsubscribe;
            });
          }
        }, retryDelay);
        
        return () => {
          if (retryTimeout) clearTimeout(retryTimeout);
        };
      }
    };

    // Start subscription
    subscribeToStatus().then((nextUnsubscribe) => {
      if (!isSubscribed) {
        nextUnsubscribe();
        return;
      }

      unsubscribe = nextUnsubscribe;
    });

    // If no updates arrive for too long, reset the listener.
    const refreshInterval = setInterval(() => {
      if (!isSubscribed) return;
      
      const now = Date.now();
      // Refresh if it's been more than 60 seconds since the last update.
      if (now - lastUpdateRef.current > 60000) {
        console.log(`[useUserPresence] No updates in 60s for ${userId}, re-subscribing`);

        if (typeof unsubscribe === 'function') {
          unsubscribe();
        }

        subscribeToStatus().then((nextUnsubscribe) => {
          if (!isSubscribed) {
            nextUnsubscribe();
            return;
          }

          unsubscribe = nextUnsubscribe;
        });
      }
    }, 60000); // Check every minute

    // Subscribe to network status changes
    const networkUnsubscribe = networkService.subscribe((isConnected) => {
      if (!isSubscribed || !isConnected) return;
      
      console.log(`[useUserPresence] Network status changed: ${isConnected ? 'Connected' : 'Disconnected'}`);

      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }

      reconnectTimeout = setTimeout(() => {
        if (!isSubscribed) return;

        console.log(`[useUserPresence] Network restored, refreshing subscription for ${userId}`);

        if (typeof unsubscribe === 'function') {
          unsubscribe();
        }

        subscribeToStatus().then((nextUnsubscribe) => {
          if (!isSubscribed) {
            nextUnsubscribe();
            return;
          }

          unsubscribe = nextUnsubscribe;
        });
      }, 1000);
    });

    return () => {
      isSubscribed = false;
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
      if (typeof networkUnsubscribe === 'function') {
        networkUnsubscribe();
      }
      if (retryTimeout) {
        clearTimeout(retryTimeout);
      }
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
      if (refreshInterval) {
        clearInterval(refreshInterval);
      }
    };
  }, [userId]);

  return {
    presence,
    isLoading,
    connectionError
  };
};