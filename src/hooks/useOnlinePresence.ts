import { useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { updateUserOnlineStatus, initializePresence, setUserOffline } from '../services/presenceService';
import { FallbackPresenceManager } from '../utils/fallbackPresence';

/**
 * Hook to ensure user stays online and maintain presence
 * This hook will handle:
 * - Initial presence setup
 * - Periodic status updates
 * - Connection recovery
 * - Tab visibility handling
 * - Fallback presence when socket server is unavailable
 */
export const useOnlinePresence = () => {
  const { currentUser } = useAuth();
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isInitializedRef = useRef(false);
  const fallbackManagerRef = useRef<FallbackPresenceManager | null>(null);
  const isOnlineRef = useRef(navigator.onLine); // Track online state

  useEffect(() => {
    if (!currentUser?.id) {
      return;
    }

    const userId = currentUser.id;
    console.log(`[OnlinePresence] Setting up presence for user: ${userId}`);    // Initialize presence if not already done
    const initializeUserPresence = async () => {
      if (isInitializedRef.current || !isOnlineRef.current) return;
      
      try {
        await initializePresence(userId);
        isInitializedRef.current = true;
        console.log(`[OnlinePresence] Presence initialized for user: ${userId}`);
        
        // Force immediate online status
        await updateUserOnlineStatus(userId);
        console.log(`[OnlinePresence] Initial online status set for user: ${userId}`);
        
        // Start fallback manager if not already started
        if (!fallbackManagerRef.current) {
          fallbackManagerRef.current = new FallbackPresenceManager(userId);
          fallbackManagerRef.current.start();
          console.log(`[OnlinePresence] Fallback presence manager started for user: ${userId}`);
        }
      } catch (error) {
        console.error(`[OnlinePresence] Failed to initialize presence:`, error);
        
        // Start fallback manager even if regular presence fails (only if online)
        if (!fallbackManagerRef.current && isOnlineRef.current) {
          fallbackManagerRef.current = new FallbackPresenceManager(userId);
          fallbackManagerRef.current.start();
          console.log(`[OnlinePresence] Fallback presence manager started (after presence init failure) for user: ${userId}`);
        }
        
        // Retry after delay (only if online)
        if (isOnlineRef.current) {
          retryTimeoutRef.current = setTimeout(() => {
            isInitializedRef.current = false;
            initializeUserPresence();
          }, 5000);
        }
      }
    };

    // Start initialization only if online
    if (isOnlineRef.current) {
      initializeUserPresence();
    }

    // Set up periodic status updates every 30 seconds (only when online)
    const startPeriodicUpdates = () => {
      if (intervalRef.current) return; // Already running
      
      intervalRef.current = setInterval(async () => {
        if (!isOnlineRef.current) return; // Skip if offline
        
        try {
          await updateUserOnlineStatus(userId);
          console.log(`[OnlinePresence] Periodic status update for user: ${userId}`);
        } catch (error) {
          console.warn(`[OnlinePresence] Failed periodic status update:`, error);
        }
      }, 30000);
    };

    // Stop periodic updates
    const stopPeriodicUpdates = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };

    // Start periodic updates if online
    if (isOnlineRef.current) {
      startPeriodicUpdates();
    }    // Handle page visibility changes
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible' && isOnlineRef.current) {
        console.log(`[OnlinePresence] Page became visible, updating status for user: ${userId}`);
        try {
          await updateUserOnlineStatus(userId);
        } catch (error) {
          console.warn(`[OnlinePresence] Failed visibility status update:`, error);
        }
      }
    };

    // Handle window focus
    const handleWindowFocus = async () => {
      if (!isOnlineRef.current) return; // Skip if offline
      
      console.log(`[OnlinePresence] Window focused, updating status for user: ${userId}`);
      try {
        await updateUserOnlineStatus(userId);
      } catch (error) {
        console.warn(`[OnlinePresence] Failed focus status update:`, error);
      }
    };    // Handle network coming online - SYNCHRONOUS update first
    const handleOnline = () => {
      isOnlineRef.current = true;
      console.log(`[OnlinePresence] Network came online for user: ${userId}`);
      
      // Immediately start recovery process
      setTimeout(async () => {
        try {
          // Re-initialize presence and update status
          isInitializedRef.current = false;
          await initializePresence(userId);
          await updateUserOnlineStatus(userId);
          
          // Restart fallback manager if needed
          if (!fallbackManagerRef.current) {
            fallbackManagerRef.current = new FallbackPresenceManager(userId);
            fallbackManagerRef.current.start();
          }
          
          // Restart periodic updates
          startPeriodicUpdates();
        } catch (error) {
          console.warn(`[OnlinePresence] Failed network recovery status update:`, error);
        }
      }, 100); // Small delay to ensure network is stable
    };

    // Handle network going offline - SYNCHRONOUS for immediate response
    const handleOffline = () => {
      isOnlineRef.current = false;
      console.log(`[OnlinePresence] Network went offline for user: ${userId}`);
      
      // Stop all ongoing activities immediately
      stopPeriodicUpdates();
      
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
      
      // Stop the fallback manager to prevent false positives
      if (fallbackManagerRef.current) {
        fallbackManagerRef.current.stop();
        fallbackManagerRef.current = null;
      }
      
      // Try to set offline status (may fail if already disconnected, but worth trying)
      setTimeout(async () => {
        try {
          await setUserOffline(userId);
        } catch (error) {
          console.warn(`[OnlinePresence] Failed to set offline status (expected when offline):`, error);
        }
      }, 0);
    };

    // Add event listeners
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleWindowFocus);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);    // Cleanup function
    return () => {
      console.log(`[OnlinePresence] Cleaning up presence for user: ${userId}`);
      
      stopPeriodicUpdates();
      
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
      
      if (fallbackManagerRef.current) {
        fallbackManagerRef.current.stop();
        fallbackManagerRef.current = null;
        console.log(`[OnlinePresence] Fallback presence manager stopped for user: ${userId}`);
      }
      
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      
      isInitializedRef.current = false;
    };
  }, [currentUser?.id]);
};
