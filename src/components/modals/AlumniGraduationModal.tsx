import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import { AcademicCapIcon } from '@heroicons/react/24/outline';

interface AlumniGraduationModalProps {
  isOpen: boolean;
  onConfirmGraduated: (graduationBatch: string) => void | Promise<void>;
  onConfirmNotGraduated: () => void | Promise<void>;
  autoCloseDelayMs?: number; // optional small delay before unmount (for micro-animation)
}

const AlumniGraduationModal: React.FC<AlumniGraduationModalProps> = ({ 
  isOpen, 
  onConfirmGraduated, 
  onConfirmNotGraduated,
  autoCloseDelayMs = 0
}) => {
  const [graduationBatch, setGraduationBatch] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [visible, setVisible] = useState(isOpen);

  // When opened, reset internal states
  React.useEffect(() => {
    if (isOpen) {
      setVisible(true);
      setGraduationBatch('');
      setError('');
      setSubmitting(false);
    } else {
      // allow small delay for exit animation if needed
      if (visible) {
        const t = setTimeout(() => setVisible(false), autoCloseDelayMs);
        return () => clearTimeout(t);
      }
    }
  }, [isOpen, autoCloseDelayMs]);

  if (!visible) return null;
  // Generate graduation batch options (from current academic year down to 2011-2012)
  const currentYear = new Date().getFullYear();
  const currentAcademicYear = new Date().getMonth() >= 7 ? currentYear : currentYear - 1; // Academic year starts in August
  const batchOptions = [];
  for (let startYear = currentAcademicYear; startYear >= 2011; startYear--) {
    const endYear = startYear + 1;
    batchOptions.push(`${startYear}-${endYear}`);
  }

  const handleSubmit = async () => {
    if (!graduationBatch) {
      setError('Please select your graduation batch');
      return;
    }
    if (submitting) return;
    setSubmitting(true);
    try {
      const result = onConfirmGraduated(graduationBatch);
      // Fire & forget if promise
      if (result && typeof (result as any).then === 'function') {
        (result as Promise<void>).catch(err => console.error('[AlumniGraduationModal] Background error:', err));
      }
    } finally {
      // parent will toggle isOpen false immediately; if not, auto hide
      if (autoCloseDelayMs === 0) {
        // rely on parent close, but safeguard fallback
        setTimeout(() => setVisible(false), 300);
      }
    }
  };

  const handleNotGraduatedClick = () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const result = onConfirmNotGraduated();
      if (result && typeof (result as any).then === 'function') {
        (result as Promise<void>).catch(err => console.error('[AlumniGraduationModal] Background error:', err));
      }
    } finally {
      if (autoCloseDelayMs === 0) {
        setTimeout(() => setVisible(false), 300);
      }
    }
  };

  const modalNode = (    <div className="fixed inset-0 z-[9999] w-screen h-screen flex items-center justify-center bg-black bg-opacity-70 backdrop-blur-sm transition-opacity duration-300 p-4">
      <div 
        className="relative bg-gradient-to-br from-gray-900 via-gray-950 to-gray-900 rounded-3xl shadow-2xl border border-green-700/60 px-6 py-8 sm:px-8 sm:py-10 max-w-lg w-full mx-4 text-center transform transition-all duration-300"
      >
        <div className="flex flex-col items-center text-center">
          {/* Icon with subtle glow ring */}
          <div className="relative h-24 w-24 mb-6 flex items-center justify-center">
            <span className="absolute inset-0 rounded-full bg-gradient-to-tr from-green-600/30 to-green-400/10 blur-2xl animate-pulse-slow" />
            <span className="absolute inset-0 rounded-full border-2 border-green-500/30 animate-spin-slow" />
            <div className="relative h-20 w-20 rounded-full bg-gradient-to-br from-green-500/15 to-emerald-600/20 border border-green-400/40 flex items-center justify-center shadow-inner">
              <AcademicCapIcon className="h-10 w-10 text-green-300 drop-shadow-[0_0_6px_rgba(34,197,94,0.6)]" />
            </div>
          </div>

          {/* Title */}
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white mb-3 tracking-tight">
            Graduation Status
          </h2>

          {/* Message */}
          <p className="text-gray-300 text-sm sm:text-base leading-relaxed mb-6 max-w-md">
            We detected you may be a BulSU alumnus. Please confirm your graduation status so we can tailor your BulSU Space experience.
          </p>

          {/* Batch Selection */}
          <div className="w-full mb-6 text-left">
            <label htmlFor="graduationBatch" className="block text-green-200 text-xs font-semibold tracking-wide mb-2 uppercase">
              Graduation Batch
            </label>
            <div className="relative">
              <select
                id="graduationBatch"
                value={graduationBatch}
                onChange={(e) => { setGraduationBatch(e.target.value); setError(''); }}
                className="w-full appearance-none px-4 py-3 pr-10 rounded-xl bg-green-900/40 border border-green-500/40 text-green-100 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/70 focus:border-green-400/70 transition shadow-inner"
              >
                <option value="">Select a batch</option>
                {batchOptions.map(batch => (
                  <option key={batch} value={batch}>{batch}</option>
                ))}
              </select>
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-green-300/70">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </span>
            </div>
            {error && <p className="mt-2 text-orange-300 text-xs font-medium">{error}</p>}
          </div>

          {/* Buttons */}
          <div className="w-full flex flex-col sm:flex-row gap-4">
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="group relative flex-1 px-8 py-4 rounded-2xl bg-gradient-to-r from-green-500 via-emerald-500 to-green-600 hover:from-green-400 hover:via-emerald-400 hover:to-green-500 text-white font-semibold text-sm tracking-wide shadow-[0_8px_30px_rgba(34,197,94,0.35)] hover:shadow-[0_12px_40px_rgba(34,197,94,0.45)] transform hover:scale-[1.03] active:scale-[0.97] transition-all duration-400 ease-[cubic-bezier(0.4,0,0.2,1)] focus:outline-none focus:ring-2 focus:ring-green-400/70 focus:ring-offset-2 focus:ring-offset-gray-900 overflow-hidden"
            >
              <span className="relative z-10 flex items-center justify-center gap-2">
                <div className="w-6 h-6 rounded-full bg-white/15 flex items-center justify-center group-hover:bg-white/25 transition-colors duration-300">
                  {submitting ? (
                    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v3m0 12v3m9-9h-3M6 12H3m15.364 6.364l-2.121-2.121M8.757 8.757L6.636 6.636m0 10.728l2.121-2.121m8.486-8.486l2.121-2.121" />
                    </svg>
                  ) : (
                    <svg className="w-3.5 h-3.5 transition-all duration-300 group-hover:scale-125 group-hover:rotate-12" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <span className="group-hover:tracking-wider transition-all duration-300">{submitting ? 'Updating...' : "Yes, I've Graduated"}</span>
              </span>
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            </button>
            <button
              onClick={handleNotGraduatedClick}
              disabled={submitting}
              className="group relative flex-1 px-8 py-4 rounded-2xl bg-gradient-to-br from-green-800/30 via-green-700/25 to-emerald-800/30 hover:from-green-700/40 hover:via-green-600/30 hover:to-emerald-700/40 backdrop-blur-md text-green-100 hover:text-white font-semibold text-sm tracking-wide border border-green-500/40 hover:border-green-300/60 shadow-[0_4px_20px_rgba(34,197,94,0.15)] hover:shadow-[0_8px_30px_rgba(34,197,94,0.25)] transform hover:scale-[1.03] active:scale-[0.97] transition-all duration-400 ease-[cubic-bezier(0.4,0,0.2,1)] focus:outline-none focus:ring-2 focus:ring-green-400/70 focus:ring-offset-2 focus:ring-offset-gray-900 overflow-hidden"
            >
              <span className="relative z-10 flex items-center justify-center gap-2">
                <div className="w-6 h-6 rounded-full border border-current opacity-60 flex items-center justify-center group-hover:opacity-100 group-hover:border-white group-hover:rotate-180 transition-all duration-500">
                  <svg className="w-3.5 h-3.5 transition-all duration-500 group-hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <span className="group-hover:tracking-wider transition-all duration-300">{submitting ? 'Saving...' : 'No, Not Yet'}</span>
              </span>
              <div className="absolute inset-0 border border-green-400/0 group-hover:border-green-400/20 rounded-2xl transition-colors duration-300" />
            </button>
          </div>

          {/* Decorative floating dots (like reference modal) */}
          <span className="absolute top-4 left-4 h-3 w-3 rounded-full bg-green-500/60 blur-md animate-bounce-slow" />
          <span className="absolute bottom-6 right-6 h-2 w-2 rounded-full bg-green-400/40 blur-[2px] animate-float" />
          <span className="absolute bottom-4 left-1/2 h-1.5 w-1.5 rounded-full bg-green-600/40 blur-[1px] animate-float2" />
        </div>
      </div>
    </div> );

  // Ensure portal to body so centering is relative to full viewport (avoids transformed ancestor issues)
  if (typeof document === 'undefined') return null;
  return ReactDOM.createPortal(modalNode, document.body);
};

export default AlumniGraduationModal;