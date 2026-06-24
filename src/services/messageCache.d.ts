declare module '../services/messageCache' {
  const messageCache: {
    saveConversation: (conv: any) => Promise<void>;
    getAllConversations: () => Promise<any[]>;
    saveMessages: (conversationId: string, messages: any[]) => Promise<void> | void;
    getMessagesForConversation: (conversationId: string, limit?: number, beforeCreatedAt?: number) => Promise<any[]>;
    getLatestMessageTimestamp: (conversationId: string) => Promise<number | null>;
    clearAll: () => Promise<void>;
    enforceEviction: (maxPerConversation?: number) => Promise<void>;
    deleteConversation: (conversationId: string) => Promise<void>;
  };
  export default messageCache;
}
