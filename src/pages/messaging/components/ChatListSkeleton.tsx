import React from 'react';
import SkeletonRow from './SkeletonRow';

type ChatListSkeletonProps = {
  rows?: number;
};

const ChatListSkeleton: React.FC<ChatListSkeletonProps> = ({ rows = 8 }) => {
  return (
    <div className="py-2 px-1 space-y-1" role="status" aria-live="polite" aria-busy="true">
      {Array.from({ length: rows }).map((_, index) => (
        <SkeletonRow key={`chat-skeleton-${index}`} lines={2} />
      ))}
    </div>
  );
};

export default ChatListSkeleton;
