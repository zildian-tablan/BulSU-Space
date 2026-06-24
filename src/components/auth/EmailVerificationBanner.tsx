import React, { useState, useEffect } from 'react';
import { EmailVerificationManager } from '../../utils/emailVerificationUtils';
import { useAuth } from '../../contexts/AuthContext';

interface EmailVerificationBannerProps {
  onDismiss?: () => void;
}

const EmailVerificationBanner: React.FC<EmailVerificationBannerProps> = ({ onDismiss }) => {
  const { currentUser } = useAuth();
  const [isVerified, setIsVerified] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [lastSent, setLastSent] = useState<number | null>(null);
  const [outlookEmail, setOutlookEmail] = useState<string>('');  useEffect(() => {
    if (currentUser) {
      checkVerificationStatus();
      
      // Check if banner was dismissed in this session
      const dismissed = sessionStorage.getItem('emailVerificationDismissed');
      if (dismissed === 'true') {
        setIsDismissed(true);
      }

      // Load the Outlook email for display
      const loadOutlookEmail = async () => {
        try {
          const email = await EmailVerificationManager.getOutlookEmailForDisplay();
          setOutlookEmail(email);
        } catch (error) {
          console.error('Error loading Outlook email:', error);
        }
      };
      loadOutlookEmail();
    }
  }, [currentUser]);

  const checkVerificationStatus = async () => {
    try {
      const verified = await EmailVerificationManager.isEmailVerified();
      setIsVerified(verified);
    } catch (error) {
      console.error('Error checking verification status:', error);
    }
  };
  const handleResendVerification = async () => {
    setIsLoading(true);
    
    try {
      const result = await EmailVerificationManager.sendVerificationEmail();
      if (result.success) {
        setLastSent(Date.now());
        // Store in session storage to prevent spam
        sessionStorage.setItem('lastVerificationSent', Date.now().toString());
        if (result.outlookEmail) {
          setOutlookEmail(result.outlookEmail);
        }
      }
    } catch (error) {
      console.error('Failed to send verification email:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCheckVerification = async () => {
    setIsLoading(true);
    
    try {
      const verified = await EmailVerificationManager.refreshAndCheckVerification();
      setIsVerified(verified);
      
      if (verified) {
        // Auto-dismiss when verified
        handleDismiss();
      }
    } catch (error) {
      console.error('Failed to check verification status:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDismiss = () => {
    setIsDismissed(true);
    sessionStorage.setItem('emailVerificationDismissed', 'true');
    onDismiss?.();
  };

  // Check if we can send another verification email (1 minute cooldown)
  const canResend = () => {
    if (!lastSent) {
      const lastSentFromStorage = sessionStorage.getItem('lastVerificationSent');
      if (lastSentFromStorage) {
        const lastSentTime = parseInt(lastSentFromStorage);
        return Date.now() - lastSentTime > 60000; // 1 minute
      }
      return true;
    }
    return Date.now() - lastSent > 60000; // 1 minute
  };

  // Don't show if user is not signed in, email is verified, or banner is dismissed
  if (!currentUser || isVerified || isDismissed) {
    return null;
  }

  return (
    <div className="bg-yellow-600/20 border border-yellow-500/50 rounded-lg p-4 mb-4 mx-4 md:mx-6">
      <div className="flex items-start justify-between">
        <div className="flex items-start space-x-3">
          <div className="flex-shrink-0 mt-1">
            <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          </div>          <div className="flex-1">            <h3 className="text-sm font-medium text-yellow-200">
              Email Verification Required
            </h3>
            <p className="mt-1 text-sm text-yellow-300">
              Please verify your BulSU Outlook email{outlookEmail && ` (${outlookEmail})`} to ensure account security and receive important notifications.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={handleResendVerification}
                disabled={isLoading || !canResend()}
                className={`text-sm font-medium px-3 py-1 rounded transition-colors ${
                  canResend() && !isLoading
                    ? 'bg-yellow-500/20 text-yellow-200 hover:bg-yellow-500/30 border border-yellow-500/50'
                    : 'bg-gray-600/50 text-gray-400 cursor-not-allowed border border-gray-500/50'
                }`}
              >
                {isLoading ? 'Sending...' : canResend() ? 'Resend Email' : 'Please wait (1 min)'}
              </button>
              <button
                onClick={handleCheckVerification}
                disabled={isLoading}
                className="text-sm font-medium px-3 py-1 rounded bg-green-500/20 text-green-200 hover:bg-green-500/30 border border-green-500/50 transition-colors disabled:opacity-50"
              >
                {isLoading ? 'Checking...' : 'I verified it'}
              </button>
              <a 
                href="/verify-email" 
                className="text-sm font-medium px-3 py-1 rounded bg-blue-500/20 text-blue-200 hover:bg-blue-500/30 border border-blue-500/50 transition-colors flex items-center gap-1"
              >
                <span className="material-icons text-xs">info</span>
                Verification Page
              </a>
            </div>
          </div>
        </div>
        <button
          onClick={handleDismiss}
          className="ml-3 flex-shrink-0 text-yellow-300 hover:text-yellow-200 transition-colors"
          aria-label="Dismiss"
        >
          <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default EmailVerificationBanner;
