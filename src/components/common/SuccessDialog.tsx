import React, { useEffect } from 'react';
import ReactDOM from 'react-dom';
import '../../styles/modal-animations.css';

interface SuccessDialogProps {
  open: boolean;
  title?: string;
  message?: React.ReactNode;
  // new/old variants for compatibility
  okLabel?: string; // used by some callers
  onOk?: () => void;
  confirmLabel?: string; // used by older callers
  onConfirm?: () => void;
  onClose?: () => void;
  autoCloseMs?: number; // optional auto-close in milliseconds
}

const SuccessDialog: React.FC<SuccessDialogProps> = ({
  open,
  title = 'Success',
  message,
  okLabel = 'OK',
  onOk,
  confirmLabel,
  onConfirm,
  onClose,
  autoCloseMs,
}) => {
  const primaryLabel = confirmLabel || okLabel || 'OK';
  const primaryAction = onConfirm || onOk || (() => onClose?.());

  useEffect(() => {
    if (!open || !autoCloseMs || autoCloseMs <= 0) return;
    const t = setTimeout(() => { primaryAction?.(); }, autoCloseMs);
    return () => clearTimeout(t);
  }, [open, autoCloseMs, primaryAction]);

  if (!open) return null;
  if (typeof document === 'undefined') return null;

  const handleBackdropClick: React.MouseEventHandler<HTMLDivElement> = (e) => {
    if (e.target === e.currentTarget) primaryAction?.();
  };

  return ReactDOM.createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="success-dialog-title"
      onClick={handleBackdropClick}
    >
      <div className="relative bg-gradient-to-br from-[#0f1720] via-[#111217] to-[#0f1420] rounded-2xl w-full max-w-md shadow-[0_25px_50px_-12px_rgba(0,0,0,0.8)] border border-gray-700/30 overflow-hidden modal-entry">
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/5 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500/10 border border-green-400/20">
            <svg className="h-6 w-6 text-green-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 id="success-dialog-title" className="text-lg font-semibold text-white">
            {title}
          </h2>
        </div>

        {/* Body */}
        {message && (
          <div className="px-5 py-4 text-gray-200 text-sm leading-relaxed">
            {message}
          </div>
        )}

        {/* Footer */}
        <div className="px-5 py-4 flex items-center justify-end gap-3 border-t border-white/5 bg-black/20">
          <button
            type="button"
            className="px-4 py-2 rounded-lg bg-gradient-to-br from-green-600 to-emerald-600 text-white hover:from-green-500 hover:to-emerald-500 transition-colors border border-white/10"
            onClick={() => primaryAction?.()}
          >
            {primaryLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default SuccessDialog;
