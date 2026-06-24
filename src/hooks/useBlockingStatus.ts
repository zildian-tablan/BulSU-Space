import { useEffect, useState } from 'react';
import { User } from '../contexts/AuthContext';
import { ChatWithDetails } from '../services/messageService';
import { checkMutualBlock, listenToBlockStatus } from '../services/userService';

type BlockingStatusState = {
  isBlocked: boolean;
  isBlockedBy: boolean;
  isLoading: boolean;
};

interface UseBlockingStatusParams {
  currentUser: User | null;
  selectedChat: ChatWithDetails | null;
}

export const useBlockingStatus = ({ currentUser, selectedChat }: UseBlockingStatusParams) => {
  const [blockingStatus, setBlockingStatus] = useState<BlockingStatusState>({
    isBlocked: false,
    isBlockedBy: false,
    isLoading: false
  });

  // Set up real-time blocking status listener when selected chat changes
  useEffect(() => {
    let blockStatusUnsubscribe: (() => void) | null = null;

    const setupBlockingListener = async () => {
      if (!currentUser || !selectedChat || selectedChat.isGroupChat) {
        setBlockingStatus({ isBlocked: false, isBlockedBy: false, isLoading: false });
        return;
      }

      // Resolve the other participant id even if otherUser metadata isn't hydrated yet
      const otherUserId = selectedChat.otherUser?.id || selectedChat.participants?.find(id => id !== currentUser.id);
      if (!otherUserId) {
        setBlockingStatus({ isBlocked: false, isBlockedBy: false, isLoading: false });
        return;
      }

      setBlockingStatus(prev => ({ ...prev, isLoading: true }));

      try {
        // First, get immediate block status
        const initialBlockStatus = await checkMutualBlock(currentUser.id, otherUserId);
        setBlockingStatus({
          isBlocked: initialBlockStatus.user1BlockedUser2,
          isBlockedBy: initialBlockStatus.user2BlockedUser1,
          isLoading: false
        });

        // Then set up real-time listener for changes
        blockStatusUnsubscribe = listenToBlockStatus(
          currentUser.id,
          otherUserId,
          (blockStatus) => {
            console.log('Real-time block status update:', blockStatus);
            setBlockingStatus({
              isBlocked: blockStatus.user1BlockedUser2,
              isBlockedBy: blockStatus.user2BlockedUser1,
              isLoading: false
            });
          }
        );
      } catch (error) {
        console.error('Error setting up block status tracking:', error);
        setBlockingStatus({ isBlocked: false, isBlockedBy: false, isLoading: false });
      }
    };

    // Invoke and ensure cleanup for the block status listener
    setupBlockingListener();

    // Clean up listener when component unmounts or selected chat changes
    return () => {
      if (blockStatusUnsubscribe) {
        blockStatusUnsubscribe();
      }
    };
  }, [currentUser, selectedChat]);

  // React immediately to block/unblock that could happen from Profile page via global event
  useEffect(() => {
    if (!currentUser) return;

    const handler = (ev: Event) => {
      const { blockerId, blockedUserId, isBlocked } = (ev as CustomEvent).detail || {};
      if (!blockerId || !blockedUserId) return;
      const chat = selectedChat;
      if (!chat || chat.isGroupChat) return;

      const otherUserId = chat.otherUser?.id || chat.participants?.find(id => id !== currentUser.id);
      if (!otherUserId) return;

      const concernsThisChat =
        (blockerId === currentUser.id && blockedUserId === otherUserId) ||
        (blockerId === otherUserId && blockedUserId === currentUser.id);
      if (!concernsThisChat) return;

      setBlockingStatus(prev => ({
        ...prev,
        isBlocked: blockerId === currentUser.id ? !!isBlocked : prev.isBlocked,
        isBlockedBy: blockerId === otherUserId ? !!isBlocked : prev.isBlockedBy,
        isLoading: false
      }));
    };

    window.addEventListener('userBlockChanged' as any, handler as any);
    return () => {
      window.removeEventListener('userBlockChanged' as any, handler as any);
    };
  }, [currentUser, selectedChat]);

  return {
    blockingStatus,
    setBlockingStatus
  };
};
