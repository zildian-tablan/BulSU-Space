// Security utilities for authentication and account protection
import { auth } from '../firebase/config';
import { getAuth } from 'firebase/auth';
import { getFirestore, collection, addDoc } from 'firebase/firestore';
import { UAParser } from 'ua-parser-js';

interface LoginAttempt {
  email: string;
  timestamp: number;
  success: boolean;
}

interface AccountLockout {
  email: string;
  lockedUntil: number;
  attempts: number;
}

// Updated to reflect new policy: 3 attempts then 1 minute lockout
const MAX_LOGIN_ATTEMPTS = 3; // (Fallback/UI only – server enforces)
const LOCKOUT_DURATION = 60 * 1000; // 1 minute (fallback only)
const ATTEMPT_WINDOW = 5 * 60 * 1000; // 5 minutes

/**
 * Track login attempts and implement account lockout
 */
export class SecurityManager {
  private static API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:5000/api';
  
  /**
   * Get storage key for login attempts
   */
  private static getStorageKey(email: string): string {
    return `auth_attempts_${email.toLowerCase()}`;
  }

  /**
   * Get storage key for account lockout
   */
  private static getLockoutKey(email: string): string {
    return `auth_lockout_${email.toLowerCase()}`;
  }
    /**
   * Check if account is currently locked out by calling server API
   */
  static async isAccountLocked(email: string): Promise<boolean> {
    try {
      // Check with server for account lockout status
      const response = await fetch(`${this.API_BASE_URL}/auth/pre-login-check`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
        credentials: 'include'
      });
      
      if (!response.ok) {
        const data = await response.json();
        // If response is 429, account is locked
        if (response.status === 429) {
          // Store locally for UX purposes only
          const lockoutMinutes = data.lockoutMinutes || 15;
          localStorage.setItem('ui_lockout_info', JSON.stringify({
            email: email.toLowerCase(),
            message: data.error,
            retryAfter: data.retryAfter,
            lockedUntil: Date.now() + (lockoutMinutes * 60 * 1000)
          }));
          return true;
        }
      }
      
      // Clean up any local UI lockout info
      localStorage.removeItem('ui_lockout_info');
      return false;
    } catch (error) {
      console.error('Error checking account lock status:', error);
      // If we can't reach the server, fall back to local info if available
      // This is just for UX purposes, the server will enforce the actual lockout
      try {
        const lockoutInfo = localStorage.getItem('ui_lockout_info');
        if (lockoutInfo) {
          const info = JSON.parse(lockoutInfo);
          if (info.email === email.toLowerCase() && Date.now() < info.lockedUntil) {
            return true;
          }
        }      } catch {
        // Ignore parsing errors
      }
      return false;
    }
  }/**
   * Get remaining lockout time in formatted string (MM:SS)
   */
  static async getLockoutTimeRemaining(email: string): Promise<string> {
    try {
      let remainingSeconds = 0;
      
      // First try to get from server
      const response = await fetch(`${this.API_BASE_URL}/auth/pre-login-check`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
        credentials: 'include'
      });
      
      if (!response.ok && response.status === 429) {
        const data = await response.json();
        remainingSeconds = data.retryAfter || 0;
      } else {
        // If server says we're not locked, check local UI info as fallback
        const lockoutInfo = localStorage.getItem('ui_lockout_info');
        if (lockoutInfo) {
          const info = JSON.parse(lockoutInfo);
          if (info.email === email.toLowerCase() && Date.now() < info.lockedUntil) {
            remainingSeconds = Math.max(0, Math.floor((info.lockedUntil - Date.now()) / 1000));
          }
        }
      }
      
      // If no time remaining or negative, return "0:00" for consistent display
      if (remainingSeconds <= 0) {
        return "0:00";
      }
      
      // Format as MM:SS
      const minutes = Math.floor(remainingSeconds / 60);
      const seconds = remainingSeconds % 60;
      return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    } catch {
      return "0:00";
    }
  }
  /**
   * Record a login attempt
   */
  static async recordLoginAttempt(email: string, success: boolean): Promise<boolean> {
    try {
      // Send attempt to server API
      const response = await fetch(`${this.API_BASE_URL}/auth/login-result`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          email: email.toLowerCase(), 
          success 
        }),
        credentials: 'include'
      });

      const data = await response.json();
      // Local consecutive-failures tracking (client-side UX). Server remains authoritative.
      try {
        const emailKey = email.toLowerCase();
        const consecutiveKey = `auth_consec_fail_${emailKey}`;
        const now = Date.now();

        if (success) {
          // On successful login, reset any consecutive-failure counter and UI lockout info
          localStorage.removeItem(consecutiveKey);
          localStorage.removeItem('ui_lockout_info');
        } else {
          // On failure, increment consecutive counter (reset if outside ATTEMPT_WINDOW)
          let existing = null as { count: number; lastFailure: number } | null;
          try {
            const raw = localStorage.getItem(consecutiveKey);
            existing = raw ? JSON.parse(raw) : null;
          } catch {
            existing = null;
          }

          let count = 1;
          if (existing && typeof existing.count === 'number' && typeof existing.lastFailure === 'number') {
            if ((now - existing.lastFailure) <= ATTEMPT_WINDOW) {
              count = existing.count + 1;
            } else {
              // Too old, start a fresh consecutive count
              count = 1;
            }
          }

          // Persist consecutive failure info
          try {
            localStorage.setItem(consecutiveKey, JSON.stringify({ count, lastFailure: now }));
          } catch {
            // ignore storage errors
          }

          // If we've reached the configured consecutive threshold, set a local UI lockout
          if (count >= MAX_LOGIN_ATTEMPTS) {
            const retryAfterSeconds = Math.floor(LOCKOUT_DURATION / 1000);
            localStorage.setItem('ui_lockout_info', JSON.stringify({
              email: emailKey,
              message: 'Account temporarily locked due to failed attempts',
              retryAfter: retryAfterSeconds,
              lockedUntil: Date.now() + LOCKOUT_DURATION
            }));
          }
        }
      } catch (localErr) {
        // Non-fatal client-side bookkeeping error
        console.warn('Error updating local consecutive attempt counter:', localErr);
      }

      // Honor server response for lock state if provided
      if (!success && (response.status === 429 || data.status === 'locked')) {
        if (data.lockoutMinutes) {
          localStorage.setItem('ui_lockout_info', JSON.stringify({
            email: email.toLowerCase(),
            message: data.error || 'Account temporarily locked due to failed attempts',
            retryAfter: data.retryAfter || (15 * 60),
            lockedUntil: Date.now() + ((data.lockoutMinutes || 15) * 60 * 1000)
          }));
        }
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error recording login attempt:', error);
      return true; // Fail open
    }
  }
  /**
   * Get recent login attempts for an email (now handled server-side)
   * This is kept for backwards compatibility but returns an empty array
   */
  private static async getRecentAttempts(email: string): Promise<LoginAttempt[]> {
    // This is now handled server-side
    return [];
  }

  /**
   * Lock an account temporarily (now handled server-side)
   * This is kept for backwards compatibility but is a no-op
   */
  private static async lockAccount(email: string, attempts: number): Promise<void> {
    // Account lockout is now handled by the server
    console.warn(`Account lockout for ${email} is now handled server-side`);
  }
  /**
   * Check for suspicious activity patterns (now handled server-side)
   */
  static async detectSuspiciousActivity(email: string): Promise<boolean> {
    try {
      // Check with server for suspicious activity
      const response = await fetch(`${this.API_BASE_URL}/auth/check-suspicious-activity`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: email.toLowerCase() }),
        credentials: 'include'
      });
      
      if (response.ok) {
        const data = await response.json();
        return data.suspicious || false;
      }
      
      return false;
    } catch {
      return false; // Fail open if server is unavailable
    }
  }

  /**
   * Generate secure session identifier
   */
  static generateSessionId(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Validate password strength
   */
  static validatePasswordStrength(password: string): {
    isStrong: boolean;
    score: number;
    feedback: string[];
  } {
    const feedback: string[] = [];
    let score = 0;

    // Length check
    if (password.length >= 12) score += 2;
    else if (password.length >= 8) score += 1;
    else feedback.push('Use at least 12 characters');

    // Character diversity
    if (/[a-z]/.test(password)) score += 1;
    else feedback.push('Include lowercase letters');

    if (/[A-Z]/.test(password)) score += 1;
    else feedback.push('Include uppercase letters');

    if (/\d/.test(password)) score += 1;
    else feedback.push('Include numbers');

    if (/[!@#$%^&*(),.?":{}|<>~`\-_+=\[\]\\;'/]/.test(password)) score += 2;
    else feedback.push('Include special characters');

    // Common pattern checks
    if (/(.)\1{2,}/.test(password)) {
      score -= 1;
      feedback.push('Avoid repeated characters');
    }

    // Sequential characters
    if (/012|123|234|345|456|567|678|789|abc|bcd|cde|def|efg|fgh|ghi|hij|ijk|jkl|klm|lmn|mno|nop|opq|pqr|qrs|rst|stu|tuv|uvw|vwx|wxy|xyz/i.test(password)) {
      score -= 1;
      feedback.push('Avoid sequential characters');
    }

    // Common words
    const commonWords = ['password', 'admin', 'user', 'bulsu', 'student', 'faculty', 'alumni'];
    if (commonWords.some(word => password.toLowerCase().includes(word))) {
      score -= 2;
      feedback.push('Avoid common words');
    }

    return {
      isStrong: score >= 6 && feedback.length === 0,
      score: Math.max(0, Math.min(10, score)),
      feedback
    };
  }
  /**
   * Clear all security data (for logout)
   */
  static clearSecurityData(): void {
    // Remove any local UI indicators
    localStorage.removeItem('ui_lockout_info');
    
    // Clear any legacy security data that might still exist
    const keys = Object.keys(localStorage);
    keys.forEach(key => {
      if (key.startsWith('auth_attempts_') || key.startsWith('auth_lockout_')) {
        localStorage.removeItem(key);
      }
    });
  }
}

/**
 * Security event logger
 */
export class SecurityLogger {  
  static logSecurityEvent(event: string, details: any): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      event,
      details,
      userAgent: navigator.userAgent,
      ip: 'client-side', // Will be attempted to be resolved in saveLoginHistory
      method: details.method || 'password'
    };

    console.warn('[SECURITY]', logEntry);
    
    // Save login events to the user's login history in Firestore
    if (event === 'login_success' && details.email) {
      // Use Promise to avoid blocking the login flow, but still log any errors
      this.saveLoginHistory(details.email, logEntry)
        .catch(err => console.error('Error saving login history in background:', err));
    }
    
    // In production, send to security monitoring service
    if (process.env.NODE_ENV === 'production') {
      // TODO: Implement security event reporting
    }
  }
    // Save login history to Firestore for the user
  static async saveLoginHistory(email: string, logEntry: any): Promise<void> {
    try {
      // Get current user from Firebase Auth
      const auth = getAuth();
      const currentUser = auth.currentUser;
      
      if (!currentUser) {
        console.error('No authenticated user found when trying to save login history');
        return;
      }
      
      const db = getFirestore();
      
      // Parse user agent to get device and browser info
      const parser = new UAParser(logEntry.userAgent);
      const browser = parser.getBrowser();
      const device = parser.getDevice();
      const os = parser.getOS();
      const cpu = parser.getCPU();
      
      // Format the device name with more detail
      let deviceName = 'Unknown device';
      if (device.model) {
        // Mobile device with model information
        deviceName = `${device.vendor || ''} ${device.model || ''}`.trim();
        if (device.type) {
          deviceName = `${deviceName} (${device.type})`;
        }
      } else if (os.name) {
        // Desktop/laptop with OS information
        deviceName = `${os.name} ${os.version || ''}`.trim();
        if (cpu.architecture) {
          deviceName += ` (${cpu.architecture})`;
        }
      }
      
      // Get IP address through an IP lookup service - fallback to client-side if not available
      let ipAddress = logEntry.ip || 'Unknown';
      try {
        // Try to get the IP address using a public service
        // This is a best-effort attempt - it may not work if the user blocks these requests
        const ipResponse = await fetch('https://api.ipify.org?format=json', { 
          method: 'GET',
          headers: { 'Accept': 'application/json' },
          // Use a short timeout to avoid delaying the login process
          signal: AbortSignal.timeout(3000)
        });
        
        if (ipResponse.ok) {
          const ipData = await ipResponse.json();
          if (ipData.ip) {
            ipAddress = ipData.ip;
          }
        }
      } catch (ipError) {
        console.warn('Could not fetch IP address:', ipError);
        // Continue with the login process even if IP fetch fails
      }
      
      // Create a new login history entry with enhanced information
      const historyEntry = {
        timestamp: new Date(), // Firestore Timestamp
        device: deviceName,
        browser: `${browser.name || 'Unknown'} ${browser.version || ''}`.trim(),
        ipAddress: ipAddress,
        location: 'Unknown location', // Would need geolocation service for this
        userAgent: logEntry.userAgent,
        loginMethod: logEntry.method || 'password', // Can be extended for OAuth, etc.
        successful: true,
        userId: currentUser.uid,
        userEmail: email
      };
      
      // Add to login_history subcollection
      const loginHistoryRef = collection(db, 'users', currentUser.uid, 'login_history');
      await addDoc(loginHistoryRef, historyEntry);
      console.log('Login history saved successfully');
    } catch (error) {
      console.error('Error saving login history:', error);
      // Don't re-throw - we don't want to interrupt the login flow if history logging fails
    }
  }
}
