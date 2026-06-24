import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTutorial } from '../contexts/TutorialContext';
import MainLayout from '../components/layout/MainLayout';
import Feed from '../components/feed/Feed';
import { TutorialOverlay } from '../components/tutorial/TutorialOverlay';
import TermsAndConditionsModal from '../components/modals/TermsAndConditionsModal';
import FloatingQuickMenu from '../components/ui/FloatingQuickMenu';

const HomePage: React.FC = () => {
  const { currentUser } = useAuth();
  const { isActive: isTutorialActive, justCompleted, clearCompletionFlag } = useTutorial();
  const [showTermsModal, setShowTermsModal] = useState(false);
  
  // Show terms modal only immediately after tutorial is finished or skipped
  useEffect(() => {
    if (currentUser && currentUser.isNewUser === true && justCompleted) {
      setShowTermsModal(true);
      // Clear the flag so it doesn't re-open on rerenders/navigation
      clearCompletionFlag();
    }
  }, [currentUser, justCompleted, clearCompletionFlag]);

  const handleCloseTermsModal = () => {
    setShowTermsModal(false);
  };
  
  if (!currentUser) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50/30 to-purple-50/50 relative">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-100/20 via-transparent to-purple-100/20"></div>
        <div className="absolute top-1/4 left-1/4 w-72 h-72 bg-blue-200/30 rounded-full blur-3xl"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-200/20 rounded-full blur-3xl"></div>
        <div className="relative z-10 animate-spin rounded-full h-14 w-14 border-4 border-transparent bg-gradient-to-r from-blue-500 to-purple-500 bg-clip-border">
          <div className="absolute inset-1 bg-white rounded-full"></div>
          <div className="absolute inset-2 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full animate-pulse"></div>
        </div>
      </div>
    );
  }
  
  return (
    <>
      <MainLayout>      
        <div className="container mx-auto px-0 pb-16 md:pb-20">
          {/* Feed */}
          <div className="w-full">
            <Feed />
          </div>
        </div>
      </MainLayout>

      {/* Floating quick menu */}
      <FloatingQuickMenu />

      {/* Terms and Conditions Modal for New Users */}
      <TermsAndConditionsModal 
        isOpen={showTermsModal}
        onClose={handleCloseTermsModal}
      />
    </>
  );
};

export default HomePage;