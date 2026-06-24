import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../../firebase/config';
import { SecurityManager, SecurityLogger } from '../../utils/securityUtils';
import { getFunctions, httpsCallable } from 'firebase/functions';
import app from '../../firebase/config';

const functions = getFunctions(app);
const generateResetPasswordRequest = httpsCallable(functions, "generateResetPasswordRequest");

const ForgotPassword: React.FC = () => {

  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [cooldownTime, setCooldownTime] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    // Check for cooldown
    const lastReset = localStorage.getItem('lastPasswordReset');
    if (lastReset) {
      const timeSinceLastReset = Date.now() - parseInt(lastReset);
      const cooldownPeriod = 5 * 60 * 1000; // 5 minutes
      
      if (timeSinceLastReset < cooldownPeriod) {
        const remainingTime = Math.ceil((cooldownPeriod - timeSinceLastReset) / 1000);
        setCooldownTime(remainingTime);
        
        const interval = setInterval(() => {
          setCooldownTime(prev => {
            if (prev <= 1) {
              clearInterval(interval);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
        
        return () => clearInterval(interval);
      }
    }
  }, []);

  const validateEmail = (email: string): boolean => {
    // Format email if needed
    let formattedEmail = email.trim();
      if (!formattedEmail.includes('@')) {
      // Convert ID number to email format
      if (/^\d{4}-?\d{6}$|^\d{10}$/.test(formattedEmail)) {
        formattedEmail = `${formattedEmail.replace(/-/g, '')}@bulsuspace.com`;
        setEmail(formattedEmail);
        return true;
      }
      return false;
    }
    
    if (formattedEmail.includes('@bulsu.edu.ph')) {
      formattedEmail = formattedEmail.replace('@bulsu.edu.ph', '@bulsuspace.com');
      setEmail(formattedEmail);
    }
    
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formattedEmail);
  };


const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  
  if (cooldownTime > 0) {
    setError(`Please wait ${Math.ceil(cooldownTime / 60)} minutes before requesting another reset.`);
    return;
  }
  
  if (!validateEmail(email)) {
    setError('Please enter a valid email address or ID number.');
    return;
  }

  // Check if account is locked
  const isLocked = await SecurityManager.isAccountLocked(email);
  if (isLocked) {
    const remainingTime = await SecurityManager.getLockoutTimeRemaining(email);
    setError(`Account is temporarily locked. Please try again in ${remainingTime}.`);
    return;
  }
  
  setIsLoading(true);
  setError('');
  setMessage('');
  
  try {

    const response = await generateResetPasswordRequest({ email });
    const data = response.data as { success: boolean; message?: string };

    if (!data.success) {
      throw new Error(data.message || "Failed to generate reset password request");
    }

    // Log security event
    SecurityLogger.logSecurityEvent('password_reset_requested', {
      email,
      ipAddress: 'unknown', // You can implement IP detection
      timestamp: Date.now()
    });

    // Set cooldown
    localStorage.setItem('lastPasswordReset', Date.now().toString());
    setCooldownTime(300); // 5 minutes

    setMessage(
      'Password reset link generated! Please check your inbox and follow the instructions. ' +
      "If you don't see the email, check your spam folder."
    );

    // Auto-redirect after 10 seconds
    setTimeout(() => {
      navigate('/signin');
    }, 10000);

  } catch (error: any) {
    console.error('Password reset error:', error);

    SecurityLogger.logSecurityEvent('password_reset_failed', {
      email,
      error: error.message || 'unknown_error',
      timestamp: Date.now()
    });

    if (error.message?.includes("auth/user-not-found")) {
      setError("No account found with this email address.");
    } else if (error.message?.includes("auth/invalid-email")) {
      setError("Invalid email address format.");
    } else {
      setError(error.message || "An error occurred. Please try again later.");
    }

  } finally {
    setIsLoading(false);
  }
};


  const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-green-950 to-green-900 relative overflow-hidden py-12 px-4 sm:px-6 lg:px-8">
      {/* Decorative blurred shapes */}
      <div className="absolute top-0 left-0 w-72 h-72 bg-green-600/20 rounded-full blur-3xl -z-10 animate-pulse" />
      <div className="absolute bottom-0 right-0 w-80 h-80 bg-green-400/10 rounded-full blur-3xl -z-10 animate-pulse" />
      
      <div className="max-w-md w-full space-y-8 shadow-2xl rounded-2xl bg-gray-900/80 backdrop-blur-md p-8 border border-gray-800/60">
        <div className="text-center">
          <img
            className="mx-auto h-24 w-auto drop-shadow-[0_0_20px_rgba(34,197,94,0.5)] animate-fadeIn"
            src="/images/bulsu-space-logo.png"
            alt="BulSU Space Logo"
          />
          <h2 className="mt-6 text-3xl font-extrabold text-white tracking-tight animate-fadeIn">
            Reset Your Password
          </h2>
          <p className="mt-2 text-sm text-gray-400 animate-fadeInSlow">
            Enter your email address and we'll send you a link to reset your password.
          </p>
        </div>

        {/* Success Message */}
        {message && (
          <div className="bg-green-500/20 border border-green-500/50 text-green-300 px-4 py-3 rounded relative" role="alert">
            <div className="flex items-start">
              <svg className="h-5 w-5 text-green-400 mr-2 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <span className="block text-sm">{message}</span>
                <span className="block text-xs text-green-400 mt-1">
                  Redirecting to sign in page in 10 seconds...
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="bg-red-500/20 border border-red-500/50 text-red-300 px-4 py-3 rounded relative" role="alert">
            <div className="flex items-start">
              <svg className="h-5 w-5 text-red-400 mr-2 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="block text-sm">{error}</span>
            </div>
          </div>
        )}

        {/* Cooldown Warning */}
        {cooldownTime > 0 && (
          <div className="bg-yellow-500/20 border border-yellow-500/50 text-yellow-300 px-4 py-3 rounded relative" role="alert">
            <div className="flex items-center">
              <svg className="h-5 w-5 text-yellow-400 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L5.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <div>
                <span className="block text-sm font-medium">Cooldown Active</span>
                <span className="block text-xs">
                  Next reset available in: {formatTime(cooldownTime)}
                </span>
              </div>
            </div>
          </div>
        )}

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-1">
              Email Address or ID Number
            </label>
            <input
              id="email"
              name="email"
              type="text"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => validateEmail(email)}
              className="appearance-none relative block w-full px-3 py-3 bg-gray-800/50 border border-gray-700 placeholder-gray-500 text-gray-200 rounded-md focus:outline-none focus:ring-green-500/50 focus:border-green-500/50 focus:z-10 sm:text-sm"
              placeholder="Enter your email or ID number"
            />
          </div>

          <div>
            <button
              type="submit"
              disabled={isLoading || cooldownTime > 0 || !!message}
              className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-base font-semibold rounded-lg text-white bg-gradient-to-r from-green-600 to-green-500 hover:from-green-700 hover:to-green-600 shadow-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Sending Reset Email...
                </>
              ) : cooldownTime > 0 ? (
                `Wait ${formatTime(cooldownTime)}`
              ) : message ? (
                'Email Sent!'
              ) : (
                'Send Reset Email'
              )}
            </button>
          </div>

          <div className="text-center">
            <Link 
              to="/signin" 
              className="font-medium text-green-400 hover:text-green-300 transition-colors duration-200 underline underline-offset-4"
            >
              Back to Sign In
            </Link>
          </div>
        </form>

        {/* Security Notice */}
        <div className="mt-6 p-4 bg-blue-900/20 border border-blue-800 rounded-lg">
          <div className="flex items-start">
            <svg className="h-5 w-5 text-blue-400 mr-2 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="text-blue-300 text-xs">
              <p className="font-medium mb-1">Security Notice:</p>
              <ul className="space-y-1">
                <li>• Password reset links expire in 1 hour</li>
                <li>• Only one reset request per 5 minutes</li>
                <li>• Check your spam folder if email doesn't arrive</li>
                <li>• Contact support if you continue having issues</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;
