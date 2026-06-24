import { sendEmailVerification, reload } from 'firebase/auth';
import { auth, db } from '../firebase/config';
import { doc, getDoc } from 'firebase/firestore';

/**
 * Email verification utilities
 */
export class EmailVerificationManager {
  private static API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';
  /**
   * Generate Outlook email from user's ID number
   */
  static async generateOutlookEmail(): Promise<string | null> {
    try {
      const user = auth.currentUser;
      if (!user) {
        console.log('No user is currently signed in - cannot generate Outlook email');
        return null;
      }

      // Try to get the user's ID number from Firestore first
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (userDoc.exists() && userDoc.data().idNumber) {
        const idNumber = userDoc.data().idNumber;
        const cleanIdNumber = idNumber.replace(/^[A-Z]-/, '').replace(/-/g, '');
        return `${cleanIdNumber}@ms.bulsu.edu.ph`;
      }

      // If we couldn't get it from Firestore, try the API
      try {
        const response = await fetch(`${this.API_BASE_URL}/api/email/outlook-preview/${user.uid}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        const data = await response.json();
        
        if (data.success) {
          return data.outlookEmail;
        } else {
          throw new Error(data.error || 'Failed to generate Outlook email');
        }
      } catch (apiError) {
        console.error('API error, falling back to static implementation:', apiError);
        // Try to extract ID number from display name or email if available
        const userProfile = await getDoc(doc(db, 'users', user.uid));
        if (userProfile.exists()) {
          const data = userProfile.data();
          if (data.idNumber) {
            const cleanIdNumber = data.idNumber.replace(/^[A-Z]-/, '').replace(/-/g, '');
            return `${cleanIdNumber}@ms.bulsu.edu.ph`;
          }
        }
        // Last resort fallback - if we can't get the actual ID number
        return `student-${user.uid.substring(0, 8)}@ms.bulsu.edu.ph`;
      }
    } catch (error) {
      console.error('Error generating Outlook email:', error);
      return 'student@ms.bulsu.edu.ph'; // Provide a fallback value
    }
  }

  /**
   * Send verification email to user's Outlook email
   */
  static async sendVerificationEmail(): Promise<{ success: boolean; outlookEmail?: string; error?: string }> {
    try {
      const user = auth.currentUser;
      if (!user) {
        console.log('No user is currently signed in, cannot send verification email');
        return { 
          success: false, 
          error: 'Please sign in to request a verification email' 
        };
      }

      // Check current verification status first
      const currentStatus = await this.getVerificationStatus();
      if (currentStatus?.isVerified) {
        console.log('Email is already verified');
        return { success: true };
      }

      try {
        const response = await fetch(`${this.API_BASE_URL}/api/email/send-verification`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            userId: user.uid
          }),
        });

        const data = await response.json();

        if (data.success) {
          console.log(`Verification email sent to Outlook: ${data.outlookEmail}`);
          return { success: true, outlookEmail: data.outlookEmail };
        } else {
          console.warn('Server returned error when sending verification email:', data.error);
          return { 
            success: false, 
            outlookEmail: data.outlookEmail, 
            error: data.error || 'Failed to send verification email' 
          };
        }
      } catch (apiError) {
        console.error('Network or API error:', apiError);
        return { 
          success: false, 
          error: 'Network error when contacting server. Please try again later.' 
        };
      }
    } catch (error: any) {
      console.error('Error in verification process:', error);
      return { 
        success: false, 
        error: error?.message || 'An unknown error occurred during verification' 
      };
    }
  }

  /**
   * Get verification status from server
   */
  static async getVerificationStatus(): Promise<{ isVerified: boolean; verification?: any } | null> {
    try {
      const user = auth.currentUser;
      if (!user) return null;

      const response = await fetch(`${this.API_BASE_URL}/api/email/verification-status/${user.uid}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();
      
      if (data.success) {
        return {
          isVerified: data.isVerified,
          verification: data.verification
        };
      }
      
      return null;
    } catch (error) {
      console.error('Error getting verification status:', error);
      return null;
    }
  }
  /**
   * Check if current user's email is verified
   */
  static async isEmailVerified(): Promise<boolean> {
    try {
      const status = await this.getVerificationStatus();
      return status?.isVerified || false;
    } catch (error) {
      console.error('Error checking verification status:', error);
      return false;
    }
  }

  /**
   * Refresh user and check verification status
   */
  static async refreshAndCheckVerification(): Promise<boolean> {
    try {
      const user = auth.currentUser;
      if (!user) return false;

      // First reload Firebase user
      await reload(user);
      
      // Then check server verification status
      const status = await this.getVerificationStatus();
      return status?.isVerified || user.emailVerified || false;
    } catch (error) {
      console.error('Error refreshing user verification status:', error);
      return false;
    }
  }

  /**
   * Get verification status message
   */
  static async getVerificationMessage(): Promise<string> {
    const user = auth.currentUser;
    if (!user) return 'No user signed in';
    
    const isVerified = await this.isEmailVerified();
    if (isVerified) {
      return 'Email verified ✓';
    } else {
      return 'Email not verified - Check your Outlook inbox or click to resend verification email';
    }
  }

  /**
   * Get user's Outlook email for display purposes
   */
  static async getOutlookEmailForDisplay(): Promise<string> {
    try {
      const user = auth.currentUser;
      if (!user) {
        console.log('No user is signed in - returning placeholder email');
        return 'Please sign in to view your outlook email';
      }
      
      const outlookEmail = await this.generateOutlookEmail();
      return outlookEmail || 'Unable to generate Outlook email';
    } catch (error) {
      console.error('Error getting Outlook email for display:', error);
      return 'Unable to generate Outlook email';
    }
  }

  /**
   * Verify email token
   */
  static async verifyEmailToken(token: string, userId: string): Promise<{ 
    success: boolean; 
    outlookEmail?: string; 
    error?: string 
  }> {
    try {
      const response = await fetch(`${this.API_BASE_URL}/api/email/verify-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token, userId }),
      });

      const data = await response.json();
      
      if (data.success) {
        // If verification was successful, also reload the current user if available
        const user = auth.currentUser;
        if (user) {
          try {
            // Reload the user to get the latest emailVerified status
            await reload(user);
          } catch (reloadError) {
            console.warn('Could not reload user after verification:', reloadError);
          }
        }
        
        return {
          success: true,
          outlookEmail: data.outlookEmail
        };
      } else {
        return {
          success: false,
          error: data.error || 'Failed to verify email'
        };
      }
    } catch (error: any) {
      console.error('Error verifying email token:', error);
      return {
        success: false,
        error: error?.message || 'Network error when verifying email'
      };
    }
  }
}

/**
 * Email verification component props
 */
export interface EmailVerificationBannerProps {
  onResendClick?: () => void;
  onDismiss?: () => void;
}
