import React from 'react';
import { NoSymbolIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { User } from '../../contexts/AuthContext';

interface SimpleArchiveConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  targetUser?: Pick<User, 'id' | 'name' | 'email' | 'role'> | null;
  loading?: boolean;
}

const SimpleArchiveConfirmModal: React.FC<SimpleArchiveConfirmModalProps> = ({ 
  isOpen, 
  onClose, 
  onConfirm, 
  targetUser, 
  loading 
}) => {
  if (!isOpen || !targetUser) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl bg-gradient-to-br from-gray-900 via-gray-850 to-gray-900 border border-green-600/30 shadow-2xl p-6 relative">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-green-400/60 hover:text-green-200 transition"
          aria-label="Close"
        >
          <XMarkIcon className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-4 mb-4">
          <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-orange-600/20 to-orange-500/10 border border-orange-500/30 flex items-center justify-center">
            <NoSymbolIcon className="h-8 w-8 text-orange-300" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-green-100">Archive User</h2>
            <p className="text-sm text-green-300/70">Are you sure you want to archive this user?</p>
          </div>
        </div>

        <div className="mb-4 rounded-lg border border-green-600/30 bg-gray-900/60 p-4">
          <p className="text-sm text-green-200 font-medium mb-1">Target User</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-green-300/80">
            <span><strong>ID:</strong> {targetUser.id}</span>
            <span><strong>Name:</strong> {targetUser.name || '—'}</span>
            <span><strong>Email:</strong> {targetUser.email}</span>
            <span><strong>Role:</strong> {targetUser.role}</span>
          </div>
        </div>

        <div className="mb-4 rounded-lg border border-orange-600/30 bg-orange-900/20 p-4">
          <p className="text-xs text-orange-200/80 leading-relaxed">
            This user will be temporarily restricted and will not be able to access the community. 
            The restriction will automatically expire after 3 days, or you can restore access manually at any time.
          </p>
        </div>

        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-gray-800/70 hover:bg-gray-700/80 text-green-200 border border-green-600/30 transition disabled:opacity-60 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-gradient-to-r from-orange-600/80 to-orange-500/80 hover:from-orange-500 hover:to-orange-400 text-white shadow-md hover:shadow-lg disabled:opacity-60 disabled:cursor-not-allowed transition inline-flex items-center gap-2"
          >
            {loading && <span className="h-4 w-4 border-2 border-white/30 border-t-transparent rounded-full animate-spin" />}
            <span>{loading ? 'Archiving...' : 'Archive User'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default SimpleArchiveConfirmModal;
