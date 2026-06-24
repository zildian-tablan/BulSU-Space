import React from 'react';
import { NewsItem } from '../../services/newsService';
import { formatDistanceToNow } from 'date-fns';

interface NewsCardProps {
  item: NewsItem;
  onOpen?: (item: NewsItem) => void;
  canDelete?: boolean;
  deleting?: boolean;
  onDelete?: (item: NewsItem) => void;
}

const NewsCard: React.FC<NewsCardProps> = ({ item, onOpen, canDelete = false, deleting = false, onDelete }) => {
  const handleClick = () => {
    if (onOpen) onOpen(item);
  };

  const handleDeleteClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (deleting) return;
    if (onDelete) onDelete(item);
  };

  const [imgError, setImgError] = React.useState(false);

  const initials = React.useMemo(() => {
    if (item.title) {
      const words = item.title.trim().split(/\s+/);
      if (words.length === 1) return words[0].charAt(0).toUpperCase();
      return (words[0].charAt(0) + words[1].charAt(0)).toUpperCase();
    }
    return 'N';
  }, [item.title]);

  return (
    <article
      onClick={handleClick}
      role="button"
      tabIndex={0}
      className="relative cursor-pointer bg-gray-800 rounded-xl overflow-hidden shadow-lg hover:shadow-2xl transform transition-all duration-200 hover:-translate-y-1.5 border border-transparent hover:border-green-700/30 focus:outline-none focus:ring-2 focus:ring-green-500"
    >
      {canDelete && onDelete && (
        <button
          type="button"
          onClick={handleDeleteClick}
          disabled={deleting}
          className="absolute top-3 right-3 z-10 inline-flex items-center gap-1 rounded-md bg-red-600/90 hover:bg-red-600 text-white text-xs font-semibold px-2.5 py-1.5 disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-red-400"
          aria-label={deleting ? 'Deleting news' : `Delete news: ${item.title}`}
        >
          <span className="material-symbols-outlined text-sm">delete</span>
          {deleting ? 'Deleting...' : 'Delete'}
        </button>
      )}

      {/* Image area: show image when available and not errored, otherwise render a pleasant gradient placeholder with initials */}
      {item.imageUrl && !imgError ? (
        <div className="w-full h-44 overflow-hidden bg-gray-700">
          <img
            src={item.imageUrl}
            alt={item.title}
            className="w-full h-full object-cover rounded-t-xl"
            onError={() => setImgError(true)}
          />
        </div>
      ) : (
        <div className="w-full h-44 overflow-hidden rounded-t-xl">
          <div
            className="w-full h-full flex items-center justify-center bg-gradient-to-r from-gray-700 via-gray-800 to-gray-900"
            role="img"
            aria-label={item.title || 'News image placeholder'}
          >
            <div className="flex items-center justify-center p-4">
              <span className="material-symbols-outlined text-6xl text-gray-200" aria-hidden="true">hide_image</span>
            </div>
          </div>
        </div>
      )}

      <div className="p-4">
        <h4 className="text-white font-bold text-lg leading-tight line-clamp-2">{item.title}</h4>
        <p className="text-gray-300 text-sm mt-2 line-clamp-3">{item.description}</p>

        <div className="mt-3 flex items-center justify-between">
          <div className="text-xs text-gray-400">
            {item.location && (
              <span className="mr-2 flex items-center gap-1">
                <span className="material-symbols-outlined text-sm text-gray-300">location_on</span>
                <span>{item.location}</span>
              </span>
            )}
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-gray-300">
            <div className="text-sm font-medium text-gray-200">{item.creatorName || 'Someone'}</div>
          </div>
          <div className="text-gray-400 flex items-center gap-2">
            <span className="text-green-400">●</span>
            <span>{item.createdAt ? formatDistanceToNow(new Date(item.createdAt.seconds * 1000)) + ' ago' : ''}</span>
          </div>
        </div>
      </div>
    </article>
  );
};

export default NewsCard;
