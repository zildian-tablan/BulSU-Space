import React, { useEffect } from 'react';
import ReactDOM from 'react-dom';
import { NewsItem } from '../../services/newsService';
import { formatDistanceToNow } from 'date-fns';

type Props = {
  open: boolean;
  item: NewsItem | null;
  onClose: () => void;
};

const FullNewsModal: React.FC<Props> = ({ open, item, onClose }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (open) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', onKey);
    }
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open || !item) return null;

  const createdAtText = item.createdAt
    ? item.createdAt.seconds
      ? formatDistanceToNow(new Date(item.createdAt.seconds * 1000)) + ' ago'
      : typeof item.createdAt === 'number'
      ? formatDistanceToNow(new Date(item.createdAt)) + ' ago'
      : ''
    : '';

  const modal = (
    <div className="fixed inset-0 z-[10060] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black bg-opacity-60"
        onClick={onClose}
        aria-hidden
      />

      <div className="relative max-w-3xl w-full mx-4 bg-gray-900 rounded-xl overflow-hidden shadow-2xl border border-green-700/20">
        {item.imageUrl ? (
          <div className="w-full h-64 bg-gray-800 overflow-hidden">
            <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover" />
          </div>
        ) : (
          <div className="w-full h-24 bg-gradient-to-r from-gray-800 to-gray-900" />
        )}

        <div className="p-6">
          <h2 className="text-2xl font-bold text-white mb-3">{item.title}</h2>

          <div className="flex items-center gap-3 text-sm text-gray-300 mb-4">
            <div className="flex items-center gap-3">
              <div className="text-sm font-medium text-gray-200">{item.creatorName || 'Someone'}</div>
              {item.location && (
                <div className="flex items-center gap-1 text-gray-400">
                  <span className="material-symbols-outlined text-sm">location_on</span>
                  <span>{item.location}</span>
                </div>
              )}
            </div>
            <div className="ml-auto text-gray-400">{createdAtText}</div>
          </div>

          <p className="text-gray-300 leading-relaxed whitespace-pre-wrap">{item.description}</p>

          <div className="mt-6 flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-md bg-green-600 hover:bg-green-700 text-white font-semibold"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return ReactDOM.createPortal(modal, document.body);
};

export default FullNewsModal;
