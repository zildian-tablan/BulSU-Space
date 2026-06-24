import { useState, useEffect } from 'react';
import { getUserStatusRealtime, UserStatus } from '../services/userService';
import { networkService } from '../services/networkService';

interface PresenceStatus {
  isOnline: boolean;
  lastSeen: Date | null;
  statusText: string;
  statusColor: 'green' | 'yellow' | 'gray' | 'red';
  animate: boolean;
  connectionQuality?: 'good' | 'poor' | 'disconnected';
  realTimeUpdate?: number;
}

/**
 * Hook to check another user's online presence status
 * Uses the enhanced presence system with fallback logic
 */
export const useUserPresence = (userId: string): PresenceStatus => {
  const [userStatus, setUserStatus] = useState<UserStatus | null>(null);
  const [connectionError, setConnectionError] = useState(false);

  useEffect(() => {
    if (!userId) {
      setUserStatus(null);
      return;
    }

    console.log(`[useUserPresence] Setting up presence monitoring for user: ${userId}`);
    
    let isSubscribed = true;
    let retryTimeout: NodeJS.Timeout | null = null;
    
    // Test Firebase Realtime Database connectivity first
    const testFirebaseRTDB = async () => {
      try {
        const { ref, get } = await import('firebase/database');
        const { rtdb } = await import('../firebase/config');
        
        console.log(`[useUserPresence] Testing RTDB connectivity for ${userId}...`);
        
        // Test basic connectivity
        const connectedRef = ref(rtdb, '.info/connected');
        const connectedSnapshot = await get(connectedRef);
        console.log(`[useUserPresence] RTDB connected:`, connectedSnapshot.val());
        
        // Test if we can access the status path
        const statusRef = ref(rtdb, `status/${userId}`);
        const statusSnapshot = await get(statusRef);
        console.log(`[useUserPresence] Status path accessible:`, statusSnapshot.exists());
        
        return true;
      } catch (error) {
        console.error(`[useUserPresence] RTDB connectivity test failed for ${userId}:`, error);
        return false;
      }
    };
    
    // Enhanced status subscription with error handling and retry mechanism
    const subscribeToStatus = async () => {
      if (!isSubscribed) return () => {};
      
      // Test connectivity first
      const isConnected = await testFirebaseRTDB();
      if (!isConnected) {
        console.warn(`[useUserPresence] RTDB not accessible, skipping subscription for ${userId}`);
        setConnectionError(true);
        return () => {};
      }
      
      try {
        // Subscribe to user network status with improved error handling
        const unsubscribe = getUserStatusRealtime(userId, (status) => {
          if (!isSubscribed) return; // Prevent race conditions
          console.log(`[useUserPresence] Received status update for ${userId}:`, 
            status ? { state: status.state, lastActive: status.lastActive } : 'null');
          setUserStatus(status);
          if (status) {
            setConnectionError(false);
          }
        });
        
        return unsubscribe;
      } catch (error) {
        console.error(`[useUserPresence] Error subscribing to presence for ${userId}:`, error);
        setConnectionError(true);
        
        // Retry subscription after a delay
        retryTimeout = setTimeout(() => {
          if (isSubscribed) {
            console.log(`[useUserPresence] Retrying presence subscription for ${userId}`);
            subscribeToStatus();
          }
        }, 5000);
        
        return () => {
          if (retryTimeout) clearTimeout(retryTimeout);
        };
      }
    };
    
    // Start subscription
    let unsubscribe: (() => void) | null = null;
    subscribeToStatus().then(unsub => {
      unsubscribe = unsub;
    });

    // Check network connectivity when component mounts
    networkService.checkConnectivity().then(isConnected => {
      if (isSubscribed) {
        console.log(`[useUserPresence] Network connectivity status: ${isConnected ? 'Connected' : 'Disconnected'}`);
      }
    }).catch(err => {
      if (isSubscribed) {
        console.error('[useUserPresence] Error checking network connectivity:', err);
      }
    });

    // Subscribe to network status changes
    const networkUnsubscribe = networkService.subscribe((isConnected) => {
      if (!isSubscribed) return;
      console.log(`[useUserPresence] Network status changed: ${isConnected ? 'Connected' : 'Disconnected'}`);
      
      // If connection was restored, refresh the user status
      if (isConnected) {
        const refreshTimeout = setTimeout(() => {
          if (!isSubscribed) return;
          console.log(`[useUserPresence] Network restored, refreshing status for ${userId}`);
          // Force a refresh by re-subscribing
          if (typeof unsubscribe === 'function') {
            unsubscribe();
          }
          subscribeToStatus().then(unsub => {
            unsubscribe = unsub;
          });
        }, 1000); // Small delay to allow connection to stabilize
        
        return () => clearTimeout(refreshTimeout);
      }
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
    };
  }, [userId]);

  // Enhanced status determination logic with real-time features
  const getPresenceStatus = (): PresenceStatus => {
    console.log(`[useUserPresence] Determining presence status for ${userId}:`);
    console.log(`[useUserPresence] - userStatus:`, userStatus);
    console.log(`[useUserPresence] - connectionError:`, connectionError);
    console.log(`[useUserPresence] - navigator.onLine:`, navigator.onLine);
    console.log(`[useUserPresence] - networkService.getConnectionStatus():`, networkService.getConnectionStatus());
    
    // Check if we have CORS or connection issues based on network service
    const isNetworkConnected = networkService.getConnectionStatus();
    const hasLocalConnection = navigator.onLine;
    
    // Handle connection errors with better fallback
    if (connectionError || !isNetworkConnected) {
      return {
        isOnline: false,
        lastSeen: null,
        statusText: 'Connection error',
        statusColor: 'gray',
        animate: false,
        connectionQuality: 'disconnected'
      };
    }

    // If no status data is available but local connection is good
    if (!userStatus && hasLocalConnection) {
      // This is likely a CORS/socket issue rather than user being offline
      console.log('[useUserPresence] No status data but browser is online - possible CORS/Socket issue');
      return {
        isOnline: false,
        lastSeen: null,
        statusText: 'Status unknown',
        statusColor: 'gray',
        animate: false,
        connectionQuality: 'poor'
      };
    }

    if (!userStatus) {
      return {
        isOnline: false,
        lastSeen: null,
        statusText: 'Offline',
        statusColor: 'gray',
        animate: false,
        connectionQuality: 'disconnected'
      };
    }

    const isOnline = userStatus.state === 'online';
    const lastActiveTime = userStatus.lastActive ? new Date(userStatus.lastActive) : null;
    
    // Enhanced real-time status calculation
    const now = Date.now();
    const timeSinceActive = lastActiveTime ? now - lastActiveTime.getTime() : Infinity;
    
    // Determine connection quality based on recency
    let connectionQuality: 'good' | 'poor' | 'disconnected' = 'good';
    if (timeSinceActive > 300000) { // 5 minutes
      connectionQuality = 'disconnected';
    } else if (timeSinceActive > 60000) { // 1 minute
      connectionQuality = 'poor';
    }

    let statusText = 'Offline';
    let statusColor: 'green' | 'yellow' | 'gray' | 'red' = 'gray';
    let animate = false;

    if (isOnline) {
      // More nuanced online status based on recency
      if (timeSinceActive < 30000) { // Less than 30 seconds
        statusText = 'Active now';
        statusColor = 'green';
        animate = true;
        connectionQuality = 'good';
      } else if (timeSinceActive < 300000) { // Less than 5 minutes
        statusText = 'Online';
        statusColor = 'green';
        animate = false;
      } else if (timeSinceActive < 1800000) { // Less than 30 minutes
        statusText = 'Recently active';
        statusColor = 'yellow';
        animate = false;
        connectionQuality = 'poor';
      } else {
        // Very old activity - treat as offline
        statusText = 'Offline';
        statusColor = 'gray';
        animate = false;
        connectionQuality = 'disconnected';
      }
    } else {
      // User is explicitly offline or away
      if (timeSinceActive < 300000) { // Less than 5 minutes
        statusText = 'Recently seen';
        statusColor = 'yellow';
      } else {
        statusText = 'Offline';
        statusColor = 'gray';
      }
    }

    return {
      isOnline: isOnline && timeSinceActive < 1800000, // Consider online if active within 30 minutes
      lastSeen: lastActiveTime,
      statusText,
      statusColor,
      animate,
      connectionQuality,
      realTimeUpdate: now
    };
  };

  return getPresenceStatus();
};
