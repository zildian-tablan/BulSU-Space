import { 
  collection, 
  doc,
  addDoc,
  deleteDoc,
  getDocs,
  query,
  orderBy,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import { db } from '../firebase/config';

const FLARES_COLLECTION = 'flares';
const COMMENTS_SUBCOLLECTION = 'comments';

export interface FlareComment {
  id: string;
  userId: string;
  userName: string;
  userProfilePic?: string;
  text: string;
  createdAt: Timestamp;
}

/**
 * Add a comment to a flare
 */
export const addFlareComment = async (
  flareId: string,
  userId: string,
  userName: string,
  userProfilePic: string | undefined,
  text: string
): Promise<string> => {
  try {
    const commentsRef = collection(db, FLARES_COLLECTION, flareId, COMMENTS_SUBCOLLECTION);
    
    const commentData = {
      userId,
      userName,
      userProfilePic: userProfilePic || '',
      text,
      createdAt: serverTimestamp()
    };

    const docRef = await addDoc(commentsRef, commentData);
    console.log('Comment added with ID:', docRef.id);
    return docRef.id;
  } catch (error) {
    console.error('Error adding comment:', error);
    throw error;
  }
};

/**
 * Get all comments for a flare
 */
export const getFlareComments = async (flareId: string): Promise<FlareComment[]> => {
  try {
    const commentsRef = collection(db, FLARES_COLLECTION, flareId, COMMENTS_SUBCOLLECTION);
    const commentsQuery = query(commentsRef, orderBy('createdAt', 'desc'));
    
    const snapshot = await getDocs(commentsQuery);
    const comments: FlareComment[] = [];
    
    snapshot.forEach((doc) => {
      const data = doc.data();
      comments.push({
        id: doc.id,
        userId: data.userId,
        userName: data.userName,
        userProfilePic: data.userProfilePic,
        text: data.text,
        createdAt: data.createdAt as Timestamp
      });
    });
    
    return comments;
  } catch (error) {
    console.error('Error getting comments:', error);
    return [];
  }
};

/**
 * Delete a comment from a flare
 */
export const deleteFlareComment = async (flareId: string, commentId: string): Promise<void> => {
  try {
    const commentRef = doc(db, FLARES_COLLECTION, flareId, COMMENTS_SUBCOLLECTION, commentId);
    await deleteDoc(commentRef);
    console.log('Comment deleted successfully');
  } catch (error) {
    console.error('Error deleting comment:', error);
    throw error;
  }
};
