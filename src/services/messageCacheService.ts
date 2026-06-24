import { Message } from './messageService';

export interface CacheEntry {
  messages: Message[];
  timestamp: number;
  hasMore: boolean;
  lastMessageId: string | null;
}

export class MessageCacheService {
  private static instance: MessageCacheService;
  private cache: Map<string, CacheEntry>;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  private readonly MAX_CACHE_SIZE = 50; // Maximum number of chats to cache

  private constructor() {
    this.cache = new Map();
    
    // Clean up expired cache entries periodically
    setInterval(() => this.cleanupExpiredEntries(), this.CACHE_TTL);
  }

  public static getInstance(): MessageCacheService {
    if (!MessageCacheService.instance) {
      MessageCacheService.instance = new MessageCacheService();
    }
    return MessageCacheService.instance;
  }

  public getCachedMessages(chatId: string): CacheEntry | null {
    const entry = this.cache.get(chatId);
    
    if (!entry) return null;
    
    // Check if cache entry has expired
    if (Date.now() - entry.timestamp > this.CACHE_TTL) {
      this.cache.delete(chatId);
      return null;
    }
    
    return entry;
  }

  public updateCache(
    chatId: string,
    messages: Message[],
    hasMore: boolean,
    lastMessageId: string | null
  ): void {
    // Ensure we don't exceed max cache size
    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      // Remove oldest entry
      const oldestEntry = Array.from(this.cache.entries())
        .sort(([, a], [, b]) => a.timestamp - b.timestamp)[0];
      if (oldestEntry) {
        this.cache.delete(oldestEntry[0]);
      }
    }

    this.cache.set(chatId, {
      messages,
      timestamp: Date.now(),
      hasMore,
      lastMessageId
    });
  }

  public updateMessage(chatId: string, updatedMessage: Message): void {
    const entry = this.cache.get(chatId);
    if (!entry) return;

    const messageIndex = entry.messages.findIndex(m => m.id === updatedMessage.id);
    if (messageIndex !== -1) {
      entry.messages[messageIndex] = updatedMessage;
      entry.timestamp = Date.now();
    }
  }

  public addMessage(chatId: string, newMessage: Message): void {
    const entry = this.cache.get(chatId);
    if (!entry) return;

    entry.messages.push(newMessage);
    entry.timestamp = Date.now();
  }

  public invalidateCache(chatId: string): void {
    this.cache.delete(chatId);
  }

  private cleanupExpiredEntries(): void {
    const now = Date.now();
    Array.from(this.cache.entries()).forEach(([chatId, entry]) => {
      if (now - entry.timestamp > this.CACHE_TTL) {
        this.cache.delete(chatId);
      }
    });
  }

  public getCacheSize(): number {
    return this.cache.size;
  }

  public clearCache(): void {
    this.cache.clear();
  }
}

export const messageCache = MessageCacheService.getInstance();

// Add empty export to ensure this is treated as a module
export {}; 