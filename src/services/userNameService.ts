import { db } from '../firebase/config';
import { doc, onSnapshot } from 'firebase/firestore';

const USERS_COLLECTION = 'users';

/**
 * Real-time listener for user name changes
 * Returns an unsubscribe function
 */
export const getUserNameRealtime = (
  userId: string,
  onUpdate: (name: string) => void
): (() => void) => {
  if (!userId) {
    console.warn('getUserNameRealtime called with empty userId');
    return () => {};
  }
  
  const userRef = doc(db, USERS_COLLECTION, userId);
  
  const unsubscribe = onSnapshot(
    userRef,
    (doc) => {
      if (doc.exists()) {
        const userData = doc.data();
        if (userData && userData.name) {
          onUpdate(userData.name);
        }
      }
    },
    (error) => {
      console.error('Error listening to username updates:', error);
    }
  );
  
  return unsubscribe;
};

/**
 * Real-time listener for user profile picture changes
 * Returns an unsubscribe function
 */
export const getUserProfilePicRealtime = (
  userId: string,
  onUpdate: (profilePic: string) => void
): (() => void) => {
  if (!userId) {
    console.warn('getUserProfilePicRealtime called with empty userId');
    return () => {};
  }
  
  const userRef = doc(db, USERS_COLLECTION, userId);
  
  const unsubscribe = onSnapshot(
    userRef,
    (doc) => {
      if (doc.exists()) {
        const userData = doc.data();
        if (userData && userData.profile_pic) {
          onUpdate(userData.profile_pic);
        }
      }
    },
    (error) => {
      console.error('Error listening to profile pic updates:', error);
    }
  );
  
  return unsubscribe;
};
