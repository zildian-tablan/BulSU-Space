import { Auth } from 'firebase/auth';

/**
 * Manages and tracks active Firebase Auth instances to prevent conflicts
 * This class helps ensure that auth operations in secondary instances
 * don't interfere with the primary auth session
 */
export class AuthInstanceManager {
  private static primaryAuthInstance: Auth | null = null;
  private static activeSecondaryInstances: Set<Auth> = new Set();
  private static isOperationInProgress: boolean = false;

  /**
   * Register the primary auth instance that should be protected
   */
  static registerPrimaryAuth(authInstance: Auth): void {
    this.primaryAuthInstance = authInstance;
    console.log('[AuthManager] Primary auth instance registered');
  }

  /**
   * Register a secondary auth instance for tracking
   */
  static registerSecondaryAuth(authInstance: Auth): void {
    this.activeSecondaryInstances.add(authInstance);
    console.log('[AuthManager] Secondary auth instance registered');
  }

  /**
   * Begin a protected operation using a secondary auth instance
   * This locks the auth state to prevent interference
   */
  static beginProtectedOperation(): void {
    this.isOperationInProgress = true;
    console.log('[AuthManager] Protected auth operation started');
  }

  /**
   * End a protected operation and release the lock
   */
  static endProtectedOperation(): void {
    this.isOperationInProgress = false;
    console.log('[AuthManager] Protected auth operation completed');
  }

  /**
   * Check if an auth operation is in progress
   */
  static isAuthOperationInProgress(): boolean {
    return this.isOperationInProgress;
  }

  /**
   * Safely sign out from a secondary auth instance
   * This ensures that the primary auth state is preserved
   */
  static async safelySignOutSecondary(authInstance: Auth): Promise<void> {
    // Don't allow signout of the primary instance through this method
    if (authInstance === this.primaryAuthInstance) {
      console.error('[AuthManager] Attempted to sign out primary auth through secondary method');
      return;
    }

    try {
      // Begin protected operation
      this.beginProtectedOperation();

      // Save primary auth user ID before secondary signout
      const primaryUid = this.primaryAuthInstance?.currentUser?.uid;
      
      // Sign out from the secondary instance
      await authInstance.signOut();

      console.log('[AuthManager] Secondary auth instance signed out successfully');

      // Verify primary auth state is preserved
      const currentPrimaryUid = this.primaryAuthInstance?.currentUser?.uid;
      
      if (primaryUid && primaryUid !== currentPrimaryUid) {
        console.warn('[AuthManager] Primary auth user changed during secondary signout operation!', {
          before: primaryUid,
          after: currentPrimaryUid
        });
        // You could implement recovery logic here if needed
      }

    } catch (error) {
      console.error('[AuthManager] Error during secondary auth signout:', error);
    } finally {
      // End protected operation
      this.endProtectedOperation();
    }
  }

  /**
   * Clean up tracking for a secondary auth instance 
   */
  static unregisterSecondaryAuth(authInstance: Auth): void {
    this.activeSecondaryInstances.delete(authInstance);
    console.log('[AuthManager] Secondary auth instance unregistered');
  }
  
  /**
   * Get the first registered secondary auth instance
   */
  static getSecondaryAuth(): Auth | null {
    if (this.activeSecondaryInstances.size === 0) {
      console.error('[AuthManager] No secondary auth instances available');
      return null;
    }
    
    // Return the first secondary auth instance from the set
    return Array.from(this.activeSecondaryInstances)[0];
  }
}
