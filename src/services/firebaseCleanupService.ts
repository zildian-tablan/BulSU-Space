import { db, storage } from '../firebase/config';
import { 
  collection, 
  doc, 
  deleteDoc, 
  getDoc, 
  getDocs, 
  query, 
  where,
  writeBatch,
  runTransaction
} from 'firebase/firestore';
import { 
  ref, 
  deleteObject,
  listAll
} from 'firebase/storage';

/**
 * Firebase Database Cleanup Service
 * Ensures complete deletion of posts and related data from Firebase
 */

/**
 * Comprehensive post deletion that ensures total removal from Firebase database
 * @param postId Post ID to delete completely
 * @param adminUserId ID of the admin performing the deletion
 * @returns Promise<void>
 */
export const totalFirebasePostDeletion = async (postId: string, userId: string, isAdmin: boolean = false): Promise<void> => {
  console.log('[FIREBASE CLEANUP] Starting total post deletion from Firebase:', postId, 'by user:', userId, 'isAdmin (caller flag):', isAdmin);
  
  try {
    // First, verify the post exists and check permissions
    const postRef = doc(db, 'posts', postId);
    const postDoc = await getDoc(postRef);
    
    if (!postDoc.exists()) {
      console.log('[FIREBASE CLEANUP] Post not found, may already be deleted:', postId);
      return;
    }
    
    const postData = postDoc.data();
    console.log('[FIREBASE CLEANUP] Found post data:', { 
      postId, 
      postAuthorId: postData.userId,
      requestingUserId: userId,
      hasMedia: postData.media?.length > 0 
    });
    
    // Check if user has permission to delete this post (post author or admin)
    const isPostAuthor = postData.userId === userId;

    // Determine effective admin permission. If the caller already verified admin status (isAdmin === true),
    // respect that to avoid redundant lookups. Otherwise, look up the user's role from Firestore.
    let effectiveIsAdmin = isAdmin;
    let userRole = '';
    if (!effectiveIsAdmin) {
      try {
        const userDoc = await getDoc(doc(db, 'users', userId));
        if (userDoc.exists()) {
          userRole = userDoc.data().role || '';
          effectiveIsAdmin = userRole === 'admin' || userRole === 'super admin';
        }
      } catch (roleErr) {
        console.warn('[FIREBASE CLEANUP] Failed to verify user role, falling back to caller isAdmin flag:', roleErr);
      }
    }

    console.log('[FIREBASE CLEANUP] Permission check:', {
      isPostAuthor,
      userRole,
      effectiveIsAdmin,
      canDelete: isPostAuthor || effectiveIsAdmin
    });

    if (!isPostAuthor && !effectiveIsAdmin) {
      throw new Error('You do not have permission to delete this post. Only the post author or administrators can delete posts.');
    }

    // Safety guard: Prevent administrators from running destructive deletions (bulk/admin cleanup)
    // unless the build-time flag `REACT_APP_ALLOW_DESTRUCTIVE_CLEANUP` is explicitly set to "true".
    // This avoids accidental mass-deletion from admin tools or scripts in development builds.
    const destructiveAllowed = String(process.env.REACT_APP_ALLOW_DESTRUCTIVE_CLEANUP || '').toLowerCase() === 'true';
    if (effectiveIsAdmin && !isPostAuthor && !destructiveAllowed) {
      console.warn('[FIREBASE CLEANUP] Destructive admin deletions are disabled in this build. Set REACT_APP_ALLOW_DESTRUCTIVE_CLEANUP=true to enable.');
      throw new Error('Destructive admin deletions are disabled in this build. Contact the system administrator to enable this operation.');
    }
    
    // 3. Delete subcollections and related data (outside transaction due to Firebase limitations)
    // Perform full subcollection / cross-user cleanup if caller is an admin OR the post author.
    if (effectiveIsAdmin || isPostAuthor) {
      await deletePostSubcollections(postId);
    } else {
      console.log('[FIREBASE CLEANUP] Skipping deletion of cross-user subcollections because caller lacks elevated privileges.');
    }

    // 4. Delete media files from Firebase Storage (media is scoped to the post and safe to remove)
    await deletePostMediaFiles(postId);

    // 5. Clean up hidden post references across all users - allow if caller is admin OR post author.
    if (effectiveIsAdmin || isPostAuthor) {
      await cleanupAllHiddenPostReferences(postId);
    } else {
      // Remove hidden_post reference only for the requesting user (safe operation)
      try {
        const hiddenRef = doc(db, 'users', userId, 'hidden_posts', postId);
        const hiddenSnap = await getDoc(hiddenRef);
        if (hiddenSnap.exists()) {
          await deleteDoc(hiddenRef);
          console.log('[FIREBASE CLEANUP] Removed hidden post reference for requesting user only:', userId);
        }
      } catch (err) {
        console.warn('[FIREBASE CLEANUP] Failed to remove hidden post reference for requesting user:', err);
      }
    }

    // 6. Clean up any notifications related to this post - allow if caller is admin OR post author
    if (effectiveIsAdmin || isPostAuthor) {
      await cleanupPostNotifications(postId);
    } else {
      console.log('[FIREBASE CLEANUP] Skipping notification cleanup because caller lacks elevated privileges.');
    }

    // 7. Now delete the main post document (transaction ensures double-check and atomicity for the main doc delete)
    await runTransaction(db, async (transaction) => {
      // Verify the post still exists (it should)
      const postDocInTransaction = await transaction.get(postRef);
      if (!postDocInTransaction.exists()) {
        console.log('[FIREBASE CLEANUP] Post not found in transaction (already deleted earlier?):', postId);
        return;
      }

      transaction.delete(postRef);
      console.log('[FIREBASE CLEANUP] Main post document marked for deletion (final step)');
    });
    
    // 7. Final verification that everything is deleted (best-effort)
    const verified = await verifyCompletePostDeletion(postId);
    if (!verified) {
      console.warn('[FIREBASE CLEANUP] Post deletion verification reported remaining data, but continuing (caller may be missing cross-user permissions)');
    }

    console.log('[FIREBASE CLEANUP] Total Firebase post deletion completed (best-effort):', postId);
    
  } catch (error) {
    console.error('[FIREBASE CLEANUP] Error during total post deletion:', error);
    throw new Error(`Failed to completely delete post from Firebase: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

/**
 * Delete all subcollections of a post (comments, reactions, likes)
 */
async function deletePostSubcollections(postId: string): Promise<void> {
  console.log('[FIREBASE CLEANUP] Deleting post subcollections...');
  // We'll perform individual deletes with per-doc try/catch so a single permission error
  // doesn't abort the entire operation. This makes client-side cleanup resilient.
  try {
    // Comments
    const commentsRef = collection(db, 'posts', postId, 'comments');
    const commentsSnapshot = await getDocs(commentsRef);
    for (const commentDoc of commentsSnapshot.docs) {
      try {
        await deleteDoc(commentDoc.ref);
        console.log('[FIREBASE CLEANUP] Deleted comment:', commentDoc.id);
      } catch (err) {
        console.warn('[FIREBASE CLEANUP] Failed to delete comment (will continue):', commentDoc.id, err);
      }
    }

    // Reactions
    const reactionsRef = collection(db, 'posts', postId, 'reactions');
    const reactionsSnapshot = await getDocs(reactionsRef);
    for (const reactionDoc of reactionsSnapshot.docs) {
      try {
        await deleteDoc(reactionDoc.ref);
        console.log('[FIREBASE CLEANUP] Deleted reaction:', reactionDoc.id);
      } catch (err) {
        console.warn('[FIREBASE CLEANUP] Failed to delete reaction (will continue):', reactionDoc.id, err);
      }
    }

    // Likes
    const likesRef = collection(db, 'posts', postId, 'likes');
    const likesSnapshot = await getDocs(likesRef);
    for (const likeDoc of likesSnapshot.docs) {
      try {
        await deleteDoc(likeDoc.ref);
        console.log('[FIREBASE CLEANUP] Deleted like:', likeDoc.id);
      } catch (err) {
        console.warn('[FIREBASE CLEANUP] Failed to delete like (will continue):', likeDoc.id, err);
      }
    }

    console.log('[FIREBASE CLEANUP] Finished attempting subcollection deletions (some may have failed)');
  } catch (error) {
    console.error('[FIREBASE CLEANUP] Error enumerating subcollections:', error);
    // Do not rethrow - caller should continue with other cleanup steps
  }
}

/**
 * Delete all media files associated with a post from Firebase Storage
 */
async function deletePostMediaFiles(postId: string): Promise<void> {
  console.log('[FIREBASE CLEANUP] Cleaning up media files for post:', postId);
  
  try {
    // Read the post document to look for explicit media entries
    try {
      const postRef = doc(db, 'posts', postId);
      const postDoc = await getDoc(postRef);
      if (postDoc.exists()) {
        const postData = postDoc.data();
        const mediaItems = postData.media || postData.mediaItems || [];

        // Prefer an explicit storagePath property when available (saved at upload time).
        // Fallback to parsing download URLs only if storagePath is not present.
        const parsedPaths: string[] = [];
        for (const mi of mediaItems) {
          try {
            // If media item is an object with storagePath, use it directly
            if (mi && typeof mi === 'object' && mi.storagePath && typeof mi.storagePath === 'string') {
              parsedPaths.push(mi.storagePath);
              continue;
            }

            const url = mi.url || mi;
            if (!url || typeof url !== 'string') continue;

            // Attempt to extract the storage path from a standard Firebase download URL
            const match = url.match(/\/o\/(.+)\?/);
            if (match && match[1]) {
              const decoded = decodeURIComponent(match[1]);
              parsedPaths.push(decoded);
              continue;
            }

            // If not a storage.googleapis URL, try to parse the path after /posts/ in the url
            const altMatch = url.split('/posts/').pop();
            if (altMatch) {
              parsedPaths.push(`posts/${decodeURIComponent(altMatch.split('?')[0])}`);
              continue;
            }
          } catch (parseErr) {
            console.warn('[FIREBASE CLEANUP] Failed to parse media URL for deletion, skipping:', mi, parseErr);
          }
        }

        if (parsedPaths.length > 0) {
          // Avoid deleting documents and text files by mistake. Only allow common
          // media extensions (images, video, audio) for automatic deletion.
          const allowedExt = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.mp4', '.mov', '.m4v', '.webm', '.ogg', '.mp3', '.wav', '.flac', '.aac'];
          const normalizedPaths = parsedPaths.map(p => ({ p, lower: p.toLowerCase() }));

          const toDelete = normalizedPaths.filter(({ lower }) => {
            return allowedExt.some(ext => lower.endsWith(ext));
          }).map(({ p }) => p);

          const skipped = normalizedPaths.filter(({ lower }) => !allowedExt.some(ext => lower.endsWith(ext))).map(({ p }) => p);

          if (skipped.length > 0) {
            console.log('[FIREBASE CLEANUP] Skipping deletion for non-media files (protected extensions):', skipped);
          }

          if (toDelete.length === 0) {
            console.log('[FIREBASE CLEANUP] No allowed media files found to delete for this post (skipping)');
            return;
          }

          console.log('[FIREBASE CLEANUP] Deleting specific media files parsed from post.media/storagePath:', toDelete);
          const deletePromises = toDelete.map(async (storagePath) => {
            try {
              const objRef = ref(storage, storagePath);
              await deleteObject(objRef);
              console.log('[FIREBASE CLEANUP] Deleted media file at path:', storagePath);
            } catch (err) {
              console.warn('[FIREBASE CLEANUP] Failed to delete media file at path (will continue):', storagePath, err);
            }
          });
          await Promise.all(deletePromises);
          return;
        }
      }
    } catch (readPostErr) {
      console.warn('[FIREBASE CLEANUP] Failed to read post document for media parsing:', readPostErr);
    }
    // IMPORTANT SAFETY: we no longer perform any broad folder-based deletion.
    // Only media objects explicitly referenced by post.media/storagePath are deleted.
    console.log('[FIREBASE CLEANUP] No explicit media paths found on post; skipping storage deletion for safety');
  } catch (error) {
    console.error('[FIREBASE CLEANUP] Error during media cleanup:', error);
    // Don't throw here - media cleanup failure shouldn't block post deletion
  }
}

/**
 * Clean up all hidden post references across all users
 */
async function cleanupAllHiddenPostReferences(postId: string): Promise<void> {
  console.log('[FIREBASE CLEANUP] Cleaning up all hidden post references...');
  
  try {
    // Get all users
    const usersSnapshot = await getDocs(collection(db, 'users'));
    
    const cleanupPromises = usersSnapshot.docs.map(async (userDoc) => {
      try {
        const hiddenPostRef = doc(db, 'users', userDoc.id, 'hidden_posts', postId);
        const hiddenPostDoc = await getDoc(hiddenPostRef);
        
        if (hiddenPostDoc.exists()) {
          await deleteDoc(hiddenPostRef);
          console.log(`[FIREBASE CLEANUP] Removed hidden post reference for user: ${userDoc.id}`);
          return true;
        }
        return false;
      } catch (cleanupError) {
        console.warn(`[FIREBASE CLEANUP] Failed to cleanup hidden post for user ${userDoc.id}:`, cleanupError);
        return false;
      }
    });
    
    const results = await Promise.all(cleanupPromises);
    const cleanedCount = results.filter(result => result === true).length;
    
    console.log(`[FIREBASE CLEANUP] Hidden post references cleanup completed: ${cleanedCount} references removed`);
    
  } catch (error) {
    console.error('[FIREBASE CLEANUP] Error during hidden posts cleanup:', error);
    // Don't throw - this shouldn't block the deletion
  }
}

/**
 * Clean up notifications related to the deleted post
 */
async function cleanupPostNotifications(postId: string): Promise<void> {
  console.log('[FIREBASE CLEANUP] Cleaning up post-related notifications...');
  
  try {
    // Query for notifications related to this post
    const notificationsQuery = query(
      collection(db, 'notifications'),
      where('postId', '==', postId)
    );
    
    const notificationsSnapshot = await getDocs(notificationsQuery);
    
    if (notificationsSnapshot.docs.length > 0) {
      const batch = writeBatch(db);
      
      notificationsSnapshot.docs.forEach((notificationDoc) => {
        batch.delete(notificationDoc.ref);
      });
      
      await batch.commit();
      console.log(`[FIREBASE CLEANUP] Deleted ${notificationsSnapshot.docs.length} post-related notifications`);
    } else {
      console.log('[FIREBASE CLEANUP] No post-related notifications found');
    }
    
  } catch (error) {
    console.error('[FIREBASE CLEANUP] Error cleaning up notifications:', error);
    // Don't throw - this shouldn't block the deletion
  }
}

/**
 * Verify that the post and all related data has been completely deleted
 */
async function verifyCompletePostDeletion(postId: string): Promise<boolean> {
  console.log('[FIREBASE CLEANUP] Performing final verification...');
  
  const verificationResults = {
    postExists: false,
    commentsExist: false,
    reactionsExist: false,
    likesExist: false,
    hiddenReferencesExist: false,
    notificationsExist: false,
    mediaFilesExist: false
  };
  
  try {
    // Check if main post document exists
    const postRef = doc(db, 'posts', postId);
    const postDoc = await getDoc(postRef);
    verificationResults.postExists = postDoc.exists();
    
    // Check if any subcollections still exist
    const commentsSnapshot = await getDocs(collection(db, 'posts', postId, 'comments'));
    verificationResults.commentsExist = !commentsSnapshot.empty;
    
    const reactionsSnapshot = await getDocs(collection(db, 'posts', postId, 'reactions'));
    verificationResults.reactionsExist = !reactionsSnapshot.empty;
    
    const likesSnapshot = await getDocs(collection(db, 'posts', postId, 'likes'));
    verificationResults.likesExist = !likesSnapshot.empty;
    
    // Check for remaining hidden post references
    const usersSnapshot = await getDocs(collection(db, 'users'));
    for (const userDoc of usersSnapshot.docs) {
      const hiddenPostRef = doc(db, 'users', userDoc.id, 'hidden_posts', postId);
      const hiddenPostDoc = await getDoc(hiddenPostRef);
      if (hiddenPostDoc.exists()) {
        verificationResults.hiddenReferencesExist = true;
        break;
      }
    }
    
    // Check for remaining notifications
    const notificationsQuery = query(
      collection(db, 'notifications'),
      where('postId', '==', postId)
    );
    const notificationsSnapshot = await getDocs(notificationsQuery);
    verificationResults.notificationsExist = !notificationsSnapshot.empty;
    
    // Check for remaining media files
    try {
      const postMediaRef = ref(storage, `posts/${postId}`);
      const listResult = await listAll(postMediaRef);
      verificationResults.mediaFilesExist = listResult.items.length > 0;
    } catch (listError) {
      // If listing fails, assume no files exist
      verificationResults.mediaFilesExist = false;
    }
    
    // Log verification results
    console.log('[FIREBASE CLEANUP] Verification results:', verificationResults);
    
    // Check if deletion was complete
    const hasRemainingData = Object.values(verificationResults).some(exists => exists === true);

    if (hasRemainingData) {
      console.warn('[FIREBASE CLEANUP] WARNING: Some data still exists after deletion attempt:', verificationResults);
      return false;
    } else {
      console.log('[FIREBASE CLEANUP] ✅ Verification successful - post completely deleted from Firebase');
      return true;
    }
    
  } catch (error) {
    console.error('[FIREBASE CLEANUP] Error during verification:', error);
    // Return false so caller knows verification failed but do not throw a permissions error up
    return false;
  }
}

/**
 * Emergency cleanup function to find and remove all orphaned data
 */
export const emergencyFirebaseCleanup = async (): Promise<void> => {
  console.log('[FIREBASE CLEANUP] Starting emergency cleanup of orphaned data...');
  
  try {
    const destructiveAllowed = String(process.env.REACT_APP_ALLOW_DESTRUCTIVE_CLEANUP || '').toLowerCase() === 'true';
    if (!destructiveAllowed) {
      console.warn('[FIREBASE CLEANUP] Emergency cleanup is disabled in this build (REACT_APP_ALLOW_DESTRUCTIVE_CLEANUP not set)');
      throw new Error('Emergency cleanup is disabled in this build. Enable with REACT_APP_ALLOW_DESTRUCTIVE_CLEANUP=true');
    }
    // Find all hidden post references that point to non-existent posts
    await cleanupOrphanedHiddenPosts();
    
    // Find all notifications that reference non-existent posts
    await cleanupOrphanedNotifications();
    
    console.log('[FIREBASE CLEANUP] Emergency cleanup completed');
    
  } catch (error) {
    console.error('[FIREBASE CLEANUP] Error during emergency cleanup:', error);
    throw error;
  }
};

/**
 * Clean up hidden post references that point to non-existent posts
 */
async function cleanupOrphanedHiddenPosts(): Promise<void> {
  console.log('[FIREBASE CLEANUP] Cleaning up orphaned hidden post references...');
  
  const usersSnapshot = await getDocs(collection(db, 'users'));
  
  for (const userDoc of usersSnapshot.docs) {
    const hiddenPostsSnapshot = await getDocs(collection(db, 'users', userDoc.id, 'hidden_posts'));
    
    for (const hiddenPostDoc of hiddenPostsSnapshot.docs) {
      const postId = hiddenPostDoc.id;
      
      // Check if the referenced post still exists
      const postRef = doc(db, 'posts', postId);
      const postDoc = await getDoc(postRef);
      
      if (!postDoc.exists()) {
        // Post doesn't exist, remove the hidden reference
        await deleteDoc(hiddenPostDoc.ref);
        console.log(`[FIREBASE CLEANUP] Removed orphaned hidden post reference: ${postId} for user: ${userDoc.id}`);
      }
    }
  }
}

/**
 * Clean up notifications that reference non-existent posts
 */
async function cleanupOrphanedNotifications(): Promise<void> {
  console.log('[FIREBASE CLEANUP] Cleaning up orphaned notifications...');
  
  const notificationsSnapshot = await getDocs(collection(db, 'notifications'));
  
  for (const notificationDoc of notificationsSnapshot.docs) {
    const notificationData = notificationDoc.data();
    
    if (notificationData.postId) {
      // Check if the referenced post still exists
      const postRef = doc(db, 'posts', notificationData.postId);
      const postDoc = await getDoc(postRef);
      
      if (!postDoc.exists()) {
        // Post doesn't exist, remove the notification
        await deleteDoc(notificationDoc.ref);        console.log(`[FIREBASE CLEANUP] Removed orphaned notification: ${notificationDoc.id} for post: ${notificationData.postId}`);
      }
    }
  }
}

/**
 * Comprehensive deletion for space posts (separate collection and storage path)
 * Mirrors `totalFirebasePostDeletion` but targets `spacePosts` collection
 * and prefers explicit `storagePath` values when deleting media.
 */
export const totalFirebaseSpacePostDeletion = async (postId: string, userId: string, isAdmin: boolean = false): Promise<void> => {
  console.log('[FIREBASE CLEANUP] Starting total space-post deletion from Firebase:', postId, 'by user:', userId, 'isAdmin:', isAdmin);

  try {
    const spacePostRef = doc(db, 'spacePosts', postId);
    const postDoc = await getDoc(spacePostRef);

    if (!postDoc.exists()) {
      console.log('[FIREBASE CLEANUP] Space post not found, may already be deleted:', postId);
      return;
    }

    const postData = postDoc.data();
    const isPostAuthor = postData.userId === userId;

    // Check if user is admin or super admin
    const userDoc = await getDoc(doc(db, 'users', userId));
    const userRole = userDoc.exists() ? userDoc.data().role : '';
    const userIsAdmin = userRole === 'admin' || userRole === 'super admin';

    console.log('[FIREBASE CLEANUP] Permission check (space post):', {
      isPostAuthor,
      userRole,
      userIsAdmin,
      canDelete: isPostAuthor || userIsAdmin
    });

    if (!isPostAuthor && !userIsAdmin) {
      throw new Error('You do not have permission to delete this space post. Only the post author or administrators can delete posts.');
    }

    // Delete subcollections (comments, reactions, likes) if author or admin
    if (userIsAdmin || isPostAuthor) {
      await deleteSpacePostSubcollections(postId);
    } else {
      console.log('[FIREBASE CLEANUP] Skipping deletion of cross-user subcollections for space post because caller lacks elevated privileges.');
    }

    // Delete media files for the space post (prefer explicit storagePath)
    await deleteSpacePostMediaFiles(postId);

    // Cleanup hidden references across users (best-effort)
    if (userIsAdmin || isPostAuthor) {
      await cleanupAllHiddenPostReferences(postId);
    } else {
      try {
        const hiddenRef = doc(db, 'users', userId, 'hidden_posts', postId);
        const hiddenSnap = await getDoc(hiddenRef);
        if (hiddenSnap.exists()) {
          await deleteDoc(hiddenRef);
          console.log('[FIREBASE CLEANUP] Removed hidden space-post reference for requesting user only:', userId);
        }
      } catch (err) {
        console.warn('[FIREBASE CLEANUP] Failed to remove hidden space-post reference for requesting user:', err);
      }
    }

    // Cleanup notifications related to this space post
    if (userIsAdmin || isPostAuthor) {
      await cleanupPostNotifications(postId);
    } else {
      console.log('[FIREBASE CLEANUP] Skipping notification cleanup for space post because caller lacks elevated privileges.');
    }

    // Delete the main space post document inside a transaction
    await runTransaction(db, async (transaction) => {
      const postDocInTx = await transaction.get(spacePostRef);
      if (!postDocInTx.exists()) {
        console.log('[FIREBASE CLEANUP] Space post not found in transaction (already deleted?):', postId);
        return;
      }
      transaction.delete(spacePostRef);
      console.log('[FIREBASE CLEANUP] Main space post document marked for deletion (final step)');
    });

    // Final verification - reuse existing verifier (it checks posts collection by id, but
    // it is still useful to ensure there are no lingering subcollections or media under posts path)
    const verified = await verifyCompletePostDeletion(postId);
    if (!verified) {
      console.warn('[FIREBASE CLEANUP] Space post deletion verification reported remaining data, but continuing (caller may be missing cross-user permissions)');
    }

    console.log('[FIREBASE CLEANUP] Total Firebase space-post deletion completed (best-effort):', postId);
  } catch (error) {
    console.error('[FIREBASE CLEANUP] Error during total space-post deletion:', error);
    throw new Error(`Failed to completely delete space post from Firebase: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

/**
 * Delete standard subcollections for a space post (comments, reactions, likes)
 */
async function deleteSpacePostSubcollections(postId: string): Promise<void> {
  console.log('[FIREBASE CLEANUP] Deleting space post subcollections...');
  try {
    // Comments
    const commentsRef = collection(db, 'spacePosts', postId, 'comments');
    const commentsSnapshot = await getDocs(commentsRef);
    for (const commentDoc of commentsSnapshot.docs) {
      try {
        await deleteDoc(commentDoc.ref);
        console.log('[FIREBASE CLEANUP] Deleted space post comment:', commentDoc.id);
      } catch (err) {
        console.warn('[FIREBASE CLEANUP] Failed to delete space post comment (will continue):', commentDoc.id, err);
      }
    }

    // Reactions
    const reactionsRef = collection(db, 'spacePosts', postId, 'reactions');
    const reactionsSnapshot = await getDocs(reactionsRef);
    for (const reactionDoc of reactionsSnapshot.docs) {
      try {
        await deleteDoc(reactionDoc.ref);
        console.log('[FIREBASE CLEANUP] Deleted space post reaction:', reactionDoc.id);
      } catch (err) {
        console.warn('[FIREBASE CLEANUP] Failed to delete space post reaction (will continue):', reactionDoc.id, err);
      }
    }

    // Likes
    const likesRef = collection(db, 'spacePosts', postId, 'likes');
    const likesSnapshot = await getDocs(likesRef);
    for (const likeDoc of likesSnapshot.docs) {
      try {
        await deleteDoc(likeDoc.ref);
        console.log('[FIREBASE CLEANUP] Deleted space post like:', likeDoc.id);
      } catch (err) {
        console.warn('[FIREBASE CLEANUP] Failed to delete space post like (will continue):', likeDoc.id, err);
      }
    }

    console.log('[FIREBASE CLEANUP] Finished attempting space post subcollection deletions (some may have failed)');
  } catch (error) {
    console.error('[FIREBASE CLEANUP] Error enumerating space post subcollections:', error);
  }
}

/**
 * Delete media files associated with a space post by preferring explicit `storagePath` entries.
 * This avoids dangerous folder-based fallbacks and will only delete objects explicitly referenced
 * by the post document or those that can be parsed from the stored download URLs.
 */
async function deleteSpacePostMediaFiles(postId: string): Promise<void> {
  console.log('[FIREBASE CLEANUP] Cleaning up media files for space post:', postId);
  try {
    try {
      const postRef = doc(db, 'spacePosts', postId);
      const postDoc = await getDoc(postRef);
      if (postDoc.exists()) {
        const postData = postDoc.data();
        const mediaItems = postData.media || postData.mediaItems || [];

        const parsedPaths: string[] = [];
        for (const mi of mediaItems) {
          try {
            if (mi && typeof mi === 'object' && mi.storagePath && typeof mi.storagePath === 'string') {
              parsedPaths.push(mi.storagePath);
              continue;
            }

            const url = mi.url || mi;
            if (!url || typeof url !== 'string') continue;

            const match = url.match(/\/o\/(.+)\?/);
            if (match && match[1]) {
              const decoded = decodeURIComponent(match[1]);
              parsedPaths.push(decoded);
              continue;
            }
          } catch (parseErr) {
            console.warn('[FIREBASE CLEANUP] Failed to parse space post media URL for deletion, skipping:', mi, parseErr);
          }
        }

        if (parsedPaths.length > 0) {
          // Only delete explicit media file types to avoid removing documents
          const allowedExt = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.mp4', '.mov', '.m4v', '.webm', '.ogg', '.mp3', '.wav', '.flac', '.aac'];
          const normalized = parsedPaths.map(p => ({ p, lower: p.toLowerCase() }));

          const toDelete = normalized.filter(({ lower }) => allowedExt.some(ext => lower.endsWith(ext))).map(({ p }) => p);
          const skipped = normalized.filter(({ lower }) => !allowedExt.some(ext => lower.endsWith(ext))).map(({ p }) => p);

          if (skipped.length > 0) {
            console.log('[FIREBASE CLEANUP] Skipping deletion for non-media files (protected extensions) in space post:', skipped);
          }

          if (toDelete.length === 0) {
            console.log('[FIREBASE CLEANUP] No allowed media files found to delete for this space post (skipping)');
            return;
          }

          console.log('[FIREBASE CLEANUP] Deleting specific media files parsed from spacePost.media/storagePath:', toDelete);
          const deletePromises = toDelete.map(async (storagePath) => {
            try {
              const objRef = ref(storage, storagePath);
              await deleteObject(objRef);
              console.log('[FIREBASE CLEANUP] Deleted media file at path:', storagePath);
            } catch (err) {
              console.warn('[FIREBASE CLEANUP] Failed to delete media file at path (will continue):', storagePath, err);
            }
          });
          await Promise.all(deletePromises);
          return;
        }
      }
    } catch (readPostErr) {
      console.warn('[FIREBASE CLEANUP] Failed to read space post document for media parsing:', readPostErr);
    }

    // If we reach here, no explicit storagePath found — avoid broad listing/deleting to prevent accidental mass deletion.
    console.log('[FIREBASE CLEANUP] No explicit media storagePath found for space post; skipping destructive fallback listing');
  } catch (error) {
    console.error('[FIREBASE CLEANUP] Error during space post media cleanup:', error);
  }
}

// Export statement: keep the module exports available (we export functions above as needed)
export {};
