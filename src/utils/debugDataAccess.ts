import { auth, db } from '../firebase/config';
import {
  collection,
  query,
  getDocs,
  getDoc,
  doc,
  where,
  orderBy,
  limit,
  QuerySnapshot,
  enableNetwork,
  disableNetwork,
  DocumentData
} from 'firebase/firestore';

/**
 * Debug utility to check if the current user can access various collections
 * This helps diagnose permission and data access issues
 */

interface CollectionResult {
  count?: number;
  exists?: boolean;
  error?: string;
}

interface DebugResult {
  success: boolean;
  error?: string;
  data?: {
    userId: string | null;
    email: string | null;
    collections?: Record<string, CollectionResult>;
  };
}

// Function to check if app is online
const isOnline = (): boolean => {
  return navigator.onLine;
};

// Enhanced retry function with better error handling
const retry = async <T>(
  fn: () => Promise<T>,
  retries = 3,
  delay = 1000,
  backoff = 2
): Promise<T> => {
  try {
    return await fn();
  } catch (err: any) {
    // Check if error is due to being offline
    if (err.code === 'failed-precondition' || 
        err.code === 'unavailable' || 
        err.message.includes('network') || 
        err.message.includes('offline')) {
      
      console.log('Network related error detected, attempting to reconnect...');
      
      // Try to enable network and retry one more time
      try {
        await enableNetwork(db);
        return await fn();
      } catch (reconnectErr) {
        console.error('Failed to reconnect:', reconnectErr);
      }
    }
    
    if (retries <= 0) {
      throw err;
    }
    
    console.log(`Retrying operation, ${retries} attempts left`);
    await new Promise(resolve => setTimeout(resolve, delay));
    return retry(fn, retries - 1, delay * backoff, backoff);
  }
};

export const debugDataAccess = async (): Promise<DebugResult> => {
  // First check network status
  if (!isOnline()) {
    try {
      // Try to use cached data if available when offline
      console.log('Device is offline, attempting to use cached data');
      // Explicitly disable network to force using cache
      await disableNetwork(db);
    } catch (err) {
      console.warn('Failed to disable network:', err);
    }
  } else {
    // Ensure network is enabled if we're online
    try {
      await enableNetwork(db);
    } catch (err) {
      console.warn('Failed to enable network:', err);
    }
  }

  try {
    const currentUser = auth.currentUser;
    
    if (!currentUser) {
      return {
        success: false,
        error: 'No user is currently signed in',
        data: {
          userId: null,
          email: null
        }
      };
    }
    
    const collections: Record<string, CollectionResult> = {};
    
    // Enhanced error handling for each collection
    
    // Check posts collection
    try {
      await retry(async () => {
        const postsQuery = collection(db, 'posts');
        const postsSnapshot = await getDocs(query(postsQuery, limit(5)));
        if (postsSnapshot.empty && !isOnline()) {
          console.log('No posts found in cache, might need to connect to network');
        }
        collections.posts = {
          count: postsSnapshot.size,
        };
      });
    } catch (error: any) {
      collections.posts = {
        error: `${error.code ? `[${error.code}] ` : ''}${error.message || 'Failed to access posts'}`,
      };
    }
    
    // Check user's profile document with enhanced error handling
    try {
      await retry(async () => {
        const userDocRef = doc(db, 'users', currentUser.uid);
        const userDocSnapshot = await getDoc(userDocRef);
        collections.profile = {
          exists: userDocSnapshot.exists(),
        };
        
        // If offline and document doesn't exist, it might be because it's not in cache
        if (!userDocSnapshot.exists() && !isOnline()) {
          collections.profile.error = "Profile not found in cache. You may need to connect to the internet.";
        }
      });
    } catch (error: any) {
      collections.profile = {
        error: `${error.code ? `[${error.code}] ` : ''}${error.message || 'Failed to access profile'}`,
      };
    }
    
    // Check notifications collection
    try {
      await retry(async () => {
        const notificationsQuery = collection(db, 'notifications');
        const notificationsSnapshot = await getDocs(query(notificationsQuery, where('userId', '==', currentUser.uid), limit(5)));
        collections.notifications = {
          count: notificationsSnapshot.size,
        };
      });
    } catch (error: any) {
      collections.notifications = {
        error: `${error.code ? `[${error.code}] ` : ''}${error.message || 'Failed to access notifications'}`,
      };
    }
    
    // Check friends collection
    try {
      await retry(async () => {
        const friendsQuery = collection(db, 'friendships');
        const friendsSnapshot = await getDocs(query(friendsQuery, 
          where('userId', '==', currentUser.uid), 
          limit(5)));
        collections.friendships = {
          count: friendsSnapshot.size,
        };
      });
    } catch (error: any) {
      collections.friendships = {
        error: `${error.code ? `[${error.code}] ` : ''}${error.message || 'Failed to access friendships'}`,
      };
    }
    
    const hasAnyData = Object.values(collections).some(col => 
      col.count !== undefined && col.count > 0 || col.exists === true
    );
    
    const hasAllErrors = Object.values(collections).every(col => col.error !== undefined);
    
    return {
      success: hasAnyData || !hasAllErrors,
      error: hasAllErrors ? "Failed to retrieve any data. You may need to reconnect to the internet." : undefined,
      data: {
        userId: currentUser.uid,
        email: currentUser.email,
        collections
      }
    };
    
  } catch (error: any) {
    // Handle general errors
    const errorMessage = error.message || 'An unknown error occurred';
    const isOfflineError = 
      errorMessage.includes('offline') || 
      errorMessage.includes('network') || 
      errorMessage.includes('connection') ||
      error.code === 'unavailable' ||
      error.code === 'failed-precondition';
    
    return {
      success: false,
      error: isOfflineError 
        ? 'Failed to check data access because the client is offline. Please check your internet connection and try again.'
        : `Error checking data access: ${errorMessage}`,
      data: {
        userId: auth.currentUser?.uid || null,
        email: auth.currentUser?.email || null
      }
    };
  } finally {
    // Re-enable network if we're online
    if (isOnline()) {
      try {
        await enableNetwork(db);
      } catch (err) {
        console.warn('Error re-enabling network:', err);
      }
    }
  }
};

// Function to verify if a user exists in the database
export const verifyUserExists = async (userId: string): Promise<boolean> => {
  try {
    const userDoc = await getDoc(doc(db, 'users', userId));
    return userDoc.exists();
  } catch (error: any) {
    console.error('Error verifying user existence:', error);
    return false;
  }
};

// Export a function that can be called from the browser console
(window as any).debugBulsuSpace = {
  checkDataAccess: debugDataAccess,
  verifyUser: verifyUserExists
}; 