import React, { useEffect, useRef, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { auth } from '../../firebase/config';
import { RedirectAfterLogin } from '../../utils/redirectAfterLogin';

interface ProtectedRouteProps {
  /** Path to redirect unauthenticated users. Defaults to '/signin'. */
  redirectPath?: string;
  /** Called when navigation is confirmed to be to a protected destination. */
  onAccess?: () => void;
}

/**
 * ProtectedRoute
 *
 * Renders its child routes only when the user is authenticated.
 * On page reloads, session-storage state is trusted immediately so there is
 * zero loading flash. On fresh navigations the Firebase auth state is awaited.
 */
const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  redirectPath = '/signin',
  onAccess,
}) => {
  const { currentUser, loading, isAuthenticated } = useAuth();

  // ── Page-reload fast-path ────────────────────────────────────────────────
  // If we're reloading and session storage already confirms authentication,
  // skip every async check and render immediately.
  const isPageReload =
    (
      window.performance?.getEntriesByType('navigation')[0] as
        | PerformanceNavigationTiming
        | undefined
    )?.type === 'reload';

  const sessionAuthenticated =
    sessionStorage.getItem('isAuthenticated') === 'true';

  if (isPageReload && sessionAuthenticated) {
    onAccess?.();
    return <Outlet />;
  }

  // ── Loading state ────────────────────────────────────────────────────────
  // Only show a spinner while Firebase is still resolving auth AND we have no
  // cached session data to fall back on.
  if (loading && !sessionAuthenticated) {
    return <AuthLoadingSpinner />;
  }

  // ── Not authenticated ────────────────────────────────────────────────────
  if (!isAuthenticated && !sessionAuthenticated) {
    // Capture the intended destination so we can redirect back after login.
    try {
      RedirectAfterLogin.setIntendedUrl();
    } catch {/* non-fatal */}

    const signinUrl = RedirectAfterLogin.buildSignInUrl(true);
    return <Navigate to={signinUrl} replace />;
  }

  // ── Inconsistency guard ──────────────────────────────────────────────────
  // Session storage says "authenticated" but Firebase has no current user and
  // we are not in a loading state. This means the session is stale.
  if (sessionAuthenticated && !currentUser && !loading) {
    const firebaseUser = auth.currentUser;
    if (!firebaseUser) {
      sessionStorage.removeItem('isAuthenticated');
      sessionStorage.removeItem('currentUser');

      try {
        RedirectAfterLogin.setIntendedUrl();
      } catch {/* non-fatal */}

      const signinUrl = RedirectAfterLogin.buildSignInUrl(true);
      return <Navigate to={signinUrl} replace />;
    }
  }

  // ── Authenticated ────────────────────────────────────────────────────────
  onAccess?.();
  return <Outlet />;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const AuthLoadingSpinner: React.FC = () => (
  <div className="min-h-screen flex items-center justify-center bg-gray-900">
    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-green-500" />
  </div>
);

export default ProtectedRoute;