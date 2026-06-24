import React, { useEffect, useState, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import OnboardingPageNew from './OnboardingPageNew';

/**
 * LandingGate
 * Lightweight gate component for the root route (/).
 * Goals:
 *  - If the user has an authenticated session (sessionStorage + AuthContext), immediately navigate to /home
 *    without rendering the full onboarding page (prevents flicker).
 *  - Show a minimal loading screen for a very short verification window if session says authenticated
 *    but React context hasn't hydrated yet.
 *  - Respect intentional logout (do NOT auto-redirect after user has logged out).
 *  - Gracefully handle slow Firebase initialization on reload (fallback to redirect after a timeout).
 */
const REDIRECT_GRACE_MS = 300;          // Wait briefly for context hydration
const HARD_REDIRECT_TIMEOUT_MS = 1500;  // Force navigation even if context hasn't hydrated

const LandingGate: React.FC = () => {
  const { currentUser, loading } = useAuth();
  const [shouldRedirect, setShouldRedirect] = useState(false);
  const [forcedRedirect, setForcedRedirect] = useState(false);
  const startedAtRef = useRef<number>(Date.now());

  // Snapshot session flags early (avoid changes during render) 
  const sessionAuth = sessionStorage.getItem('isAuthenticated') === 'true';
  const intentionalLogout = sessionStorage.getItem('intentionalLogout') === 'true';
  const recentLogout = (() => {
    const ts = sessionStorage.getItem('logoutTimestamp');
    if (!ts) return false;
    const elapsed = Date.now() - parseInt(ts, 10);
    return elapsed < 5 * 60 * 1000; // 5 minutes
  })();

  // Core decision logic
  useEffect(() => {
    if (intentionalLogout || recentLogout) {
      // User explicitly logged out; never auto-redirect.
      return;
    }

    // If both session and context agree quickly, redirect now.
    if (sessionAuth && currentUser) {
      setShouldRedirect(true);
      return;
    }

    // If session says authenticated but context not yet ready, allow brief hydration window.
    if (sessionAuth && !currentUser) {
      const graceTimer = setTimeout(() => {
        // After grace period, if still no user but session says auth, proceed anyway.
        if (!currentUser) setShouldRedirect(true);
      }, REDIRECT_GRACE_MS);

      const hardTimer = setTimeout(() => {
        // Force redirect to prevent user seeing onboarding unnecessarily on slow init.
        if (!currentUser) setForcedRedirect(true);
      }, HARD_REDIRECT_TIMEOUT_MS);

      return () => {
        clearTimeout(graceTimer);
        clearTimeout(hardTimer);
      };
    }
  }, [sessionAuth, currentUser, intentionalLogout, recentLogout]);

  // Final redirect condition
  const redirectNow = (shouldRedirect || forcedRedirect) && sessionAuth && !intentionalLogout && !recentLogout;

  if (redirectNow) {
    return <Navigate to="/home" replace />;
  }

  // Minimal loading screen if we're in the auth hydration window
  if (sessionAuth && !currentUser && !intentionalLogout && !recentLogout) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-950 text-white">
        <div className="animate-spin rounded-full h-14 w-14 border-t-2 border-b-2 border-emerald-500 mb-6" />
        <p className="text-sm opacity-70 tracking-wide">
          Loading your space…
        </p>
      </div>
    );
  }

  // Not authenticated (or intentionally logged out) – show onboarding normally.
  return <OnboardingPageNew />;
};

export default LandingGate;
