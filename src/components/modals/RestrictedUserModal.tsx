import React from 'react';
import ReactDOM from 'react-dom';
import { NoSymbolIcon } from '@heroicons/react/24/outline';

interface RestrictedUserModalProps {
  isOpen: boolean;
  onAcknowledge: () => void;
}

const RestrictedUserModal: React.FC<RestrictedUserModalProps> = ({ isOpen, onAcknowledge }) => {
  if (!isOpen) return null;

  // Ensure running in browser (avoid SSR issues)
  if (typeof document === 'undefined') return null;

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl bg-gradient-to-br from-orange-900 via-red-800 to-orange-900 border border-orange-500/40 shadow-2xl p-8 relative text-center animate-[fadeIn_180ms_ease-out]" role="alertdialog" aria-modal="true" aria-labelledby="restricted-modal-title">
        <div className="flex flex-col items-center space-y-6">
          {/* Icon */}
          <div className="w-24 h-24 rounded-full bg-gradient-to-br from-orange-500/20 to-red-600/30 border-2 border-orange-400/30 flex items-center justify-center shadow-lg">
            <NoSymbolIcon className="h-12 w-12 text-orange-300" />
          </div>
          
          {/* Title */}
          <h2 id="restricted-modal-title" className="text-2xl font-bold text-orange-100">
            Account Archived
          </h2>

          {/* Message */}
          <div className="space-y-3">
            <p className="text-orange-200/90 text-lg font-medium">
              This account has been archived due to prolonged inactivity.
            </p>
            <p className="text-orange-300/80 text-sm">
              Archived accounts are deactivated and cannot access the platform. To request reactivation, please contact the Super Administrator and provide the account details for review.
            </p>
            <p className="text-red-400/70 text-xs font-medium mt-2">
              Reactivation is subject to administrative approval.
            </p>
          </div>
          
          {/* Button */}
          <button onClick={onAcknowledge} autoFocus className="w-full px-6 py-3 rounded-xl bg-gradient-to-r from-orange-600/80 to-red-500/80 hover:from-orange-500 hover:to-red-400 text-white font-semibold text-lg shadow-lg hover:shadow-xl transition-all duration-200 ease-in-out border border-orange-400/30 focus:outline-none focus:ring-2 focus:ring-orange-400/50">
            Acknowledge
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default RestrictedUserModal;
