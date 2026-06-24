import React from 'react';
import { ShieldExclamationIcon, TrashIcon, NoSymbolIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { User } from '../../contexts/AuthContext';

interface RevokeConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSoftRevoke: () => void; // sets revoked flag for self-delete flow
  onForceDelete: () => void; // immediate deletion
  targetUser?: Pick<User, 'id' | 'name' | 'email' | 'role'> | null;
  loadingAction?: 'soft' | 'force' | null;
  disableForce?: boolean;
}

const RevokeConfirmModal: React.FC<RevokeConfirmModalProps> = ({
  isOpen,
  onClose,
  onSoftRevoke,
  onForceDelete,
  targetUser,
  loadingAction,
  disableForce
}) => {
  if (!isOpen || !targetUser) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-3">
      <div className="w-full max-w-md rounded-xl bg-gradient-to-br from-gray-900 via-gray-850 to-gray-900 border border-green-600/30 shadow-2xl p-4 relative max-h-[80vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-green-400/60 hover:text-green-200 transition"
          aria-label="Close"
        >
          <XMarkIcon className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-green-600/20 to-green-500/10 border border-green-500/30 flex items-center justify-center">
            <ShieldExclamationIcon className="h-6 w-6 text-green-300" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-green-100">Confirm Access Revocation</h2>
            <p className="text-xs text-green-300/70">Choose how you want to proceed with this account.</p>
          </div>
        </div>
        {/* Target user display removed by request */}
        <div className="space-y-4">
          <div className="rounded-lg border border-orange-600/30 bg-orange-900/20 p-3">
            <div className="flex items-center gap-2 mb-1.5">
              <NoSymbolIcon className="h-4 w-4 text-orange-300" />
              <h3 className="text-xs font-semibold text-orange-200">Option 1: Revoke (User Self-Deletion)</h3>
            </div>
            <p className="text-[11px] text-orange-200/80 leading-relaxed">
              Temporarily lock the account. User loses access and will be asked to confirm deletion on next sign-in. If inactive for 10 days, it's auto-deleted. You can restore before deletion.
            </p>
            <button
              disabled={loadingAction === 'soft'}
              onClick={onSoftRevoke}
              className="mt-2.5 w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-gradient-to-r from-orange-600/80 to-orange-500/80 hover:from-orange-500 hover:to-orange-400 text-white text-xs font-semibold shadow-md hover:shadow-lg disabled:opacity-60 disabled:cursor-not-allowed transition"
            >
              {loadingAction === 'soft' && <span className="h-4 w-4 border-2 border-white/30 border-t-transparent rounded-full animate-spin" />}
              <span>{loadingAction === 'soft' ? 'Revoking...' : 'Revoke (Self-Delete Flow)'}</span>
            </button>
          </div>
          <div className="rounded-lg border border-red-600/40 bg-red-900/25 p-3">
            <div className="flex items-center gap-2 mb-1.5">
              <TrashIcon className="h-4 w-4 text-red-300" />
              <h3 className="text-xs font-semibold text-red-200">Option 2: Force Delete (Immediate)</h3>
            </div>
            <p className="text-[11px] text-red-200/80 leading-relaxed">
              Permanently delete now. User is signed out; access and profile data are removed. <strong>Cannot be undone.</strong>
            </p>
            <button
              disabled={disableForce || loadingAction === 'force'}
              onClick={onForceDelete}
              className="mt-2.5 w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-gradient-to-r from-red-600/80 to-red-500/80 hover:from-red-500 hover:to-red-400 text-white text-xs font-semibold shadow-md hover:shadow-lg disabled:opacity-40 disabled:cursor-not-allowed transition"
              title={disableForce ? 'Force delete disabled for this user' : 'Permanently delete now'}
            >
              {loadingAction === 'force' && <span className="h-4 w-4 border-2 border-white/30 border-t-transparent rounded-full animate-spin" />}
              <span>{loadingAction === 'force' ? 'Deleting...' : 'Force Delete Now'}</span>
            </button>
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-800/70 hover:bg-gray-700/80 text-green-200 border border-green-600/30 transition"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default RevokeConfirmModal;
