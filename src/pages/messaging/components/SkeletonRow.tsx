import React from 'react';

type SkeletonRowProps = {
  lines?: number;
};

const SkeletonRow: React.FC<SkeletonRowProps> = ({ lines = 2 }) => (
  <div className="p-3">
    <div className="flex items-center space-x-3">
      <div className="rounded-full bg-gray-700/60 h-10 w-10" />
      <div className="flex-1 space-y-2 py-1">
        <div className="h-3 bg-gray-700/60 rounded w-3/4" />
        {Array.from({ length: Math.max(0, lines - 1) }).map((_, i) => (
          <div key={i} className="h-2 bg-gray-700/55 rounded w-1/2 mt-2" />
        ))}
      </div>
    </div>
  </div>
);

export default SkeletonRow;
