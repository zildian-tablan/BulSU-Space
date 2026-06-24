import {
  collection,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  getDocs,
  query,
  where,
  updateDoc,
  arrayUnion,
  arrayRemove,
  Timestamp,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase/config';

// Collection name for chat nicknames
const NICKNAMES_COLLECTION = 'chatNicknames';

// Interface for nickname document
export interface ChatNickname {
  id: string;
  chatId: string;
  userId: string;
  targetUserId: string; // The user who is receiving the nickname
  nickname: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * Set a nickname for a user in a chat
 * @param chatId The chat ID
 * @param userId The user setting the nickname
 * @param targetUserId The user receiving the nickname
 * @param nickname The nickname to set
 * @returns Promise that resolves when the nickname is set
 */
export const setUserNickname = async (
  chatId: string,
  userId: string,
  targetUserId: string,
  nickname: string
): Promise<void> => {
  try {
    // Create a unique ID for the nickname document based on chat, user, and target user
    const nicknameId = `${chatId}_${userId}_${targetUserId}`;
    const nicknameRef = doc(db, NICKNAMES_COLLECTION, nicknameId);

    // Check if the nickname already exists
    const nicknameDoc = await getDoc(nicknameRef);

    if (nickname.trim() === '') {
      // If the nickname is empty, delete the document if it exists
      if (nicknameDoc.exists()) {
        await deleteDoc(nicknameRef);
      }
      return;
    }

    // Create or update the nickname document
    if (nicknameDoc.exists()) {
      // Update existing nickname
      await updateDoc(nicknameRef, {
        nickname: nickname.trim(),
        updatedAt: serverTimestamp()
      });
    } else {
      // Create a new nickname document
      await setDoc(nicknameRef, {
        id: nicknameId,
        chatId,
        userId,
        targetUserId,
        nickname: nickname.trim(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    }

  } catch (error) {
    console.error('Error setting nickname:', error);
    throw error;
  }
};

/**
 * Get the nickname for a user in a chat
 * @param chatId The chat ID
 * @param userId The user who set the nickname
 * @param targetUserId The user who received the nickname
 * @returns Promise that resolves to the nickname document or null if not found
 */
export const getUserNickname = async (
  chatId: string,
  userId: string,
  targetUserId: string
): Promise<ChatNickname | null> => {
  try {
    const nicknameId = `${chatId}_${userId}_${targetUserId}`;
    const nicknameRef = doc(db, NICKNAMES_COLLECTION, nicknameId);
    const nicknameDoc = await getDoc(nicknameRef);

    if (nicknameDoc.exists()) {
      return {
        id: nicknameDoc.id,
        ...nicknameDoc.data()
      } as ChatNickname;
    }

    return null;
  } catch (error) {
    console.error('Error getting nickname:', error);
    throw error;
  }
};

/**
 * Get all nicknames for a chat
 * @param chatId The chat ID
 * @returns Promise that resolves to an array of nickname documents
 */
export const getChatNicknames = async (
  chatId: string
): Promise<ChatNickname[]> => {
  try {
    const nicknamesQuery = query(
      collection(db, NICKNAMES_COLLECTION),
      where('chatId', '==', chatId)
    );
    const nicknamesSnapshot = await getDocs(nicknamesQuery);
    
    return nicknamesSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as ChatNickname));
  } catch (error) {
    console.error('Error getting chat nicknames:', error);
    throw error;
  }
};

/**
 * Delete all nicknames for a chat
 * @param chatId The chat ID
 * @returns Promise that resolves when all nicknames are deleted
 */
export const deleteAllChatNicknames = async (chatId: string): Promise<void> => {
  try {
    const nicknamesQuery = query(
      collection(db, NICKNAMES_COLLECTION),
      where('chatId', '==', chatId)
    );
    const nicknamesSnapshot = await getDocs(nicknamesQuery);
    
    // Use batch to delete all documents at once
    const batch = writeBatch(db);
    nicknamesSnapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });
    
    await batch.commit();
  } catch (error) {
    console.error('Error deleting chat nicknames:', error);
    throw error;
  }
};

/**
 * Get all nicknames set by a user
 * @param userId The user ID
 * @returns Promise that resolves to an array of nickname documents
 */
export const getUserSetNicknames = async (userId: string): Promise<ChatNickname[]> => {
  try {
    const nicknamesQuery = query(
      collection(db, NICKNAMES_COLLECTION),
      where('userId', '==', userId)
    );
    const nicknamesSnapshot = await getDocs(nicknamesQuery);
    
    return nicknamesSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as ChatNickname));
  } catch (error) {
    console.error('Error getting user nicknames:', error);
    throw error;
  }
};

/**
 * Utility function to get display name for a user, taking nicknames into account
 * @param chatId The chat ID
 * @param currentUserId The current user's ID
 * @param targetUserId The target user's ID
 * @param defaultName The default name to use if no nickname exists
 * @returns Promise that resolves to the display name to use
 */
export const getDisplayName = async (
  chatId: string, 
  currentUserId: string,
  targetUserId: string,
  defaultName: string
): Promise<string> => {
  try {
    const nickname = await getUserNickname(chatId, currentUserId, targetUserId);
    return nickname ? nickname.nickname : defaultName;
  } catch (error) {
    console.error('Error getting display name:', error);
    return defaultName;
  }
};

/**
 * Get a React hook for using nicknames in components
 * @param chatId The chat ID
 * @param currentUserId The current user's ID
 * @returns An object containing nickname-related functions and state
 */
export const useNicknames = (
  chatId: string,
  currentUserId: string
) => {
  // This would be implemented as a React hook if needed
  // For now, we'll just use the individual functions
  return {
    setNickname: (targetUserId: string, nickname: string) => 
      setUserNickname(chatId, currentUserId, targetUserId, nickname),
    getNickname: (targetUserId: string, defaultName: string) =>
      getDisplayName(chatId, currentUserId, targetUserId, defaultName),
  };
};
