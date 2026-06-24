import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { useNavigate } from 'react-router-dom';
import { getUserTutorialStatus, markTutorialAsCompleted } from '../services/tutorialService';

interface TutorialStep {
  id: string;
  title: string;
  description: string;
  target: string;
  position: 'top' | 'bottom' | 'left' | 'right';
  navigateTo?: string; // Optional URL to navigate to for this step
  showOnMobile?: boolean;
  showOnDesktop?: boolean;
}

interface TutorialContextType {
  isActive: boolean;
  currentStep: number;
  steps: TutorialStep[];
  startTutorial: () => void;
  nextStep: () => void;
  prevStep: () => void;
  skipTutorial: () => void;
  completeTutorial: () => void;
  isStepActive: (stepId: string) => boolean;
  isNavigating: boolean;
  transitionDirection: 'next' | 'prev';
  // Flag that becomes true right after the user finishes or skips the tutorial (single-use)
  justCompleted: boolean;
  clearCompletionFlag: () => void;
}

const TutorialContext = createContext<TutorialContextType | undefined>(undefined);

const TUTORIAL_STEPS: TutorialStep[] = [
  // Home Page Tutorial Steps
  {
    id: 'navbar',
    title: 'Navigation Bar',
    description: 'This is your main navigation bar. Here you can access pages, search, and your profile menu.',
    target: '[data-tutorial="navbar"]',
    position: 'bottom',
    showOnMobile: true,
    showOnDesktop: true,
  },
  {
    id: 'sidebar',
    title: 'Sidebar Navigation',
    description: 'The sidebar provides quick access to different sections like Academic Calendar, Upcoming Events, and more. Use it to navigate around the platform.',
    target: '[data-tutorial="sidebar"]',
    position: 'right',
    showOnMobile: false,
    showOnDesktop: true,
  },
  
  
  // Events Page
  {
    id: 'events-page',
    title: 'Events Page',
    description: 'The Events page allows you to discover, join, and create academic events. Let\'s explore this feature.',
    target: 'body',
    position: 'bottom',
    navigateTo: '/events',
    showOnMobile: true,
    showOnDesktop: true,
  },

  // Spaces (Groups) Page
  {
    id: 'groups-page',
    title: 'Spaces',
    description: 'Spaces are communities where you can collaborate with peers on specific topics or courses. Let\'s see how to join and interact with them.',
    target: 'body',
    position: 'bottom',
    navigateTo: '/groups',
    showOnMobile: true,
    showOnDesktop: true,
  },

  // Community Page (removed)

  // Notifications Page
  {
    id: 'notifications-page',
    title: 'Notifications',
    description: 'Stay updated with all your activity notifications in one place.',
    target: 'body',
    position: 'bottom',
    navigateTo: '/notifications',
    showOnMobile: true,
    showOnDesktop: true,
  },

  // Messages Page
  {
    id: 'messages-page',
    title: 'Messages',
    description: 'The messaging system allows you to communicate privately with other users. Let\'s see how it works.',
    target: 'body',
    position: 'bottom',
    navigateTo: '/messages',
    showOnMobile: true,
    showOnDesktop: true,
  },

  // Profile Page
  {
    id: 'profile-page',
    title: 'Profile Page',
    description: 'Let\'s continue the tutorial by exploring your profile page where you can manage your personal information and view your activity.',
    target: 'body',
    position: 'bottom',
    navigateTo: '/profile',
    showOnMobile: true,
    showOnDesktop: true,
  },

  // Return Home to Complete
  {
    id: 'complete-tutorial',
    title: 'Tutorial Complete!',
    description: 'Congratulations! You\'ve completed the tour of the Academic Social Platform. Feel free to explore more features on your own.',
    target: 'body',
    position: 'bottom',
    navigateTo: '/home',
    showOnMobile: true,
    showOnDesktop: true,
  },
];

export const TutorialProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [isActive, setIsActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [hasSeenTutorial, setHasSeenTutorial] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const [transitionDirection, setTransitionDirection] = useState<'next' | 'prev'>('next');
  const [justCompleted, setJustCompleted] = useState(false);

  // Check if user is an admin or super admin
  const isAdminOrSuperAdmin = currentUser?.role === 'admin' || currentUser?.role === 'super admin';

  // Filter steps based on device type
  const isMobile = window.innerWidth < 768;
  const filteredSteps = TUTORIAL_STEPS.filter(step => 
    isMobile ? step.showOnMobile !== false : step.showOnDesktop !== false  );  useEffect(() => {
    // Skip tutorial completely for admin and super admin users
    if (isAdminOrSuperAdmin) {
      setHasSeenTutorial(true);
      return;
    }
    
    // Check if user has seen tutorial before
    if (currentUser) {
      // First check localStorage for quick access
      const tutorialKey = `tutorial_completed_${currentUser.id}`;
      const localCompleted = localStorage.getItem(tutorialKey);
      
      if (localCompleted) {
        setHasSeenTutorial(true);
      } else {
        // If not in localStorage, check Firestore
        const checkFirestore = async () => {
          try {
            const completed = await getUserTutorialStatus(currentUser.id);
            setHasSeenTutorial(completed);
            
            // If completed in Firestore but not localStorage, sync localStorage
            if (completed) {
              localStorage.setItem(tutorialKey, 'true');
            }
            
            // Auto-start tutorial for new users (except admins and super admins)
            if (!completed && !isAdminOrSuperAdmin) {
              const timer = setTimeout(() => {
                setIsActive(true);
              }, 1000); // Small delay to ensure page is loaded
            }
          } catch (error) {
            console.error('Error checking tutorial status from Firestore:', error);
            // If Firestore fails, rely on localStorage
            setHasSeenTutorial(!!localCompleted);
          }
        };
        
        checkFirestore();
      }
    }
  }, [currentUser, isAdminOrSuperAdmin]);

  const startTutorial = () => {
    // Prevent tutorial from starting for admin and super admin users
    if (isAdminOrSuperAdmin) {
      return;
    }
    
    setIsActive(true);
    setCurrentStep(0);
  };

  const nextStep = () => {
    if (currentStep < filteredSteps.length - 1) {
      const nextStepIndex = currentStep + 1;
      const nextStepData = filteredSteps[nextStepIndex];
      
      // Set transition direction for animations
      setTransitionDirection('next');
        // If the next step requires navigation to a different page
      if (nextStepData.navigateTo && typeof nextStepData.navigateTo === 'string') {
        setIsNavigating(true);
        
        // Navigate and handle step change after navigation completes
        navigate(nextStepData.navigateTo);
        
        // Use a small delay to ensure navigation completes
        setTimeout(() => {
          setCurrentStep(nextStepIndex);
          setIsNavigating(false);
        }, 100);
      } else {
        // No navigation required, just advance to the next step immediately
        setCurrentStep(nextStepIndex);
      }    } else {
      completeTutorial();
    }
  };

  const prevStep = () => {
    if (currentStep > 0 && !isNavigating) {
      const prevStepIndex = currentStep - 1;
      const prevStepData = filteredSteps[prevStepIndex];
      
      // Set transition direction for animations
      setTransitionDirection('prev');
      
      // Check if we need to navigate to a different page
      const currentPath = window.location.pathname;
      const needsNavigation = prevStepData.navigateTo && prevStepData.navigateTo !== currentPath;
      
      // Only navigate if going back requires navigation to a different page
      if (needsNavigation) {
        setIsNavigating(true);
        
        // Navigate immediately without transitions
        navigate(prevStepData.navigateTo as string);
        
        // Set the previous step immediately after navigation
        setCurrentStep(prevStepIndex);
        setIsNavigating(false);
      } else {
        // No navigation required, just go back to the previous step immediately
        setCurrentStep(prevStepIndex);
      }
    }
  };

  const skipTutorial = () => {
    completeTutorial();
  };

  const completeTutorial = () => {
    setIsActive(false);
    setCurrentStep(0);
    setJustCompleted(true);
    
    if (currentUser) {
      // Set to localStorage immediately for a fast UI response
      const tutorialKey = `tutorial_completed_${currentUser.id}`;
      localStorage.setItem(tutorialKey, 'true');
      setHasSeenTutorial(true);
      
      // Save to Firebase Firestore for cross-device persistence
      markTutorialAsCompleted(currentUser.id)
        .catch(error => {
          console.error('Error saving tutorial completion status to Firestore:', error);
          // The localStorage backup already happened, so the user's local experience is unaffected
        });
    }
  };

  const isStepActive = (stepId: string) => {
    return isActive && filteredSteps[currentStep]?.id === stepId;
  };

  const value: TutorialContextType = {
    // For admin and super admin users, always set isActive to false
    isActive: isActive && !isAdminOrSuperAdmin,
    currentStep,
    steps: filteredSteps,
    startTutorial,
    nextStep,
    prevStep,
    skipTutorial,
    completeTutorial,
    isStepActive: (stepId: string) => isActive && !isAdminOrSuperAdmin && filteredSteps[currentStep]?.id === stepId,
    isNavigating,
    transitionDirection,
  justCompleted,
  clearCompletionFlag: () => setJustCompleted(false),
  };

  return (
    <TutorialContext.Provider value={value}>
      {children}
    </TutorialContext.Provider>
  );
};

export const useTutorial = () => {
  const context = useContext(TutorialContext);
  if (context === undefined) {
    throw new Error('useTutorial must be used within a TutorialProvider');
  }
  return context;
};
