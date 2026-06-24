import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';

interface TutorialStatus {
  userId: string;
  completed: boolean;
  completedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const TUTORIAL_COLLECTION = 'tutorial_status';

/**
 * Check if user has completed the tutorial
 */
export const getUserTutorialStatus = async (userId: string): Promise<boolean> => {
  try {
    const tutorialRef = doc(db, TUTORIAL_COLLECTION, userId);
    const tutorialDoc = await getDoc(tutorialRef);
    
    if (tutorialDoc.exists()) {
      const data = tutorialDoc.data() as TutorialStatus;
      return data.completed || false;
    }
    
    return false; // User hasn't seen tutorial yet
  } catch (error) {
    console.error('Error checking tutorial status:', error);
    // Fallback to localStorage if Firestore fails
    const localKey = `tutorial_completed_${userId}`;
    return localStorage.getItem(localKey) === 'true';
  }
};

/**
 * Mark tutorial as completed for user
 */
export const markTutorialAsCompleted = async (userId: string): Promise<void> => {
  try {
    const tutorialRef = doc(db, TUTORIAL_COLLECTION, userId);
    const tutorialDoc = await getDoc(tutorialRef);
    
    const now = new Date();
    
    if (tutorialDoc.exists()) {
      // Update existing document
      await setDoc(tutorialRef, {
        completed: true,
        completedAt: now,
        updatedAt: now,
      }, { merge: true });
    } else {
      // Create new document
      await setDoc(tutorialRef, {
        userId,
        completed: true,
        completedAt: now,
        createdAt: now,
        updatedAt: now,
      });
    }
    
    console.log(`Tutorial marked as completed for user ${userId}`);
    
    // Also save to localStorage as backup
    const localKey = `tutorial_completed_${userId}`;
    localStorage.setItem(localKey, 'true');
    
  } catch (error) {
    console.error('Error marking tutorial as completed:', error);
    
    // Fallback to localStorage if Firestore fails
    const localKey = `tutorial_completed_${userId}`;
    localStorage.setItem(localKey, 'true');
    
    // Re-throw error to let caller know about the failure
    throw error;
  }
};

/**
 * Reset tutorial status for user (useful for testing or admin purposes)
 */
export const resetTutorialStatus = async (userId: string): Promise<void> => {
  try {
    const tutorialRef = doc(db, TUTORIAL_COLLECTION, userId);
    await setDoc(tutorialRef, {
      userId,
      completed: false,
      updatedAt: new Date(),
    }, { merge: true });
    
    // Also remove from localStorage
    const localKey = `tutorial_completed_${userId}`;
    localStorage.removeItem(localKey);
    
    console.log(`Tutorial status reset for user ${userId}`);
  } catch (error) {
    console.error('Error resetting tutorial status:', error);
    throw error;
  }
};

/**
 * Get tutorial status for multiple users (admin function)
 */
export const getBulkTutorialStatus = async (userIds: string[]): Promise<Record<string, boolean>> => {
  const results: Record<string, boolean> = {};
  
  try {
    // Process in batches to avoid overwhelming Firestore
    const batchSize = 10;
    for (let i = 0; i < userIds.length; i += batchSize) {
      const batch = userIds.slice(i, i + batchSize);
      const promises = batch.map(async (userId) => {
        try {
          const status = await getUserTutorialStatus(userId);
          return { userId, status };
        } catch (error) {
          console.error(`Error checking tutorial status for user ${userId}:`, error);
          return { userId, status: false };
        }
      });
      
      const batchResults = await Promise.all(promises);
      batchResults.forEach(({ userId, status }) => {
        results[userId] = status;
      });
    }
  } catch (error) {
    console.error('Error getting bulk tutorial status:', error);
  }
  
  return results;
};

/**
 * Reset tutorial status for multiple users (admin function)
 */
export const resetBulkTutorialStatus = async (userIds: string[]): Promise<{ success: string[], failed: string[] }> => {
  const success: string[] = [];
  const failed: string[] = [];
  
  try {
    // Process in batches to avoid overwhelming Firestore
    const batchSize = 10;
    for (let i = 0; i < userIds.length; i += batchSize) {
      const batch = userIds.slice(i, i + batchSize);
      const promises = batch.map(async (userId) => {
        try {
          await resetTutorialStatus(userId);
          return { userId, success: true };
        } catch (error) {
          console.error(`Error resetting tutorial status for user ${userId}:`, error);
          return { userId, success: false };
        }
      });
      
      const batchResults = await Promise.all(promises);
      batchResults.forEach(({ userId, success: isSuccess }) => {
        if (isSuccess) {
          success.push(userId);
        } else {
          failed.push(userId);
        }
      });
    }
  } catch (error) {
    console.error('Error resetting bulk tutorial status:', error);
  }
  
  return { success, failed };
};
