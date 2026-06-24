import { useState, useEffect } from 'react';
import { getUserNickname } from '../services/nicknameService';
import { ChatWithDetails } from '../services/messageService';

interface UseNicknameDisplayProps {
  chatId: string;
  currentUserId: string;
  targetUserId: string;
  defaultName: string;
}

/**
 * Hook to get and display nicknames for chat participants
 */
export const useNicknameDisplay = ({ 
  chatId, 
  currentUserId, 
  targetUserId, 
  defaultName 
}: UseNicknameDisplayProps) => {
  const [displayName, setDisplayName] = useState(defaultName);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  
  useEffect(() => {
    // Reset state when dependencies change
    setDisplayName(defaultName);
    setIsLoading(true);
    setError(null);
    
    // Function to fetch nickname
    const fetchNickname = async () => {
      try {
        if (!chatId || !currentUserId || !targetUserId) {
          setDisplayName(defaultName);
          setIsLoading(false);
          return;
        }
        
        const nickname = await getUserNickname(chatId, currentUserId, targetUserId);
        
        if (nickname && nickname.nickname) {
          setDisplayName(nickname.nickname);
        } else {
          setDisplayName(defaultName);
        }
      } catch (err) {
        console.error('Error getting nickname:', err);
        setError(err as Error);
        setDisplayName(defaultName);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchNickname();
  }, [chatId, currentUserId, targetUserId, defaultName]);
  
  return { displayName, isLoading, error };
};

/**
 * Helper function to get display name for a user in a chat
 */
export const getDisplayNameForChat = (
  chat: ChatWithDetails | null, 
  currentUserId: string | undefined
): string => {
  // If no chat or current user, return empty string
  if (!chat || !currentUserId) return '';
  
  // For group chats, return the group name
  if (chat.isGroupChat) return chat.name || 'Group Chat';
  
  // For 1:1 chats, return the other user's name
  if (chat.otherUser) return chat.otherUser.name;
  
  // Fallback
  return 'Chat';
};
