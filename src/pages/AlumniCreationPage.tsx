import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { CheckCircleIcon, ShieldCheckIcon } from '@heroicons/react/24/solid';
import { EnvelopeIcon } from '@heroicons/react/24/outline';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const studentNumberPattern = /^[A-Za-z0-9-]{4,}$/;

type FormState = {
  firstName: string;
  lastName: string;
  studentNumber: string;
  email: string;
};

type CreationResponse = {
  success: boolean;
  loginEmail?: string;
  idNumber?: string;
  contactEmail?: string;
};

const defaultForm: FormState = {
  firstName: '',
  lastName: '',
  studentNumber: '',
  email: '',
};

const AlumniCreationPage: React.FC = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState<FormState>(defaultForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [serverMessage, setServerMessage] = useState('');
  const [createdAccount, setCreatedAccount] = useState<{ loginEmail?: string; idNumber?: string }>({});

  useEffect(() => {
    if (currentUser) {
      navigate('/home', { replace: true });
    }
  }, [currentUser, navigate]);

  const cloudFunctionBase = useMemo(() => (
    process.env.REACT_APP_FUNCTIONS_BASE_URL || 'https://us-central1-bulsuspace.cloudfunctions.net'
  ), []);

  const validate = (state: FormState) => {
    const nextErrors: Record<string, string> = {};
    if (!state.firstName.trim()) nextErrors.firstName = 'First name is required.';
    if (!state.lastName.trim()) nextErrors.lastName = 'Last name is required.';
    if (!state.email.trim()) {
      nextErrors.email = 'Email is required.';
    } else if (!emailPattern.test(state.email.trim())) {
      nextErrors.email = 'Enter a valid email address.';
    }
    if (state.studentNumber && !studentNumberPattern.test(state.studentNumber.trim())) {
      nextErrors.studentNumber = 'Use at least 4 letters, numbers, or dashes.';
    }
    return nextErrors;
  };

  const handleChange = (field: keyof FormState) => (event: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: '' }));
    }
  };

  const parseError = (err: unknown): string => {
    if (err && typeof err === 'object' && 'message' in err) {
      const message = String((err as any).message);
      const friendly = message.split(':').pop()?.trim();
      if ((err as any).code === 'functions/already-exists') {
        return friendly || 'An account for this email already exists.';
      }
      if ((err as any).code === 'functions/resource-exhausted') {
        return friendly || 'Too many attempts. Please try again shortly.';
      }
      if ((err as any).code === 'functions/invalid-argument') {
        return friendly || 'Please check the information you entered.';
      }
      return friendly || 'Unable to create your account right now.';
    }
    return 'Unable to create your account right now.';
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (status === 'loading') return;
    const nextErrors = validate(form);
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }
    setStatus('loading');
    setServerMessage('');
    try {
      const response = await fetch(`${cloudFunctionBase}/createAlumniAccountHttp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          studentNumber: form.studentNumber.trim() || null,
          email: form.email.trim(),
        }),
      });

      const data = await response.json() as CreationResponse & { message?: string };
      if (!response.ok || !data?.success) {
        throw new Error(data?.message || 'Unable to create account.');
      }
      if (!data?.success) {
        throw new Error('Unable to create account.');
      }
      setCreatedAccount({ loginEmail: data.loginEmail, idNumber: data.idNumber });
      setStatus('success');
      setServerMessage('Account created! Check your inbox for your credentials.');
      setErrors({});
    } catch (err) {
      console.error('[AlumniCreationPage] createAlumniAccount failed:', err);
      setStatus('error');
      setServerMessage(parseError(err));
    }
  };

  const disableInputs = status === 'loading' || status === 'success';

  return (
    <div className="min-h-screen bg-slate-950 text-white relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-emerald-900/40 to-slate-950" />
      <div className="absolute -right-12 -top-12 w-64 h-64 bg-emerald-500/20 rounded-full blur-3xl" />
      <div className="absolute left-0 bottom-0 w-72 h-72 bg-cyan-500/10 rounded-full blur-3xl" />

      <div className="relative z-10 max-w-6xl mx-auto px-4 py-12">
        <div className="mb-10 text-center">
          <div className="flex items-center justify-center gap-3">
            <img src="/images/bulsu-space-logo.png" alt="BulSU Space" className="h-16 w-16" />
            <div className="text-left">
              <p className="text-emerald-300 text-sm uppercase tracking-[0.4em]">Alumni Access</p>
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Create Your BulSU Space Alumni Account</h1>
            </div>
          </div>
          <p className="mt-4 text-slate-300 max-w-3xl mx-auto">
            Provide a few details so we can securely provision your alumni credentials. We will email your BulSU Space login and initial password once your profile is created.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          <div className="bg-white/5 backdrop-blur border border-white/10 rounded-2xl p-8 shadow-2xl">
            <div className="flex items-center gap-3 text-emerald-300">
              <ShieldCheckIcon className="w-8 h-8" />
              <div>
                <p className="font-semibold text-white">Secure & Verified</p>
                <p className="text-sm text-slate-300">Your submission is checked against existing records to prevent duplicate accounts.</p>
              </div>
            </div>
            <ul className="mt-8 space-y-4 text-slate-200 text-sm">
              <li>
                <span className="font-semibold text-white">1.</span> Use the same name you used when you studied at BulSU for quicker verification.
              </li>
              <li>
                <span className="font-semibold text-white">2.</span> If you still remember your student number, include it. Otherwise leave it blank.
              </li>
              <li>
                <span className="font-semibold text-white">3.</span> We will send credentials to the email you list below. Keep that inbox accessible.
              </li>
              <li>
                <span className="font-semibold text-white">4.</span> Once you sign in, please update your password and profile under Settings.
              </li>
            </ul>
            <div className="mt-10 text-sm text-slate-400">
              Need help? Email <a href="mailto:support@bulsuspace.com" className="text-emerald-300 hover:text-emerald-200">support@bulsuspace.com</a>
            </div>
          </div>

          <div className="bg-slate-900/60 border border-white/5 rounded-2xl p-8 shadow-2xl">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-200 mb-1">First Name *</label>
                <input
                  type="text"
                  className={`w-full rounded-lg border px-3 py-2 bg-slate-900 focus:ring-2 focus:ring-emerald-400 outline-none ${errors.firstName ? 'border-red-400' : 'border-white/10'}`}
                  placeholder="Juan"
                  value={form.firstName}
                  onChange={handleChange('firstName')}
                  disabled={disableInputs}
                />
                {errors.firstName && <p className="mt-1 text-xs text-red-400">{errors.firstName}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-200 mb-1">Last Name *</label>
                <input
                  type="text"
                  className={`w-full rounded-lg border px-3 py-2 bg-slate-900 focus:ring-2 focus:ring-emerald-400 outline-none ${errors.lastName ? 'border-red-400' : 'border-white/10'}`}
                  placeholder="Dela Cruz"
                  value={form.lastName}
                  onChange={handleChange('lastName')}
                  disabled={disableInputs}
                />
                {errors.lastName && <p className="mt-1 text-xs text-red-400">{errors.lastName}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-200 mb-1 flex items-center gap-2">Past Student Number <span className="text-slate-400 text-xs">optional</span></label>
                <input
                  type="text"
                  className={`w-full rounded-lg border px-3 py-2 bg-slate-900 focus:ring-2 focus:ring-emerald-400 outline-none ${errors.studentNumber ? 'border-red-400' : 'border-white/10'}`}
                  placeholder="2015-123456"
                  value={form.studentNumber}
                  onChange={handleChange('studentNumber')}
                  disabled={disableInputs}
                />
                {errors.studentNumber && <p className="mt-1 text-xs text-red-400">{errors.studentNumber}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-200 mb-1 flex items-center gap-2">Contact Email * <EnvelopeIcon className="w-4 h-4 text-emerald-300" /></label>
                <input
                  type="email"
                  className={`w-full rounded-lg border px-3 py-2 bg-slate-900 focus:ring-2 focus:ring-emerald-400 outline-none ${errors.email ? 'border-red-400' : 'border-white/10'}`}
                  placeholder="you@example.com"
                  value={form.email}
                  onChange={handleChange('email')}
                  disabled={disableInputs}
                />
                {errors.email && <p className="mt-1 text-xs text-red-400">{errors.email}</p>}
              </div>

              {serverMessage && (
                <div className={`text-sm rounded-lg px-3 py-2 ${status === 'success' ? 'bg-emerald-500/10 text-emerald-200 border border-emerald-400/40' : 'bg-red-500/10 text-red-200 border border-red-500/40'}`}>
                  {serverMessage}
                </div>
              )}

              <button
                type="submit"
                disabled={disableInputs}
                className={`w-full flex items-center justify-center gap-2 rounded-lg py-3 font-semibold transition ${disableInputs ? 'bg-emerald-600/40 cursor-not-allowed text-white/70' : 'bg-emerald-500 hover:bg-emerald-400 text-slate-900'}`}
              >
                {status === 'loading' ? (
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                ) : (
                  <>
                    <ShieldCheckIcon className="w-5 h-5" />
                    <span>{status === 'success' ? 'Request Submitted' : 'Create Account'}</span>
                  </>
                )}
              </button>
            </form>

            {status === 'success' && (
              <div className="mt-8 rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-5 text-sm text-emerald-100">
                <div className="flex items-center gap-2 text-emerald-200 font-semibold mb-3">
                  <CheckCircleIcon className="w-5 h-5" />
                  <span>Credentials on the way</span>
                </div>
                {createdAccount.loginEmail && (
                  <p className="mb-1">BulSU Space login: <span className="font-semibold text-white">{createdAccount.loginEmail}</span></p>
                )}
                {createdAccount.idNumber && (
                  <p className="mb-1">Temporary ID: <span className="font-semibold text-white">{createdAccount.idNumber}</span></p>
                )}
                <p className="text-xs text-slate-200 mt-3">We sent your temporary password to the email you provided. Check your inbox (and spam folder) for the message titled “Your BulSU Space Alumni Credentials”.</p>
              </div>
            )}

            <div className="mt-8 text-center text-sm text-slate-400">
              Already have access?{' '}
              <Link to="/signin" className="text-emerald-300 hover:text-emerald-200 font-semibold">
                Go to Sign In
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AlumniCreationPage;
