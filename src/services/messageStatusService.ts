import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  doc,
  getDoc,
  writeBatch,
  serverTimestamp,
  arrayUnion,
  Timestamp,
  DocumentReference,
  WriteBatch,
  FieldValue,
  DocumentData
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { Message, MessageStatus, Chat } from './messageService';
import debounce from 'lodash/debounce';

const MESSAGES_COLLECTION = 'messages';
const CHATS_COLLECTION = 'chats';
const BATCH_SIZE = 500;
const STATUS_UPDATE_DEBOUNCE = 2000; // 2 seconds

interface StatusUpdate {
  messageId: string;
  status: MessageStatus;
  userId: string;
  timestamp: Timestamp;
}

class MessageStatusService {
  private static instance: MessageStatusService;
  private pendingUpdates: Map<string, StatusUpdate>;
  private processingUpdates: boolean;
  private currentBatch: WriteBatch;
  private batchCount: number;

  private constructor() {
    this.pendingUpdates = new Map();
    this.processingUpdates = false;
    this.currentBatch = writeBatch(db);
    this.batchCount = 0;

    // Process updates periodically
    this.debouncedProcessUpdates = debounce(
      this.processUpdates.bind(this),
      STATUS_UPDATE_DEBOUNCE
    );
  }

  public static getInstance(): MessageStatusService {
    if (!MessageStatusService.instance) {
      MessageStatusService.instance = new MessageStatusService();
    }
    return MessageStatusService.instance;
  }

  private async createNewBatch(): Promise<void> {
    if (this.batchCount > 0) {
      await this.currentBatch.commit();
    }
    this.currentBatch = writeBatch(db);
    this.batchCount = 0;
  }

  private async addToBatch(
    ref: DocumentReference,
    data: Partial<Message>
  ): Promise<void> {
    if (this.batchCount >= BATCH_SIZE) {
      await this.createNewBatch();
    }
    this.currentBatch.update(ref, data);
    this.batchCount++;
  }

  public queueStatusUpdate(update: StatusUpdate): void {
    const key = `${update.messageId}-${update.userId}`;
    this.pendingUpdates.set(key, update);
    this.debouncedProcessUpdates();
  }

  private async processUpdates(): Promise<void> {
    if (this.processingUpdates || this.pendingUpdates.size === 0) {
      return;
    }

    this.processingUpdates = true;
    const updates = Array.from(this.pendingUpdates.values());
    this.pendingUpdates.clear();

    try {
      // Group updates by chat for efficient processing
      const updatesByChat = new Map<string, StatusUpdate[]>();
      
      for (const update of updates) {
        const messageRef = doc(db, MESSAGES_COLLECTION, update.messageId);
        const messageDoc = await getDoc(messageRef);
        
        if (!messageDoc.exists()) continue;
        
        const messageData = messageDoc.data() as Message;
        const chatId = messageData.chatId;
        
        if (!updatesByChat.has(chatId)) {
          updatesByChat.set(chatId, []);
        }
        const chatUpdates = updatesByChat.get(chatId);
        if (chatUpdates) {
          chatUpdates.push(update);
        }
      }

      // Process updates for each chat
      for (const entry of Array.from(updatesByChat.entries())) {
        const [chatId, chatUpdates] = entry;
        await this.processUpdatesForChat(chatId, chatUpdates);
      }

      // Commit any remaining updates
      if (this.batchCount > 0) {
        await this.currentBatch.commit();
        this.batchCount = 0;
      }
    } catch (error) {
      console.error('Error processing status updates:', error);
      // Requeue failed updates
      for (const update of updates) {
        const key = `${update.messageId}-${update.userId}`;
        this.pendingUpdates.set(key, update);
      }
    } finally {
      this.processingUpdates = false;
    }
  }

  private async processUpdatesForChat(
    chatId: string,
    updates: StatusUpdate[]
  ): Promise<void> {
    const chatRef = doc(db, CHATS_COLLECTION, chatId);
    const chatDoc = await getDoc(chatRef);

    if (!chatDoc.exists()) return;

    const messageRefs = updates.map(u => 
      doc(db, MESSAGES_COLLECTION, u.messageId)
    );

    // Update message statuses
    for (let i = 0; i < updates.length; i++) {
      const update = updates[i];
      const messageRef = messageRefs[i];

      const updateData: { status: MessageStatus; readBy?: string[] } = {
        status: update.status
      };

      if (update.status === 'read') {
        updateData.readBy = [update.userId];
      }

      await this.addToBatch(messageRef, updateData);
    }

    // Update chat's last message if needed
    const chatData = chatDoc.data() as Chat;
    const lastMessageId = chatData.lastMessage?.messageId;
    
    if (lastMessageId) {
      const lastMessageUpdate = updates.find(u => u.messageId === lastMessageId);
      if (lastMessageUpdate) {
        const chatUpdate: { [key: string]: any } = {
          'lastMessage.status': lastMessageUpdate.status
        };

        if (lastMessageUpdate.status === 'read') {
          chatUpdate['lastMessage.readBy'] = arrayUnion(lastMessageUpdate.userId);
        }

        await this.addToBatch(chatRef, chatUpdate as Partial<Chat>);
      }
    }
  }

  public async markDelivered(
    chatId: string,
    userId: string
  ): Promise<void> {
    try {
      const messagesQuery = query(
        collection(db, MESSAGES_COLLECTION),
        where('chatId', '==', chatId),
        where('status', '==', 'sent'),
        where('senderId', '!=', userId),
        orderBy('createdAt', 'desc'),
        limit(100)
      );

      const snapshot = await getDocs(messagesQuery);

      snapshot.forEach(doc => {
        this.queueStatusUpdate({
          messageId: doc.id,
          status: 'delivered',
          userId,
          timestamp: Timestamp.now()
        });
      });
    } catch (error) {
      console.error('Error marking messages as delivered:', error);
    }
  }

  public markRead(
    messageId: string,
    userId: string
  ): void {
    this.queueStatusUpdate({
      messageId,
      status: 'read',
      userId,
      timestamp: Timestamp.now()
    });
  }

  private debouncedProcessUpdates: () => void;
}

export const messageStatusService = MessageStatusService.getInstance(); 