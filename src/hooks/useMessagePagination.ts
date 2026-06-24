import { useCallback, useEffect, useRef, useState } from 'react';
import { Timestamp } from 'firebase/firestore';
import { User } from '../contexts/AuthContext';
import { ChatWithDetails, getPaginatedMessages } from '../services/messageService';
import type { IMessage } from '../pages/messaging';

interface UseMessagePaginationParams {
  selectedChat: ChatWithDetails | null;
  messages: IMessage[];
  currentUser: User | null;
  chatContainerRef: React.RefObject<HTMLDivElement>;
  messagesEndRef: React.RefObject<HTMLDivElement>;
  pageSize: number;
  setMessages: React.Dispatch<React.SetStateAction<IMessage[]>>;
}

export const useMessagePagination = ({
  selectedChat,
  messages,
  currentUser,
  chatContainerRef,
  messagesEndRef,
  pageSize,
  setMessages
}: UseMessagePaginationParams) => {
  const olderMessagesRef = useRef<IMessage[]>([]);
  const prefetchedPageRef = useRef<{ messages: IMessage[]; hasMore: boolean; lastMessageId: string | null } | null>(null);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [hasMoreOlder, setHasMoreOlder] = useState(true);
  const isNearBottomRef = useRef<boolean>(true);

  // Helper: wait for images/videos inside the messages container to finish loading
  const waitForMediaLoad = useCallback(async (timeoutMs = 2000) => {
    const container = chatContainerRef.current || document.querySelector('.messages-container') as HTMLElement | null;
    if (!container) return;
    const imgs = Array.from(container.querySelectorAll('img')) as HTMLImageElement[];
    const vids = Array.from(container.querySelectorAll('video')) as HTMLVideoElement[];

    const pending: Promise<void>[] = [];

    imgs.forEach(img => {
      if (img.complete) return;
      pending.push(new Promise<void>((resolve) => {
        const onLoad = () => { cleanup(); resolve(); };
        const onError = () => { cleanup(); resolve(); };
        const cleanup = () => { img.removeEventListener('load', onLoad); img.removeEventListener('error', onError); };
        img.addEventListener('load', onLoad);
        img.addEventListener('error', onError);
      }));
    });

    vids.forEach(vid => {
      // If video has metadata loaded, treat as ready; otherwise wait for loadedmetadata
      if (vid.readyState >= 1) return;
      pending.push(new Promise<void>((resolve) => {
        const onMeta = () => { cleanup(); resolve(); };
        const onError = () => { cleanup(); resolve(); };
        const cleanup = () => { vid.removeEventListener('loadedmetadata', onMeta); vid.removeEventListener('error', onError); };
        vid.addEventListener('loadedmetadata', onMeta);
        vid.addEventListener('error', onError);
      }));
    });

    if (pending.length === 0) return;

    await Promise.race([
      Promise.all(pending),
      new Promise<void>((resolve) => setTimeout(() => resolve(), timeoutMs)),
    ]);
  }, [chatContainerRef, messagesEndRef]);

  // Load older messages and keep scroll position stable
  const loadOlderMessages = useCallback(async () => {
    if (!selectedChat || isLoadingOlder || !hasMoreOlder) return;
    const container = chatContainerRef.current;
    if (!container) return;

    try {
      setIsLoadingOlder(true);
      const prevScrollHeight = container.scrollHeight;
      const prevScrollTop = container.scrollTop;

      const currentOldest = olderMessagesRef.current.length > 0 ? olderMessagesRef.current[0] : messages[0];
      const boundaryId = currentOldest?.id;

      // If we prefetched a page and its boundary matches, use it
      let page;
      if (prefetchedPageRef.current && prefetchedPageRef.current.lastMessageId === boundaryId) {
        page = prefetchedPageRef.current;
        prefetchedPageRef.current = null; // consume cache
      } else {
        const lastCreatedAt = currentOldest?.createdAt instanceof Timestamp ? currentOldest.createdAt : (currentOldest?.createdAt ? currentOldest.createdAt : undefined);
        page = await getPaginatedMessages(selectedChat.id, boundaryId, pageSize, lastCreatedAt as any);
      }

      const filtered = currentUser
        ? page.messages.filter(m => !m.deletedForMe || !m.deletedForMe.includes(currentUser.id))
        : page.messages;

      if (filtered.length > 0) {
        // Prepend to our local cache
        olderMessagesRef.current = [...filtered, ...olderMessagesRef.current];

        // Temporarily suppress transitions/scroll-behavior to avoid visual jumps
        container.classList.add('suppress-transitions', 'layout-stabilizing');

        setMessages(prev => {
          const existingIds = new Set(prev.map(m => m.id));
          const toPrepend = filtered.filter(m => !existingIds.has(m.id));
          const merged = [...toPrepend, ...prev];
          merged.sort((a, b) => (a.createdAt instanceof Timestamp ? a.createdAt.toMillis() : 0) - (b.createdAt instanceof Timestamp ? b.createdAt.toMillis() : 0));
          return merged;
        });

        // After DOM updates, preserve visual viewport by adjusting scrollTop by the height delta
        requestAnimationFrame(() => {
          try {
            const newScrollHeight = container.scrollHeight;
            const delta = newScrollHeight - prevScrollHeight;
            container.scrollTop = prevScrollTop + delta;
          } finally {
            // Remove the suppression shortly afterwards to restore smooth scrolling
            setTimeout(() => container.classList.remove('suppress-transitions', 'layout-stabilizing'), 80);
          }
        });
      }

      setHasMoreOlder(page.hasMore);
    } catch (e) {
      console.error('Failed to load older messages', e);
    } finally {
      setIsLoadingOlder(false);
    }
  }, [selectedChat?.id, isLoadingOlder, hasMoreOlder, pageSize, messages, currentUser, chatContainerRef, setMessages]);

  // Reset pagination when changing chats
  useEffect(() => {
    olderMessagesRef.current = [];
    setHasMoreOlder(true);
    setIsLoadingOlder(false);
  }, [selectedChat?.id]);

  // Attach scroll listener to the messages container
  useEffect(() => {
    const container = chatContainerRef.current;
    if (!container) return;

    const onScroll = () => {
  // Update near-bottom status
  const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
  isNearBottomRef.current = distanceFromBottom <= 100;

  // If user scrolled near top, trigger load; use 100px threshold for immediate load
  if (container.scrollTop <= 100 && hasMoreOlder && !isLoadingOlder) {
        loadOlderMessages();
      }

  // Prefetch when user approaches top to reduce perceived delay (300px threshold)
  if (container.scrollTop <= 300 && hasMoreOlder && !isLoadingOlder && !prefetchedPageRef.current) {
        // Start prefetch but don't block scrolling
        (async () => {
          try {
            const currentOldest = olderMessagesRef.current.length > 0 ? olderMessagesRef.current[0] : messages[0];
            const boundaryId = currentOldest?.id;
            const lastCreatedAt = currentOldest?.createdAt instanceof Timestamp ? currentOldest.createdAt : (currentOldest?.createdAt ? currentOldest.createdAt : undefined);
            const page = await getPaginatedMessages(selectedChat!.id, boundaryId, pageSize, lastCreatedAt as any);
            prefetchedPageRef.current = page as any;
          } catch (e) {
            // Ignore prefetch errors
            console.debug('Prefetch older messages failed', e);
          }
        })();
      }
    };

    container.addEventListener('scroll', onScroll);
    return () => container.removeEventListener('scroll', onScroll);
  }, [loadOlderMessages, hasMoreOlder, isLoadingOlder, chatContainerRef, messages, selectedChat, pageSize]);

  return {
    waitForMediaLoad,
    loadOlderMessages,
    olderMessagesRef,
    prefetchedPageRef,
    isLoadingOlder,
    hasMoreOlder,
    isNearBottomRef,
    setIsLoadingOlder,
    setHasMoreOlder
  };
};
