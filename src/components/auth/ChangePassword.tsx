import handleChangePassword from 'helpers/handleChangePassword';
import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { showConfirmDialog } from 'utils/modal/showConfirmDialog'; // add this import at the top


const ChangePassword: React.FC = () => {

  const navigate = useNavigate();
  const location = useLocation();

  const [formData, setFormData] = useState({
    newPassword: '',
    confirmPassword: ''
  });
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [passwordStrength, setPasswordStrength] = useState({
    score: 0,
    feedback: ''
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));

    // Check password strength
    if (name === 'newPassword') {
      checkPasswordStrength(value);
    }
  };

  const checkPasswordStrength = (password: string) => {
    let score = 0;
    let feedback = '';

    if (password.length >= 8) score += 1;
    if (/[A-Z]/.test(password)) score += 1;
    if (/[a-z]/.test(password)) score += 1;
    if (/[0-9]/.test(password)) score += 1;
    if (/[^A-Za-z0-9]/.test(password)) score += 1;

    switch (score) {
      case 0:
      case 1:
        feedback = 'Very Weak';
        break;
      case 2:
        feedback = 'Weak';
        break;
      case 3:
        feedback = 'Fair';
        break;
      case 4:
        feedback = 'Strong';
        break;
      case 5:
        feedback = 'Very Strong';
        break;
      default:
        feedback = '';
    }

    setPasswordStrength({ score, feedback });
  };

  const validateForm = (): boolean => {
    if (passwordStrength.feedback !== 'Fair' &&
        passwordStrength.feedback !== 'Strong' &&
        passwordStrength.feedback !== 'Very Strong') {
      setError('Password is weak');
      return false;
    }

    if (!formData.newPassword) {
      setError('Please enter a new password');
      return false;
    }

    if (formData.newPassword.length < 8) {
      setError('New password must be at least 8 characters long');
      return false;
    }

    if (formData.newPassword !== formData.confirmPassword) {
      setError('New passwords do not match');
      return false;
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (!validateForm()) return;

    setIsLoading(true);

    try {
      await new Promise(resolve => setTimeout(resolve, 1500));

      const passwordChangeResult = await handleChangePassword(formData);

      if (passwordChangeResult === 'token_expired') {
        setError('Failed to change password. Token Expired');
        return
      }

      if (passwordChangeResult === 'fail') {
        setError('Failed to change password');
        return
      }

      setMessage('Your password has been changed successfully!');
      setFormData({
        newPassword: '',
        confirmPassword: ''
      });
      setPasswordStrength({ score: 0, feedback: '' });

      await showConfirmDialog({
        title: "Success",
        message: "Your password has been changed successfully!",
        confirmLabel: "OK",
        confirmTone: "primary",
        headerTone: "primary",
        onConfirm: () => {
          // optional: you can navigate after user clicks OK
          navigate('/signin');
        }
      });

      navigate('/signin')
    } catch (err) {
      setError('Failed to change password. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const getPasswordStrengthColor = () => {
    switch (passwordStrength.score) {
      case 0:
      case 1:
        return 'bg-red-500';
      case 2:
        return 'bg-orange-500';
      case 3:
        return 'bg-yellow-500';
      case 4:
        return 'bg-green-500';
      case 5:
        return 'bg-green-600';
      default:
        return 'bg-gray-500';
    }
  };

  const getPasswordStrengthTextColor = () => {
    switch (passwordStrength.score) {
      case 0:
      case 1:
        return 'text-red-400';
      case 2:
        return 'text-orange-400';
      case 3:
        return 'text-yellow-400';
      case 4:
        return 'text-green-400';
      case 5:
        return 'text-green-300';
      default:
        return 'text-gray-400';
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-green-950 to-green-900 relative overflow-hidden py-12 px-4 sm:px-6 lg:px-8">
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
            Change Password
          </h2>
          <p className="mt-2 text-sm text-gray-400 animate-fadeInSlow">
            Update your password to keep your account secure
          </p>
        </div>

        {message && (
          <div className="bg-green-500/20 border border-green-500/50 text-green-300 px-4 py-3 rounded relative" role="alert">
            <div className="flex items-start">
              <svg className="h-5 w-5 text-green-400 mr-2 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="block text-sm">{message}</span>
            </div>
          </div>
        )}

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

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="newPassword" className="block text-sm font-medium text-gray-300 mb-1">
              New Password
            </label>
            <input
              id="newPassword"
              name="newPassword"
              type="password"
              autoComplete="new-password"
              required
              value={formData.newPassword}
              onChange={handleChange}
              className="appearance-none relative block w-full px-3 py-3 bg-gray-800/50 border border-gray-700 placeholder-gray-500 text-gray-200 rounded-md focus:outline-none focus:ring-green-500/50 focus:border-green-500/50 focus:z-10 sm:text-sm"
              placeholder="Enter your new password"
            />
            
            {formData.newPassword && (
              <div className="mt-2 space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-gray-400">Password Strength:</span>
                  <span className={getPasswordStrengthTextColor()}>
                    {passwordStrength.feedback}
                  </span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-2">
                  <div 
                    className={`h-2 rounded-full transition-all duration-300 ${getPasswordStrengthColor()}`}
                    style={{ width: `${(passwordStrength.score / 5) * 100}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-300 mb-1">
              Confirm New Password
            </label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              value={formData.confirmPassword}
              onChange={handleChange}
              className="appearance-none relative block w-full px-3 py-3 bg-gray-800/50 border border-gray-700 placeholder-gray-500 text-gray-200 rounded-md focus:outline-none focus:ring-green-500/50 focus:border-green-500/50 focus:z-10 sm:text-sm"
              placeholder="Confirm your new password"
            />
            
            {formData.confirmPassword && (
              <div className="mt-2 flex items-center text-xs">
                {formData.newPassword === formData.confirmPassword ? (
                  <span className="text-green-400 flex items-center">
                    <svg className="h-4 w-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                    Passwords match
                  </span>
                ) : (
                  <span className="text-red-400 flex items-center">
                    <svg className="h-4 w-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Passwords do not match
                  </span>
                )}
              </div>
            )}
          </div>

          <div>
            <button
              type="submit"
              disabled={isLoading || !!message}
              className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-base font-semibold rounded-lg text-white bg-gradient-to-r from-green-600 to-green-500 hover:from-green-700 hover:to-green-600 shadow-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Changing Password...
                </>
              ) : message ? (
                'Password Changed!'
              ) : (
                'Change Password'
              )}
            </button>
          </div>

          <div className="text-center">
            <Link 
              to="/profile" 
              className="font-medium text-green-400 hover:text-green-300 transition-colors duration-200 underline underline-offset-4"
            >
              Back to Profile
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ChangePassword;
