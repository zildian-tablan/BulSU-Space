import React from 'react';
import { formatDistanceToNow } from 'date-fns';
import type { User } from '../../../contexts/AuthContext';
import type { ChatWithDetails } from '../../../services/messageService';
import type { IMessage } from '../types';

type PinnedMessageBannerProps = {
  message: IMessage | null;
  chat: ChatWithDetails | null;
  currentUser: User | null;
  onDismiss?: () => void;
  onViewMessage?: (messageId: string) => void;
};

const PinnedMessageBanner: React.FC<PinnedMessageBannerProps> = ({
  message,
  chat,
  currentUser,
  onDismiss,
  onViewMessage,
}) => {
  if (!message || !chat) return null;

  const pinnedByUser =
    message.pinnedDetails?.pinnedBy === currentUser?.id
      ? 'You'
      : chat.users?.find((u) => u.id === message.pinnedDetails?.pinnedBy)?.name || 'Someone';

  const resolvePinnedDate = (value: any): Date | null => {
    if (!value) return null;
    if (typeof value.toDate === 'function') return value.toDate();
    if (value instanceof Date) return value;
    if (typeof value === 'object' && typeof value.seconds === 'number') {
      return new Date(value.seconds * 1000);
    }
    if (typeof value === 'number') return new Date(value);
    if (typeof value === 'string') {
      const d = new Date(value);
      return isNaN(d.getTime()) ? null : d;
    }
    return null;
  };

  const pinnedDate = resolvePinnedDate(message.pinnedDetails?.pinnedAt);
  const pinnedTime = pinnedDate ? formatDistanceToNow(pinnedDate, { addSuffix: true }) : '';

  const truncateContent = (content: string, maxLength = 50) => {
    return content.length > maxLength ? content.substring(0, maxLength) + '...' : content;
  };

  return (
    <div className="bg-green-900/10 border-b border-green-500/20 px-3 py-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="material-icons text-green-500">push_pin</span>
          <div className="text-sm">
            <span className="text-green-400 font-medium">{pinnedByUser} pinned a message</span>
            {pinnedTime && <span className="text-gray-400 text-xs ml-1">({pinnedTime})</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onViewMessage && onViewMessage(message.id)}
            className="text-xs text-gray-300 hover:text-green-400 transition-colors px-2 py-1 rounded hover:bg-green-500/10"
          >
            View
          </button>
          <button
            onClick={onDismiss}
            className="text-gray-400 hover:text-white p-1 rounded-full hover:bg-gray-700/50"
          >
            <span className="material-icons text-sm">close</span>
          </button>
        </div>
      </div>
      <div className="text-gray-300 text-sm mt-1 truncate pl-7">"{truncateContent(message.content)}"</div>
    </div>
  );
};

export default PinnedMessageBanner;
