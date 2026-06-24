import React, { useEffect, useMemo, useState } from 'react';
import { EnvelopeIcon, UserPlusIcon, QrCodeIcon, XMarkIcon, ClipboardIcon, ClipboardDocumentCheckIcon } from '@heroicons/react/24/outline';
import { CheckCircleIcon } from '@heroicons/react/24/solid';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

type FormState = {
  firstName: string;
  lastName: string;
  email: string;
};

const defaultForm: FormState = {
  firstName: '',
  lastName: '',
  email: '',
};

const GuestCreatePage: React.FC = () => {
  const [isQrOpen, setIsQrOpen] = useState(false);
  const [pageUrl, setPageUrl] = useState('https://bulsuspace.com/guest');
  const [form, setForm] = useState<FormState>(defaultForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [serverMessage, setServerMessage] = useState('');
  const [createdAccount, setCreatedAccount] = useState<{ loginEmail?: string; temporaryPassword?: string }>({});
  const [copied, setCopied] = useState(false);

  const cloudFunctionBase = useMemo(
    () => process.env.REACT_APP_FUNCTIONS_BASE_URL || 'https://us-central1-bulsuspace.cloudfunctions.net',
    []
  );

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setPageUrl(window.location.href);
    }
  }, []);

  const validate = (state: FormState) => {
    const nextErrors: Record<string, string> = {};
    if (!state.firstName.trim()) nextErrors.firstName = 'First name is required.';
    if (!state.lastName.trim()) nextErrors.lastName = 'Last name is required.';
    if (!state.email.trim()) {
      nextErrors.email = 'Email is required.';
    } else if (!emailPattern.test(state.email.trim())) {
      nextErrors.email = 'Enter a valid email address.';
    }
    return nextErrors;
  };

  const handleChange = (field: keyof FormState) => (event: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: '' }));
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (status === 'loading') return;

    const nextErrors = validate(form);
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }

    setStatus('loading');
    setServerMessage('');
    setCreatedAccount({});

    try {
      const response = await fetch(`${cloudFunctionBase}/createGuestAccountHttp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          email: form.email.trim(),
        }),
      });

      let payload: { success?: boolean; message?: string; loginEmail?: string; password?: string } = {};
      try {
        payload = await response.json();
      } catch {
        payload = {};
      }

      if (!response.ok || !payload?.success || !payload.loginEmail || !payload.password) {
        const friendly = payload?.message || 'Unable to create guest access right now. Please try again.';
        throw new Error(friendly);
      }

      setCreatedAccount({
        loginEmail: payload.loginEmail,
        temporaryPassword: payload.password,
      });
      setCopied(false);
      setErrors({});
      setStatus('success');
      setServerMessage('Guest access ready. Save these credentials to sign in.');
    } catch (error: any) {
      const message =
        typeof error?.message === 'string' && error.message.trim()
          ? error.message.trim()
          : 'Unable to create guest access right now. Please try again later.';
      setStatus('error');
      setServerMessage(message);
    }
  };

  const disableInputs = status === 'loading' || status === 'success';

  const handleCopyPassword = async () => {
    if (!createdAccount.temporaryPassword) return;
    try {
      await navigator.clipboard.writeText(createdAccount.temporaryPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (error) {
      console.error('[GuestCreatePage] Failed to copy password:', error);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-cyan-900/30 to-slate-950" />
      <div className="absolute -left-12 -top-24 w-72 h-72 bg-cyan-500/15 rounded-full blur-3xl" />
      <div className="absolute right-0 bottom-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl" />

      <div className="relative z-10 max-w-5xl mx-auto px-4 py-12">
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setIsQrOpen(true)}
            className="flex items-center gap-2 rounded-full border border-cyan-400/50 bg-cyan-500/20 px-4 py-2 text-sm font-medium text-cyan-100 transition hover:bg-cyan-500/30 hover:text-white"
          >
            <QrCodeIcon className="h-5 w-5" />
            Page QR Link
          </button>
        </div>
        <div className="mb-10 text-center">
          <div className="flex items-center justify-center gap-4">
            <img src="/images/bulsu-space-logo.png" alt="BulSU Space" className="h-14 w-14" />
            <div className="text-left">
              <p className="text-cyan-300 text-xs uppercase tracking-[0.45em]">Guest Onboarding</p>
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Create Your BulSU Space Guest Access</h1>
            </div>
          </div>
          <p className="mt-4 text-slate-300 max-w-2xl mx-auto">
            Submit your details to provision a guest account instantly. We will also email the same credentials so you can sign in to BulSU Space right away.
          </p>
        </div>

        <div className="grid md:grid-cols-[1.1fr_0.9fr] gap-8">
          <div className="bg-white/5 backdrop-blur border border-white/10 rounded-2xl p-8 shadow-2xl">
            <div className="flex items-center gap-3 text-cyan-300">
              <UserPlusIcon className="w-8 h-8" />
              <div>
                <p className="font-semibold text-white">What happens after you submit</p>
                <p className="text-sm text-slate-300">We create your guest login automatically—no manual review needed.</p>
              </div>
            </div>
            <ul className="mt-8 space-y-4 text-slate-200 text-sm">
              <li>
                <span className="font-semibold text-white">1.</span> Use your primary contact email; it becomes your BulSU Space login.
              </li>
              <li>
                <span className="font-semibold text-white">2.</span> A temporary password appears on this page and is sent to your inbox.
              </li>
              <li>
                <span className="font-semibold text-white">3.</span> Sign in immediately at{' '}
                <a href="/signin" className="text-cyan-300 hover:text-cyan-200 underline underline-offset-2">
                  bulsuspace.com/signin
                </a>{' '}
                and change the password under Settings.
              </li>
              <li>
                <span className="font-semibold text-white">4.</span> Guest accounts have limited access but can explore the community experience.
              </li>
            </ul>
            <div className="mt-10 text-sm text-slate-400">
              Need help? Email{' '}
              <a href="mailto:support@bulsuspace.com" className="text-cyan-300 hover:text-cyan-200">
                support@bulsuspace.com
              </a>
            </div>
          </div>

          <div className="bg-slate-900/60 border border-white/5 rounded-2xl p-8 shadow-2xl">
            <form onSubmit={handleSubmit} className="space-y-5" noValidate>
              <div>
                <label htmlFor="guest-first-name" className="block text-sm font-medium text-slate-200 mb-1">
                  First Name *
                </label>
                <input
                  id="guest-first-name"
                  type="text"
                  placeholder="Juan"
                  value={form.firstName}
                  onChange={handleChange('firstName')}
                  disabled={disableInputs}
                  autoComplete="given-name"
                  className={`w-full rounded-lg border bg-slate-900 px-3 py-2 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-400 ${
                    errors.firstName ? 'border-red-400' : 'border-white/10'
                  }`}
                  aria-invalid={Boolean(errors.firstName)}
                  aria-describedby={errors.firstName ? 'guest-first-name-error' : undefined}
                />
                {errors.firstName && (
                  <p id="guest-first-name-error" className="mt-1 text-xs text-red-400">
                    {errors.firstName}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="guest-last-name" className="block text-sm font-medium text-slate-200 mb-1">
                  Last Name *
                </label>
                <input
                  id="guest-last-name"
                  type="text"
                  placeholder="Dela Cruz"
                  value={form.lastName}
                  onChange={handleChange('lastName')}
                  disabled={disableInputs}
                  autoComplete="family-name"
                  className={`w-full rounded-lg border bg-slate-900 px-3 py-2 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-400 ${
                    errors.lastName ? 'border-red-400' : 'border-white/10'
                  }`}
                  aria-invalid={Boolean(errors.lastName)}
                  aria-describedby={errors.lastName ? 'guest-last-name-error' : undefined}
                />
                {errors.lastName && (
                  <p id="guest-last-name-error" className="mt-1 text-xs text-red-400">
                    {errors.lastName}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="guest-email" className="block text-sm font-medium text-slate-200 mb-1 flex items-center gap-2">
                  Email *
                  <EnvelopeIcon className="w-4 h-4 text-cyan-300" />
                </label>
                <input
                  id="guest-email"
                  type="email"
                  placeholder="you@example.com"
                  value={form.email}
                  onChange={handleChange('email')}
                  disabled={disableInputs}
                  autoComplete="email"
                  className={`w-full rounded-lg border bg-slate-900 px-3 py-2 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-400 ${
                    errors.email ? 'border-red-400' : 'border-white/10'
                  }`}
                  aria-invalid={Boolean(errors.email)}
                  aria-describedby={errors.email ? 'guest-email-error' : undefined}
                />
                {errors.email && (
                  <p id="guest-email-error" className="mt-1 text-xs text-red-400">
                    {errors.email}
                  </p>
                )}
              </div>

              {serverMessage && (
                <div
                  className={`text-sm rounded-lg px-3 py-2 ${
                    status === 'success'
                      ? 'bg-cyan-500/10 text-cyan-100 border border-cyan-400/40'
                      : 'bg-red-500/10 text-red-200 border border-red-500/40'
                  }`}
                  role="alert"
                >
                  {serverMessage}
                </div>
              )}

              <button
                type="submit"
                disabled={status === 'loading' || status === 'success'}
                className={`w-full flex items-center justify-center gap-2 rounded-lg py-3 font-semibold transition ${
                  status === 'success'
                    ? 'bg-cyan-500/40 text-white/90 border border-cyan-400/60 cursor-default'
                    : status === 'loading'
                    ? 'bg-cyan-500/30 text-white/80 border border-cyan-400/30 cursor-wait'
                    : 'bg-cyan-500 hover:bg-cyan-400 text-slate-900 border border-transparent'
                }`}
              >
                {status === 'loading' ? (
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                ) : status === 'success' ? (
                  <>
                    <CheckCircleIcon className="h-5 w-5" />
                    Access Ready
                  </>
                ) : (
                  'Create Guest Account'
                )}
              </button>
            </form>

            {status === 'success' && createdAccount.loginEmail && createdAccount.temporaryPassword && (
              <div className="mt-8 rounded-2xl border border-cyan-400/40 bg-cyan-500/10 p-5 text-sm text-cyan-100">
                <div className="flex items-center gap-2 text-cyan-50 font-semibold">
                  <CheckCircleIcon className="h-5 w-5" />
                  Guest access is active
                </div>
                <p className="mt-2 text-xs text-cyan-100/80">
                  Save these credentials. You can change the password anytime from Settings → Security after signing in.
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-cyan-400/30 bg-slate-950/40 p-3">
                    <p className="text-cyan-300 text-xs uppercase tracking-[0.2em]">Email</p>
                    <p className="mt-1 font-semibold text-white break-words">{createdAccount.loginEmail}</p>
                  </div>
                  <div className="rounded-lg border border-cyan-400/30 bg-slate-950/40 p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-cyan-300 text-xs uppercase tracking-[0.2em]">Temporary Password</p>
                      <button
                        type="button"
                        onClick={handleCopyPassword}
                        className="inline-flex items-center gap-1 rounded-md border border-cyan-400/40 bg-cyan-500/10 px-2 py-1 text-[11px] font-medium text-cyan-100 transition hover:bg-cyan-500/20 focus:outline-none focus:ring-2 focus:ring-cyan-300/70"
                        aria-label="Copy temporary password"
                      >
                        {copied ? (
                          <>
                            <ClipboardDocumentCheckIcon className="h-3.5 w-3.5" />
                            Copied
                          </>
                        ) : (
                          <>
                            <ClipboardIcon className="h-3.5 w-3.5" />
                            Copy
                          </>
                        )}
                      </button>
                    </div>
                    <p className="mt-2 font-semibold text-white select-all">{createdAccount.temporaryPassword}</p>
                  </div>
                </div>
                <div className="mt-4 rounded-lg border border-cyan-400/30 bg-cyan-500/10 p-3 text-xs text-cyan-50">
                  Portal link:{' '}
                  <a href="/signin" className="font-semibold text-white hover:underline">
                    bulsuspace.com/signin
                  </a>
                </div>
              </div>
            )}

            {status !== 'success' && (
              <div className="mt-8 rounded-xl border border-white/10 bg-white/5 p-5 text-sm text-slate-200">
                Submit the form to generate your credentials instantly. They will appear here and be emailed to you for safekeeping.
              </div>
            )}
          </div>
        </div>
      </div>

      {isQrOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="relative w-full max-w-sm rounded-2xl border border-cyan-400/30 bg-slate-900/95 p-6 text-center shadow-2xl">
            <button
              type="button"
              onClick={() => setIsQrOpen(false)}
              className="absolute right-3 top-3 rounded-full p-1 text-slate-300 transition hover:bg-white/10 hover:text-white"
              aria-label="Close QR code"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
            <div className="mx-auto w-44">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(pageUrl)}`}
                alt="QR code linking to this page"
                className="w-full rounded-xl border border-white/10 bg-white p-2"
              />
            </div>
            <p className="mt-4 text-sm text-slate-300">Scan to open this guest access page on another device.</p>
            <p className="mt-2 break-words text-xs text-slate-400">{pageUrl}</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default GuestCreatePage;
