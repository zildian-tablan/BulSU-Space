import { auth, db, rtdb } from '../firebase/config';
import { 
  signInWithEmailAndPassword, 
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User as FirebaseUser 
} from 'firebase/auth';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { ref, set, update, onDisconnect, serverTimestamp as rtdbServerTimestamp } from 'firebase/database';
import { SecurityManager } from '../utils/securityUtils';
import { initializePresence, updateUserOnlineStatus, forceInitializePresence } from './presenceService';

/**
 * Comprehensive Authentication Service
 * 
 * Provides centralized authentication management with dual verification
 * between Firebase Auth and application session state
 */
export class AuthService {
  /**
   * Authentication status keys
   */
  private static readonly AUTH_KEYS = {
    IS_AUTHENTICATED: 'isAuthenticated',
    USER_ID: 'userId',
    USER_DATA: 'currentUser',
    AUTH_TOKEN: 'authToken',
    TOKEN_EXPIRY: 'tokenExpiry',
    AUTH_TIMESTAMP: 'authTimestamp'
  };

  /**
   * Login with email and password
   * 
   * @param email User email
   * @param password User password
   * @returns Auth result with user and success status
   */
  static async login(email: string, password: string): Promise<{
    success: boolean;
    user?: FirebaseUser;
    error?: string;
  }> {
    try {
      // Clear any existing auth data
      this.clearAuthData();
      
      // Attempt to sign in with Firebase
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const firebaseUser = userCredential.user;
      
      if (!firebaseUser) {
        throw new Error('Authentication failed - no user returned');
      }
      
      // Record login success (don't await)
      SecurityManager.recordLoginAttempt(email, true).catch(err => 
        console.error('[AuthService] Error recording login attempt:', err)
      );
      
      // IMMEDIATELY get a fresh token with long expiration
      const token = await firebaseUser.getIdToken(true);  // Force token refresh
      const expiryTime = Date.now() + (55 * 60 * 1000); // 55 minutes
      
      // Store token info with longer expiration and immediate availability
      sessionStorage.setItem(this.AUTH_KEYS.AUTH_TOKEN, token);
      sessionStorage.setItem(this.AUTH_KEYS.TOKEN_EXPIRY, expiryTime.toString());
      sessionStorage.setItem(this.AUTH_KEYS.AUTH_TIMESTAMP, Date.now().toString());
      
      // Set up dual authentication state (but don't wait for completion)
      this.setupAuthenticationState(firebaseUser).catch(err => 
        console.error('[AuthService] Error in setupAuthenticationState:', err)
      );
      
      // Handle presence update in background (don't block login completion)
      setTimeout(() => {
        this.updateUserPresence(firebaseUser.uid).catch(err => 
          console.error('[AuthService] Error updating user presence:', err)
        );
      }, 100);
      
      // Return success immediately without waiting for presence updates
      return { 
        success: true, 
        user: firebaseUser 
      };
    } catch (error: any) {
      console.error('[AuthService] Login error:', error);
      
      // Record failed login attempt (don't await)
      SecurityManager.recordLoginAttempt(email, false).catch(err => 
        console.error('[AuthService] Error recording failed login attempt:', err)
      );
      
      return { 
        success: false,
        error: error.message || 'Authentication failed'
      };
    }
  }
  
  /**
   * Update user presence in background
   * This is separated from login to avoid blocking the login process
   */
  private static async updateUserPresence(userId: string): Promise<void> {
    try {
      console.log('[AuthService] Writing user status to RTDB in background');
      
      // First, we'll directly write to the top-level "status" path with a user object
      const STATUS_REF = 'status';
      
      // Write to the user-specific path
      const userStatusRef = ref(rtdb, `${STATUS_REF}/${userId}`);
      await set(userStatusRef, {
        state: 'online',
        lastActive: Date.now(),
        lastSeen: Date.now(),
        loginTimestamp: Date.now(),
        serverTime: rtdbServerTimestamp(),
        client: 'web-app',
        lastLogin: new Date().toISOString(),
        deviceInfo: {
          platform: navigator.platform,
          userAgent: navigator.userAgent
        }
      });
      
      // Then initialize the presence system for ongoing monitoring
      await forceInitializePresence(userId, 3);
      
      console.log('[AuthService] Status updated in RTDB after login');
    } catch (presenceError) {
      console.error('[AuthService] Error updating status after login:', presenceError);
      
      // Emergency direct write with simplified approach
      try {
        console.log('[AuthService] Attempting emergency status write');
        const STATUS_REF = 'status';
        const statusRef = ref(rtdb, `${STATUS_REF}/${userId}`);
        await set(statusRef, { 
          state: 'online', 
          timestamp: Date.now(),
          emergency: true 
        });
      } catch (emergencyError) {
        console.error('[AuthService] Even emergency status write failed:', emergencyError);
      }
    }
  }
  
  /**
   * Sign out the current user from both Firebase and application state
   */
  static async logout(): Promise<boolean> {
    try {
      // Mark logout in progress
      sessionStorage.setItem('isLoggingOut', 'true');
      sessionStorage.setItem('intentionalLogout', 'true');
      sessionStorage.setItem('logoutTimestamp', Date.now().toString());
      
      // Sign out from Firebase
      await firebaseSignOut(auth);
      
      // Clear all auth data
      this.clearAuthData();
      
      return true;
    } catch (error) {
      console.error('[AuthService] Logout error:', error);
      return false;
    } finally {
      // Clear logout in progress flag
      sessionStorage.removeItem('isLoggingOut');
    }
  }
  
  /**
   * Verify authentication status across both Firebase and application
   * 
   * @param enforceRedirect If true, redirects to login page on auth failure
   * @returns User ID if authenticated, null if not
   */
  static async verifyAuthentication(enforceRedirect: boolean = true): Promise<string | null> {
    // Get current time for checking token expiry
    const now = Date.now();
    
    // Step 1: Check session storage for quick rejection
    const sessionAuthStatus = sessionStorage.getItem(this.AUTH_KEYS.IS_AUTHENTICATED);
    const sessionUserId = sessionStorage.getItem(this.AUTH_KEYS.USER_ID);
    const authToken = sessionStorage.getItem(this.AUTH_KEYS.AUTH_TOKEN);
    const tokenExpiry = sessionStorage.getItem(this.AUTH_KEYS.TOKEN_EXPIRY);
    
    if (sessionAuthStatus !== 'true' || !sessionUserId) {
      console.log('[AuthService] No authenticated session found');
      if (enforceRedirect) this.redirectToLogin();
      return null;
    }

    // Step 2: Check if token is missing or expired
    if (!authToken || (tokenExpiry && parseInt(tokenExpiry) < now)) {
      console.log('[AuthService] Auth token missing or expired, refreshing...');
      // Try to refresh token before failing
      const refreshed = await this.refreshAuthToken();
      if (!refreshed) {
        console.error('[AuthService] Token refresh failed');
        if (enforceRedirect) this.redirectToLogin();
        return null;
      }
    }
    
    // Step 3: Verify Firebase authentication
    const firebaseUser = auth.currentUser;
    if (!firebaseUser) {
      console.error('[AuthService] No Firebase user found despite session auth');
      
      // Check if this is likely a page reload with Firebase still initializing
      const authTimestamp = sessionStorage.getItem(this.AUTH_KEYS.AUTH_TIMESTAMP);
      const isRecent = authTimestamp && (now - parseInt(authTimestamp)) < 60000; // 1 minute
      
      if (isRecent) {
        console.log('[AuthService] Recent auth detected, treating as valid');
        return sessionUserId;
      }
      
      // One last attempt to refresh auth state
      try {
        console.log('[AuthService] Attempting to refresh auth state...');
        await this.refreshAuthToken();
        
        // Check if we have a Firebase user now
        if (auth.currentUser) {
          console.log('[AuthService] Auth state restored after refresh');
          return sessionUserId;
        }
      } catch (refreshError) {
        console.error('[AuthService] Final refresh attempt failed:', refreshError);
      }
      
      // Clear invalid session state
      this.clearAuthData();
      if (enforceRedirect) this.redirectToLogin();
      return null;
    }
    
    // Step 4: Verify user ID match between Firebase and session
    if (firebaseUser.uid !== sessionUserId) {
      console.error('[AuthService] User ID mismatch:', {
        firebaseUid: firebaseUser.uid,
        sessionUserId
      });
      
      // Update session with correct Firebase user
      await this.setupAuthenticationState(firebaseUser);
      return firebaseUser.uid;
    }
    
    // All checks passed
    return sessionUserId;
  }
  
  /**
   * Refreshes the authentication token
   * 
   * @returns True if refresh successful
   */
  static async refreshAuthToken(): Promise<boolean> {
    try {
      const firebaseUser = auth.currentUser;
      if (!firebaseUser) {
        console.error('[AuthService] No Firebase user found during token refresh');
        
        // Check if we have a userId in session
        const sessionUserId = sessionStorage.getItem(this.AUTH_KEYS.USER_ID);
        if (sessionUserId) {
          // Force Firebase to reload the auth state
          await auth.updateCurrentUser(null);
          console.log('[AuthService] Forced Firebase auth state reload');
          
          // If still not authenticated, we really don't have a valid session
          if (!auth.currentUser) {
            console.error('[AuthService] Still no Firebase user after forced reload');
            return false;
          }
        } else {
          return false;
        }
      }
      
      // Get the current Firebase user again (might have been updated)
      const currentUser = auth.currentUser;
      if (!currentUser) {
        return false;
      }
      
      // Force token refresh with increased timeout
      console.log('[AuthService] Requesting fresh token...');
      const tokenPromise = new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Token refresh timed out'));
        }, 10000); // 10 second timeout
        
        currentUser.getIdToken(true)
          .then(token => {
            clearTimeout(timeout);
            resolve(token);
          })
          .catch(error => {
            clearTimeout(timeout);
            reject(error);
          });
      });
      
      const token = await tokenPromise;
      
      // Update token in session storage with longer expiry
      const expiryTime = Date.now() + (55 * 60 * 1000); // 55 minutes
      sessionStorage.setItem(this.AUTH_KEYS.AUTH_TOKEN, token);
      sessionStorage.setItem(this.AUTH_KEYS.TOKEN_EXPIRY, expiryTime.toString());
      sessionStorage.setItem(this.AUTH_KEYS.AUTH_TIMESTAMP, Date.now().toString());
      
      // Also update the authenticated flag and user ID to ensure consistency
      sessionStorage.setItem(this.AUTH_KEYS.IS_AUTHENTICATED, 'true');
      sessionStorage.setItem(this.AUTH_KEYS.USER_ID, currentUser.uid);
      
      console.log('[AuthService] Token refresh successful');
      return true;
    } catch (error) {
      console.error('[AuthService] Token refresh failed:', error);
      return false;
    }
  }
  
  /**
   * Set up dual authentication state across Firebase and application
   */
  private static async setupAuthenticationState(firebaseUser: FirebaseUser): Promise<void> {
    try {
      // Clear any existing auth data first to avoid state conflicts
      this.clearAuthData();
      
      // Get token and set expiry
      const token = await firebaseUser.getIdToken(true); // Force refresh token
      const expiryTime = Date.now() + (55 * 60 * 1000); // 55 minutes
      
      // Store token info
      sessionStorage.setItem(this.AUTH_KEYS.AUTH_TOKEN, token);
      sessionStorage.setItem(this.AUTH_KEYS.TOKEN_EXPIRY, expiryTime.toString());
      
      // Store authentication timestamp
      sessionStorage.setItem(this.AUTH_KEYS.AUTH_TIMESTAMP, Date.now().toString());
      
      // Store auth status and user ID
      sessionStorage.setItem(this.AUTH_KEYS.IS_AUTHENTICATED, 'true');
      sessionStorage.setItem(this.AUTH_KEYS.USER_ID, firebaseUser.uid);
      
      // Get user data from Firestore
      try {
        const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          let restricted = userData.restricted || false;
          let restrictedAt: string | null = userData.restrictedAt || null;
          let restrictionExpiresAt: string | null = userData.restrictionExpiresAt || null;
          // Auto-lift restriction if expired (gracefully, best-effort)
          if (restricted && restrictionExpiresAt) {
            const expires = Date.parse(restrictionExpiresAt);
            if (!isNaN(expires) && expires <= Date.now()) {
              try {
                await updateDoc(doc(db, 'users', firebaseUser.uid), {
                  restricted: false,
                  restrictedAt: null,
                  restrictionExpiresAt: null
                });
                restricted = false;
                restrictedAt = null;
                restrictionExpiresAt = null;
                console.log('[AuthService] Auto-cleared expired restriction for user', firebaseUser.uid);
              } catch (e) {
                console.warn('[AuthService] Failed to auto-clear expired restriction for user', firebaseUser.uid, e);
              }
            }
          }
          const userObject = {
            id: firebaseUser.uid,
            email: firebaseUser.email || '',
            name: userData.name || '',
            emailVerified: firebaseUser.emailVerified,
            role: userData.role || 'student',
            profile_pic: userData.profile_pic || null,
            department: userData.department || null,
            // Include other important user fields
            idNumber: userData.idNumber || '',
            restricted,
            restrictedAt,
            restrictionExpiresAt
          };

          // Store user data in session storage
          sessionStorage.setItem(this.AUTH_KEYS.USER_DATA, JSON.stringify(userObject));
        } else {
          // Create a basic user object if Firestore data doesn't exist
          const basicUser = {
            id: firebaseUser.uid,
            email: firebaseUser.email || '',
            name: firebaseUser.displayName || 'User',
            emailVerified: firebaseUser.emailVerified,
            role: 'student'
          };
          sessionStorage.setItem(this.AUTH_KEYS.USER_DATA, JSON.stringify(basicUser));
        }
      } catch (firestoreError) {
        console.error('[AuthService] Error getting user data:', firestoreError);
        
        // Still create a minimal user object even if Firestore fails
        const minimalUser = {
          id: firebaseUser.uid,
          email: firebaseUser.email || '',
          name: firebaseUser.displayName || 'User',
          emailVerified: firebaseUser.emailVerified
        };
        sessionStorage.setItem(this.AUTH_KEYS.USER_DATA, JSON.stringify(minimalUser));
      }
      
      // Double-check that all critical auth data was stored
      const essentialKeys = [
        this.AUTH_KEYS.IS_AUTHENTICATED,
        this.AUTH_KEYS.USER_ID, 
        this.AUTH_KEYS.AUTH_TOKEN,
        this.AUTH_KEYS.USER_DATA
      ];
      
      const missingKeys = essentialKeys.filter(key => !sessionStorage.getItem(key));
      if (missingKeys.length > 0) {
        console.error('[AuthService] Missing essential auth data:', missingKeys);
        
        // Aggressively try to restore all missing keys
        // This is critical to prevent auth loops and redirects
        if (!sessionStorage.getItem(this.AUTH_KEYS.IS_AUTHENTICATED)) {
          console.log('[AuthService] Restoring missing isAuthenticated flag');
          sessionStorage.setItem(this.AUTH_KEYS.IS_AUTHENTICATED, 'true');
        }
        
        if (!sessionStorage.getItem(this.AUTH_KEYS.USER_ID)) {
          console.log('[AuthService] Restoring missing user ID');
          sessionStorage.setItem(this.AUTH_KEYS.USER_ID, firebaseUser.uid);
        }
        
        if (!sessionStorage.getItem(this.AUTH_KEYS.AUTH_TOKEN)) {
          // Try to get the token again
          try {
            console.log('[AuthService] Restoring missing auth token');
            const retryToken = await firebaseUser.getIdToken();
            sessionStorage.setItem(this.AUTH_KEYS.AUTH_TOKEN, retryToken);
          } catch (tokenError) {
            console.error('[AuthService] Failed to get token on retry:', tokenError);
          }
        }
        
        if (!sessionStorage.getItem(this.AUTH_KEYS.USER_DATA)) {
          console.log('[AuthService] Restoring missing user data');
          // Create at least a minimal user object
          const minimalUser = {
            id: firebaseUser.uid,
            email: firebaseUser.email || '',
            name: firebaseUser.displayName || 'User',
            emailVerified: firebaseUser.emailVerified,
            role: 'student' // Default role
          };
          sessionStorage.setItem(this.AUTH_KEYS.USER_DATA, JSON.stringify(minimalUser));
        }
        
        // Add login success flags for better transition handling
        sessionStorage.setItem('loginSuccess', 'true');
        sessionStorage.setItem('loginTimestamp', Date.now().toString());
        
        // Verify the keys were actually set
        const stillMissingKeys = essentialKeys.filter(key => !sessionStorage.getItem(key));
        if (stillMissingKeys.length > 0) {
          console.error('[AuthService] Still missing keys after retry:', stillMissingKeys);
        } else {
          console.log('[AuthService] Successfully restored all missing auth data');
        }
      }
    } catch (error) {
      console.error('[AuthService] Error setting up auth state:', error);
      throw error;
    }
  }
  
  /**
   * Clear all authentication data
   */
  private static clearAuthData(): void {
    // Clear all auth related session storage
    sessionStorage.removeItem(this.AUTH_KEYS.IS_AUTHENTICATED);
    sessionStorage.removeItem(this.AUTH_KEYS.USER_ID);
    sessionStorage.removeItem(this.AUTH_KEYS.USER_DATA);
    sessionStorage.removeItem(this.AUTH_KEYS.AUTH_TOKEN);
    sessionStorage.removeItem(this.AUTH_KEYS.TOKEN_EXPIRY);
    sessionStorage.removeItem(this.AUTH_KEYS.AUTH_TIMESTAMP);
    sessionStorage.removeItem('isAuthenticating');
  }
  
  /**
   * Redirect to login page
   */
  private static redirectToLogin(): void {
    // Only redirect if we're not already on the login page
    if (!window.location.pathname.includes('/signin')) {
      try {
        const { RedirectAfterLogin } = require('../utils/redirectAfterLogin');
        RedirectAfterLogin.setIntendedUrl();
        const url = RedirectAfterLogin.buildSignInUrl(true);
        window.location.href = url;
      } catch {
        window.location.href = '/signin';
      }
    }
  }
  
  /**
   * Set up Auth state monitoring
   * 
   * @param onAuthChanged Callback for auth state changes
   * @returns Unsubscribe function
   */
  static monitorAuthState(onAuthChanged: (user: FirebaseUser | null) => void): () => void {
    return onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // User signed in - ensure our dual state is set up
        await this.setupAuthenticationState(firebaseUser);
      } else {
        // User signed out - clear auth data
        this.clearAuthData();
      }
      
      // Call the callback
      onAuthChanged(firebaseUser);
    });
  }
  
  /**
   * Debug authentication state - logs complete auth information
   * Call this when experiencing authentication issues
   */
  static async debugAuthState(): Promise<{isAuthenticated: boolean, details: any}> {
    const firebaseUser = auth.currentUser;
    const sessionAuthStatus = sessionStorage.getItem(this.AUTH_KEYS.IS_AUTHENTICATED);
    const sessionUserId = sessionStorage.getItem(this.AUTH_KEYS.USER_ID);
    const tokenExpiry = sessionStorage.getItem(this.AUTH_KEYS.TOKEN_EXPIRY);
    const authTimestamp = sessionStorage.getItem(this.AUTH_KEYS.AUTH_TIMESTAMP);
    
    let token = null;
    let tokenClaims = null;
    
    try {
      if (firebaseUser) {
        token = await firebaseUser.getIdToken();
        tokenClaims = await firebaseUser.getIdTokenResult();
      }
    } catch (error) {
      console.error("Error getting token details:", error);
    }
    
    const authDetails = {
      firebaseAuth: {
        authenticated: !!firebaseUser,
        userId: firebaseUser?.uid || null,
        email: firebaseUser?.email || null,
        emailVerified: firebaseUser?.emailVerified || false,
        tokenExists: !!token,
        tokenClaims: tokenClaims?.claims || null,
        tokenExpiration: tokenClaims?.expirationTime || null,
      },
      sessionStorage: {
        authenticated: sessionAuthStatus === 'true',
        userId: sessionUserId,
        tokenExpiry: tokenExpiry ? new Date(parseInt(tokenExpiry)).toISOString() : null,
        authTimestamp: authTimestamp ? new Date(parseInt(authTimestamp)).toISOString() : null,
        now: new Date().toISOString()
      }
    };
    
    console.log('[AuthService] Auth state debug:', authDetails);
    
    const isAuthenticated = !!firebaseUser && sessionAuthStatus === 'true' && firebaseUser.uid === sessionUserId;
    return { isAuthenticated, details: authDetails };
  }
  
  /**
   * Run a comprehensive diagnostic check on authentication state
   * This helps troubleshoot session expiration and permission issues
   * 
   * @returns Diagnostic results and whether any action was taken
   */
  static async runAuthDiagnostics(): Promise<{ 
    isAuthenticated: boolean; 
    fixed: boolean; 
    details: any 
  }> {
    console.log('[AuthService] Running authentication diagnostics...');
    let fixed = false;
    
    const firebaseUser = auth.currentUser;
    const sessionAuthStatus = sessionStorage.getItem(this.AUTH_KEYS.IS_AUTHENTICATED);
    const sessionUserId = sessionStorage.getItem(this.AUTH_KEYS.USER_ID);
    const tokenExpiry = sessionStorage.getItem(this.AUTH_KEYS.TOKEN_EXPIRY);
    const authTimestamp = sessionStorage.getItem(this.AUTH_KEYS.AUTH_TIMESTAMP);
    const authToken = sessionStorage.getItem(this.AUTH_KEYS.AUTH_TOKEN);
    
    let token = null;
    let tokenClaims = null;
    let tokenValid = false;
    
    // Detailed diagnostics with proper typing
    const diagnostics: {
      firebaseAuth: {
        authenticated: boolean;
        userId: string | null;
        email: string | null;
        emailVerified: boolean;
        tokenExists?: boolean;
        tokenClaims?: any;
        tokenExpiration?: string | null;
      };
      sessionStorage: {
        authenticated: boolean;
        userId: string | null;
        tokenExists: boolean;
        tokenExpiry: string | null;
        tokenExpired: boolean;
        authTimestamp: string | null;
      };
      timing: {
        now: string;
        currentTimestamp: number;
      };
      problems: string[];
    } = {
      firebaseAuth: {
        authenticated: !!firebaseUser,
        userId: firebaseUser?.uid || null,
        email: firebaseUser?.email || null,
        emailVerified: firebaseUser?.emailVerified || false
      },
      sessionStorage: {
        authenticated: sessionAuthStatus === 'true',
        userId: sessionUserId,
        tokenExists: !!authToken,
        tokenExpiry: tokenExpiry ? new Date(parseInt(tokenExpiry)).toISOString() : null,
        tokenExpired: tokenExpiry ? parseInt(tokenExpiry) < Date.now() : true,
        authTimestamp: authTimestamp ? new Date(parseInt(authTimestamp)).toISOString() : null,
      },
      timing: {
        now: new Date().toISOString(),
        currentTimestamp: Date.now()
      },
      problems: [] // Now properly typed as string[]
    };
    
    // Check for problems
    if (firebaseUser && !sessionAuthStatus) {
      diagnostics.problems.push('Firebase authenticated but session says not authenticated');
      
      // Fix: Set up session authentication
      try {
        await this.setupAuthenticationState(firebaseUser);
        fixed = true;
        diagnostics.problems.push('FIXED: Re-established session authentication');
      } catch (error) {
        diagnostics.problems.push(`Failed to fix session auth: ${error}`);
      }
    }
    
    if (sessionAuthStatus === 'true' && !firebaseUser) {
      diagnostics.problems.push('Session says authenticated but Firebase is not');
      
      // This is harder to fix - might need to clear the session
      const authTimestamp = sessionStorage.getItem(this.AUTH_KEYS.AUTH_TIMESTAMP);
      const isRecent = authTimestamp && (Date.now() - parseInt(authTimestamp)) < 60000; // 1 minute
      
      if (isRecent) {
        diagnostics.problems.push('Recent authentication detected, Firebase may still be initializing');
      } else {
        // Clear the invalid session state
        this.clearAuthData();
        diagnostics.problems.push('FIXED: Cleared invalid session authentication data');
        fixed = true;
      }
    }
    
    if (firebaseUser && sessionUserId && firebaseUser.uid !== sessionUserId) {
      diagnostics.problems.push('User ID mismatch between Firebase and session');
      
      // Fix the mismatch by updating session
      try {
        await this.setupAuthenticationState(firebaseUser);
        diagnostics.problems.push('FIXED: Synchronized user ID between Firebase and session');
        fixed = true;
      } catch (error) {
        diagnostics.problems.push(`Failed to fix user ID mismatch: ${error}`);
      }
    }
    
    if (sessionAuthStatus === 'true' && (!authToken || (tokenExpiry && parseInt(tokenExpiry) < Date.now()))) {
      diagnostics.problems.push('Auth token missing or expired');
      
      // Try to refresh the token
      try {
        const refreshed = await this.refreshAuthToken();
        if (refreshed) {
          diagnostics.problems.push('FIXED: Successfully refreshed authentication token');
          fixed = true;
        } else {
          diagnostics.problems.push('Failed to refresh token - no Firebase user available');
        }
      } catch (error) {
        diagnostics.problems.push(`Failed to refresh token: ${error}`);
      }
    }
    
    // Get token details if available
    try {
      if (firebaseUser) {
        token = await firebaseUser.getIdToken();
        tokenClaims = await firebaseUser.getIdTokenResult();
        tokenValid = !!token;
        
        // Add token details to diagnostics
        diagnostics.firebaseAuth.tokenExists = !!token;
        diagnostics.firebaseAuth.tokenClaims = tokenClaims?.claims || null;
        diagnostics.firebaseAuth.tokenExpiration = tokenClaims?.expirationTime || null;
      }
    } catch (error) {
      diagnostics.problems.push(`Error getting token details: ${error}`);
    }
    
    // Return authentication status after potential fixes
    const isAuthenticated = !!firebaseUser && 
                            sessionAuthStatus === 'true' && 
                            (!sessionUserId || firebaseUser.uid === sessionUserId) &&
                            tokenValid;
    
    console.log('[AuthService] Auth diagnostics complete:', { isAuthenticated, fixed, diagnostics });
    
    return { 
      isAuthenticated, 
      fixed,
      details: diagnostics 
    };
  }
}
