import { 
  collection, 
  addDoc, 
  getDocs, 
  doc, 
  getDoc, 
  deleteDoc, 
  updateDoc, 
  query, 
  where, 
  orderBy, 
  limit, 
  onSnapshot, 
  serverTimestamp,
  Timestamp,
  increment
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getStorageDownloadUrl } from '../firebase/storage-proxy';
import { v4 as uuidv4 } from 'uuid';
import { db, storage } from '../firebase/config';
import { activityLogger } from './activityLogService';
import { SpacePost, CreateSpacePostData, UpdateSpacePostData } from '../models/SpacePost';
import { isGroupMember } from './groupService';
import { notifySpacePost } from './notificationTriggers';

const SPACE_POSTS_COLLECTION = 'spacePosts';
const USERS_COLLECTION = 'users';

/**
 * Create a new post in a space
 */
export const createSpacePost = async (
  data: CreateSpacePostData,
  userId: string
): Promise<string> => {
  try {
    // Verify user is a member of the space
    const isMember = await isGroupMember(userId, data.groupId);
    if (!isMember) {
      throw new Error('You must be a member of this space to post');
    }

    // Get user details
    const userDoc = await getDoc(doc(db, USERS_COLLECTION, userId));
    if (!userDoc.exists()) {
      throw new Error('User not found');
    }
    
    const userData = userDoc.data();
    
    let mediaUrls: string[] = [];
    let postMediaObjects: any[] = [];
    
    // Upload attachments if provided
    if (data.media && data.media.length > 0) {
      const uploadPromises = data.media.map(async (file) => {
        const imageId = uuidv4();
        const imageRef = ref(storage, `space_posts/${imageId}_${file.name}`);

        await uploadBytes(imageRef, file);
        const url = await getDownloadURL(imageRef);
        const mediaType: 'image' | 'video' | 'document' = file.type.startsWith('image/')
          ? 'image'
          : file.type.startsWith('video/')
          ? 'video'
          : 'document';

        return { url, storagePath: imageRef.fullPath, name: file.name, type: mediaType };
      });

      const uploaded = await Promise.all(uploadPromises);
      mediaUrls = uploaded.map(u => u.url);
      // Persist media objects including storagePath
      postMediaObjects = uploaded.map(u => ({ type: u.type, url: u.url, name: u.name, storagePath: u.storagePath }));
    }

    // Create the post document
    const postData: any = {
      content: data.content,
      userId,
      userName: userData.name || 'Unknown User',
      userRole: userData.role || 'student',
      userProfilePic: userData.profile_pic || '',
      groupId: data.groupId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      commentCount: 0,
      reactionCount: 0,
      reactions: {},
      isPinned: false,
      isEdited: false,
      viewCount: 0,
      tags: data.tags || []
    };

    // Only add media fields if there are actual attachments
    if (mediaUrls.length > 0) {
      postData.mediaUrls = mediaUrls;
      // If we generated explicit media objects (with storagePath), use them; otherwise fallback
      if (postMediaObjects && postMediaObjects.length > 0) {
        postData.media = postMediaObjects;
      } else {
        postData.media = mediaUrls.map(url => ({ type: 'document' as const, url, name: 'file' }));
      }
    }
    
    const postRef = await addDoc(collection(db, SPACE_POSTS_COLLECTION), postData);
    
    // Trigger space post notification for all other members
    try {
      await notifySpacePost(postRef.id, data.groupId, userId);
    } catch (notificationError) {
      // Don't fail post creation if notification fails
      console.error('Failed to send space post notifications:', notificationError);
    }
    
    return postRef.id;
  } catch (error) {
    console.error('Error creating space post:', error);
    throw error;
  }
};

/**
 * Get posts for a specific space
 */
export const getSpacePosts = async (
  groupId: string,
  userId: string,
  limitCount: number = 20
): Promise<SpacePost[]> => {
  try {
    // Verify user is a member of the space
    const isMember = await isGroupMember(userId, groupId);
    if (!isMember) {
      throw new Error('You must be a member of this space to view posts');
    }

    const postsQuery = query(
      collection(db, SPACE_POSTS_COLLECTION),
      where('groupId', '==', groupId),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );
    
    const snapshot = await getDocs(postsQuery);
    const posts: SpacePost[] = [];
    
    snapshot.forEach((doc) => {
      const data = doc.data();
      posts.push({
        id: doc.id,
        content: data.content,
        userId: data.userId,
        userName: data.userName,
        userRole: data.userRole,
        userProfilePic: data.userProfilePic || '',
        groupId: data.groupId,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
        commentCount: data.commentCount || 0,
        reactionCount: data.reactionCount || 0,
        reactions: data.reactions || {},
        media: data.media || [],
        mediaUrls: data.mediaUrls || [],
        isPinned: data.isPinned || false,
        pinnedAt: data.pinnedAt,
        isEdited: data.isEdited || false,
        viewCount: data.viewCount || 0,
        viewedBy: data.viewedBy || [],
        tags: data.tags || []
      } as SpacePost);
    });
    
    return posts;
  } catch (error) {
    console.error('Error getting space posts:', error);
    throw error;
  }
};

/**
 * Get real-time updates for space posts
 */
export const getSpacePostsRealtime = (
  groupId: string,
  onPostsUpdate: (posts: SpacePost[]) => void
): (() => void) => {
  try {
    if (!groupId) {
      console.warn('getSpacePostsRealtime called without a valid groupId');
      onPostsUpdate([]);
      return () => {};
    }

    const postsQuery = query(
      collection(db, SPACE_POSTS_COLLECTION),
      where('groupId', '==', groupId),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(
      postsQuery,
      (snapshot) => {
        const posts: SpacePost[] = [];

        snapshot.forEach((doc) => {
          const data = doc.data();
          posts.push({
            id: doc.id,
            content: data.content,
            userId: data.userId,
            userName: data.userName,
            userRole: data.userRole,
            userProfilePic: data.userProfilePic || '',
            groupId: data.groupId,
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
            commentCount: data.commentCount || 0,
            reactionCount: data.reactionCount || 0,
            reactions: data.reactions || {},
            media: data.media || [],
            mediaUrls: data.mediaUrls || [],
            isPinned: data.isPinned || false,
            pinnedAt: data.pinnedAt,
            isEdited: data.isEdited || false,
            viewCount: data.viewCount || 0,
            viewedBy: data.viewedBy || [],
            tags: data.tags || []
          } as SpacePost);
        });

        onPostsUpdate(posts);
      },
      (snapshotError) => {
        console.error('Space posts realtime listener failed:', snapshotError);
        // Keep current UI state on listener failure to avoid clearing the feed
        // during transient auth/rules/network errors.
      }
    );
    
    return unsubscribe;
  } catch (error) {
    console.error('Error setting up space posts listener:', error);
    throw error;
  }
};

/**
 * Update a space post
 */
export const updateSpacePost = async (
  postId: string,
  userId: string,
  updateData: UpdateSpacePostData
): Promise<void> => {
  try {
    const postRef = doc(db, SPACE_POSTS_COLLECTION, postId);
    const postDoc = await getDoc(postRef);
    
    if (!postDoc.exists()) {
      throw new Error('Post not found');
    }
    
    const postData = postDoc.data();
    
    // Check if user is the author
    if (postData.userId !== userId) {
      throw new Error('You can only edit your own posts');
    }
    
    const updatePayload: any = {
      ...updateData,
      updatedAt: serverTimestamp(),
      isEdited: true
    };

    // If media array is provided, compute mediaUrls to keep parity with createSpacePost
    try {
      if (updateData.media && Array.isArray(updateData.media)) {
        const urls = await Promise.all(
          updateData.media.map(async (m: any) => {
            try {
              if (m && m.storagePath) {
                return await getStorageDownloadUrl(m.storagePath);
              }
              return typeof m.url === 'string' ? m.url : '';
            } catch (e) {
              console.warn('[spacePostService] Failed to resolve media URL for update', m, e);
              return typeof m.url === 'string' ? m.url : '';
            }
          })
        );
        updatePayload.mediaUrls = urls.filter(Boolean);
      }
    } catch (e) {
      console.warn('[spacePostService] Error computing mediaUrls for update', e);
    }

    await updateDoc(postRef, updatePayload);
  } catch (error) {
    console.error('Error updating space post:', error);
    throw error;
  }
};

/**
 * Delete a space post
 */
export const deleteSpacePost = async (postId: string, userId: string): Promise<void> => {
  try {
    const postRef = doc(db, SPACE_POSTS_COLLECTION, postId);
    const postDoc = await getDoc(postRef);
    
    if (!postDoc.exists()) {
      throw new Error('Post not found');
    }
    
    const postData = postDoc.data();
    
    // Check if user is the author or has admin privileges
    const userDoc = await getDoc(doc(db, USERS_COLLECTION, userId));
    const userData = userDoc.data();
    const userRole = userData?.role;
    
    const isAuthor = postData.userId === userId;
    const isAdmin = userRole === 'admin' || userRole === 'super admin';
    
    if (!isAuthor && !isAdmin) {
      throw new Error('You can only delete your own posts');
    }

    // Prefer a comprehensive cleanup that removes media and subcollections
    try {
      const { totalFirebaseSpacePostDeletion } = await import('./firebaseCleanupService');
      await totalFirebaseSpacePostDeletion(postId, userId, isAdmin);
    } catch (cleanupErr) {
      console.warn('[spacePostService] Comprehensive cleanup failed, falling back to deleting post document only:', cleanupErr);
      await deleteDoc(postRef);
    }
  } catch (error) {
    console.error('Error deleting space post:', error);
    throw error;
  }
};

/**
 
 */
 

/**
 * Add reaction to a space post
 */
export const addSpacePostReaction = async (
  postId: string,
  userId: string,
  reactionType: string = 'heart'
): Promise<void> => {
  try {
    const postRef = doc(db, SPACE_POSTS_COLLECTION, postId);
    const postDoc = await getDoc(postRef);
    
    if (!postDoc.exists()) {
      throw new Error('Post not found');
    }
    
    const postData = postDoc.data();
    const reactions = postData.reactions || {};
    const hasReacted = reactions[userId];
    
    let newReactions = { ...reactions };
    let reactionCount = postData.reactionCount || 0;
    
    if (hasReacted) {
      // Remove reaction
      delete newReactions[userId];
      reactionCount = Math.max(0, reactionCount - 1);
    } else {
      // Add reaction
      newReactions[userId] = reactionType;
      reactionCount += 1;
    }
    
    await updateDoc(postRef, {
      reactions: newReactions,
      reactionCount,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    console.error('Error adding space post reaction:', error);
    throw error;
  }
};

/**
 * Get real-time updates for a space post's reaction status and other properties
 * @param postId Post ID to get reactions and updates for
 * @param userId Current user ID to check if they've reacted
 * @param onStatusUpdate Callback for reaction status updates
 * @param onPostUpdate Callback for other post property updates (optional)
 * @returns Unsubscribe function
 */
export const getSpacePostReactionStatusRealtime = (
  postId: string,
  userId: string,
  onStatusUpdate: (
    hasReacted: boolean | null, 
    count: number
  ) => void,
  onPostUpdate?: (post: Partial<SpacePost>) => void
): (() => void) => {
  const postRef = doc(db, SPACE_POSTS_COLLECTION, postId);
  
  // Listen to the whole post document for any changes
  const unsubscribe = onSnapshot(postRef, (docSnapshot) => {
    if (docSnapshot.exists()) {
      const data = docSnapshot.data();
      // Handle reaction status updates
      const reactions = data.reactions || {};
      const reactionCount = data.reactionCount || 0;
      const hasReacted = userId && reactions[userId] ? true : false;
      
      // Update the reaction status with the current state
      onStatusUpdate(hasReacted, reactionCount);
      
      // If we have a post update callback, send other relevant post properties
      if (onPostUpdate) {
        onPostUpdate({
          isPinned: data.isPinned || false,
          pinnedAt: data.pinnedAt,
          commentCount: data.commentCount || 0,
          viewCount: data.viewCount || 0,
          isEdited: data.isEdited || false,
          updatedAt: data.updatedAt
        });
      }
    } else {
      // Post doesn't exist, so no reactions
      onStatusUpdate(false, 0);
        if (onPostUpdate) {
        onPostUpdate({}); // Signal that the post no longer exists with empty object
      }
    }
  }, (error) => {
    console.error('Error in post status listener:', error);
    // In case of error, don't update the state
    onStatusUpdate(null, -1);
  });
  
  return unsubscribe;
};

/**
 * Get a single space post by ID
 */
export const getSpacePostById = async (postId: string): Promise<SpacePost | null> => {
  try {
    const postDoc = await getDoc(doc(db, SPACE_POSTS_COLLECTION, postId));
    
    if (!postDoc.exists()) {
      return null;
    }
    
    const data = postDoc.data();
    return {
      id: postDoc.id,
      content: data.content,
      userId: data.userId,
      userName: data.userName,
      userRole: data.userRole,
      userProfilePic: data.userProfilePic || '',
      groupId: data.groupId,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
      commentCount: data.commentCount || 0,
      reactionCount: data.reactionCount || 0,
      reactions: data.reactions || {},
      media: data.media || [],
      mediaUrls: data.mediaUrls || [],
      isPinned: data.isPinned || false,
      pinnedAt: data.pinnedAt,
      isEdited: data.isEdited || false,
      viewCount: data.viewCount || 0,
      viewedBy: data.viewedBy || [],
      tags: data.tags || []
    } as SpacePost;
  } catch (error) {
    console.error('Error getting space post by ID:', error);
    throw error;
  }
};

/**
 * Add a comment to a space post
 */
export const addSpacePostComment = async (
  postId: string, 
  userId: string, 
  content: string,
  replyTo?: string | null
): Promise<string> => {
  try {
    // Get user information
    const userDoc = await getDoc(doc(db, USERS_COLLECTION, userId));
    if (!userDoc.exists()) {
      throw new Error('User not found');
    }
    
    const userData = userDoc.data();
    
    // Create comment document or reply in replies subcollection
    const commentData: any = {
      postId,
      userId,
      userName: userData.name,
      userProfilePic: userData.profile_pic,
      userRole: userData.role,
      content,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      isEdited: false,
    };

    let commentRef;
    const postRef = doc(db, SPACE_POSTS_COLLECTION, postId);
    if (replyTo) {
      // write reply under posts/{postId}/comments/{replyTo}/replies
      commentRef = await addDoc(collection(db, SPACE_POSTS_COLLECTION, postId, 'comments', replyTo, 'replies'), commentData);
      // Do not increment top-level comment count for replies
    } else {
      commentRef = await addDoc(collection(db, SPACE_POSTS_COLLECTION, postId, 'comments'), commentData);
      await updateDoc(postRef, { commentCount: increment(1) });
    }

    return commentRef.id;
  } catch (error) {
    console.error('Error adding space post comment:', error);
    throw error;
  }
};

/**
 * Delete a comment from a space post
 * @param postId The ID of the space post containing the comment
 * @param commentId The ID of the comment to delete
 * @param userId The ID of the user making the delete request
 * @param isAdmin Whether the user is a super admin (can delete any comment regardless of ownership)
 */
export const deleteSpacePostComment = async (
  postId: string, 
  commentId: string, 
  userId: string, 
  isAdmin: boolean = false
): Promise<void> => {
  try {
    const commentRef = doc(db, SPACE_POSTS_COLLECTION, postId, 'comments', commentId);
    const commentDoc = await getDoc(commentRef);
    
    if (!commentDoc.exists()) {
      throw new Error('Comment not found');
    }
    
    const commentData = commentDoc.data();
    
    // Verify user is the owner of the comment or a super admin
    if (commentData.userId !== userId && !isAdmin) {
      throw new Error('Not authorized to delete this comment');
    }
    
    await deleteDoc(commentRef);
    
    // Update comment count on space post
    const postRef = doc(db, SPACE_POSTS_COLLECTION, postId);
    await updateDoc(postRef, {
      commentCount: increment(-1)
    });
  } catch (error) {
    console.error('Error deleting space post comment:', error);
    throw error;
  }
};

/** Get realtime replies for a space post comment */
export const getSpaceRepliesRealtime = (
  postId: string,
  commentId: string,
  onRepliesUpdate: (replies: Comment[]) => void
): (() => void) => {
  const repliesQuery = query(
    collection(db, SPACE_POSTS_COLLECTION, postId, 'comments', commentId, 'replies'),
    orderBy('createdAt', 'asc')
  );

  const unsubscribe = onSnapshot(repliesQuery, (snapshot) => {
    try {
      const replies: Comment[] = snapshot.docs.map((doc) => {
        const data = doc.data();
        const createdAt = data.createdAt instanceof Timestamp ? data.createdAt : Timestamp.fromDate(new Date());
        const updatedAt = data.updatedAt instanceof Timestamp ? data.updatedAt : Timestamp.fromDate(new Date());
        return ({
          id: doc.id,
          ...data,
          createdAt,
          updatedAt,
        } as unknown) as Comment;
      });
      onRepliesUpdate(replies);
    } catch (error) {
      console.error('Error processing space replies update:', error);
    }
  }, (error) => {
    console.error('Error in space replies listener:', error);
  });

  return unsubscribe;
};

export const deleteSpaceReply = async (postId: string, commentId: string, replyId: string, userId: string, isAdmin: boolean = false): Promise<void> => {
  try {
    const replyRef = doc(db, SPACE_POSTS_COLLECTION, postId, 'comments', commentId, 'replies', replyId);
    const replyDoc = await getDoc(replyRef);
    if (!replyDoc.exists()) throw new Error('Reply not found');
    const replyData = replyDoc.data();
    if (replyData.userId !== userId && !isAdmin) throw new Error('Not authorized to delete this reply');
    await deleteDoc(replyRef);
    await activityLogger.logActivity('comment_deleted', `Space reply deleted by user ${userId}${isAdmin ? ' (admin)' : ''}`, { postId, commentId, replyId, userId }, isAdmin ? 'high' : 'medium', replyId);
  } catch (error) {
    console.error('Error deleting space reply:', error);
    throw error;
  }
};

/**
 * Get comments for a space post with real-time updates
 * Returns a cleanup function to unsubscribe
 */
export const getSpacePostCommentsRealtime = (
  postId: string,
  onCommentsUpdate: (comments: any[]) => void
): (() => void) => {
  const commentsQuery = query(
    collection(db, SPACE_POSTS_COLLECTION, postId, 'comments'),
    orderBy('createdAt', 'asc')
  );
  
  const unsubscribe = onSnapshot(commentsQuery, (snapshot) => {
    try {
      const comments: any[] = snapshot.docs.map(doc => {
        const commentData = doc.data();
        
        // Convert Firestore timestamp to JavaScript Date
        const createdAt = commentData.createdAt instanceof Timestamp 
          ? commentData.createdAt 
          : Timestamp.fromDate(new Date());
          
        const updatedAt = commentData.updatedAt instanceof Timestamp 
          ? commentData.updatedAt 
          : Timestamp.fromDate(new Date());
        
        return {
          id: doc.id,
          ...commentData,
          createdAt,
          updatedAt
        };
      });
      
      onCommentsUpdate(comments);
    } catch (error) {
      console.error('Error processing space post comments update:', error);
    }
  }, (error) => {
    console.error('Error in real-time space post comments listener:', error);
  });
  
  return unsubscribe;
};
