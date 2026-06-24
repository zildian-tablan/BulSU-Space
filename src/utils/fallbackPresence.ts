import React from 'react';
import { updateUserOnlineStatus, initializePresence } from '../services/presenceService';
import { auth } from '../firebase/config';

/**
 * Fallback presence manager for when socket server is unavailable
 * This ensures users still appear online even without real-time connections
 */
class FallbackPresenceManager {
  private intervalId: NodeJS.Timeout | null = null;
  private isActive = false;
  private lastActivity = Date.now();
  private userId: string;

  constructor(userId: string) {
    this.userId = userId;
  }  start() {
    if (this.isActive) return;

    console.log(`[FallbackPresence] Starting fallback presence manager for user: ${this.userId}`);
    this.isActive = true;

    // Track user activity
    this.setupActivityTracking();

    // Set up periodic status updates
    this.intervalId = setInterval(() => {
      this.updateStatus();
    }, 30000); // Every 30 seconds

    // Listen for offline events to stop updates
    window.addEventListener('offline', this.handleOffline);

    // Initial status update (only if online)
    if (navigator.onLine) {
      this.updateStatus();
    }
  }
  stop() {
    console.log(`[FallbackPresence] Stopping fallback presence manager for user: ${this.userId}`);
    this.isActive = false;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    window.removeEventListener('offline', this.handleOffline);
    this.removeActivityListeners();
  }

  private handleOffline = async () => {
    console.log(`[FallbackPresence] Device went offline, setting offline status for user: ${this.userId}`);
    try {
      const { setUserOffline } = await import('../services/presenceService');
      await setUserOffline(this.userId);
    } catch (error) {
      console.error(`[FallbackPresence] Failed to set offline status for user ${this.userId}:`, error);
    }
  }

  private setupActivityTracking() {
    const updateActivity = () => {
      this.lastActivity = Date.now();
    };

    // Add activity listeners
    document.addEventListener('mousemove', updateActivity, { passive: true });
    document.addEventListener('keypress', updateActivity, { passive: true });
    document.addEventListener('touchstart', updateActivity, { passive: true });
    document.addEventListener('scroll', updateActivity, { passive: true });
    window.addEventListener('focus', updateActivity);

    // Store references for cleanup
    (this as any).activityListeners = {
      mousemove: updateActivity,
      keypress: updateActivity,
      touchstart: updateActivity,
      scroll: updateActivity,
      focus: updateActivity
    };
  }

  private removeActivityListeners() {
    const listeners = (this as any).activityListeners;
    if (!listeners) return;

    document.removeEventListener('mousemove', listeners.mousemove);
    document.removeEventListener('keypress', listeners.keypress);
    document.removeEventListener('touchstart', listeners.touchstart);
    document.removeEventListener('scroll', listeners.scroll);
    window.removeEventListener('focus', listeners.focus);

    delete (this as any).activityListeners;
  }  private async updateStatus() {
    try {
      // Don't update status if we're offline
      if (!navigator.onLine) {
        console.log(`[FallbackPresence] Device is offline, skipping status update for user: ${this.userId}`);
        return;
      }

      // Check if user has been active recently
      const now = Date.now();
      const timeSinceActivity = now - this.lastActivity;
      const isRecentlyActive = timeSinceActivity < 300000; // 5 minutes

      if (isRecentlyActive) {
        await updateUserOnlineStatus(this.userId);
        console.log(`[FallbackPresence] Updated online status via fallback for user: ${this.userId}`);
      } else {
        console.log(`[FallbackPresence] User ${this.userId} inactive, skipping status update`);
      }
    } catch (error) {
      console.warn(`[FallbackPresence] Failed to update status for user ${this.userId}:`, error);
    }
  }
  async forceOnlineStatus() {
    try {
      await initializePresence(this.userId);
      await updateUserOnlineStatus(this.userId);
      console.log(`[FallbackPresence] Forced online status update for user: ${this.userId}`);
    } catch (error) {
      console.error(`[FallbackPresence] Failed to force online status for user ${this.userId}:`, error);
    }
  }
}

// Export the class for creating individual instances
export { FallbackPresenceManager };

/**
 * Hook to automatically manage fallback presence for a specific user
 */
export const useFallbackPresence = (userId: string) => {
  React.useEffect(() => {
    if (!userId) return;
    
    const manager = new FallbackPresenceManager(userId);
    
    // Start fallback presence on mount
    manager.start();

    // Handle page visibility changes
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        manager.forceOnlineStatus();
      }
    };

    // Handle network reconnection
    const handleOnline = () => {
      manager.forceOnlineStatus();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnline);    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
      manager.stop();
    };
  }, [userId]);
};
