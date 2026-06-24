import React, { useEffect, useState, useCallback } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { navItems } from '../../data/navItems';
import { useSidebar } from '../../contexts/SidebarContext';
import { useAuth } from '../../contexts/AuthContext';
import { TutorialTrigger } from '../tutorial/TutorialTrigger';
import { listenToUnreadNotificationCount } from '../../services/notificationService';
import { getUserUnreadCount } from '../../services/messageService';
import { listenIncomingRingingCall } from '../../services/audioCallService';

interface MobileNavBarProps {
  className?: string;
}

export const MobileNavBar: React.FC<MobileNavBarProps> = ({ className }) => {
  const { setActiveTab } = useSidebar();
  const { currentUser } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const [hasIncomingCall, setHasIncomingCall] = useState(false);
  
  // Check if user is alumni
  const isAlumni = currentUser?.role?.toLowerCase() === 'alumni';
  const isAdmin = currentUser?.role?.toLowerCase() === 'admin';
  const isSuperAdmin = currentUser?.role?.toLowerCase() === 'super admin';

  // Improved active tab determination with consistent logic (same as Navbar)
  const getActiveTab = useCallback(() => {
    const pathname = location.pathname;
    
    // Define route mappings with priority (more specific routes first)
    const routeMap = [
      { path: '/community-access', tab: 'community-access' },
      { path: '/space-news', tab: 'space-news' },
      { path: '/idea-chain', tab: 'idea-chain' },
      { path: '/account-creator', tab: 'account-creator' },
      { path: '/calendar', tab: 'academic-calendar' },
      { path: '/events', tab: 'events' },
      { path: '/groups', tab: 'popular-groups' },
      { path: '/notifications', tab: 'notifications' },
      { path: '/messages', tab: 'messages' },
      { path: '/profile', tab: 'profile' },
      { path: '/settings', tab: 'settings' },
    ];
    
    // Find matching route (exact match first, then startsWith)
    for (const route of routeMap) {
      if (pathname === route.path || pathname.startsWith(route.path + '/')) {
        // console.log(`[MobileNavBar] Route matched: ${pathname} -> ${route.tab}`);
        return route.tab;
      }
    }
    
    // Default to home
    // console.log(`[MobileNavBar] No route matched for: ${pathname}, defaulting to home`);
    return 'home';
  }, [location.pathname]);

  const activeTab = getActiveTab();

  // Check if we're on the profile page
  const isProfilePage = location.pathname.startsWith('/profile');

  // Real-time notification badge
  useEffect(() => {
    if (!currentUser) return;
    
    const unsubscribeNotif = listenToUnreadNotificationCount(currentUser.id, (count) => {
      setUnreadNotifCount(count);
    });
    const unsubscribeMsg = getUserUnreadCount(currentUser.id, (count) => {
      setUnreadMessageCount(count);
    });
    
    return () => {
      unsubscribeNotif && unsubscribeNotif();
      unsubscribeMsg && unsubscribeMsg();
    };
  }, [currentUser]);

  useEffect(() => {
    const normalizedUid = typeof currentUser?.id === 'string' ? currentUser.id.trim() : '';
    if (!normalizedUid) {
      setHasIncomingCall(false);
      return;
    }

    const unsubscribeIncoming = listenIncomingRingingCall(normalizedUid, (call) => {
      setHasIncomingCall(
        !!call &&
          call.status === 'ringing' &&
          call.calleeUid === normalizedUid &&
          typeof call.callerUid === 'string' &&
          call.callerUid.trim().length > 0
      );
    });

    return () => {
      try {
        unsubscribeIncoming && unsubscribeIncoming();
      } catch {}
    };
  }, [currentUser?.id]);

  // Improved navigation items filtering (same as Navbar)
  const getVisibleNavItems = useCallback(() => {
    if (!currentUser) {
      return navItems.filter(item => 
        !['community-access', 'account-creator', 'profile'].includes(item.tab)
      );
    }

    const isSuperAdmin = currentUser.role === 'super admin';
    // Support both `office` (string) and `offices` (array); compare case-insensitively
    const officesArray: string[] = Array.isArray((currentUser as any)?.offices)
      ? ((currentUser as any).offices as string[])
      : [];
    const officeString: string | undefined = (currentUser as any)?.office;
    const normalizedOffices = officesArray.map(o => (typeof o === 'string' ? o.toLowerCase() : ''));
    const isRegistrarInArray = normalizedOffices.includes('registrar');
    const isRegistrarInString = typeof officeString === 'string' && officeString.toLowerCase() === 'registrar';
    const isAdminWithRegistrarOffice = currentUser.role === 'admin' && (isRegistrarInArray || isRegistrarInString);
    
  // Allow account creator access for super admin, admin+registrar, or dean
  const isDean = currentUser.role === 'dean';
  const canAccessAccountCreator = isSuperAdmin || isAdminWithRegistrarOffice || isDean;

  if (currentUser.role === 'admin' || currentUser.role === 'super admin') {
      // For admins (including super admin) - base filtering (remove community, profile, and messages)
      let baseFilteredItems = navItems.filter(item => 
        !['community', 'profile', 'messages'].includes(item.tab)
      );

      // Remove Community Access for regular admins unless they have registrar office
      if (currentUser.role === 'admin' && !isAdminWithRegistrarOffice) {
        baseFilteredItems = baseFilteredItems.filter(item => item.tab !== 'community-access');
      }

      // Now apply account-creator vs popular-groups visibility rules
      if (canAccessAccountCreator) {
        // Show account-creator, hide popular-groups (Spaces)
        return baseFilteredItems.filter(item => item.tab !== 'popular-groups');
      } else {
        // Show popular-groups (Spaces), hide account-creator
        return baseFilteredItems.filter(item => item.tab !== 'account-creator');
      }
    } else if (currentUser.role === 'dean') {
      // Dean should be able to access account-creator
      return navItems.filter(item => !['community-access', 'profile'].includes(item.tab));
    } else {
      // For other non-admin users (student, faculty, alumni, etc.)
      return navItems.filter(item => 
        !['community-access', 'profile', 'account-creator'].includes(item.tab)
      );
    }
  }, [currentUser]);

  const filteredNavItems = getVisibleNavItems();

  // Improved navigation handler with specific home handling
  const handleNavigation = useCallback((tab: string) => {
    setActiveTab(tab);
    
    // Handle home tab specifically to ensure it goes to the homepage
    if (tab === 'home') {
      navigate('/home');
      return;
    }
    
    const routeMap: Record<string, string> = {
      'academic-calendar': '/calendar',
      'events': '/events',
      'popular-groups': '/groups',
      'community-access': '/community-access',
      'account-creator': '/account-creator',
      'notifications': '/notifications',
      'messages': '/messages',
      'profile': '/profile',
      'settings': '/settings'
    };
    
    const route = routeMap[tab] || '/';
    navigate(route);
  }, [navigate, setActiveTab]);

  // Debug logging
  useEffect(() => {
    // console.log(`[MobileNavBar] Current pathname: ${location.pathname}`);
    // console.log(`[MobileNavBar] Active tab: ${activeTab}`);
    // console.log(`[MobileNavBar] Current user role: ${currentUser?.role}`);
    // console.log(`[MobileNavBar] Visible nav items:`, filteredNavItems.map(item => item.tab));
  }, [location.pathname, activeTab, currentUser, filteredNavItems]);
  
  // Log navigation events to debug the onboarding issue
  useEffect(() => {
    console.log(`[MobileNavBar] Current pathname: ${location.pathname}`);
    if (location.pathname === '/') {
      console.log('[MobileNavBar] On homepage, checking for redirect conditions');
    }
  }, [location.pathname]);
  
  if (!currentUser) return null;
  
  // Use custom className or default fixed bottom positioning
  const navClassName = className || "md:hidden fixed bottom-0 left-0 right-0 bg-gray-900/95 border-t border-gray-800/20 shadow-lg z-[1500] backdrop-blur-md pb-safe";

  // Determine icon font class per tab (Spaces uses Material Symbols)
  const getIconClass = (tab: string) => (tab === 'popular-groups' ? 'material-symbols-outlined' : 'material-icons');

  return (
    <nav className={navClassName} style={{ fontSize: '0.85rem' }}>
      <div className="container mx-auto flex justify-around items-center py-1.5 px-0">
        {filteredNavItems.map((item) => {
          // Slightly shrink long labels to avoid extra width while keeping them visible
          const shouldShrinkLabel = item.tab === 'account-creator' || item.tab === 'community-access';
          const baseClasses = `flex items-center justify-center p-1.5 rounded-lg transition-all duration-300 ${activeTab === item.tab
            ? 'bg-transparent text-green-400'
            : 'bg-transparent text-gray-400'}`;
          const iconClass = `${getIconClass(item.tab)} text-base md:text-lg transform transition-all duration-300 !border-none ${activeTab === item.tab
            ? 'text-green-400 drop-shadow-[0_0_8px_rgba(34,197,94,0.7)]'
            : 'text-gray-400'}`;
          const labelClass = `mt-0.5 text-[10px] font-medium ${shouldShrinkLabel ? 'text-[9px] mt-0 leading-tight tracking-tight' : ''} ${activeTab === item.tab ? 'text-green-400' : 'text-gray-400'}`;

          return (
            <div key={item.tab} className="relative">
              {item.tab === 'notifications' ? (
                <Link to="/notifications" className={baseClasses} aria-label={item.label}>
                  <div className="flex flex-col items-center justify-center leading-none">
                    <div className="relative">
                      <span className={iconClass}>{item.icon}</span>
                      {unreadNotifCount > 0 && (
                        <span className="absolute top-0 right-0 translate-x-1/2 -translate-y-1/2 bg-green-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow-lg animate-pulse">
                          {unreadNotifCount > 9 ? '9+' : unreadNotifCount}
                        </span>
                      )}
                    </div>
                    <span className={labelClass} aria-hidden>{item.label}</span>
                  </div>
                </Link>
              ) : item.tab === 'messages' ? (
                <Link to="/messages" className={baseClasses} aria-label={item.label}>
                  <div className="flex flex-col items-center justify-center leading-none">
                    <div className="relative">
                      <span className={iconClass}>{item.icon}</span>
                      {unreadMessageCount > 0 && (
                        <span className="absolute top-0 right-0 translate-x-1/2 -translate-y-1/2 bg-green-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow-lg animate-pulse">
                          {unreadMessageCount > 9 ? '9+' : unreadMessageCount}
                        </span>
                      )}
                      {hasIncomingCall && (
                        <span
                          className="absolute bottom-0 right-0 translate-x-1/3 translate-y-1/3 h-3.5 w-3.5 rounded-full bg-red-500 text-white border border-red-300/60 shadow-md shadow-red-500/40 flex items-center justify-center animate-pulse"
                          title="Incoming call"
                          aria-label="Incoming call"
                        >
                          <span className="material-icons text-[9px] leading-none">call</span>
                        </span>
                      )}
                    </div>
                    <span className={labelClass} aria-hidden>{item.label}</span>
                  </div>
                </Link>
              ) : item.tab === 'home' ? (
                <Link to="/home" className={baseClasses} aria-label={item.label}>
                  <div className="flex flex-col items-center justify-center leading-none">
                    <span className={iconClass}>{item.icon}</span>
                    <span className={labelClass} aria-hidden>{item.label}</span>
                  </div>
                </Link>
              ) : (
                <button type="button" onClick={() => handleNavigation(item.tab)} className={baseClasses} aria-label={item.label}>
                  <div className="flex flex-col items-center justify-center leading-none">
                    <span className={iconClass}>{item.icon}</span>
                    <span className={labelClass} aria-hidden>{item.label}</span>
                  </div>
                </button>
              )}
            </div>
          );
        })}
      </div>
    </nav>
  );
};

// Make sure this component can be imported both as default and named export
export default MobileNavBar;