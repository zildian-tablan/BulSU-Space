import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  addDoc, 
  updateDoc,
  setDoc,
  deleteDoc, 
  query, 
  where, 
  orderBy,
  limit,
  serverTimestamp,
  Timestamp,
  increment,
  DocumentData
} from 'firebase/firestore';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut, 
  updateProfile 
} from 'firebase/auth';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, auth, storage } from './config';
import { User, UserRole } from '../contexts/AuthContext';
import { Post, Comment } from '../types';

// Authentication Services
export const authService = {
  // Register a new user
  async register(email: string, password: string, name: string, idNumber: string, role: UserRole) {
    // Create user in Firebase Auth
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    
    // Update profile with display name
    await updateProfile(user, {
      displayName: name
    });
    
    // Create user document in Firestore
    const profilePic = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=0D8ABC&color=fff`;
    
    await userService.createUserProfile(user.uid, {
      email,
      name,
      idNumber,
      role,
      profile_pic: profilePic,
      isNewUser: true // Set as new user to show terms modal
    });
    
    return user;
  },
  
  // Sign in existing user
  async login(email: string, password: string) {
    return signInWithEmailAndPassword(auth, email, password);
  },
  
  // Sign out
  async logout() {
    return signOut(auth);
  },
  
  // Get current user
  getCurrentUser() {
    return auth.currentUser;
  }
};

// User Services
export const userService = {
  // Create user profile in Firestore
  async createUserProfile(userId: string, userData: Omit<User, 'id'>) {
    const userRef = doc(db, 'users', userId);
    await setDoc(userRef, {
      ...userData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  },
  
  // Get user profile by ID
  async getUserProfile(userId: string): Promise<User | null> {
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
      return null;
    }
    
    const userData = userDoc.data();
    return {
      id: userDoc.id,
      email: userData.email,
      name: userData.name,
      idNumber: userData.idNumber,
      role: userData.role as UserRole,
      profile_pic: userData.profile_pic
    };
  },
  
  // Update user profile
  async updateUserProfile(userId: string, userData: Partial<Omit<User, 'id'>>) {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      ...userData,
      updatedAt: serverTimestamp()
    });
  },
  
  // Get all users
  async getAllUsers(): Promise<User[]> {
    const usersRef = collection(db, 'users');
    const usersSnapshot = await getDocs(usersRef);
    
    return usersSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        email: data.email,
        name: data.name,
        idNumber: data.idNumber,
        role: data.role as UserRole,
        profile_pic: data.profile_pic
      };
    });
  }
};

// Post Services
export const postService = {
  // Create a new post
  async createPost(post: Omit<Post, 'id' | 'user_name' | 'user_role' | 'user_profile_pic' | 'comments'>): Promise<string> {
    const postsRef = collection(db, 'posts');
    const postData = {
      ...post,
      created_at: serverTimestamp(),
      comments: 0
    };
    
    const docRef = await addDoc(postsRef, postData);
    return docRef.id;
  },
  
  // Get all posts
  async getAllPosts(): Promise<Post[]> {
    const postsRef = collection(db, 'posts');
    const q = query(postsRef, orderBy('created_at', 'desc'));
    const postsSnapshot = await getDocs(q);
    
    const posts: Post[] = [];
    
    for (const postDoc of postsSnapshot.docs) {
      const postData = postDoc.data();
      
      // Get user data
      const userRef = doc(db, 'users', postData.user_id);
      const userDoc = await getDoc(userRef);
      const userData = userDoc.exists() ? userDoc.data() : null;
      
      // Get comments
      const commentsRef = collection(db, 'posts', postDoc.id, 'comments');
      const commentsQuery = query(commentsRef, orderBy('created_at', 'asc'));
      const commentsSnapshot = await getDocs(commentsQuery);
      
      const comments: Comment[] = [];
      
      for (const commentDoc of commentsSnapshot.docs) {
        const commentData = commentDoc.data();
        
        // Get comment user data
        const commentUserRef = doc(db, 'users', commentData.user_id);
        const commentUserDoc = await getDoc(commentUserRef);
        const commentUserData = commentUserDoc.exists() ? commentUserDoc.data() : null;
        
        comments.push({
          id: parseInt(commentDoc.id),
          post_id: parseInt(postDoc.id),
          user_id: parseInt(commentData.user_id),
          user_name: commentUserData?.name || 'Unknown User',
          user_profile_pic: commentUserData?.profile_pic || '',
          content: commentData.content,
          created_at: (commentData.created_at as Timestamp).toDate().toISOString()
        });
      }
      
      posts.push({
        id: parseInt(postDoc.id),
        user_id: parseInt(postData.user_id),
        user_name: userData?.name || 'Unknown User',
        user_role: userData?.role || 'student',
        user_profile_pic: userData?.profile_pic || '',
        content: postData.content,
        attachments: postData.attachments,
        type: postData.type,
        likes: postData.likes || 0,
        shares: postData.shares || 0,
        comments: comments,
        created_at: (postData.created_at as Timestamp).toDate().toISOString()
      });
    }
    
    return posts;
  },
  
  // Get post by ID
  async getPostById(postId: string): Promise<Post | null> {
    const postRef = doc(db, 'posts', postId);
    const postDoc = await getDoc(postRef);
    
    if (!postDoc.exists()) {
      return null;
    }
    
    const postData = postDoc.data();
    
    // Get user data
    const userRef = doc(db, 'users', postData.user_id);
    const userDoc = await getDoc(userRef);
    const userData = userDoc.exists() ? userDoc.data() : null;
    
    // Get comments
    const commentsRef = collection(db, 'posts', postDoc.id, 'comments');
    const commentsQuery = query(commentsRef, orderBy('created_at', 'asc'));
    const commentsSnapshot = await getDocs(commentsQuery);
    
    const comments: Comment[] = [];
    
    for (const commentDoc of commentsSnapshot.docs) {
      const commentData = commentDoc.data();
      
      // Get comment user data
      const commentUserRef = doc(db, 'users', commentData.user_id);
      const commentUserDoc = await getDoc(commentUserRef);
      const commentUserData = commentUserDoc.exists() ? commentUserDoc.data() : null;
      
      comments.push({
        id: parseInt(commentDoc.id),
        post_id: parseInt(postDoc.id),
        user_id: parseInt(commentData.user_id),
        user_name: commentUserData?.name || 'Unknown User',
        user_profile_pic: commentUserData?.profile_pic || '',
        content: commentData.content,
        created_at: (commentData.created_at as Timestamp).toDate().toISOString()
      });
    }
    
    return {
      id: parseInt(postDoc.id),
      user_id: parseInt(postData.user_id),
      user_name: userData?.name || 'Unknown User',
      user_role: userData?.role || 'student',
      user_profile_pic: userData?.profile_pic || '',
      content: postData.content,
      attachments: postData.attachments,
      type: postData.type,
      likes: postData.likes || 0,
      shares: postData.shares || 0,
      comments: comments,
      created_at: (postData.created_at as Timestamp).toDate().toISOString()
    };
  },
  
  // Update a post
  async updatePost(postId: string, postData: Partial<Post>): Promise<void> {
    const postRef = doc(db, 'posts', postId);
    await updateDoc(postRef, {
      ...postData,
      updated_at: serverTimestamp()
    });
  },
  
  // Delete a post
  async deletePost(postId: string): Promise<void> {
    const postRef = doc(db, 'posts', postId);
    await deleteDoc(postRef);
  },
  
  // Like a post
  async likePost(postId: string, userId: string): Promise<void> {
    const postRef = doc(db, 'posts', postId);
    const likeRef = doc(db, 'posts', postId, 'likes', userId);
    const likeDoc = await getDoc(likeRef);
    
    if (likeDoc.exists()) {
      // User already liked the post, remove the like
      await deleteDoc(likeRef);
      await updateDoc(postRef, {
        likes: increment(-1)
      });
    } else {
      // User hasn't liked the post yet, add the like
      await updateDoc(likeRef, {
        user_id: userId,
        created_at: serverTimestamp()
      });
      await updateDoc(postRef, {
        likes: increment(1)
      });
    }
  },
  
  // Add a comment to a post
  async addComment(postId: string, userId: string, content: string): Promise<string> {
    const commentsRef = collection(db, 'posts', postId, 'comments');
    const commentData = {
      user_id: userId,
      content,
      created_at: serverTimestamp()
    };
    
    const commentDoc = await addDoc(commentsRef, commentData);
    
    // Update comment count on post
    const postRef = doc(db, 'posts', postId);
    await updateDoc(postRef, {
      comments: increment(1)
    });
    
    return commentDoc.id;
  },
  
  // Get posts by type
  async getPostsByType(type: string): Promise<Post[]> {
    const postsRef = collection(db, 'posts');
    const q = query(
      postsRef, 
      where('type', '==', type),
      orderBy('created_at', 'desc')
    );
    const postsSnapshot = await getDocs(q);
    
    const posts: Post[] = [];
    
    for (const postDoc of postsSnapshot.docs) {
      const postData = postDoc.data();
      
      // Get user data
      const userRef = doc(db, 'users', postData.user_id);
      const userDoc = await getDoc(userRef);
      const userData = userDoc.exists() ? userDoc.data() : null;
      
      posts.push({
        id: parseInt(postDoc.id),
        user_id: parseInt(postData.user_id),
        user_name: userData?.name || 'Unknown User',
        user_role: userData?.role || 'student',
        user_profile_pic: userData?.profile_pic || '',
        content: postData.content,
        attachments: postData.attachments,
        type: postData.type,
        likes: postData.likes || 0,
        shares: postData.shares || 0,
        comments: [],
        created_at: (postData.created_at as Timestamp).toDate().toISOString()
      });
    }
    
    return posts;
  }
};

// File Upload Service
export const fileService = {
  // Upload a file to Firebase Storage
  async uploadFile(file: File, path: string): Promise<string> {
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, file);
    return getDownloadURL(storageRef);
  }
};
