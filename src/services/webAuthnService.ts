/**
 * WebAuthnService - Utility functions for working with Web Authentication API
 * 
 * This service provides a wrapper around the browser's WebAuthn API, which
 * enables fingerprint and biometric authentication.
 */

import { SecurityLogger } from '../utils/securityUtils';
import { arrayBufferToBase64, base64ToArrayBuffer } from '../utils/encodingUtils';

export interface WebAuthnCredential {
  id: string;
  publicKey: string;
  userId: string;
  createdAt: Date;
  lastUsedAt?: Date;
  deviceInfo?: {
    name?: string;
    platform?: string;
  };
}

export class WebAuthnService {
  /**
   * Check if WebAuthn is supported in the current browser
   */
  static isSupported(): boolean {
    return window.PublicKeyCredential !== undefined;
  }

  /**
   * Check if a platform authenticator is available
   */
  static async isPlatformAuthenticatorAvailable(): Promise<boolean> {
    if (!this.isSupported()) {
      return false;
    }

    try {
      return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    } catch (error) {
      console.error('[WebAuthn] Error checking platform authenticator:', error);
      return false;
    }
  }

  /**
   * Convert a browser credential to our internal format
   */
  private static convertCredential(credential: PublicKeyCredential, userId: string): WebAuthnCredential {
    const response = credential.response as AuthenticatorAttestationResponse;
    
    // Convert the credential ID and public key to base64
    const credentialIdBase64 = arrayBufferToBase64(credential.rawId);
    const publicKeyBase64 = arrayBufferToBase64(response.getPublicKey() || new ArrayBuffer(0));
    
    return {
      id: credentialIdBase64,
      publicKey: publicKeyBase64,
      userId,
      createdAt: new Date(),
      deviceInfo: {
        platform: navigator.platform
      }
    };
  }

  /**
   * Register a new credential
   */  static async registerCredential(userId: string, username: string): Promise<WebAuthnCredential | null> {
    try {
      console.log('[WebAuthn] Starting credential registration for user:', userId);
      
      // Generate random challenge
      const challenge = new Uint8Array(32);
      window.crypto.getRandomValues(challenge);
      
      // Create credential creation options with optimal settings for a smoother experience
      const publicKeyCredentialCreationOptions: PublicKeyCredentialCreationOptions = {
        challenge,
        rp: {
          name: 'BulSU Space',
          id: window.location.hostname
        },
        user: {
          id: Uint8Array.from(userId, c => c.charCodeAt(0)),
          name: username,
          displayName: username
        },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },  // ES256 - preferred for better compatibility
          { type: 'public-key', alg: -257 } // RS256 - fallback
        ],
        timeout: 120000, // Increased timeout to give more time for the user to interact
        attestation: 'none', // No attestation needed for better privacy
        authenticatorSelection: {
          authenticatorAttachment: 'platform', // Use device built-in authenticator (fingerprint)
          userVerification: 'required', // Force fingerprint verification
          requireResidentKey: false // Don't require resident key for better compatibility
        }
      };
      
      console.log('[WebAuthn] Prompting for biometric credential creation...');
      
      // Log event before showing prompt to help with troubleshooting timing issues
      SecurityLogger.logSecurityEvent('webauthn_prompt_displayed', {
        userId,
        timestamp: new Date().toISOString(),
        authenticatorType: 'platform',
        userAgent: navigator.userAgent
      });
      
      // Create the credential - this will trigger the fingerprint prompt
      const credential = await navigator.credentials.create({
        publicKey: publicKeyCredentialCreationOptions
      }) as PublicKeyCredential;
      
      if (!credential) {
        console.error('[WebAuthn] No credential returned after registration prompt');
        throw new Error('No credential was created. Please try again.');
      }
      
      console.log('[WebAuthn] Credential created successfully:', credential);
      
      // Convert and return the credential
      const webAuthnCredential = this.convertCredential(credential, userId);
      
      SecurityLogger.logSecurityEvent('webauthn_credential_created', {
        userId,
        credentialId: webAuthnCredential.id,
        timestamp: new Date().toISOString(),
        deviceInfo: {
          platform: navigator.platform,
          userAgent: navigator.userAgent
        }
      });
      
      return webAuthnCredential;
    } catch (error) {
      console.error('[WebAuthn] Error registering credential:', error);
      
      // Classify errors for better user experience
      let errorType = 'unknown';
      let errorMessage = 'Unknown registration error';
      
      if (error instanceof Error) {
        errorMessage = error.message;
        
        // DOMException handling for specific WebAuthn errors
        if (error.name === 'NotAllowedError') {
          errorType = 'user_cancelled';
          errorMessage = 'Registration was cancelled by the user or the device';
        } else if (error.name === 'AbortError') {
          errorType = 'user_cancelled';
          errorMessage = 'Registration was aborted';
        } else if (error.name === 'TimeoutError') {
          errorType = 'timeout';
          errorMessage = 'Registration timed out';
        } else if (error.name === 'NotSupportedError') {
          errorType = 'not_supported';
          errorMessage = 'This authentication method is not supported by your browser or device';
        } else if (error.name === 'SecurityError') {
          errorType = 'security_error';
          errorMessage = 'Security error occurred during registration';
        } else if (error.name === 'ConstraintError') {
          errorType = 'constraint_error';
          errorMessage = 'The device cannot register more credentials';
        }
      }
      
      SecurityLogger.logSecurityEvent('webauthn_registration_error', {
        userId,
        errorType,
        errorName: error instanceof Error ? error.name : 'Unknown',
        error: errorMessage,
        timestamp: new Date().toISOString()
      });
      
      // Re-throw with more descriptive message
      throw new Error(errorMessage);
    }
  }
  /**
   * Verify a credential
   */
  static async verifyCredential(credentialIds: string[]): Promise<boolean> {
    try {
      console.log('[WebAuthn] Starting credential verification');
      
      if (!credentialIds || credentialIds.length === 0) {
        console.error('[WebAuthn] No credentials provided for verification');
        throw new Error('No credentials available for verification');
      }
      
      // Generate random challenge
      const challenge = new Uint8Array(32);
      window.crypto.getRandomValues(challenge);
      
      // Create credential request options
      const publicKeyCredentialRequestOptions: PublicKeyCredentialRequestOptions = {
        challenge,
        timeout: 90000, // Increased timeout for better user experience
        rpId: window.location.hostname, // Explicit relying party ID
        allowCredentials: credentialIds.map(id => ({
          id: base64ToArrayBuffer(id),
          type: 'public-key'
        })),
        userVerification: 'required' // This ensures biometric verification is required
      };
      
      console.log('[WebAuthn] Prompting for biometric verification...');
      
      // Log event before showing prompt to help with troubleshooting timing issues
      SecurityLogger.logSecurityEvent('webauthn_verification_prompt_displayed', {
        credentialIds,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent
      });
      
      // Get the credential - this will trigger the fingerprint prompt immediately
      const credential = await navigator.credentials.get({
        publicKey: publicKeyCredentialRequestOptions
      });
      
      // If we got a credential, consider it verified
      if (credential) {
        console.log('[WebAuthn] Credential verified successfully');
        SecurityLogger.logSecurityEvent('webauthn_credential_verified', {
          credentialId: credential.id,
          timestamp: new Date().toISOString(),
          userAgent: navigator.userAgent
        });
        return true;
      }
      
      console.warn('[WebAuthn] Verification completed but no credential was returned');
      SecurityLogger.logSecurityEvent('webauthn_verification_empty_response', {
        credentialIds,
        timestamp: new Date().toISOString()
      });
      return false;
    } catch (error) {
      console.error('[WebAuthn] Error verifying credential:', error);
      
      // Classify errors for better user experience
      let errorType = 'unknown';
      let errorMessage = 'Unknown verification error';
      
      if (error instanceof Error) {
        errorMessage = error.message;
        
        // DOMException handling for specific WebAuthn errors
        if (error.name === 'NotAllowedError') {
          errorType = 'user_cancelled';
          errorMessage = 'Verification was cancelled by the user or the device';
        } else if (error.name === 'AbortError') {
          errorType = 'user_cancelled';
          errorMessage = 'Verification was aborted';
        } else if (error.name === 'TimeoutError') {
          errorType = 'timeout';
          errorMessage = 'Verification timed out';
        } else if (error.name === 'NotSupportedError') {
          errorType = 'not_supported';
          errorMessage = 'This authentication method is not supported by your browser or device';
        } else if (error.name === 'SecurityError') {
          errorType = 'security_error';
          errorMessage = 'Security error occurred during verification';
        } else if (error.name === 'InvalidStateError') {
          errorType = 'invalid_state';
          errorMessage = 'The authenticator is in an invalid state. Try restarting your browser.';
        }
      }
      
      SecurityLogger.logSecurityEvent('webauthn_verification_error', {
        errorType,
        errorName: error instanceof Error ? error.name : 'Unknown',
        error: errorMessage,
        credentialIds,
        timestamp: new Date().toISOString()
      });
      
      return false;
    }
  }
}
