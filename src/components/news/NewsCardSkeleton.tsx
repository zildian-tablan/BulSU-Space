import React from 'react';

const NewsCardSkeleton: React.FC = () => {
  return (
    <article className="bg-gray-800 rounded-xl overflow-hidden shadow-lg border border-transparent skeleton animate-pulse">
      <div className="w-full h-44 bg-gray-700" />

      <div className="p-4">
        <div className="h-5 bg-gray-600 rounded w-3/4 mb-3" />
        <div className="h-4 bg-gray-600 rounded w-full mb-2" />
        <div className="h-4 bg-gray-600 rounded w-5/6 mb-4" />

        <div className="mt-2 flex items-center justify-between">
          <div className="h-4 bg-gray-600 rounded w-24" />
          <div className="h-3 bg-gray-600 rounded w-16" />
        </div>
      </div>
    </article>
  );
};

export default NewsCardSkeleton;
