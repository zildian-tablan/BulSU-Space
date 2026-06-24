import React from 'react';
import ReactDOM from 'react-dom';

interface ProfanityModalProps {
  open: boolean;
  detectedWords: string[];
  onClose: () => void;
}

const ProfanityModal: React.FC<ProfanityModalProps> = ({ open, detectedWords, onClose }) => {
  if (!open) return null;
  if (typeof document === 'undefined') return null; // SSR safeguard

  return ReactDOM.createPortal(
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" style={{ zIndex: 2147483648 }}>
      <div className="relative max-w-sm w-full rounded-xl shadow-2xl border border-cyan-500/40 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-6 animate-[fadeIn_160ms_ease-out]" role="alertdialog" aria-modal="true" aria-labelledby="profanity-modal-title">
        <div className="flex items-center mb-3">
          <div className="flex-shrink-0 mr-3">
            <svg className="w-8 h-8 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12c0 4.97-4.03 9-9 9s-9-4.03-9-9 4.03-9 9-9 9 4.03 9 9z" />
            </svg>
          </div>
          <h2 id="profanity-modal-title" className="text-xl font-bold text-cyan-200 tracking-wide">Profanity Detected</h2>
        </div>
        <p className="mb-4 text-cyan-100 text-sm">Your post contains the following inappropriate word(s):</p>
        <ul className="mb-4 list-disc list-inside text-cyan-300 text-base space-y-1 pl-4 max-h-40 overflow-y-auto pr-2">
          {detectedWords.map((word, idx) => (
            <li key={idx} className="font-semibold">{word}</li>
          ))}
        </ul>
        <button
          onClick={onClose}
          className="w-full py-2 px-4 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold shadow-md transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-cyan-400/70 focus:ring-offset-2 focus:ring-offset-gray-900"
          autoFocus
        >
          Close
        </button>
      </div>
    </div>,
    document.body
  );
};

export default ProfanityModal; 