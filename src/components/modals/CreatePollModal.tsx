import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { XMarkIcon } from '@heroicons/react/24/outline';

interface PollOption {
  id: string;
  text: string;
  count: number;
}

interface CreatePollModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (pollOptions: PollOption[], question: string, durationDays?: number) => void;
  isSubmitting?: boolean;
  initialQuestion?: string;
  initialOptions?: PollOption[];
}

const CreatePollModal: React.FC<CreatePollModalProps> = ({
  open,
  onClose,
  onSubmit,
  isSubmitting = false,
  initialQuestion,
  initialOptions,
}) => {
  const [pollOptions, setPollOptions] = useState<PollOption[]>(initialOptions ?? []);
  const [newOptionText, setNewOptionText] = useState('');
  const [question, setQuestion] = useState(initialQuestion ?? '');
  const [error, setError] = useState<string | null>(null);
  const [durationDays, setDurationDays] = useState<number>(1); // Default to 1 day
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [showOptionsOverlay, setShowOptionsOverlay] = useState<boolean>(false);

  // Update state when modal opens with initial values
  useEffect(() => {
    if (open) {
      setPollOptions(initialOptions ?? []);
      setQuestion(initialQuestion ?? '');
      setNewOptionText('');
      setError(null);
      setDurationDays(1); // Reset to default
      setStep(1);
      setShowOptionsOverlay(false);
    }
    // Intentionally only reset when `open` changes. Avoid including
    // `initialOptions`/`initialQuestion` in deps because callers may
    // omit them and the default array would be re-created every render,
    // causing the modal to reset while the user types.
  }, [open]);

  if (!open) return null;
  if (typeof document === 'undefined') return null; // SSR safeguard

  const addPollOption = () => {
    const text = newOptionText.trim();
    if (!text) return;
    
    // Check if option already exists
    if (pollOptions.some(opt => opt.text.toLowerCase() === text.toLowerCase())) {
      setError('This option already exists');
      return;
    }

    // Check if we've reached the maximum number of options (10)
    if (pollOptions.length >= 10) {
      setError('Maximum 10 poll options allowed');
      return;
    }

    const id = crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    setPollOptions(prev => [...prev, { id, text, count: 0 }]);
    setNewOptionText('');
    setError(null);
  };

  const removePollOption = (id: string) => {
    setPollOptions(prev => prev.filter(o => o.id !== id));
    setError(null);
  };

  const updatePollOptionText = (id: string, text: string) => {
    setPollOptions(prev => prev.map(o => o.id === id ? { ...o, text } : o));
    setError(null);
  };

  const canProceedOptions = () => pollOptions.length >= 2 && pollOptions.every(opt => !!opt.text.trim());

  const nextStep = () => {
    setError(null);
    if (step === 1) {
      setStep(2);
      setShowOptionsOverlay(true);
    } else if (step === 2) {
      if (!canProceedOptions()) {
        setError('Please add at least two options and ensure none are blank.');
        return;
      }
      setShowOptionsOverlay(false);
      setStep(3);
    }
  };

  const prevStep = () => {
    setError(null);
    if (step === 2) {
      setShowOptionsOverlay(false);
      setStep(1);
    } else if (step === 3) {
      setStep(2);
      setShowOptionsOverlay(true);
    }
  };

  const handleFinalSubmit = () => {
    if (!canProceedOptions()) {
      setStep(2);
      setShowOptionsOverlay(true);
      setError('Please add at least two options and ensure none are blank.');
      return;
    }
    onSubmit(pollOptions, question.trim(), durationDays);
  };

  const handleClose = () => {
    if (pollOptions.length > 0 || newOptionText.trim() || question.trim()) {
      const confirmed = window.confirm('Discard poll? All poll options and question will be lost.');
      if (!confirmed) return;
    }
    
    // Reset state
    setPollOptions([]);
    setNewOptionText('');
    setQuestion('');
    setError(null);
    setDurationDays(1);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addPollOption();
    }
  };

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[2147483647] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="relative max-w-md w-full rounded-xl shadow-2xl border border-cyan-500/40 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-6 animate-[fadeIn_160ms_ease-out]" role="dialog" aria-modal="true" aria-labelledby="create-poll-modal-title">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center">
            <div className="flex-shrink-0 mr-3">
              <svg className="w-8 h-8 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <div>
              <h2 id="create-poll-modal-title" className="text-xl font-bold text-cyan-200 tracking-wide">Create Poll</h2>
              {/* Step indicator */}
              <div className="mt-1 flex items-center gap-2 text-xs text-gray-400">
                <span className={step === 1 ? 'text-cyan-300' : ''}>1. Question</span>
                <span>•</span>
                <span className={step === 2 ? 'text-cyan-300' : ''}>2. Options</span>
                <span>•</span>
                <span className={step === 3 ? 'text-cyan-300' : ''}>3. Duration</span>
              </div>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-1 rounded-lg hover:bg-gray-700/50 transition-colors"
            aria-label="Close modal"
          >
            <XMarkIcon className="h-6 w-6 text-gray-400" />
          </button>
        </div>

        {/* Error message */}
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/20 border border-red-500/40">
            <p className="text-red-300 text-sm">{error}</p>
          </div>
        )}

        {/* Step 1: Question */}
        {step === 1 && (
          <div className="mb-4">
            <label className="text-sm font-medium text-gray-300 mb-2 block">Poll Question</label>
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask your question or describe what you want to poll about..."
              className="w-full px-3 py-2 rounded-lg bg-gray-800/50 border border-gray-700/30 text-gray-100 text-sm focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 resize-none"
              rows={4}
              disabled={isSubmitting}
            />
            <p className="text-xs text-gray-400 mt-1">Optional: You can leave this blank.</p>
          </div>
        )}

        {/* Step 2: Options summary + manage button */}
        {step === 2 && (
          <div className="space-y-3">
            <div className="text-sm text-gray-300">Add at least two options.</div>
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <span className="px-2 py-1 rounded bg-gray-800/60 border border-gray-700/40">{pollOptions.length}/10 options</span>
              {!canProceedOptions() && <span className="text-red-300">Need 2+ non-empty options</span>}
            </div>
            <button
              type="button"
              onClick={() => setShowOptionsOverlay(true)}
              disabled={isSubmitting}
              className="w-full px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-medium transition-colors"
            >
              Manage Options
            </button>

            {/* Quick preview list */}
            <div className="mt-2 space-y-1 max-h-40 overflow-auto">
              {pollOptions.length === 0 && (
                <div className="text-xs text-gray-500">No options yet.</div>
              )}
              {pollOptions.map((opt, idx) => (
                <div key={opt.id} className="flex items-center gap-2 text-xs text-gray-300">
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-700 text-gray-200 mr-1">{idx + 1}</span>
                  <span className="truncate">{opt.text || <em className="text-gray-500">(empty)</em>}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 3: Duration */}
        {step === 3 && (
          <div className="mb-4">
            <label className="text-sm font-medium text-gray-300 mb-2 block">Poll Duration</label>
            <div className="flex gap-2">
              {[1, 2, 3].map((days) => (
                <button
                  key={days}
                  type="button"
                  onClick={() => setDurationDays(days)}
                  disabled={isSubmitting}
                  className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    durationDays === days
                      ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-500/30'
                      : 'bg-gray-800/50 text-gray-300 hover:bg-gray-700/50 border border-gray-700/30'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {days} {days === 1 ? 'Day' : 'Days'}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Poll will automatically be deleted after {durationDays} {durationDays === 1 ? 'day' : 'days'}
            </p>
          </div>
        )}

        {/* Navigation buttons (Cancel removed) */}
        <div className="mt-6 flex items-center gap-3">
          {step > 1 && (
            <button
              onClick={prevStep}
              disabled={isSubmitting}
              className="flex-1 px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white disabled:opacity-50 transition-colors"
            >
              Back
            </button>
          )}
          {step < 3 && (
            <button
              onClick={nextStep}
              disabled={isSubmitting}
              className="flex-1 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white disabled:opacity-50 transition-colors"
            >
              Next
            </button>
          )}
          {step === 3 && (
            <button
              onClick={handleFinalSubmit}
              disabled={isSubmitting}
              className="flex-1 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-medium transition-colors"
            >
              {isSubmitting ? (
                <div className="flex items-center justify-center">
                  <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2"></div>
                  Creating...
                </div>
              ) : (
                'Create Poll'
              )}
            </button>
          )}
        </div>

        {/* Options Overlay (Step 2) */}
        {showOptionsOverlay && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60">
            <div className="w-full max-w-md mx-auto rounded-xl bg-gray-900 border border-cyan-500/40 p-5 shadow-2xl">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold text-cyan-200">Edit Options</h3>
                <button onClick={() => setShowOptionsOverlay(false)} className="p-1 rounded hover:bg-gray-800" aria-label="Close options">
                  <XMarkIcon className="h-5 w-5 text-gray-400" />
                </button>
              </div>
              {/* Add option input */}
              <div className="mb-4">
                <label className="text-sm font-medium text-gray-300 mb-2 block">Add Poll Option</label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 relative">
                    <input
                      type="text"
                      value={newOptionText}
                      onChange={(e) => setNewOptionText(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Enter poll option..."
                      className="w-full px-3 py-2 rounded-lg bg-gray-800/50 border border-gray-700/30 text-gray-100 text-sm focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50"
                      disabled={isSubmitting}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={addPollOption}
                    disabled={isSubmitting || !newOptionText.trim() || pollOptions.length >= 10}
                    className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-medium transition-colors"
                  >
                    Add
                  </button>
                </div>
                <p className="text-xs text-gray-400 mt-1">{pollOptions.length}/10 options • Press Enter to add</p>
              </div>

              {/* Poll options list */}
              <div className="mb-4 space-y-2 max-h-60 overflow-y-auto">
                {pollOptions.length === 0 && (
                  <div className="text-center py-4 text-gray-400 text-sm">Add at least 2 options to continue</div>
                )}
                {pollOptions.map((opt, idx) => (
                  <div key={opt.id} className="flex items-center gap-2 border border-gray-700/25 rounded-lg px-3 py-2 bg-gray-800/30">
                    <div className="w-6 h-6 flex items-center justify-center text-xs text-gray-300 bg-gray-700 rounded-full font-medium">
                      {idx + 1}
                    </div>
                    <input
                      value={opt.text}
                      onChange={(e) => updatePollOptionText(opt.id, e.target.value)}
                      className="flex-1 px-2 py-1 bg-transparent text-gray-100 text-sm placeholder-gray-400 focus:outline-none focus:border-b focus:border-cyan-500/50"
                      disabled={isSubmitting}
                    />
                    <button
                      type="button"
                      onClick={() => removePollOption(opt.id)}
                      disabled={isSubmitting}
                      aria-label="Remove option"
                      className="p-1 rounded hover:bg-red-600/20 transition-colors"
                    >
                      <XMarkIcon className="h-4 w-4 text-red-400" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Overlay footer: Back and Next (Next validates and advances) */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    // Close options overlay and return to question step
                    setShowOptionsOverlay(false);
                    setStep(1);
                  }}
                  disabled={isSubmitting}
                  className="flex-1 px-4 py-2 rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-800 disabled:opacity-50 transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={() => {
                    if (!canProceedOptions()) {
                      setError('Need 2+ non-empty options to proceed.');
                      return;
                    }
                    // Close overlay and advance to next step
                    setShowOptionsOverlay(false);
                    setStep(3);
                  }}
                  disabled={isSubmitting}
                  className="flex-1 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

export default CreatePollModal;
