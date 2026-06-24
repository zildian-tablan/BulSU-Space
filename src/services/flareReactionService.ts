import { 
  collection, 
  doc,
  setDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  where,
  updateDoc,
  increment,
  serverTimestamp
} from 'firebase/firestore';
import { db } from '../firebase/config';

const FLARES_COLLECTION = 'flares';
const REACTIONS_SUBCOLLECTION = 'reactions';

/**
 * Toggle like on a flare
 * Returns true if liked, false if unliked
 */
export const toggleFlareLike = async (flareId: string, userId: string): Promise<boolean> => {
  try {
    const reactionRef = doc(db, FLARES_COLLECTION, flareId, REACTIONS_SUBCOLLECTION, userId);
    const reactionDoc = await getDoc(reactionRef);

    if (reactionDoc.exists()) {
      // Unlike - delete reaction and decrement count
      await deleteDoc(reactionRef);
      
      const flareRef = doc(db, FLARES_COLLECTION, flareId);
      await updateDoc(flareRef, {
        likeCount: increment(-1)
      });
      
      return false;
    } else {
      // Like - add reaction and increment count
      await setDoc(reactionRef, {
        userId: userId,
        createdAt: serverTimestamp()
      });
      
      const flareRef = doc(db, FLARES_COLLECTION, flareId);
      await updateDoc(flareRef, {
        likeCount: increment(1)
      });
      
      return true;
    }
  } catch (error) {
    console.error('Error toggling flare like:', error);
    throw error;
  }
};

/**
 * Check if user has liked a flare
 */
export const hasUserLikedFlare = async (flareId: string, userId: string): Promise<boolean> => {
  try {
    const reactionRef = doc(db, FLARES_COLLECTION, flareId, REACTIONS_SUBCOLLECTION, userId);
    const reactionDoc = await getDoc(reactionRef);
    return reactionDoc.exists();
  } catch (error) {
    console.error('Error checking if user liked flare:', error);
    return false;
  }
};

/**
 * Get all reactions for a flare
 */
export const getFlareReactions = async (flareId: string): Promise<string[]> => {
  try {
    const reactionsQuery = query(
      collection(db, FLARES_COLLECTION, flareId, REACTIONS_SUBCOLLECTION)
    );
    
    const snapshot = await getDocs(reactionsQuery);
    const userIds: string[] = [];
    
    snapshot.forEach((doc) => {
      userIds.push(doc.id);
    });
    
    return userIds;
  } catch (error) {
    console.error('Error getting flare reactions:', error);
    return [];
  }
};

/**
 * Get user's liked flares
 */
export const getUserLikedFlares = async (userId: string): Promise<string[]> => {
  try {
    const flaresSnapshot = await getDocs(collection(db, FLARES_COLLECTION));
    const likedFlareIds: string[] = [];
    
    for (const flareDoc of flaresSnapshot.docs) {
      const reactionRef = doc(db, FLARES_COLLECTION, flareDoc.id, REACTIONS_SUBCOLLECTION, userId);
      const reactionDoc = await getDoc(reactionRef);
      
      if (reactionDoc.exists()) {
        likedFlareIds.push(flareDoc.id);
      }
    }
    
    return likedFlareIds;
  } catch (error) {
    console.error('Error getting user liked flares:', error);
    return [];
  }
};
