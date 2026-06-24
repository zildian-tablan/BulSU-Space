import { db, storage, auth } from '../firebase/config';
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  orderBy,
  limit,
  startAfter,
  Timestamp,
  serverTimestamp,
  onSnapshot,
  increment,
  setDoc,
  where,
  documentId,
  writeBatch,
  arrayUnion,
  arrayRemove
} from 'firebase/firestore';
import { 
  ref, 
  uploadBytes, 
  getDownloadURL, 
  deleteObject,
  StorageReference
} from 'firebase/storage';
import { v4 as uuidv4 } from 'uuid';
import { Post, Comment, PostVisibility, MediaItem, ReportReasonId } from '../models/Post';
import { createCORSStorageURL, isLocalhost } from '../firebase/cors-proxy';
import { notifyPostReaction, notifyPostComment, notifyAdminAnnouncement } from './notificationTriggers';
import { totalFirebasePostDeletion } from './firebaseCleanupService';
import { activityLogger } from './activityLogService';
import { checkMutualBlock } from './userService';

// Collection paths
const POSTS_COLLECTION = 'posts';
const COMMENTS_COLLECTION = 'comments';
const REACTIONS_COLLECTION = 'reactions';
const HIDDEN_POSTS_COLLECTION = 'hidden_posts';
const REPORTS_COLLECTION = 'reports';
// ARCHIVED_POSTS_COLLECTION removed: archived posts are stored in-place on `posts` via `annual_archive_date`
const SHARED_POSTS_COLLECTION = 'shared_posts';
// Reuse users collection constant locally (keeps file self-contained and avoids circular import risk)
const USERS_COLLECTION = 'users';

type MutualBlockStatus = {
  user1BlockedUser2: boolean;
  user2BlockedUser1: boolean;
  hasAnyBlock: boolean;
};

const BLOCK_STATUS_CACHE_TTL_MS = 2 * 60 * 1000;
const blockStatusCache = new Map<string, { value: MutualBlockStatus; expiresAt: number }>();
const HIDDEN_POSTS_CACHE_TTL_MS = 15 * 1000;
const hiddenPostsCache = new Map<string, { ids: Set<string>; expiresAt: number }>();

const getBlockStatusCacheKey = (userId1: string, userId2: string): string => `${userId1}->${userId2}`;

const getMutualBlockStatusCached = async (userId1: string, userId2: string): Promise<MutualBlockStatus> => {
  if (!userId1 || !userId2) {
    return { user1BlockedUser2: false, user2BlockedUser1: false, hasAnyBlock: false };
  }

  const cacheKey = getBlockStatusCacheKey(userId1, userId2);
  const now = Date.now();
  const cached = blockStatusCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const value = await checkMutualBlock(userId1, userId2);
  blockStatusCache.set(cacheKey, { value, expiresAt: now + BLOCK_STATUS_CACHE_TTL_MS });
  return value;
};

const invalidateHiddenPostsCache = (userId?: string | null): void => {
  if (!userId) return;
  hiddenPostsCache.delete(userId);
};

const getHiddenPostIdsForUser = async (
  userId: string,
  forceRefresh: boolean = false
): Promise<Set<string>> => {
  const now = Date.now();
  const cached = hiddenPostsCache.get(userId);
  if (!forceRefresh && cached && cached.expiresAt > now) {
    return new Set(cached.ids);
  }

  const hiddenSnap = await getDocs(collection(db, 'users', userId, HIDDEN_POSTS_COLLECTION));
  const ids = new Set(hiddenSnap.docs.map((d) => d.id));
  hiddenPostsCache.set(userId, { ids, expiresAt: now + HIDDEN_POSTS_CACHE_TTL_MS });
  return new Set(ids);
};

if (typeof window !== 'undefined') {
  window.addEventListener('userBlockChanged', () => {
    blockStatusCache.clear();
  });
}

/**
 * Create a new post
 */
export const createPost = async (
  userId: string,
  content: string,
  media: File[] = [],
  visibility: PostVisibility = 'public',
  userData?: any,
  taggedFriends: string[] = [],
  taggedGroups: string[] = [],
  // If true, the created post will be marked as draft and should not be displayed
  // until the creator flips draft to false (used for polls which need subcollection writes)
  initiallyDraft: boolean = false
): Promise<string> => {
  try {
    const [userDoc, mediaItems] = await Promise.all([
      userData ? Promise.resolve({ exists: () => true, data: () => userData }) : getDoc(doc(db, 'users', userId)),
      uploadMediaFiles(userId, media)
    ]);
    if (!userDoc.exists()) throw new Error('User not found');
    const finalUserData = userDoc.data();
    const validTaggedFriends = Array.isArray(taggedFriends) ? taggedFriends : [];
    const validTaggedGroups = Array.isArray(taggedGroups) ? taggedGroups : [];
    const postData = {
      userId,
      userName: finalUserData.name,
      userProfilePic: finalUserData.profile_pic,
      userRole: finalUserData.role,
      content,
      media: mediaItems,
      visibility,
      // Draft flag to control initial visibility (used by poll creation to avoid showing before subcollection exists)
      draft: initiallyDraft,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      isPinned: false,
      isEdited: false,
      commentCount: 0,
      reactionCount: 0,
      viewCount: 0,
      viewedBy: [],
      viewRoleBreakdown: {},
      taggedFriends: validTaggedFriends,
      taggedGroups: validTaggedGroups,
      isShare: false,
  shareCount: 0,
  // Flag so UI can treat the post optimistically until it reappears via listener
  isOptimistic: true
    };
    const postRef = await addDoc(collection(db, POSTS_COLLECTION), postData);
    if (!auth.currentUser) throw new Error('User authentication not ready.');
    await activityLogger.logActivity(
      'post_created',
      `Post created by user ${userId}`,
      { postId: postRef.id, userId },
      'medium',
      postRef.id,
      'post'
    );
    const isAdminOrSuperAdmin = finalUserData.role === 'admin' || finalUserData.role === 'super admin';
    if (isAdminOrSuperAdmin) {
      notifyAdminAnnouncement(postRef.id, userId, finalUserData.name).catch(e => console.error('Admin announce failed', e));
    }
    return postRef.id;
  } catch (error) {
    console.error('Error creating post:', error);
    throw error;
  }
};

/** Share an existing post (simple duplicate with attribution) */
export const sharePost = async (
  originalPostId: string,
  sharingUserId: string,
  visibilityOverride?: PostVisibility,
  caption?: string
): Promise<string> => {
  try {
    // Ensure the currently authenticated user matches the declared sharer to avoid UID mismatches
    if (!auth.currentUser || auth.currentUser.uid !== sharingUserId) {
      throw new Error('Authenticated user does not match sharing user ID');
    }
    const originalRef = doc(db, POSTS_COLLECTION, originalPostId);
    const originalSnap = await getDoc(originalRef);
    if (!originalSnap.exists()) throw new Error('Original post not found');
    const originalData = originalSnap.data() as any;
    const userSnap = await getDoc(doc(db, 'users', sharingUserId));
    if (!userSnap.exists()) throw new Error('Sharing user not found');
    const sharingUser = userSnap.data();

    // Determine canonical original metadata. If the source post was already a share,
    // reuse the snapshot stored in shared_posts to keep the lineage consistent.
    let canonicalOriginalMeta = {
      originalPostId,
      originalPostAuthorId: originalData.userId,
      originalPostAuthorName: originalData.userName,
      originalPostAuthorProfilePic: originalData.userProfilePic,
      originalPostContent: originalData.content || '',
      originalPostMedia: originalData.media || [],
      originalPostCreatedAt: originalData.createdAt || null,
      originalPostUpdatedAt: originalData.updatedAt || null,
      originalPostVisibility: originalData.visibility || 'public'
    };

    if (originalData.isShare && originalData.sharedPostRefId) {
      try {
        const previousSharedSnap = await getDoc(doc(db, SHARED_POSTS_COLLECTION, originalData.sharedPostRefId));
        if (previousSharedSnap.exists()) {
          const prevData = previousSharedSnap.data() as any;
          canonicalOriginalMeta = {
            originalPostId: prevData.originalPostId || originalPostId,
            originalPostAuthorId: prevData.originalPostAuthorId || originalData.userId,
            originalPostAuthorName: prevData.originalPostAuthorName || originalData.userName,
            originalPostAuthorProfilePic: prevData.originalPostAuthorProfilePic || originalData.userProfilePic,
            originalPostContent: prevData.originalPostContent || '',
            originalPostMedia: prevData.originalPostMedia || [],
            originalPostCreatedAt: prevData.originalPostCreatedAt || originalData.createdAt || null,
            originalPostUpdatedAt: prevData.originalPostUpdatedAt || originalData.updatedAt || null,
            originalPostVisibility: prevData.originalPostVisibility || originalData.visibility || 'public'
          };
        }
      } catch (nestedError) {
        console.warn('[sharePost] Failed to hydrate canonical original metadata from shared_posts:', nestedError);
      }
    }

    const sharedPostDoc = {
      ...canonicalOriginalMeta,
      sharerId: sharingUserId,
      sharerName: sharingUser.name,
      sharerProfilePic: sharingUser.profile_pic,
      sharerRole: sharingUser.role,
      sharerCaption: typeof caption === 'string' ? caption : '',
      sharedAt: serverTimestamp(),
      visibility: visibilityOverride || canonicalOriginalMeta.originalPostVisibility || 'public'
    };

    const sharedPostRef = await addDoc(collection(db, SHARED_POSTS_COLLECTION), sharedPostDoc);

    const newPostData = {
      userId: sharingUserId,
      userName: sharingUser.name,
      userProfilePic: sharingUser.profile_pic,
      userRole: sharingUser.role,
      content: typeof caption === 'string' ? caption : '',
      media: [],
      visibility: visibilityOverride || canonicalOriginalMeta.originalPostVisibility || 'public',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      isPinned: false,
      isEdited: false,
      commentCount: 0,
      reactionCount: 0,
      viewCount: 0,
      viewedBy: [],
      viewRoleBreakdown: {},
      tags: [],
      taggedFriends: [],
      taggedGroups: [],
      isShare: true,
      sharedFromPostId: canonicalOriginalMeta.originalPostId,
      sharedFromUserId: canonicalOriginalMeta.originalPostAuthorId,
      sharedFromUserName: canonicalOriginalMeta.originalPostAuthorName,
      originalPostId: canonicalOriginalMeta.originalPostId,
      originalPostUserId: canonicalOriginalMeta.originalPostAuthorId,
      originalPostUserName: canonicalOriginalMeta.originalPostAuthorName,
      sharedAt: serverTimestamp(),
      shareCount: 0,
      sharedPostRefId: sharedPostRef.id
    };

    const sharedRef = await addDoc(collection(db, POSTS_COLLECTION), newPostData);

    if (auth.currentUser) {
      await activityLogger.logActivity(
        'post_shared',
        `User ${sharingUserId} shared post ${canonicalOriginalMeta.originalPostId}`,
        { originalPostId: canonicalOriginalMeta.originalPostId, sharedPostId: sharedRef.id, userId: sharingUserId },
        'low',
        sharedRef.id,
        'post'
      );
    }
    return sharedRef.id;
  } catch (error) {
    console.error('Error sharing post:', error);
    throw error;
  }
};

/**
 * Upload media files in parallel for better performance
 */
const uploadMediaFiles = async (userId: string, media: File[]): Promise<MediaItem[]> => {
  if (media.length === 0) {
    return [];
  }

  // Upload all files in parallel
  const uploadPromises = media.map(async (file) => {
    const fileId = uuidv4();
    const fileRef = ref(storage, `posts/${userId}/${fileId}_${file.name}`);
    
    // Upload file first
    await uploadBytes(fileRef, file);
    
    // Then get the download URL
    const downloadUrl = await getStorageUrlWithCORS(fileRef);
    
    // Determine media type efficiently
    const mediaType: 'image' | 'video' | 'document' = 
      file.type.startsWith('image/') ? 'image' :
      file.type.startsWith('video/') ? 'video' : 'document';
    
    return {
      type: mediaType,
      url: downloadUrl,
      name: file.name,
      size: file.size,
      // store the storage path so cleanup can delete the exact object later
      storagePath: fileRef.fullPath
    };
  });

  return Promise.all(uploadPromises);
};

/**
 * Updates an existing post
 * @param postId Post ID to update
 * @param userId Current user ID (for permission check)
 * @param content New post content
 * @param media Media items for the post
 * @param visibility Post visibility setting
 * @returns Promise that resolves when update is complete
 */
export const updatePost = async (
  postId: string, 
  userId: string,
  content: string,
  media?: MediaItem[],
  visibility?: PostVisibility
): Promise<void> => {
  try {
    const postRef = doc(db, POSTS_COLLECTION, postId);
    const postDoc = await getDoc(postRef);
    
    if (!postDoc.exists()) {
      throw new Error('Post not found');
    }
    
    const postData = postDoc.data() as Post;
    
    // Check if user is the author of the post
    if (postData.userId !== userId) {
      throw new Error('You do not have permission to edit this post');
    }
    
    // Update post data
    const updatedData: Partial<Post> = {
      content: content,
      isEdited: true,
      updatedAt: serverTimestamp() as Timestamp,
    };
    
    // Only update media and visibility if provided
    if (media) {
      updatedData.media = media;
    }
    
    if (visibility) {
      updatedData.visibility = visibility;
    }
    
    await updateDoc(postRef, updatedData);
  } catch (error) {
    console.error('Error updating post:', error);
    throw error;
  }
};

/**
 * Delete a post and its associated media
 * @param postId The ID of the post to delete
 * @param userId The ID of the user making the delete request
 * @param isAdmin Whether the user is an admin or super admin (can delete any post regardless of ownership)
 */
export const deletePost = async (postId: string, userId: string, isAdmin: boolean = false): Promise<void> => {
  try {
    console.log('[DELETE POST] Function called with:', { postId, userId, isAdmin });
    
    // First validate inputs
    if (!postId) {
      throw new Error('Post ID is required');
    }
    
    if (!userId) {
      throw new Error('User ID is required');
    }

    // Get user's role to verify admin status
    let userRole = '';
    let isAdminVerified = isAdmin;
    
    try {
      const userDoc = await getDoc(doc(db, 'users', userId));
      if (userDoc.exists()) {
        userRole = userDoc.data().role || '';
        // Double-check if user is actually an admin or super admin
        isAdminVerified = userRole === 'admin' || userRole === 'super admin';
        
        // If admin flag was passed as true but user is not actually an admin, log this discrepancy
        if (isAdmin && !isAdminVerified) {
          console.warn('[DELETE POST] Admin flag was passed as true but user is not an admin:', { 
            userId, 
            role: userRole 
          });
        }
      } else {
        console.error('[DELETE POST] User not found:', { userId });
        isAdminVerified = false; // If user doesn't exist, they're definitely not an admin
      }
    } catch (userError) {
      console.error('[DELETE POST] Error fetching user data for admin verification:', userError);
      // In case of error, we'll use the provided isAdmin flag but log the error
      isAdminVerified = isAdmin;
    }

    // Use the comprehensive Firebase cleanup service for total deletion
    console.log('[DELETE POST] Using comprehensive Firebase cleanup service for total deletion...');
    
    // First, broadcast the deletion event for immediate UI updates
    // This allows components to react instantly rather than waiting for the deletion to complete
    console.log('[DELETE POST] Broadcasting deletion event before performing actual deletion');
    postDeletionEvents.notifyDeletion(postId);
    
  // Then perform the actual deletion in the database
  // Pass isAdminVerified so cleanup service can limit cross-user operations for non-admins
  try {
    await totalFirebasePostDeletion(postId, userId, isAdminVerified);
    console.log('[DELETE POST] Post cleanup service completed (best-effort)');
  } catch (cleanupError) {
    // Log the cleanup error but do not treat the whole delete as failed if the main post document was removed.
    console.warn('[DELETE POST] Cleanup service reported error (continuing):', cleanupError);
  }
    
    // Broadcast the deletion event again to ensure all components are updated
    // This is a safety measure in case any component was created after the initial broadcast
    console.log('[DELETE POST] Broadcasting final deletion event');
    postDeletionEvents.notifyDeletion(postId);
    
    // Notify all components about the post deletion
    postDeletionEvents.notifyDeletion(postId);

    // Log activity for post deletion
    if (!auth.currentUser) {
      throw new Error('User authentication not ready. Please try again.');
    }
    await activityLogger.logActivity(
      'post_deleted',
      `Post deleted by user ${userId}${isAdmin ? ' (admin)' : ''}`,
      { postId, userId, isAdmin },
      isAdmin ? 'high' : 'medium',
      postId,
      'post'
    );
    // If admin or super admin, also log to their own activity logs for visibility
    if (isAdminVerified) {
      await activityLogger.logActivity(
        'post_deleted',
        `You (admin) deleted a post (ID: ${postId})`,
        { postId, userId, isAdmin: true },
        'high',
        postId,
        'post'
      );
    }
  } catch (error) {
    // Enhanced error reporting
    console.error('[DELETE POST] Error deleting post:', {
      postId,
      userId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    
    // Rethrow with a more descriptive message if possible
    if (error instanceof Error) {
      throw new Error(`Failed to delete post: ${error.message}`);
    } else {
      throw new Error('Failed to delete post due to an unknown error');
    }
  }
};

/**
 * Quick delete of only the main post document.
 * Intended for fast client-side deletes (optimistic UX). Heavy cleanup
 * (subcollections, notifications, storage) is performed server-side by
 * an Admin Cloud Function triggered on document delete.
 */
export const deletePostQuick = async (postId: string, userId: string, isAdmin: boolean = false): Promise<void> => {
  try {
    if (!postId) throw new Error('Post ID is required');
    if (!userId) throw new Error('User ID is required');

    const postRef = doc(db, POSTS_COLLECTION, postId);
    const postSnap = await getDoc(postRef);
    if (!postSnap.exists()) {
      // Already deleted — nothing to do
      return;
    }

    const postData: any = postSnap.data();
    // If not admin, enforce ownership check on the client side as a fast guard.
    // Firestore security rules should be the ultimate enforcement.
    if (!isAdmin && postData?.userId !== userId) {
      throw new Error('Not authorized to delete this post');
    }

    // Delete the main post document only. The Cloud Function will clean up the
    // related subcollections, storage files, and cross-user references.
    await deleteDoc(postRef);

    // Broadcast local deletion so UI can update immediately
    postDeletionEvents.notifyDeletion(postId);

    // Log activity (best-effort)
    try {
      await activityLogger.logActivity(
        'post_deleted',
        `Post quick-deleted by user ${userId}${isAdmin ? ' (admin)' : ''}`,
        { postId, userId, isAdmin },
        isAdmin ? 'high' : 'medium',
        postId,
        'post'
      );
    } catch (logErr) {
      console.warn('[deletePostQuick] activity log failed', logErr);
    }
  } catch (error) {
    console.error('[deletePostQuick] error', error);
    throw error;
  }
};

 

/**
 * Add or remove a reaction from a post
 */
export const addReaction = async (postId: string, userId: string): Promise<void> => {
  try {
    const { AuthService } = await import('../services/authService');
    const authenticatedUserId = await AuthService.verifyAuthentication(false);
    const firebaseUid = auth.currentUser?.uid || authenticatedUserId;

    if (!firebaseUid) {
      throw new Error('You must be logged in to react to posts');
    }

    if (firebaseUid !== userId) {
      throw new Error('Authentication mismatch. Please log out and log in again.');
    }

    // Always use the strict path: /posts/{postId}/reactions/{userId}
    const postRef = doc(db, 'posts', postId);
    const reactionRef = doc(db, 'posts', postId, 'reactions', userId);

    const [postDoc, reactionDoc, userDoc] = await Promise.all([
      getDoc(postRef),
      getDoc(reactionRef),
      getDoc(doc(db, 'users', userId)),
    ]);

    if (!postDoc.exists()) {
      throw new Error('Post not found');
    }

    const userData = userDoc.exists() ? userDoc.data() : null;

    const reactionPayload = {
      userId: firebaseUid,
      type: 'heart',
      timestamp: serverTimestamp(),
      userName: userData?.name || 'User',
      userProfilePic: userData?.profile_pic || null,
    };

    // Commit reaction doc + counter update atomically to prevent UI/server divergence.
    const batch = writeBatch(db);
    if (reactionDoc.exists()) {
      batch.delete(reactionRef);
      batch.update(postRef, { reactionCount: increment(-1) });
    } else {
      batch.set(reactionRef, reactionPayload, { merge: false });
      batch.update(postRef, { reactionCount: increment(1) });
    }

    await batch.commit();

    if (!reactionDoc.exists()) {
      const postOwnerId = postDoc.data().userId;
      if (userId !== postOwnerId) {
        try {
          await notifyPostReaction(postId, userId, postOwnerId);
        } catch (notifyError) {
          console.error('Error sending reaction notification:', notifyError);
        }
      }
    }
  } catch (error: any) {
    console.error('Error toggling reaction:', error);
    if (error.code && error.code.includes('permission-denied')) {
      const { AuthService } = await import('../services/authService');
      console.log('[addReaction] Permission denied error, running auth diagnostics');
      const diagnostics = await AuthService.runAuthDiagnostics();
      console.log('[addReaction] Auth diagnostics:', diagnostics);
      // Print all relevant debug info
      console.error('[addReaction] --- DEBUG INFO (outer catch) ---');
      console.error('[addReaction] Authenticated UID:', auth.currentUser?.uid);
      console.error('[addReaction] Document path:', `posts/${postId}/reactions/${userId}`);
      console.error('[addReaction] Error object (stringified):', JSON.stringify(error, Object.getOwnPropertyNames(error)));
      console.error('[addReaction] Reminder: Check deployed Firestore rules in the Firebase Console.');
      throw new Error(`Permission denied. Make sure you are logged in and have the right permissions. Details: ${error.message}`);
    }
    throw error;
  }
};

/**
 * Check if user has reacted to a post
 */
export const hasUserReacted = async (postId: string, userId: string): Promise<boolean> => {
  try {
    // Import auth service dynamically to avoid circular dependencies
    const { AuthService } = await import('../services/authService');
    
    // First check if authenticated (non-enforced)
    const authenticatedUserId = await AuthService.verifyAuthentication(false);
    if (!authenticatedUserId) {
      console.log('[hasUserReacted] User not authenticated');
      return false;
    }
    
    try {
      // Try first with collection reference pattern (more reliable)
      const reactionRef = doc(collection(db, `posts/${postId}/reactions`), userId);
      const reactionDoc = await getDoc(reactionRef);
      return reactionDoc.exists();
    } catch (error) {
      // If that fails, try with nested doc pattern
      console.log('[hasUserReacted] First pattern failed, trying alternative');
      const reactionRef = doc(db, POSTS_COLLECTION, postId, REACTIONS_COLLECTION, userId);
      const reactionDoc = await getDoc(reactionRef);
      return reactionDoc.exists();
    }
  } catch (error) {
    console.error('Error checking reaction status:', error);
    return false;
  }
};

/**
 * Add a comment to a post
 */
export const addComment = async (postId: string, userId: string, content: string, replyTo?: string | null): Promise<string> => {
  try {
    // Ensure the caller is authenticated and token is fresh. This prevents permission-denied
    // errors caused by stale tokens or UID mismatches against Firestore security rules.
    // Fallback to Firebase auth state when AuthService session keys are temporarily stale.
    const { AuthService } = await import('./authService');
    const authenticatedUserId = await AuthService.verifyAuthentication(false);

    const firebaseUserId = auth.currentUser?.uid || null;
    const effectiveUserId = authenticatedUserId || firebaseUserId;

    if (!effectiveUserId) {
      console.error('[addComment] Authentication missing before comment write', {
        authenticatedUserId,
        firebaseUserId,
      });
      throw new Error('Authentication required to add comment');
    }

    if (effectiveUserId !== userId) {
      console.error('[addComment] Authenticated UID does not match provided userId', {
        authenticatedUserId,
        firebaseUserId,
        userId,
      });
      throw new Error('Authenticated user does not match provided userId');
    }

    // Force refresh ID token to avoid session desync issues
    if (auth.currentUser) {
      await auth.currentUser.getIdToken(true);
    }

    // Get user information
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (!userDoc.exists()) {
      throw new Error('User not found');
    }
    const userData = userDoc.data();

    // Build comment payload for either a top-level comment or a reply
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

    // If replyTo is provided, create the reply in a `replies` subcollection under the parent comment.
    // Replies are stored separately so they can be classified independently from top-level comments.
    let commentRef;
    const postRef = doc(db, POSTS_COLLECTION, postId);

    if (replyTo) {
      // create reply under posts/{postId}/comments/{replyTo}/replies
      try {
        console.log('[addComment] Writing reply to', `posts/${postId}/comments/${replyTo}/replies`, 'payload=', commentData);
        commentRef = await addDoc(collection(db, POSTS_COLLECTION, postId, COMMENTS_COLLECTION, replyTo, 'replies'), commentData);
      } catch (writeError: any) {
        console.error('[addComment] Failed to write reply:', {
          code: writeError.code,
          message: writeError.message,
          path: `posts/${postId}/comments/${replyTo}/replies`,
          payload: commentData
        });
        throw writeError;
      }
      // Do NOT increment post.commentCount for replies (they are not top-level comments)
      // Notify post owner that a reply was made (keep behavior consistent)
      const postDoc = await getDoc(postRef);
      if (postDoc.exists()) {
        const postData = postDoc.data();
        if (postData && postData.userId) {
          const excerpt = `(reply) ${content.slice(0, 120)}`;
          await notifyPostComment(postId, userId, postData.userId, excerpt);
        }
      }
    } else {
      // Top-level comment
      try {
        console.log('[addComment] Writing top-level comment to', `posts/${postId}/comments`, 'payload=', commentData);
        commentRef = await addDoc(collection(db, POSTS_COLLECTION, postId, COMMENTS_COLLECTION), commentData);
      } catch (writeError: any) {
        console.error('[addComment] Failed to write top-level comment:', {
          code: writeError.code,
          message: writeError.message,
          path: `posts/${postId}/comments`,
          payload: commentData
        });
        throw writeError;
      }
      // Update comment count on post
      await updateDoc(postRef, {
        commentCount: increment(1),
      });

      // Notify post owner (pass comment excerpt)
      const postDoc = await getDoc(postRef);
      if (postDoc.exists()) {
        const postData = postDoc.data();
        if (postData && postData.userId) {
          const excerpt = content.slice(0, 120);
          await notifyPostComment(postId, userId, postData.userId, excerpt);
        }
      }
    }

    return commentRef.id;
  } catch (error: any) {
    // Enhanced error logging
    console.error('Error adding comment:', error?.message || error, error?.stack);
    // Throw a more descriptive error for UI
    throw new Error(`Failed to add comment: ${error?.message || error}`);
  }
};

/**
 * Update a comment
 */
export const updateComment = async (postId: string, commentId: string, userId: string, content: string): Promise<void> => {
  try {
    const commentRef = doc(db, POSTS_COLLECTION, postId, COMMENTS_COLLECTION, commentId);
    const commentDoc = await getDoc(commentRef);
    
    if (!commentDoc.exists()) {
      throw new Error('Comment not found');
    }
    
    const commentData = commentDoc.data();
    
    // Verify user is the owner of the comment
    if (commentData.userId !== userId) {
      throw new Error('Not authorized to update this comment');
    }
    
    await updateDoc(commentRef, {
      content,
      updatedAt: serverTimestamp(),
      isEdited: true
    });
  } catch (error) {
    console.error('Error updating comment:', error);
    throw error;
  }
};

/**
 * Delete a comment
 * @param postId The ID of the post containing the comment
 * @param commentId The ID of the comment to delete
 * @param userId The ID of the user making the delete request
 * @param isAdmin Whether the user is a super admin (can delete any comment regardless of ownership)
 */
export const deleteComment = async (postId: string, commentId: string, userId: string, isAdmin: boolean = false): Promise<void> => {
  try {
    const commentRef = doc(db, POSTS_COLLECTION, postId, COMMENTS_COLLECTION, commentId);
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
    
    // Update comment count on post
    const postRef = doc(db, POSTS_COLLECTION, postId);
    await updateDoc(postRef, {
      commentCount: increment(-1)
    });

    // Log activity
    await activityLogger.logActivity(
      'comment_deleted',
      `Comment deleted by user ${userId}${isAdmin ? ' (admin)' : ''}`,
      { postId, commentId, userId, isAdmin },
      isAdmin ? 'high' : 'medium',
      commentId,
  );
  } catch (error) {
    console.error('Error deleting comment:', error);
    throw error;
  }
};

/**
 * Hide a post for a user
 */
export const hidePost = async (postId: string, userId: string): Promise<void> => {
  try {
    const postRef = doc(db, POSTS_COLLECTION, postId);
    const postSnapshot = await getDoc(postRef);
    if (!postSnapshot.exists()) throw new Error('Post not found');

    const postData = postSnapshot.data();
    // Post authors cannot hide their own posts
    if (postData.userId === userId) {
      console.error('Post authors cannot hide their own posts');
      throw new Error('Post authors cannot hide their own posts');
    }

    const hiddenPostRef = doc(db, 'users', userId, HIDDEN_POSTS_COLLECTION, postId);
    await setDoc(hiddenPostRef, { postId, hiddenAt: serverTimestamp() });
    invalidateHiddenPostsCache(userId);
  } catch (error) {
    console.error('Error hiding post:', error);
    throw error;
  }
};

/**
 * Unhide a post for a user
 */
export const unhidePost = async (postId: string, userId: string): Promise<void> => {
  try {
    const hiddenPostRef = doc(db, 'users', userId, HIDDEN_POSTS_COLLECTION, postId);
    await deleteDoc(hiddenPostRef);
    invalidateHiddenPostsCache(userId);
  } catch (error) {
    console.error('Error unhiding post:', error);
    throw error;
  }
};

/**
 * Check if a post is hidden for a user
 */
export const isPostHidden = async (postId: string, userId: string): Promise<boolean> => {
  try {
    const hiddenPostRef = doc(db, 'users', userId, HIDDEN_POSTS_COLLECTION, postId);
    const hiddenPostDoc = await getDoc(hiddenPostRef);
    return hiddenPostDoc.exists();
  } catch (error) {
    console.error('Error checking if post is hidden:', error);
    return false;
  }
};

// Friendship removed: always treat as not friends (visibility logic already bypassed elsewhere)
async function areFriends(_userId: string, _otherUserId: string): Promise<boolean> { return false; }

/**
 * Get posts with real-time updates
 * Returns a cleanup function to unsubscribe
 */
/**
 * Fetch a batch of posts for infinite scroll (not real-time)
 * @param userId The current user's ID
 * @param userRole The current user's role
 * @param batchSize Number of posts to fetch
 * @param lastVisible The last document from the previous batch (for pagination)
 * @param visibilityFilter Optional array of visibilities to filter
 * @returns Promise<{ posts: Post[], lastVisible: QueryDocumentSnapshot | null, hasMore: boolean }>
 */
export const getPostsBatch = async (
  userId: string | null | undefined,
  userRole: string | null | undefined,
  batchSize: number = 10,
  lastVisible: any = null,
  visibilityFilter?: PostVisibility[],
): Promise<{ posts: Post[]; lastVisible: any; hasMore: boolean }> => {
  try {
    // Build base query
    // ARCHIVE FILTER DISABLED: previously excluded posts with annual_archive_date set.
    // Keeping query simple so both archived and non-archived posts show up for now.
    let postsQuery: any = query(
      collection(db, POSTS_COLLECTION),
      orderBy('createdAt', 'desc'),
      limit(batchSize)
    );
    if (lastVisible) postsQuery = query(postsQuery, startAfter(lastVisible));

    const snapshot = await getDocs(postsQuery);
    const fetchedDocs = snapshot.docs;
    const baseLast = fetchedDocs[fetchedDocs.length - 1] || null;
    const hasMore = snapshot.size === batchSize;

    if (!fetchedDocs.length) {
      return { posts: [], lastVisible: baseLast, hasMore: false };
    }

    // Gather hidden post IDs to skip (avoid flash of hidden posts). Only for authenticated viewers.
    let hiddenIds: Set<string> = new Set();
    if (userId) {
      try {
        hiddenIds = await getHiddenPostIdsForUser(userId);
      } catch (e) {
        console.warn('Hidden posts fetch failed (batch)', e);
      }
    }

  // Collect author IDs for block checks
  const authorIdsAll = new Set<string>();
    fetchedDocs.forEach(d => {
      const data: any = d.data();
  const author = data.userId;
  if (author) authorIdsAll.add(author);
    });
    if (userId) authorIdsAll.delete(userId);

    // Build a map of block status for authors with current user via blocked_users collection
    const authorBlockedMap = new Map<string, { userBlockedAuthor: boolean; authorBlockedUser: boolean }>();
    if (userId) {
      const checks = Array.from(authorIdsAll).map(async aid => {
        const status = await getMutualBlockStatusCached(userId, aid);
        authorBlockedMap.set(aid, { userBlockedAuthor: status.user1BlockedUser2, authorBlockedUser: status.user2BlockedUser1 });
      });
      await Promise.all(checks);
    }

  // Friendship lookups removed

    const visiblePosts: Post[] = [];
    for (const docSnap of fetchedDocs) {
      if (hiddenIds.has(docSnap.id)) continue;
      const data: any = docSnap.data();
      const authorId = data.userId;
      const postVisibility = data.visibility as PostVisibility;
      const authorRole = data.userRole as string;

  // Block logic using blocked_users
    const rel = authorBlockedMap.get(authorId) || { userBlockedAuthor: false, authorBlockedUser: false };
    const authorBlockedUser = rel.userBlockedAuthor; // current user blocked author
    const userBlockedByAuthor = rel.authorBlockedUser; // author blocked current user
      if (userBlockedByAuthor) continue;

  // Bypass visibility restrictions: show all posts to all user roles.
  // Keep block/hidden logic intact above; visibility is no longer restricted by post.visibility or userRole.
  let isVisible = true;
      if (!isVisible) continue;
      if (userId && authorBlockedUser) continue; // hide authors current user blocked (only when viewer authenticated)
      if (visibilityFilter && visibilityFilter.length && !visibilityFilter.includes(postVisibility)) continue;

      visiblePosts.push({
        id: docSnap.id,
        content: data.content,
        createdAt: data.createdAt,
        userId: data.userId,
        userRole: data.userRole,
        visibility: data.visibility,
        reactionCount: data.reactionCount || 0,
        commentCount: data.commentCount || 0,
        media: data.media || [],
        tags: data.tags || [],
        taggedFriends: data.taggedFriends || [],
        taggedGroups: data.taggedGroups || [],
        reported: data.reported || false,
        reportReason: data.reportReason,
        isShare: data.isShare || false,
        sharedFromPostId: data.sharedFromPostId,
        sharedFromUserId: data.sharedFromUserId,
        sharedFromUserName: data.sharedFromUserName,
        originalPostId: data.originalPostId,
        originalPostUserId: data.originalPostUserId,
        originalPostUserName: data.originalPostUserName,
      sharedPostRefId: data.sharedPostRefId,
      } as Post);
    }

    // Always sort visiblePosts by createdAt descending before returning
    visiblePosts.sort((a, b) => {
      let dateA = 0;
      let dateB = 0;
      if (a.createdAt) {
        if (typeof a.createdAt.toDate === 'function') {
          dateA = a.createdAt.toDate().getTime();
        } else if (a.createdAt instanceof Date) {
          dateA = a.createdAt.getTime();
        } else if (typeof a.createdAt === 'string' || typeof a.createdAt === 'number') {
          dateA = new Date(a.createdAt).getTime();
        }
      }
      if (b.createdAt) {
        if (typeof b.createdAt.toDate === 'function') {
          dateB = b.createdAt.toDate().getTime();
        } else if (b.createdAt instanceof Date) {
          dateB = b.createdAt.getTime();
        } else if (typeof b.createdAt === 'string' || typeof b.createdAt === 'number') {
          dateB = new Date(b.createdAt).getTime();
        }
      }
      return dateB - dateA;
    });

    // Hydrate shared_posts snapshots for any shared posts so frontend can render without extra fetches
    try {
      const sharedIds = visiblePosts.map(p => p.sharedPostRefId).filter(Boolean) as string[]
      if (sharedIds.length) {
        const snapMap = await hydrateSharedSnapshots(sharedIds)
        visiblePosts.forEach((p) => {
          if (p.sharedPostRefId) {
            const snap = snapMap.get(p.sharedPostRefId)
            if (snap) {
              // Attach snapshot in the same shape used elsewhere
              ;(p as any).sharedPostSnapshot = snap
            } else {
              ;(p as any).sharedPostSnapshot = null
            }
          }
        })
      }
    } catch (e) {
      console.warn('[getPostsBatch] hydrateSharedSnapshots failed', e)
    }

    return { posts: visiblePosts, lastVisible: baseLast, hasMore };
  } catch (error) {
    console.error('Error fetching posts batch:', error);
    return { posts: [], lastVisible: null, hasMore: false };
  }
};

// Helper: fetch shared_posts snapshots for a list of sharedPostRefIds
async function hydrateSharedSnapshots(ids: string[]): Promise<Map<string, any>> {
  const out = new Map<string, any>()
  if (!ids || !ids.length) return out
  const unique = Array.from(new Set(ids.filter(Boolean)))

  const sharedDataById = new Map<string, any | null>()
  const originalPostIds = new Set<string>()
  const normalizeOriginalPostId = (value: any): string | null => {
    if (typeof value === 'string' && value.trim()) return value
    if (typeof value === 'number') return String(value)
    return null
  }

  for (let i = 0; i < unique.length; i += 10) {
    const chunk = unique.slice(i, i + 10)
    try {
      const chunkQuery = query(
        collection(db, SHARED_POSTS_COLLECTION),
        where(documentId(), 'in', chunk)
      )
      const snap = await getDocs(chunkQuery)
      const found = new Set<string>()

      snap.docs.forEach((d) => {
        const data = d.data() || {}
        const normalizedOriginalId = normalizeOriginalPostId(data.originalPostId || data.original_post_id)
        if (normalizedOriginalId) {
          originalPostIds.add(normalizedOriginalId)
        }
        sharedDataById.set(d.id, { ...data, id: d.id, normalizedOriginalId })
        found.add(d.id)
      })

      chunk.forEach((id) => {
        if (!found.has(id)) sharedDataById.set(id, null)
      })
    } catch (e) {
      console.warn('[hydrateSharedSnapshots] failed shared chunk fetch', chunk, e)
      chunk.forEach((id) => sharedDataById.set(id, null))
    }
  }

  const originalDataById = new Map<string, any>()
  const originalIds = Array.from(originalPostIds)
  for (let i = 0; i < originalIds.length; i += 10) {
    const chunk = originalIds.slice(i, i + 10)
    try {
      const originalsQuery = query(
        collection(db, POSTS_COLLECTION),
        where(documentId(), 'in', chunk)
      )
      const snap = await getDocs(originalsQuery)
      snap.docs.forEach((d) => originalDataById.set(d.id, d.data() || {}))
    } catch (e) {
      console.warn('[hydrateSharedSnapshots] failed original chunk fetch', chunk, e)
    }
  }

  unique.forEach((id) => {
    const data = sharedDataById.get(id)
    if (!data) {
      out.set(id, null)
      return
    }

    const originalPostId = data.normalizedOriginalId as string | null
    if (originalPostId) {
      const originalData = originalDataById.get(originalPostId)
      if (!originalData) {
        out.set(id, null)
        return
      }
      out.set(id, {
        ...(data),
        originalPostId,
        originalPostAuthorId: originalData.userId || data.originalPostAuthorId,
        originalPostAuthorName: originalData.userName || data.originalPostAuthorName,
        originalPostAuthorProfilePic: originalData.userProfilePic || data.originalPostAuthorProfilePic,
        originalPostContent: typeof originalData.content === 'string' ? originalData.content : (data.originalPostContent || ''),
        originalPostMedia: Array.isArray(originalData.media) ? originalData.media : (data.originalPostMedia || []),
        originalPostCreatedAt: originalData.createdAt || data.originalPostCreatedAt || null,
        originalPostUpdatedAt: originalData.updatedAt || data.originalPostUpdatedAt || null,
        originalPostVisibility: originalData.visibility || data.originalPostVisibility || 'public'
      })
      return
    }

    out.set(id, data)
  })

  return out
}

export const getPostsRealtime = (
  userId: string | null | undefined,
  userRole: string | null | undefined,
  onPostsUpdate: (posts: Post[]) => void,
  onError?: (error: Error) => void,
  visibilityFilter?: PostVisibility[],
  limitCount: number = 60
): (() => void) => {
  console.log('[postService:getPostsRealtime] init userId:', userId, 'role:', userRole, 'limitCount:', limitCount);

  // Cap limit to prevent unbounded downloads on very large collections while still generous.
  const MAX_REALTIME_POSTS = 300;
  const effectiveLimit = Math.min(limitCount, MAX_REALTIME_POSTS);

  // Fetch slightly more than requested to offset filtering (hidden/blocked). Use a 1.5x multiplier (rounded up).
  const fetchLimit = Math.min(Math.ceil(effectiveLimit * 1.5), MAX_REALTIME_POSTS);

  // ARCHIVE FILTER DISABLED: allow archived posts to appear in realtime feed as well.
  const postsQuery = query(
    collection(db, POSTS_COLLECTION),
    orderBy('createdAt', 'desc'),
    limit(fetchLimit)
  );
  
  // Set up real-time listener
  const unsubscribe = onSnapshot(postsQuery, async (snapshot) => {
    console.log('Received snapshot with', snapshot.docs.length, 'posts');
    try {
      // 1. Hidden posts for this user (only when viewer authenticated)
      let hiddenPostIds = new Set<string>();
      if (userId) {
        hiddenPostIds = await getHiddenPostIdsForUser(userId);
      }

      // 2. Clean up orphaned hidden post refs
      const existingPostIds = new Set(snapshot.docs.map(d => d.id));
      const orphaned = Array.from(hiddenPostIds).filter(id => !existingPostIds.has(id));
      if (orphaned.length && userId) {
        console.log('Cleaning orphaned hidden posts', orphaned);
        await Promise.all(orphaned.map(async oid => {
          try { await deleteDoc(doc(db, 'users', userId, HIDDEN_POSTS_COLLECTION, oid)); } catch (e) { console.warn('Orphan cleanup fail', oid, e); }
          hiddenPostIds.delete(oid);
        }));
        hiddenPostsCache.set(userId, { ids: new Set(hiddenPostIds), expiresAt: Date.now() + HIDDEN_POSTS_CACHE_TTL_MS });
      }

      // 3. Pre-compute unique author IDs (exclude self for some checks)
      const authorIds = new Set<string>();
      snapshot.docs.forEach(d => { const pd = d.data(); if (pd?.userId) authorIds.add(pd.userId); });
      if (userId) authorIds.delete(userId); // we don't need friendship/block lookups for own posts

      // 4. Build a map of block status per author using blocked_users collection via userService.checkMutualBlock
      const authorBlockedMap = new Map<string, { userBlockedAuthor: boolean; authorBlockedUser: boolean }>();
      if (userId) {
        const checks: Promise<void>[] = [];
        authorIds.forEach(aid => {
          checks.push(
            getMutualBlockStatusCached(userId, aid).then(status => {
              authorBlockedMap.set(aid, { userBlockedAuthor: status.user1BlockedUser2, authorBlockedUser: status.user2BlockedUser1 });
            })
          );
        });
        await Promise.all(checks);
      }

  // 5. Friendship checks removed

      // 6. Build lightweight metadata first (no awaits inside main loop except scheduled ones)
      interface TempPostMeta { docSnap: any; postData: any; skip: boolean; reason?: string; }
      const meta: TempPostMeta[] = snapshot.docs.map(docSnap => ({ docSnap, postData: docSnap.data(), skip: false }));

      // Mark hidden early
      meta.forEach(m => { if (hiddenPostIds.has(m.docSnap.id)) { m.skip = true; m.reason = 'hidden'; } });

  // Determine which authors need friendship checks (removed)

  // Friendship fetches removed

      // 7. Now build final posts concurrently
  const posts: Post[] = [];
      for (const m of meta) {
        if (m.skip) continue;
        const { docSnap, postData } = m;
        const postVisibility = postData.visibility as PostVisibility;
        const postAuthorRole = postData.userRole as string;
        const authorId = postData.userId;

  // Block checks using map built above
    const rel = authorBlockedMap.get(authorId) || { userBlockedAuthor: false, authorBlockedUser: false };
    const authorBlockedUser = rel.userBlockedAuthor; // current user blocked author
    const userBlockedByAuthor = rel.authorBlockedUser; // author blocked current user
      if (userBlockedByAuthor) { continue; }

  // Bypass visibility restrictions in real-time path: show all posts to all user roles.
  // Visibility decisions are only influenced by hidden/blocked checks handled above.
  let isVisible = true;
        if (!isVisible) continue;
        if (visibilityFilter && visibilityFilter.length && !visibilityFilter.includes(postVisibility)) continue;
        if (userId && authorBlockedUser) { // current user blocked this author; optional: still hide
          continue;
        }

        const createdAt = postData.createdAt instanceof Timestamp ? postData.createdAt : Timestamp.fromDate(new Date());
        const updatedAt = postData.updatedAt instanceof Timestamp ? postData.updatedAt : Timestamp.fromDate(new Date());
        const mediaItems = postData.media?.map((mediaItem: MediaItem) => ({
          ...mediaItem,
          url: isLocalhost() ? createCORSStorageURL(mediaItem.url) : mediaItem.url
        })) || [];
        const postWithRequiredFields: Post = {
          id: docSnap.id,
          userId: postData.userId || '',
          userName: postData.userName || '',
          userProfilePic: postData.userProfilePic || '',
          userRole: postData.userRole || '',
          content: postData.content || '',
          visibility: postData.visibility || 'public',
          createdAt,
          updatedAt,
          isPinned: false,
          isEdited: postData.isEdited || false,
          commentCount: postData.commentCount || 0,
          reactionCount: postData.reactionCount || 0,
          viewCount: postData.viewCount || 0,
          media: mediaItems,
          pinnedAt: undefined,
          mediaUrls: postData.mediaUrls,
          reactions: postData.reactions,
          viewedBy: postData.viewedBy,
          viewRoleBreakdown: postData.viewRoleBreakdown,
          tags: postData.tags,
          taggedFriends: postData.taggedFriends,
          taggedGroups: postData.taggedGroups,
          isOptimistic: postData.isOptimistic,
          reported: postData.reported || false,
          reportReason: postData.reportReason,
            isShare: postData.isShare || false,
            sharedFromPostId: postData.sharedFromPostId,
            sharedFromUserId: postData.sharedFromUserId,
            sharedFromUserName: postData.sharedFromUserName,
            originalPostId: postData.originalPostId,
            originalPostUserId: postData.originalPostUserId,
            originalPostUserName: postData.originalPostUserName,
            sharedAt: postData.sharedAt,
          shareCount: postData.shareCount || 0,
          sharedPostRefId: postData.sharedPostRefId
        };
        posts.push(postWithRequiredFields);
      }

      posts.sort((a, b) => { const dateA = a.createdAt?.toDate() || new Date(); const dateB = b.createdAt?.toDate() || new Date(); return dateB.getTime() - dateA.getTime(); });
      let finalPosts = posts;
      if (limitCount > 0 && posts.length > effectiveLimit) {
        finalPosts = posts.slice(0, effectiveLimit);
      }
      // Hydrate shared_posts snapshots for any shared posts so frontend can render without extra fetches
      try {
        const sharedIds = finalPosts.map(p => p.sharedPostRefId).filter(Boolean) as string[]
        if (sharedIds.length) {
          const snapMap = await hydrateSharedSnapshots(sharedIds)
          finalPosts.forEach((p) => {
            if (p.sharedPostRefId) {
              const snap = snapMap.get(p.sharedPostRefId)
              if (snap) {
                ;(p as any).sharedPostSnapshot = snap
              } else {
                ;(p as any).sharedPostSnapshot = null
              }
            }
          })
        }
      } catch (e) {
        console.warn('[getPostsRealtime] hydrateSharedSnapshots failed', e)
      }

      console.log('[postService:getPostsRealtime] returning', finalPosts.length, 'posts (raw:', posts.length, 'fetchLimit:', fetchLimit, 'effectiveLimit:', effectiveLimit, ')');
      onPostsUpdate(finalPosts);
    } catch (error: any) {
      console.error('Error processing posts update (optimized path):', error);
      if (onError) onError(error as Error);
    }
  }, (error: any) => {
    if (error.code === 'permission-denied') {
      console.error('Permission denied error:', error);
    } else if (error.code === 'unavailable') {
      console.error('Service unavailable error:', error);
    } else if (error.code === 'unknown') {
      console.error('Unknown error:', error);
    } else {
      console.error('Error in real-time posts listener:', error);
    }
    if (onError) {
      onError(error as Error);
    } else {
      console.error('Error in real-time posts listener:', error);
    }
  });
  
  // Return cleanup function
  return unsubscribe;
};

/**
 * Get real-time updates for replies of a specific comment
 * Replies are stored under posts/{postId}/comments/{commentId}/replies
 */
export const getRepliesRealtime = (
  postId: string,
  commentId: string,
  onRepliesUpdate: (replies: Comment[]) => void
): (() => void) => {
  if (!postId || !commentId) {
    onRepliesUpdate([])
    return () => {};
  }

  const repliesQuery = query(
    collection(db, POSTS_COLLECTION, postId, COMMENTS_COLLECTION, commentId, 'replies'),
    orderBy('createdAt', 'asc')
  );

  const unsubscribe = onSnapshot(repliesQuery, (snapshot) => {
    try {
      const replies: Comment[] = snapshot.docs.map((doc) => {
        const data = doc.data();
        const createdAt = data.createdAt instanceof Timestamp ? data.createdAt : Timestamp.fromDate(new Date());
        const updatedAt = data.updatedAt instanceof Timestamp ? data.updatedAt : Timestamp.fromDate(new Date());
        return {
          id: doc.id,
          ...data,
          createdAt,
          updatedAt,
        } as Comment;
      });
      onRepliesUpdate(replies);
    } catch (error) {
      console.error('Error processing replies update:', error);
    }
  }, (error) => {
    console.error('Error in replies listener:', error);
  });

  return unsubscribe;
};

/** Delete a reply (in replies subcollection) */
export const deleteReply = async (postId: string, commentId: string, replyId: string, userId: string, isAdmin: boolean = false): Promise<void> => {
  try {
    const replyRef = doc(db, POSTS_COLLECTION, postId, COMMENTS_COLLECTION, commentId, 'replies', replyId);
    const replyDoc = await getDoc(replyRef);
    if (!replyDoc.exists()) throw new Error('Reply not found');
    const replyData = replyDoc.data();
    if (replyData.userId !== userId && !isAdmin) throw new Error('Not authorized to delete this reply');
    await deleteDoc(replyRef);
    // Do not change post.commentCount because replies are not part of that count
  await activityLogger.logActivity('comment_deleted', `Reply deleted by user ${userId}${isAdmin ? ' (admin)' : ''}`, { postId, commentId, replyId, userId }, isAdmin ? 'high' : 'medium', replyId);
  } catch (error) {
    console.error('Error deleting reply:', error);
    throw error;
  }
};

/**
 * Get comments for a post with real-time updates
 * Returns a cleanup function to unsubscribe
 */
export const getCommentsRealtime = (
  postId: string,
  onCommentsUpdate: (comments: Comment[]) => void
): (() => void) => {
  if (!postId) {
    onCommentsUpdate([])
    return () => {};
  }

  const commentsQuery = query(
    collection(db, POSTS_COLLECTION, postId, COMMENTS_COLLECTION),
    orderBy('createdAt', 'asc')
  );
  
  const unsubscribe = onSnapshot(commentsQuery, (snapshot) => {
    try {
      const comments: Comment[] = snapshot.docs.map(doc => {
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
        } as Comment;
      });
      
      onCommentsUpdate(comments);
    } catch (error) {
      console.error('Error processing comments update:', error);
    }
  }, (error) => {
    console.error('Error in real-time comments listener:', error);
  });
  
  return unsubscribe;
};

/**
 * Get real-time updates for a post's reaction status
 * @param postId Post ID to get reactions for
 * @param userId Current user ID to check if they've reacted
 * @param onStatusUpdate Callback for reaction status updates
 * @returns Unsubscribe function
 */
export const getReactionStatusRealtime = (
  postId: string,
  userId: string,
  onStatusUpdate: (
    hasReacted: boolean | null, 
    count: number, 
    recentReactors?: { userId: string; userName: string; profilePic?: string }[]
  ) => void
): (() => void) => {
  if (!postId || !userId) {
    onStatusUpdate(null, 0, []);
    return () => {};
  }

  const postRef = doc(db, POSTS_COLLECTION, postId);
  const reactionsRef = collection(postRef, REACTIONS_COLLECTION);
  
  // First, check if the user has reacted
  let userReactionUnsubscribe = onSnapshot(
    doc(reactionsRef, userId),
    (doc) => {
      const hasReacted = doc.exists();
      onStatusUpdate(hasReacted, -1); // -1 means count is not updated yet
    },
    (error) => {
      console.error('Error checking reaction status:', error);
      onStatusUpdate(null, -1);
    }
  );
  
  // Then, get all reactions without ordering to avoid index issues
  // We'll sort them client-side instead
  let reactionsUnsubscribe = onSnapshot(
    reactionsRef,
    (snapshot) => {
      // Get total count from the snapshot
      const count = snapshot.size;
      
      // Get all reactors, then sort and limit client-side
      const allReactors: { userId: string; userName: string; profilePic?: string; timestamp: any }[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        if (data.userName) {
          allReactors.push({
            userId: doc.id,
            userName: data.userName || 'User',
            profilePic: data.userProfilePic,
            timestamp: data.timestamp
          });
        }
      });
      
      // Sort by timestamp (newest first) and limit to 5
      const recentReactors = allReactors
        .sort((a, b) => {
          const timeA = a.timestamp?.toDate?.() || new Date();
          const timeB = b.timestamp?.toDate?.() || new Date();
          return timeB.getTime() - timeA.getTime();
        })
        .slice(0, 5)
        .map(({ userId, userName, profilePic }) => ({ userId, userName, profilePic }));
      
      // Update with count and recent reactors
      onStatusUpdate(null, count, recentReactors);
    },
    (error) => {
      console.error('Error getting reactions:', error);
    }
  );
  
  // Return a function that unsubscribes from both listeners
  return () => {
    userReactionUnsubscribe();
    reactionsUnsubscribe();
  };
};

// Helper function to process download URLs with CORS support
const getStorageUrlWithCORS = async (fileRef: any): Promise<string> => {
  try {
    const downloadUrl = await getDownloadURL(fileRef);
    // Apply CORS modifications if on localhost
    return isLocalhost() ? createCORSStorageURL(downloadUrl) : downloadUrl;
  } catch (error) {
    console.error('Error getting download URL:', error);
    throw error;
  }
};

/**
 * Mark a post as viewed by a user
 * @param postId Post ID to mark as viewed
 * @param userId User ID who viewed the post
 * @returns Promise<number> Updated view count
 */
export const markPostAsViewed = async (postId: string, userId: string): Promise<number> => {
  try {
    if (!userId) return 0; // Don't track views for unauthenticated users
    
    const postRef = doc(db, POSTS_COLLECTION, postId);
    const postDoc = await getDoc(postRef);
    
    if (!postDoc.exists()) {
      throw new Error('Post not found');
    }
    
    const postData = postDoc.data();
    // Initialize viewedBy array if it doesn't exist
    const viewedBy = postData.viewedBy || [];
    
    // If user has already viewed this post, don't update anything
    if (viewedBy.includes(userId)) {
      return postData.viewCount || viewedBy.length;
    }
    
    // Add user to viewedBy array
    const updatedViewedBy = [...viewedBy, userId];

    // Resolve viewer role for breakdown tracking
    let viewerRoleKey = 'unknown';
    try {
      const viewerDoc = await getDoc(doc(db, USERS_COLLECTION, userId));
      if (viewerDoc.exists()) {
        const rawRole = viewerDoc.data().role;
        if (typeof rawRole === 'string' && rawRole.trim()) {
          viewerRoleKey = rawRole.trim().toLowerCase();
        } else {
          viewerRoleKey = 'student';
        }
      }
    } catch (roleError) {
      console.warn('[markPostAsViewed] Failed to resolve viewer role:', roleError);
    }

    const roleBreakdown = postData.viewRoleBreakdown || {};
    const updatedRoleBreakdown = {
      ...roleBreakdown,
      [viewerRoleKey]: (roleBreakdown[viewerRoleKey] || 0) + 1,
    };
    
    // Update post with new viewedBy array and viewCount
    await updateDoc(postRef, {
      viewedBy: updatedViewedBy,
      viewCount: updatedViewedBy.length,
      viewRoleBreakdown: updatedRoleBreakdown,
    });
    
    return updatedViewedBy.length;
  } catch (error) {
    console.error('Error marking post as viewed:', error);
    return 0;
  }
};

/**
 * Fix post view count to match viewedBy array length
 * Used by admin tools to fix inconsistent data
 */
export const fixPostViewCount = async (postId: string): Promise<number> => {
  try {
    const postRef = doc(db, POSTS_COLLECTION, postId);
    const postDoc = await getDoc(postRef);
    
    if (!postDoc.exists()) {
      throw new Error('Post not found');
    }
    
    const postData = postDoc.data();
    const viewedBy = postData.viewedBy || [];
    
    // Update post with corrected viewCount
    await updateDoc(postRef, {
      viewCount: viewedBy.length
    });
    
    return viewedBy.length;
  } catch (error) {
    console.error('Error fixing post view count:', error);
    return 0;
  }
};

/**
 * Get reported posts for admins
 */
export const getReportedPosts = async (): Promise<(Post & { reportCount: number })[]> => {
  try {
    const reportsQuery = query(
      collection(db, REPORTS_COLLECTION),
      where('status', '==', 'pending'),
      orderBy('createdAt', 'desc')
    );

    const reportsSnapshot = await getDocs(reportsQuery);
    // Map postId to array of reports
    const reportsByPost: Record<string, { userId: string; reason: string; createdAt: any }[]> = {};
    reportsSnapshot.docs.forEach(doc => {
      const data = doc.data();
      if (!reportsByPost[data.postId]) reportsByPost[data.postId] = [];
      reportsByPost[data.postId].push({ userId: data.userId, reason: data.reason, createdAt: data.createdAt });
    });

    const reportedPostIds = Object.keys(reportsByPost);
    if (reportedPostIds.length === 0) return [];

    // Firestore 'in' queries are limited to 10 items
    const chunkSize = 10;
    const postChunks = [];
    for (let i = 0; i < reportedPostIds.length; i += chunkSize) {
      postChunks.push(reportedPostIds.slice(i, i + chunkSize));
    }

    let posts: (Post & { reportCount: number })[] = [];
    for (const chunk of postChunks) {
      const postsQuery = query(
        collection(db, POSTS_COLLECTION),
        where('__name__', 'in', chunk)
      );
      const postsSnapshot = await getDocs(postsQuery);
      postsSnapshot.forEach((doc) => {
        const postData = doc.data();
        const postId = doc.id;
        const reports = reportsByPost[postId] || [];
        const uniqueUserIds = Array.from(new Set(reports.map(r => r.userId)));
        const reportCount = uniqueUserIds.length;
        // Use the most recent report reason for display
        const sortedReports = reports.slice().sort((a, b) => {
          const aTime = a.createdAt?.toDate?.() ? a.createdAt.toDate().getTime() : 0;
          const bTime = b.createdAt?.toDate?.() ? b.createdAt.toDate().getTime() : 0;
          return bTime - aTime;
        });
        const reportReason = sortedReports[0]?.reason;

        const createdAt = postData.createdAt instanceof Timestamp 
          ? postData.createdAt 
          : Timestamp.fromDate(new Date());
        const updatedAt = postData.updatedAt instanceof Timestamp 
          ? postData.updatedAt 
          : Timestamp.fromDate(new Date());
        const mediaItems = postData.media?.map((mediaItem: MediaItem) => ({
          ...mediaItem,
          url: isLocalhost() ? createCORSStorageURL(mediaItem.url) : mediaItem.url
        })) || [];
        posts.push({
          id: postId,
          userId: postData.userId || '',
          userName: postData.userName || '',
          userProfilePic: postData.userProfilePic || '',
          userRole: postData.userRole || '',
          content: postData.content || '',
          visibility: postData.visibility || 'public',
          createdAt,
          updatedAt,
          isPinned: false,
          isEdited: postData.isEdited || false,
          commentCount: postData.commentCount || 0,
          reactionCount: postData.reactionCount || 0,
          viewCount: postData.viewCount || 0,
          media: mediaItems,
          mediaUrls: postData.mediaUrls,
          reactions: postData.reactions,
          viewedBy: postData.viewedBy,
          tags: postData.tags,
          taggedFriends: postData.taggedFriends,
          taggedGroups: postData.taggedGroups,
          isOptimistic: postData.isOptimistic,
          reported: true,
          reportReason: reportReason as ReportReasonId | undefined,
          reportCount, // <-- Add this!
        });
      });
    }

    const uniquePosts = Object.values(
      posts.reduce((acc, post) => {
        acc[post.id] = post;
        return acc;
      }, {} as Record<string, typeof posts[0]>));
    return uniquePosts;
  } catch (error) {
    console.error('Error fetching reported posts:', error);
    throw error;
  }
};

/**
 * Mark a post as reported
 */
export const markPostAsReported = async (postId: string, reason: string): Promise<void> => {
  try {
    const postRef = doc(db, POSTS_COLLECTION, postId);
    await updateDoc(postRef, {
      reported: true,
      reportReason: reason
    });
  } catch (error) {
    console.error('Error marking post as reported:', error);
    throw error;
  }
};

/**
 * Mark a post as not reported (clear report)
 */
export const clearPostReport = async (postId: string): Promise<void> => {
  try {
    const postRef = doc(db, POSTS_COLLECTION, postId);
    await updateDoc(postRef, {
      reported: false,
      reportReason: null
    });
  } catch (error) {
    console.error('Error clearing post report:', error);
    throw error;
  }
};

/**
 * Compute school year label from a Date or Timestamp.
 * Rule: if month is April (3) or earlier -> belongs to ending SY (e.g., March 2027 -> S.Y. 2026-2027).
 * If month is May (4) or later -> belongs to starting SY (e.g., July 2026 -> S.Y. 2026-2027).
 * First valid SY is S.Y. 2025-2026; results before that will be clamped to 2025-2026.
 */
export const computeSchoolYearFromDate = (d: Date | any): string => {
  const date = d && typeof d.toDate === 'function' ? d.toDate() : (d instanceof Date ? d : new Date());
  const month = date.getMonth(); // 0-based: Jan=0
  const year = date.getFullYear();
  let startYear: number;
  let endYear: number;
  // If month is April (3) or earlier, it's the ending SY
  if (month <= 3) {
    endYear = year;
    startYear = endYear - 1;
  } else {
    startYear = year;
    endYear = startYear + 1;
  }
  if (startYear < 2025) {
    startYear = 2025;
    endYear = 2026;
  }
  return `S.Y. ${startYear}-${endYear}`;
};

/**
 * Archive all posts that do not have `annual_archive_date` set.
 * Only super admins may run this; function verifies role.
 * This will set `annual_archive_date` on the original post documents (no separate archived_posts collection).
 */
export const archiveAllPosts = async (
  requestingUserId: string,
  options: { inclusive?: boolean } = { inclusive: false }
): Promise<{ processed: number; archivedCount: number; errors: any[] }> => {
  try {
    if (!requestingUserId) throw new Error('Requesting user id required');
    const userDoc = await getDoc(doc(db, USERS_COLLECTION, requestingUserId));
    if (!userDoc.exists()) throw new Error('Requesting user not found');
    const userRole = (userDoc.data() as any).role || '';
    if (userRole !== 'super admin') throw new Error('Only super admin can perform annual archive');

    let snapshotDocs: any[] = [];
    if (!options.inclusive) {
      // Query posts without annual_archive_date (== null matches missing field as well)
      const candidatesQuery = query(collection(db, POSTS_COLLECTION), where('annual_archive_date', '==', null));
      const snapshot = await getDocs(candidatesQuery);
      snapshotDocs = snapshot.docs;
    } else {
      // Inclusive mode: fetch all posts and filter client-side for posts that are not archived
      const allSnap = await getDocs(collection(db, POSTS_COLLECTION));
      snapshotDocs = allSnap.docs.filter(d => {
        const data: any = d.data() || {};
        // Consider as needing archive if `archived` is not true OR annual_archive_date is missing/invalid
        const hasArchivedFlag = data.archived === true;
        const hasValidTimestamp = data.annual_archive_date && data.annual_archive_date instanceof Timestamp;
        return !(hasArchivedFlag || hasValidTimestamp);
      });
    }
    const now = new Date();
    const archiveTs = Timestamp.fromDate(now);
    const schoolYear = computeSchoolYearFromDate(now);

    if (!snapshotDocs.length) return { processed: 0, archivedCount: 0, errors: [] };

    const errors: any[] = [];
    let processed = 0;
    let archivedCount = 0;

    // Batch writes limited to 500 operations; use conservative chunk size
    const chunkSize = 300;
    const docs = snapshotDocs;
    for (let i = 0; i < docs.length; i += chunkSize) {
      const chunk = docs.slice(i, i + chunkSize);
      const batch = writeBatch(db);
      chunk.forEach((docSnap: any) => {
        processed += 1;
        const postId = docSnap.id;
        // Update original post with archive timestamp only (no separate archived_posts collection)
        const postRef = doc(db, POSTS_COLLECTION, postId);
        batch.update(postRef, {
          annual_archive_date: archiveTs
        });
        archivedCount += 1;
      });
      try {
        await batch.commit();
      } catch (err) {
        console.error('[archiveAllPosts] batch commit failed', err);
        errors.push({ index: i, error: err });
      }
    }

    // Log activity
    try {
      await activityLogger.logActivity(
        'annual_archive',
        `Annual archive performed by ${requestingUserId} - ${archivedCount} posts`,
        { requestingUserId, archivedCount, schoolYear },
        'high'
      );
    } catch (e) {
      console.warn('[archiveAllPosts] activity log failed', e);
    }

    return { processed, archivedCount, errors };
  } catch (error) {
    console.error('Error archiving posts:', error);
    throw error;
  }
};

/**
 * Diagnostic helper: return sample posts that appear "unarchived" by the current selector.
 * Useful to run locally to see why some posts are not being picked up by `archiveAllPosts`.
 */
export const listUnarchivedPostsSample = async (limitSample: number = 20): Promise<{ total: number; sampleIds: string[] }> => {
  try {
    // The same selector used by archiveAllPosts: where annual_archive_date == null
    const q = query(collection(db, POSTS_COLLECTION), where('annual_archive_date', '==', null));
    const snap = await getDocs(q);
    const total = snap.size;
    const sampleIds = snap.docs.slice(0, limitSample).map(d => d.id);
    return { total, sampleIds };
  } catch (error) {
    console.error('[listUnarchivedPostsSample] error', error);
    throw error;
  }
};

/**
 * Get archived posts, optionally filtered by school year.
 */
export const getArchivedPosts = async (archiveSchoolYear?: string): Promise<Post[]> => {
  try {
    // Query posts in-place that have an annual_archive_date set.
    // Using a comparison against epoch ensures we only get documents with a timestamp value.
    const epoch = Timestamp.fromDate(new Date(0));
    let q: any = query(collection(db, POSTS_COLLECTION), where('annual_archive_date', '>', epoch), orderBy('annual_archive_date', 'desc'));
    const snap = await getDocs(q);
    const out: Post[] = [];
    snap.docs.forEach(d => {
      const data: any = d.data();
      const createdAt = data.createdAt instanceof Timestamp ? data.createdAt : Timestamp.fromDate(new Date());
      const updatedAt = data.updatedAt instanceof Timestamp ? data.updatedAt : Timestamp.fromDate(new Date());
      // If caller requested a specific school year, compute it from the timestamp and skip mismatches
      if (archiveSchoolYear) {
        try {
          const sy = computeSchoolYearFromDate(data.annual_archive_date);
          if (sy !== archiveSchoolYear) return;
        } catch (e) {
          return;
        }
      }
      out.push({
        id: d.id,
        userId: data.userId || '',
        userName: data.userName || '',
        userProfilePic: data.userProfilePic || '',
        userRole: data.userRole || '',
        content: data.content || '',
        visibility: data.visibility || 'public',
        createdAt,
        updatedAt,
        isPinned: false,
        isEdited: data.isEdited || false,
        commentCount: data.commentCount || 0,
        reactionCount: data.reactionCount || 0,
        viewCount: data.viewCount || 0,
        media: data.media || [],
        tags: data.tags,
        taggedFriends: data.taggedFriends,
        taggedGroups: data.taggedGroups,
        reported: data.reported || false,
        reportReason: data.reportReason,
        isShare: data.isShare || false,
        sharedFromPostId: data.sharedFromPostId,
        sharedFromUserId: data.sharedFromUserId,
        sharedFromUserName: data.sharedFromUserName,
        originalPostId: data.originalPostId,
        originalPostUserId: data.originalPostUserId,
        originalPostUserName: data.originalPostUserName,
        sharedPostRefId: data.sharedPostRefId,
        annual_archive_date: data.annual_archive_date,
        archive_school_year: computeSchoolYearFromDate(data.annual_archive_date),
        archived: !!data.annual_archive_date
      } as Post);
    });
    return out;
  } catch (error) {
    console.error('Error fetching archived posts:', error);
    throw error;
  }
};

/**
 * Return list of distinct archive school years available.
 */
export const getArchivedSchoolYears = async (): Promise<string[]> => {
  try {
    // Read posts in-place with an archive timestamp and derive school years client-side
    const epoch = Timestamp.fromDate(new Date(0));
    const snap = await getDocs(query(collection(db, POSTS_COLLECTION), where('annual_archive_date', '>', epoch)));
    const years = new Set<string>();
    snap.docs.forEach(d => {
      const data: any = d.data();
      try {
        if (data && data.annual_archive_date) years.add(computeSchoolYearFromDate(data.annual_archive_date));
      } catch (e) {
        // ignore malformed timestamps
      }
    });
    return Array.from(years).sort((a, b) => b.localeCompare(a));
  } catch (error) {
    console.error('Error fetching archived school years:', error);
    return [];
  }
};

// --- Revoked & Unknown User Cleanup ---------------------------------------------------------

export interface UnknownPostCleanupOptions {
  dryRun?: boolean;
  includeRevokedUsers?: boolean;
  includeUnknownRole?: boolean;
}

export interface UnknownPostCleanupResult {
  processedPosts: number;
  candidateCount: number;
  deletedCount: number;
  deletedPostIds: string[];
  candidates: Array<{ postId: string; userId?: string; reason: string }>;
  failures: Array<{ postId: string; userId?: string; reason: string; error: string }>;
}

/**
 * Remove posts whose authors are missing, revoked, or marked as unknown.
 * Designed for admin use during periodic cleanups.
 */
export const cleanupPostsForUnknownUsers = async (
  requestingUserId: string,
  options: UnknownPostCleanupOptions = {}
): Promise<UnknownPostCleanupResult> => {
  // Safety guard: require explicit build-time opt-in to allow destructive bulk cleanups
  const destructiveAllowed = String(process.env.REACT_APP_ALLOW_DESTRUCTIVE_CLEANUP || '').toLowerCase() === 'true';
  if (!destructiveAllowed) {
    throw new Error('Bulk cleanup of posts for unknown/revoked users is disabled in this build. Set REACT_APP_ALLOW_DESTRUCTIVE_CLEANUP=true to enable.');
  }
  const { dryRun = false, includeRevokedUsers = true, includeUnknownRole = true } = options;

  if (!requestingUserId) {
    throw new Error('Requesting user ID is required for cleanup operations.');
  }

  const requesterSnap = await getDoc(doc(db, USERS_COLLECTION, requestingUserId));
  if (!requesterSnap.exists()) {
    throw new Error('Requesting user not found.');
  }

  const requesterRole = String(requesterSnap.data().role || '').toLowerCase();
  const isAdminRole = requesterRole === 'admin' || requesterRole === 'super admin';
  if (!isAdminRole) {
    throw new Error('Only administrators can execute the revoked user post cleanup.');
  }

  const postsSnapshot = await getDocs(collection(db, POSTS_COLLECTION));
  const userCache = new Map<string, { exists: boolean; revoked: boolean; role?: string | null }>();

  const candidates: UnknownPostCleanupResult['candidates'] = [];
  const failures: UnknownPostCleanupResult['failures'] = [];
  const deletedPostIds: string[] = [];

  let processedPosts = 0;

  for (const docSnap of postsSnapshot.docs) {
    processedPosts += 1;
    const postData = docSnap.data() as any;
    const postId = docSnap.id;
    const authorId = typeof postData.userId === 'string' ? postData.userId : '';
    const storedPostRole = typeof postData.userRole === 'string' ? postData.userRole : '';

    let removalReason: string | null = null;

    if (!authorId) {
      removalReason = 'missing-user-id';
    } else {
      let cached = userCache.get(authorId);
      if (!cached) {
        const userSnap = await getDoc(doc(db, USERS_COLLECTION, authorId));
        cached = {
          exists: userSnap.exists(),
          revoked: userSnap.exists() ? userSnap.data().revoked === true : false,
          role: userSnap.exists() ? userSnap.data().role : undefined
        };
        userCache.set(authorId, cached);
      }

      if (!cached.exists) {
        removalReason = 'user-not-found';
      } else if (includeRevokedUsers && cached.revoked) {
        removalReason = 'user-revoked';
      } else if (includeUnknownRole) {
        const resolvedRole = String(cached.role ?? storedPostRole ?? '').toLowerCase();
        if (!resolvedRole || resolvedRole === 'unknown' || resolvedRole === 'revoked') {
          removalReason = 'unknown-role';
        }
      }
    }

    if (!removalReason) {
      continue;
    }

    candidates.push({ postId, userId: authorId || undefined, reason: removalReason });

    if (dryRun) {
      continue;
    }

    try {
      await totalFirebasePostDeletion(postId, requestingUserId, true);
      deletedPostIds.push(postId);
      postDeletionEvents.notifyDeletion(postId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push({ postId, userId: authorId || undefined, reason: removalReason, error: message });
    }
  }

  if (!dryRun && deletedPostIds.length > 0) {
    try {
      await activityLogger.logActivity(
        'post_deleted',
        `Cleanup removed ${deletedPostIds.length} post(s) owned by revoked or missing users`,
        {
          deletedPostIds,
          candidateCount: candidates.length,
          failures: failures.length
        },
        'high',
        deletedPostIds[0],
        'post'
      );
    } catch (logError) {
      console.warn('[cleanupPostsForUnknownUsers] Failed to log activity:', logError);
    }
  }

  return {
    processedPosts,
    candidateCount: candidates.length,
    deletedCount: dryRun ? 0 : deletedPostIds.length,
    deletedPostIds,
    candidates,
    failures
  };
};

// Create a global event system for tracking post deletions in real-time
 
// without having to wait for a refetch from the database
export const postDeletionEvents = {
  listeners: new Map<string, Set<(postId: string) => void>>(),
  
  // Register a listener for post deletion events
  subscribe: function(componentId: string, callback: (postId: string) => void): (() => void) {
    if (!this.listeners.has(componentId)) {
      this.listeners.set(componentId, new Set());
    }
    const listeners = this.listeners.get(componentId);
    if (listeners) {
      listeners.add(callback);
    }
    
    // Return unsubscribe function
    return () => {
      const componentListeners = this.listeners.get(componentId);
      if (componentListeners) {
        componentListeners.delete(callback);
        if (componentListeners.size === 0) {
          this.listeners.delete(componentId);
        }
      }
    };
  },
  
  
  notifyDeletion: function(postId: string): void {
    console.log(`[postDeletionEvents] Broadcasting post deletion event for post: ${postId}`);
    this.listeners.forEach((callbacks: Set<(postId: string) => void>, componentId: string) => {
      console.log(`[postDeletionEvents] Notifying component: ${componentId}`);
      callbacks.forEach((callback: (postId: string) => void) => {
        try {
          callback(postId);
        } catch (error) {
          console.error(`[postDeletionEvents] Error in deletion listener for component ${componentId}:`, error);
        }
      });
    });
  }
};
