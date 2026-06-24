import React, { useEffect } from 'react';
import ReactDOM from 'react-dom';
import { XMarkIcon, ArrowDownTrayIcon } from '@heroicons/react/24/outline';

interface ImagePreviewModalProps {
  isOpen: boolean;
  imageUrl?: string | null;
  onClose: () => void;
  title?: string;
}

const ImagePreviewModal: React.FC<ImagePreviewModalProps> = ({ isOpen, imageUrl, onClose, title = 'Profile Picture' }) => {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleKey);
    }
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;
  if (typeof document === 'undefined') return null;

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  const handleDownload = () => {
    if (!imageUrl) return;
    const a = document.createElement('a');
    a.href = imageUrl;
    a.download = 'profile-picture.jpg';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[2147483647] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onMouseDown={handleBackdropClick}>
      <div className="relative w-full max-w-3xl max-h-[90vh] bg-gray-900 border border-gray-700 rounded-xl overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 bg-gray-900/80 sticky top-0">
          <h3 className="text-sm font-semibold text-gray-200">{title}</h3>
          <div className="flex items-center gap-1.5">
            {imageUrl && (
              <button onClick={handleDownload} className="p-1.5 rounded-md text-emerald-300 hover:text-emerald-200 hover:bg-gray-800" title="Download">
                <ArrowDownTrayIcon className="h-5 w-5" />
              </button>
            )}
            <button onClick={onClose} className="p-1.5 rounded-md text-gray-300 hover:text-red-300 hover:bg-gray-800" title="Close">
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>
        </div>
        <div className="p-4 flex items-center justify-center bg-black/20">
          {imageUrl ? (
            <img src={imageUrl} alt="Profile" className="max-w-full max-h-[70vh] object-contain rounded-md" />
          ) : (
            <div className="text-gray-400 text-sm">No profile picture to display.</div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ImagePreviewModal;
