import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Comment, Post } from '../models/Post';
import {
  addComment,
  deleteComment,
  addReaction,
  getCommentsRealtime,
  getReactionStatusRealtime
} from '../services/postService';
import { getUserNameRealtime, getUserProfilePicRealtime } from '../services/userNameService';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

interface UsePostInteractionsOptions {
  post: Post;
  // onPostUpdated may receive an optional action string to indicate what changed
  onPostUpdated?: (action?: 'reaction' | 'comment' | 'delete' | 'edit' | 'other') => void;
  isOpen?: boolean; // for modal usage
  listenComments?: boolean; // for PostCard usage
}

export function usePostInteractions({ post, onPostUpdated, isOpen = true, listenComments = true }: UsePostInteractionsOptions) {
  const { currentUser } = useAuth();
  const [hasReacted, setHasReacted] = useState(false);
  const [reactionCount, setReactionCount] = useState(post.reactionCount || 0);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [commentCount, setCommentCount] = useState(post.commentCount || 0);
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState(post.userName);
  const [profilePic, setProfilePic] = useState(post.userProfilePic);
  const [taggedFriendsData, setTaggedFriendsData] = useState<{id: string, name: string}[]>([]);
  const [taggedFriendsLoading, setTaggedFriendsLoading] = useState(false);

  // Real-time listener for user name and profile picture changes
  useEffect(() => {
    if (!post.userId) return () => {};
    const unsubscribeName = getUserNameRealtime(post.userId, (name: string) => {
      if (name && name !== displayName) {
        setDisplayName(name);
      }
    });
    const unsubscribePic = getUserProfilePicRealtime(post.userId, (pic: string) => {
      if (pic && pic !== profilePic) {
        setProfilePic(pic);
      }
    });
    return () => {
      unsubscribeName();
      unsubscribePic();
    };
    // Only depend on post.userId
    // eslint-disable-next-line
  }, [post.userId]);
  
  // Fetch tagged friends data
  useEffect(() => {
    const fetchTaggedFriendsData = async () => {
      // First, check if we have a valid taggedFriends array in the post
      console.log('[usePostInteractions] Post tagged friends:', post.taggedFriends);
      
      // Check if the post has tagged friends and it's a valid array
      if (post.taggedFriends && Array.isArray(post.taggedFriends) && post.taggedFriends.length > 0) {
        setTaggedFriendsLoading(true);
        try {
          // Process each tagged friend ID
          const friendsData = await Promise.all(
            post.taggedFriends.map(async (friendId) => {
              // Validate the friendId
              if (!friendId || typeof friendId !== 'string') {
                console.warn('[usePostInteractions] Invalid friend ID:', friendId);
                return { id: 'unknown', name: 'Unknown User' };
              }
              
              try {
                const userDocRef = doc(db, 'users', friendId);
                const userDoc = await getDoc(userDocRef);
                if (userDoc.exists()) {
                  const userData = userDoc.data();
                  return { 
                    id: friendId, 
                    name: userData && userData.name ? userData.name : 'Unknown User' 
                  };
                }
                console.warn('[usePostInteractions] User doc not found for ID:', friendId);
                return { id: friendId, name: 'Unknown User' };
              } catch (err) {
                console.error(`[usePostInteractions] Error fetching user ${friendId}:`, err);
                return { id: friendId, name: 'Unknown User' };
              }
            })
          );
          
          // Filter out any undefined or invalid entries
          const validFriendsData = friendsData.filter(friend => 
            friend && typeof friend === 'object' && friend.id
          );
          
          console.log('[usePostInteractions] Fetched tagged friends data:', validFriendsData);
          setTaggedFriendsData(validFriendsData);
        } catch (error) {
          console.error('[usePostInteractions] Error fetching tagged friends data:', error);
          setTaggedFriendsData([]);
        } finally {
          setTaggedFriendsLoading(false);
        }
      } else {
        // Reset tagged friends data if no tagged friends in the post
        console.log('[usePostInteractions] No tagged friends found in post');
        setTaggedFriendsData([]);
        setTaggedFriendsLoading(false);
      }
    };

    // Run the function when the component is open or when tagged friends change
    fetchTaggedFriendsData();
  }, [post.taggedFriends]);

  // Load comments (for modal: when open, for card: when showComments)
  useEffect(() => {
    let unsubscribe: () => void = () => {};
    if (listenComments && isOpen) {
      unsubscribe = getCommentsRealtime(post.id, (newComments: Comment[]) => {
        setComments(newComments);
        setCommentCount(newComments.length);
      });
    }
    return () => unsubscribe();
  }, [post.id, isOpen, listenComments]);

  // Check if user has reacted to this post
  useEffect(() => {
    let unsubscribe: () => void = () => {};
    if (currentUser && isOpen) {
      unsubscribe = getReactionStatusRealtime(
        post.id,
        currentUser.id,
        (hasReacted: boolean | null, count: number, _recentReactors?: any[]) => {
          if (hasReacted !== null) {
            setHasReacted(hasReacted);
          }
          if (count !== -1) {
            setReactionCount(count);
          }
        }
      );
    }
    return () => unsubscribe();
  }, [post.id, currentUser, isOpen]);

  // Handle reaction
  const handleReaction = async () => {
    if (!currentUser) return;
    try {
      const newReactionState = !hasReacted;
      setHasReacted(newReactionState);
      setReactionCount((prev: number) => newReactionState ? prev + 1 : Math.max(0, prev - 1));
      await addReaction(post.id, currentUser.id);
      if (onPostUpdated) {
        onPostUpdated('reaction');
      }
    } catch (error) {
      setHasReacted(!hasReacted);
      setReactionCount((prev: number) => hasReacted ? prev + 1 : Math.max(0, prev - 1));
    }
  };

  // Handle comment submission
  const handleCommentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !commentText.trim() || isSubmittingComment) return;
    setIsSubmittingComment(true);
    setCommentError(null);
    try {
      await addComment(post.id, currentUser.id, commentText.trim());
      setCommentText('');
      if (onPostUpdated) {
        onPostUpdated('comment');
      }
    } catch (error: any) {
      setCommentError(error?.message || 'Failed to add comment. Please try again.');
    } finally {
      setIsSubmittingComment(false);
    }
  };

  // Handle comment deletion
  const handleDeleteComment = async (commentId: string, commentUserId: string, isAdminOrSuperAdmin: boolean) => {
    if (!currentUser) return;
    if (!isAdminOrSuperAdmin && currentUser.id !== commentUserId) {
      alert('You can only delete your own comments.');
      return;
    }
    if (!window.confirm('Are you sure you want to delete this comment?')) return;
    try {
      await deleteComment(post.id, commentId, currentUser.id, isAdminOrSuperAdmin);
      if (onPostUpdated) {
        onPostUpdated('delete');
      }
    } catch (error) {
      alert((error as any)?.message || 'Failed to delete comment.');
    }
  };

  return {
    currentUser,
    hasReacted,
    reactionCount,
    comments,
    commentText,
    setCommentText,
    commentCount,
    isSubmittingComment,
  commentError,
  setCommentError,
    displayName,
    profilePic,
    taggedFriendsData,
    taggedFriendsLoading,
    handleReaction,
    handleCommentSubmit,
    handleDeleteComment,
  };
}
