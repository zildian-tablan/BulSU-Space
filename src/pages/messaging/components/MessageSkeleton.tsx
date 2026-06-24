import React from 'react';

type MessageSkeletonProps = {
  alignment?: 'left' | 'right';
  lines?: number;
  hasMedia?: boolean;
};

const MessageSkeleton: React.FC<MessageSkeletonProps> = ({
  alignment = 'left',
  lines = 2,
  hasMedia = false,
}) => {
  const isLeft = alignment === 'left';
  return (
    <div className={`flex items-start gap-3 py-3 ${isLeft ? '' : 'justify-end'}`}>
      {isLeft && <div className="w-10 h-10 rounded-full bg-gray-700/60 flex-shrink-0" />}
      <div className={`flex-1 ${isLeft ? '' : 'max-w-[65%] text-right'}`}>
        <div
          className={`inline-block rounded-2xl py-2 px-3 ${
            isLeft ? 'bg-gray-700/55' : 'bg-gray-700/50'
          }`}
        >
          <div className={`h-3 bg-gray-600/60 rounded ${isLeft ? 'w-44' : 'w-32'} mb-2`} />
          {Array.from({ length: Math.max(0, lines - 1) }).map((_, i) => (
            <div
              key={i}
              className={`h-2 bg-gray-600/55 rounded ${i % 2 === 0 ? 'w-36' : 'w-24'} mt-1`}
            />
          ))}

          {hasMedia && (
            <div className="mt-2">
              <div className="bg-gray-600/40 rounded-lg w-full h-40 md:h-48 lg:h-56" />
            </div>
          )}
        </div>
      </div>
      {!isLeft && <div className="w-10 h-10 rounded-full bg-gray-700/60 flex-shrink-0" />}
    </div>
  );
};

export default MessageSkeleton;
