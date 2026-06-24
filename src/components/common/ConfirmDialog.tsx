import React from 'react';
import ReactDOM from 'react-dom';
import '../../styles/modal-animations.css';

interface ConfirmDialogProps {
  open: boolean;
  title?: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmTone?: 'danger' | 'primary' | 'neutral';
  isProcessing?: boolean;
  /**
   * Whether to show the cancel button. Defaults to true.
   * Useful for success/info dialogs that only need a single confirmation action.
   */
  showCancel?: boolean;
  /**
   * Header tone controls the icon/color in the header badge. Defaults to 'danger'.
   */
  headerTone?: 'danger' | 'primary' | 'success' | 'neutral';
  /**
   * Optional z-index override for layered fullscreen/modal contexts.
   */
  zIndex?: number;
  onConfirm: () => void;
  onCancel: () => void;
}

const toneClasses = {
  danger:
    'from-red-600 to-rose-600 text-white hover:from-red-500 hover:to-rose-500',
  primary:
    'from-green-600 to-emerald-600 text-white hover:from-green-500 hover:to-emerald-500',
  neutral:
    'from-gray-600 to-gray-700 text-white hover:from-gray-500 hover:to-gray-600',
};

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title = 'Please confirm',
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmTone = 'primary',
  isProcessing = false,
  showCancel = true,
  headerTone = 'danger',
  zIndex = 9999,
  onConfirm,
  onCancel,
}) => {
  if (!open) return null;

  // Ensure we render outside of any parent stacking/overflow context
  if (typeof document === 'undefined') return null;

  const handleBackdropClick: React.MouseEventHandler<HTMLDivElement> = (e) => {
    if (e.target === e.currentTarget && !isProcessing) onCancel();
  };

  return ReactDOM.createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      style={{ zIndex }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      onClick={handleBackdropClick}
    >
      <div className="relative bg-gradient-to-br from-[#1a1b23] via-[#242526] to-[#1e1f24] rounded-2xl w-full max-w-md shadow-[0_25px_50px_-12px_rgba(0,0,0,0.8)] border border-gray-700/30 overflow-hidden modal-entry">
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/5 flex items-center gap-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-full border ${
            headerTone === 'danger'
              ? 'bg-red-500/10 border-red-400/20'
              : headerTone === 'success' || headerTone === 'primary'
              ? 'bg-green-500/10 border-green-400/20'
              : 'bg-gray-500/10 border-gray-400/20'
          }`}>
            {headerTone === 'danger' ? (
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 5c-.77-1.33-2.69-1.33-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z" />
              </svg>
            ) : (
              <svg className="h-5 w-5 text-green-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4" />
                <circle cx="12" cy="12" r="9" />
              </svg>
            )}
          </div>
          <h2 id="confirm-dialog-title" className="text-lg font-semibold text-white">
            {title}
          </h2>
        </div>

        {/* Body */}
        <div className="px-5 py-4 text-gray-200 text-sm leading-relaxed">
          {message}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 flex items-center justify-end gap-3 border-t border-white/5 bg-black/20">
          {showCancel && (
            <button
              type="button"
              className="px-4 py-2 rounded-lg text-gray-200 bg-gray-700/50 hover:bg-gray-700 transition-colors border border-gray-600/50 disabled:opacity-60"
              onClick={onCancel}
              disabled={isProcessing}
            >
              {cancelLabel}
            </button>
          )}
          <button
            type="button"
            className={`px-4 py-2 rounded-lg bg-gradient-to-br ${toneClasses[confirmTone]} transition-colors border border-white/10 disabled:opacity-60 disabled:cursor-not-allowed`}
            onClick={onConfirm}
            disabled={isProcessing}
          >
            {isProcessing ? 'Please wait…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ConfirmDialog;
