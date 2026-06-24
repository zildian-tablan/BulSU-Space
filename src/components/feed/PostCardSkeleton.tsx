import React from 'react';

const PostCardSkeleton: React.FC = () => {
  return (
    <div className="bg-gray-900/60 border border-gray-800 rounded-lg shadow-md p-4 sm:p-6 mb-4 animate-pulse">
      <div className="flex items-center mb-4">
        {/* Avatar Skeleton */}
        <div className="w-12 h-12 rounded-full bg-gray-800 mr-4" />
        <div className="flex-1">
          {/* Name Skeleton */}
          <div className="h-4 bg-gray-800 rounded w-32 mb-2" />
          {/* Role Skeleton */}
          <div className="h-3 bg-gray-800 rounded w-20" />
        </div>
        {/* Visibility Icon Skeleton */}
        <div className="h-6 w-6 bg-gray-800 rounded-full ml-2" />
      </div>
      {/* Content Skeleton */}
      <div className="h-4 bg-gray-800 rounded w-full mb-2" />
      <div className="h-4 bg-gray-800 rounded w-5/6 mb-2" />
      <div className="h-4 bg-gray-800 rounded w-3/4 mb-4" />
      {/* Media Skeleton (if any) */}
      <div className="h-40 bg-gray-800 rounded w-full mb-4" />
      {/* Actions Skeleton */}
      <div className="flex space-x-4 mt-2">
        <div className="h-6 w-12 bg-gray-800 rounded" />
        <div className="h-6 w-12 bg-gray-800 rounded" />
        <div className="h-6 w-12 bg-gray-800 rounded" />
      </div>
    </div>
  );
};

export default PostCardSkeleton;
