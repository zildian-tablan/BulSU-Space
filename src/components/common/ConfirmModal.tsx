import React, { useState } from 'react';
import ReactDOM from 'react-dom';

interface ConfirmModalProps {
  open: boolean;
  title?: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({
  open,
  title = 'Are you sure?',
  description = '',
  confirmText = 'Yes',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
  isLoading = false,
}) => {
  if (!open) return null;
  return ReactDOM.createPortal(
    <div className="fixed inset-0 flex items-center justify-center bg-black/60" style={{ zIndex: 2147483648 }}>
      <div className="bg-gray-950 rounded-2xl shadow-2xl border border-green-800 px-8 py-6 max-w-sm w-full animate-fade-in-up">
        <h2 className="text-xl font-bold text-green-400 mb-2">{title}</h2>
        {description && <p className="text-gray-300 mb-4">{description}</p>}
        <div className="flex justify-end gap-3 mt-4">
          <button
            className="px-5 py-2 rounded-lg bg-gray-800 text-gray-200 hover:bg-gray-700 transition-all font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={onCancel}
            disabled={isLoading}
          >
            {cancelText}
          </button>
          <button
            className="px-5 py-2 rounded-lg bg-green-700 text-white hover:bg-green-600 transition-all font-bold shadow disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            onClick={onConfirm}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-t-transparent border-white rounded-full animate-spin"></div>
                <span>Deleting...</span>
              </>
            ) : (
              confirmText
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ConfirmModal;
