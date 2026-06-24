import React, { useState, useEffect, useCallback } from 'react';
import { User } from '../../contexts/AuthContext';
import { Post } from '../../models/Post';
import { getUserPostsRealtime } from '../../services/userService';
import PostCard from '../feed/PostCard';
import PostCardSkeleton from '../feed/PostCardSkeleton';
import { ArrowDownIcon, NoSymbolIcon } from '@heroicons/react/24/outline';
import { useAuth } from '../../contexts/AuthContext';
import { listenToBlockStatus } from '../../services/userService';

interface UserPostsProps {
  user: User;
  isOwnProfile?: boolean; // Optional prop to determine if this is the current user's own profile
}

const UserPosts: React.FC<UserPostsProps> = ({ user, isOwnProfile = false }) => {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMorePosts, setHasMorePosts] = useState(true);
  const [postsLimit, setPostsLimit] = useState(5); // Initial limit
  const [isBlocked, setIsBlocked] = useState(false);
  const [isBlockedBy, setIsBlockedBy] = useState(false);
  const [isBlocking, setIsBlocking] = useState(false);
  const { currentUser } = useAuth();
  
  // Check if this is the current user's profile (fallback)
  const isOwnProfileFallback = currentUser?.id === user.id;
  const finalIsOwnProfile = isOwnProfile || isOwnProfileFallback;

  // Check blocking status
  useEffect(() => {
    if (!currentUser || !user || finalIsOwnProfile) return;
    
    console.log('UserPosts: Setting up block status listener for:', currentUser.id, 'and', user.id);
    
    // Use real-time listener for blocking status
    const unsubscribe = listenToBlockStatus(
      currentUser.id,
      user.id,
      (blockStatus) => {
        console.log('UserPosts: Block status update received:', blockStatus);
        setIsBlocked(blockStatus.user1BlockedUser2);
        setIsBlockedBy(blockStatus.user2BlockedUser1);
        setIsBlocking(blockStatus.user1BlockedUser2); // Current user is blocking profile owner
      }
    );

    return () => {
      console.log('UserPosts: Cleaning up block status listener');
      unsubscribe();
    };
  }, [currentUser, user, finalIsOwnProfile]);

  // Handle post updates from PostCard - defining this callback first
  const handlePostUpdate = useCallback(() => {
    console.log('UserPosts: Post update triggered, refreshing data');
    // When a post is updated (or deleted), we'll rely on the real-time listener 
    // to update our posts list. This ensures consistency with the database.
    
    // The cleanup and reload happens automatically via the useEffect hook
    // that's watching postsLimit and user.id, but we can force a reload of
    // the current limit by toggling a state variable
    
    // Reload current posts by triggering the effect
    setPostsLimit(currentLimit => {
      setTimeout(() => setPostsLimit(currentLimit), 0);
      return currentLimit;
    });
  }, []);

  // Load posts with the specified limit
  const loadPosts = useCallback(() => {
    // Make sure user.id is defined
    if (!user.id) {
      setError('User ID is undefined');
      setLoading(false);
      return () => {};
    }
    
    return getUserPostsRealtime(
      user.id, 
      (fetchedPosts) => {
        setPosts(fetchedPosts);
        setLoading(false);
        setLoadingMore(false);
        // If we got fewer posts than the limit, there are no more to load
        setHasMorePosts(fetchedPosts.length >= postsLimit);
        setError(null);
      },
      true, // Sort by date
      postsLimit
    );
  }, [user.id, postsLimit]);

  // Set up real-time listener for posts - public unless blocked by the profile owner
  useEffect(() => {
    // Don't load posts if blocked by the profile owner (only for the blocked user)
    if (isBlockedBy && !isBlocking) {
      setLoading(false);
      setPosts([]);
      return () => {};
    }
    
    // Load posts for any viewer unless the profile owner has blocked the viewer.
    setLoading(true);
    const unsubscribe = loadPosts();
    return () => unsubscribe();
  }, [loadPosts, finalIsOwnProfile, isBlockedBy, isBlocking]);

  // Handle loading more posts
  const handleLoadMore = () => {
    setLoadingMore(true);
    setPostsLimit(prevLimit => prevLimit + 5); // Load 5 more posts
  };

  // If blocked by the profile owner (and not blocking them), show blocked message
  if (isBlockedBy && !isBlocking) {
    return (
      <div className="bg-gradient-to-br from-red-900/20 to-red-800/20 rounded-xl border border-red-800/30 p-6 sm:p-8 text-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-16 h-16 bg-red-600/20 rounded-full flex items-center justify-center">
            <NoSymbolIcon className="h-8 w-8 text-red-400" />
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-red-200">
              You have been blocked
            </h3>
            <p className="text-red-300 text-sm">
              {user.name} has blocked you. You cannot see their posts or send them friend requests.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // No friendship requirement: posts are public unless the profile owner blocks the viewer

  if (loading && !loadingMore) {
    // Render skeleton placeholders during initial load to improve perceived performance
    const skeletonCount = Math.max(3, Math.min(6, postsLimit));
    return (
      <div className="space-y-3 sm:space-y-4 md:space-y-5">
        {Array.from({ length: skeletonCount }).map((_, i) => (
          <PostCardSkeleton key={`skeleton-${i}`} />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-6 sm:py-8 text-red-400 text-xs sm:text-sm">{error}</div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="bg-gray-800/50 rounded-lg border border-gray-700/50 p-6 sm:p-8 text-center">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-gray-500 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
        </svg>
        <p className="text-gray-400 text-sm mb-1 sm:mb-2">No posts yet</p>
        {finalIsOwnProfile && (
          <p className="text-gray-500 text-xs">
            Share your thoughts with the academic community
          </p>
        )}
        {!finalIsOwnProfile && (
          <p className="text-gray-500 text-xs">
            {user.name.split(' ')[0]} hasn't posted anything yet
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3 sm:space-y-4 md:space-y-5">
      {posts.map(post => (
        <PostCard
          key={post.id} 
          post={post}
          onPostUpdated={handlePostUpdate}
        />
      ))}
      
      {/* Load More Button */}
      {hasMorePosts && (
        <div className="flex justify-center mt-4">
          <button
            onClick={handleLoadMore}
            disabled={loadingMore}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm transition-colors ${
              loadingMore
                ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                : 'bg-green-600/20 hover:bg-green-600/30 text-green-400'
            }`}
          >
            {loadingMore ? (
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-t-transparent border-current"></div>
            ) : (
              <ArrowDownIcon className="h-4 w-4" />
            )}
            <span>Load More</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default UserPosts;
