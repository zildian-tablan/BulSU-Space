import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
} from 'react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  updateProfile,
  User as FirebaseUser,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  onSnapshot,
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useNavigate } from 'react-router-dom';
import { SecurityManager, SecurityLogger } from '../utils/securityUtils';
import {
  updateUserOnlineStatus,
  setUserOffline,
  directWriteUserStatus,
} from '../services/presenceService';
import ConfirmDialog from '../components/common/ConfirmDialog';
import getExistingUserDeviceID from 'utils/auth/getExistingUserDeviceID';
import getDeviceID from 'utils/auth/getDeviceID';
import app, { auth, db } from '../firebase/config';

// ─── Types ────────────────────────────────────────────────────────────────────

export type UserRole =
  | 'student'
  | 'faculty'
  | 'alumni'
  | 'admin'
  | 'super admin'
  | 'dean'
  | 'guest'
  | 'infirmary'
  | 'librarian';

export type Department = 'POSHED' | 'AFEA' | 'SHATMO' | 'FIPO' | 'NONE';

export interface User {
  id: string;
  email: string;
  name: string;
  firstName?: string;
  secondName?: string;
  lastName?: string;
  idNumber: string;
  role: UserRole;
  profile_pic?: string;
  department?: Department;
  gender?: 'male' | 'female' | 'other' | 'prefer_not_to_say';
  birthday?: string;
  yearSection?: string;
  coverPhoto?: string;
  phoneNumber?: string;
  resetEmail?: string;
  graduationBatch?: string;
  emailVerified?: boolean;
  restricted?: boolean;
  restrictedAt?: string | null;
  restrictionExpiresAt?: string | null;
  blockedUsers?: string[];
  office?: string;
  isNewUser?: boolean;
  namePrefix?: string;
  nameSuffix?: string;
}

interface AuthContextType {
  currentUser: User | null;
  userData: User | null;
  loading: boolean;
  error: string | null;
  isAuthenticated: boolean;
  activateMFA: boolean;
  setCurrentUser: React.Dispatch<React.SetStateAction<User | null>>;
  setError: (error: string | null) => void;
  setActivateMFA: React.Dispatch<React.SetStateAction<boolean>>;
  login: (email: string, password: string) => Promise<boolean>;
  signup: (userData: Omit<User, 'id'> & { password: string }) => Promise<boolean>;
  logout: (skipConfirmation?: boolean) => Promise<void>;
}

type GenerateMFAResponse = {
  success: boolean;
  emailSent?: boolean;
  locked?: boolean;
  msg?: string;
  token?: string;
};

// ─── Session helpers ───────────────────────────────────────────────────────────

const SESSION = {
  get isAuthenticated() {
    return sessionStorage.getItem('isAuthenticated') === 'true';
  },
  get currentUser(): User | null {
    try {
      const raw = sessionStorage.getItem('currentUser');
      return raw ? (JSON.parse(raw) as User) : null;
    } catch {
      return null;
    }
  },
  setUser(user: User) {
    sessionStorage.setItem('isAuthenticated', 'true');
    try {
      sessionStorage.setItem('currentUser', JSON.stringify(user));
    } catch {
      /* quota exceeded – non-fatal */
    }
  },
  clear() {
    sessionStorage.removeItem('isAuthenticated');
    sessionStorage.removeItem('currentUser');
    sessionStorage.removeItem('isAuthenticating');
    sessionStorage.removeItem('loginSuccess');
    sessionStorage.removeItem('loginTimestamp');
  },
  markIntentionalLogout() {
    sessionStorage.clear();
    sessionStorage.setItem('intentionalLogout', 'true');
    sessionStorage.setItem('logoutTimestamp', Date.now().toString());
  },
  get wasIntentionalLogout() {
    return sessionStorage.getItem('intentionalLogout') === 'true';
  },
  get isPageReload() {
    return (
      (
        window.performance?.getEntriesByType('navigation')[0] as
          | PerformanceNavigationTiming
          | undefined
      )?.type === 'reload'
    );
  },
};

// ─── Error mapping ─────────────────────────────────────────────────────────────

function toFriendlyError(err: unknown): string {
  if (!err) return 'An unexpected error occurred. Please try again.';
  const code = (err as any)?.code ?? '';
  switch (code) {
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Invalid email or password.';
    case 'auth/invalid-email':
      return 'Invalid email format.';
    case 'auth/too-many-requests':
      return 'Too many failed attempts. Please try again later.';
    case 'auth/network-request-failed':
      return 'Network error. Check your connection and try again.';
    case 'auth/user-disabled':
      return 'This account has been disabled. Contact support.';
    case 'auth/email-already-in-use':
      return 'An account with this email already exists.';
    case 'auth/weak-password':
      return 'Password is too weak. Use at least 6 characters.';
    default: {
      const msg = (err as any)?.message as string | undefined;
      if (!msg) return 'Something went wrong. Please try again.';
      const clean = msg.replace(/^Firebase:\s*/i, '').split(' (auth/')[0].trim();
      return clean || 'Something went wrong. Please try again.';
    }
  }
}

function isPermissionDeniedError(err: unknown): boolean {
  const code = (err as any)?.code;
  const message = String((err as any)?.message ?? '').toLowerCase();
  return code === 'permission-denied' || message.includes('insufficient permissions');
}

function buildAuthFallbackUser(firebaseUser: FirebaseUser): User {
  const cached = SESSION.currentUser;
  const isMatchingCachedUser = cached?.id === firebaseUser.uid;

  const fallbackName =
    (isMatchingCachedUser ? cached?.name : '') ||
    firebaseUser.displayName ||
    (firebaseUser.email ? firebaseUser.email.split('@')[0] : '') ||
    'User';

  return {
    id: firebaseUser.uid,
    email: (isMatchingCachedUser ? cached?.email : '') || firebaseUser.email || '',
    name: fallbackName,
    firstName: isMatchingCachedUser ? cached?.firstName : undefined,
    secondName: isMatchingCachedUser ? cached?.secondName : undefined,
    lastName: isMatchingCachedUser ? cached?.lastName : undefined,
    idNumber: isMatchingCachedUser ? cached?.idNumber || '' : '',
    role: isMatchingCachedUser ? cached?.role || 'student' : 'student',
    profile_pic: isMatchingCachedUser ? cached?.profile_pic : undefined,
    department: isMatchingCachedUser ? cached?.department : undefined,
    yearSection: isMatchingCachedUser ? cached?.yearSection : undefined,
    office: isMatchingCachedUser ? cached?.office : undefined,
    emailVerified: firebaseUser.emailVerified,
    isNewUser: isMatchingCachedUser ? cached?.isNewUser : undefined,
  };
}

// ─── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = (): AuthContextType => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
};

// ─── Provider ─────────────────────────────────────────────────────────────────

const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const navigate = useNavigate();
  const functions = getFunctions(app);

  const generateMFACode = httpsCallable<{ user_uid: string }, GenerateMFAResponse>(
    functions,
    'generateMFACodeV2',
  );

  // ── State ──────────────────────────────────────────────────────────────────

  /**
   * On a page reload, seed currentUser from session storage immediately so there
   * is zero "flash" of unauthenticated content while Firebase re-initialises.
   * On a fresh navigation (tab open, link click) we start null and let the
   * onAuthStateChanged listener populate the state.
   */
  const [currentUser, setCurrentUser] = useState<User | null>(() =>
    SESSION.isPageReload && SESSION.isAuthenticated ? SESSION.currentUser : null,
  );

  const [userData, setUserData] = useState<User | null>(null);

  /**
   * `loading` starts true only when Firebase still needs to confirm identity.
   * On a reload where session storage already has the user we skip it.
   */
  const [loading, setLoading] = useState<boolean>(
    !(SESSION.isPageReload && SESSION.isAuthenticated),
  );

  const [error, setError] = useState<string | null>(null);
  const [activateMFA, setActivateMFA] = useState(false);
  const [pendingMFAUid, setPendingMFAUid] = useState<string | null>(null);

  // Logout confirmation modal
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [logoutProcessing, setLogoutProcessing] = useState(false);

  /**
   * Guard flag: Firebase always fires `null` once during cold init before it
   * resolves the real user. We ignore that first null if we already have a
   * session so we don't wipe valid state prematurely.
   */
  const firebaseEverHadUser = useRef(false);

  // ── MFA effect ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!activateMFA || !pendingMFAUid) return;

    let cancelled = false;
    (async () => {
      try {
        const result = await generateMFACode({ user_uid: pendingMFAUid });
        if (cancelled) return;
        if (result.data.success && result.data.token) {
          navigate(`/mfa/${result.data.token}`);
        } else {
          setError(result.data.msg ?? 'Failed to generate MFA code. Please try again.');
        }
      } catch (err) {
        console.error('[Auth] MFA generation failed:', err);
        setError('Failed to send MFA code. Please try again.');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activateMFA, pendingMFAUid]);

  // ── Popstate guard (browser back button on auth pages) ────────────────────

  useEffect(() => {
    const handlePopState = () => {
      const onAuthPage =
        window.location.pathname === '/signin' ||
        window.location.pathname === '/signup';
      if (onAuthPage && currentUser) {
        window.history.pushState(null, '', '/');
        window.dispatchEvent(new PopStateEvent('popstate'));
      }
    };
    window.addEventListener('popstate', handlePopState);
    handlePopState();
    return () => window.removeEventListener('popstate', handlePopState);
  }, [currentUser]);

  // ── Load full user document from Firestore ─────────────────────────────────

  const loadUserFromFirestore = useCallback(
    async (firebaseUser: FirebaseUser): Promise<User | null> => {
      const snap = await getDoc(doc(db, 'users', firebaseUser.uid));

      if (snap.exists()) {
        const data = snap.data() as Omit<User, 'id'>;
        return { id: firebaseUser.uid, ...data };
      }

      // User exists in Auth but not Firestore – create a stub document.
      const stub: User = {
        id: firebaseUser.uid,
        email: firebaseUser.email ?? '',
        name: firebaseUser.displayName ?? '',
        idNumber: '',
        role: 'student',
        isNewUser: true,
      };

      try {
        await setDoc(doc(db, 'users', firebaseUser.uid), {
          email: stub.email,
          name: stub.name,
          idNumber: '',
          role: 'student',
          profile_pic: `https://ui-avatars.com/api/?name=${encodeURIComponent(stub.name)}&background=0D8ABC&color=fff`,
          isNewUser: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (e) {
        console.error('[Auth] Could not create stub Firestore document:', e);
      }

      return stub;
    },
    [],
  );

  // ── onAuthStateChanged listener ────────────────────────────────────────────

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      // ── Skip intentional-logout false positives ──────────────────────────
      if (SESSION.wasIntentionalLogout) {
        // Already signed out; do not re-hydrate.
        setCurrentUser(null);
        setLoading(false);
        return;
      }

      // ── Firebase cold-init null guard ────────────────────────────────────
      if (!firebaseUser) {
        if (!firebaseEverHadUser.current && SESSION.isAuthenticated) {
          // Firebase hasn't resolved yet – keep session-storage state intact.
          setLoading(false);
          return;
        }

        // Genuine sign-out.
        firebaseEverHadUser.current = false;
        setCurrentUser(null);
        SESSION.clear();
        setLoading(false);
        return;
      }

      // ── Authenticated ────────────────────────────────────────────────────
      firebaseEverHadUser.current = true;

      let resolvedUser: User | null = null;
      try {
        const user = await loadUserFromFirestore(firebaseUser);
        if (!user) {
          setLoading(false);
          return;
        }

        resolvedUser = user;
      } catch (err) {
        if (isPermissionDeniedError(err)) {
          console.warn('[Auth] Permission denied while loading user profile. Using local auth fallback user.');
        } else {
          console.error('[Auth] Error loading user after auth state change:', err);
        }

        const fallback = buildAuthFallbackUser(firebaseUser);
        resolvedUser = fallback;
      }

      if (!resolvedUser) {
        setLoading(false);
        return;
      }

      setUserData(resolvedUser);

      // ── Device / MFA check (fail closed) ────────────────────────────────
      let deviceKnown = false;
      try {
        const deviceId = await getDeviceID();
        deviceKnown = await getExistingUserDeviceID(firebaseUser.uid, deviceId ?? null);
      } catch (deviceErr) {
        console.error('[Auth] Device recognition failed. Requiring MFA:', deviceErr);
      }

      if (!deviceKnown) {
        // Unknown/unreadable device state → trigger MFA and halt normal sign-in.
        await firebaseSignOut(auth);
        setPendingMFAUid(firebaseUser.uid);
        setActivateMFA(true);
        setLoading(false);
        return;
      }

      // ── Persist to session storage & update state ──────────────────────
      SESSION.setUser(resolvedUser);
      sessionStorage.setItem('loginSuccess', 'true');
      sessionStorage.setItem('loginTimestamp', Date.now().toString());

      setCurrentUser(resolvedUser);

      try {
        // Update online presence without blocking successful auth state hydration.
        await updateUserOnlineStatus(firebaseUser.uid);
      } catch (presenceErr) {
        console.warn('[Auth] Failed to update online presence:', presenceErr);
      } finally {
        setLoading(false);
      }
    });

    return unsubscribe;
  }, [loadUserFromFirestore]);

  // ── Real-time user-document listener (restricted flag, etc.) ───────────────

  useEffect(() => {
    if (!currentUser?.id) return;

    const ref = doc(db, 'users', currentUser.id);
    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          // Document deleted → force sign-out.
          setCurrentUser(null);
          SESSION.clear();
          return;
        }
        const data = snap.data() as Omit<User, 'id'>;
        const updated: User = { id: currentUser.id, ...data };
        setCurrentUser(updated);
        SESSION.setUser(updated);
      },
      (err) => console.error('[Auth] User document listener error:', err),
    );

    return unsubscribe;
  }, [currentUser?.id]);

  // ── Login ──────────────────────────────────────────────────────────────────

  const login = useCallback(
    async (email: string, password: string): Promise<boolean> => {
      setError(null);

      // Account lockout check
      const locked = await SecurityManager.isAccountLocked(email);
      if (locked) {
        const remaining = await SecurityManager.getLockoutTimeRemaining(email);
        setError(
          `Account temporarily locked. Try again in ${remaining}.`,
        );
        SecurityLogger.logSecurityEvent('login_attempt_blocked', { email, reason: 'account_locked' });
        return false;
      }

      setLoading(true);

      // Safety timeout – clears loading if Firebase stalls.
      const timeout = setTimeout(() => {
        setLoading(false);
        setError('Login timed out. Please try again.');
      }, 15_000);

      try {
        // Normalise email variants used by this platform.
        const normalised = normaliseEmail(email);

        sessionStorage.setItem('isAuthenticating', 'true');

        const { user: firebaseUser } = await signInWithEmailAndPassword(
          auth,
          normalised,
          password,
        );

        await SecurityManager.recordLoginAttempt(normalised, true);
        SecurityLogger.logSecurityEvent('login_success', {
          email: normalised,
          uid: firebaseUser.uid,
          timestamp: Date.now(),
          userAgent: navigator.userAgent,
        });

        clearTimeout(timeout);
        setLoading(false);
        return true;
      } catch (err: unknown) {
        clearTimeout(timeout);

        await SecurityManager.recordLoginAttempt(email, false);
        const suspicious = await SecurityManager.detectSuspiciousActivity(email);
        SecurityLogger.logSecurityEvent('login_failure', {
          email,
          error: (err as any)?.code,
          suspicious,
        });

        setError(toFriendlyError(err));
        setLoading(false);
        sessionStorage.removeItem('isAuthenticating');
        return false;
      }
    },
    [],
  );

  // ── Signup ─────────────────────────────────────────────────────────────────

  const signup = useCallback(
    async (
      userData: Omit<User, 'id'> & { password: string },
    ): Promise<boolean> => {
      setError(null);

      if (!validateIdNumber(userData.role, userData.idNumber)) {
        setError(idFormatHint(userData.role));
        return false;
      }

      try {
        const { user: firebaseUser } = await createUserWithEmailAndPassword(
          auth,
          userData.email,
          userData.password,
        );

        await updateProfile(firebaseUser, { displayName: userData.name });

        const { password: _omit, ...rest } = userData;

        await setDoc(doc(db, 'users', firebaseUser.uid), {
          ...rest,
          profile_pic:
            rest.profile_pic ??
            `https://ui-avatars.com/api/?name=${encodeURIComponent(rest.name)}&background=0D8ABC&color=fff`,
          isNewUser: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        const newUser: User = { id: firebaseUser.uid, ...rest, isNewUser: true };
        SESSION.setUser(newUser);
        setCurrentUser(newUser);
        return true;
      } catch (err) {
        setError(toFriendlyError(err));
        return false;
      }
    },
    [],
  );

  // ── Logout ─────────────────────────────────────────────────────────────────

  const doLogout = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      // Set presence offline
      if (auth.currentUser?.uid) {
        const uid = auth.currentUser.uid;
        const ok = await setUserOffline(uid);
        if (!ok) await directWriteUserStatus(uid, 'offline');

        try {
          const { goOffline } = await import('firebase/database');
          const { rtdb } = await import('../firebase/config');
          goOffline(rtdb);
          const { cleanupPresence } = await import('../services/presenceService');
          cleanupPresence().catch(() => {/* non-fatal */});
        } catch {/* non-fatal */}
      }

      await firebaseSignOut(auth);
      SESSION.markIntentionalLogout();
      setCurrentUser(null);
      window.location.replace('/signin');
    } catch (err) {
      console.error('[Auth] Logout error:', err);
      setCurrentUser(null);
      window.location.replace('/signin');
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(
    async (skipConfirmation = false): Promise<void> => {
      if (skipConfirmation) {
        await doLogout();
      } else {
        setShowLogoutConfirm(true);
      }
    },
    [doLogout],
  );

  // ── Derived state ──────────────────────────────────────────────────────────

  const isAuthenticated = !!currentUser || SESSION.isAuthenticated;

  // ── Context value ──────────────────────────────────────────────────────────

  const value: AuthContextType = {
    currentUser,
    userData,
    loading,
    error,
    isAuthenticated,
    activateMFA,
    setCurrentUser,
    setError,
    setActivateMFA,
    login,
    signup,
    logout,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
      <ConfirmDialog
        open={showLogoutConfirm}
        title="Sign out"
        message={<span>Are you sure you want to sign out?</span>}
        confirmLabel="Sign out"
        cancelLabel="Cancel"
        confirmTone="danger"
        isProcessing={logoutProcessing || loading}
        onConfirm={async () => {
          setLogoutProcessing(true);
          setShowLogoutConfirm(false);
          try {
            await doLogout();
          } finally {
            setLogoutProcessing(false);
          }
        }}
        onCancel={() => {
          if (!logoutProcessing) setShowLogoutConfirm(false);
        }}
      />
    </AuthContext.Provider>
  );
};

export default AuthProvider;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normaliseEmail(input: string): string {
  if (!input.includes('@')) return `${input.replace(/-/g, '')}@bulsuspace.edu.ph`;
  if (input.endsWith('@bulsu.edu.ph'))
    return input.replace('@bulsu.edu.ph', '@bulsuspace.edu.ph');
  return input;
}

const ID_PATTERNS: Partial<Record<UserRole, RegExp>> = {
  student: /^\d{4}-?\d{6}$/,
  faculty: /^\d{4}-\d{3,}$/,
  alumni: /^A-\d{6}$/,
  admin: /^A-\d{6}$/,
  'super admin': /^A-\d{6}$/,
  dean: /^D-\d{3}$/,
};

function validateIdNumber(role: UserRole, id: string): boolean {
  const pattern = ID_PATTERNS[role];
  if (!pattern) return true; // Roles without a pattern are unconstrained.
  if (role === 'dean' && (!id || !pattern.test(id))) return true; // Dean IDs auto-assigned.
  return pattern.test(id);
}

function idFormatHint(role: UserRole): string {
  const hints: Partial<Record<UserRole, string>> = {
    student: 'YYYY-XXXXXX or YYYYXXXXXX',
    faculty: 'YYYY-XXX…',
    alumni: 'A-XXXXXX',
    admin: 'A-XXXXXX',
    'super admin': 'A-XXXXXX',
  };
  return `Invalid ID format for ${role}. Expected format: ${hints[role] ?? 'unknown'}.`;
}