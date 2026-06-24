import { useCallback, useEffect, useRef, useState } from 'react';
import { User } from '../contexts/AuthContext';
import { ChatWithDetails, getUserChatsCombined } from '../services/messageService';
import { getAllUsers } from '../services/userService';
import messageCache from '../services/messageCache';

interface UseChatListParams {
  currentUser: User | null;
  firebaseConnected: boolean;
  showArchived: boolean;
  activeListenersRef: React.MutableRefObject<(() => void)[]>;
}

export const useChatList = ({
  currentUser,
  firebaseConnected,
  showArchived,
  activeListenersRef
}: UseChatListParams) => {
  const [chats, setChats] = useState<ChatWithDetails[]>([]);
  const [activeChats, setActiveChats] = useState<ChatWithDetails[]>([]);
  const [archivedChats, setArchivedChats] = useState<ChatWithDetails[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [messageableUsers, setMessageableUsers] = useState<User[]>([]);
  const [emptyDelayPassed, setEmptyDelayPassed] = useState(false);
  const [isSortingChats, setIsSortingChats] = useState<boolean>(false);
  const sortingChatsTimerRef = useRef<number | null>(null);
  const emptyDelayTimerRef = useRef<number | null>(null);
  const chatListHydratedRef = useRef(false);

  const markChatListHydrated = useCallback((delay = 0) => {
    if (chatListHydratedRef.current) return;
    chatListHydratedRef.current = true;
    if (emptyDelayTimerRef.current) {
      window.clearTimeout(emptyDelayTimerRef.current);
    }
    if (delay <= 0) {
      setEmptyDelayPassed(true);
      emptyDelayTimerRef.current = null;
      return;
    }
    emptyDelayTimerRef.current = window.setTimeout(() => setEmptyDelayPassed(true), delay);
  }, [setEmptyDelayPassed]);

  // Get chats for current user (single combined subscription for active + archived)
  useEffect(() => {
    if (!currentUser || !firebaseConnected) return;

    setIsLoading(true);
    chatListHydratedRef.current = false;
    if (emptyDelayTimerRef.current) {
      window.clearTimeout(emptyDelayTimerRef.current);
    }
    setEmptyDelayPassed(false);

    try {
      console.log('Setting up combined chat listener at', new Date().toISOString());
      // Hydrate conversations from IndexedDB first for instant UI
      // IMPORTANT: filter by current user so we never flash another user's chats
      (async () => {
        try {
          const cached = await messageCache.getAllConversations();
          if (cached && cached.length) {
            const userCached = cached.filter((c: any) =>
              Array.isArray(c.participants) && c.participants.includes(currentUser.id)
            );
            if (userCached.length) {
              // Apply the same active/archived split so the cached list matches the current tab
              const cachedActive = userCached.filter((c: any) => !(c.archived && c.archived[currentUser.id] === true));
              const cachedArchived = userCached.filter((c: any) => c.archived && c.archived[currentUser.id] === true);
              setChats(showArchived ? cachedArchived : cachedActive);
              setIsLoading(false);
              markChatListHydrated(0);
            }
          }
        } catch (e) {
          console.debug('No cached conversations or failed to read cache', e);
        }
      })();

      const unsubscribe = getUserChatsCombined(
      currentUser.id,
      ({ active, archived }: { active: ChatWithDetails[]; archived: ChatWithDetails[] }) => {
        // Update both lists in state without re-subscribing when toggling tabs
        setActiveChats(active);
        setArchivedChats(archived);
        // Update the main chats view to match current tab without flashing the skeleton each time
        const newList = showArchived ? archived : active;
        setChats(newList);
        setIsLoading(false);
        markChatListHydrated(250);

        // Persist updated conversations to cache (async, don't block UI)
        (async () => {
          try {
            for (const c of newList) await messageCache.saveConversation(c as any);
          } catch (e) {
            console.debug('Failed to persist conversations to cache', e);
          }
        })();
  }, { fetchLastMessageDoc: true, fetchParticipantDetails: true, earlySkeletons: false });

      activeListenersRef.current.push(unsubscribe);

      // Load all users for new chat / group creation (allow messaging anyone)
      const loadAllUsersForMessaging = async () => {
        try {
          const users = await getAllUsers();
          // Exclude only the current user from selectable lists so messaging works across the entire community
          const filtered = users.filter(u => u.id !== currentUser.id);
          setMessageableUsers(filtered as User[]);
        } catch (error) {
          console.error('Error loading users for messaging:', error);
        }
      };
      loadAllUsersForMessaging();

      return () => {
        try { unsubscribe(); } catch (err) { console.error('Error unsubscribing combined listener', err); }
        activeListenersRef.current = activeListenersRef.current.filter(fn => fn !== unsubscribe);
        if (emptyDelayTimerRef.current) window.clearTimeout(emptyDelayTimerRef.current);
        chatListHydratedRef.current = false;
      };
    } catch (error) {
      console.error('Error setting up combined chat listener:', error);
      setIsLoading(false);
      markChatListHydrated(0);
      return () => {};
    }
  }, [currentUser, firebaseConnected, showArchived, markChatListHydrated, activeListenersRef]);

  return {
    chats,
    setChats,
    activeChats,
    setActiveChats,
    archivedChats,
    setArchivedChats,
    isLoading,
    messageableUsers,
    emptyDelayPassed,
    setEmptyDelayPassed,
    isSortingChats,
    setIsSortingChats,
    sortingChatsTimerRef,
    emptyDelayTimerRef,
    chatListHydratedRef,
    markChatListHydrated
  };
};
