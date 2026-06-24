import {
  collection,
  query,
  where,
  orderBy,
  limit,
  limitToLast,
  onSnapshot,
  addDoc,
  getDocs,
  getDoc,
  doc,
  setDoc,
  updateDoc,
  serverTimestamp,
  Timestamp,
  arrayUnion,
  arrayRemove,
  writeBatch,
  documentId,
  startAfter,
  QueryDocumentSnapshot,
  DocumentData,
  WriteBatch,
  Transaction,
  runTransaction,
  deleteDoc,
  deleteField
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { User } from '../contexts/AuthContext';
import { auth } from '../firebase/config';
import { isUserBlocked, checkMutualBlock } from './userService';
import { notifyNewMessage, notifyMessageRequest, clearMessageRequestNotification } from './notificationTriggers';
import { deleteAllChatNicknames } from './nicknameService';
import { canSendDirectMessage } from '../utils/messagingPermissions';

// Import a function to trigger message notification sounds directly 
// (defined below - will be initialized later to avoid circular dependencies)
let playMessageSound: (() => void) | null = null;
export const registerMessageSoundPlayer = (soundPlayer: () => void) => {
  playMessageSound = soundPlayer;
  console.log('📱 Message sound player registered successfully!');
};

// Track last sound play time globally with a minimum interval
let lastGlobalSoundPlayTime = 0;
const MINIMUM_SOUND_INTERVAL_MS = 2000; // 2 seconds minimum between sounds

// Direct handler for global message sound function
export const playMessageNotificationSound = (force: boolean = false) => {
  const now = Date.now();
  
  // Check if we've played a sound too recently (unless force=true)
  if (!force && now - lastGlobalSoundPlayTime < MINIMUM_SOUND_INTERVAL_MS) {
    console.log(`📱 Skipping message sound - too soon (${(now - lastGlobalSoundPlayTime)/1000}s since last sound)`);
    return false;
  }
  
  console.log('📱 Attempting to play message sound via global handler');
  if (playMessageSound) {
    console.log('📱 Calling registered message sound player');
    
    try {
      // Wrap in try/catch to handle any playback failures
      playMessageSound();
      console.log('📱 Message sound player called successfully');
      
      // Try an alternative sound approach if needed
      if (force) {
        console.log('📱 Using force=true, also trying simple Audio element');
        setTimeout(() => {
          try {
            // Create and play a simple beep using Audio API
            const audio = new Audio();
            audio.src = 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tAwAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAAElgC1tbW1tbW1tbW1tbW1tbW1tbW1tbW1tbW1tbW1tbW1tbW1tbW1tbW1tbW1tbW1tbW1//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAABJa/PG7aAAAAAAAAAAAAAAAAAAAA';
            audio.volume = 0.5;
            audio.play().catch(e => console.log('Audio fallback failed', e));
          } catch (e) {
            console.error('Alternative audio method failed', e);
          }
        }, 100);
      }
      
      lastGlobalSoundPlayTime = now;
      return true;
    } catch (err) {
      console.error('📱 Error calling message sound player:', err);
      return false;
    }
  } else {
    console.warn('📱 No message sound player registered!');
    
    // Emergency fallback when forced and no player registered
    if (force) {
      console.log('📱 Attempting emergency fallback sound');
      try {
        // Create and play a simple beep using Audio API
        const audio = new Audio();
        audio.src = 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tAwAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAAElgC1tbW1tbW1tbW1tbW1tbW1tbW1tbW1tbW1tbW1tbW1tbW1tbW1tbW1tbW1tbW1tbW1//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAABJa/PG7aAAAAAAAAAAAAAAAAAAAA';
        audio.volume = 0.5;
        audio.play().catch(e => console.log('Audio fallback failed', e));
        return true;
      } catch (e) {
        console.error('Emergency audio method failed', e);
      }
    }
    
    return false;
  }
};

// Collection names
const CHATS_COLLECTION = 'chats';
const MESSAGES_COLLECTION = 'messages';
const USERS_COLLECTION = 'users';

const assertDirectMessagingAllowed = async (senderId: string, recipientId: string): Promise<void> => {
  const [senderSnap, recipientSnap] = await Promise.all([
    getDoc(doc(db, USERS_COLLECTION, senderId)),
    getDoc(doc(db, USERS_COLLECTION, recipientId))
  ]);

  const senderPrincipal = {
    id: senderId,
    role: senderSnap.exists() ? (senderSnap.data() as any).role : null
  };
  const recipientPrincipal = {
    id: recipientId,
    role: recipientSnap.exists() ? (recipientSnap.data() as any).role : null
  };

  if (!canSendDirectMessage(senderPrincipal, recipientPrincipal)) {
    throw new Error('You cannot send messages to this user.');
  }
};

// Message status
export type MessageStatus = 'sent' | 'delivered' | 'read';

// Message type
export type MessageType = 'text' | 'image' | 'file' | 'audio' | 'system' | 'call';

// Base message interface with required fields
interface MessageBase {
  id: string;
  chatId: string;
  senderId: string;
  content: string;
  type: MessageType;
  status: MessageStatus;
  createdAt: Timestamp | import('firebase/firestore').FieldValue;
  timestamp?: Timestamp | import('firebase/firestore').FieldValue; // Alias for createdAt for compatibility
  readBy: string[];
  edited: boolean;
  deletedForMe?: string[]; // Array of user IDs who deleted this message for themselves
  forwardedFrom?: {
    originalMessageId: string;
    originalChatId: string;
    originalSenderId: string;
    forwardedAt: Timestamp | import('firebase/firestore').FieldValue;
  } | null;
}

// Specific message type interfaces
interface TextMessage extends MessageBase {
  type: 'text';
  attachments: null;
  replyTo: string | null;
}

interface MediaMessage extends MessageBase {
  type: 'image' | 'audio' | 'file';
  attachments: string[];
  replyTo: string | null;
}

interface SystemMessage extends MessageBase {
  type: 'system';
  attachments: null;
  replyTo: null;
}

// Union type for all message types
// Optional metadata for call messages (kept simple for Firestore schema)
export type CallMessageMeta = {
  status: 'ended' | 'missed' | 'rejected';
  durationSeconds?: number;
  callId: string;
  kind: 'audio' | 'video';
};

interface CallMessage extends MessageBase {
  type: 'call';
  attachments: null;
  replyTo: null;
  call?: CallMessageMeta;
}

export type Message = TextMessage | MediaMessage | SystemMessage | CallMessage;

// Helper type for creating new messages
export type NewMessageData = Omit<Message, 'id'> & {
  replyTo?: string | null;
};

// Chat interface
export interface Chat {
  id: string;
  participants: string[];
  lastMessage: {
    messageId: string;
    content: string;
    senderId: string;
    createdAt: Timestamp | import('firebase/firestore').FieldValue;
    type: MessageType;
    status: MessageStatus;
    readBy: string[];
  } | null;
  createdAt: Timestamp | import('firebase/firestore').FieldValue;
  updatedAt: Timestamp | import('firebase/firestore').FieldValue;
  unreadCount: Record<string, number>;
  theme: string | null;
  name: string | null;
  isGroupChat: boolean;
  adminId?: string; // userId of group admin
  iconUrl?: string; // group icon url
  archived?: Record<string, boolean>; // Maps userId to archive status
  userDeletes?: Record<string, Timestamp | import('firebase/firestore').FieldValue>; // Per-user deletion timestamp
  // When true, this conversation is a Message Request (e.g., from non-friends)
  isMessageRequest?: boolean;
  // The userId who initiated the message request (only for direct chats)
  initiator?: string;
  // Backward-compat: older naming we may still read
  messageRequestInitiatorId?: string;
  // Optional link to a space/group
  linkedGroupId?: string;
  linkedGroupName?: string;
}

// Chat with user details interface
export interface ChatWithDetails extends Omit<Chat, 'lastMessage' | 'isGroupChat' | 'adminId'> {
  otherUser?: User; // The other user in a 1:1 chat
  users?: User[];   // All users in a group chat
  participantDetails?: User[]; // Details for all participants
  lastMessage?: Message | null; // The last message for this chat (can be null)
  isGroupChat: boolean; // Ensure this is explicitly set
  adminId?: string | null; // Ensure this is explicitly set
}

// Pagination interface
export interface MessagePage {
  messages: Message[];
  hasMore: boolean;
  lastMessageId: string | null;
}

// Message queue interface
interface MessageQueue {
  id: string;
  message: NewMessageData;
  attempts: number;
  lastAttempt: number;
}

// Message queue storage
let messageQueue: MessageQueue[] = [];
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY = 5000; // 5 seconds

// Read receipt batch processor
interface ReadReceiptBatch {
  chatId: string;
  userId: string;
  messageIds: Set<string>;
  lastUpdate: number;
}

const READ_RECEIPT_BATCH_DELAY = 2000; // 2 seconds
const readReceiptBatches = new Map<string, ReadReceiptBatch>();

// Track last message timestamps for each chat to prevent duplicate sounds
const lastMessageTimestamps: { [chatId: string]: number } = {};

/**
 * Helper to generate a unique group icon (e.g. using DiceBear avatars)
 */
export function generateGroupIconUrl(groupName: string): string {
  // You can use any avatar service or a local default
  // Example: DiceBear Avatars API
  return `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(groupName)}&backgroundColor=green,blue,gray`;
}

export const getChatById = async (chatId: string): Promise<Chat | null> => {
  try {
    const chatDoc = await getDoc(doc(db, CHATS_COLLECTION, chatId));
    if (!chatDoc.exists()) return null;
    const chatData = chatDoc.data() as Chat;
    return { ...chatData, id: chatDoc.id };
  } catch (error) {
    console.error('Error fetching chat by id:', error);
    throw error;
  }
};

export const setChatParticipants = async (
  chatId: string,
  participantIds: string[],
  adminFallbackId?: string
): Promise<void> => {
  try {
    await runTransaction(db, async (tx) => {
      const chatRef = doc(db, CHATS_COLLECTION, chatId);
      const chatSnap = await tx.get(chatRef);
      if (!chatSnap.exists()) {
        throw new Error('Chat not found');
      }

      const chatData = chatSnap.data() as Chat;
      const uniqueParticipants = Array.from(new Set(participantIds));

      const updatedUnread: Record<string, number> = uniqueParticipants.reduce((acc, id) => {
        acc[id] = chatData.unreadCount?.[id] || 0;
        return acc;
      }, {} as Record<string, number>);

      let nextAdmin = chatData.adminId;
      if (nextAdmin && !uniqueParticipants.includes(nextAdmin)) {
        nextAdmin = undefined;
      }

      if (!nextAdmin) {
        const fallbackCandidate = adminFallbackId && uniqueParticipants.includes(adminFallbackId)
          ? adminFallbackId
          : uniqueParticipants[0];
        nextAdmin = fallbackCandidate;
      }

      const hasChanges =
        uniqueParticipants.length !== chatData.participants.length ||
        uniqueParticipants.some((id, idx) => chatData.participants[idx] !== id) ||
        nextAdmin !== chatData.adminId;

      if (!hasChanges) {
        return;
      }

      tx.update(chatRef, {
        participants: uniqueParticipants,
        unreadCount: updatedUnread,
        adminId: nextAdmin,
        updatedAt: serverTimestamp()
      });
    });
  } catch (error) {
    console.error('Error updating chat participants:', error);
    throw error;
  }
};

/**
 * Create a new chat between users
 */
export const createChat = async (
  userIds: string[],
  isGroupChat: boolean = false,
  name?: string,
  adminId?: string,
  isMessageRequest?: boolean,
  initiator?: string
): Promise<Chat> => {
  try {
    // Check if a chat already exists between these users (for 1:1 chats)
    if (!isGroupChat && userIds.length === 2) {
      const existingChat = await findChatBetweenUsers(userIds[0], userIds[1]);
      if (existingChat) {
        return existingChat;
      }
    }

    // Enforce group member limit
    if (isGroupChat && userIds.length > 70) {
      throw new Error('Group chat cannot have more than 70 members');
    }

    // Create new chat
    const chatData: Omit<Chat, 'id'> = {
      participants: userIds,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      isGroupChat: isGroupChat,
      unreadCount: Object.fromEntries(userIds.map(id => [id, 0])),
      lastMessage: null,
      theme: null,
      name: name || null,
      // Only include adminId and iconUrl if group chat
      ...(isGroupChat ? { adminId: adminId || userIds[0] } : {}),
      ...(isGroupChat ? { iconUrl: generateGroupIconUrl(name || `Group-${Date.now()}`) } : {}),
      // For direct chats, allow flagging as Message Request
      ...(!isGroupChat && typeof isMessageRequest === 'boolean' ? { isMessageRequest } : {}),
      // Track who initiated the message request (only for direct chats)
      ...(!isGroupChat && initiator ? { initiator, messageRequestInitiatorId: initiator } : {})
    };

    const chatRef = await addDoc(collection(db, CHATS_COLLECTION), chatData);
    return {
      id: chatRef.id,
      ...chatData
    };
  } catch (error) {
    console.error('Error creating chat:', error);
    throw error;
  }
};

/**
 * Find an existing chat between two users
 */
export const findChatBetweenUsers = async (
  userId1: string,
  userId2: string
): Promise<Chat | null> => {
  try {
    const authUid = auth.currentUser?.uid;
    if (!authUid) {
      throw new Error('Authentication required to find direct chat');
    }

    const normalizedA = userId1 < userId2 ? userId1 : userId2;
    const normalizedB = userId1 < userId2 ? userId2 : userId1;
    const deterministicId = `direct_${normalizedA}_${normalizedB}`;

    // Prefer deterministic direct-chat ID when present.
    // Some rulesets deny direct get() for non-existent docs; do not fail lookup on that.
    try {
      const deterministicSnap = await getDoc(doc(db, CHATS_COLLECTION, deterministicId));
      if (deterministicSnap.exists()) {
        const data = deterministicSnap.data() as any;
        if (
          data?.isGroupChat === false &&
          Array.isArray(data?.participants) &&
          data.participants.length === 2 &&
          data.participants.includes(userId1) &&
          data.participants.includes(userId2)
        ) {
          return {
            id: deterministicSnap.id,
            ...data
          } as Chat;
        }
      }
    } catch (deterministicReadError) {
      console.debug('Deterministic direct-chat read skipped, falling back to participant query:', deterministicReadError);
    }

    // Firestore rules require the querying user to be a participant.
    // Always anchor array-contains on the authenticated user.
    const participantAnchor = authUid;

    // Query for chats that have exactly these two participants
    const chatsQuery = query(
      collection(db, CHATS_COLLECTION),
      where('participants', 'array-contains', participantAnchor),
      where('isGroupChat', '==', false)
    );

    const chatsSnapshot = await getDocs(chatsQuery);
    const chats: Chat[] = [];

    chatsSnapshot.forEach((doc) => {
      const data = doc.data();
      // Only include direct chats that contain exactly these two users.
      const participants = Array.isArray((data as any).participants) ? (data as any).participants : [];
      if (
        participants.length === 2 &&
        participants.includes(userId1) &&
        participants.includes(userId2)
      ) {
        chats.push({
          id: doc.id,
          ...data
        } as Chat);
      }
    });

    return chats.length > 0 ? chats[0] : null;
  } catch (error) {
    console.error('Error finding chat between users:', error);
    throw error;
  }
};

/**
 * Ensure a direct (1:1) chat exists between two users. If it already exists, return it;
 * otherwise create a new one. Guarantees at most one direct chat per pair.
 */
export const ensureDirectChat = async (userId1: string, userId2: string): Promise<Chat> => {
  if (!userId1 || !userId2) {
    throw new Error('Both user IDs are required to ensure a direct chat');
  }
  await assertDirectMessagingAllowed(userId1, userId2);
  // Normalize order (not strictly required but can help future caching strategies)
  const [a, b] = userId1 < userId2 ? [userId1, userId2] : [userId2, userId1];

  // 1. Fast path: query existing direct chat
  const existing = await findChatBetweenUsers(a, b);
  if (existing) {
    // Backfill initiator from legacy field if needed
    if (existing.isMessageRequest === true && !existing.initiator && (existing as any).messageRequestInitiatorId) {
      try {
        await updateDoc(doc(db, CHATS_COLLECTION, existing.id), { initiator: (existing as any).messageRequestInitiatorId });
        return { ...existing, initiator: (existing as any).messageRequestInitiatorId } as Chat;
      } catch (e) {
        console.warn('Failed to backfill initiator field on existing chat', e);
      }
    }
    return existing;
  }

  // Do NOT mark newly created direct chats as Message Requests here.
  // A Message Request should only be created when the first outgoing message
  // is actually sent by the initiator. This prevents profile views / chat opens
  // from creating requests prematurely.
  const shouldBeMessageRequest = false;
  const initiatorId = userId1; // the user who triggers creation (kept for potential later use)

  // 2. Deterministic document id to prevent racing duplicate creations
  const deterministicId = `direct_${a}_${b}`; // safe characters assumed in user IDs
  const chatRef = doc(collection(db, CHATS_COLLECTION), deterministicId);

  try {
    const chat = await runTransaction(db, async (tx) => {
      const snapshot = await tx.get(chatRef);
      if (snapshot.exists()) {
        // Another client created it during our pre-check
        return { id: snapshot.id, ...snapshot.data() } as Chat;
      }
      const now = Timestamp.now();
      const chatData: Omit<Chat, 'id'> = {
        participants: [a, b],
        createdAt: now,
        updatedAt: now,
        isGroupChat: false,
        unreadCount: { [a]: 0, [b]: 0 },
        lastMessage: null,
    theme: null,
    name: null,
    isMessageRequest: shouldBeMessageRequest,
    initiator: initiatorId,
    messageRequestInitiatorId: initiatorId
      };
      tx.set(chatRef, chatData);
      return { id: chatRef.id, ...chatData } as Chat;
    });
    // Do not notify here. Message request notifications are emitted when the
    // first outgoing message is actually sent (see sendMessage). This avoids
    // creating requests on profile view or chat open.
    return chat;
  } catch (err) {
    console.warn('Transaction ensureDirectChat failed, falling back to query:', err);
    // Fallback: re-query (another client probably created it)
    const fallback = await findChatBetweenUsers(a, b);
    if (fallback) return fallback;
    // Last resort: create new random ID chat (should be rare)
  const created = await createChat([a, b], false, undefined, undefined, shouldBeMessageRequest, initiatorId);
  // Do NOT notify or mark as message request in fallback here for the same reason.
  return created;
  }
};

/**
 * Accept a message request: flip the chat's isMessageRequest to false.
 */
export const acceptMessageRequest = async (chatId: string): Promise<void> => {
  try {
    const chatRef = doc(db, CHATS_COLLECTION, chatId);
    const chatDocSnap = await getDoc(chatRef);
    if (!chatDocSnap.exists()) throw new Error('Chat not found');
    await updateDoc(chatRef, {
      isMessageRequest: false,
      updatedAt: serverTimestamp()
    });
    // Clear message request notifications for both participants
    try {
      const chat = chatDocSnap.data() as Chat;
      const initiator = (chat as any).initiator ?? (chat as any).messageRequestInitiatorId;
      const recipients = chat.participants.filter(p => p !== initiator);
      await Promise.all(recipients.map(uid => clearMessageRequestNotification(uid, chatId)));
    } catch (e) {
      console.warn('Failed to clear message_request notifications on accept', e);
    }
  } catch (err) {
    console.error('Failed to accept message request:', err);
    throw err;
  }
};

/**
 * Decline a message request: delete all messages in the chat and the chat document itself.
 */
export const declineMessageRequest = async (chatId: string): Promise<void> => {
  try {
    // Delete messages in chunks (reuse pattern from adminDeleteConversation)
    const CHUNK_LIMIT = 450;
    let lastDocSnap: QueryDocumentSnapshot<DocumentData> | undefined = undefined;
    while (true) {
      let qBase = query(
        collection(db, MESSAGES_COLLECTION),
        where('chatId', '==', chatId),
        orderBy('createdAt', 'asc'),
        limit(CHUNK_LIMIT)
      );
      if (lastDocSnap) qBase = query(qBase, startAfter(lastDocSnap));
      const snap = await getDocs(qBase);
      if (snap.empty) break;
      const batch = writeBatch(db);
      snap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
      lastDocSnap = snap.docs[snap.docs.length - 1];
      if (snap.docs.length < CHUNK_LIMIT) break;
    }

    // Delete chat
    const chatRef = doc(db, CHATS_COLLECTION, chatId);
    // Best-effort: clear any message request notifications before deleting chat
    try {
      const existing = await getDoc(chatRef);
      if (existing.exists()) {
        const chat = existing.data() as Chat;
        const initiator = (chat as any).initiator ?? (chat as any).messageRequestInitiatorId;
        const recipients = chat.participants.filter(p => p !== initiator);
        await Promise.all(recipients.map(uid => clearMessageRequestNotification(uid, chatId)));
      }
    } catch {}
    await deleteDoc(chatRef);

    // Cleanup nicknames (best effort)
    try { await deleteAllChatNicknames(chatId); } catch (e) { console.warn('Nickname cleanup failed (declineMessageRequest)', e); }
  } catch (err) {
    console.error('Failed to decline message request:', err);
    throw err;
  }
};

/**
 * Add member to group (any member can add, up to 70)
 */
export const addGroupMember = async (chatId: string, userId: string, newMemberId: string) => {
  const chatRef = doc(db, CHATS_COLLECTION, chatId);
  const chatDoc = await getDoc(chatRef);
  if (!chatDoc.exists()) throw new Error('Chat not found');
  const chat = chatDoc.data() as Chat;
  if (!chat.isGroupChat) throw new Error('Not a group chat');
  if (!chat.participants.includes(userId)) throw new Error('Only group members can add');
  if (chat.participants.length >= 70) throw new Error('Group is full');
  if (chat.participants.includes(newMemberId)) throw new Error('User already in group');
  await updateDoc(chatRef, {
    participants: arrayUnion(newMemberId),
    unreadCount: { ...chat.unreadCount, [newMemberId]: 0 },
    updatedAt: serverTimestamp()
  });
};

/**
 * Remove member from group (admin only)
 */
export const removeGroupMember = async (chatId: string, adminId: string, memberId: string) => {
  const chatRef = doc(db, CHATS_COLLECTION, chatId);
  const chatDoc = await getDoc(chatRef);
  if (!chatDoc.exists()) throw new Error('Chat not found');
  const chat = chatDoc.data() as Chat;
  if (!chat.isGroupChat) throw new Error('Not a group chat');
  if (chat.adminId !== adminId) throw new Error('Only admin can remove members');
  if (!chat.participants.includes(memberId)) throw new Error('User not in group');
  await updateDoc(chatRef, {
    participants: arrayRemove(memberId),
    updatedAt: serverTimestamp()
  });
};

/**
 * Change group name (admin only)
 */
export const changeGroupName = async (chatId: string, adminId: string, newName: string) => {
  const chatRef = doc(db, CHATS_COLLECTION, chatId);
  const chatDoc = await getDoc(chatRef);
  if (!chatDoc.exists()) throw new Error('Chat not found');
  const chat = chatDoc.data() as Chat;
  if (!chat.isGroupChat) throw new Error('Not a group chat');
  if (chat.adminId !== adminId) throw new Error('Only admin can change group name');
  await updateDoc(chatRef, {
    name: newName,
    updatedAt: serverTimestamp()
  });
};

/**
 * Delete a group chat (admin only)
 */
export const deleteGroupChat = async (chatId: string, adminId: string) => {
  const chatRef = doc(db, CHATS_COLLECTION, chatId);
  const chatDoc = await getDoc(chatRef);
  if (!chatDoc.exists()) throw new Error('Chat not found');
  const chat = chatDoc.data() as Chat;
  if (!chat.isGroupChat) throw new Error('Not a group chat');
  if (chat.adminId !== adminId) throw new Error('Only admin can delete the group chat');
  
  try {
    // Delete all messages in the chat first
    const messagesQuery = query(collection(db, MESSAGES_COLLECTION), where('chatId', '==', chatId));
    const messagesSnapshot = await getDocs(messagesQuery);
    
    if (messagesSnapshot.docs.length > 0) {
      const batch = writeBatch(db);
      messagesSnapshot.forEach(msgDoc => batch.delete(msgDoc.ref));
      await batch.commit();
      console.log(`Deleted ${messagesSnapshot.docs.length} messages from group chat ${chatId}`);
    }
    
    // Delete the chat document
    await deleteDoc(chatRef);
    console.log(`Deleted group chat document ${chatId}`);
    
    // Verify the chat was actually deleted
    const verifyDoc = await getDoc(chatRef);
    if (verifyDoc.exists()) {
      throw new Error('Group chat document still exists after deletion attempt');
    }
    console.log(`Verified group chat ${chatId} was successfully deleted`);
    
    // Clean up nickname data for this chat
    try {
      await deleteAllChatNicknames(chatId);
      console.log(`Deleted nicknames for group chat ${chatId}`);
    } catch (error) {
      console.error('Error deleting chat nicknames:', error);
      // Don't throw here - nickname cleanup failure shouldn't block chat deletion
    }
    
  } catch (error) {
    console.error('Error in deleteGroupChat:', error);
    
    // If batch deletion failed, try deleting messages one by one
    if (error instanceof Error && error.message.includes('batch')) {
      console.log('Batch deletion failed, trying individual deletions...');
      
      try {
        const messagesQuery = query(collection(db, MESSAGES_COLLECTION), where('chatId', '==', chatId));
        const messagesSnapshot = await getDocs(messagesQuery);
        
        // Delete messages one by one
        for (const msgDoc of messagesSnapshot.docs) {
          await deleteDoc(msgDoc.ref);
        }
        console.log(`Deleted ${messagesSnapshot.docs.length} messages individually from group chat ${chatId}`);
        
        // Delete the chat document
        await deleteDoc(chatRef);
        console.log(`Deleted group chat document ${chatId} individually`);
        
        // Verify the chat was actually deleted
        const verifyDoc = await getDoc(chatRef);
        if (verifyDoc.exists()) {
          throw new Error('Group chat document still exists after individual deletion attempt');
        }
        console.log(`Verified group chat ${chatId} was successfully deleted individually`);
        
        // Clean up nicknames
        try {
          await deleteAllChatNicknames(chatId);
        } catch (nicknameError) {
          console.error('Error deleting nicknames in fallback:', nicknameError);
        }
        
      } catch (fallbackError) {
        console.error('Fallback deletion also failed:', fallbackError);
        throw new Error(`Failed to delete group chat: ${fallbackError instanceof Error ? fallbackError.message : 'Unknown error'}`);
      }
    } else {
      throw error;
    }
  }
};

/**
 * Delete a 1:1 chat for the current user only (hide from their view)
 */
export const deleteOneToOneChat = async (chatId: string, userId: string) => {
  console.log(`[DEBUG] Starting deleteOneToOneChat for chat ${chatId} by user ${userId}`);
  
  // Get the chat document
  const chatRef = doc(db, CHATS_COLLECTION, chatId);
  const chatDoc = await getDoc(chatRef);
  if (!chatDoc.exists()) throw new Error('Chat not found');
  const chat = chatDoc.data() as Chat;
  
  console.log(`[DEBUG] Chat data:`, chat);
  console.log(`[DEBUG] Chat participants:`, chat.participants);
  console.log(`[DEBUG] User ID:`, userId);
  console.log(`[DEBUG] Is user participant:`, chat.participants.includes(userId));
  console.log(`[DEBUG] Is group chat:`, chat.isGroupChat);
  
  if (chat.isGroupChat) throw new Error('Not a 1:1 chat');
  if (!chat.participants.includes(userId)) throw new Error('You are not a participant of this chat');

  try {
    // Only mark all existing messages in this chat as deleted for this user
    // Don't hide the entire conversation - keep it visible in chat list
  // NOTE: (Updated) We now ALSO record a per-user deletion timestamp so the
  // chat disappears from that user's chat list until a new message (with
  // createdAt > deletion timestamp) is sent. This mimics Messenger behavior:
  // deleting hides the thread for that user only; other participant still sees history.
    const messagesQuery = query(collection(db, MESSAGES_COLLECTION), where('chatId', '==', chatId));
    const messagesSnapshot = await getDocs(messagesQuery);
    
    console.log(`[DEBUG] Found ${messagesSnapshot.docs.length} messages to mark as deleted for user`);
    
    if (messagesSnapshot.docs.length > 0) {
      const batch = writeBatch(db);
      
      messagesSnapshot.forEach(msgDoc => {
        const messageData = msgDoc.data();
        const deletedForMe = messageData.deletedForMe || [];
        
        // Add this user to the deletedForMe array if not already there
        if (!deletedForMe.includes(userId)) {
          batch.update(msgDoc.ref, {
            deletedForMe: [...deletedForMe, userId]
          });
        }
      });
      
      await batch.commit();
      console.log(`[DEBUG] Successfully marked ${messagesSnapshot.docs.length} messages as deleted for user ${userId}`);
    }
    
    // Record per-user deletion timestamp (do NOT modify updatedAt so ordering for other user is stable)
    try {
      await updateDoc(chatRef, {
        [`userDeletes.${userId}`]: serverTimestamp()
      } as any);
      console.log(`[DEBUG] Stored per-user deletion timestamp for user ${userId} on chat ${chatId}`);
    } catch (tsErr) {
      console.error('[DEBUG] Failed to store per-user deletion timestamp', tsErr);
    }

    // Don't clear the global lastMessage; filtering logic will hide the chat entirely
    // until a new message arrives after deletion timestamp.
    console.log(`[DEBUG] Successfully marked messages & stored deletion marker for chat ${chatId} for user ${userId}`);
    
  } catch (error) {
    console.error(`[DEBUG] Error in deleteOneToOneChat:`, error);
    throw error;
  }
};

/**
 * Get paginated messages for a chat
 */
export const getPaginatedMessages = async (
  chatId: string,
  lastMessageId?: string,
  pageSize: number = 50,
  // Optional: pass the createdAt value of the boundary message to avoid an extra getDoc() call
  lastMessageCreatedAt?: Timestamp | number
): Promise<MessagePage> => {
  try {
    let messagesQuery = query(
      collection(db, MESSAGES_COLLECTION),
      where('chatId', '==', chatId),
      orderBy('createdAt', 'desc'),
      limit(pageSize + 1) // Get one extra to check if there are more
    );

    // Prefer using the provided createdAt value to page (avoids one extra read)
    if (typeof lastMessageCreatedAt !== 'undefined' && lastMessageCreatedAt !== null) {
      // startAfter accepts a field value when ordering by that field
      messagesQuery = query(messagesQuery, startAfter(lastMessageCreatedAt));
    } else if (lastMessageId) {
      // Backwards-compatible fallback: fetch the doc snapshot and start after it
      const lastDoc = await getDoc(doc(db, MESSAGES_COLLECTION, lastMessageId));
      if (lastDoc.exists()) {
        messagesQuery = query(messagesQuery, startAfter(lastDoc));
      }
    }

    const snapshot = await getDocs(messagesQuery);
    const messages: Message[] = [];
    let hasMore = false;

    snapshot.forEach((doc: QueryDocumentSnapshot<DocumentData>) => {
      if (messages.length < pageSize) {
        messages.push({
          id: doc.id,
          ...doc.data()
        } as Message);
      } else {
        hasMore = true;
      }
    });

    return {
      messages: messages.reverse(), // Reverse to get ascending order
      hasMore,
      lastMessageId: messages.length > 0 ? messages[messages.length - 1].id : null
    };
  } catch (error) {
    console.error('Error getting paginated messages:', error);
    throw error;
  }
};

/**
 * Add message to queue for offline/retry handling
 */
const addToMessageQueue = async (message: NewMessageData): Promise<string> => {
  const queueId = `queue-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  messageQueue.push({
    id: queueId,
    message,
    attempts: 0,
    lastAttempt: Date.now()
  });

  // Start processing queue if not already processing
  processMessageQueue();

  return queueId;
};

/**
 * Process message queue
 */
const processMessageQueue = async () => {
  if (messageQueue.length === 0) return;

  const now = Date.now();

  for (const queueItem of messageQueue) {
    // Skip if not enough time has passed since last attempt
    if (now - queueItem.lastAttempt < RETRY_DELAY) continue;

    // Skip if max attempts reached
    if (queueItem.attempts >= MAX_RETRY_ATTEMPTS) {
      // Remove from queue and emit failure event
      messageQueue = messageQueue.filter(item => item.id !== queueItem.id);
      window.dispatchEvent(new CustomEvent('messageFailed', { 
        detail: { queueId: queueItem.id, error: 'Max retry attempts reached' }
      }));
      continue;
    }

    try {
      // Attempt to send message
      const result = await sendMessage(
        queueItem.message.chatId,
        queueItem.message.senderId,
        queueItem.message.content,
        queueItem.message.type,
        queueItem.message.attachments || [],
        queueItem.message.replyTo
      );

      // Remove from queue on success
      messageQueue = messageQueue.filter(item => item.id !== queueItem.id);

      // Emit success event
      window.dispatchEvent(new CustomEvent('messageSuccess', { 
        detail: { queueId: queueItem.id, message: result }
      }));

    } catch (error) {
      // Update attempt count and timestamp
      queueItem.attempts++;
      queueItem.lastAttempt = now;

      console.error(`Failed to send queued message (attempt ${queueItem.attempts}):`, error);
    }
  }

  // Schedule next queue processing if items remain
  if (messageQueue.length > 0) {
    setTimeout(processMessageQueue, RETRY_DELAY);
  }
};

/**
 * Enhanced sendMessage with queue support
 */
export const sendMessageWithRetry = async (
  chatId: string,
  senderId: string,
  content: string,
  type: MessageType = 'text',
  attachments: string[] = [],
  replyTo?: string | null,
  clientMessageId?: string
): Promise<{ queueId: string; message?: Message }> => {
  const messageData: NewMessageData = {
    chatId,
    senderId,
    content: content.trim(),
    type,
    status: 'sent',
    createdAt: Timestamp.now(),
    attachments: type === 'text' ? null : attachments,
    replyTo: replyTo ?? null,
    readBy: [senderId],
    edited: false
  };

  try {
    // Attempt immediate send
    const result = await sendMessage(
      chatId,
      senderId,
      content,
      type,
      attachments,
      replyTo,
      clientMessageId
    );

    return { queueId: '', message: result };

  } catch (error) {
    // On failure, add to queue
    const queueId = await addToMessageQueue(messageData);
    return { queueId };
  }
};

/**
 * Send a message with improved error handling and offline support
 */
export const sendMessage = async (
  chatId: string,
  senderId: string,
  content: string,
  type: MessageType = 'text',
  attachments: string[] = [],
  replyTo?: string | null,
  clientMessageId?: string
): Promise<Message> => {
  try {
    // Input validation
    // Allow empty content for non-text messages when attachments are provided.
    const hasTextContent = !!(content && content.trim());
    const hasAttachments = Array.isArray(attachments) && attachments.length > 0;

    if (type === 'text') {
      if (!hasTextContent) {
        throw new Error('Message content cannot be empty');
      }
    } else {
      // For media/file/audio/system messages, require either attachments or text content
      if (!hasAttachments && !hasTextContent) {
        throw new Error('Message content cannot be empty');
      }
    }

    if (!chatId || !senderId) {
      throw new Error('Invalid chat or sender ID');
    }

    // Note: previously some roles (e.g., 'infirmary' and 'librarian') were blocked
    // from using messaging. That restriction was removed so those offices
    // can now access messaging features. Keep the role lookup for auditing
    // or future checks but do not prevent sending here.
    try {
      const senderDoc = await getDoc(doc(db, 'users', senderId));
      if (senderDoc.exists()) {
        const senderRole = (senderDoc.data() as any).role;
        // No-op: role is read for logging/auditing but not used to block messaging
        // console.debug('[MessageService] Sender role:', senderRole);
      }
    } catch (roleErr) {
      // Log the role lookup failure but don't block messaging on transient errors
      console.warn('[MessageService] Failed to verify sender role for messaging (non-fatal):', roleErr);
    }
    console.log('Sending message:', { chatId, senderId, content, type, replyTo });
    
    // Check for blocks before sending (for 1:1 chats)
    const chatRef = doc(db, CHATS_COLLECTION, chatId);
    const chatDoc = await getDoc(chatRef);
    
    if (chatDoc.exists()) {
      const chatData = chatDoc.data() as Chat;
      
      // Only check block status for 1:1 chats
      if (!chatData.isGroupChat && chatData.participants.length === 2) {
        // Get the other participant
        const otherUserId = chatData.participants.find(id => id !== senderId);
        
        if (otherUserId) {
          await assertDirectMessagingAllowed(senderId, otherUserId);
          // Check if either user has blocked the other
          const blockStatus = await checkMutualBlock(senderId, otherUserId);
          
          if (blockStatus.hasAnyBlock) {
            if (blockStatus.user1BlockedUser2) {
              throw new Error('You have blocked this user. Unblock them to send messages.');
            }
            if (blockStatus.user2BlockedUser1) {
              throw new Error('You cannot send messages to this user because they have blocked you.');
            }
          }
        }
      }
    }

    // Create message data with server timestamp
    const messageData: NewMessageData = {
      chatId,
      senderId,
      content: content.trim(),
      type,
      status: 'sent',
      createdAt: serverTimestamp(),
      attachments: type === 'text' ? null : attachments,
      replyTo: replyTo ?? null,
      readBy: [senderId],
      edited: false
    };

    // If a client-generated ID is supplied (optimistic UI), reuse it so the real message
    // replaces the optimistic placeholder instead of creating a duplicate entry.
    const newMessageRef = clientMessageId
      ? doc(collection(db, MESSAGES_COLLECTION), clientMessageId)
      : doc(collection(db, MESSAGES_COLLECTION));
    
    // Track participants who need to have their chat unarchived
    let participantsToUnarchive: string[] = [];
    
    try {
      // Use transaction to ensure atomic updates
    let autoAcceptedRequest = false;
    // If this send is the very first outgoing message in a direct chat,
    // we will create a Message Request (mark chat.isMessageRequest = true and set initiator).
    // The notification to the recipient will be sent after the transaction completes.
    let createMessageRequest = false;
    let requestRecipientId: string | null = null;
    await runTransaction(db, async (transaction: Transaction) => {
        // Get the chat first to verify it exists and get current data
        const chatRef = doc(db, CHATS_COLLECTION, chatId);
        const chatDoc = await transaction.get(chatRef);

        if (!chatDoc.exists()) {
          throw new Error('Chat not found');
        }

        const chatData = chatDoc.data() as Chat;
        
        // Create a new unread count object to avoid mutation
        const unreadCount = { ...chatData.unreadCount };
        
        // Clear the previous array and repopulate it in this transaction
        participantsToUnarchive = [];

        // Update unread counts for all participants except sender
        chatData.participants.forEach(userId => {
          if (userId !== senderId) {
            unreadCount[userId] = (unreadCount[userId] || 0) + 1;
            
            // Check if the recipient has archived this chat
            const isArchivedForRecipient = chatData.archived?.[userId] === true;
            if (isArchivedForRecipient) {
              console.log(`Auto-unarchiving chat ${chatId} for user ${userId} because they received a new message`);
              participantsToUnarchive.push(userId);
            }
          } else {
            // Ensure sender's unread count is 0
            unreadCount[userId] = 0;
          }
        });

        // Set the message data first
        transaction.set(newMessageRef, {
          ...messageData,
          id: newMessageRef.id // Include the ID in the document
        });

        // Prepare update object for chat
        const updateData: any = {
          lastMessage: {
            messageId: newMessageRef.id,
            content: messageData.content,
            senderId,
            createdAt: messageData.createdAt,
            type,
            status: 'sent',
            readBy: [senderId]
          },
          updatedAt: serverTimestamp(),
          unreadCount
        };

        // If this send is the first message in a new direct chat and the chat is not
        // already a message request, mark it as a Message Request and record the initiator.
        if (!chatData.isGroupChat && chatData.participants.length === 2 && !chatData.isMessageRequest && !chatData.lastMessage) {
          // Mark as a request and set initiator fields
          updateData.isMessageRequest = true;
          updateData.initiator = senderId;
          updateData.messageRequestInitiatorId = senderId;
          createMessageRequest = true;
          requestRecipientId = chatData.participants.find(p => p !== senderId) || null;
        }

        // If this is a message request and the sender is the receiver (not the initiator),
        // automatically accept the request by flipping isMessageRequest to false
        const initiatorId = (chatData as any).initiator ?? (chatData as any).messageRequestInitiatorId;
        if (chatData.isMessageRequest === true && initiatorId && senderId !== initiatorId) {
          updateData.isMessageRequest = false;
          autoAcceptedRequest = true;
        }
        
        // If any recipients had archived this chat, unarchive it for them
        participantsToUnarchive.forEach(userId => {
          updateData[`archived.${userId}`] = false;
        });
        
  // Update chat with last message, unread counts, archive status changes, and possible request acceptance
        transaction.update(chatRef, updateData);
      });

      // Construct and return the complete message object
      const sentMessage: Message = {
        id: newMessageRef.id,
        ...messageData
      } as Message;

      // Log extra information about any auto-unarchiving that happened
      if (participantsToUnarchive && participantsToUnarchive.length > 0) {
        console.log(`Auto-unarchived chat for ${participantsToUnarchive.length} participants:`, participantsToUnarchive);
      }

      console.log('Message sent successfully - chat should move to top:', sentMessage);
      
      // Get the chat participants and notify recipients of new message
      const chatDoc = await getDoc(doc(db, CHATS_COLLECTION, chatId));
      if (chatDoc.exists()) {
        const chatData = chatDoc.data() as Chat;
        // If this message auto-accepted a message request, clear the message request notification for this sender
        if (autoAcceptedRequest) {
          try { await clearMessageRequestNotification(senderId, chatId); } catch (e) { console.warn('Failed to clear message_request notification on auto-accept', e); }
        }

        // If we created a Message Request as part of sending this first outgoing message,
        // notify the recipient now (do this outside the transaction to avoid blocking).
        if (createMessageRequest && requestRecipientId) {
          try {
            await notifyMessageRequest(requestRecipientId, senderId, chatId);
          } catch (e) {
            console.warn('notifyMessageRequest failed after sendMessage', e);
          }
        }
        // Send notification to all participants except sender
        for (const participantId of chatData.participants) {
          if (participantId !== senderId) {
            try {
              // Play message sound immediately if this is the current user receiving a message
              // This creates a faster sound response than waiting for the notification system
              const currentUserId = auth.currentUser?.uid;
              
              // Only play sound if this is a genuinely new message to the current user
              // and it's not from the current user (don't play sound for own messages)
              if (participantId === currentUserId && senderId !== currentUserId) {
                // Store the last time we played a message sound for this sender
                const lastPlayKey = `last_msg_sound_${senderId}`;
                const lastPlayTime = parseInt(sessionStorage.getItem(lastPlayKey) || '0');
                const now = Date.now();
                
                // Only play sound if we haven't played one for this sender in the last 3 seconds
                if (now - lastPlayTime > 3000) {
                  // Record this play time
                  sessionStorage.setItem(lastPlayKey, now.toString());
                  
                  // Play sound directly for immediate feedback
                  if (playMessageSound) {
                    console.log(`⚡ Message sound for new message from ${senderId} to ${participantId}`);
                    playMessageSound();
                  } else {
                    console.warn('⚠️ No message sound player registered, cannot play sound');
                  }
                } else {
                  console.log(`Skipping sound for message from ${senderId} - too soon after last sound`);
                }
              }
              
              // Still create the notification for the drawer/notification center
              await notifyNewMessage(participantId, senderId, sentMessage.id);
            } catch (notifError) {
              console.error('Failed to send message notification:', notifError);
              // Continue execution even if notification fails
            }
          }
        }
      }
      
      return sentMessage;

    } catch (transactionError: unknown) {
      console.error('Transaction failed:', transactionError);
      if (transactionError instanceof Error) {
        throw new Error(`Failed to send message: ${transactionError.message}`);
      }
      throw new Error('Failed to send message: Unknown error occurred');
    }
  } catch (error) {
    console.error('Error in sendMessage:', error);
    throw error;
  }
};

/**
 * Queue message for read receipt
 */
export const queueReadReceipt = (
  chatId: string,
  userId: string,
  messageId: string
) => {
  const batchKey = `${chatId}-${userId}`;
  const now = Date.now();

  let batch = readReceiptBatches.get(batchKey);

  if (!batch) {
    batch = {
      chatId,
      userId,
      messageIds: new Set([messageId]),
      lastUpdate: now
    };
    readReceiptBatches.set(batchKey, batch);

    // Schedule processing
    setTimeout(() => processReadReceiptBatch(batchKey), READ_RECEIPT_BATCH_DELAY);
  } else {
    batch.messageIds.add(messageId);
    batch.lastUpdate = now;
  }
};

/**
 * Process read receipt batch
 */
const processReadReceiptBatch = async (batchKey: string) => {
  const batch = readReceiptBatches.get(batchKey);
  if (!batch) return;

  // Remove batch immediately to prevent duplicate processing
  readReceiptBatches.delete(batchKey);

  try {
    await markMessagesAsRead(
      batch.chatId,
      batch.userId,
      Array.from(batch.messageIds)
    );

    // Emit success event
    window.dispatchEvent(new CustomEvent('readReceiptSuccess', {
      detail: {
        chatId: batch.chatId,
        userId: batch.userId,
        messageIds: Array.from(batch.messageIds)
      }
    }));

  } catch (error) {
    console.error('Failed to process read receipts:', error);

    // Re-queue failed messages with backoff
    const now = Date.now();
    if (now - batch.lastUpdate < 60000) { // Only retry if less than 1 minute old
      readReceiptBatches.set(batchKey, {
        ...batch,
        lastUpdate: now
      });
      setTimeout(() => processReadReceiptBatch(batchKey), READ_RECEIPT_BATCH_DELAY * 2);
    }
  }
};

/**
 * Enhanced markMessagesAsRead with improved batching
 */
export const markMessagesAsReadBatched = async (
  chatId: string,
  userId: string,
  messageIds?: string[]
): Promise<void> => {
  if (!messageIds || messageIds.length === 0) return;

  // Queue each message ID
  messageIds.forEach(messageId => {
    queueReadReceipt(chatId, userId, messageId);
  });
};

/**
 * Get user chats with real-time updates
 */
export function getUserChats(
  userId: string, 
  callback: (chats: ChatWithDetails[]) => void,
  showArchived: boolean = false,
  options?: { fetchLastMessageDoc?: boolean; fetchParticipantDetails?: boolean }
): () => void {
  const { fetchLastMessageDoc = true, fetchParticipantDetails = true } = options || {};
  // Simple in-memory cache for user docs across snapshots (lives for session)
  // Keyed by userId
  const userCache: Map<string, User> = (getUserChats as any)._userCache || new Map();
  (getUserChats as any)._userCache = userCache;

  // Query for chats where user is a participant
  const chatsQuery = query(
    collection(db, CHATS_COLLECTION),
    where('participants', 'array-contains', userId),
    orderBy('updatedAt', 'desc')
  );

  // Helper: concurrency limiter
  const runLimited = async <T>(tasks: (() => Promise<T>)[], limit = 6): Promise<T[]> => {
    const results: T[] = [];
    let index = 0;
    return new Promise((resolve) => {
      let active = 0;
      const launch = () => {
        if (index >= tasks.length && active === 0) return resolve(results);
        while (active < limit && index < tasks.length) {
          const current = tasks[index++];
            active++;
            current().then(r => results.push(r)).catch(() => results.push(undefined as any)).finally(() => { active--; launch(); });
        }
      };
      launch();
    });
  };

  const unsubscribe = onSnapshot(chatsQuery, async (snapshot) => {
    const rawDocs = snapshot.docs;
    console.log(`[getUserChats] Snapshot with ${rawDocs.length} chats (archived filter=${showArchived})`);

    // Build lightweight skeletons first for instant paint.
    // Keep the raw chat.lastMessage metadata (if present) so the UI can render a
    // minimal last-message preview immediately while we optionally enrich it.
    const skeletons: ChatWithDetails[] = [];
    for (const d of rawDocs) {
      const c = d.data() as Chat;
      const archived = c.archived && c.archived[userId] === true;
      if (showArchived ? archived : !archived) {
        skeletons.push({
          ...c,
          id: d.id,
          participantDetails: [],
          // Preserve metadata from the chat document (messageId/content/senderId/createdAt)
          // so the list can show a lightweight preview without waiting for extra reads.
          lastMessage: (c as any).lastMessage || null,
          isGroupChat: c.isGroupChat || false,
          adminId: c.adminId || null
        });
      }
    }

    // Early callback with skeletons (no network awaited yet)
    if (skeletons.length) {
      callback(skeletons);
    }

    // Prepare detailed enrichment tasks
    const enriched: ChatWithDetails[] = [];
    const tasks = skeletons.map(skel => async () => {
      // Participant details (excluding current user) - optional lazy load
      const participantDetails: User[] = [];
      if (fetchParticipantDetails) {
        const toFetch: string[] = [];
        skel.participants.forEach(pid => {
          if (pid !== userId) {
            const cached = userCache.get(pid);
            if (cached) participantDetails.push(cached); else toFetch.push(pid);
          }
        });
        if (toFetch.length) {
          await Promise.all(toFetch.map(async pid => {
            try {
              const uDoc = await getDoc(doc(db, 'users', pid));
              if (uDoc.exists()) {
                const uData = uDoc.data() as User;
                userCache.set(pid, uData);
                participantDetails.push(uData);
              }
            } catch (e) {
              console.error('User fetch failed', pid, e);
            }
          }));
        }
      }

      // Last message handling (lightweight vs full fetch)
      let lastMessage: Message | null = null;
      // Track whether the Firestore chat doc had a lastMessage at all
      // (messages have been exchanged even if the enriched lastMessage is
      // nullified because it was hidden via deletedForMe for this user).
      const chatDocHadLastMessage = !!(skel.lastMessage && (skel as any).lastMessage.messageId);
      if (chatDocHadLastMessage) {
        const lmMeta = (skel as any).lastMessage; // Stored meta in chat doc
        if (fetchLastMessageDoc) {
          try {
            const lastMessageDoc = await getDoc(doc(db, MESSAGES_COLLECTION, lmMeta.messageId));
            if (lastMessageDoc.exists()) {
              const msgData = lastMessageDoc.data() as Message;
              const deletedForMe = (msgData as any).deletedForMe || [];
              if (!deletedForMe.includes(userId)) {
                lastMessage = msgData;
              }
            }
          } catch (e) {
            console.warn('Last message fetch failed', lmMeta?.messageId, e);
          }
        } else {
          // Build a minimal message object from metadata only (no extra read)
            lastMessage = {
              id: lmMeta.messageId,
              chatId: skel.id,
              senderId: lmMeta.senderId,
              content: lmMeta.content,
              type: lmMeta.type || 'text',
              status: lmMeta.status || 'sent',
              createdAt: lmMeta.createdAt,
              readBy: lmMeta.readBy || [],
              attachments: null,
              replyTo: null,
              edited: false
            } as Message;
        }
      }

      const chatWithDetails: ChatWithDetails = {
        ...skel,
        participantDetails,
        lastMessage,
        isGroupChat: skel.isGroupChat || false,
        adminId: skel.adminId || null,
        _chatDocHadMessages: chatDocHadLastMessage,
      } as ChatWithDetails;
      if (!chatWithDetails.isGroupChat && participantDetails.length === 1) {
        chatWithDetails.otherUser = participantDetails[0];
      } else if (chatWithDetails.isGroupChat) {
        chatWithDetails.users = participantDetails;
      }
      enriched.push(chatWithDetails);
      return chatWithDetails;
    });

    await runLimited(tasks, 8); // allow higher concurrency for speed

    // Dedupe direct chats
    const directChatMap = new Map<string, ChatWithDetails>();
    const duplicates: string[] = [];
    for (const c of enriched) {
      if (!c.isGroupChat && c.participants.length === 2) {
        const [x, y] = [...c.participants].sort();
        const key = `${x}__${y}`;
        const existing = directChatMap.get(key);
        const getTime = (chat: ChatWithDetails) => {
          const ts = (chat.lastMessage as any)?.timestamp || (chat.lastMessage as any)?.createdAt || chat.updatedAt;
          return ts && typeof ts.toMillis === 'function' ? ts.toMillis() : 0;
        };
        if (!existing) directChatMap.set(key, c); else {
          if (getTime(c) > getTime(existing)) {
            duplicates.push(existing.id); directChatMap.set(key, c);
          } else duplicates.push(c.id);
        }
      }
    }
    const deduped = enriched.filter(c => !duplicates.includes(c.id));

    // Filter out chats that have never had a message sent. The chat document
    // gets created as soon as the user opens a conversation, but we only want
    // to show/persist it in lists after a real message exists.
    // Mirror non-empty filtering for the combined subscription to keep active/archived tabs consistent.
    const nonEmptyChats = deduped.filter(chat => {
      if (chat.lastMessage) return true;
      if ((chat as any).isMessageRequest === true) return true;
      // Keep chats whose Firestore doc had a lastMessage even though
      // enrichment nullified it (e.g., the most recent message was
      // a call log hidden via deletedForMe for this user).
      if ((chat as any)._chatDocHadMessages) return true;
      return false;
    });

    // Filter out chats deleted by this user that have no new messages after deletion timestamp.
    const nowVisible: ChatWithDetails[] = [];
    for (const c of nonEmptyChats) {
      const deletionTimestamp: any = (c as any).userDeletes?.[userId];
      if (!deletionTimestamp) {
        nowVisible.push(c); continue;
      }
      const deletionMillis = deletionTimestamp && typeof deletionTimestamp.toMillis === 'function' ? deletionTimestamp.toMillis() : 0;
      const lastMsg = (c.lastMessage as any)?.createdAt || (c.lastMessage as any)?.timestamp;
      const lastMsgMillis = lastMsg && typeof lastMsg.toMillis === 'function' ? lastMsg.toMillis() : 0;
      // If no new messages after deletion, hide chat
      if (lastMsgMillis <= deletionMillis) {
        continue; // skip
      }
      // Chat has new activity after deletion -> show (old history already hidden by per-message marks)
      nowVisible.push(c);
    }

    nowVisible.sort((a, b) => {
      const getTime = (chat: ChatWithDetails) => {
        const ts = (chat.lastMessage as any)?.timestamp || (chat.lastMessage as any)?.createdAt || chat.updatedAt;
        return ts && typeof ts.toMillis === 'function' ? ts.toMillis() : 0;
      };
      return getTime(b) - getTime(a);
    });

    callback(nowVisible);
  });

  return unsubscribe;
}

/**
 * Get user chats (both active and archived) with a single realtime subscription.
 * Returns an object { active: ChatWithDetails[], archived: ChatWithDetails[] }
 * This is useful when a UI needs to toggle between messages and archives without
 * re-subscribing to Firestore (avoids duplicate work and flicker).
 */
export function getUserChatsCombined(
  userId: string,
  callback: (lists: { active: ChatWithDetails[]; archived: ChatWithDetails[] }) => void,
  options?: { fetchLastMessageDoc?: boolean; fetchParticipantDetails?: boolean; earlySkeletons?: boolean }
): () => void {
  const { fetchLastMessageDoc = true, fetchParticipantDetails = true, earlySkeletons = false } = options || {};
  // Reuse a lightweight per-function cache to avoid repeated user fetches
  const userCache: Map<string, User> = (getUserChatsCombined as any)._userCache || new Map();
  (getUserChatsCombined as any)._userCache = userCache;

  const chatsQuery = query(
    collection(db, CHATS_COLLECTION),
    where('participants', 'array-contains', userId),
    orderBy('updatedAt', 'desc')
  );

  const runLimited = async <T>(tasks: (() => Promise<T>)[], limit = 8): Promise<T[]> => {
    const results: T[] = [];
    let index = 0;
    return new Promise((resolve) => {
      let active = 0;
      const launch = () => {
        if (index >= tasks.length && active === 0) return resolve(results);
        while (active < limit && index < tasks.length) {
          const current = tasks[index++];
          active++;
          current().then(r => results.push(r)).catch(() => results.push(undefined as any)).finally(() => { active--; launch(); });
        }
      };
      launch();
    });
  };

  const unsubscribe = onSnapshot(chatsQuery, async (snapshot) => {
    const rawDocs = snapshot.docs;

    // Build skeletons for instant paint
    const skeletons: ChatWithDetails[] = rawDocs.map(d => {
      const c = d.data() as Chat;
      return {
        ...c,
        id: d.id,
        participantDetails: [],
        // Preserve the chat document's lastMessage metadata for immediate rendering.
        lastMessage: (c as any).lastMessage || null,
        isGroupChat: c.isGroupChat || false,
        adminId: c.adminId || null
      } as ChatWithDetails;
    });

    if (earlySkeletons && skeletons.length) {
      // Early callback with empty-enriched skeletons split into active/archived
      const earlyActive = skeletons.filter(s => !(s.archived && s.archived[userId] === true));
      const earlyArchived = skeletons.filter(s => s.archived && s.archived[userId] === true);
      callback({ active: earlyActive, archived: earlyArchived });
    }

    // Enrichment tasks (participant details + lastMessage doc)
    const enriched: ChatWithDetails[] = [];
    const tasks = skeletons.map(skel => async () => {
      const participantDetails: User[] = [];
      if (fetchParticipantDetails) {
        const toFetch: string[] = [];
        skel.participants.forEach(pid => {
          if (pid !== userId) {
            const cached = userCache.get(pid);
            if (cached) participantDetails.push(cached); else toFetch.push(pid);
          }
        });
        if (toFetch.length) {
          await Promise.all(toFetch.map(async pid => {
            try {
              const uDoc = await getDoc(doc(db, 'users', pid));
              if (uDoc.exists()) {
                const uData = uDoc.data() as User;
                userCache.set(pid, uData);
                participantDetails.push(uData);
              }
            } catch (e) {
              console.error('User fetch failed', pid, e);
            }
          }));
        }
      }

      let lastMessage: Message | null = null;
      // Track whether the Firestore chat document already had a lastMessage
      // (i.e., messages have been exchanged in this chat at some point).
      // This flag survives even when the enriched lastMessage is nullified
      // because the message was hidden for the current user (e.g., call log
      // messages hidden via deletedForMe).
      const chatDocHadLastMessage = !!(skel as any).lastMessage && !!(skel as any).lastMessage.messageId;

      if (chatDocHadLastMessage) {
        const lmMeta = (skel as any).lastMessage;
        if (fetchLastMessageDoc) {
          try {
            const lastMessageDoc = await getDoc(doc(db, MESSAGES_COLLECTION, lmMeta.messageId));
            if (lastMessageDoc.exists()) {
              const msgData = lastMessageDoc.data() as Message;
              const deletedForMe = (msgData as any).deletedForMe || [];
              if (!deletedForMe.includes(userId)) {
                lastMessage = msgData;
              }
            }
          } catch (e) {
            console.warn('Last message fetch failed', lmMeta?.messageId, e);
          }
        } else {
          lastMessage = {
            id: lmMeta.messageId,
            chatId: skel.id,
            senderId: lmMeta.senderId,
            content: lmMeta.content,
            type: lmMeta.type || 'text',
            status: lmMeta.status || 'sent',
            createdAt: lmMeta.createdAt,
            readBy: lmMeta.readBy || [],
            attachments: null,
            replyTo: null,
            edited: false
          } as Message;
        }
      }

      const chatWithDetails: ChatWithDetails = {
        ...skel,
        participantDetails,
        lastMessage,
        isGroupChat: skel.isGroupChat || false,
        adminId: skel.adminId || null,
        _chatDocHadMessages: chatDocHadLastMessage,
      } as ChatWithDetails;
      if (!chatWithDetails.isGroupChat && participantDetails.length === 1) chatWithDetails.otherUser = participantDetails[0];
      if (chatWithDetails.isGroupChat) chatWithDetails.users = participantDetails;
      enriched.push(chatWithDetails);
      return chatWithDetails;
    });

    await runLimited(tasks, 8);

    // Dedupe direct chats (same logic as getUserChats)
    const directChatMap = new Map<string, ChatWithDetails>();
    const duplicates: string[] = [];
    for (const c of enriched) {
      if (!c.isGroupChat && c.participants.length === 2) {
        const [x, y] = [...c.participants].sort();
        const key = `${x}__${y}`;
        const existing = directChatMap.get(key);
        const getTime = (chat: ChatWithDetails) => {
          const ts = (chat.lastMessage as any)?.timestamp || (chat.lastMessage as any)?.createdAt || chat.updatedAt;
          return ts && typeof ts.toMillis === 'function' ? ts.toMillis() : 0;
        };
        if (!existing) directChatMap.set(key, c); else {
          if (getTime(c) > getTime(existing)) {
            duplicates.push(existing.id); directChatMap.set(key, c);
          } else duplicates.push(c.id);
        }
      }
    }
    const deduped = enriched.filter(c => !duplicates.includes(c.id));

    const nonEmptyChats = deduped.filter(chat => {
      if (chat.lastMessage) return true;
      if ((chat as any).isMessageRequest === true) return true;
      // Keep chats whose Firestore doc had a lastMessage even though
      // enrichment nullified it (e.g., the most recent message was
      // a call log hidden via deletedForMe for this user).
      if ((chat as any)._chatDocHadMessages) return true;
      return false;
    });

    // Filter out chats deleted by this user (same logic)
    const nowVisible: ChatWithDetails[] = [];
    for (const c of nonEmptyChats) {
      const deletionTimestamp: any = (c as any).userDeletes?.[userId];
      if (!deletionTimestamp) { nowVisible.push(c); continue; }
      const deletionMillis = deletionTimestamp && typeof deletionTimestamp.toMillis === 'function' ? deletionTimestamp.toMillis() : 0;
      const lastMsg = (c.lastMessage as any)?.createdAt || (c.lastMessage as any)?.timestamp;
      const lastMsgMillis = lastMsg && typeof lastMsg.toMillis === 'function' ? lastMsg.toMillis() : 0;
      if (lastMsgMillis <= deletionMillis) continue;
      nowVisible.push(c);
    }

    // Split into active and archived for this user
    const active = nowVisible.filter(c => !(c.archived && c.archived[userId] === true));
    const archived = nowVisible.filter(c => c.archived && c.archived[userId] === true);

    // Sort both lists by last activity
    const sortByTime = (a: ChatWithDetails, b: ChatWithDetails) => {
      const tA = (a.lastMessage as any)?.timestamp || (a.lastMessage as any)?.createdAt || a.updatedAt;
      const tB = (b.lastMessage as any)?.timestamp || (b.lastMessage as any)?.createdAt || b.updatedAt;
      const ta = tA && typeof (tA as any)?.toMillis === 'function' ? (tA as any).toMillis() : 0;
      const tb = tB && typeof (tB as any)?.toMillis === 'function' ? (tB as any).toMillis() : 0;
      return tb - ta;
    };

    active.sort(sortByTime);
    archived.sort(sortByTime);

    callback({ active, archived });
  });

  return unsubscribe;
}

/**
 * Get all chats (admin / super admin monitoring) with real-time updates.
 * This returns chats ordered by updatedAt desc limited by limitCount.
 * WARNING: Potentially heavy. Use only for privileged monitoring UI.
 */
export function getAllChats(
  callback: (chats: ChatWithDetails[]) => void,
  limitCount: number = 200
): () => void {
  const chatsQuery = query(
    collection(db, CHATS_COLLECTION),
    orderBy('updatedAt', 'desc'),
    limit(limitCount)
  );

  const userCache: Map<string, User> = (getAllChats as any)._userCache || new Map();
  (getAllChats as any)._userCache = userCache;

  const unsubscribe = onSnapshot(chatsQuery, async (snapshot) => {
    try {
      const chatDocs = snapshot.docs.map(d => {
        const data = d.data() as Chat;
        return { ...(data as any), id: d.id } as Chat;
      });
      // Enrich with participant details (best-effort, cached)
      const participantIds = new Set<string>();
      chatDocs.forEach(c => c.participants.forEach(pid => participantIds.add(pid)));
      const fetchIds: string[] = [];
      participantIds.forEach(pid => { if (!userCache.has(pid)) fetchIds.push(pid); });
      if (fetchIds.length) {
        await Promise.all(fetchIds.slice(0, 100).map(async pid => { // cap to avoid overload
          try {
            const uSnap = await getDoc(doc(db, USERS_COLLECTION, pid));
            if (uSnap.exists()) userCache.set(pid, { id: pid, ...(uSnap.data() as any) });
          } catch (e) { console.warn('getAllChats user fetch failed', pid, e); }
        }));
      }
      const enriched: ChatWithDetails[] = chatDocs.map(c => {
        const participantDetails = c.participants.map(pid => userCache.get(pid)).filter(Boolean) as User[];
        return {
          ...c,
            participantDetails,
            isGroupChat: c.isGroupChat || false,
            adminId: c.adminId || null,
            lastMessage: c.lastMessage as any
        };
      });
      callback(enriched);
    } catch (err) {
      console.error('getAllChats snapshot processing error', err);
    }
  });
  return unsubscribe;
}

/**
 * Update messages to 'delivered' status when received by the client
 * This will run automatically when messages are loaded
 */
export const updateMessagesDeliveryStatus = async (
  chatId: string,
  userId: string
): Promise<void> => {
  try {
    console.log(`Updating delivery status for messages in chat ${chatId}`);
    // Query for messages in this chat
    const messagesQuery = query(
      collection(db, MESSAGES_COLLECTION),
      where('chatId', '==', chatId),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    const messagesSnapshot = await getDocs(messagesQuery);

    if (messagesSnapshot.empty) {
      console.log('No messages found in chat');
      return;
    }

    // Filter client-side for messages that need to be marked as delivered
    const messagesToUpdate = messagesSnapshot.docs.filter(doc => {
      const data = doc.data();
      return data.senderId !== userId && data.status === 'sent';
    });

    console.log(`Found ${messagesToUpdate.length} messages to mark as delivered`);

    if (messagesToUpdate.length === 0) return;

    // Update each message to 'delivered' status
    const updatePromises = messagesToUpdate.map(docSnapshot => {
      const messageRef = doc(db, MESSAGES_COLLECTION, docSnapshot.id);
      console.log(`Marking message ${docSnapshot.id} as delivered`);
      return updateDoc(messageRef, {
        status: 'delivered'
      });
    });

    await Promise.all(updatePromises);
    console.log(`Successfully marked ${updatePromises.length} messages as delivered`);
  } catch (error) {
    console.error('Error updating message delivery status:', error);
  }
};

/**
 * Get messages for a chat with real-time updates
 */
export function getChatMessages(
  chatId: string,
  callback: (messages: Message[]) => void,
  limitCount: number = 50
): () => void {
  // First update delivery status
  const userId = auth.currentUser?.uid;
  if (userId) {
    updateMessagesDeliveryStatus(chatId, userId).catch(console.error);
  }

  console.log(`Setting up real-time message listener for chat ${chatId}`);

  // Query for messages in this chat, ordered by timestamp
  const messagesQuery = query(
    collection(db, MESSAGES_COLLECTION),
    where('chatId', '==', chatId),
    orderBy('createdAt', 'desc'), // Changed to desc for better initial load
    limit(limitCount)
  );

  // Subscribe to real-time updates with error handling and retry logic
  const unsubscribe = onSnapshot(
    messagesQuery, 
    { includeMetadataChanges: true }, // Add this to ensure we get all changes
    async (snapshot) => {
      const messages: Message[] = [];
      let hasChanges = false;

      // Log any changes for debugging
      snapshot.docChanges().forEach((change) => {
        console.log(`Message change detected - type: ${change.type}, id: ${change.doc.id}, hasPendingWrites: ${change.doc.metadata.hasPendingWrites}`);
        hasChanges = true;
      });
      
      // Get chat details to check participants for blocking
      let chatParticipants: string[] = [];
      let blockStatus: {[key: string]: boolean} = {};
      
      try {
        const chatDoc = await getDoc(doc(db, CHATS_COLLECTION, chatId));
        if (chatDoc.exists()) {
          chatParticipants = chatDoc.data().participants || [];
          
          // For each pair of participants, check if they've blocked each other
          if (userId && chatParticipants.length === 2 && !chatDoc.data().isGroupChat) {
            // This is a 1:1 chat, get the other participant
            const otherUserId = chatParticipants.find(id => id !== userId);
            if (otherUserId) {
              // Check for mutual blocks
              const mutualBlockStatus = await checkMutualBlock(userId, otherUserId);
              blockStatus = {
                [`${userId}_${otherUserId}`]: mutualBlockStatus.user1BlockedUser2,
                [`${otherUserId}_${userId}`]: mutualBlockStatus.user2BlockedUser1
              };
            }
          }
        }
      } catch (error) {
        console.error('Error checking chat participants for blocks:', error);
      }

      // Process all documents
      snapshot.forEach((doc) => {
        if (doc.exists()) {
          const messageData = doc.data();

          // Skip messages that this user has deleted for themselves
          if (userId && messageData.deletedForMe && messageData.deletedForMe.includes(userId)) {
            console.log(`Filtering out message ${doc.id} that was deleted for user ${userId}`);
            return;
          }
          
          // Handle blocked messages - show system messages and user's own messages regardless of blocks
          if (messageData.type !== 'system' && messageData.senderId !== userId && userId) {
            // Check if sender has blocked the current user or vice versa
            const blockKey = `${messageData.senderId}_${userId}`;
            const reverseBlockKey = `${userId}_${messageData.senderId}`;
            
            // If a block status was found, respect it - but don't hide messages sent before block
            const messageTime = messageData.createdAt?.toMillis() || 0;
            const now = Date.now();
            const isRecentMessage = (now - messageTime) < (24 * 60 * 60 * 1000); // 24 hours

            // Only apply block filtering to recent messages
            if (isRecentMessage && (blockStatus[blockKey] || blockStatus[reverseBlockKey])) {
              console.log(`Filtering out message ${doc.id} due to block status`);
              return;
            }
          }

          messages.push({
            id: doc.id,
            ...messageData
          } as Message);
        }
      });

      // Sort messages by timestamp (newest last)
      messages.sort((a, b) => {
  const getTime = (msg: Message) => (msg.createdAt instanceof Timestamp) ? msg.createdAt.toMillis() : 0;
  return getTime(a) - getTime(b);
      });

      console.log(`Received ${messages.length} messages for chat ${chatId}`);

      // Only trigger callback if we have messages or detected changes
      if (messages.length > 0 || hasChanges) {
        callback(messages);
      }
    }, 
    (error) => {
      console.error("Error in chat messages listener:", error);

      // Implement exponential backoff for retries
      let retryCount = 0;
      const maxRetries = 5;
      const baseDelay = 1000; // 1 second

      const retryConnection = () => {
        if (retryCount >= maxRetries) {
          console.error("Max retry attempts reached for chat messages");
          return;
        }

        const delay = Math.min(baseDelay * Math.pow(2, retryCount), 30000); // Max 30 second delay
        console.log(`Attempting to reestablish chat message connection in ${delay}ms (attempt ${retryCount + 1}/${maxRetries})`);

        setTimeout(() => {
          retryCount++;
          getChatMessages(chatId, callback, limitCount);
        }, delay);
      };

      retryConnection();
    }
  );

  return unsubscribe;
}

/**
 * Optimized real-time listener (ascending order + incremental changes)
 * Does not re-fetch chat doc each snapshot (caller supplies block/deletion filtering externally if needed).
 */
export function listenToRecentMessages(
  chatId: string,
  onInit: (messages: Message[]) => void,
  onChanges: (changes: { type: 'added'|'modified'|'removed'; message: Message; newIndex: number }) => void,
  limitCount: number = 50
): () => void {
  const qAsc = query(
    collection(db, MESSAGES_COLLECTION),
    where('chatId', '==', chatId),
    orderBy('createdAt','asc'),
    limitToLast(limitCount)
  );

  let initialized = false;
  const unsubscribe = onSnapshot(qAsc, (snap) => {
    if (!initialized) {
      const base: Message[] = [];
      snap.forEach(d => { if (d.exists()) base.push({ id: d.id, ...(d.data() as any) }); });
      onInit(base);
      initialized = true;
      return; // Next snapshot will carry docChanges relative to this base
    }
    snap.docChanges().forEach(change => {
      if (!change.doc.exists()) return;
      const msg: Message = { id: change.doc.id, ...(change.doc.data() as any) };
      onChanges({ type: change.type as any, message: msg, newIndex: change.newIndex });
    });
  });
  return unsubscribe;
}

/**
 * Edit a message
 */
export const editMessage = async (
  messageId: string,
  newContent: string
): Promise<void> => {
  try {
    const messageRef = doc(db, MESSAGES_COLLECTION, messageId);
    await updateDoc(messageRef, {
      content: newContent,
      edited: true
    });
  } catch (error) {
    console.error('Error editing message:', error);
    throw error;
  }
};

/**
 * Get user total unread message count
 */
export function getUserUnreadCount(
  userId: string,
  callback: (count: number) => void
): () => void {
  const chatsQuery = query(
    collection(db, CHATS_COLLECTION),
    where('participants', 'array-contains', userId)
  );

  const unsubscribe = onSnapshot(chatsQuery, (snapshot) => {
    let totalUnread = 0;

    snapshot.forEach((doc) => {
      const chatData = doc.data() as Chat;
      if (chatData.unreadCount && chatData.unreadCount[userId]) {
        totalUnread += chatData.unreadCount[userId];
      }
    });

    callback(totalUnread);
  });

  return unsubscribe;
};

/**
 * Archive a chat for a specific user
 */
export const archiveChat = async (chatId: string, userId: string): Promise<void> => {
  try {
    console.log(`Archiving chat ${chatId} for user ${userId}`);
    const chatRef = doc(db, CHATS_COLLECTION, chatId);
    const chatDoc = await getDoc(chatRef);
    if (!chatDoc.exists()) {
      throw new Error('Chat not found');
    }
    
    // Log current state
    const chatData = chatDoc.data();
    console.log(`Chat before archive:`, chatData.archived || {});
    
    await updateDoc(chatRef, {
      [`archived.${userId}`]: true
    });
    console.log(`Successfully archived chat ${chatId} for user ${userId}`);
  } catch (error) {
    console.error('Error archiving chat:', error);
    throw error;
  }
};

/**
 * Unarchive a chat for a specific user
 */
export const unarchiveChat = async (chatId: string, userId: string): Promise<void> => {
  try {
    console.log(`Unarchiving chat ${chatId} for user ${userId}`);
    const chatRef = doc(db, CHATS_COLLECTION, chatId);
    const chatDoc = await getDoc(chatRef);
    if (!chatDoc.exists()) {
      throw new Error('Chat not found');
    }
    
    // Log current state
    const chatData = chatDoc.data();
    console.log(`Chat before unarchive:`, chatData.archived || {});
    
    await updateDoc(chatRef, {
      [`archived.${userId}`]: false
    });
    console.log(`Successfully unarchived chat ${chatId} for user ${userId}`);
  } catch (error) {
    console.error('Error unarchiving chat:', error);
    throw error;
  }
};

/**
 * Mark messages as read with improved batching
 */
export const markMessagesAsRead = async (
  chatId: string,
  userId: string,
  messageIds?: string[]
): Promise<void> => {
  try {
    if (!chatId || !userId) {
      throw new Error('Invalid chat or user ID');
    }

    const batchSize = 500; // Firestore batch limit
    const batches: WriteBatch[] = [writeBatch(db)];
    let operationCount = 0;
    let currentBatch = 0;

    // Get messages to update
    let messagesQuery;
    
    if (messageIds && messageIds.length > 0) {
      // If specific messageIds are provided, query those
      messagesQuery = query(
        collection(db, MESSAGES_COLLECTION),
        where(documentId(), 'in', messageIds)
      );
    } else {
      // Otherwise, query messages not read by this user
      // Firestore doesn't allow '!=' with 'not-in' in the same query
      // So we'll just get all messages and filter client-side
      messagesQuery = query(
        collection(db, MESSAGES_COLLECTION),
        where('chatId', '==', chatId)
      );
    }

    const messageSnapshots = await getDocs(messagesQuery);

    // Process messages in batches
    for (const messageDoc of messageSnapshots.docs) {
      const messageData = messageDoc.data();

      // Skip messages from the current user or already read by the user
      if (messageData.chatId !== chatId || 
          messageData.senderId === userId || 
          (messageData.readBy && messageData.readBy.includes(userId))) {
        continue;
      }

      // Create new batch if current one is full
      if (operationCount === batchSize) {
        batches.push(writeBatch(db));
        currentBatch++;
        operationCount = 0;
      }

      // Update message
      batches[currentBatch].update(
        doc(db, MESSAGES_COLLECTION, messageDoc.id),
        { 
          readBy: arrayUnion(userId),
          status: 'read'
        }
      );
      operationCount++;
    }

    // Only proceed if we have operations to perform
    if (operationCount > 0) {
      // Update chat's unread count
      const chatRef = doc(db, CHATS_COLLECTION, chatId);
      const chatDoc = await getDoc(chatRef);

      if (chatDoc.exists()) {
        const chatData = chatDoc.data() as Chat;
        const unreadCount = { ...chatData.unreadCount };

        if (unreadCount[userId]) {
          unreadCount[userId] = 0;

          // Add this to the last batch or create a new one if needed
          if (operationCount === batchSize) {
            batches.push(writeBatch(db));
            currentBatch++;
          }

          batches[currentBatch].update(chatRef, { unreadCount });
        }
      }

      // Commit all batches
      await Promise.all(batches.map(batch => batch.commit()));
    }
  } catch (error) {
    console.error('Error marking messages as read:', error);
    throw error;
  }
};

/**
 * Delete a message
 */
export const deleteMessage = async (messageId: string): Promise<void> => {
  try {
    const messageRef = doc(db, MESSAGES_COLLECTION, messageId);
    const messageDoc = await getDoc(messageRef);

    if (!messageDoc.exists()) {
      throw new Error('Message not found');
    }

    const messageData = messageDoc.data();
    const chatRef = doc(db, CHATS_COLLECTION, messageData.chatId);
    const chatDoc = await getDoc(chatRef);

    if (!chatDoc.exists()) {
      throw new Error('Chat not found');
    }

    const chatData = chatDoc.data();

    // If this is the last message in the chat, determine the new last message
    if (chatData.lastMessage?.messageId === messageId) {
      // Fetch top 2 most recent messages (including the one we're about to delete)
      const recentQuery = query(
        collection(db, MESSAGES_COLLECTION),
        where('chatId', '==', messageData.chatId),
        orderBy('createdAt', 'desc'),
        limit(2)
      );
      const recentSnap = await getDocs(recentQuery);
      // Find the first message that's not the one being deleted
      const replacement = recentSnap.docs.find(d => d.id !== messageId);
      await updateDoc(chatRef, {
        lastMessage: replacement ? {
          messageId: replacement.id,
            content: replacement.data().content,
            senderId: replacement.data().senderId,
            createdAt: replacement.data().createdAt,
            type: replacement.data().type,
            status: replacement.data().status,
            readBy: replacement.data().readBy
        } : null,
        updatedAt: serverTimestamp()
      });
    }

    // Delete the message
    await deleteDoc(messageRef);
  } catch (error) {
    console.error('Error deleting message:', error);
    throw error;
  }
};

/**
 * Admin/super admin hard delete of a message (bypasses ownership)
 * Includes verification of role to avoid accidental exposure.
 */
export const adminDeleteMessage = async (messageId: string, adminUserId: string): Promise<void> => {
  try {
    // Verify role
    const adminDoc = await getDoc(doc(db, USERS_COLLECTION, adminUserId));
    if (!adminDoc.exists()) throw new Error('Admin user not found');
    const role = (adminDoc.data() as any).role;
    if (role !== 'admin' && role !== 'super admin') throw new Error('Not authorized');

    await deleteMessage(messageId);
  } catch (err) {
    console.error('[ADMIN] Failed to delete message', err);
    throw err;
  }
};

/**
 * Admin/super admin full conversation deletion.
 * Removes chat doc plus all messages irrespective of participation of admin account.
 */
export const adminDeleteConversation = async (chatId: string, adminUserId: string): Promise<void> => {
  try {
    const adminDoc = await getDoc(doc(db, USERS_COLLECTION, adminUserId));
    if (!adminDoc.exists()) throw new Error('Admin user not found');
    const role = (adminDoc.data() as any).role;
    if (role !== 'admin' && role !== 'super admin') throw new Error('Not authorized');

    const chatRef = doc(db, CHATS_COLLECTION, chatId);
    const chatDoc = await getDoc(chatRef);
    if (!chatDoc.exists()) throw new Error('Chat not found');

    // Chunked deletion strategy: paginate through messages ordered by createdAt
    const CHUNK_LIMIT = 450; // leave headroom below 500 write limit per batch
    let totalDeleted = 0;
    let lastDoc: QueryDocumentSnapshot<DocumentData> | undefined = undefined;
    let iteration = 0;

    while (true) {
      iteration++;
      let baseQuery = query(
        collection(db, MESSAGES_COLLECTION),
        where('chatId', '==', chatId),
        orderBy('createdAt', 'asc'),
        limit(CHUNK_LIMIT)
      );
      if (lastDoc) {
        baseQuery = query(baseQuery, startAfter(lastDoc));
      }
      const snap = await getDocs(baseQuery);
      if (snap.empty) break;

      const batch = writeBatch(db);
      snap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
      totalDeleted += snap.docs.length;
      lastDoc = snap.docs[snap.docs.length - 1];

      // If fewer than chunk limit returned, we're done
      if (snap.docs.length < CHUNK_LIMIT) break;
    }

    // Delete chat last (so messages query works while deleting)
    await deleteDoc(chatRef);

    try { await deleteAllChatNicknames(chatId); } catch (e) { console.warn('Nickname cleanup failed (adminDeleteConversation)', e); }
    console.log(`[ADMIN] Deleted conversation ${chatId} with ${totalDeleted} messages (iterations=${iteration})`);
  } catch (err) {
    console.error('[ADMIN] Failed to delete conversation', err);
    throw err;
  }
};

/**
 * Hide a message for a specific user without deleting it for everyone
 * This adds the user's ID to a 'deletedForMe' array on the message
 */
export const hideMessageForUser = async (
  messageId: string,
  userId: string
): Promise<void> => {
  try {
    const messageRef = doc(db, MESSAGES_COLLECTION, messageId);
    const messageDoc = await getDoc(messageRef);

    if (!messageDoc.exists()) {
      throw new Error('Message not found');
    }

    // Add the user ID to the deletedForMe array
    await updateDoc(messageRef, {
      deletedForMe: arrayUnion(userId)
    });

    console.log(`Message ${messageId} hidden for user ${userId}`);
  } catch (error) {
    console.error('Error hiding message for user:', error);
    throw error;
  }
};

/**
 * Add a reaction to a message
 * @param messageId The ID of the message to react to
 * @param userId The ID of the user reacting
 * @param reactionType The type of reaction (e.g., heart, haha, love, sob, sad, angry)
 */
export const addMessageReaction = async (
  messageId: string,
  userId: string,
  reactionType: string
): Promise<boolean> => {
  try {
    const messageRef = doc(db, MESSAGES_COLLECTION, messageId);
    await runTransaction(db, async (transaction) => {
      const messageSnap = await transaction.get(messageRef);
      if (!messageSnap.exists()) {
        throw new Error('Message not found');
      }

      const data = messageSnap.data() as any;
      const currentReactions = data?.reactions && typeof data.reactions === 'object'
        ? data.reactions
        : {};

      const mergedReactions = {
        ...currentReactions,
        [userId]: {
          userId,
          type: reactionType,
          timestamp: Timestamp.now()
        }
      };

      transaction.update(messageRef, {
        reactions: mergedReactions
      });
    });
    return true;
  } catch (error) {
    console.error('Error adding reaction to message:', error);
    return false;
  }
};

/**
 * Remove a reaction from a message
 * @param messageId The ID of the message
 * @param userId The ID of the user removing their reaction
 */
export const removeMessageReaction = async (
  messageId: string,
  userId: string
): Promise<boolean> => {
  try {
    const messageRef = doc(db, MESSAGES_COLLECTION, messageId);

    // Use deleteField to remove the user's reaction
    await updateDoc(messageRef, {
      [`reactions.${userId}`]: deleteField()
    });

    return true;
  } catch (error) {
    console.error('Error removing reaction from message:', error);
    return false;
  }
};

/**
 * Create a call-type message in the direct chat between two users.
 * Records call events (ended/missed/rejected) for chat history and special UI rendering.
 * Caller-only: hides from receiver.
 * Session-dedupe: ensures only one call message per callId in current tab.
 */
export const logCallMessage = async (params: {
  callerId: string;
  receiverId: string;
  actorUserId: string;
  status: 'ended' | 'missed' | 'rejected';
  durationSeconds?: number;
  callId: string;
  kind?: 'audio' | 'video';
}): Promise<void> => {
  const {
    callerId,
    receiverId,
    actorUserId,
    status,
    durationSeconds,
    callId,
    kind = 'video'
  } = params;

  try {
    // Dedupe within this browser session (only when callId looks unique).
    // RTDB flow uses caller uid as callId; don't dedupe in that case to allow future calls.
    try {
      const looksUnique = callId.includes('_'); // e.g., caller_receiver_timestamp
      if (looksUnique) {
        const key = `callMsgLogged_${callId}`;
        if (typeof window !== 'undefined' && window.sessionStorage?.getItem(key)) return;
      }
    } catch {}

    // Only caller logs call status messages
    if (actorUserId !== callerId) return;

    // Ensure direct chat exists
    const chat = await ensureDirectChat(callerId, receiverId);
    const chatId = chat.id;

    // Compose content
    const formatDuration = (secs?: number) => {
      if (!secs || secs <= 0) return '';
      const m = Math.floor(secs / 60);
      const s = secs % 60;
      return `${m}:${s.toString().padStart(2, '0')}`;
    };

    let content = 'Call';
    if (status === 'ended') {
      const dur = formatDuration(durationSeconds);
      content = dur ? `Call ended • ${dur}` : 'Call ended';
    } else if (status === 'missed') {
      content = 'Missed Calls';
    } else if (status === 'rejected') {
      content = 'Call declined';
    }

    // Write the call message
    const sent = await sendMessage(chatId, actorUserId, content, 'call');

    // Mark session dedupe (only for unique-looking callIds)
    try {
      const looksUnique = callId.includes('_');
      if (looksUnique && typeof window !== 'undefined' && window.sessionStorage) {
        const key = `callMsgLogged_${callId}`;
        window.sessionStorage.setItem(key, '1');
      }
    } catch {}

    // Hide from receiver (caller-only visibility)
    try {
      if (receiverId) await hideMessageForUser(sent.id, receiverId);
    } catch (e) {
      console.warn('Failed to hide call message for receiver', e);
    }
  } catch (e) {
    console.error('Failed to log call message:', e);
  }
};
/**
 * Initialize real-time listeners for message sounds across all chats
 * This ensures immediate sound feedback when messages arrive
 */
export const initializeRealTimeMessageSound = (userId: string): (() => void) => {
  console.log(`📱 Initializing real-time message sound system for user ${userId}`);
  
  // Create a query for all chats this user is part of
  const chatsQuery = query(
    collection(db, CHATS_COLLECTION),
    where('participants', 'array-contains', userId)
  );
  
  // Listen for changes to any chat
  const unsubscribe = onSnapshot(chatsQuery, (snapshot) => {
    console.log(`📱 Real-time chat update detected (${snapshot.docChanges().length} changes)`);
    
    // Check each changed document for new messages
    snapshot.docChanges().forEach(change => {
      if (change.type === 'modified') {
        const chat = change.doc.data() as Chat;
        const chatId = change.doc.id;
        
        // Check if there's a new message that would trigger a sound
        if (chat.lastMessage) {
          const ts = chat.lastMessage.createdAt;
          const msgTimestamp = ts instanceof Timestamp ? ts.toMillis() : Date.now();
          const lastKnownTimestamp = lastMessageTimestamps[chatId] || 0;
          const isNewMessage = msgTimestamp > lastKnownTimestamp;
          
          // Don't play for the user's own messages
          const isFromCurrentUser = chat.lastMessage.senderId === userId;
          
          console.log(`📱 Chat ${chatId} update: isNewMessage=${isNewMessage}, isFromCurrentUser=${isFromCurrentUser}, age=${(Date.now() - msgTimestamp)/1000}s`);
          
          // If it's a new message (not from current user) that's recent (< 10 seconds old)
          // and not read by current user, play a sound
          if (isNewMessage && !isFromCurrentUser && (Date.now() - msgTimestamp < 10000)) {
            const isUnread = chat.lastMessage.readBy?.includes(userId) !== true;
            const isFresh = Date.now() - msgTimestamp < 10000; // Less than 10 seconds old
            
            if (isUnread && isFresh) {
              console.log(`📱 NEW MESSAGE DETECTED in chat ${chatId} - Playing sound!`);
              
              // Update the last message timestamp for this chat
              lastMessageTimestamps[chatId] = msgTimestamp;
              
              // Play the sound
              playMessageNotificationSound(true);
            }
          }
        }
      }
    });
  });
  
  return unsubscribe;
};

/**
 * Forward a message to another chat
 * @param messageId The ID of the message to forward
 * @param targetChatId The ID of the chat to forward to
 * @param userId The ID of the user forwarding the message
 */
export const forwardMessage = async (
  messageId: string, 
  targetChatId: string, 
  userId: string
): Promise<string> => {
  try {
    // Get the original message
    const messageRef = doc(db, MESSAGES_COLLECTION, messageId);
    const messageDoc = await getDoc(messageRef);
    
    if (!messageDoc.exists()) {
      throw new Error('Message not found');
    }
    
    const originalMessage = messageDoc.data() as Message;
    
    // Create a new message with forward metadata
    const newMessage: Omit<Message, 'id'> = {
      chatId: targetChatId,
      senderId: userId,
      content: originalMessage.content,
      type: originalMessage.type,
      status: 'sent',
      createdAt: Timestamp.now(),
      readBy: [userId],
      edited: false,
      attachments: originalMessage.type === 'text' ? null : [...(originalMessage.attachments || [])],
      replyTo: null,
      forwardedFrom: {
        originalMessageId: messageId,
        originalChatId: originalMessage.chatId,
        originalSenderId: originalMessage.senderId,
        forwardedAt: Timestamp.now()
      }
    };
    
    // Add the new message
    const newMessageRef = await addDoc(collection(db, MESSAGES_COLLECTION), newMessage);
    
    // Update the chat's lastMessage
    const chatRef = doc(db, CHATS_COLLECTION, targetChatId);
    await updateDoc(chatRef, {
      lastMessage: {
        messageId: newMessageRef.id,
        content: newMessage.content,
        senderId: newMessage.senderId,
        createdAt: newMessage.createdAt,
        type: newMessage.type,
        status: newMessage.status,
        readBy: newMessage.readBy
      },
      updatedAt: serverTimestamp()
    });
    
    // Trigger notification
    const chatDoc = await getDoc(chatRef);
    if (chatDoc.exists()) {
      const chatData = chatDoc.data() as Chat;
      const recipientIds = chatData.participants.filter(id => id !== userId);
      
      if (recipientIds.length > 0) {
        // Notify each recipient of the new message
        for (const recipientId of recipientIds) {
          await notifyNewMessage(recipientId, userId, newMessageRef.id);
        }
      }
    }
    
    // Play message sound
    playMessageNotificationSound();
    
    return newMessageRef.id;
  } catch (error) {
    console.error('Error forwarding message:', error);
    throw error;
  }
};