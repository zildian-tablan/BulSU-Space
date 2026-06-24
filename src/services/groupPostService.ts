import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  orderBy, 
  where, 
  limit, 
  serverTimestamp,
  onSnapshot,
  Timestamp
} from 'firebase/firestore';
import { 
  ref, 
  uploadBytes, 
  getDownloadURL, 
  deleteObject
} from 'firebase/storage';
import { v4 as uuidv4 } from 'uuid';
import { db, storage } from '../firebase/config';
import { Post } from '../models/Post';
import { isGroupMember } from './groupService';

// Collection paths
const GROUP_POSTS_COLLECTION = 'group_posts';
const USERS_COLLECTION = 'users';

export interface GroupPost {
  id: string;
  content: string;
  userId: string;
  userName: string;
  userRole: string;
  userProfilePic?: string;
  groupId: string;
  images?: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
  commentCount: number;
  reactionCount: number;
  reactions: Record<string, string[]>; // emotion -> userIds
  visibility: 'group'; // Group posts are always group-visible only
}

/**
 * Create a new post in a group
 */
export const createGroupPost = async (
  content: string,
  userId: string,
  groupId: string,
  images?: File[]
): Promise<string> => {
  try {
    // Verify user is a member of the group
    const isMember = await isGroupMember(userId, groupId);    if (!isMember) {
      throw new Error('You must be a member of this space to post');
    }

    // Get user details
    const userDoc = await getDoc(doc(db, USERS_COLLECTION, userId));
    if (!userDoc.exists()) {
      throw new Error('User not found');
    }
    
    const userData = userDoc.data();
    
    let imageUrls: string[] = [];
    
    // Upload images if provided
    if (images && images.length > 0) {
      const uploadPromises = images.map(async (image) => {
        const imageId = uuidv4();
        const imageRef = ref(storage, `group_posts/${imageId}_${image.name}`);
        
        await uploadBytes(imageRef, image);
        return await getDownloadURL(imageRef);
      });
      
      imageUrls = await Promise.all(uploadPromises);
    }
      // Create the post document
    const postData: any = {
      content,
      userId,
      userName: userData.name || 'Unknown User',
      userRole: userData.role || 'student',
      userProfilePic: userData.profile_pic,
      groupId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      commentCount: 0,
      reactionCount: 0,
      reactions: {},
      visibility: 'group'
    };

    // Only add images field if there are actual images
    if (imageUrls.length > 0) {
      postData.images = imageUrls;
    }
    
    const postRef = await addDoc(collection(db, GROUP_POSTS_COLLECTION), postData);
    return postRef.id;
  } catch (error) {
    console.error('Error creating group post:', error);
    throw error;
  }
};

/**
 * Get posts for a specific group
 */
export const getGroupPosts = async (
  groupId: string,
  userId: string,
  limitCount: number = 20
): Promise<Post[]> => {
  try {
    // Verify user is a member of the group
    const isMember = await isGroupMember(userId, groupId);    if (!isMember) {
      throw new Error('You must be a member of this space to view posts');
    }

    const postsQuery = query(
      collection(db, GROUP_POSTS_COLLECTION),
      where('groupId', '==', groupId),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );
      const snapshot = await getDocs(postsQuery);
    const posts: Post[] = [];
    
    snapshot.forEach((doc) => {
      const data = doc.data();
      posts.push({
        id: doc.id,
        content: data.content,
        userId: data.userId,
        userName: data.userName,
        userRole: data.userRole,
        userProfilePic: data.userProfilePic || '',
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
        commentCount: data.commentCount || 0,
        reactionCount: data.reactionCount || 0,
        media: (data.images || []).map((url: string) => ({ type: 'image' as const, url, name: 'image' })),
        mediaUrls: data.images || [],
        visibility: 'group',
        isPinned: false,
        isEdited: false,
        viewCount: 0,
        tags: []
      } as Post);
    });
    
    return posts;
  } catch (error) {
    console.error('Error getting group posts:', error);
    throw error;
  }
};

/**
 * Get real-time updates for group posts
 */
export const getGroupPostsRealtime = (
  groupId: string,
  onPostsUpdate: (posts: Post[]) => void
): (() => void) => {
  try {
    const postsQuery = query(
      collection(db, GROUP_POSTS_COLLECTION),
      where('groupId', '==', groupId),
      orderBy('createdAt', 'desc')
    );
    
    const unsubscribe = onSnapshot(postsQuery, (snapshot) => {
      const posts: Post[] = [];
        snapshot.forEach((doc) => {
        const data = doc.data();
        posts.push({
          id: doc.id,
          content: data.content,
          userId: data.userId,
          userName: data.userName,
          userRole: data.userRole,
          userProfilePic: data.userProfilePic || '',
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
          commentCount: data.commentCount || 0,
          reactionCount: data.reactionCount || 0,
          reactions: data.reactions || {},
          media: (data.images || []).map((url: string) => ({ type: 'image' as const, url, name: 'image' })),
          mediaUrls: data.images || [],
          visibility: 'group',
          isPinned: false,
          isEdited: false,
          viewCount: 0,
          tags: []
        } as Post);
      });
      
      onPostsUpdate(posts);
    });
    
    return unsubscribe;
  } catch (error) {
    console.error('Error setting up group posts listener:', error);
    throw error;
  }
};

/**
 * Delete a group post
 */
export const deleteGroupPost = async (
  postId: string,
  userId: string
): Promise<void> => {
  try {
    // Get the post to verify ownership and get group info
    const postDoc = await getDoc(doc(db, GROUP_POSTS_COLLECTION, postId));
    
    if (!postDoc.exists()) {
      throw new Error('Post not found');
    }
    
    const postData = postDoc.data();
    
    // Check if user is the post author or a group admin
    if (postData.userId !== userId) {
      // TODO: Check if user is group admin
      // For now, only allow post author to delete
      throw new Error('You can only delete your own posts');
    }
    
    // Delete associated images from storage
    if (postData.images && postData.images.length > 0) {
      const deletePromises = postData.images.map(async (imageUrl: string) => {
        try {
          const imageRef = ref(storage, imageUrl);
          await deleteObject(imageRef);
        } catch (error) {
          console.warn('Error deleting image:', error);
          // Continue with post deletion even if image deletion fails
        }
      });
      
      await Promise.all(deletePromises);
    }
    
    // Delete the post document
    await deleteDoc(doc(db, GROUP_POSTS_COLLECTION, postId));
  } catch (error) {
    console.error('Error deleting group post:', error);
    throw error;
  }
};

/**
 * Update reaction on a group post
 */
export const updateGroupPostReaction = async (
  postId: string,
  userId: string,
  emotion: string
): Promise<void> => {
  try {
    const postRef = doc(db, GROUP_POSTS_COLLECTION, postId);
    const postDoc = await getDoc(postRef);
    
    if (!postDoc.exists()) {
      throw new Error('Post not found');
    }
    
    const postData = postDoc.data();
    const currentReactions = postData.reactions || {};
    
    // Remove user from all emotion arrays first
    Object.keys(currentReactions).forEach(key => {
      currentReactions[key] = currentReactions[key].filter((id: string) => id !== userId);
    });
      // Add user to the new emotion array
    if (!currentReactions[emotion]) {
      currentReactions[emotion] = [];
    }
    currentReactions[emotion].push(userId);
    
    // Calculate total reaction count
    const reactionCount = Object.values(currentReactions).reduce(
      (total: number, userIds) => total + (userIds as string[]).length, 
      0
    );
    
    await updateDoc(postRef, {
      reactions: currentReactions,
      reactionCount,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    console.error('Error updating group post reaction:', error);
    throw error;
  }
};

/**
 * Remove reaction from a group post
 */
export const removeGroupPostReaction = async (
  postId: string,
  userId: string
): Promise<void> => {
  try {
    const postRef = doc(db, GROUP_POSTS_COLLECTION, postId);
    const postDoc = await getDoc(postRef);
    
    if (!postDoc.exists()) {
      throw new Error('Post not found');
    }
    
    const postData = postDoc.data();
    const currentReactions = postData.reactions || {};
    
    // Remove user from all emotion arrays
    Object.keys(currentReactions).forEach(key => {
      currentReactions[key] = currentReactions[key].filter((id: string) => id !== userId);
    });
      // Calculate total reaction count
    const reactionCount = Object.values(currentReactions).reduce(
      (total: number, userIds) => total + (userIds as string[]).length, 
      0
    );
    
    await updateDoc(postRef, {
      reactions: currentReactions,
      reactionCount,    updatedAt: serverTimestamp()
    });
  } catch (error) {
    console.error('Error removing group post reaction:', error);
    throw error;
  }
};
