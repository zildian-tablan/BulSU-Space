/**
 * Helper to preserve and restore intended navigation after authentication.
 * Stores a return URL in sessionStorage and/or the signin query string.
 */
const STORAGE_KEY = 'INTENDED_URL_AFTER_LOGIN';

export const RedirectAfterLogin = {
  /** Capture current URL (or provided url) so we can resume after login */
  setIntendedUrl(url?: string) {
    try {
      const target = url || window.location.href;
      sessionStorage.setItem(STORAGE_KEY, target);
    } catch {}
  },

  /** Read intended URL from query (?returnUrl=) or sessionStorage, then clear it */
  consumeIntendedUrl(): string | null {
    try {
      const params = new URLSearchParams(window.location.search);
      const queryUrl = params.get('returnUrl');
      if (queryUrl) return queryUrl;

      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored) {
        sessionStorage.removeItem(STORAGE_KEY);
        return stored;
      }
      return null;
    } catch {
      return null;
    }
  },

  /** Build signin URL with optional returnUrl param for deep links */
  buildSignInUrl(fallbackToCurrent = true): string {
    try {
      const base = '/signin';
      const url = fallbackToCurrent ? encodeURIComponent(window.location.href) : '';
      return url ? `${base}?returnUrl=${url}` : base;
    } catch {
      return '/signin';
    }
  }
};

export default RedirectAfterLogin;
