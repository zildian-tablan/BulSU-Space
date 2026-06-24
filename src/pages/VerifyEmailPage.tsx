import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import MainLayout from '../components/layout/MainLayout';
import { EmailVerificationManager } from '../utils/emailVerificationUtils';
import { CheckCircleIcon, ExclamationCircleIcon, ArrowPathIcon } from '@heroicons/react/24/solid';

const VerifyEmailPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [verifying, setVerifying] = useState<boolean>(true);
  const [success, setSuccess] = useState<boolean>(false);
  const [message, setMessage] = useState<string>('Verifying your email...');
  const [outlookEmail, setOutlookEmail] = useState<string>('');

  useEffect(() => {
    // Extract token and userId from URL query parameters
    const queryParams = new URLSearchParams(location.search);
    const token = queryParams.get('token');
    const userId = queryParams.get('userId');

    const verifyEmail = async () => {
      if (!token || !userId) {
        setSuccess(false);
        setMessage('Invalid verification link. Missing token or user ID.');
        setVerifying(false);
        return;
      }

      try {
        // Call the verification method
        const result = await EmailVerificationManager.verifyEmailToken(token, userId);
        
        if (result.success) {
          setSuccess(true);
          setMessage('Your email has been successfully verified!');
          setOutlookEmail(result.outlookEmail || '');
          
          // If user is logged in, refresh their auth state to reflect verification
          if (currentUser) {
            await EmailVerificationManager.refreshAndCheckVerification();
          }
        } else {
          setSuccess(false);
          setMessage(result.error || 'Failed to verify email. Please try again.');
        }
      } catch (error: any) {
        console.error('Error during email verification:', error);
        setSuccess(false);
        setMessage(error?.message || 'An error occurred during verification.');
      } finally {
        setVerifying(false);
      }
    };

    verifyEmail();
  }, [location, currentUser]);

  const handleGoToDashboard = () => {
    navigate('/');
  };

  const handleGoToVerification = () => {
    navigate('/verification');
  };

  return (
    <MainLayout>
      <div className="max-w-2xl mx-auto py-12 px-4">
        <div className="bg-white shadow-md rounded-lg overflow-hidden">
          <div className="p-6">
            <h1 className="text-2xl font-semibold text-gray-800 mb-6">Email Verification</h1>
            
            <div className={`flex items-center p-4 mb-6 rounded-md ${
              verifying ? 'bg-blue-50' : 
              success ? 'bg-green-50' : 'bg-red-50'
            }`}>
              {verifying ? (
                <ArrowPathIcon className="h-8 w-8 text-blue-500 mr-3 animate-spin" />
              ) : success ? (
                <CheckCircleIcon className="h-8 w-8 text-green-500 mr-3" />
              ) : (
                <ExclamationCircleIcon className="h-8 w-8 text-red-500 mr-3" />
              )}
              <div>
                <p className={`font-medium ${
                  verifying ? 'text-blue-700' : 
                  success ? 'text-green-700' : 'text-red-700'
                }`}>
                  {verifying ? 'Verifying' : success ? 'Success' : 'Error'}
                </p>
                <p className="text-sm mt-1">
                  {message}
                </p>
                {success && outlookEmail && (
                  <p className="text-sm text-gray-600 mt-2">
                    Verified email: <span className="font-medium">{outlookEmail}</span>
                  </p>
                )}
              </div>
            </div>

            <div className="mt-8 flex flex-wrap gap-4">
              {success ? (
                <button
                  onClick={handleGoToDashboard}
                  className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
                >
                  Go to Dashboard
                </button>
              ) : (
                <button
                  onClick={handleGoToVerification}
                  className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                >
                  Go to Verification Page
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default VerifyEmailPage;
