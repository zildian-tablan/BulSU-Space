import { auth } from '../firebase/config';
import { User } from 'firebase/auth';
import { SecurityLogger } from './securityUtils';

interface TokenRotationConfig {
  rotationInterval: number; // in minutes
  maxTokenAge: number; // in minutes
  graceBuffer: number; // in minutes
  forceRotationThreshold: number; // in minutes
}

interface SessionInfo {
  tokenCreatedAt: number;
  lastRotation: number;
  rotationCount: number;
  deviceId?: string;
  lastActivity: number;
}

/**
 * Advanced session token rotation manager for enhanced security
 */
export class TokenRotationManager {
  private static readonly STORAGE_KEY = 'bulsu_session_info';
  private static readonly DEFAULT_CONFIG: TokenRotationConfig = {
    rotationInterval: 30, // Rotate every 30 minutes
    maxTokenAge: 60, // Max token age of 1 hour
    graceBuffer: 5, // 5-minute grace period
    forceRotationThreshold: 45 // Force rotation after 45 minutes
  };

  private static config: TokenRotationConfig = this.DEFAULT_CONFIG;
  private static rotationTimer: NodeJS.Timeout | null = null;
  private static isRotating = false;

  /**
   * Initialize token rotation for the current session
   */
  static async initializeRotation(user: User): Promise<void> {
    try {
      if (!user) {
        console.warn('[TokenRotation] No user provided for rotation initialization');
        return;
      }

      // Clear any existing rotation timer
      this.clearRotationTimer();

      // Get or create session info
      const sessionInfo = this.getSessionInfo();
      const now = Date.now();

      // Update session info
      const updatedSessionInfo: SessionInfo = {
        ...sessionInfo,
        tokenCreatedAt: now,
        lastRotation: now,
        lastActivity: now,
        rotationCount: (sessionInfo.rotationCount || 0) + 1
      };

      this.setSessionInfo(updatedSessionInfo);

      // Start rotation timer
      this.startRotationTimer(user);

      // Log successful initialization
      SecurityLogger.logSecurityEvent('token_rotation_initialized', {
        userId: user.uid,
        rotationCount: updatedSessionInfo.rotationCount
      });

      console.log('[TokenRotation] Token rotation initialized successfully');
    } catch (error) {
      console.error('[TokenRotation] Error initializing token rotation:', error);
      SecurityLogger.logSecurityEvent('token_rotation_error', {
        userId: user.uid,
        error: error instanceof Error ? error.message : 'Unknown error',
        action: 'initialize'
      });
    }
  }

  /**
   * Start the automatic token rotation timer
   */
  private static startRotationTimer(user: User): void {
    const intervalMs = this.config.rotationInterval * 60 * 1000;
    
    this.rotationTimer = setInterval(async () => {
      await this.performTokenRotation(user);
    }, intervalMs);

    console.log(`[TokenRotation] Rotation timer started (${this.config.rotationInterval} minutes)`);
  }

  /**
   * Perform token rotation
   */
  static async performTokenRotation(user: User): Promise<boolean> {
    if (this.isRotating) {
      console.log('[TokenRotation] Rotation already in progress, skipping');
      return false;
    }

    try {
      this.isRotating = true;
      const sessionInfo = this.getSessionInfo();
      const now = Date.now();

      // Check if rotation is needed
      const timeSinceLastRotation = now - sessionInfo.lastRotation;
      const tokenAge = now - sessionInfo.tokenCreatedAt;
      
      const shouldRotate = 
        timeSinceLastRotation >= (this.config.rotationInterval * 60 * 1000) ||
        tokenAge >= (this.config.forceRotationThreshold * 60 * 1000);

      if (!shouldRotate) {
        console.log('[TokenRotation] Rotation not needed yet');
        return false;
      }

      // Check if token is too old
      if (tokenAge >= (this.config.maxTokenAge * 60 * 1000)) {
        console.warn('[TokenRotation] Token too old, forcing re-authentication');
        SecurityLogger.logSecurityEvent('token_expired_force_reauth', {
          userId: user.uid,
          tokenAge: Math.round(tokenAge / 60000),
          maxAge: this.config.maxTokenAge
        });
        
        // Force re-authentication
        await this.forceReAuthentication();
        return false;
      }

      // Perform token refresh
      console.log('[TokenRotation] Performing token rotation...');
      const newToken = await user.getIdToken(true); // Force refresh

      if (newToken) {
        // Update session info
        const updatedSessionInfo: SessionInfo = {
          ...sessionInfo,
          lastRotation: now,
          lastActivity: now,
          rotationCount: sessionInfo.rotationCount + 1
        };

        this.setSessionInfo(updatedSessionInfo);

        // Log successful rotation
        SecurityLogger.logSecurityEvent('token_rotation_success', {
          userId: user.uid,
          rotationCount: updatedSessionInfo.rotationCount,
          tokenAge: Math.round(tokenAge / 60000)
        });

        console.log('[TokenRotation] Token rotation completed successfully');
        return true;
      }

      return false;
    } catch (error) {
      console.error('[TokenRotation] Error during token rotation:', error);
      SecurityLogger.logSecurityEvent('token_rotation_error', {
        userId: user.uid,
        error: error instanceof Error ? error.message : 'Unknown error',
        action: 'rotate'
      });

      // Check if error indicates authentication issues
      if (error instanceof Error && error.message.includes('auth/')) {
        console.warn('[TokenRotation] Authentication error, forcing re-auth');
        await this.forceReAuthentication();
      }

      return false;
    } finally {
      this.isRotating = false;
    }
  }

  /**
   * Check and refresh the token if a user is logged in
   */
  static async checkAndRefreshToken(): Promise<boolean> {
    const user = auth.currentUser;
    if (!user) {
      return false;
    }
    
    try {
      // Simple token refresh without the full rotation logic
      await user.getIdToken(true);
      return true;
    } catch (error) {
      console.error('[TokenRotation] Error refreshing token:', error);
      return false;
    }
  }

  /**
   * Update activity timestamp
   */
  static updateActivity(): void {
    const sessionInfo = this.getSessionInfo();
    sessionInfo.lastActivity = Date.now();
    this.setSessionInfo(sessionInfo);
  }

  /**
   * Check if current token needs rotation
   */
  static shouldRotateToken(): boolean {
    const sessionInfo = this.getSessionInfo();
    const now = Date.now();
    
    const timeSinceLastRotation = now - sessionInfo.lastRotation;
    const tokenAge = now - sessionInfo.tokenCreatedAt;
    
    return (
      timeSinceLastRotation >= (this.config.rotationInterval * 60 * 1000) ||
      tokenAge >= (this.config.forceRotationThreshold * 60 * 1000)
    );
  }

  /**
   * Get token age in minutes
   */
  static getTokenAge(): number {
    const sessionInfo = this.getSessionInfo();
    return Math.round((Date.now() - sessionInfo.tokenCreatedAt) / 60000);
  }

  /**
   * Get time until next rotation in minutes
   */
  static getTimeUntilRotation(): number {
    const sessionInfo = this.getSessionInfo();
    const nextRotationTime = sessionInfo.lastRotation + (this.config.rotationInterval * 60 * 1000);
    const timeUntilRotation = Math.max(0, nextRotationTime - Date.now());
    return Math.round(timeUntilRotation / 60000);
  }

  /**
   * Force token rotation now
   */
  static async forceRotation(): Promise<boolean> {
    const user = auth.currentUser;
    if (!user) {
      console.warn('[TokenRotation] No current user for forced rotation');
      return false;
    }

    console.log('[TokenRotation] Forcing token rotation');
    return await this.performTokenRotation(user);
  }
  /**
   * Force re-authentication
   */
  private static async forceReAuthentication(): Promise<void> {
    try {
      console.log('[TokenRotation] Forcing re-authentication');
      
      // Import the AuthInstanceManager
      const { AuthInstanceManager } = await import('../firebase/auth-instance-manager');
      
      // Check if a protected auth operation is in progress
      if (AuthInstanceManager.isAuthOperationInProgress()) {
        console.warn('[TokenRotation] Protected auth operation in progress, delaying re-authentication');
        
        // Log the event but don't force re-auth now
        SecurityLogger.logSecurityEvent('reauthentication_delayed', {
          reason: 'protected_auth_operation_in_progress'
        });
        
        // Schedule a check for later
        setTimeout(() => this.checkAndRefreshToken(), 60000); // Try again in 1 minute
        return;
      }
      
      SecurityLogger.logSecurityEvent('forced_reauthentication', {
        reason: 'token_rotation_failure'
      });

      // Clear session data
      this.clearSession();
      
      // Sign out user
      await auth.signOut();
      
      // Redirect to login (preserve current URL)
      try {
        const { RedirectAfterLogin } = await import('./redirectAfterLogin');
        RedirectAfterLogin.setIntendedUrl();
        window.location.href = RedirectAfterLogin.buildSignInUrl(true);
      } catch {
        window.location.href = '/signin';
      }
    } catch (error) {
      console.error('[TokenRotation] Error during forced re-authentication:', error);
      // Force page reload as fallback
      window.location.reload();
    }
  }

  /**
   * Clear rotation timer
   */
  static clearRotationTimer(): void {
    if (this.rotationTimer) {
      clearInterval(this.rotationTimer);
      this.rotationTimer = null;
      console.log('[TokenRotation] Rotation timer cleared');
    }
  }

  /**
   * Clear session data
   */
  static clearSession(): void {
    try {
      sessionStorage.removeItem(this.STORAGE_KEY);
      this.clearRotationTimer();
      console.log('[TokenRotation] Session data cleared');
    } catch (error) {
      console.error('[TokenRotation] Error clearing session:', error);
    }
  }

  /**
   * Get session info from storage
   */
  private static getSessionInfo(): SessionInfo {
    try {
      const stored = sessionStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (error) {
      console.error('[TokenRotation] Error reading session info:', error);
    }

    // Return default session info
    const now = Date.now();
    return {
      tokenCreatedAt: now,
      lastRotation: now,
      rotationCount: 0,
      lastActivity: now
    };
  }

  /**
   * Set session info to storage
   */
  private static setSessionInfo(sessionInfo: SessionInfo): void {
    try {
      sessionStorage.setItem(this.STORAGE_KEY, JSON.stringify(sessionInfo));
    } catch (error) {
      console.error('[TokenRotation] Error storing session info:', error);
    }
  }

  /**
   * Update rotation configuration
   */
  static updateConfig(newConfig: Partial<TokenRotationConfig>): void {
    this.config = { ...this.config, ...newConfig };
    console.log('[TokenRotation] Configuration updated:', this.config);
  }

  /**
   * Get current configuration
   */
  static getConfig(): TokenRotationConfig {
    return { ...this.config };
  }

  /**
   * Get session statistics
   */
  static getSessionStats(): {
    tokenAge: number;
    rotationCount: number;
    timeUntilRotation: number;
    lastActivity: Date;
  } {
    const sessionInfo = this.getSessionInfo();
    return {
      tokenAge: this.getTokenAge(),
      rotationCount: sessionInfo.rotationCount,
      timeUntilRotation: this.getTimeUntilRotation(),
      lastActivity: new Date(sessionInfo.lastActivity)
    };
  }
}

/**
 * Hook for React components to monitor token rotation
 */
export const useTokenRotation = () => {
  const [stats, setStats] = React.useState(TokenRotationManager.getSessionStats());
  const [isRotating, setIsRotating] = React.useState(false);

  React.useEffect(() => {
    const interval = setInterval(() => {
      setStats(TokenRotationManager.getSessionStats());
    }, 30000); // Update every 30 seconds

    return () => clearInterval(interval);
  }, []);

  const forceRotation = async () => {
    setIsRotating(true);
    try {
      await TokenRotationManager.forceRotation();
    } finally {
      setIsRotating(false);
    }
  };

  return {
    stats,
    isRotating,
    forceRotation,
    shouldRotate: TokenRotationManager.shouldRotateToken()
  };
};

// Add React import for the hook
import React from 'react';
