import { 
  collection, 
  doc, 
  addDoc, 
  getDocs, 
  query, 
  orderBy, 
  limit, 
  serverTimestamp,
  onSnapshot,
  Timestamp,
  where
} from 'firebase/firestore';
import { db } from '../firebase/config';

// Collection path
const UPLOAD_HISTORY_COLLECTION = 'upload_history';

// Upload History Item interface to match the existing interface
export interface UploadHistoryItem {
  id: string;
  timestamp: Date;
  filename: string;
  usersCreated: number;
  usersSkipped: number;
  usersErrored: number;
  totalUsers: number;
  status: 'completed' | 'failed' | 'partial';
  userId?: string; // Optional field to track which admin created the upload
  uploadedBy?: string; // Optional field to store the admin's name
}

// Firestore version for storing (uses Timestamp instead of Date)
interface UploadHistoryFirestore {
  filename: string;
  usersCreated: number;
  usersSkipped: number;
  usersErrored: number;
  totalUsers: number;
  status: 'completed' | 'failed' | 'partial';
  userId?: string;
  uploadedBy?: string;
  timestamp: Timestamp;
}

/**
 * Save upload history item to Firestore
 */
export const saveUploadHistory = async (
  uploadItem: Omit<UploadHistoryItem, 'id' | 'timestamp'>,
  userId?: string,
  userName?: string
): Promise<string> => {
  try {
    const historyData: Omit<UploadHistoryFirestore, 'id'> = {
      filename: uploadItem.filename,
      usersCreated: uploadItem.usersCreated,
      usersSkipped: uploadItem.usersSkipped,
      usersErrored: uploadItem.usersErrored,
      totalUsers: uploadItem.totalUsers,
      status: uploadItem.status,
      timestamp: serverTimestamp() as Timestamp,
      userId: userId,
      uploadedBy: userName
    };

    const docRef = await addDoc(collection(db, UPLOAD_HISTORY_COLLECTION), historyData);
    console.log('Upload history saved to Firestore with ID:', docRef.id);
    return docRef.id;
  } catch (error) {
    console.error('Error saving upload history to Firestore:', error);
    throw error;
  }
};

/**
 * Get upload history from Firestore with optional limit
 */
export const getUploadHistory = async (limitCount: number = 50): Promise<UploadHistoryItem[]> => {
  try {
    const historyQuery = query(
      collection(db, UPLOAD_HISTORY_COLLECTION),
      orderBy('timestamp', 'desc'),
      limit(limitCount)
    );

    const snapshot = await getDocs(historyQuery);
    const historyItems: UploadHistoryItem[] = [];

    snapshot.forEach((doc) => {
      const data = doc.data() as UploadHistoryFirestore;
      historyItems.push({
        id: doc.id,
        filename: data.filename,
        usersCreated: data.usersCreated,
        usersSkipped: data.usersSkipped,
        usersErrored: data.usersErrored,
        totalUsers: data.totalUsers,
        status: data.status,
        timestamp: data.timestamp?.toDate() || new Date(),
        userId: data.userId,
        uploadedBy: data.uploadedBy
      });
    });

    return historyItems;
  } catch (error) {
    console.error('Error fetching upload history from Firestore:', error);
    throw error;
  }
};

/**
 * Get upload history for a specific user
 */
export const getUserUploadHistory = async (
  userId: string, 
  limitCount: number = 20
): Promise<UploadHistoryItem[]> => {
  try {
    const historyQuery = query(
      collection(db, UPLOAD_HISTORY_COLLECTION),
      where('userId', '==', userId),
      orderBy('timestamp', 'desc'),
      limit(limitCount)
    );

    const snapshot = await getDocs(historyQuery);
    const historyItems: UploadHistoryItem[] = [];

    snapshot.forEach((doc) => {
      const data = doc.data() as UploadHistoryFirestore;
      historyItems.push({
        id: doc.id,
        filename: data.filename,
        usersCreated: data.usersCreated,
        usersSkipped: data.usersSkipped,
        usersErrored: data.usersErrored,
        totalUsers: data.totalUsers,
        status: data.status,
        timestamp: data.timestamp?.toDate() || new Date(),
        userId: data.userId,
        uploadedBy: data.uploadedBy
      });
    });

    return historyItems;
  } catch (error) {
    console.error('Error fetching user upload history from Firestore:', error);
    throw error;
  }
};

/**
 * Listen to real-time upload history updates
 */
export const getUploadHistoryRealtime = (
  onHistoryUpdate: (history: UploadHistoryItem[]) => void,
  limitCount: number = 50
): (() => void) => {
  try {
    const historyQuery = query(
      collection(db, UPLOAD_HISTORY_COLLECTION),
      orderBy('timestamp', 'desc'),
      limit(limitCount)
    );

    const unsubscribe = onSnapshot(historyQuery, (snapshot) => {
      const historyItems: UploadHistoryItem[] = [];
      
      snapshot.forEach((doc) => {
        const data = doc.data() as UploadHistoryFirestore;
        historyItems.push({
          id: doc.id,
          filename: data.filename,
          usersCreated: data.usersCreated,
          usersSkipped: data.usersSkipped,
          usersErrored: data.usersErrored,
          totalUsers: data.totalUsers,
          status: data.status,
          timestamp: data.timestamp?.toDate() || new Date(),
          userId: data.userId,
          uploadedBy: data.uploadedBy
        });
      });

      onHistoryUpdate(historyItems);
    }, (error) => {
      console.error('Error in upload history real-time listener:', error);
    });

    return unsubscribe;
  } catch (error) {
    console.error('Error setting up upload history listener:', error);
    throw error;
  }
};

/**
 * Get upload statistics from Firestore
 */
export const getUploadStats = async (): Promise<{
  totalUploads: number;
  totalUsersCreated: number;
  totalUsersErrored: number;
  successfulUploads: number;
  failedUploads: number;
}> => {
  try {
    const snapshot = await getDocs(collection(db, UPLOAD_HISTORY_COLLECTION));
    
    let totalUploads = 0;
    let totalUsersCreated = 0;
    let totalUsersErrored = 0;
    let successfulUploads = 0;
    let failedUploads = 0;

    snapshot.forEach((doc) => {
      const data = doc.data() as UploadHistoryFirestore;
      totalUploads++;
      totalUsersCreated += data.usersCreated;
      totalUsersErrored += data.usersErrored;
      
      if (data.status === 'completed') {
        successfulUploads++;
      } else if (data.status === 'failed') {
        failedUploads++;
      }
    });

    return {
      totalUploads,
      totalUsersCreated,
      totalUsersErrored,
      successfulUploads,
      failedUploads
    };
  } catch (error) {
    console.error('Error fetching upload stats from Firestore:', error);
    throw error;
  }
};

export default {
  saveUploadHistory,
  getUploadHistory,
  getUserUploadHistory,
  getUploadHistoryRealtime,
  getUploadStats
};
