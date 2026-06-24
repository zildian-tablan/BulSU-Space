import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import MainLayout from '../components/layout/MainLayout';
import { EmailVerificationManager } from '../utils/emailVerificationUtils';
import { reload } from 'firebase/auth';
import { auth } from '../firebase/config';
import { CheckIcon, EnvelopeIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { CheckCircleIcon, ExclamationCircleIcon } from '@heroicons/react/24/solid';

const VerificationPage: React.FC = () => {
  const { currentUser } = useAuth();
  const [isVerified, setIsVerified] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [lastSent, setLastSent] = useState<number | null>(null);
  const [message, setMessage] = useState<string>('');
  const [status, setStatus] = useState<'success' | 'error' | 'info' | null>(null);
  const [outlookEmail, setOutlookEmail] = useState<string>('');
  // Check verification status on component mount
  useEffect(() => {
    checkEmailVerified();
    loadOutlookEmail();
  }, [currentUser]);

  // Load the user's Outlook email for display
  const loadOutlookEmail = async () => {
    if (!currentUser) {
      setOutlookEmail('Please sign in to view your outlook email');
      return;
    }
    
    try {
      const email = await EmailVerificationManager.getOutlookEmailForDisplay();
      setOutlookEmail(email);
    } catch (error) {
      console.error('Error loading Outlook email:', error);
      setOutlookEmail('Unable to generate Outlook email');
    }
  };

  // Check if email is verified
  const checkEmailVerified = async () => {
    setIsLoading(true);
    try {
      const verified = await EmailVerificationManager.refreshAndCheckVerification();
      setIsVerified(verified);      if (verified) {
        setStatus('success');
        setMessage('Your email has been successfully verified!');
      } else {
        setStatus('info');
        setMessage(`Your email has not been verified yet. Please check your BulSU Outlook inbox (${outlookEmail}) or click the button below to resend the verification email.`);
      }
    } catch (error) {
      console.error('Error checking verification status:', error);
      setStatus('error');
      setMessage('An error occurred while checking your email verification status.');
    } finally {
      setIsLoading(false);
    }
  };
  // Send verification email
  const handleSendVerificationEmail = async () => {
    if (!currentUser) {
      setStatus('error');
      setMessage('You must be signed in to request a verification email');
      return;
    }
    
    if (!canResend()) return;
    
    setIsLoading(true);
    setStatus('info');
    setMessage('Sending verification email...');
    
    try {
      const result = await EmailVerificationManager.sendVerificationEmail();
      if (result.success) {
        setLastSent(Date.now());
        setStatus('success');
        const emailToShow = result.outlookEmail || outlookEmail;
        setMessage(`Verification email sent to your BulSU Outlook email (${emailToShow})! Please check your inbox and click the verification link.`);
        if (result.outlookEmail) {
          setOutlookEmail(result.outlookEmail);
        }
      } else {
        setStatus('error');
        setMessage(`Failed to send verification email: ${result.error || 'Please try again later.'}`);
      }
    } catch (error: any) {
      console.error('Error in verification email handler:', error);
      setStatus('error');
      setMessage(`An error occurred: ${error?.message || 'Please try again later.'}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Check if we can resend the email (1 minute cooldown)
  const canResend = (): boolean => {
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

  // Calculate remaining cooldown time in seconds
  const getRemainingCooldown = (): number => {
    if (!lastSent) {
      const lastSentFromStorage = sessionStorage.getItem('lastVerificationSent');
      if (lastSentFromStorage) {
        const lastSentTime = parseInt(lastSentFromStorage);
        const remaining = Math.ceil((60000 - (Date.now() - lastSentTime)) / 1000);
        return remaining > 0 ? remaining : 0;
      }
      return 0;
    }
    
    const remaining = Math.ceil((60000 - (Date.now() - lastSent)) / 1000);
    return remaining > 0 ? remaining : 0;
  };

  return (
    <MainLayout>
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-3xl mx-auto">
          <div className="bg-gray-900/80 backdrop-blur-lg rounded-xl border border-green-700/30 shadow-2xl shadow-green-500/20 p-6 md:p-8">
            <h1 className="text-2xl md:text-3xl font-bold text-gray-100 mb-6 flex items-center gap-3">
              <EnvelopeIcon className="h-8 w-8 text-green-500" />
              Email Verification
            </h1>
            
            <div className={`p-4 mb-6 rounded-lg flex gap-4 items-start ${
              status === 'success' ? 'bg-green-900/30 border border-green-600/40' : 
              status === 'error' ? 'bg-red-900/30 border border-red-600/40' : 
              'bg-gray-800/50 border border-gray-700/40'
            }`}>
              <div className="mt-0.5">
                {status === 'success' ? (
                  <CheckCircleIcon className="h-5 w-5 text-green-500" />
                ) : status === 'error' ? (
                  <ExclamationCircleIcon className="h-5 w-5 text-red-500" />
                ) : (
                  <EnvelopeIcon className="h-5 w-5 text-gray-400" />
                )}
              </div>
              <div className="flex-1">
                <p className={`text-sm ${
                  status === 'success' ? 'text-green-300' : 
                  status === 'error' ? 'text-red-300' : 
                  'text-gray-300'
                }`}>
                  {message}
                </p>
              </div>
            </div>

            <div className="bg-gray-800/40 rounded-lg p-6 mb-8">
              <h2 className="text-xl font-semibold text-green-400 mb-4">Your BulSU Outlook Email</h2>
              <div className="bg-gray-900/60 border border-gray-700/50 rounded-lg p-4 mb-4">
                <div className="flex items-center gap-3">
                  <EnvelopeIcon className="h-6 w-6 text-blue-400" />
                  <div>
                    <p className="text-sm text-gray-400 mb-1">Verification emails will be sent to:</p>
                    <p className="text-lg font-medium text-blue-300">
                      {outlookEmail || 'Loading...'}
                    </p>
                  </div>
                </div>
              </div>
              <p className="text-sm text-gray-400">
                This email is automatically generated from your student ID number for use with the university's Outlook system.
              </p>
            </div>

            <div className="bg-gray-800/40 rounded-lg p-6 mb-8">
              <h2 className="text-xl font-semibold text-green-400 mb-4">Verification Status</h2>
              <div className="flex items-center gap-3 mb-6">
                <div className={`h-10 w-10 rounded-full flex items-center justify-center ${
                  isVerified ? 
                    'bg-green-500/20 text-green-400 border border-green-500/40' :
                    'bg-gray-700/50 text-gray-400 border border-gray-600/40'
                }`}>
                  {isVerified ? (
                    <CheckIcon className="h-5 w-5" />
                  ) : (
                    <XMarkIcon className="h-5 w-5" />
                  )}
                </div>
                <div>
                  <p className="font-medium text-gray-200">
                    {isVerified ? 'Email Verified' : 'Not Verified'}
                  </p>
                  <p className="text-sm text-gray-400">
                    {isVerified 
                      ? 'Your email has been successfully verified.' 
                      : 'Email verification enhances security and enables all account features.'}
                  </p>
                </div>
              </div>

              {!isVerified && (
                <div className="flex flex-col sm:flex-row gap-4 mt-4">
                  <button
                    onClick={handleSendVerificationEmail}
                    disabled={isLoading || !canResend()}
                    className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-all ${
                      canResend() && !isLoading
                        ? 'bg-green-600/60 hover:bg-green-600/80 text-white border border-green-500/60'
                        : 'bg-gray-700/60 text-gray-400 cursor-not-allowed border border-gray-600/60'
                    }`}
                  >
                    {isLoading ? (
                      <>
                        <div className="h-4 w-4 border-2 border-gray-300 border-t-transparent rounded-full animate-spin"></div>
                        <span>Processing...</span>
                      </>
                    ) : canResend() ? (
                      <>
                        <EnvelopeIcon className="h-4 w-4" />
                        <span>Send Verification Email</span>
                      </>
                    ) : (
                      <>
                        <span>Wait {getRemainingCooldown()}s</span>
                      </>
                    )}
                  </button>
                  
                  <button
                    onClick={checkEmailVerified}
                    disabled={isLoading}
                    className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-all
                      ${isLoading 
                        ? 'bg-gray-700/60 text-gray-400 cursor-not-allowed border border-gray-600/60' 
                        : 'bg-blue-600/60 hover:bg-blue-600/80 text-white border border-blue-500/60'
                      }`}
                  >
                    {isLoading ? (
                      <>
                        <div className="h-4 w-4 border-2 border-gray-300 border-t-transparent rounded-full animate-spin"></div>
                        <span>Checking...</span>
                      </>
                    ) : (
                      <>
                        <CheckIcon className="h-4 w-4" />
                        <span>Check Verification Status</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>

            <div className="border-t border-gray-700/50 pt-6">
              <h2 className="text-lg font-semibold text-gray-200 mb-4">About Email Verification</h2>
              <div className="space-y-4 text-sm text-gray-400">                <p>
                  Email verification is an important security measure that helps protect your account 
                  and ensures that you have access to your BulSU Outlook email address.
                </p>
                <p>
                  Verification emails are sent to your university Outlook email ({outlookEmail}). 
                  After clicking the verification link in your email, you may need to click the 
                  "Check Verification Status" button above to update your status.
                </p>
                <p>
                  If you don't see the verification email in your Outlook inbox, please check your spam 
                  or junk folder. You can also request a new verification email after 60 seconds.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default VerificationPage;
