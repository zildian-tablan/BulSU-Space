import React from 'react';

interface LogoutConfirmModalProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const LogoutConfirmModal: React.FC<LogoutConfirmModalProps> = ({
  open,
  onConfirm,
  onCancel,
}) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-gray-950 rounded-2xl shadow-2xl border border-red-800/30 px-8 py-6 max-w-sm w-full mx-4 animate-fade-in-up">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-red-600/20 rounded-lg">
            <span className="material-icons text-red-400 text-xl">logout</span>
          </div>
          <h2 className="text-xl font-bold text-red-400">Sign Out</h2>
        </div>
        
        <p className="text-gray-300 mb-6">
          Are you sure you want to sign out? You'll need to sign in again to access your account.
        </p>
        
        <div className="flex justify-end gap-3">
          <button
            className="px-5 py-2 rounded-lg bg-gray-800 text-gray-200 hover:bg-gray-700 transition-all font-semibold focus:outline-none focus:ring-2 focus:ring-gray-600"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className="px-5 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-all font-bold shadow focus:outline-none focus:ring-2 focus:ring-red-500"
            onClick={onConfirm}
          >
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
};

export default LogoutConfirmModal;
