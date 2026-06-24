import React, { useState } from 'react';
import { NoSymbolIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { User } from '../../contexts/AuthContext';

interface ArchiveConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (remark: string) => void;
  targetUser?: Pick<User, 'id' | 'name' | 'email' | 'role'> | null;
  loading?: boolean;
}

const options = [
  'Leave of Absence',
  'Transferee',
  'Shifter',
  'Unofficially Dropped',
  'Officially Dropped'
];

const ArchiveConfirmModal: React.FC<ArchiveConfirmModalProps> = ({ isOpen, onClose, onConfirm, targetUser, loading }) => {
  const [remark, setRemark] = useState(options[0]);

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
            <p className="text-sm text-green-300/70">Select a remark describing the reason for archiving this user.</p>
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

        <div className="space-y-4">
          <label className="block text-xs font-semibold uppercase tracking-wide text-green-400/80 mb-1">
            Remarks
          </label>
          <div className="relative">
            <select
              value={remark}
              onChange={e => setRemark(e.target.value)}
              className="w-full h-11 appearance-none bg-gray-900/90 border border-green-700/40 focus:border-green-500 rounded-xl px-4 pr-10 text-sm text-green-100 font-medium"
            >
              {options.map(opt => (
                <option key={opt} value={opt} className="bg-gray-900 text-green-100">{opt}</option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-green-400">
              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 8l4 4 4-4" />
              </svg>
            </div>
          </div>

          <div className="flex gap-3 justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-gray-800/70 hover:bg-gray-700/80 text-green-200 border border-green-600/30 transition"
            >
              Cancel
            </button>
            <button
              onClick={() => onConfirm(remark)}
              disabled={loading}
              className="px-4 py-2 text-sm font-semibold rounded-lg bg-gradient-to-r from-orange-600/80 to-orange-500/80 hover:from-orange-500 hover:to-orange-400 text-white shadow-md hover:shadow-lg disabled:opacity-60 disabled:cursor-not-allowed transition"
            >
              {loading ? 'Archiving...' : 'Archive User'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ArchiveConfirmModal;
