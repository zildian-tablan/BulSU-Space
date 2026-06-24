import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../../firebase/config';
import { useAuth } from '../../contexts/AuthContext';
import { RedirectAfterLogin } from '../../utils/redirectAfterLogin';

// ─── Constants ────────────────────────────────────────────────────────────────

const EMAIL_DOMAIN = '@bulsuspace.com';
const ALUMNI_ELIGIBILITY_YEARS = 4;
const FORM_STORAGE_KEY = 'bulsu-login-form';
const ID_PATTERN = /^\d{4}-?\d{6}$|^\d{10}$|^\d{4}-?\d{4}$|^\d{8}$/;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Normalise any email/ID input to a @bulsuspace.com address. */
function normaliseEmail(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed.includes('@')) {
    const base = ID_PATTERN.test(trimmed) ? trimmed.replace(/-/g, '') : trimmed;
    return `${base}${EMAIL_DOMAIN}`;
  }
  if (trimmed.endsWith('@bulsu.edu.ph'))
    return trimmed.replace('@bulsu.edu.ph', EMAIL_DOMAIN);
  return trimmed;
}

/** Extract the 4-digit enrollment year from a 10-digit student ID, if present. */
function extractEnrollmentYear(email: string): number {
  const idPart = email.includes('@') ? email.split('@')[0] : email;
  const clean = idPart.replace(/-/g, '');
  if (/^\d{10}$/.test(clean)) return parseInt(clean.substring(0, 4), 10);
  return 0;
}

/**
 * Resolve any stored / query-string intended URL to a relative path so we
 * never redirect to a foreign origin.
 */
function resolveReturnPath(raw: string | null): string | null {
  if (!raw) return null;
  try {
    let decoded = raw;
    try { decoded = decodeURIComponent(raw); } catch { /* keep as-is */ }
    if (decoded.startsWith('/')) return decoded;
    const url = new URL(decoded, window.location.origin);
    return `${url.pathname}${url.search}${url.hash}` || null;
  } catch {
    return null;
  }
}

/** Build the post-login destination path. */
function buildReturnPath(searchString: string): string {
  const params = new URLSearchParams(searchString);
  const fromQuery = resolveReturnPath(params.get('returnUrl'));
  const fromStorage = resolveReturnPath(RedirectAfterLogin.consumeIntendedUrl());
  return fromQuery ?? fromStorage ?? '/home';
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const EyeIcon: React.FC<{ visible: boolean }> = ({ visible }) =>
  visible ? (
    <svg className="h-5 w-5 bg-transparent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg className="h-5 w-5 bg-transparent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17.94 17.94C16.12 19.25 14.14 20 12 20c-7 0-11-8-11-8 1.61-2.93 4.16-6.09 8.06-7.94M3 3l18 18" />
      <path d="M9.53 9.53A3 3 0 0 0 12 15a3 3 0 0 0 2.47-5.47" />
    </svg>
  );

// ─── Component ────────────────────────────────────────────────────────────────

const SignIn: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, error, setError, loading } = useAuth();

  // ── Form state ─────────────────────────────────────────────────────────────

  const [email, setEmail] = useState(() => {
    if (sessionStorage.getItem('intentionalLogout') === 'true') return '';
    try {
      const saved = sessionStorage.getItem(FORM_STORAGE_KEY);
      return saved ? (JSON.parse(saved)?.email ?? '') : '';
    } catch { return ''; }
  });

  const [password, setPassword] = useState(() => {
    if (sessionStorage.getItem('intentionalLogout') === 'true') return '';
    try {
      const saved = sessionStorage.getItem(FORM_STORAGE_KEY);
      return saved ? (JSON.parse(saved)?.password ?? '') : '';
    } catch { return ''; }
  });

  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [credError, setCredError] = useState(false);

  // ── Graduation modal state ─────────────────────────────────────────────────

  const [showGradModal, setShowGradModal] = useState(false);
  const [graduationBatch, setGraduationBatch] = useState('');
  const [enrollmentYear, setEnrollmentYear] = useState<number>(0);

  // ── Lockout countdown ──────────────────────────────────────────────────────

  const [lockoutSeconds, setLockoutSeconds] = useState<number | null>(null);

  useEffect(() => {
    if (!error?.includes('Try again in')) { setLockoutSeconds(null); return; }
    const timePart = error.split('Try again in')[1]?.replace(/[^0-9:]/g, '').trim() ?? '';
    const [m = '0', s = '0'] = timePart.split(':');
    const total = parseInt(m, 10) * 60 + parseInt(s, 10);
    if (!isNaN(total) && total > 0) setLockoutSeconds(total);
  }, [error]);

  useEffect(() => {
    if (lockoutSeconds === null || lockoutSeconds <= 0) {
      if (lockoutSeconds === 0) setError(null);
      return;
    }
    const id = setInterval(() => setLockoutSeconds(p => (p !== null ? p - 1 : p)), 1000);
    return () => clearInterval(id);
  }, [lockoutSeconds, setError]);

  // ── Intentional-logout cleanup ─────────────────────────────────────────────

  useEffect(() => {
    if (sessionStorage.getItem('intentionalLogout') !== 'true') return;
    setEmail('');
    setPassword('');
    // Remove the flag after a brief delay so AuthRedirectRoute doesn't race it.
    const id = setTimeout(() => sessionStorage.removeItem('intentionalLogout'), 800);
    return () => clearTimeout(id);
  }, []);

  // ── Persist form to session storage ───────────────────────────────────────

  useEffect(() => {
    sessionStorage.setItem(FORM_STORAGE_KEY, JSON.stringify({ email, password }));
  }, [email, password]);

  // ── Email suggestion for datalist ─────────────────────────────────────────

  const emailSuggestion = (() => {
    const base = email.includes('@') ? email.split('@')[0] : email;
    if (!base) return '';
    const clean = ID_PATTERN.test(base) ? base.replace(/-/g, '') : base;
    return `${clean}${EMAIL_DOMAIN}`;
  })();

  // ── Field change handlers ──────────────────────────────────────────────────

  const clearErrors = useCallback(() => {
    if (error) setError(null);
    if (credError) setCredError(false);
  }, [error, credError, setError]);

  const handleEmailBlur = () => {
    if (!email) return;
    const normalised = normaliseEmail(email);
    if (normalised !== email) setEmail(normalised);
  };

  // ── Navigate post-login ────────────────────────────────────────────────────

  const navigateAfterLogin = useCallback(() => {
    const dest = buildReturnPath(location.search);
    sessionStorage.removeItem(FORM_STORAGE_KEY);
    navigate(dest, { replace: true });
  }, [location.search, navigate]);

  // ── Graduation-check helpers ───────────────────────────────────────────────

  const wasGraduationAlreadyChecked = async (uid: string): Promise<boolean> => {
    try {
      const snap = await getDoc(doc(db, 'graduation_check', uid));
      return snap.exists() && (snap.data() as any).isCompleted === true;
    } catch {
      return localStorage.getItem(`graduation-prompted-${uid}`) === 'true';
    }
  };

  const persistGraduationCheck = async (uid: string) => {
    localStorage.setItem(`graduation-prompted-${uid}`, 'true');
    try {
      await setDoc(
        doc(db, 'graduation_check', uid),
        { uid, isCompleted: true, updatedAt: serverTimestamp() },
        { merge: true },
      );
    } catch (err) {
      console.error('[SignIn] Could not persist graduation_check:', err);
    }
  };

  // ── Submit ─────────────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCredError(false);
    setSubmitting(true);

    // Clear stale session flags before a fresh login attempt.
    ['forceStayOnSignIn', 'intentionalLogout', 'isLoggingOut', 'logoutTimestamp'].forEach(k =>
      sessionStorage.removeItem(k),
    );

    const normalised = normaliseEmail(email);
    if (normalised !== email) setEmail(normalised);

    const year = extractEnrollmentYear(normalised);
    const success = await login(normalised, password);

    if (!success) {
      setCredError(true);
      setSubmitting(false);
      return;
    }

    // Check if this user might be an alumni based on enrollment year.
    const uid = auth.currentUser?.uid;
    const cutoff = new Date().getFullYear() - ALUMNI_ELIGIBILITY_YEARS;

    if (uid && year > 0 && year <= cutoff) {
      const alreadyChecked = await wasGraduationAlreadyChecked(uid);
      if (!alreadyChecked) {
        setEnrollmentYear(year);
        setShowGradModal(true);
        setSubmitting(false);
        return;
      }
    }

    setSubmitting(false);
    navigateAfterLogin();
  };

  // ── Graduation modal actions ───────────────────────────────────────────────

  const updateUserRole = async (isGraduated: boolean) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    setSubmitting(true);
    try {
      await persistGraduationCheck(uid);
      const ref = doc(db, 'users', uid);

      if (isGraduated) {
        await updateDoc(ref, {
          role: 'alumni',
          graduationBatch,
          updatedAt: serverTimestamp(),
        });
      } else {
        await updateDoc(ref, { role: 'student', updatedAt: serverTimestamp() });
      }

      setShowGradModal(false);
      navigateAfterLogin();
    } catch (err) {
      console.error('[SignIn] Error updating role:', err);
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const isBusy = submitting || loading;
  const isLocked = lockoutSeconds !== null && lockoutSeconds > 0;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-green-950 to-green-900 relative overflow-hidden py-12 px-4 sm:px-6 lg:px-8">
      {/* Background blobs */}
      <div className="absolute top-0 left-0 w-72 h-72 bg-green-600/20 rounded-full blur-3xl -z-10 animate-pulse" />
      <div className="absolute bottom-0 right-0 w-80 h-80 bg-green-400/10 rounded-full blur-3xl -z-10 animate-pulse" />

      <div className="max-w-md w-full space-y-8 shadow-2xl rounded-2xl bg-gray-900/80 backdrop-blur-md p-8 border border-gray-800/60">
        {/* Header */}
        <div className="text-center">
          <img
            className="mx-auto h-24 w-auto drop-shadow-[0_0_20px_rgba(34,197,94,0.5)] animate-fadeIn"
            src="/images/bulsu-space-logo.png"
            alt="BulSU Space"
          />
          <h2 className="mt-6 text-3xl font-extrabold text-white tracking-tight animate-fadeIn">
            Sign in to BulSU Space
          </h2>
          <p className="mt-2 text-green-400 text-base font-semibold animate-fadeInSlow">
            Connect. Collaborate. Succeed.
          </p>
        </div>

        {/* Error banner */}
        {error && (
          <div
            className="bg-red-500/20 border border-red-500/50 text-red-300 px-4 py-3 rounded"
            role="alert"
          >
            {isLocked ? (
              <>
                <span className="block font-medium mb-1">Account temporarily locked</span>
                <span className="flex items-center gap-2">
                  <svg className="w-5 h-5 animate-pulse shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Try again in{' '}
                  <span className="bg-red-500/30 px-2 py-0.5 rounded font-mono font-bold">
                    {`${Math.floor(lockoutSeconds! / 60)}:${(lockoutSeconds! % 60).toString().padStart(2, '0')}`}
                  </span>
                </span>
              </>
            ) : (
              <span>{error}</span>
            )}
          </div>
        )}

        {/* Form */}
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4">
            {/* Email / ID */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-1">
                Email or ID
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                list="email-suggestions"
                required
                value={email}
                onChange={e => { setEmail(e.target.value); clearErrors(); }}
                onBlur={handleEmailBlur}
                disabled={isBusy}
                placeholder="ID number or BulSU Space email"
                className={[
                  'appearance-none block w-full px-3 py-3 bg-gray-800/50 border placeholder-gray-500',
                  'text-gray-200 rounded-md focus:outline-none focus:ring-green-500/50 focus:border-green-500/50',
                  'sm:text-sm transition-all duration-200',
                  credError ? 'border-red-500/70 ring-2 ring-red-500/40' : 'border-gray-700',
                  isBusy ? 'opacity-60 cursor-not-allowed' : '',
                ].join(' ')}
              />
              <datalist id="email-suggestions">
                {emailSuggestion && <option value={emailSuggestion} />}
              </datalist>
            </div>

            {/* Password */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-1">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={e => { setPassword(e.target.value); clearErrors(); }}
                  disabled={isBusy}
                  placeholder="Password"
                  className={[
                    'appearance-none block w-full px-3 py-3 pr-12 bg-gray-800/50 border placeholder-gray-500',
                    'text-gray-200 rounded-md focus:outline-none focus:ring-green-500/50 focus:border-green-500/50',
                    'sm:text-sm transition-all duration-200',
                    credError ? 'border-red-500/70 ring-2 ring-red-500/40' : 'border-gray-700',
                    isBusy ? 'opacity-60 cursor-not-allowed' : '',
                  ].join(' ')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  disabled={isBusy}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center bg-transparent text-gray-400 hover:text-green-400 transition-colors duration-200 focus:outline-none"
                >
                  <EyeIcon visible={showPassword} />
                </button>
              </div>
            </div>
          </div>

          {/* Forgot password */}
          <div className="text-right text-sm">
            <Link
              to="/resetpassword"
              className="font-medium text-green-400 hover:text-green-300 underline underline-offset-4 transition-colors duration-200"
            >
              Forgot your password?
            </Link>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={isBusy || isLocked}
            className={[
              'group relative w-full flex justify-center py-3 px-4 border border-transparent',
              'text-base font-semibold rounded-lg text-white shadow-lg transition-all duration-300',
              'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500',
              'bg-gradient-to-r from-green-600 to-green-500 hover:from-green-700 hover:to-green-600',
              'disabled:opacity-60 disabled:cursor-not-allowed animate-fadeInSlow',
            ].join(' ')}
          >
            {isBusy ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.37 0 0 5.37 0 12h4z" />
                </svg>
                Signing in…
              </span>
            ) : isLocked ? (
              'Locked'
            ) : (
              'Sign In'
            )}
          </button>
        </form>
      </div>

      {/* Graduation check modal */}
      {showGradModal && (
        <GraduationModal
          enrollmentYear={enrollmentYear}
          graduationBatch={graduationBatch}
          onBatchChange={setGraduationBatch}
          onConfirm={() => updateUserRole(true)}
          onDeny={() => updateUserRole(false)}
          isBusy={submitting}
        />
      )}
    </div>
  );
};

// ─── GraduationModal ──────────────────────────────────────────────────────────

interface GraduationModalProps {
  enrollmentYear: number;
  graduationBatch: string;
  onBatchChange: (v: string) => void;
  onConfirm: () => void;
  onDeny: () => void;
  isBusy: boolean;
}

const GraduationModal: React.FC<GraduationModalProps> = ({
  enrollmentYear,
  graduationBatch,
  onBatchChange,
  onConfirm,
  onDeny,
  isBusy,
}) => {
  const currentYear = new Date().getFullYear();
  const batchYears = Array.from({ length: currentYear - 2016 + 1 }, (_, i) => 2016 + i);

  return (
    <div className="fixed z-50 inset-0 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen p-4">
        <div className="fixed inset-0 bg-gray-900/75 transition-opacity" aria-hidden="true" />
        <div className="relative bg-gray-800 rounded-lg shadow-xl max-w-lg w-full p-6">
          <h3 className="text-lg font-semibold text-white mb-2">Have you graduated?</h3>
          <p className="text-sm text-gray-300 mb-4">
            Your student ID suggests you enrolled
            {enrollmentYear ? ` in ${enrollmentYear}` : ' several years ago'}.
            Have you graduated from BulSU?
          </p>

          <label htmlFor="grad-batch" className="block text-sm font-medium text-gray-300 mb-1">
            If yes, select your graduation batch:
          </label>
          <select
            id="grad-batch"
            value={graduationBatch}
            onChange={e => onBatchChange(e.target.value)}
            className="block w-full px-3 py-2 bg-gray-700 border border-gray-600 text-white rounded-md
              focus:outline-none focus:ring-green-500 focus:border-green-500 sm:text-sm mb-6"
          >
            <option value="">Select your batch</option>
            {batchYears.map(y => (
              <option key={y} value={`${y}-${y + 1}`}>{`Batch ${y}–${y + 1}`}</option>
            ))}
          </select>

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
            <button
              type="button"
              onClick={onDeny}
              disabled={isBusy}
              className="px-4 py-2 rounded-md border border-gray-600 bg-gray-800 text-gray-300
                hover:bg-gray-700 text-sm font-medium focus:outline-none disabled:opacity-60"
            >
              No, still a student
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={!graduationBatch || isBusy}
              className="px-4 py-2 rounded-md bg-green-600 hover:bg-green-700 text-white text-sm
                font-medium focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Yes, I've graduated
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SignIn;