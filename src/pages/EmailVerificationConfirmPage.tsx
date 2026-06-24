import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import MainLayout from '../components/layout/MainLayout';
import { CheckCircleIcon, ExclamationCircleIcon, ClockIcon } from '@heroicons/react/24/solid';
import { EnvelopeIcon } from '@heroicons/react/24/outline';

const EmailVerificationConfirmPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'expired'>('loading');
  const [message, setMessage] = useState<string>('');
  const [outlookEmail, setOutlookEmail] = useState<string>('');

  useEffect(() => {
    const token = searchParams.get('token');
    const userId = searchParams.get('userId');

    if (!token || !userId) {
      setStatus('error');
      setMessage('Invalid verification link. Please request a new verification email.');
      return;
    }

    verifyEmail(token, userId);
  }, [searchParams]);

  const verifyEmail = async (token: string, userId: string) => {
    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/api/email/verify-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token, userId }),
      });

      const data = await response.json();

      if (data.success) {
        setStatus('success');
        setMessage('Your email has been successfully verified!');
        setOutlookEmail(data.outlookEmail || '');
        
        // Redirect to main app after 3 seconds
        setTimeout(() => {
          navigate('/');
        }, 3000);
      } else {
        if (data.error?.includes('expired')) {
          setStatus('expired');
          setMessage('This verification link has expired. Please request a new verification email.');
        } else if (data.error?.includes('already verified')) {
          setStatus('success');
          setMessage('Your email has already been verified!');
          setTimeout(() => {
            navigate('/');
          }, 2000);
        } else {
          setStatus('error');
          setMessage(data.error || 'Verification failed. Please try again.');
        }
      }
    } catch (error) {
      console.error('Verification error:', error);
      setStatus('error');
      setMessage('Network error. Please check your connection and try again.');
    }
  };

  const handleRequestNewLink = () => {
    navigate('/verify-email');
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'loading':
        return <ClockIcon className="h-16 w-16 text-blue-500 animate-pulse" />;
      case 'success':
        return <CheckCircleIcon className="h-16 w-16 text-green-500" />;
      case 'expired':
        return <ClockIcon className="h-16 w-16 text-yellow-500" />;
      case 'error':
      default:
        return <ExclamationCircleIcon className="h-16 w-16 text-red-500" />;
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'loading':
        return 'border-blue-500/30 bg-blue-900/20';
      case 'success':
        return 'border-green-500/30 bg-green-900/20';
      case 'expired':
        return 'border-yellow-500/30 bg-yellow-900/20';
      case 'error':
      default:
        return 'border-red-500/30 bg-red-900/20';
    }
  };

  const getMessageColor = () => {
    switch (status) {
      case 'loading':
        return 'text-blue-300';
      case 'success':
        return 'text-green-300';
      case 'expired':
        return 'text-yellow-300';
      case 'error':
      default:
        return 'text-red-300';
    }
  };

  return (
    <MainLayout>
      <div className="container mx-auto px-4 py-8 min-h-screen flex items-center justify-center">
        <div className="max-w-2xl mx-auto">
          <div className={`bg-gray-900/80 backdrop-blur-lg rounded-xl border shadow-2xl p-8 text-center ${getStatusColor()}`}>
            <div className="flex flex-col items-center space-y-6">
              <div className="flex items-center justify-center">
                {getStatusIcon()}
              </div>

              <div>
                <h1 className="text-3xl font-bold text-gray-100 mb-4">
                  {status === 'loading' && 'Verifying Your Email...'}
                  {status === 'success' && 'Email Verified Successfully!'}
                  {status === 'expired' && 'Verification Link Expired'}
                  {status === 'error' && 'Verification Failed'}
                </h1>

                <p className={`text-lg mb-6 ${getMessageColor()}`}>
                  {message}
                </p>

                {outlookEmail && status === 'success' && (
                  <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-4 mb-6">
                    <div className="flex items-center justify-center gap-3">
                      <EnvelopeIcon className="h-6 w-6 text-blue-400" />
                      <div>
                        <p className="text-sm text-gray-400">Verified Email:</p>
                        <p className="text-lg font-medium text-blue-300">{outlookEmail}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {status === 'success' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-center space-x-2 text-green-300">
                    <CheckCircleIcon className="h-5 w-5" />
                    <span>You will be redirected automatically...</span>
                  </div>
                  <button
                    onClick={() => navigate('/')}
                    className="bg-green-600/60 hover:bg-green-600/80 text-white px-6 py-3 rounded-lg font-medium transition-all border border-green-500/60"
                  >
                    Go to Dashboard Now
                  </button>
                </div>
              )}

              {(status === 'expired' || status === 'error') && (
                <div className="space-y-4">
                  <button
                    onClick={handleRequestNewLink}
                    className="bg-blue-600/60 hover:bg-blue-600/80 text-white px-6 py-3 rounded-lg font-medium transition-all border border-blue-500/60"
                  >
                    Request New Verification Email
                  </button>
                  <button
                    onClick={() => navigate('/')}
                    className="bg-gray-600/60 hover:bg-gray-600/80 text-white px-6 py-3 rounded-lg font-medium transition-all border border-gray-500/60"
                  >
                    Return to Dashboard
                  </button>
                </div>
              )}

              {status === 'loading' && (
                <div className="flex items-center space-x-2 text-blue-300">
                  <div className="h-4 w-4 border-2 border-blue-300 border-t-transparent rounded-full animate-spin"></div>
                  <span>Please wait while we verify your email...</span>
                </div>
              )}
            </div>
          </div>

          <div className="mt-8 text-center">
            <div className="space-y-2 text-sm text-gray-400">
              <p>© 2025 BulSU Space - Bulacan State University</p>
              <p>If you continue to experience issues, please contact support.</p>
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default EmailVerificationConfirmPage;
