import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { ShieldExclamationIcon, TrashIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { useAuth } from '../../contexts/AuthContext';
import { userDeletionService } from '../../services/userDeletionService';
import { useNavigate } from 'react-router-dom';

interface RevokedUserModalProps {
  isOpen: boolean;
  onAcknowledge: () => void;
}

const RevokedUserModal: React.FC<RevokedUserModalProps> = ({ isOpen, onAcknowledge }) => {
  const [isDeleting, setIsDeleting] = useState(false);
  const [deletionError, setDeletionError] = useState<string | null>(null);
  const [deletionProgress, setDeletionProgress] = useState<string>('');
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  // Lock background scroll when modal open (runs even if not open yet, but only modifies when open)
  useEffect(() => {
    if (isOpen) {
      const original = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = original; };
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleAcknowledge = async () => {
    if (!currentUser) {
      console.error('No current user found');
      onAcknowledge();
      return;
    }

    // Get the Firebase User for deletion
    const firebaseUser = userDeletionService.getCurrentUser();
    if (!firebaseUser) {
      console.error('No Firebase user found');
      setDeletionError('Authentication error. Please try logging in again.');
      return;
    }

    setIsDeleting(true);
    setDeletionError(null);
    setDeletionProgress('Initializing account deletion...');

    try {
      // Add minimum 3-second delay for loading state
      const startTime = Date.now();
      
      // Monitor deletion progress with timeout protection
      const progressInterval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        if (elapsed > 5000) {
          setDeletionProgress('Cleaning up user data...');
        }
        if (elapsed > 10000) {
          setDeletionProgress('Removing posts and comments...');
        }
        if (elapsed > 15000) {
          setDeletionProgress('Finalizing account deletion...');
        }
        if (elapsed > 25000) {
          setDeletionProgress('Almost complete...');
        }
        if (elapsed > 35000) {
          setDeletionProgress('Taking longer than expected...');
        }
      }, 1000);
        // Set up timeout to prevent infinite loading
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          clearInterval(progressInterval);
          reject(new Error('Account deletion timed out after 30 seconds. This may be due to connectivity issues.'));
        }, 30000);
      });// Start account deletion process using Firebase User - using direct deletion method
      const deletionPromise = userDeletionService.deleteUserDirectly(firebaseUser);
      
      const deletionResult = await Promise.race([deletionPromise, timeoutPromise]);
      
      // Clear progress interval
      clearInterval(progressInterval);
      
      // Ensure minimum 3-second delay
      const elapsedTime = Date.now() - startTime;
      const remainingTime = Math.max(0, 3000 - elapsedTime);
      
      if (remainingTime > 0) {
        setDeletionProgress('Completing deletion...');
        await new Promise(resolve => setTimeout(resolve, remainingTime));
      }

      if (deletionResult.success) {
        setDeletionProgress('Account deleted successfully!');
        // Account deleted successfully, redirect to login
        setTimeout(() => {
          navigate('/login', { replace: true });
        }, 500);
      } else {
        // Handle deletion error
        clearInterval(progressInterval);
        setDeletionError(deletionResult.error || 'Failed to delete account');
        setIsDeleting(false);
        setDeletionProgress('');
      }
    } catch (error) {
      console.error('Error during account deletion:', error);
      setDeletionError(error instanceof Error ? error.message : 'An unexpected error occurred');
      setIsDeleting(false);
      setDeletionProgress('');
    }
  };

  const handleRetry = () => {
    setDeletionError(null);
    handleAcknowledge();
  };

  const handleContinueWithoutDeletion = () => {
    onAcknowledge();
  };
  if (isDeleting) {
    return ReactDOM.createPortal(
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm transition-opacity duration-300">
        <div 
          className="bg-gradient-to-br from-gray-900 via-gray-950 to-gray-900 rounded-3xl shadow-2xl border border-red-700/60 p-5 sm:p-8 md:p-10 max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto transform transition-all duration-300 scale-100 relative"
        >
          <div className="flex flex-col items-center space-y-6">
            {/* Loading Icon */}
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-red-500/20 to-red-600/30 border-2 border-red-400/30 flex items-center justify-center shadow-lg">
              <TrashIcon className="h-12 w-12 text-red-300 animate-pulse" />
            </div>
            
            {/* Loading Title */}
            <h2 className="text-2xl font-bold text-red-100">
              Deleting Account...
            </h2>
            
            {/* Loading Message */}
            <div className="space-y-3">
              <p className="text-red-200/90 text-lg font-medium">
                Please wait while we delete your account and all associated data.
              </p>
              {deletionProgress && (
                <p className="text-red-300/80 text-sm font-medium">
                  {deletionProgress}
                </p>
              )}
              <p className="text-red-400/70 text-xs">
                This process may take up to 40 seconds to complete.
              </p>
            </div>
            
            {/* Loading Spinner */}
            <div className="flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-300"></div>
            </div>
          </div>
        </div>
      </div>,
      document.body
    );
  }

  // Error state
  if (deletionError) {
    return ReactDOM.createPortal(
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm transition-opacity duration-300">
        <div 
          className="bg-gradient-to-br from-gray-900 via-gray-950 to-gray-900 rounded-3xl shadow-2xl border border-red-700/60 p-5 sm:p-8 md:p-10 max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto transform transition-all duration-300 scale-100 relative"
        >
          <div className="flex flex-col items-center space-y-6">
            {/* Error Icon */}
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-red-500/20 to-red-600/30 border-2 border-red-400/30 flex items-center justify-center shadow-lg">
              <ExclamationTriangleIcon className="h-12 w-12 text-red-300" />
            </div>
            
            {/* Error Title */}
            <h2 className="text-2xl font-bold text-red-100">
              Deletion Failed
            </h2>
            
            {/* Error Message */}
            <div className="space-y-3">
              <p className="text-red-200/90 text-lg font-medium">
                Failed to delete your account.
              </p>
              <p className="text-red-300/80 text-sm">
                {deletionError}
              </p>
              <p className="text-red-400/70 text-xs">
                You can try again or continue without deletion.
              </p>
            </div>
            
            {/* Action Buttons */}
            <div className="flex flex-col w-full space-y-3">
              <button
                onClick={handleRetry}
                className="w-full px-6 py-3 rounded-xl bg-gradient-to-r from-red-600/80 to-red-500/80 hover:from-red-500 hover:to-red-400 text-white font-semibold text-lg shadow-lg hover:shadow-xl transition-all duration-200 ease-in-out border border-red-400/30 focus:outline-none focus:ring-2 focus:ring-red-400/50"
              >
                Try Again
              </button>
              <button
                onClick={handleContinueWithoutDeletion}
                className="w-full px-6 py-2 rounded-xl bg-transparent hover:bg-red-800/30 text-red-300 font-medium text-base shadow-lg hover:shadow-xl transition-all duration-200 ease-in-out border border-red-500/30 focus:outline-none focus:ring-2 focus:ring-red-400/50"
              >
                Continue Without Deletion
              </button>
            </div>
          </div>
        </div>
      </div>,
      document.body
    );
  }

  // Default revoked state
  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm transition-opacity duration-300">
      <div className="bg-gradient-to-br from-gray-900 via-gray-950 to-gray-900 rounded-3xl shadow-2xl border border-red-700/60 p-5 sm:p-8 md:p-10 max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto transform transition-all duration-300 scale-100 relative">
        <div className="flex flex-col items-center space-y-6">
          {/* Icon */}
          <div className="relative h-24 w-24 mb-2 flex items-center justify-center">
            <span className="absolute inset-0 rounded-full bg-gradient-to-tr from-red-600/40 to-red-400/10 blur-2xl animate-pulse-slow" />
            <span className="absolute inset-0 rounded-full border-4 border-red-500/30 animate-spin-slow" />
            <div className="relative h-full w-full rounded-full flex items-center justify-center bg-gradient-to-br from-red-500/20 to-red-600/30 border-2 border-red-400/30 shadow-lg">
              <ShieldExclamationIcon className="h-12 w-12 text-red-300" />
            </div>
          </div>
          
          {/* Title */}
          <h2 className="text-2xl font-bold text-red-100">
            Access Permanently Revoked
          </h2>
          
          {/* Message */}
          <div className="space-y-3">
            <p className="text-red-200/90 text-lg font-medium">
              Your account access has been permanently revoked.
            </p>
            <p className="text-red-300/80 text-sm">
              Clicking "Acknowledge" will permanently delete your account and all associated data from our system. This action cannot be undone.
            </p>
            <p className="text-red-400/70 text-xs font-medium mt-2">
              This includes all your posts, comments, reactions, and profile information.
            </p>
          </div>
          
          {/* Button */}
          <button
            onClick={handleAcknowledge}
            className="w-full px-6 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-lg shadow-lg shadow-red-700/30 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 animate-glow"
          >
            Acknowledge & Delete Account
          </button>
          {/* Decorative floating dots (red themed) */}
          <span className="absolute top-4 left-4 h-3 w-3 rounded-full bg-red-500/60 blur-md animate-bounce-slow" />
          <span className="absolute bottom-6 right-6 h-2 w-2 rounded-full bg-red-400/40 blur-[2px] animate-float" />
          <span className="absolute bottom-4 left-1/2 h-1.5 w-1.5 rounded-full bg-red-600/40 blur-[1px] animate-float2" />
        </div>
      </div>
    </div>,
    document.body
  );
};

export default RevokedUserModal;
