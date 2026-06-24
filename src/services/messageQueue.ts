import { Message, MessageType } from './messageService';
import { Timestamp } from 'firebase/firestore';

export interface PendingMessage {
  id: string;
  data: Omit<Message, 'id'>;
  retries: number;
  timestamp: number;
  status: 'pending' | 'processing' | 'failed';
}

class MessageQueueService {
  private static instance: MessageQueueService;
  private queue: PendingMessage[] = [];
  private isProcessing: boolean = false;
  private maxRetries: number = 3;
  private retryDelayMs: number = 1000;
  private onSendMessage?: (data: Omit<Message, 'id'>) => Promise<Message>;
  private onStatusChange?: (pendingMessage: PendingMessage) => void;

  private constructor() {
    // Load pending messages from localStorage on init
    this.loadFromStorage();
    
    // Listen for online/offline events
    window.addEventListener('online', () => this.processQueue());
    window.addEventListener('offline', () => this.isProcessing = false);
  }

  public static getInstance(): MessageQueueService {
    if (!MessageQueueService.instance) {
      MessageQueueService.instance = new MessageQueueService();
    }
    return MessageQueueService.instance;
  }

  public setHandlers(
    onSendMessage: (data: Omit<Message, 'id'>) => Promise<Message>,
    onStatusChange?: (pendingMessage: PendingMessage) => void
  ) {
    this.onSendMessage = onSendMessage;
    this.onStatusChange = onStatusChange;
  }

  public async addToQueue(messageData: Omit<Message, 'id'>): Promise<string> {
    const pendingMessage: PendingMessage = {
      id: `pending-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      data: messageData,
      retries: 0,
      timestamp: Date.now(),
      status: 'pending'
    };

    this.queue.push(pendingMessage);
    this.saveToStorage();
    this.notifyStatusChange(pendingMessage);

    // Try to process queue immediately if online
    if (navigator.onLine) {
      this.processQueue();
    }

    return pendingMessage.id;
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing || !navigator.onLine || !this.onSendMessage || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;

    while (this.queue.length > 0 && navigator.onLine) {
      const message = this.queue[0];
      message.status = 'processing';
      this.notifyStatusChange(message);

      try {
        await this.onSendMessage(message.data);
        // Message sent successfully, remove from queue
        this.queue.shift();
        this.saveToStorage();
      } catch (error) {
        message.retries++;
        message.status = 'failed';
        this.notifyStatusChange(message);

        if (message.retries >= this.maxRetries) {
          // Remove failed message after max retries
          this.queue.shift();
        } else {
          // Move to end of queue for retry
          this.queue.push(this.queue.shift()!);
          // Wait before next retry
          await new Promise(resolve => setTimeout(resolve, this.retryDelayMs * Math.pow(2, message.retries)));
        }
        this.saveToStorage();
      }
    }

    this.isProcessing = false;
  }

  private saveToStorage(): void {
    try {
      localStorage.setItem('messageQueue', JSON.stringify(this.queue));
    } catch (error) {
      console.error('Failed to save message queue to storage:', error);
    }
  }

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem('messageQueue');
      if (stored) {
        this.queue = JSON.parse(stored);
      }
    } catch (error) {
      console.error('Failed to load message queue from storage:', error);
    }
  }

  private notifyStatusChange(message: PendingMessage): void {
    if (this.onStatusChange) {
      this.onStatusChange(message);
    }
  }

  public getPendingMessages(): PendingMessage[] {
    return [...this.queue];
  }

  public clearQueue(): void {
    this.queue = [];
    this.saveToStorage();
  }
}

export const messageQueue = MessageQueueService.getInstance(); 