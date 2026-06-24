import { doc, getDoc, updateDoc, collection, query, where, getDocs, onSnapshot, orderBy, limit, setDoc, startAfter, QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';
import { db, rtdb } from '../firebase/config';
import { User, Department } from '../contexts/AuthContext';
import { Post } from '../models/Post';
import { ref, onValue } from 'firebase/database';
// Friendship removed; keep a local no-op for compatibility if referenced
const checkFriendRequestExists = async (_a: string, _b: string) => null;

/**
 * Map faculty department field to department code
 * @param departmentField The department field from user document (string)
 * @returns Department code (POSHED, SHATMO, FIPO, AFEA) or undefined
 */
export function mapFacultyDepartmentToCode(departmentField?: string): Department | undefined {
  if (!departmentField) return undefined;
  const value = departmentField.trim().toUpperCase();
  if (value === 'BSIT') return 'POSHED';
  if (value === 'BIT') return 'FIPO';
  if (value === 'BSTM' || value === 'BSHM') return 'SHATMO';
  if (value === 'BSED' || value === 'BEED' || value === 'BTLED') return 'AFEA';
  // fallback: if already a code, return as is
  if ([ 'POSHED', 'SHATMO', 'FIPO', 'AFEA' ].includes(value)) return value as Department;
  return undefined;
}

// Re-export UserStatus interface for network-based user status
export interface UserStatus {
  state: 'online' | 'offline';
  lastActive: number;
}

const USERS_COLLECTION = 'users';
const POSTS_COLLECTION = 'posts';
const BLOCKED_USERS_COLLECTION = 'blocked_users';

// Block relationship document shape
type BlockDoc = {
  blockerUid: string;
  blockedUserUid: string;
  isBlocked: boolean;
  updatedAt?: any;
};

/**
 * Get user profile by ID
 */
export const getUserProfile = async (userId: string): Promise<User | null> => {
  try {
    const userRef = doc(db, USERS_COLLECTION, userId);
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
      return null;
    }
    
    const userData = userDoc.data();
    return {
      id: userDoc.id,
      email: userData.email || '',
      name: userData.name || '',
      idNumber: userData.idNumber || '',
      role: userData.role || 'student',
      profile_pic: userData.profile_pic,
      department: userData.department,
      gender: userData.gender,
      birthday: userData.birthday,
      yearSection: userData.yearSection,
      coverPhoto: userData.coverPhoto,
      graduationBatch: userData.graduationBatch,
      office: userData.office // Add office field
    } as User;
  } catch (error) {
    console.error('Error getting user profile:', error);
    throw error;
  }
};

/**
 * Update user profile
 */
export const updateUserProfile = async (
  userId: string, 
  profileData: Partial<Omit<User, 'id' | 'role'>>
): Promise<User> => {
  try {
    const userRef = doc(db, USERS_COLLECTION, userId);
    await updateDoc(userRef, profileData);
    
    // Get the updated user data
    const updatedUserDoc = await getDoc(userRef);
    if (!updatedUserDoc.exists()) {
      throw new Error('User not found after update');
    }
    
    const userData = updatedUserDoc.data();
    return {
      id: updatedUserDoc.id,
      email: userData.email || '',
      name: userData.name || '',
      idNumber: userData.idNumber || '',
      role: userData.role || 'student',
      profile_pic: userData.profile_pic,
      department: userData.department,
      gender: userData.gender,
      birthday: userData.birthday,
      yearSection: userData.yearSection,
      coverPhoto: userData.coverPhoto,
      graduationBatch: userData.graduationBatch,
      office: userData.office // Add office field
    } as User;
  } catch (error) {
    console.error('Error updating user profile:', error);
    throw error;
  }
};

/**
 * Get user posts
 */
export const getUserPosts = async (userId: string): Promise<Post[]> => {
  try {
    const postsQuery = query(
      collection(db, POSTS_COLLECTION),
      where('userId', '==', userId)
    );
    
    const postsSnapshot = await getDocs(postsQuery);
    const posts: Post[] = [];
    
    postsSnapshot.forEach((doc) => {
      posts.push({ id: doc.id, ...doc.data() } as Post);
    });
    
    // Sort by creation date (newest first)
    return posts.sort((a, b) => {
      const dateA = a.createdAt?.toDate() || new Date();
      const dateB = b.createdAt?.toDate() || new Date();
      return dateB.getTime() - dateA.getTime();
    });
  } catch (error) {
    console.error('Error getting user posts:', error);
    throw error;
  }
};

// Helper for merging and deduplicating posts
function mergeAndCallbackFactory(callback: (posts: Post[]) => void, sortByDate: boolean, limitCount?: number) {
  let latestAuthored: Post[] = [];
  let latestTagged: Post[] = [];
  return function mergeAndCallback(authored?: Post[], tagged?: Post[]) {
    if (authored) latestAuthored = authored;
    if (tagged) latestTagged = tagged;
    // Merge and deduplicate by post id
    const allPostsMap = new Map<string, Post>();
    latestAuthored.forEach(p => allPostsMap.set(p.id, p));
    latestTagged.forEach(p => allPostsMap.set(p.id, p));
    let allPosts = Array.from(allPostsMap.values());
    // Sort by date (newest first)
    if (sortByDate) {
      allPosts.sort((a, b) => {
        const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date();
        const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date();
        return dateB.getTime() - dateA.getTime();
      });
    }
    // If we have a limit, enforce it after sorting
    const limitedPosts = limitCount && limitCount > 0 
      ? allPosts.slice(0, limitCount) 
      : allPosts;
    callback(limitedPosts);
  };
}

/**
 * Get user posts with real-time updates
 * @param userId User ID to get posts for
 * @param callback Function to call with updated posts
 * @param sortByDate Whether to sort posts by date (newest first)
 * @param limitCount Optional limit on the number of posts to retrieve
 * @returns Unsubscribe function to stop listening for updates
 */
export const getUserPostsRealtime = (
  userId: string,
  callback: (posts: Post[]) => void,
  sortByDate: boolean = true,
  limitCount?: number
): (() => void) => {
  try {
    // Query for posts authored by the user
    let postsQuery = query(
      collection(db, POSTS_COLLECTION),
      where('userId', '==', userId)
    );
    // Query for posts where the user is tagged
    let taggedQuery = query(
      collection(db, POSTS_COLLECTION),
      where('taggedFriends', 'array-contains', userId)
    );
    // Apply limit if provided (to both queries)
    if (limitCount && limitCount > 0) {
      postsQuery = query(postsQuery, limit(limitCount));
      taggedQuery = query(taggedQuery, limit(limitCount));
    }
    // Use the factory to get a mergeAndCallback function with closure state
    const mergeAndCallback = mergeAndCallbackFactory(callback, sortByDate, limitCount);
    // Listen to both queries
    const unsub1 = onSnapshot(postsQuery, (snapshot1) => {
      const posts: Post[] = [];
      snapshot1.forEach((doc) => {
        posts.push({ id: doc.id, ...doc.data() } as Post);
      });
      mergeAndCallback(posts);
    });
    const unsub2 = onSnapshot(taggedQuery, (snapshot2) => {
      const taggedPosts: Post[] = [];
      snapshot2.forEach((doc) => {
        taggedPosts.push({ id: doc.id, ...doc.data() } as Post);
      });
      mergeAndCallback(undefined, taggedPosts);
    });
    // Return unsubscribe for both listeners
    return () => { unsub1(); unsub2(); };
  } catch (error) {
    console.error('Error setting up real-time posts listener:', error);
    return () => {}; // Return empty function in case of error
  }
};

// --- NETWORK: Get user online status in real time using network service ---
export const getUserStatusRealtime = (
  userId: string,
  callback: (status: UserStatus | null) => void
) => {
  try {
    console.log(`[userService] Setting up network status listener for user ${userId}`);
    // Reference to the user's status in the realtime database
    const userStatusRef = ref(rtdb, `status/${userId}`);
    
    // Track connection state
    let hasReceivedData = false;
    let retryTimeout: NodeJS.Timeout | null = null;
    
    // Subscribe to changes using onValue
    const unsubscribe = onValue(userStatusRef, (snapshot) => {
      hasReceivedData = true;
      
      // Clear any pending retry
      if (retryTimeout) {
        clearTimeout(retryTimeout);
        retryTimeout = null;
      }
      
      const status = snapshot.exists() ? snapshot.val() : null;
      
      if (status) {
        console.log(`[userService] Raw status data for ${userId}:`, status);
        callback({
          state: status.state || 'offline',
          lastActive: status.lastActive || Date.now()
        });
      } else {
        console.log(`[userService] No status data found for ${userId}`);
        callback(null);
      }
    }, (error: any) => {
      console.error(`[userService] Error getting status for user ${userId}:`, error);
      
      // Check if this is a connection-related error
      if (error.code === 'PERMISSION_DENIED' || 
          error.code === 'NETWORK_ERROR' ||
          error.message?.includes('network') ||
          error.message?.includes('offline')) {
        
        console.log(`[userService] Network/permission error for ${userId}, will retry...`);
        
        // Set up a retry mechanism if we haven't received any data yet
        if (!hasReceivedData) {
          retryTimeout = setTimeout(() => {
            console.log(`[userService] Retrying status subscription for ${userId}`);
            // Return null for now, but keep the subscription alive
            callback(null);
          }, 5000);
        }
      }
      
      callback(null);
    });
    
    // Return enhanced unsubscribe function that cleans up retry timeout
    return () => {
      if (retryTimeout) {
        clearTimeout(retryTimeout);
      }
      unsubscribe();
    };
  } catch (error) {
    console.error(`[userService] Exception in getUserStatusRealtime for ${userId}:`, error);
    // Return a no-op function as fallback
    return () => {};
  }
};

export const getMultipleUserStatusesRealtime = (
  userIds: string[],
  callback: (statuses: Record<string, UserStatus | null>) => void
) => {
  if (!userIds.length) {
    callback({});
    return () => {};
  }
  
  try {
    console.log(`[userService] Setting up network status listeners for ${userIds.length} users`);
    const statuses: Record<string, UserStatus | null> = {};
    const unsubscribeFunctions: (() => void)[] = [];
    
    // Set up listeners for each user
    userIds.forEach(userId => {
      const unsubscribe = getUserStatusRealtime(userId, (status) => {
        statuses[userId] = status;
        callback({...statuses});
      });
      
      unsubscribeFunctions.push(unsubscribe);
    });
    
    // Return a function that unsubscribes all listeners
    return () => {
      unsubscribeFunctions.forEach(unsubscribe => unsubscribe());
    };
  } catch (error) {
    console.error('[userService] Error in getMultipleUserStatusesRealtime:', error);
    return () => {};
  }
};

/**
 * Generate initials for default profile picture
 */
export const getInitials = (name: string): string => {
  if (!name) return '?';
  
  const parts = name.trim().split(' ');
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
};

/**
 * Get department name from code
 */
export const getDepartmentName = (department: Department | undefined): string => {
  // Accept either a code or a raw department field
  const code = mapFacultyDepartmentToCode(department as string);
  switch (code) {
    case 'POSHED':
    case 'AFEA':
    case 'SHATMO':
    case 'FIPO':
      return code;
    default:
      return 'Not specified';
  }
};

/**
 * Get role display name
 */
export const getRoleDisplayName = (role: string): string => {
  switch (role) {
    case 'student':
      return 'Student';
    case 'faculty':
      return 'Faculty Member';
    case 'alumni':
      return 'Alumni';
    case 'dean':
      return 'Dean';
    case 'admin':
      return 'Administrator';
    case 'super admin':
      return 'Super Admin';
    default:
      return role;
  }
};

/**
 * Search users by query. Copied from friendService to allow Navbar to search all users
 */
export const searchUsers = async (
  searchQuery: string,
  currentUserId: string,
  maxResults: number = 20
): Promise<User[]> => {
  try {
    const usersRef = collection(db, USERS_COLLECTION);
    const usersSnapshot = await getDocs(usersRef);
    
    let users: User[] = [];
    usersSnapshot.forEach((doc) => {
      // Don't include the current user in search results
      if (doc.id !== currentUserId) {
        const userData = doc.data();
        users.push({
          id: doc.id,
          email: userData.email || '',
          name: userData.name || '',
          idNumber: userData.idNumber || '',
          role: userData.role || 'student',
          profile_pic: userData.profile_pic,
          department: userData.department,
          gender: userData.gender,
          birthday: userData.birthday,
          yearSection: userData.yearSection,
          coverPhoto: userData.coverPhoto,
          graduationBatch: userData.graduationBatch
        } as User);
      }
    });
    
    // Filter users based on search query
    if (searchQuery) {
      const queryStr = searchQuery.toLowerCase();
      const isGraduationBatchQuery = /^\d{4}-\d{4}$/.test(searchQuery);

      users = users.filter(user => {
        const generalMatch = (user.name || '').toLowerCase().includes(queryStr) || 
          (user.email || '').toLowerCase().includes(queryStr) || 
          (user.department || '').toLowerCase().includes(queryStr) ||
          (user.idNumber || '').toLowerCase().includes(queryStr);
        const alumniMatch = user.role === 'alumni' && user.graduationBatch && (
          user.graduationBatch.toLowerCase().includes(queryStr) ||
          (isGraduationBatchQuery && user.graduationBatch.toLowerCase() === searchQuery.toLowerCase())
        );
        return generalMatch || alumniMatch;
      });

      if (isGraduationBatchQuery) {
        const hasExactMatches = users.some(u => u.role === 'alumni' && u.graduationBatch && u.graduationBatch.toLowerCase() === searchQuery.toLowerCase());
        if (!hasExactMatches) {
          // include all alumni if no exact matches
          const allAlumni = users.filter(u => u.role === 'alumni');
          users = [...users, ...allAlumni.filter(a => !users.some(u => u.id === a.id))];
        }

        users.sort((a, b) => {
          const aExactMatch = a.role === 'alumni' && a.graduationBatch && a.graduationBatch.toLowerCase() === searchQuery.toLowerCase();
          const bExactMatch = b.role === 'alumni' && b.graduationBatch && b.graduationBatch.toLowerCase() === searchQuery.toLowerCase();
          const aIsAlumni = a.role === 'alumni';
          const bIsAlumni = b.role === 'alumni';
          if (aExactMatch && !bExactMatch) return -1;
          if (!aExactMatch && bExactMatch) return 1;
          if (aIsAlumni && !bIsAlumni) return -1;
          if (!aIsAlumni && bIsAlumni) return 1;
          return 0;
        });
      }
    }

    return users.slice(0, maxResults);
  } catch (error) {
    console.error('Error searching users:', error);
    throw error;
  }
};

/**
 * Search specifically for alumni by graduation batch
 */
export const searchAlumniByBatch = async (
  batchQuery: string,
  currentUserId: string,
  maxResults: number = 20
): Promise<User[]> => {
  try {
    const usersRef = collection(db, USERS_COLLECTION);
    const usersSnapshot = await getDocs(usersRef);
    
    let users: User[] = [];
    usersSnapshot.forEach((doc) => {
      if (doc.id !== currentUserId) {
        const userData = doc.data();
        if (userData.role === 'alumni') {
          users.push({
            id: doc.id,
            email: userData.email || '',
            name: userData.name || '',
            idNumber: userData.idNumber || '',
            role: userData.role,
            profile_pic: userData.profile_pic,
            department: userData.department,
            gender: userData.gender,
            birthday: userData.birthday,
            yearSection: userData.yearSection,
            coverPhoto: userData.coverPhoto,
            graduationBatch: userData.graduationBatch
          } as User);
        }
      }
    });

    if (batchQuery && batchQuery.trim() !== '') {
      const queryStr = batchQuery.toLowerCase();
      const isExactBatchFormat = /^\d{4}-\d{4}$/.test(batchQuery);
      const exactMatches = users.filter(user => user.graduationBatch && user.graduationBatch.toLowerCase() === queryStr);
      const partialMatches = users.filter(user => user.graduationBatch && user.graduationBatch.toLowerCase().includes(queryStr) && user.graduationBatch.toLowerCase() !== queryStr);
      if (exactMatches.length > 0 || partialMatches.length > 0) {
        users = [...exactMatches, ...partialMatches];
      } else if (isExactBatchFormat) {
        // keep all alumni
      } else {
        users = [];
      }
    }

    return users.slice(0, maxResults);
  } catch (error) {
    console.error('Error searching alumni by batch:', error);
    throw error;
  }
};

/**
 * Get all users (for admin access management)
 */
export const getAllUsers = async (): Promise<User[]> => {
  const usersCol = collection(db, USERS_COLLECTION);
  const usersSnap = await getDocs(usersCol);
  return usersSnap.docs.map(docSnap => ({
    id: docSnap.id,
    ...docSnap.data()
  })) as User[];
};

export interface UserBatchResult {
  users: User[];
  lastDoc: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
}

export const fetchUsersBatch = async (options: {
  limitCount?: number;
  startAfterDoc?: QueryDocumentSnapshot<DocumentData> | null;
  excludeUserIds?: string[];
} = {}): Promise<UserBatchResult> => {
  const {
    limitCount = 20,
    startAfterDoc = null,
    excludeUserIds = []
  } = options;

  const oversample = Math.min(excludeUserIds.length, limitCount);
  const fetchLimit = Math.max(1, Math.min(limitCount + oversample, 50));

  let usersQuery = query(
    collection(db, USERS_COLLECTION),
    orderBy('name', 'asc')
  );

  if (startAfterDoc) {
    usersQuery = query(usersQuery, startAfter(startAfterDoc));
  }

  usersQuery = query(usersQuery, limit(fetchLimit));

  const snapshot = await getDocs(usersQuery);
  const filtered = snapshot.docs
    .filter(docSnap => !excludeUserIds.includes(docSnap.id))
    .map(docSnap => ({
      id: docSnap.id,
      ...docSnap.data()
    })) as User[];

  const users = filtered.slice(0, limitCount);
  const lastDoc = snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1] : null;
  const hasMore = snapshot.docs.length === fetchLimit;

  return {
    users,
    lastDoc,
    hasMore
  };
};

/**
 * Get user counts by role
 */
export const getUserCounts = async (): Promise<{
  totalAccounts: number;
  studentCount: number;
  facultyCount: number;
  alumniCount: number;
  staffCount: number;
  deanCount?: number;
  adminCount?: number;
  superAdminCount?: number;
  recentStudents?: number;
  recentFaculty?: number;
  recentAlumni?: number;
  recentStaff?: number;
}> => {
  try {
    const usersCollection = collection(db, USERS_COLLECTION);
    const usersSnapshot = await getDocs(usersCollection);
    
    let totalAccounts = 0;
    let studentCount = 0;
    let facultyCount = 0;
    let alumniCount = 0;
    let staffCount = 0;
  let deanCount = 0;
    let adminCount = 0;
    let superAdminCount = 0;
    
    // For recent activity tracking - use the last 7 days
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    
    let recentStudents = 0;
    let recentFaculty = 0;
    let recentAlumni = 0;
    let recentStaff = 0;
    
    usersSnapshot.forEach(doc => {
      const userData = doc.data();
      totalAccounts++;
      
      // Check if the account was created within the last 7 days
      const createdAt = userData.createdAt && userData.createdAt.toDate ? userData.createdAt.toDate() : null;
      const isRecent = createdAt && createdAt > oneWeekAgo;
      
      switch(userData.role) {
        case 'student':
          studentCount++;
          if (isRecent) recentStudents++;
          break;
        case 'faculty':
          facultyCount++;
          if (isRecent) recentFaculty++;
          break;
        case 'alumni':
          alumniCount++;
          if (isRecent) recentAlumni++;
          break;
        case 'staff':
          staffCount++;
          if (isRecent) recentStaff++;
          break;
        case 'dean':
          deanCount++;
          break;
        case 'admin':
          adminCount++;
          break;
        case 'super admin':
          superAdminCount++;
          break;
        default:
          // Count unknown roles in total but not in specific categories
          break;
      }
    });
    
    return {
      totalAccounts,
      studentCount,
      facultyCount,
      alumniCount,
      staffCount,
      deanCount,
      adminCount,
      superAdminCount,
      recentStudents,
      recentFaculty,
      recentAlumni,
      recentStaff
    };
  } catch (error) {
    console.error('Error getting user counts:', error);
    // Return default values in case of error
    return {
      totalAccounts: 0,
      studentCount: 0,
      facultyCount: 0,
      alumniCount: 0,
      staffCount: 0,
      deanCount: 0,
      adminCount: 0,
      superAdminCount: 0,
      recentStudents: 0,
      recentFaculty: 0,
      recentAlumni: 0,
      recentStaff: 0
    };
  }
};

/**
 * Block a user
 */
export const blockUser = async (blockerId: string, blockedUserId: string): Promise<void> => {
  try {
    if (!blockerId || !blockedUserId) {
      throw new Error('Blocker and blocked user IDs are required');
    }
    if (blockerId === blockedUserId) {
      throw new Error('Cannot block yourself');
    }

    const blockDocId = `${blockerId}_${blockedUserId}`;
    const blockRef = doc(db, BLOCKED_USERS_COLLECTION, blockDocId);
    const payload: BlockDoc = {
      blockerUid: blockerId,
      blockedUserUid: blockedUserId,
      isBlocked: true,
      updatedAt: new Date()
    };
    await setDoc(blockRef, payload);
    console.log(`User ${blockedUserId} blocked by ${blockerId}`);

    // Broadcast a global event so other features (e.g., Messaging page) can react immediately
    try {
      window.dispatchEvent(new CustomEvent('userBlockChanged', {
        detail: { blockerId, blockedUserId, isBlocked: true, at: Date.now() }
      }));
    } catch (e) {
      // no-op in non-browser environments
    }
  } catch (error) {
    console.error('Error blocking user:', error);
    throw error;
  }
};

/**
 * Unblock a user
 */
export const unblockUser = async (blockerId: string, blockedUserId: string): Promise<void> => {
  try {
    if (!blockerId || !blockedUserId) {
      throw new Error('Blocker and blocked user IDs are required');
    }
    const blockDocId = `${blockerId}_${blockedUserId}`;
    const blockRef = doc(db, BLOCKED_USERS_COLLECTION, blockDocId);
    const payload: BlockDoc = {
      blockerUid: blockerId,
      blockedUserUid: blockedUserId,
      isBlocked: false,
      updatedAt: new Date()
    };
    await setDoc(blockRef, payload);
    console.log(`User ${blockedUserId} unblocked by ${blockerId}`);

    // Broadcast a global event so other features (e.g., Messaging page) can react immediately
    try {
      window.dispatchEvent(new CustomEvent('userBlockChanged', {
        detail: { blockerId, blockedUserId, isBlocked: false, at: Date.now() }
      }));
    } catch (e) {
      // no-op in non-browser environments
    }
  } catch (error) {
    console.error('Error unblocking user:', error);
    throw error;
  }
};

/**
 * Check if a user is blocked by another user
 */
export const isUserBlocked = async (blockerId: string, potentiallyBlockedUserId: string): Promise<boolean> => {
  try {
    if (!blockerId || !potentiallyBlockedUserId) return false;
    const blockDocId = `${blockerId}_${potentiallyBlockedUserId}`;
    const snap = await getDoc(doc(db, BLOCKED_USERS_COLLECTION, blockDocId));
    if (!snap.exists()) return false;
    const data = snap.data() as BlockDoc;
    return !!data.isBlocked;
  } catch (error) {
    console.error('Error checking if user is blocked:', error);
    return false;
  }
};

/**
 * Check if there's a mutual block between two users
 */
export const checkMutualBlock = async (userId1: string, userId2: string): Promise<{ user1BlockedUser2: boolean; user2BlockedUser1: boolean; hasAnyBlock: boolean }> => {
  try {
    const [a, b] = await Promise.all([
      getDoc(doc(db, BLOCKED_USERS_COLLECTION, `${userId1}_${userId2}`)),
      getDoc(doc(db, BLOCKED_USERS_COLLECTION, `${userId2}_${userId1}`))
    ]);
    const user1BlockedUser2 = a.exists() ? !!(a.data() as BlockDoc).isBlocked : false;
    const user2BlockedUser1 = b.exists() ? !!(b.data() as BlockDoc).isBlocked : false;
    return { user1BlockedUser2, user2BlockedUser1, hasAnyBlock: user1BlockedUser2 || user2BlockedUser1 };
  } catch (error) {
    console.error('Error checking mutual block:', error);
    return { user1BlockedUser2: false, user2BlockedUser1: false, hasAnyBlock: false };
  }
};

/**
 * Get list of blocked users for a user
 */
export const getBlockedUsers = async (userId: string): Promise<User[]> => {
  try {
    if (!userId) return [];
    const q = query(collection(db, BLOCKED_USERS_COLLECTION), where('blockerUid', '==', userId), where('isBlocked', '==', true));
    const snap = await getDocs(q);
    const users: User[] = [];
    for (const d of snap.docs) {
      const data = d.data() as BlockDoc;
      const u = await getUserProfile(data.blockedUserUid);
      if (u) users.push(u);
    }
    return users;
  } catch (error) {
    console.error('Error getting blocked users:', error);
    return [];
  }
};

/**
 * Track block status changes in real-time
 */
export const listenToBlockStatus = (
  userId: string,
  otherUserId: string,
  callback: (blockStatus: { user1BlockedUser2: boolean; user2BlockedUser1: boolean; hasAnyBlock: boolean }) => void
): () => void => {
  if (!userId || !otherUserId) return () => {};
  console.log(`Setting up block status listener for users ${userId} and ${otherUserId}`);

  const ref1 = doc(db, BLOCKED_USERS_COLLECTION, `${userId}_${otherUserId}`);
  const ref2 = doc(db, BLOCKED_USERS_COLLECTION, `${otherUserId}_${userId}`);

  let state = { user1BlockedUser2: false, user2BlockedUser1: false };
  const emit = () => callback({ ...state, hasAnyBlock: state.user1BlockedUser2 || state.user2BlockedUser1 });

  const un1 = onSnapshot(ref1, (snap) => {
    state.user1BlockedUser2 = snap.exists() ? !!(snap.data() as BlockDoc).isBlocked : false;
    emit();
  }, (err) => console.error('Block listener error (user1->user2):', err));

  const un2 = onSnapshot(ref2, (snap) => {
    state.user2BlockedUser1 = snap.exists() ? !!(snap.data() as BlockDoc).isBlocked : false;
    emit();
  }, (err) => console.error('Block listener error (user2->user1):', err));

  return () => { un1(); un2(); };
};
