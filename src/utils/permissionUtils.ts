import { auth } from '../firebase/config';
import { getDoc, doc } from 'firebase/firestore';
import { db } from '../firebase/config';

/**
 * Utility functions for verifying user permissions
 */
export class PermissionUtils {
  /**
   * Verifies that the current user is authenticated and has proper permissions
   * Returns the user's UID if authenticated, or null if not
   */
  static async verifyAuthentication(): Promise<string | null> {
    // First check session storage for quick access
    const sessionUserId = sessionStorage.getItem('userId');
    const isAuthenticated = sessionStorage.getItem('isAuthenticated') === 'true';
    
    if (!isAuthenticated || !sessionUserId) {
      console.log('[Permission] No authenticated user found in session');
      return null;
    }
    
    // Double check with Firebase auth
    const currentUser = auth.currentUser;
    if (!currentUser) {
      console.log('[Permission] Firebase auth reports no authenticated user');
      
      // Clear any stale session data
      sessionStorage.removeItem('isAuthenticated');
      sessionStorage.removeItem('userId');
      
      // Redirect to login page preserving intended URL
      try {
        const { RedirectAfterLogin } = await import('./redirectAfterLogin');
        RedirectAfterLogin.setIntendedUrl();
        window.location.href = RedirectAfterLogin.buildSignInUrl(true);
      } catch {
        window.location.href = '/signin';
      }
      return null;
    }
    
    // Verify that session user ID matches Firebase auth
    if (currentUser.uid !== sessionUserId) {
      console.warn('[Permission] User ID mismatch between session and Firebase');
      
      // Update session with correct user ID
      sessionStorage.setItem('userId', currentUser.uid);
      return currentUser.uid;
    }
    
    return currentUser.uid;
  }
  
  /**
   * Checks if current user has admin permissions
   */
  static async isAdmin(): Promise<boolean> {
    const uid = await this.verifyAuthentication();
    if (!uid) return false;
    
    try {
      const userDoc = await getDoc(doc(db, 'users', uid));
      if (!userDoc.exists()) return false;
      
      const role = userDoc.data().role;
      return role === 'admin' || role === 'super admin';
    } catch (error) {
      console.error('[Permission] Error checking admin status:', error);
      return false;
    }
  }
  
  /**
   * Verifies if a user can perform a specific action on a resource
   * @param resource The type of resource being accessed
   * @param action The action being performed (read, write, etc.)
   * @param resourceId Optional resource ID for checking specific permissions
   */
  static async canPerformAction(
    resource: string, 
    action: 'read' | 'create' | 'update' | 'delete', 
    resourceId?: string
  ): Promise<boolean> {
    const uid = await this.verifyAuthentication();
    if (!uid) {
      console.log(`[Permission] User not authenticated, cannot ${action} ${resource}`);
      return false;
    }
    
    // For owner-specific checks
    if (resourceId && resourceId === uid) {
      console.log(`[Permission] User is owner of ${resource}, allowing ${action}`);
      return true;
    }
    
    // For admin-only operations
    if (action === 'delete' && resource !== 'message') {
      const isAdmin = await this.isAdmin();
      if (!isAdmin) {
        console.log(`[Permission] User is not admin, cannot ${action} ${resource}`);
        return false;
      }
    }
    
    return true;
  }
  
  /**
   * Refreshes the Firebase auth token to prevent permission issues
   * due to expired tokens
   */
  static async refreshAuthToken(): Promise<boolean> {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        console.log('[Permission] No user to refresh token for');
        return false;
      }
      
      // Force token refresh
      await currentUser.getIdToken(true);
      console.log('[Permission] Successfully refreshed auth token');
      return true;
    } catch (error) {
      console.error('[Permission] Failed to refresh auth token:', error);
      return false;
    }
  }
  
  /**
   * Verifies authentication and refreshes token if needed
   * Use this before operations that require fresh tokens
   */
  static async verifyAuthWithRefresh(): Promise<string | null> {
    const uid = await this.verifyAuthentication();
    if (!uid) return null;
    
    // Refresh token
    await this.refreshAuthToken();
    return uid;
  }
}
