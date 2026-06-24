import { useState, useEffect } from 'react';
import { doc, setDoc, getDoc, updateDoc, collection, addDoc, query, where, getDocs, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { SecurityLogger } from '../utils/securityUtils';
import { WebAuthnService } from './webAuthnService';

/**
 * Interface for device biometric capability detection
 */
export interface BiometricSupport {
  isAvailable: boolean;
  supportedMethods: string[];
  isEnrolled: boolean;
  error?: string;
}

/**
 * Service for handling biometric authentication
 */
export class BiometricAuthService {
  /**
   * Check if the device supports biometric authentication
   */
  static async checkBiometricSupport(): Promise<BiometricSupport> {
    try {
      // Check if PublicKeyCredential API is available (WebAuthn standard)
      if (window.PublicKeyCredential === undefined) {
        return {
          isAvailable: false,
          supportedMethods: [],
          isEnrolled: false,
          error: 'WebAuthn API is not available on this device.'
        };
      }

      // Check if the device has platform authenticator
      const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
      
      if (!available) {
        return {
          isAvailable: false,
          supportedMethods: [],
          isEnrolled: false,
          error: 'Platform authenticator is not available on this device.'
        };
      }

      // Detect specific biometric features through user agent sniffing
      // This is not ideal but helps with feature detection
      const { userAgent } = navigator;
      
      const supportedMethods: string[] = [];
      
      // iOS with FaceID/TouchID detection
      if (/iPhone|iPad/i.test(userAgent)) {
        if (/OS 11|OS 12|OS 13|OS 14|OS 15|OS 16|OS 17/i.test(userAgent)) {
          supportedMethods.push('TouchID/FaceID');
        }
      }
      
      // Android fingerprint detection
      if (/Android/i.test(userAgent)) {
        supportedMethods.push('Fingerprint');
      }
      
      // Windows Hello detection
      if (/Windows NT 10/i.test(userAgent)) {
        supportedMethods.push('Windows Hello');
      }
      
      // Fallback to generic "biometric" if we detected availability but not specific method
      if (supportedMethods.length === 0 && available) {
        supportedMethods.push('biometric');
      }

      // Additional runtime check for mobile devices since WebAuthn might report incorrectly on desktop browsers
      // Mobile devices are more likely to have proper platform authenticator implementation
      const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      
      // If we're not on a mobile device, but on Windows/Mac/Linux desktop, be more cautious about reporting availability
      if (!isMobileDevice && !/iPhone|iPad|Android/i.test(navigator.userAgent)) {
        console.log('[BiometricAuth] Non-mobile device detected, performing additional verification');
        
        // On desktop, we should be extra cautious about reporting biometric availability
        // Unless Windows Hello is specifically detected
        const isWindowsHello = /Windows NT 10/i.test(userAgent) && supportedMethods.includes('Windows Hello');
        
        if (!isWindowsHello) {
          console.warn('[BiometricAuth] Desktop device without confirmed biometric hardware, marking as unavailable');
          return {
            isAvailable: false,
            supportedMethods,
            isEnrolled: false,
            error: 'Biometric authentication is only supported on mobile devices'
          };
        }
      }

      return {
        isAvailable: available,
        supportedMethods,
        isEnrolled: false // Default to false until enrollment check is implemented
      };
    } catch (error) {
      console.error('[BiometricAuth] Error checking support:', error);
      SecurityLogger.logSecurityEvent('biometric_support_check_failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      return {
        isAvailable: false,
        supportedMethods: [],
        isEnrolled: false,
        error: error instanceof Error ? error.message : 'Failed to check biometric support'
      };
    }
  }
  /**
   * Save user's biometric authentication preference
   */
  static async saveBiometricPreference(userId: string, enabled: boolean): Promise<boolean> {
    try {
      console.log(`[BiometricAuth] Saving biometric preference for user ${userId}: ${enabled}`);
      const userPrefsRef = doc(db, 'users', userId, 'security', 'auth_preferences');
      
      // Check if document exists
      const docSnapshot = await getDoc(userPrefsRef);
      
      const timestamp = new Date();
      const deviceInfo = {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        deviceName: this.getDeviceName()
      };
      
      if (docSnapshot.exists()) {
        console.log('[BiometricAuth] Updating existing preferences document');
        await updateDoc(userPrefsRef, {
          biometricEnabled: enabled,
          biometricUpdatedAt: timestamp,
          biometricUpdatedPlatform: deviceInfo,
          lastModified: timestamp  // Add a general last modified field for tracking
        });
      } else {
        console.log('[BiometricAuth] Creating new preferences document');
        await setDoc(userPrefsRef, {
          biometricEnabled: enabled,
          biometricUpdatedAt: timestamp,
          biometricUpdatedPlatform: deviceInfo,
          mfaEmail: true, // Default values
          mfaSMS: false,
          created: timestamp,
          lastModified: timestamp
        });
      }
      
      // Verify the change was actually saved by reading it back
      const verifySnapshot = await getDoc(userPrefsRef);
      if (!verifySnapshot.exists() || verifySnapshot.data().biometricEnabled !== enabled) {
        console.error('[BiometricAuth] Preference verification failed - saved value doesn\'t match');
        return false;
      }

      SecurityLogger.logSecurityEvent('biometric_preference_updated', {
        userId,
        biometricEnabled: enabled,
        deviceInfo
      });

      console.log(`[BiometricAuth] Successfully saved biometric preference: ${enabled}`);
      return true;
    } catch (error) {
      console.error('[BiometricAuth] Error saving preference:', error);
      SecurityLogger.logSecurityEvent('biometric_preference_save_failed', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }
  /**
   * Check if user has enabled biometric authentication
   */
  static async getUserBiometricPreference(userId: string): Promise<boolean> {
    try {
      console.log(`[BiometricAuth] Getting biometric preference for user ${userId}`);
      
      // Input validation
      if (!userId || typeof userId !== 'string') {
        console.error('[BiometricAuth] Invalid user ID provided:', userId);
        return false;
      }
      
      const userPrefsRef = doc(db, 'users', userId, 'security', 'auth_preferences');
      
      // Retry mechanism for potential network issues
      let retries = 2;
      let docSnapshot;
      
      while (retries >= 0) {
        try {
          docSnapshot = await getDoc(userPrefsRef);
          break; // Success - exit loop
        } catch (fetchError) {
          if (retries === 0) throw fetchError; // Last attempt failed, rethrow
          console.warn(`[BiometricAuth] Error fetching preferences, retrying... (${retries} attempts left)`);
          retries--;
          // Small delay before retry
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      }
      
      if (docSnapshot && docSnapshot.exists()) {
        const data = docSnapshot.data();
        const isEnabled = data.biometricEnabled === true;
        console.log(`[BiometricAuth] User has biometric enabled: ${isEnabled}`);
        return isEnabled;
      }
      
      console.log('[BiometricAuth] No biometric preferences found, defaulting to disabled');
      return false; // Default to disabled if no preference set
    } catch (error) {
      console.error('[BiometricAuth] Error getting preference:', error);
      return false;
    }
  }/**
   * Register a new biometric credential for a user
   */  static async registerBiometric(userId: string, username: string): Promise<boolean> {
    try {
      console.log('[BiometricAuth] Starting biometric registration for user:', userId);
      
      // Check if WebAuthn is available
      const isAvailable = await WebAuthnService.isPlatformAuthenticatorAvailable();
      if (!isAvailable) {
        throw new Error('WebAuthn is not available on this device');
      }
      
      // First, check if user already has registered credentials to avoid duplicates
      const existingCreds = await this.getUserCredentials(userId);
      if (existingCreds.length > 0) {
        console.log('[BiometricAuth] User already has credentials, updating last used time');
        // Update last used time of existing credential
        await this.updateCredentialLastUsed(existingCreds[0].docId, userId);
        
        // Force biometric verification to ensure it's working even with existing credentials
        console.log('[BiometricAuth] Verifying existing biometric credential before proceeding');
        const verificationSuccessful = await this.authenticate(userId);
        if (!verificationSuccessful) {
          console.error('[BiometricAuth] Verification failed for existing credential');
          throw new Error('Verification of existing credential failed');
        }
        
        console.log('[BiometricAuth] Existing biometric credential verified successfully');
        SecurityLogger.logSecurityEvent('existing_biometric_verified', {
          userId,
          credentialId: existingCreds[0].credentialId,
          success: true
        });
        
        return true;
      }
      
      console.log('[BiometricAuth] No existing credentials found, initiating registration process');
      
      // Create an immediate fingerprint scan prompt through WebAuthnService
      console.log('[BiometricAuth] Prompting for biometric scan...');
      
      // Register the credential - This will trigger the fingerprint scan prompt
      const credential = await WebAuthnService.registerCredential(userId, username);
      if (!credential) {
        console.error('[BiometricAuth] No credential returned from WebAuthnService');
        throw new Error('Failed to register credential');
      }
      
      console.log('[BiometricAuth] Credential created successfully, storing in Firestore');
      // Store the credential in Firestore
      const credsCollection = collection(db, 'users', userId, 'biometric_credentials');
      const credentialDoc = await addDoc(credsCollection, {
        credentialId: credential.id,
        publicKey: credential.publicKey,
        createdAt: new Date(),
        lastUsedAt: new Date(),
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        deviceName: this.getDeviceName()
      });
      
      // Immediately verify the registered credential to ensure it works
      console.log('[BiometricAuth] Verifying newly registered credential');
      const verificationSuccessful = await this.authenticate(userId);
      
      if (!verificationSuccessful) {
        console.error('[BiometricAuth] Verification failed for new credential, removing it');
        // If verification failed, delete the credential and return false
        try {
          await deleteDoc(credentialDoc);
        } catch (deleteError) {
          console.error('[BiometricAuth] Error deleting invalid credential:', deleteError);
        }
        throw new Error('Verification of new credential failed');
      }
      
      console.log('[BiometricAuth] Registration and verification completed successfully');
      SecurityLogger.logSecurityEvent('biometric_credential_registered', {
        userId,
        success: true,
        deviceInfo: {
          userAgent: navigator.userAgent,
          platform: navigator.platform
        }
      });
      
      return true;
    } catch (error) {
      console.error('[BiometricAuth] Registration error:', error);
      SecurityLogger.logSecurityEvent('biometric_registration_failed', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }
  
  /**
   * Get a friendly device name based on user agent
   */
  private static getDeviceName(): string {
    const ua = navigator.userAgent;
    let deviceName = 'Unknown device';
    
    if (/iPhone/.test(ua)) {
      deviceName = 'iPhone';
    } else if (/iPad/.test(ua)) {
      deviceName = 'iPad';
    } else if (/Android/.test(ua)) {
      // Try to get the model name
      const match = ua.match(/Android[\s]+([\d.]+);[\s]+(.*?)(?:Build|[;)])/);
      if (match && match[2]) {
        deviceName = `Android ${match[2].trim()}`;
      } else {
        deviceName = 'Android device';
      }
    } else if (/Windows/.test(ua)) {
      deviceName = 'Windows device';
    } else if (/Mac/.test(ua)) {
      deviceName = 'Mac device';
    }
    
    return deviceName;
  }
  
  /**
   * Get user's registered biometric credentials
   */
  static async getUserCredentials(userId: string): Promise<Array<{docId: string, credentialId: string}>> {
    try {
      const credsCollection = collection(db, 'users', userId, 'biometric_credentials');
      const snapshot = await getDocs(credsCollection);
      
      if (snapshot.empty) {
        return [];
      }
      
      return snapshot.docs.map(doc => ({
        docId: doc.id,
        credentialId: doc.data().credentialId
      }));
    } catch (error) {
      console.error('[BiometricAuth] Error getting user credentials:', error);
      return [];
    }
  }
  
  /**
   * Update the lastUsedAt timestamp for a credential
   */
  static async updateCredentialLastUsed(docId: string, userId: string): Promise<boolean> {
    try {
      const credRef = doc(db, 'users', userId, 'biometric_credentials', docId);
      await updateDoc(credRef, {
        lastUsedAt: new Date()
      });
      return true;
    } catch (error) {
      console.error('[BiometricAuth] Error updating credential last used time:', error);
      return false;
    }
  }
  /**
   * Perform biometric authentication
   */
  static async authenticate(userId?: string): Promise<boolean> {
    try {
      console.log('[BiometricAuth] Starting authentication process');
      
      // Check if biometrics are supported before attempting authentication
      const support = await this.checkBiometricSupport();
      
      if (!support.isAvailable) {
        console.warn('[BiometricAuth] Biometric authentication is not available on this device');
        throw new Error('Biometric authentication is not available on this device');
      }
      
      // If no userId provided, use simulated authentication
      if (!userId) {
        console.log('[BiometricAuth] No userId provided, using simulated authentication');
        // For demo/testing without actual user - simulate success
        SecurityLogger.logSecurityEvent('biometric_auth_simulated', {
          success: true,
          platform: navigator.platform,
          methods: support.supportedMethods
        });
        return true;
      }
      
      // First check if the user has biometric authentication enabled
      const isEnabled = await this.getUserBiometricPreference(userId);
      if (!isEnabled) {
        console.log('[BiometricAuth] User has not enabled biometric authentication');
        return true; // Return true to not block the user if they haven't enabled it
      }
      
      console.log('[BiometricAuth] Fetching user credentials from Firestore');
      // Get user's registered credentials from Firestore
      const credentials = await this.getUserCredentials(userId);
      
      if (credentials.length === 0) {
        console.log('[BiometricAuth] No credentials found for user, registration needed');
        
        // If user has biometric enabled but no credentials, something is wrong
        // Let's update their preference to match reality
        await this.saveBiometricPreference(userId, false);
        
        SecurityLogger.logSecurityEvent('biometric_auth_no_credentials', {
          userId,
          action: 'disabled_preference_automatically'
        });
        
        return true; // Allow authentication to proceed since we fixed the inconsistency
      }
      
      // Extract credential IDs
      const credentialIds = credentials.map(cred => cred.credentialId);
      
      console.log('[BiometricAuth] Verifying credential with WebAuthnService');
      
      // Set up a timeout for the authentication attempt to prevent hanging indefinitely
      const timeoutDuration = 60000; // 60 seconds
      
      // Create a promise race between the verification and a timeout
      const verificationPromise = new Promise<boolean>(async (resolve) => {
        try {
          // Verify the credential
          const isVerified = await WebAuthnService.verifyCredential(credentialIds);
          
          // If verification is successful, update the last used timestamp
          if (isVerified && credentials.length > 0) {
            console.log('[BiometricAuth] Verification successful, updating last used timestamp');
            await this.updateCredentialLastUsed(credentials[0].docId, userId);
          }
          
          resolve(isVerified);
        } catch (error) {
          console.error('[BiometricAuth] Error during verification:', error);
          resolve(false);
        }
      });
      
      const timeoutPromise = new Promise<boolean>((resolve) => {
        setTimeout(() => {
          console.warn('[BiometricAuth] Authentication timed out');
          SecurityLogger.logSecurityEvent('biometric_auth_timeout', {
            userId,
            platform: navigator.platform
          });
          resolve(false);
        }, timeoutDuration);
      });
      
      // Race the verification against the timeout
      const isVerified = await Promise.race([verificationPromise, timeoutPromise]);
      
      SecurityLogger.logSecurityEvent('biometric_auth_attempt', {
        userId,
        success: isVerified,
        platform: navigator.platform,
        methods: support.supportedMethods,
        timestamp: new Date().toISOString()
      });
      
      console.log(`[BiometricAuth] Authentication ${isVerified ? 'successful' : 'failed'}`);
      return isVerified;
    } catch (error) {
      console.error('[BiometricAuth] Authentication error:', error);
      
      // Classify errors for better user experience
      let errorType = 'unknown';
      let errorMessage = 'Unknown authentication error';
      
      if (error instanceof Error) {
        errorMessage = error.message;
        if (errorMessage.includes('available')) {
          errorType = 'not_supported';
        } else if (errorMessage.includes('timeout')) {
          errorType = 'timeout';
        } else if (errorMessage.includes('cancel') || errorMessage.includes('abort')) {
          errorType = 'user_cancelled';
        }
      }
      
      SecurityLogger.logSecurityEvent('biometric_auth_failed', {
        userId,
        errorType,
        error: errorMessage,
        timestamp: new Date().toISOString()
      });
      
      return false;
    }
  }
}

/**
 * Hook for using biometric authentication in functional components
 */
export function useBiometricAuth() {
  const [isSupported, setIsSupported] = useState<boolean>(false);
  const [isEnabled, setIsEnabled] = useState<boolean>(false);
  const [supportDetails, setSupportDetails] = useState<BiometricSupport | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Check biometric support on component mount
  useEffect(() => {
    const checkSupport = async () => {
      try {
        setIsLoading(true);
        const support = await BiometricAuthService.checkBiometricSupport();
        setIsSupported(support.isAvailable);
        setSupportDetails(support);
        setIsLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to check biometric support');
        setIsSupported(false);
        setIsLoading(false);
      }
    };

    checkSupport();
  }, []);

  return { 
    isSupported, 
    supportDetails,
    isEnabled,
    setIsEnabled,
    isLoading, 
    error,
    authenticate: BiometricAuthService.authenticate,
    savePreference: BiometricAuthService.saveBiometricPreference,
    getPreference: BiometricAuthService.getUserBiometricPreference
  };
}
