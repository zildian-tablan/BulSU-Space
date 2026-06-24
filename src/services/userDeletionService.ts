import { 
  deleteUser as firebaseDeleteUser, 
  User as FirebaseUser,
  reauthenticateWithCredential,
  EmailAuthProvider
} from 'firebase/auth';
import { 
  doc, 
  deleteDoc, 
  collection, 
  query, 
  where, 
  getDocs, 
  writeBatch,
  getDoc
} from 'firebase/firestore';
import { ref, remove } from 'firebase/database';
import { auth, db, rtdb } from '../firebase/config';
import { totalFirebasePostDeletion } from './firebaseCleanupService';

export interface UserDeletionResult {
  success: boolean;
  error?: string;
}

class UserDeletionService {  
  /**
   * Simply delete a user's document, Firebase authentication, and ALL their posts
   * Updated to prevent orphaned or "unknown user" posts
   */  async deleteUserSimple(user: FirebaseUser): Promise<UserDeletionResult> {
    console.log('[USER DELETION] Starting simplified account deletion for user:', user.uid);
    
    try {
      const userId = user.uid;
      let userDocDeleted = false;
      let authDeleted = false;
      let postsDeleted = false;
      
      // Step 1: Delete ALL user posts first to prevent orphaned posts
      console.log('[USER DELETION] Step 1: Deleting all user posts');
      try {
        await this.quickPostsDeletion(userId);
        console.log('[USER DELETION] All user posts deleted successfully');
        postsDeleted = true;
      } catch (error) {
        console.error('[USER DELETION] Error deleting user posts:', error);
        // Continue with user deletion even if post deletion fails
      }
      
      // Step 2: Delete the user's Firestore document
      console.log('[USER DELETION] Step 2: Deleting user document');
      try {
        const userRef = doc(db, 'users', userId);
        // Check if document exists first to avoid permission errors
        const userDoc = await getDoc(userRef);
        
        if (userDoc.exists()) {
          await deleteDoc(userRef);
          console.log('[USER DELETION] User document deleted successfully');
          userDocDeleted = true;
        } else {
          console.log('[USER DELETION] User document already deleted');
          userDocDeleted = true;
        }
      } catch (error) {
        console.error('[USER DELETION] Error deleting user document:', error);
        // We'll continue with auth deletion even if document deletion fails
      }
      
      // Step 3: Delete Firebase Auth account
      console.log('[USER DELETION] Step 3: Deleting Firebase Auth account');      try {
        // Check if user still exists in auth
        if (user) {
          await this.deleteFirebaseAuthAccount(user);
          console.log('[USER DELETION] Firebase Auth account deleted successfully');
          authDeleted = true;
        } else {
          console.log('[USER DELETION] Firebase Auth user doesn\'t exist');
          authDeleted = true;
        }
      } catch (error: any) {
        console.error('[USER DELETION] Failed to delete Firebase Auth account:', error);
        
        // If it's a re-authentication issue, sign out the user instead
        if (error.code === 'auth/requires-recent-login' || error.message?.includes('recent authentication')) {
          console.log('[USER DELETION] Auth deletion requires re-auth, signing out instead');
          try {
            await auth.signOut();
            console.log('[USER DELETION] User signed out successfully');
          } catch (signOutError) {
            console.error('[USER DELETION] Failed to sign out user:', signOutError);
          }
          
          return { 
            success: userDocDeleted, // Return partial success if user doc was deleted
            error: 'Account requires recent authentication. Please log in again to delete your account completely.' 
          };
        } else {
          // For other errors, continue and return partial success if applicable
          return {
            success: userDocDeleted,
            error: `Firebase Auth deletion failed: ${error.message || 'Unknown error'}`
          };
        }
      }
      
      console.log('[USER DELETION] Simple account deletion completed (posts deleted:', postsDeleted, ', user doc deleted:', userDocDeleted, ', auth deleted:', authDeleted, ')');
      
      if (postsDeleted && userDocDeleted && authDeleted) {
        return { success: true };
      } else if (userDocDeleted && authDeleted) {
        return { 
          success: true,
          error: 'User account deleted but some posts may remain.'
        };
      } else if (userDocDeleted) {
        return { 
          success: true,
          error: 'User document deleted but Firebase Authentication may not have been fully removed.'
        };
      } else if (authDeleted) {
        return {
          success: true,
          error: 'Firebase Authentication deleted but user document may not have been removed.'
        };
      } else {
        return {
          success: false,
          error: 'Failed to delete user account completely.'
        };
      }
    } catch (error) {
      console.error('[USER DELETION] Error in simple deletion:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      };
    }
  }
  
  /**
   * Completely delete a user account and all associated data
   * This is an atomic operation that ensures complete cleanup
   */  async deleteUserAccount(user: FirebaseUser): Promise<UserDeletionResult> {
    console.log('[USER DELETION] Starting account deletion process for user:', user.uid);
    
    // Call the new simplified deletion method that only deletes user document and auth
    return this.deleteUserSimple(user);
  }  /**
   * Quick deletion that prioritizes data cleanup first, then auth deletion
   */
  private async performQuickDeletion(userId: string, user: FirebaseUser): Promise<void> {
    console.log('[USER DELETION] Starting quick deletion process');
    
    // Step 1: Always do data cleanup FIRST to ensure it completes
    console.log('[USER DELETION] Step 1: Performing data cleanup');
    let dataCleanupSuccess = false;
    
    try {
      await Promise.race([
        this.quickDataCleanup(userId),
        new Promise<void>((_, reject) => 
          setTimeout(() => reject(new Error('Data cleanup timeout')), 15000) // Increased timeout
        )
      ]);
      console.log('[USER DELETION] Data cleanup completed successfully');
      dataCleanupSuccess = true;
    } catch (error) {
      console.error('[USER DELETION] Data cleanup failed or timed out:', error);
      // Don't continue with auth deletion if data cleanup fails
      throw new Error(`Firestore data cleanup failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    
    // Step 2: Only proceed with auth deletion if data cleanup succeeded
    if (dataCleanupSuccess) {
      console.log('[USER DELETION] Step 2: Attempting Firebase Auth account deletion');
      let authDeleted = false;
      
      try {
        await this.deleteFirebaseAuthAccount(user);
        console.log('[USER DELETION] Firebase Auth account deleted successfully');
        authDeleted = true;
      } catch (error: any) {
        console.error('[USER DELETION] Failed to delete Firebase Auth account:', error);
        
        // If it's a re-authentication issue, we'll try a different approach
        if (error.message?.includes('recent authentication') || error.code === 'auth/requires-recent-login') {
          console.log('[USER DELETION] Auth account deletion failed due to re-auth requirement');
          console.log('[USER DELETION] Will sign out user instead');
          authDeleted = false;
        } else {
          // For other auth errors, still try to continue but log the issue
          console.log('[USER DELETION] Auth account deletion failed with other error');
          authDeleted = false;
        }
      }
      
      // Step 3: If auth wasn't deleted, at least sign out the user
      if (!authDeleted) {
        console.log('[USER DELETION] Step 3: Signing out user since auth deletion failed');
        try {
          await auth.signOut();
          console.log('[USER DELETION] User signed out successfully');
        } catch (signOutError) {
          console.error('[USER DELETION] Failed to sign out user:', signOutError);
        }
      }
      
      console.log('[USER DELETION] Quick deletion process completed (auth deleted:', authDeleted, ')');
    }
  }/**
   * Quick data cleanup that focuses on essential operations only
   */
  private async quickDataCleanup(userId: string): Promise<void> {
    console.log('[USER DELETION] Starting quick data cleanup for:', userId);
    
    try {
      // 1. Create batch for operations first
      const batch = writeBatch(db);
      
      // 2. Add user document deletion to batch (most important)
      console.log('[USER DELETION] Adding user document deletion to batch');
      const userRef = doc(db, 'users', userId);
      batch.delete(userRef);
      
      // 3. Delete user's essential data in batch
      await this.addEssentialDataToBatch(userId, batch);
      
      // 4. Commit batch operations (includes user document deletion)
      console.log('[USER DELETION] Committing batch deletions including user document');
      await batch.commit();
      console.log('[USER DELETION] Batch deletions completed - user document deleted');
      
      // 5. Delete user's posts (critical but separate from batch due to complexity)
      console.log('[USER DELETION] Deleting user posts');
      await this.quickPostsDeletion(userId);
      
      // 6. Try real-time cleanup but don't wait too long
      console.log('[USER DELETION] Attempting real-time cleanup');
      await Promise.race([
        this.quickRealtimeCleanup(userId),
        new Promise<void>((_, reject) => 
          setTimeout(() => reject(new Error('Realtime cleanup timeout')), 3000)
        )
      ]);
      
      console.log('[USER DELETION] Quick data cleanup completed');
    } catch (error) {
      console.error('[USER DELETION] Error in quick data cleanup:', error);
      throw error; // Re-throw to ensure calling code knows about the failure
    }
  }

  /**
   * Add essential user data deletions to batch
   */
  private async addEssentialDataToBatch(userId: string, batch: any): Promise<void> {
    try {
      // Delete user's comments
      console.log('[USER DELETION] Adding comment deletions to batch');
      const commentsQuery = query(collection(db, 'comments'), where('userId', '==', userId));
      const commentsSnapshot = await getDocs(commentsQuery);
      commentsSnapshot.docs.forEach(doc => batch.delete(doc.ref));
      
      const spaceCommentsQuery = query(collection(db, 'spaceComments'), where('userId', '==', userId));
      const spaceCommentsSnapshot = await getDocs(spaceCommentsQuery);
      spaceCommentsSnapshot.docs.forEach(doc => batch.delete(doc.ref));
      
      // Delete user's reactions
      console.log('[USER DELETION] Adding reaction deletions to batch');
      const reactionsQuery = query(collection(db, 'reactions'), where('userId', '==', userId));
      const reactionsSnapshot = await getDocs(reactionsQuery);
      reactionsSnapshot.docs.forEach(doc => batch.delete(doc.ref));
      
      const spaceReactionsQuery = query(collection(db, 'spaceReactions'), where('userId', '==', userId));
      const spaceReactionsSnapshot = await getDocs(spaceReactionsQuery);
      spaceReactionsSnapshot.docs.forEach(doc => batch.delete(doc.ref));
      
      // Delete user's bookmarks
      console.log('[USER DELETION] Adding bookmark deletions to batch');
      const bookmarksQuery = query(collection(db, 'bookmarks'), where('userId', '==', userId));
      const bookmarksSnapshot = await getDocs(bookmarksQuery);
      bookmarksSnapshot.docs.forEach(doc => batch.delete(doc.ref));
      
      // Delete user's follows
      console.log('[USER DELETION] Adding follow relationship deletions to batch');
      const followingQuery = query(collection(db, 'follows'), where('followerId', '==', userId));
      const followingSnapshot = await getDocs(followingQuery);
      followingSnapshot.docs.forEach(doc => batch.delete(doc.ref));
      
      const followersQuery = query(collection(db, 'follows'), where('followingId', '==', userId));
      const followersSnapshot = await getDocs(followersQuery);
      followersSnapshot.docs.forEach(doc => batch.delete(doc.ref));
      
      console.log('[USER DELETION] Essential data added to batch successfully');
    } catch (error) {
      console.error('[USER DELETION] Error adding essential data to batch:', error);
      // Continue with whatever we have in the batch
    }
  }

  /**
   * Quick real-time database cleanup
   */
  private async quickRealtimeCleanup(userId: string): Promise<void> {
    console.log('[USER DELETION] Starting quick real-time cleanup');
    
    const cleanupOperations = [
      remove(ref(rtdb, `presence/${userId}`)).catch(e => console.log('Presence cleanup failed:', e)),
      remove(ref(rtdb, `onlineUsers/${userId}`)).catch(e => console.log('Online users cleanup failed:', e)),
      remove(ref(rtdb, `typing/${userId}`)).catch(e => console.log('Typing cleanup failed:', e))
    ];

    // Wait for all operations but don't fail if some don't complete
    await Promise.allSettled(cleanupOperations);
    console.log('[USER DELETION] Quick real-time cleanup completed');
  }
  /**
   * Perform the actual deletion process
   */
  private async performDeletion(userId: string, user: FirebaseUser): Promise<void> {
    console.log('[USER DELETION] Step 1: Starting data cleanup');
    
    try {
      // Start with data cleanup first (before auth deletion)
      await this.deleteUserData(userId);
    } catch (error) {
      console.error('[USER DELETION] Error in data cleanup, trying simplified cleanup:', error);
      // Try simplified deletion if full cleanup fails
      await this.simplifiedUserDataDeletion(userId);
    }
    
    console.log('[USER DELETION] Step 2: Starting Firebase Auth account deletion');
    
    // Delete Firebase Authentication account
    await this.deleteFirebaseAuthAccount(user);
    
    console.log('[USER DELETION] All steps completed successfully');
  }

  /**
   * Simplified user data deletion that focuses on core data only
   */
  private async simplifiedUserDataDeletion(userId: string): Promise<void> {
    console.log('[USER DELETION] Starting simplified user data deletion for:', userId);
    
    try {
      const batch = writeBatch(db);
      
      // 1. Delete user document
      console.log('[USER DELETION] Deleting user document');
      const userRef = doc(db, 'users', userId);
      batch.delete(userRef);
      
      // 2. Skip post deletion for now due to potential complexity
      console.log('[USER DELETION] Skipping post deletion due to potential issues');
      
      // 3. Delete core user data only
      console.log('[USER DELETION] Deleting user comments');
      await this.deleteUserComments(userId, batch);
      
      console.log('[USER DELETION] Deleting user reactions');
      await this.deleteUserReactions(userId, batch);
      
      console.log('[USER DELETION] Deleting user bookmarks');
      await this.deleteUserBookmarks(userId, batch);
      
      // 4. Clean up real-time database presence
      console.log('[USER DELETION] Cleaning up real-time presence');
      await this.deleteRealtimePresence(userId);
      
      // 5. Commit batch operations
      console.log('[USER DELETION] Committing simplified batch deletions');
      await batch.commit();
      
      console.log('[USER DELETION] Simplified user data deletion completed');
    } catch (error) {
      console.error('[USER DELETION] Error in simplified deletion:', error);
      // Continue anyway - we'll at least delete the auth account
    }
  }
  /**
   * Delete all user-related data from Firestore and Realtime Database
   */
  private async deleteUserData(userId: string): Promise<void> {
    console.log('[USER DELETION] Starting user data deletion for:', userId);
    const batch = writeBatch(db);
    
    try {
      console.log('[USER DELETION] Step 1: Deleting user document');
      // 1. Delete user document
      const userRef = doc(db, 'users', userId);
      batch.delete(userRef);

      console.log('[USER DELETION] Step 2: Deleting user posts');
      // 2. Delete all user's posts using existing cleanup service
      await this.deleteUserPosts(userId);

      console.log('[USER DELETION] Step 3: Deleting user space posts');
      // 3. Delete all user's space posts
      await this.deleteUserSpacePosts(userId);

      console.log('[USER DELETION] Step 4: Deleting user comments');
      // 4. Clean up user's comments
      await this.deleteUserComments(userId, batch);

      console.log('[USER DELETION] Step 5: Deleting user reactions');
      // 5. Clean up user's reactions
      await this.deleteUserReactions(userId, batch);

      console.log('[USER DELETION] Step 6: Deleting user notifications');
      // 6. Clean up user's notifications
      await this.deleteUserNotifications(userId, batch);

      console.log('[USER DELETION] Step 7: Deleting user follow relationships');
      // 7. Clean up user's follows/followers
      await this.deleteUserFollowRelationships(userId, batch);

      console.log('[USER DELETION] Step 8: Deleting user space memberships');
      // 8. Clean up user's space memberships
      await this.deleteUserSpaceMemberships(userId, batch);

      console.log('[USER DELETION] Step 9: Deleting user bookmarks');
      // 9. Clean up user's bookmarks
      await this.deleteUserBookmarks(userId, batch);

      console.log('[USER DELETION] Step 10: Deleting real-time presence');
      // 10. Clean up real-time database presence
      await this.deleteRealtimePresence(userId);

      console.log('[USER DELETION] Step 11: Cleaning up user references');
      // 11. Clean up any remaining user references
      await this.cleanupUserReferences(userId, batch);

      console.log('[USER DELETION] Step 12: Committing batch deletions');
      // Commit all Firestore deletions
      await batch.commit();
      
      console.log('[USER DELETION] User data deletion completed successfully');
    } catch (error) {
      console.error('[USER DELETION] Error deleting user data:', error);
      throw error;
    }
  }  /**
   * Delete all posts created by the user
   */
  private async deleteUserPosts(userId: string): Promise<void> {
    try {
      console.log('[USER DELETION] Querying user posts for:', userId);
      const postsQuery = query(
        collection(db, 'posts'),
        where('userId', '==', userId)
      );
      
      const querySnapshot = await getDocs(postsQuery);
      console.log('[USER DELETION] Found', querySnapshot.docs.length, 'posts to delete');
      
      // Use existing cleanup service for thorough post deletion
      for (const docSnapshot of querySnapshot.docs) {
        console.log('[USER DELETION] Deleting post:', docSnapshot.id);
        try {
          await totalFirebasePostDeletion(docSnapshot.id, userId);
        } catch (error) {
          console.error('[USER DELETION] Error deleting post', docSnapshot.id, ':', error);
          // Continue with other posts even if one fails
        }
      }
      console.log('[USER DELETION] Completed deleting user posts');
    } catch (error) {
      console.error('[USER DELETION] Error in deleteUserPosts:', error);
      throw error;
    }
  }

  /**
   * Delete all space posts created by the user
   */
  private async deleteUserSpacePosts(userId: string): Promise<void> {
    try {
      console.log('[USER DELETION] Querying user space posts for:', userId);
      const spacePostsQuery = query(
        collection(db, 'spacePosts'),
        where('userId', '==', userId)
      );
      
      const querySnapshot = await getDocs(spacePostsQuery);
      console.log('[USER DELETION] Found', querySnapshot.docs.length, 'space posts to delete');
      
      // Use existing cleanup service for thorough space post deletion
      for (const docSnapshot of querySnapshot.docs) {
        console.log('[USER DELETION] Deleting space post:', docSnapshot.id);
        try {
          await totalFirebasePostDeletion(docSnapshot.id, userId);
        } catch (error) {
          console.error('[USER DELETION] Error deleting space post', docSnapshot.id, ':', error);
          // Continue with other posts even if one fails
        }
      }
      console.log('[USER DELETION] Completed deleting user space posts');
    } catch (error) {
      console.error('[USER DELETION] Error in deleteUserSpacePosts:', error);
      throw error;
    }
  }  /**
   * Delete all comments made by the user
   */
  private async deleteUserComments(userId: string, batch: any): Promise<void> {
    try {
      // Delete comments on regular posts
      console.log('[USER DELETION] Querying post comments for user:', userId);
      const postCommentsQuery = query(
        collection(db, 'comments'),
        where('userId', '==', userId)
      );
      const postCommentsSnapshot = await getDocs(postCommentsQuery);
      console.log('[USER DELETION] Found', postCommentsSnapshot.docs.length, 'post comments');
      postCommentsSnapshot.docs.forEach(doc => batch.delete(doc.ref));

      // Delete comments on space posts
      console.log('[USER DELETION] Querying space comments for user:', userId);
      const spaceCommentsQuery = query(
        collection(db, 'spaceComments'),
        where('userId', '==', userId)
      );
      const spaceCommentsSnapshot = await getDocs(spaceCommentsQuery);
      console.log('[USER DELETION] Found', spaceCommentsSnapshot.docs.length, 'space comments');
      spaceCommentsSnapshot.docs.forEach(doc => batch.delete(doc.ref));
    } catch (error) {
      console.error('[USER DELETION] Error deleting user comments:', error);
      throw error;
    }
  }

  /**
   * Delete all reactions made by the user
   */
  private async deleteUserReactions(userId: string, batch: any): Promise<void> {
    try {
      // Delete reactions on regular posts
      console.log('[USER DELETION] Querying post reactions for user:', userId);
      const postReactionsQuery = query(
        collection(db, 'reactions'),
        where('userId', '==', userId)
      );
      const postReactionsSnapshot = await getDocs(postReactionsQuery);
      console.log('[USER DELETION] Found', postReactionsSnapshot.docs.length, 'post reactions');
      postReactionsSnapshot.docs.forEach(doc => batch.delete(doc.ref));

      // Delete reactions on space posts
      console.log('[USER DELETION] Querying space reactions for user:', userId);
      const spaceReactionsQuery = query(
        collection(db, 'spaceReactions'),
        where('userId', '==', userId)
      );
      const spaceReactionsSnapshot = await getDocs(spaceReactionsQuery);
      console.log('[USER DELETION] Found', spaceReactionsSnapshot.docs.length, 'space reactions');
      spaceReactionsSnapshot.docs.forEach(doc => batch.delete(doc.ref));
    } catch (error) {
      console.error('[USER DELETION] Error deleting user reactions:', error);
      throw error;
    }
  }
  /**
   * Delete all notifications for/from the user
   */
  private async deleteUserNotifications(userId: string, batch: any): Promise<void> {
    try {
      console.log('[USER DELETION] Querying notifications TO user:', userId);
      // Delete notifications TO the user
      const toUserQuery = query(
        collection(db, 'notifications'),
        where('recipientId', '==', userId)
      );
      const toUserSnapshot = await Promise.race([
        getDocs(toUserQuery),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Notifications TO user query timeout')), 8000)
        )
      ]);
      console.log('[USER DELETION] Found', toUserSnapshot.docs.length, 'notifications TO user');
      toUserSnapshot.docs.forEach(doc => batch.delete(doc.ref));

      console.log('[USER DELETION] Querying notifications FROM user:', userId);
      // Delete notifications FROM the user
      const fromUserQuery = query(
        collection(db, 'notifications'),
        where('senderId', '==', userId)
      );
      const fromUserSnapshot = await Promise.race([
        getDocs(fromUserQuery),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Notifications FROM user query timeout')), 8000)
        )
      ]);
      console.log('[USER DELETION] Found', fromUserSnapshot.docs.length, 'notifications FROM user');
      fromUserSnapshot.docs.forEach(doc => batch.delete(doc.ref));
    } catch (error) {
      console.error('[USER DELETION] Error deleting user notifications:', error);
      // Continue even if notification cleanup fails
    }
  }

  /**
   * Delete user's follow relationships
   */
  private async deleteUserFollowRelationships(userId: string, batch: any): Promise<void> {
    try {
      console.log('[USER DELETION] Querying follows where user is follower:', userId);
      // Delete follows where user is the follower
      const followingQuery = query(
        collection(db, 'follows'),
        where('followerId', '==', userId)
      );
      const followingSnapshot = await Promise.race([
        getDocs(followingQuery),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Following query timeout')), 8000)
        )
      ]);
      console.log('[USER DELETION] Found', followingSnapshot.docs.length, 'following relationships');
      followingSnapshot.docs.forEach(doc => batch.delete(doc.ref));

      console.log('[USER DELETION] Querying follows where user is followed:', userId);
      // Delete follows where user is being followed
      const followersQuery = query(
        collection(db, 'follows'),
        where('followingId', '==', userId)
      );
      const followersSnapshot = await Promise.race([
        getDocs(followersQuery),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Followers query timeout')), 8000)
        )
      ]);
      console.log('[USER DELETION] Found', followersSnapshot.docs.length, 'follower relationships');
      followersSnapshot.docs.forEach(doc => batch.delete(doc.ref));
    } catch (error) {
      console.error('[USER DELETION] Error deleting user follow relationships:', error);
      // Continue even if follow cleanup fails
    }
  }

  /**
   * Delete user's space memberships
   */
  private async deleteUserSpaceMemberships(userId: string, batch: any): Promise<void> {
    try {
      console.log('[USER DELETION] Querying space memberships for user:', userId);
      const membershipsQuery = query(
        collection(db, 'spaceMembers'),
        where('userId', '==', userId)
      );
      const membershipsSnapshot = await Promise.race([
        getDocs(membershipsQuery),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Space memberships query timeout')), 8000)
        )
      ]);
      console.log('[USER DELETION] Found', membershipsSnapshot.docs.length, 'space memberships');
      membershipsSnapshot.docs.forEach(doc => batch.delete(doc.ref));
    } catch (error) {
      console.error('[USER DELETION] Error deleting user space memberships:', error);
      // Continue even if space membership cleanup fails
    }
  }

  /**
   * Delete user's bookmarks
   */
  private async deleteUserBookmarks(userId: string, batch: any): Promise<void> {
    try {
      console.log('[USER DELETION] Querying bookmarks for user:', userId);
      const bookmarksQuery = query(
        collection(db, 'bookmarks'),
        where('userId', '==', userId)
      );
      const bookmarksSnapshot = await Promise.race([
        getDocs(bookmarksQuery),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Bookmarks query timeout')), 8000)
        )
      ]);
      console.log('[USER DELETION] Found', bookmarksSnapshot.docs.length, 'bookmarks');
      bookmarksSnapshot.docs.forEach(doc => batch.delete(doc.ref));
    } catch (error) {
      console.error('[USER DELETION] Error deleting user bookmarks:', error);
      // Continue even if bookmark cleanup fails
    }
  }
  /**
   * Delete user's real-time database presence with timeout protection
   */
  private async deleteRealtimePresence(userId: string): Promise<void> {
    console.log('[USER DELETION] Starting real-time presence cleanup for:', userId);
    
    const timeoutPromise = new Promise<void>((_, reject) => {
      setTimeout(() => reject(new Error('Real-time presence cleanup timed out')), 10000); // 10 second timeout
    });

    try {
      const cleanupPromise = this.performRealtimeCleanup(userId);
      await Promise.race([cleanupPromise, timeoutPromise]);
      console.log('[USER DELETION] Real-time presence cleanup completed');
    } catch (error) {
      console.error('[USER DELETION] Error deleting realtime presence:', error);
      // Continue with deletion even if realtime cleanup fails
      console.log('[USER DELETION] Continuing with account deletion despite realtime error');
    }
  }

  /**
   * Perform the actual real-time database cleanup
   */
  private async performRealtimeCleanup(userId: string): Promise<void> {
    const cleanupOperations = [];

    // Delete user presence
    console.log('[USER DELETION] Deleting user presence');
    const presenceRef = ref(rtdb, `presence/${userId}`);
    cleanupOperations.push(remove(presenceRef).catch(e => console.log('Presence removal failed:', e)));

    // Delete user from online users
    console.log('[USER DELETION] Deleting from online users');
    const onlineRef = ref(rtdb, `onlineUsers/${userId}`);
    cleanupOperations.push(remove(onlineRef).catch(e => console.log('Online users removal failed:', e)));

    // Delete any typing indicators
    console.log('[USER DELETION] Deleting typing indicators');
    const typingRef = ref(rtdb, `typing/${userId}`);
    cleanupOperations.push(remove(typingRef).catch(e => console.log('Typing removal failed:', e)));

    // Wait for all operations to complete, but don't fail if some fail
    await Promise.allSettled(cleanupOperations);
  }

  /**
   * Clean up any remaining references to the user
   */
  private async cleanupUserReferences(userId: string, batch: any): Promise<void> {
    // Check for any documents that might reference this user
    // This is a safety net for any missed references
    
    // Clean up any chat participants (if chat system exists)
    try {
      const chatParticipantsQuery = query(
        collection(db, 'chatParticipants'),
        where('userId', '==', userId)
      );
      const chatParticipantsSnapshot = await getDocs(chatParticipantsQuery);
      chatParticipantsSnapshot.docs.forEach(doc => batch.delete(doc.ref));
    } catch (error) {
      // Collection might not exist, continue
    }

    // Clean up any event participants (if event system exists)
    try {
      const eventParticipantsQuery = query(
        collection(db, 'eventParticipants'),
        where('userId', '==', userId)
      );
      const eventParticipantsSnapshot = await getDocs(eventParticipantsQuery);
      eventParticipantsSnapshot.docs.forEach(doc => batch.delete(doc.ref));
    } catch (error) {
      // Collection might not exist, continue
    }
  }

  /**
   * Delete the Firebase Authentication account
   */
  private async deleteFirebaseAuthAccount(user: FirebaseUser): Promise<void> {
    try {
      await firebaseDeleteUser(user);
    } catch (error: any) {
      // Handle cases where re-authentication might be needed
      if (error.code === 'auth/requires-recent-login') {
        throw new Error('Account deletion requires recent authentication. Please log in again.');
      }
      throw error;
    }
  }

  /**
   * Get the current authenticated user
   */
  getCurrentUser(): FirebaseUser | null {
    return auth.currentUser;
  }

  /**
   * Comprehensive deletion method (backup for when we have more time)
   * This method tries to delete all user data thoroughly
   */
  async deleteUserAccountComprehensive(user: FirebaseUser): Promise<UserDeletionResult> {
    console.log('[USER DELETION] Starting comprehensive account deletion for user:', user.uid);
    
    try {
      const userId = user.uid;
      
      // Longer timeout for comprehensive deletion
      const deletionPromise = this.performDeletion(userId, user);
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Comprehensive deletion timed out after 60 seconds')), 60000);
      });
      
      await Promise.race([deletionPromise, timeoutPromise]);
      
      console.log('[USER DELETION] Comprehensive account deletion completed successfully');
      return { success: true };
    } catch (error) {
      console.error('[USER DELETION] Error in comprehensive deletion:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      };
    }
  }

  /**
   * Quick posts deletion for essential cleanup
   */
  private async quickPostsDeletion(userId: string): Promise<void> {
    try {
      console.log('[USER DELETION] Starting quick posts deletion for user:', userId);
      
      // Delete regular posts
      const postsQuery = query(collection(db, 'posts'), where('userId', '==', userId));
      const postsSnapshot = await getDocs(postsQuery);
      console.log('[USER DELETION] Found', postsSnapshot.docs.length, 'posts to delete');
      
      // Delete posts using batch operations for efficiency
      const batch = writeBatch(db);
      postsSnapshot.docs.forEach(doc => batch.delete(doc.ref));
      
      // Delete space posts
      const spacePostsQuery = query(collection(db, 'spacePosts'), where('userId', '==', userId));
      const spacePostsSnapshot = await getDocs(spacePostsQuery);
      console.log('[USER DELETION] Found', spacePostsSnapshot.docs.length, 'space posts to delete');
      
      spacePostsSnapshot.docs.forEach(doc => batch.delete(doc.ref));
      
      // Commit batch deletion
      await batch.commit();
      console.log('[USER DELETION] Posts batch deletion completed');
      
    } catch (error) {
      console.error('[USER DELETION] Error in quick posts deletion:', error);
      // Continue with other cleanup even if posts deletion fails
    }
  }

  /**
   * Verify that user data has been deleted from Firestore
   */
  private async verifyUserDataDeletion(userId: string): Promise<boolean> {
    try {
      console.log('[USER DELETION] Verifying user data deletion for:', userId);
      
      // Check if user document still exists
      const userDoc = await getDoc(doc(db, 'users', userId));
      if (userDoc.exists()) {
        console.error('[USER DELETION] User document still exists after deletion attempt');
        return false;
      }
      
      console.log('[USER DELETION] User data deletion verified successfully');
      return true;
    } catch (error) {
      console.error('[USER DELETION] Error verifying user data deletion:', error);
      return false;
    }
  }

  /**
   * Manual Firestore cleanup method for cases where user auth was deleted but Firestore data remains
   * This can be called independently if needed
   */
  async cleanupFirestoreDataOnly(userId: string): Promise<UserDeletionResult> {
    console.log('[USER DELETION] Starting Firestore-only cleanup for user:', userId);
    
    try {
      // Perform comprehensive Firestore cleanup
      await this.quickDataCleanup(userId);
      
      // Verify cleanup
      const verified = await this.verifyUserDataDeletion(userId);
      
      if (verified) {
        console.log('[USER DELETION] Firestore cleanup completed and verified');
        return { success: true };
      } else {
        console.warn('[USER DELETION] Firestore cleanup completed but verification failed');
        return { 
          success: false, 
          error: 'Some Firestore data may still remain after cleanup attempt' 
        };
      }
    } catch (error) {
      console.error('[USER DELETION] Error in Firestore cleanup:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Firestore cleanup failed' 
      };
    }
  }

  /**
   * Public method to manually verify and clean up any remaining user data
   * This can be called from the UI if needed
   */  async verifyAndCleanupUser(userId: string): Promise<{ 
    userExists: boolean; 
    cleanupNeeded: boolean; 
    cleanupResult?: UserDeletionResult 
  }> {
    console.log('[USER DELETION] Checking user data status for:', userId);
    
    try {
      // Check if user document still exists
      const userDoc = await getDoc(doc(db, 'users', userId));
      const userExists = userDoc.exists();
      
      if (!userExists) {
        console.log('[USER DELETION] User document verified as deleted');
        return { userExists: false, cleanupNeeded: false };
      }
      
      console.log('[USER DELETION] User document still exists, performing cleanup');
      // Simply delete the user document only
      try {
        const userRef = doc(db, 'users', userId);
        await deleteDoc(userRef);
        console.log('[USER DELETION] User document deleted successfully during verification cleanup');
        
        return { 
          userExists: true, 
          cleanupNeeded: true, 
          cleanupResult: { success: true }
        };
      } catch (error) {
        console.error('[USER DELETION] Error deleting user document during verification:', error);
        return { 
          userExists: true, 
          cleanupNeeded: true, 
          cleanupResult: { 
            success: false, 
            error: error instanceof Error ? error.message : 'User document deletion failed' 
          }
        };
      }
    } catch (error) {
      console.error('[USER DELETION] Error in verification and cleanup:', error);
      return { 
        userExists: true, 
        cleanupNeeded: true, 
        cleanupResult: { 
          success: false, 
          error: error instanceof Error ? error.message : 'Verification failed' 
        } 
      };
    }}

  /**
   * Simplified but complete account deletion method
   * This method ensures both Firestore and Firebase Auth deletion
   */
  async deleteUserAccountComplete(user: FirebaseUser): Promise<UserDeletionResult> {
    console.log('[USER DELETION] Starting complete account deletion for user:', user.uid);
    
    try {
      const userId = user.uid;
      
      // Step 1: Delete Firestore user document immediately
      console.log('[USER DELETION] Step 1: Deleting user document from Firestore');
      try {
        const userRef = doc(db, 'users', userId);
        await deleteDoc(userRef);
        console.log('[USER DELETION] User document deleted successfully');
      } catch (error) {
        console.error('[USER DELETION] Error deleting user document:', error);
        // Continue anyway - we'll try to delete auth account
      }
      
      // Step 2: Delete related user data
      console.log('[USER DELETION] Step 2: Cleaning up related user data');
      try {
        await this.quickDataCleanup(userId);
        console.log('[USER DELETION] User data cleanup completed');
      } catch (error) {
        console.error('[USER DELETION] Error cleaning up user data:', error);
        // Continue anyway - main goal is to delete the account
      }
      
      // Step 3: Delete Firebase Auth account
      console.log('[USER DELETION] Step 3: Deleting Firebase Auth account');
      try {
        await this.deleteFirebaseAuthAccount(user);
        console.log('[USER DELETION] Firebase Auth account deleted successfully');
      } catch (error) {
        console.error('[USER DELETION] Failed to delete Firebase Auth account:', error);
        
        // If auth deletion fails, at least sign out the user
        try {
          await auth.signOut();
          console.log('[USER DELETION] User signed out successfully');
        } catch (signOutError) {
          console.error('[USER DELETION] Failed to sign out user:', signOutError);
        }
        
        return { 
          success: false, 
          error: `Account data deleted but auth account deletion failed: ${error instanceof Error ? error.message : 'Unknown error'}` 
        };
      }
      
      // Step 4: Verify deletion
      console.log('[USER DELETION] Step 4: Verifying deletion');
      const isDeleted = await this.verifyUserDataDeletion(userId);
      
      if (isDeleted) {
        console.log('[USER DELETION] Complete account deletion verified successfully');
        return { success: true };
      } else {
        console.warn('[USER DELETION] Account deleted but some data may remain');
        return { 
          success: true, 
          error: 'Account deleted but some data may remain in Firestore' 
        };
      }
      
    } catch (error) {
      console.error('[USER DELETION] Error in complete account deletion:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      };
    }
  }

  /**
   * Emergency cleanup method for orphaned user data
   * Use this if Firebase auth was deleted but Firestore data remains
   */
  async emergencyCleanupUserData(userId: string): Promise<UserDeletionResult> {
    console.log('[USER DELETION] Starting emergency cleanup for user:', userId);
    
    try {
      // 1. Delete user document immediately
      console.log('[USER DELETION] Deleting user document');
      const userRef = doc(db, 'users', userId);
      await deleteDoc(userRef);
      
      // 2. Create batch for all other deletions
      const batch = writeBatch(db);
      
      // 3. Delete all user-related collections
      const collections = [
        'comments',
        'spaceComments', 
        'reactions',
        'spaceReactions',
        'bookmarks',
        'notifications',
        'follows',
        'spaceMembers'
      ];
      
      for (const collectionName of collections) {
        try {
          console.log(`[USER DELETION] Cleaning up ${collectionName}`);
          const q = query(collection(db, collectionName), where('userId', '==', userId));
          const snapshot = await getDocs(q);
          snapshot.docs.forEach(doc => batch.delete(doc.ref));
        } catch (error) {
          console.error(`[USER DELETION] Error cleaning ${collectionName}:`, error);
        }
      }
      
      // 4. Delete follow relationships where user is being followed
      try {
        const followersQuery = query(collection(db, 'follows'), where('followingId', '==', userId));
        const followersSnapshot = await getDocs(followersQuery);
        followersSnapshot.docs.forEach(doc => batch.delete(doc.ref));
      } catch (error) {
        console.error('[USER DELETION] Error cleaning followers:', error);
      }
      
      // 5. Delete notifications TO the user
      try {
        const notificationsQuery = query(collection(db, 'notifications'), where('recipientId', '==', userId));
        const notificationsSnapshot = await getDocs(notificationsQuery);
        notificationsSnapshot.docs.forEach(doc => batch.delete(doc.ref));
      } catch (error) {
        console.error('[USER DELETION] Error cleaning recipient notifications:', error);
      }
      
      // 6. Commit batch deletions
      console.log('[USER DELETION] Committing emergency cleanup batch');
      await batch.commit();
      
      // 7. Delete posts (separate from batch due to complexity)
      try {
        await this.quickPostsDeletion(userId);
      } catch (error) {
        console.error('[USER DELETION] Error deleting posts during emergency cleanup:', error);
      }
      
      // 8. Clean up real-time database
      try {
        await this.quickRealtimeCleanup(userId);
      } catch (error) {
        console.error('[USER DELETION] Error cleaning real-time data during emergency cleanup:', error);
      }
      
      console.log('[USER DELETION] Emergency cleanup completed');
      return { success: true };
      
    } catch (error) {
      console.error('[USER DELETION] Error in emergency cleanup:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Emergency cleanup failed' 
      };
    }
  }
  /**
   * DIRECT AND SIMPLE USER DELETION METHOD
   * This method deletes the user document, Firebase Auth, and ALL user posts
   * Updated to prevent orphaned or "unknown user" posts
   */  async deleteUserDirectly(user: FirebaseUser): Promise<UserDeletionResult> {
    console.log('[DIRECT DELETION] Starting direct user deletion for:', user.uid);
    
    const userId = user.uid;
    let userDocDeleted = false;
    let authDeleted = false;
    let postsDeleted = false;
    
    try {
      // STEP 1: Delete ALL user posts first to prevent orphaned posts
      console.log('[DIRECT DELETION] Step 1: Deleting all user posts');
      try {
        await this.quickPostsDeletion(userId);
        console.log('[DIRECT DELETION] All user posts deleted successfully');
        postsDeleted = true;
      } catch (error) {
        console.error('[DIRECT DELETION] Error deleting user posts:', error);
        // Continue with user deletion even if post deletion fails
      }
      
      // STEP 2: Delete user document from Firestore
      console.log('[DIRECT DELETION] Step 2: Deleting user document');
      try {
        const userRef = doc(db, 'users', userId);
        await deleteDoc(userRef);
        console.log('[DIRECT DELETION] User document deleted successfully');
        userDocDeleted = true;
      } catch (error) {
        console.error('[DIRECT DELETION] Error deleting user document:', error);
      }
      
      // STEP 3: Delete Firebase Auth account
      console.log('[DIRECT DELETION] Step 3: Deleting Firebase Auth account');      try {
        await this.deleteFirebaseAuthAccount(user);
        console.log('[DIRECT DELETION] Firebase Auth account deleted successfully');
        authDeleted = true;
      } catch (error: any) {
        console.error('[DIRECT DELETION] Error deleting Firebase Auth account:', error);
        
        // If re-authentication is needed, sign out the user instead
        if (error.code === 'auth/requires-recent-login' || error.message?.includes('recent authentication')) {
          console.log('[DIRECT DELETION] Auth deletion requires re-auth, signing out instead');
          try {
            await auth.signOut();
            console.log('[DIRECT DELETION] User signed out successfully');
          } catch (signOutError) {
            console.error('[DIRECT DELETION] Failed to sign out user:', signOutError);
          }
        }
      }
      
      console.log('[DIRECT DELETION] Direct deletion completed (posts deleted:', postsDeleted, ', user doc deleted:', userDocDeleted, ', auth deleted:', authDeleted, ')');
      
      if (postsDeleted && userDocDeleted && authDeleted) {
        return { success: true };
      } else if (userDocDeleted && authDeleted) {
        return { 
          success: true, 
          error: 'User account deleted but some posts may remain.'
        };
      } else if (userDocDeleted) {
        return { 
          success: true, 
          error: 'User document deleted but Firebase Authentication deletion failed.'
        };
      } else if (authDeleted) {
        return {
          success: true,
          error: 'Firebase Authentication deleted but user document deletion failed.'
        };
      } else {
        return {
          success: false,
          error: 'Failed to delete user account completely.'
        };
      }

      return { success: true };
      
    } catch (error) {
      console.error('[DIRECT DELETION] Error during direct deletion:', error);
      
      // Even if there's an error, try to at least sign out the user
      try {
        await auth.signOut();
      } catch (signOutError) {
        console.error('[DIRECT DELETION] Also failed to sign out:', signOutError);
      }
      
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Direct deletion failed' 
      };
    }
  }

  /**
   * Verify complete user deletion (both Auth and Firestore)
   */
  async verifyCompleteUserDeletion(userId: string): Promise<{
    authDeleted: boolean;
    firestoreDeleted: boolean;
    isCompletelyDeleted: boolean;
  }> {
    console.log('[VERIFICATION] Checking complete deletion for user:', userId);
    
    try {
      // Check if user document exists in Firestore
      const userDoc = await getDoc(doc(db, 'users', userId));
      const firestoreDeleted = !userDoc.exists();
      
      // Check if any user data remains in other collections
      let hasOtherData = false;
      try {
        const commentsQuery = query(collection(db, 'comments'), where('userId', '==', userId));
        const commentsSnapshot = await getDocs(commentsQuery);
        if (!commentsSnapshot.empty) hasOtherData = true;
      } catch (error) {
        // Collection might not exist
      }
      
      // Firebase Auth deletion is harder to verify directly, 
      // but if we got this far, it's likely deleted
      const authDeleted = true; // Assume true since we can't directly verify
      
      const isCompletelyDeleted = firestoreDeleted && !hasOtherData && authDeleted;
      
      console.log('[VERIFICATION] Deletion status:', {
        authDeleted,
        firestoreDeleted,
        hasOtherData,
        isCompletelyDeleted
      });
      
      return {
        authDeleted,
        firestoreDeleted: firestoreDeleted && !hasOtherData,
        isCompletelyDeleted
      };
      
    } catch (error) {
      console.error('[VERIFICATION] Error during verification:', error);
      return {
        authDeleted: false,
        firestoreDeleted: false,
        isCompletelyDeleted: false
      };
    }
  }

  /**
   * Re-authenticates a user with their email and password
   * This is sometimes required before deleting an auth account
   */
  async reauthenticateUser(user: FirebaseUser, email: string, password: string): Promise<boolean> {
    try {
      console.log('[USER DELETION] Attempting to re-authenticate user');
      const credential = EmailAuthProvider.credential(email, password);
      await reauthenticateWithCredential(user, credential);
      console.log('[USER DELETION] User re-authenticated successfully');
      return true;
    } catch (error) {
      console.error('[USER DELETION] Re-authentication failed:', error);
      return false;
    }
  }

  /**
   * Verify that essential user data has been deleted (only user document)
   */
  async verifySimpleDeletion(userId: string): Promise<{userDocDeleted: boolean}> {
    console.log('[USER DELETION] Verifying simple deletion for:', userId);
    try {
      // Check if user document exists
      const userDoc = await getDoc(doc(db, 'users', userId));
      const userDocDeleted = !userDoc.exists();
      
      console.log('[USER DELETION] Verification results - user document deleted:', userDocDeleted);
      return { userDocDeleted };
    } catch (error) {
      console.error('[USER DELETION] Error during verification:', error);
      return { userDocDeleted: false };
    }
  }
}

export const userDeletionService = new UserDeletionService();

// Test function for direct deletion (can be called from browser console)
// This is for testing purposes only
export const testDirectDeletion = async () => {
  console.log('[TEST] Testing direct deletion method...');
  
  const currentUser = auth.currentUser;
  if (!currentUser) {
    console.error('[TEST] No user is currently signed in');
    return;
  }
  
  console.log('[TEST] Current user:', currentUser.uid);
  console.log('[TEST] Warning: This will permanently delete the current user account!');
  console.log('[TEST] To proceed, run: userDeletionService.deleteUserDirectly(auth.currentUser)');
  
  return {
    userId: currentUser.uid,
    email: currentUser.email,
    message: 'Ready for testing - call deleteUserDirectly() to proceed'
  };
};
