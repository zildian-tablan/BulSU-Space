import React from 'react';
import { useTutorial } from '../../contexts/TutorialContext';
import { QuestionMarkCircleIcon } from '@heroicons/react/24/outline';
import { useAuth } from '../../contexts/AuthContext';

interface TutorialTriggerProps {
  className?: string;
  onTrigger?: () => void; // Callback to close dropdown or perform other actions
}

export const TutorialTrigger: React.FC<TutorialTriggerProps> = ({ className = '', onTrigger }) => {
  const { startTutorial } = useTutorial();
  const { currentUser } = useAuth();
  
  // Hide the tutorial trigger for admin and super admin users
  const isAdminOrSuperAdmin = currentUser?.role === 'admin' || currentUser?.role === 'super admin';
  if (isAdminOrSuperAdmin) {
    return null;
  }

  const handleClick = () => {
    // Close dropdown first if callback provided
    if (onTrigger) {
      onTrigger();
    }
    
    // Start tutorial after a brief delay to allow dropdown to close
    setTimeout(() => {
      startTutorial();
    }, 100);
  };  // Check if this is being used as a dropdown item
  const isDropdownItem = className.includes('block');
  if (isDropdownItem) {
    return (
      <button
        onClick={handleClick}
        className={className}
        type="button"
        title="Start tutorial"
        style={{textAlign: 'left'}}
      >
        <span className="flex items-center gap-1.5 sm:gap-2">
          <span className="material-icons text-green-500 text-xs sm:text-sm">help_outline</span>
          <span>Tutorial</span>
        </span>
      </button>
    );
  }

  return (
    <button
      onClick={handleClick}
      className={`flex items-center space-x-2 px-3 py-2 text-sm font-medium text-gray-300 hover:text-white hover:bg-gray-700 rounded-lg transition-colors ${className}`}
      title="Start tutorial"
    >
      <QuestionMarkCircleIcon className="h-5 w-5" />
      <span className="hidden sm:inline">Tutorial</span>
    </button>
  );
};
