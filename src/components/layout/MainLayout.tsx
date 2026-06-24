import React from 'react';
import Navbar from './Navbar';
import DesktopSidebar from './DesktopSidebar';
import MobileNavBar from './MobileNavBar';
import { TutorialOverlay } from '../tutorial/TutorialOverlay';
import { useSidebar } from '../../contexts/SidebarContext';
import { useTutorial } from '../../contexts/TutorialContext';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

interface MainLayoutProps {
  children: React.ReactNode;
}

const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  const { isOpen, toggleSidebar } = useSidebar();
  const { currentUser } = useAuth();
  const { isNavigating } = useTutorial();
  const location = useLocation();
  const isMessagingPage = location.pathname === '/messages';
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  
  // Check if any modal with the 'modal-open-hide-navbar' class is open
  React.useEffect(() => {
    const checkForModals = () => {
      setIsModalOpen(document.body.classList.contains('modal-open-hide-navbar'));
    };
    
    // Check immediately
    checkForModals();
    
    // Set up a mutation observer to detect class changes on the body
    const observer = new MutationObserver(checkForModals);
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    
    return () => observer.disconnect();
  }, []);
  
  // Pages where desktop navbar should be visible on mobile
  const showNavbarOnMobile = location.pathname === '/' || 
                            location.pathname === '/home' || 
                            location.pathname === '/feed' ||
                            location.pathname === '/notifications' ||
                            location.pathname === '/idea-chain' ||
                            location.pathname === '/space-news' ||
                            location.pathname === '/freedom-wall' ||
                            location.pathname === '/groups' ||
                            location.pathname.startsWith('/groups/') ||
                            location.pathname === '/events' ||
                            location.pathname.startsWith('/events/');

  return (
    <div className="relative flex h-screen min-h-screen bg-[#0A0A0A] text-white overflow-hidden overflow-x-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-[#0A0A0A] to-gray-900 opacity-50 pointer-events-none"></div>
      <DesktopSidebar />
      {!isOpen && (
        <button
          onClick={toggleSidebar}
          className="hidden md:flex lg:hidden fixed left-2 top-20 z-40 h-9 w-9 items-center justify-center rounded-xl bg-[#0A0A0A]/95 border border-green-500/40 text-green-300 shadow-lg shadow-green-500/20 backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-green-500/60"
          aria-label="Open sidebar"
        >
          <span className="material-icons text-base">view_sidebar</span>
        </button>
      )}
      <div className={`relative flex-1 flex flex-col transition-all duration-300 z-10 w-full max-w-full overflow-x-hidden ${isOpen ? 'md:ml-64 md:w-[calc(100%-16rem)]' : 'md:ml-12 md:w-[calc(100%-3rem)]'}`}>
        <div className={showNavbarOnMobile ? 'block' : 'hidden md:block'}>
          <Navbar />
        </div>
        <main className={`flex-1 ${isMessagingPage ? 'overflow-hidden min-h-[calc(100vh-env(safe-area-inset-top)-env(safe-area-inset-bottom))] md:min-h-[calc(100vh-64px)]' : 'overflow-auto overflow-x-hidden min-h-screen md:min-h-[calc(100vh-64px)]'} w-full max-w-full ${isMessagingPage ? 'p-0 pb-0' : 'p-0 sm:p-4 md:p-4 pb-20 md:pb-8'} tutorial-page-wrapper`}>
          <div className="tutorial-page-container w-full max-w-full">
            {children}
          </div>
        </main>
        {!isMessagingPage && !isModalOpen && <MobileNavBar />}
      </div>
      <TutorialOverlay />
    </div>
  );
};

export default MainLayout;
