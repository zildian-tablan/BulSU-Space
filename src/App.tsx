import React, { useEffect, useState, useCallback } from 'react';
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  Outlet,
  useLocation,
  useNavigate,
} from 'react-router-dom';

import './utils/soundDebugUtils';
import './index.css';
import './styles/animations.css';
import './styles/tutorial-animations.css';

// ── Contexts ──────────────────────────────────────────────────────────────────
import AuthProvider, { useAuth } from './contexts/AuthContext';
import { SidebarProvider } from './contexts/SidebarContext';
import { TutorialProvider } from './contexts/TutorialContext';
import { NotificationProvider } from './contexts/NotificationContext';
import { JobOpeningsProvider } from './contexts/JobOpeningsContext';
import { AudioCallProvider, useAudioCallContext } from './contexts/AudioCallContext';

// ── Audio call components ─────────────────────────────────────────────────────
import IncomingCallModal from './components/modals/IncomingCallModal';
import ActiveAudioCallOverlay from './components/audio/ActiveAudioCallOverlay';

// ── Route guards ──────────────────────────────────────────────────────────────
import ProtectedRoute from './components/auth/ProtectedRoute';
import AuthRedirectRoute from './components/auth/AuthRedirectRoute';

// ── Common components ─────────────────────────────────────────────────────────
import ScrollToTop from './components/common/ScrollToTop';
import OfflineNotification from './components/common/OfflineNotification';
import MessageSoundInitializer from './components/common/MessageSoundInitializer';

// ── Auth pages ────────────────────────────────────────────────────────────────
import SignIn from './components/auth/SignIn';
import FacultySignup from './components/auth/FacultySignup';
import ForgotPassword from 'components/auth/ForgotPassword';
import ChangePassword from 'components/auth/ChangePassword';
import MfaPage from 'pages/MfaPage';

// ── Onboarding / public pages ─────────────────────────────────────────────────
import LandingGate from './pages/LandingGate';
import OnboardingPageNew from './pages/OnboardingPageNew';
import AboutPage from './pages/onboarding/AboutPage';
import FeaturesPage from './pages/onboarding/FeaturesPage';
import ContactPage from './pages/onboarding/ContactPage';
import GuestCreatePage from './pages/GuestCreatePage';
import AlumniCreationPage from './pages/AlumniCreationPage';
import VerifyEmailPage from './pages/VerifyEmailPage';
import EmailVerificationConfirmPage from './pages/EmailVerificationConfirmPage';

// ── Authenticated pages ───────────────────────────────────────────────────────
import HomePage from './pages/HomePage';
import ProfilePage from './pages/ProfilePage';
import FreedomWallPage from './pages/ExpressionBoardPage';
import MessagingPage from './pages/MessagingPage';
import NotificationsPage from './pages/NotificationsPage';
import CommunityAccessPage from './pages/CommunityAccessPage';
import AccountCreatorPage from './pages/AccountCreatorPage';
import GroupsPage from './pages/GroupsPage';
import GroupPage from './pages/GroupPage';
import GroupAppearancePage from './pages/GroupAppearancePage';
import EventsPage from './pages/EventsPage';
import JobsPage from './pages/JobsPage';
import SpaceNewsPage from './pages/SpaceNewsPage';
import IdeaChainPage from './pages/IdeaChainPage';
import FlaresPage from './pages/FlaresPage';
import SettingsPage from './pages/SettingsPage';
import MonitorPage from './pages/MonitorPage';
import VerificationPage from './pages/VerificationPage';

// ── Debug / test pages (strip in production if desired) ───────────────────────
import ReadReceiptTest from './components/ReadReceiptTest';
import DebugStorageUploadPage from './pages/DebugStorageUploadPage';

// ── Services ──────────────────────────────────────────────────────────────────
import { scheduleJobCleanup } from './services/jobService';
import { scheduleStickyNoteCleanup } from './services/stickyNoteService';
import { schedulePollCleanup } from './services/pollService';

// ── Hooks ─────────────────────────────────────────────────────────────────────
import { useOnlinePresence } from './hooks/useOnlinePresence';
import { useActivityTracking } from './hooks/useActivityTracking';

// ─────────────────────────────────────────────────────────────────────────────
// NavigationGuard
// Mounted inside every authenticated layout. Keeps hooks (presence, activity)
// alive and handles the one real redirect need: bouncing an authenticated user
// off the landing page to /home.
// ─────────────────────────────────────────────────────────────────────────────
const NavigationGuard: React.FC = () => {
  const { currentUser } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  useOnlinePresence();
  useActivityTracking();

  useEffect(() => {
    if (!currentUser) return;

    const isLanding = location.pathname === '/';
    const isAuthPage =
      location.pathname === '/signin' || location.pathname === '/signup';

    if (isLanding || isAuthPage) {
      // Respect a stored intended URL so deep-link restoration still works.
      const returnUrl =
        new URLSearchParams(location.search).get('returnUrl') ??
        sessionStorage.getItem('INTENDED_URL_AFTER_LOGIN');

      navigate(returnUrl ?? '/home', { replace: true });
    }
  }, [currentUser, location, navigate]);

  return null;
};

// ─────────────────────────────────────────────────────────────────────────────
// Network status hook
// ─────────────────────────────────────────────────────────────────────────────
const useNetworkStatus = (): boolean => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  return isOnline;
};

// ─────────────────────────────────────────────────────────────────────────────
// GlobalAudioCallUI
// Renders the incoming call modal and active call overlay using context
// ─────────────────────────────────────────────────────────────────────────────
const GlobalAudioCallUI: React.FC = () => {
  const { currentUser } = useAuth();
  const {
    incomingAudioCall,
    activeAudioCall,
    audioCallDuration,
    callActionLoading,
    isSelfMuted,
    isRemoteMuted,
    needsAudioPlaybackUnlock,
    incomingCallCaller,
    activeCallPeerUser,
    handleAcceptAudioCall,
    handleRejectAudioCall,
    handleEndAudioCall,
    toggleSelfMute,
    toggleRemoteMute,
    unlockRemoteAudioPlayback,
    formatCallDuration,
  } = useAudioCallContext();

  // Determine if incoming call modal should show
  const showIncomingModal = !!(
    incomingAudioCall &&
    incomingAudioCall.status === 'ringing' &&
    incomingAudioCall.calleeUid === currentUser?.id &&
    // Don't show if we already have an active connected call
    !(activeAudioCall && activeAudioCall.status === 'connected')
  );

  // Determine if active call overlay should show
  const showActiveCallOverlay = !!(
    activeAudioCall &&
    (activeAudioCall.status === 'ringing' || activeAudioCall.status === 'connected')
  );

  const isCaller = activeAudioCall?.callerUid === currentUser?.id;

  return (
    <>
      <IncomingCallModal
        isOpen={showIncomingModal}
        caller={incomingCallCaller}
        isLoading={callActionLoading !== null}
        onAccept={handleAcceptAudioCall}
        onReject={handleRejectAudioCall}
      />
      <ActiveAudioCallOverlay
        isOpen={showActiveCallOverlay}
        peerUser={activeCallPeerUser}
        duration={formatCallDuration(audioCallDuration)}
        status={activeAudioCall?.status || 'ended'}
        isCaller={isCaller}
        isSelfMuted={isSelfMuted}
        isRemoteMuted={isRemoteMuted}
        needsAudioPlaybackUnlock={needsAudioPlaybackUnlock}
        isLoading={callActionLoading !== null}
        onToggleSelfMute={toggleSelfMute}
        onToggleRemoteMute={toggleRemoteMute}
        onEndCall={handleEndAudioCall}
        onUnlockAudio={unlockRemoteAudioPlayback}
      />
    </>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// AuthenticatedLayout
// Wraps authenticated routes with AudioCallProvider and global audio call UI
// ─────────────────────────────────────────────────────────────────────────────
const AuthenticatedLayout: React.FC = () => {
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  }, []);

  return (
    <AudioCallProvider showToast={showToast}>
      <NavigationGuard />
      <MessageSoundInitializer />
      <GlobalAudioCallUI />
      <Outlet />
      {/* Global toast for audio call notifications */}
      {toast && (
        <div
          className={`fixed bottom-6 left-1/2 transform -translate-x-1/2 z-[13000] px-6 py-3 rounded-lg shadow-lg ${
            toast.type === 'error' ? 'bg-red-600 text-white' : 'bg-green-600 text-white'
          }`}
        >
          {toast.message}
        </div>
      )}
    </AudioCallProvider>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// App
// ─────────────────────────────────────────────────────────────────────────────
const App: React.FC = () => {
  const isOnline = useNetworkStatus();

  // Schedule periodic service-layer cleanup tasks.
  useEffect(() => {
    const intervals = [
      scheduleJobCleanup(60),
      scheduleStickyNoteCleanup(60),
      schedulePollCleanup(60),
    ];
    return () => intervals.forEach(clearInterval);
  }, []);

  return (
    <BrowserRouter>
      <AuthProvider>
        <NotificationProvider>
          <TutorialProvider>
            <JobOpeningsProvider>
              <SidebarProvider>
                {!isOnline && (
                  <OfflineNotification onRefresh={() => window.location.reload()} />
                )}
                <ScrollToTop />
                <AppRoutes />
              </SidebarProvider>
            </JobOpeningsProvider>
          </TutorialProvider>
        </NotificationProvider>
      </AuthProvider>
    </BrowserRouter>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// AppRoutes — all route definitions in one place.
// ─────────────────────────────────────────────────────────────────────────────
const AppRoutes: React.FC = () => (
  <Routes>
    {/* ── Public ────────────────────────────────────────────────────────── */}
    <Route path="/" element={<LandingGate />} />
    <Route path="/about" element={<AboutPage />} />
    <Route path="/features" element={<FeaturesPage />} />
    <Route path="/contact" element={<ContactPage />} />
    <Route path="/alumnicreation" element={<AlumniCreationPage />} />
    <Route path="/guest" element={<GuestCreatePage />} />
    <Route path="/resetpassword" element={<ForgotPassword />} />
    <Route path="/changepassword/:code" element={<ChangePassword />} />
    <Route path="/verify-email-token" element={<VerifyEmailPage />} />
    <Route path="/verify-email-confirm" element={<EmailVerificationConfirmPage />} />
    <Route path="/mfa/:token" element={<MfaPage />} />

    {/* ── Auth pages (redirect away if already signed in) ───────────────── */}
    <Route
      path="/signin"
      element={
        <AuthRedirectRoute redirectPath="/home">
          <SignIn />
        </AuthRedirectRoute>
      }
    />
    <Route path="/faculty-signup" element={<FacultySignup />} />
    {/* Signup is retired; keep the URL alive with a redirect. */}
    <Route path="/signup" element={<Navigate to="/signin" replace />} />

    {/* ── Protected ──────────────────────────────────────────────────────── */}
    <Route element={<ProtectedRoute />}>
      {/* AuthenticatedLayout wraps every auth'd page with audio call support */}
      <Route element={<AuthenticatedLayout />}>
        <Route path="/home" element={<HomePage />} />
        <Route path="/feed" element={<HomePage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/profile/:userId" element={<ProfilePage />} />
        <Route path="/freedom-wall" element={<FreedomWallPage />} />
        <Route path="/freedom-wall/:userId" element={<FreedomWallPage />} />
        <Route path="/messages" element={<MessagingPage />} />
        <Route path="/community-access" element={<CommunityAccessPage />} />
        <Route path="/account-creator" element={<AccountCreatorPage />} />
        <Route path="/groups" element={<GroupsPage />} />
        <Route path="/groups/:groupId" element={<GroupPage />} />
        <Route path="/groups/:groupId/appearance" element={<GroupAppearancePage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/events" element={<EventsPage />} />
        <Route path="/jobs" element={<JobsPage />} />
        <Route path="/space-news" element={<SpaceNewsPage />} />
        <Route path="/idea-chain" element={<IdeaChainPage />} />
        <Route path="/flares" element={<FlaresPage />} />
        <Route path="/flares/:flareId" element={<FlaresPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/monitor" element={<MonitorPage />} />
        <Route path="/resources" element={<HomePage />} />
        <Route path="/verify-email" element={<VerificationPage />} />
        <Route path="/verify-email-page" element={<VerifyEmailPage />} />
      </Route>
    </Route>

    {/* ── Dev / debug (consider removing in production) ─────────────────── */}
    <Route path="/read-receipt-test" element={<ReadReceiptTest />} />
    <Route path="/debug-storage-upload" element={<DebugStorageUploadPage />} />

    {/* ── Catch-all ─────────────────────────────────────────────────────── */}
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
);

export default App;