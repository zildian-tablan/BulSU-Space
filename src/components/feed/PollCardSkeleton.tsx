import React from 'react';

const PollCardSkeleton: React.FC = () => {
  return (
    <div className="w-full bg-gray-800/60 border border-gray-700/50 rounded-lg p-4 animate-pulse">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 bg-gray-700 rounded-lg" />
          <div className="flex-1">
            <div className="h-4 bg-gray-700 rounded w-3/5 mb-2" />
            <div className="h-3 bg-gray-700 rounded w-2/5" />
          </div>
        </div>
        <div className="w-20 h-6 bg-gray-700 rounded" />
      </div>

      <div className="space-y-2">
        <div className="h-3 bg-gray-700 rounded w-full" />
        <div className="h-3 bg-gray-700 rounded w-11/12" />
        <div className="h-3 bg-gray-700 rounded w-9/12" />
      </div>

      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-6 w-20 bg-gray-700 rounded" />
        </div>
        <div className="h-6 w-10 bg-gray-700 rounded" />
      </div>
    </div>
  );
};

export default PollCardSkeleton;
