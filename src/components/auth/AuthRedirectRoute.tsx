import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

interface AuthRedirectRouteProps {
  /**
   * The page to render when the user is NOT authenticated
   * (e.g. a <SignIn /> or <SignUp /> component).
   */
  children: React.ReactNode;

  /**
   * Where to send authenticated users.
   * Defaults to '/' (home feed).
   */
  redirectPath?: string;
}

/**
 * AuthRedirectRoute
 *
 * Wraps authentication pages (sign-in, sign-up) and redirects already-
 * authenticated users away so they never land on those pages by accident.
 *
 * Intentional-logout state is respected: if the user just signed out, we do
 * NOT redirect them back in even if a stale session-storage flag exists.
 */
const AuthRedirectRoute: React.FC<AuthRedirectRouteProps> = ({
  children,
  redirectPath = '/',
}) => {
  const { currentUser, loading, isAuthenticated } = useAuth();

  // ── While Firebase is resolving, show a minimal spinner ─────────────────
  // Only block if loading is still happening and we have no certainty either way.
  if (loading) {
    return <AuthLoadingSpinner />;
  }

  // ── Respect intentional logout ───────────────────────────────────────────
  // If the user explicitly signed out, session storage will have this flag.
  // We honour it and let them stay on the sign-in page without bouncing back.
  if (sessionStorage.getItem('intentionalLogout') === 'true') {
    return <>{children}</>;
  }

  // ── Page-reload case ─────────────────────────────────────────────────────
  // On reload, session storage is the fastest source of truth while Firebase
  // re-initialises. If it confirms auth, redirect immediately.
  const sessionAuthenticated =
    sessionStorage.getItem('isAuthenticated') === 'true';

  const isPageReload =
    (
      window.performance?.getEntriesByType('navigation')[0] as
        | PerformanceNavigationTiming
        | undefined
    )?.type === 'reload';

  if (isPageReload && sessionAuthenticated) {
    return <Navigate to={redirectPath} replace />;
  }

  // ── Normal navigation ────────────────────────────────────────────────────
  if (isAuthenticated && currentUser) {
    return <Navigate to={redirectPath} replace />;
  }

  // ── Not authenticated – render the auth page ─────────────────────────────
  return <>{children}</>;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const AuthLoadingSpinner: React.FC = () => (
  <div className="min-h-screen flex items-center justify-center bg-gray-900">
    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-green-500" />
  </div>
);

export default AuthRedirectRoute;