import { MessageCacheService } from './messageCacheService';
import { messageStatusService } from './messageStatusService';
import { messageQueue } from './messageQueue';
import { cleanupPresence } from './presenceService';
import { networkService } from './networkService';

/**
 * Centralized service to cleanup all active listeners and services
 * This is crucial for preventing permission denied errors after logout
 */
class ListenerCleanupService {
  private static instance: ListenerCleanupService;
  private activeUnsubscribes: (() => void)[] = [];
  private isCleanedUp = false;

  private constructor() {}

  public static getInstance(): ListenerCleanupService {
    if (!ListenerCleanupService.instance) {
      ListenerCleanupService.instance = new ListenerCleanupService();
    }
    return ListenerCleanupService.instance;
  }

  /**
   * Register an unsubscribe function to be called during cleanup
   */
  public registerUnsubscribe(unsubscribe: () => void): void {
    if (!this.isCleanedUp) {
      this.activeUnsubscribes.push(unsubscribe);
    }
  }

  /**
   * Comprehensive cleanup of all Firebase listeners and services
   */
  public async cleanupAllListeners(): Promise<void> {
    if (this.isCleanedUp) {
      console.log('[ListenerCleanup] Already cleaned up, skipping...');
      return;
    }

    console.log('[ListenerCleanup] Starting comprehensive listener cleanup...');
    this.isCleanedUp = true;    try {
      // 1. Call all registered unsubscribe functions (synchronous)
      console.log(`[ListenerCleanup] Calling ${this.activeUnsubscribes.length} registered unsubscribes...`);
      this.activeUnsubscribes.forEach((unsubscribe, index) => {
        try {
          unsubscribe();
        } catch (error) {
          console.error(`[ListenerCleanup] Error unsubscribing listener ${index + 1}:`, error);
        }
      });
      this.activeUnsubscribes = [];

      // 2. Run all cleanup operations in parallel for speed
      console.log('[ListenerCleanup] Running cleanup operations in parallel...');
      await Promise.allSettled([
        // Cleanup presence service
        cleanupPresence().catch(err => console.error('[ListenerCleanup] Presence cleanup error:', err)),

        // Cleanup other services (wrapped in promises for parallel execution)
        Promise.resolve().then(() => {
          try {
            networkService.cleanup();
            console.log('[ListenerCleanup] Network service cleaned');
          } catch (err) {
            console.error('[ListenerCleanup] Network cleanup error:', err);
          }
        }),
        
        Promise.resolve().then(() => {
          try {
            const messageCacheService = MessageCacheService.getInstance();
            const cacheKeys = Object.keys((messageCacheService as any).cache || {});
            cacheKeys.forEach(key => {
              messageCacheService.invalidateCache(key);
            });
            console.log('[ListenerCleanup] Message cache cleared');
          } catch (err) {
            console.error('[ListenerCleanup] Message cache cleanup error:', err);
          }
        }),
        
        Promise.resolve().then(() => {
          try {
            messageQueue.clearQueue();
            console.log('[ListenerCleanup] Message queue cleared');
          } catch (err) {
            console.error('[ListenerCleanup] Message queue cleanup error:', err);
          }
        })
      ]);

      console.log('[ListenerCleanup] Comprehensive cleanup completed successfully');

    } catch (error) {
      console.error('[ListenerCleanup] Error during comprehensive cleanup:', error);
    }
  }

  /**
   * Reset the cleanup state (for testing or re-initialization)
   */
  public reset(): void {
    console.log('[ListenerCleanup] Resetting cleanup state...');
    this.isCleanedUp = false;
    this.activeUnsubscribes = [];
  }
}

export const listenerCleanupService = ListenerCleanupService.getInstance();
export default listenerCleanupService;
