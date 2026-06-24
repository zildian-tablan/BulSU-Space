import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Link } from 'react-router-dom';
import { useAudioCallContext } from '../contexts/AudioCallContext';
import { useBlockingStatus } from '../hooks/useBlockingStatus';
import { useChatList } from '../hooks/useChatList';
import { useMessagePagination } from '../hooks/useMessagePagination';
import { TutorialOverlay } from '../components/tutorial/TutorialOverlay';
import MobileNavBar from '../components/layout/MobileNavBar';
import MainLayout from '../components/layout/MainLayout';
import ChatContextMenu from '../components/ChatContextMenu';
import ChatActionSheet from '../components/ChatActionSheet';
import ForwardMessageDialog from '../components/ForwardMessageDialog';
import ProfanityModal from '../components/modals/ProfanityModal';
import {
  getUserChats,
  getChatMessages,
  markMessagesAsRead,
  sendMessage,
  createChat,
  ensureDirectChat,
  editMessage,
  deleteMessage,
  ChatWithDetails,
  updateMessagesDeliveryStatus,
  sendMessageWithRetry,
  markMessagesAsReadBatched,
  hideMessageForUser,
  addGroupMember,
  deleteGroupChat,
  deleteOneToOneChat,
  archiveChat,
  unarchiveChat,
  forwardMessage,
  acceptMessageRequest,
  declineMessageRequest,
  getChatById
} from '../services/messageService';
import { listenToRecentMessages } from '../services/messageService';

import {
  blockUser,
  unblockUser,
  checkMutualBlock
} from '../services/userService';
import { networkService } from '../services/networkService';
import {
  getUserProfile
} from '../services/userService';


import {
  PaperAirplaneIcon,
  FaceSmileIcon,
  PlusCircleIcon,
  PhotoIcon,
  MicrophoneIcon,
  PhoneIcon,
  EllipsisHorizontalIcon,
  ChevronLeftIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  XMarkIcon,
  PhoneXMarkIcon,
  SpeakerWaveIcon,
  SpeakerXMarkIcon,
  PencilIcon,
  UserIcon,
  Bars3Icon,
  MagnifyingGlassIcon,
  BellIcon,
  ChatBubbleBottomCenterTextIcon,
  PaperClipIcon
} from '@heroicons/react/24/outline';
import { formatDistanceToNow } from 'date-fns';
import { User } from '../contexts/AuthContext';
import { Timestamp } from 'firebase/firestore';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { onSnapshot } from 'firebase/firestore';
import { PresenceStatusIndicator } from '../components/common/PresenceStatusIndicator';
import { onValue, ref } from 'firebase/database';
import { rtdb } from '../firebase/config';
import messageCache from '../services/messageCache';
import './MessagingPage.mobile.css';
import './MessagingPage.desktop.css';
import '../styles/modal-animations.css';
import '../styles/messagingPage.css';
import { AuthService } from '../services/authService';
import { canStartDirectChat } from '../utils/messagingPermissions';
import {
  ChatListSkeleton,
  Spinner,
  MessageInput,
  ChatHeader,
  MediaFilesPanel,
  GroupChatModal,
  MessageItem,
  ChatListItem,
  PinnedMessageBanner,
  DeleteMessageDialog,
  ReactionDetailsModal,
  CreateGroupChatModal,
  AddMemberModal,
  MobileActionSheet,
  FriendUID,
  MESSAGES_COLLECTION,
  CHATS_COLLECTION,
  THEME_STYLES,
  getThemeStylesByKey,
  toThemeKey,
  instantScrollToBottom
} from './messaging';
import type {
  ThemeKey,
  ThemeStyle,
  MessageAction,
  PinnedMessage,
  ReactionType,
  MessageReaction,
  IMessage,
  LocalMessage,
} from './messaging';
const MessagingPage: React.FC = (): JSX.Element => {
  const safeNavigate = useCallback((to: string, options?: { replace?: boolean }) => {
    const url = new URL(to, window.location.origin);
    const next = `${url.pathname}${url.search}${url.hash}`;
    if (options?.replace) {
      window.history.replaceState({}, '', next);
    } else {
      window.history.pushState({}, '', next);
    }
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, []);
  
  // Define a debounce utility function at the top of the component
  const debounce = (func: Function, wait: number) => {
    let timeout: NodeJS.Timeout;
    
    // Return the debounced function with cancel method
    const debounced = (...args: any[]) => {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
    
    // Add cancel method to the debounced function
    debounced.cancel = () => {
      clearTimeout(timeout);
    };
    
    return debounced;
  };

  const { currentUser } = useAuth();
  const [showArchived, setShowArchived] = useState<boolean>(false);
  // Header menu (More options) state
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  // Mobile right-side drawer state (separate from desktop header dropdown)
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const headerMenuRef = useRef<HTMLDivElement>(null);

  // Close header menu on outside click
  useEffect(() => {
    if (!showHeaderMenu) return;
    const onDocClick = (e: MouseEvent) => {
      if (headerMenuRef.current && !headerMenuRef.current.contains(e.target as Node)) {
        setShowHeaderMenu(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [showHeaderMenu]);
  const [chatSearchTerm, setChatSearchTerm] = useState('');
  const [selectedChat, setSelectedChat] = useState<ChatWithDetails | null>(null);
  const [messages, setMessages] = useState<IMessage[]>([]);
  const [requestActionLoading, setRequestActionLoading] = useState<'accept' | 'decline' | null>(null);
  const [messageText, setMessageText] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [messageToEdit, setMessageToEdit] = useState<IMessage | null>(null);
  const [isMobileView, setIsMobileView] = useState(window.innerWidth < 768);
  const [showChatList, setShowChatList] = useState(window.innerWidth >= 768 || !selectedChat);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [firebaseConnected, setFirebaseConnected] = useState(true);
  const activeListenersRef = useRef<(() => void)[]>([]);
  const {
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
    sortingChatsTimerRef
  } = useChatList({ currentUser, firebaseConnected, showArchived, activeListenersRef });
  const { blockingStatus, setBlockingStatus } = useBlockingStatus({ currentUser, selectedChat });
  const [isInputOverflowing, setIsInputOverflowing] = useState(false);  const observersRef = useRef<Map<string, IntersectionObserver>>(new Map());
  const [isDocumentVisible, setIsDocumentVisible] = useState(document.visibilityState === 'visible');
  const [isChatInFocus, setIsChatInFocus] = useState(true);
  const [replyToMessage, setReplyToMessage] = useState<IMessage | null>(null);  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; message: IMessage } | null>(null);  // Add the missing state variables for reaction details
  const [showReactionDetails, setShowReactionDetails] = useState(false);
  const [selectedReactions, setSelectedReactions] = useState<{user: User | null, timestamp: Timestamp, displayName?: string, type?: string}[]>([]);  const [chatContextMenu, setChatContextMenu] = useState<{ position: { x: number; y: number }; chat: ChatWithDetails } | null>(null);
  // State for Chat Action Sheet (mobile)
  const [chatActionSheet, setChatActionSheet] = useState<{ chat: ChatWithDetails } | null>(null);

  // Handle deep-link: /messages?userId=TARGET_ID -> ensure chat exists and open it
  const [handledDeepLink, setHandledDeepLink] = useState(false);
  useEffect(() => {
    // Only run once per navigation change
    if (handledDeepLink) return;
    if (!currentUser) return;
    try {
      const params = new URLSearchParams(window.location.search);
      const targetChatId = params.get('chatId');
      if (targetChatId) {
        (async () => {
          try {
            const chat = await getChatById(targetChatId);
            if (!chat) {
              throw new Error('Space chat was not found.');
            }
            if (!chat.participants.includes(currentUser.id)) {
              throw new Error('You are not a member of this chat.');
            }
            const hydrated = {
              ...(chat as ChatWithDetails),
              isGroupChat: chat.isGroupChat,
              adminId: chat.adminId ?? null,
              lastMessage: chat.lastMessage ?? null
            } as ChatWithDetails;
            setSelectedChat(hydrated);
            FriendUID.friendUID = '';
            if (window.innerWidth < 768) setShowChatList(false);
          } catch (e) {
            console.error('Failed to open chat from deep-link:', e);
            alert(e instanceof Error ? e.message : 'Unable to open chat');
          } finally {
            safeNavigate('/messages', { replace: true });
            setHandledDeepLink(true);
          }
        })();
        return;
      }

      const targetUserId = params.get('userId');
      if (!targetUserId) return;

      // Prevent self-chat creation
      if (targetUserId === currentUser.id) {
        safeNavigate('/messages', { replace: true });
        setHandledDeepLink(true);
        return;
      }

      (async () => {
        try {
          const chat = await ensureDirectChat(currentUser.id, targetUserId);
          // Build minimal ChatWithDetails and hydrate otherUser for header UI
          const otherProfile = await getUserProfile(targetUserId);
          const chatWith: ChatWithDetails = {
            ...chat,
            isGroupChat: false,
            otherUser: otherProfile || undefined,
          } as ChatWithDetails;
          setSelectedChat(chatWith);
          FriendUID.friendUID = ''
          // On mobile, automatically focus the conversation view
          if (window.innerWidth < 768) setShowChatList(false);
        } catch (e) {
          console.error('Failed to open or create direct chat from deep-link:', e);
        } finally {
          // Clean the URL so refresh/back won’t re-trigger
          safeNavigate('/messages', { replace: true });
          setHandledDeepLink(true);
        }
      })();
    } catch (err) {
      console.error('Error processing messaging deep-link:', err);
    }
  }, [currentUser, handledDeepLink, safeNavigate]);

  // Media preview (images/videos) shared handlers for Message components
  const [mediaPreviewOpen, setMediaPreviewOpen] = useState(false);
  const [mediaPreviewImages, setMediaPreviewImages] = useState<string[]>([]);
  const [mediaCurrentIndex, setMediaCurrentIndex] = useState(0);
  const [mediaVideoOpen, setMediaVideoOpen] = useState(false);
  const [mediaVideoUrl, setMediaVideoUrl] = useState<string | null>(null);
  // Smooth transition helpers for image preview
  const [displayedImageSrc, setDisplayedImageSrc] = useState<string | null>(null);
  const [imageFade, setImageFade] = useState(false);
  const transitionTimeoutRef = useRef<number | null>(null);

  const openImagePreview = (images: string[], startIndex: number) => {
    setMediaPreviewImages(images || []);
    setMediaCurrentIndex(startIndex || 0);
    // initialize displayed image and ensure no pending transitions
    if (transitionTimeoutRef.current) {
      window.clearTimeout(transitionTimeoutRef.current);
      transitionTimeoutRef.current = null;
    }
    const initial = (images && images[startIndex]) || images?.[0] || null;
    setDisplayedImageSrc(initial);
    setImageFade(false);
    setMediaPreviewOpen(true);
  };

  const openVideoPreview = (url: string) => {
    setMediaVideoUrl(url);
    setMediaVideoOpen(true);
  };

  const downloadImage = async (url: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `media-${Date.now()}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      console.error('Failed to download media:', error);
    }
  };

  // Cleanup transition timeout when modal closes or component unmounts
  useEffect(() => {
    if (!mediaPreviewOpen && transitionTimeoutRef.current) {
      window.clearTimeout(transitionTimeoutRef.current);
      transitionTimeoutRef.current = null;
    }
    return () => {
      if (transitionTimeoutRef.current) {
        window.clearTimeout(transitionTimeoutRef.current);
        transitionTimeoutRef.current = null;
      }
    };
  }, [mediaPreviewOpen]);

  const goToPrevious = () => {
    if (!mediaPreviewImages || mediaPreviewImages.length <= 1) return;
    const newIdx = mediaCurrentIndex > 0 ? mediaCurrentIndex - 1 : mediaPreviewImages.length - 1;
    if (transitionTimeoutRef.current) {
      window.clearTimeout(transitionTimeoutRef.current);
      transitionTimeoutRef.current = null;
    }
    setImageFade(true);
    // wait for fade out, then swap image and fade in
    transitionTimeoutRef.current = window.setTimeout(() => {
      setMediaCurrentIndex(newIdx);
      setDisplayedImageSrc(mediaPreviewImages[newIdx]);
      setImageFade(false);
      transitionTimeoutRef.current = null;
    }, 220);
  };

  const goToNext = () => {
    if (!mediaPreviewImages || mediaPreviewImages.length <= 1) return;
    const newIdx = mediaCurrentIndex < mediaPreviewImages.length - 1 ? mediaCurrentIndex + 1 : 0;
    if (transitionTimeoutRef.current) {
      window.clearTimeout(transitionTimeoutRef.current);
      transitionTimeoutRef.current = null;
    }
    setImageFade(true);
    transitionTimeoutRef.current = window.setTimeout(() => {
      setMediaCurrentIndex(newIdx);
      setDisplayedImageSrc(mediaPreviewImages[newIdx]);
      setImageFade(false);
      transitionTimeoutRef.current = null;
    }, 220);
  };

  // Theme customization state
  const [showThemeModal, setShowThemeModal] = useState(false);
  const [pendingTheme, setPendingTheme] = useState<string>('green');

  // Theme helpers
  const getThemeKey = () => toThemeKey(selectedChat?.theme || undefined);
  const getThemeStyles = (key?: string) => getThemeStylesByKey(key ?? selectedChat?.theme ?? undefined);

  const openThemeModal = () => {
    if (!selectedChat) return;
    setPendingTheme(selectedChat.theme || 'green');
    setShowThemeModal(true);
  };

  const applyChatTheme = async () => {
    try {
      if (!selectedChat) return;
      // Capture scroll position to preserve view during theme change
      const container = chatContainerRef.current || document.querySelector('.messages-container') as HTMLElement | null;
      const prevScrollTop = container ? container.scrollTop : 0;
      const prevScrollHeight = container ? container.scrollHeight : 0;

      // Add temporary flag to suppress CSS transitions/layout jumps
      if (container) container.classList.add('theme-updating');

      // Persist to Firestore
      await updateDoc(doc(db, CHATS_COLLECTION, selectedChat.id), { theme: pendingTheme });
      // Optimistic local updates
      setSelectedChat(prev => (prev && prev.id === selectedChat.id ? { ...prev, theme: pendingTheme } as ChatWithDetails : prev));
      setChats(prev => prev.map(c => (c.id === selectedChat.id ? { ...c, theme: pendingTheme } : c)));
      setShowThemeModal(false);

      // Restore scroll position after DOM updates to avoid jumping
      requestAnimationFrame(() => {
        try {
          if (container) {
            const newScrollHeight = container.scrollHeight;
            const delta = newScrollHeight - prevScrollHeight;
            // Keep the user's viewport stable by adding the delta
            container.scrollTop = prevScrollTop + delta;
            // Remove the theme-updating class shortly after allowing layout to stabilise
            setTimeout(() => container.classList.remove('theme-updating'), 120);
          }
        } catch (e) {
          if (container) container.classList.remove('theme-updating');
        }
      });

      showToast('success', 'Chat theme updated');
    } catch (e) {
      console.error('Failed to update chat theme:', e);
      showToast('error', 'Failed to update theme');
    }
  };

  // --- Notification/Toast utility ---
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  // Add state for editing message
  const [editingMessage, setEditingMessage] = useState<IMessage | null>(null);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [profanityModalOpen, setProfanityModalOpen] = useState(false);
  const [detectedProfaneWords, setDetectedProfaneWords] = useState<string[]>([]);

  // Pagination state: load latest 20 initially, older on demand
  const pageSize = 20;
  const {
    waitForMediaLoad,
    loadOlderMessages,
    olderMessagesRef,
    prefetchedPageRef,
    isLoadingOlder,
    hasMoreOlder,
    isNearBottomRef
  } = useMessagePagination({
    selectedChat,
    messages,
    currentUser,
    chatContainerRef,
    messagesEndRef,
    pageSize,
    setMessages
  });
  const [isMessagesLoading, setIsMessagesLoading] = useState(true);
  // Stable loading flag to avoid rapid flicker when messages load very quickly.
  // When true we show skeletons for at least `minLoadingMs` to make transitions smooth.
  const [stableLoading, setStableLoading] = useState(true);
  const stableTimerRef = useRef<number | null>(null);
  const minLoadingMs = 300; // Minimum skeleton display time in ms

  // Add state for delete message dialog
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [messageToDelete, setMessageToDelete] = useState<IMessage | null>(null);

  // Add state for forward message dialog
  const [showForwardDialog, setShowForwardDialog] = useState(false);
  const [messageToForward, setMessageToForward] = useState<IMessage | null>(null);

  // Add state for group modal
  const [showGroupModal, setShowGroupModal] = useState(false);
  // Add state for the new Add Member modal
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);

  // Group creation modal state
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
  // Add state for delete chat dialog
  const [showDeleteChatDialog, setShowDeleteChatDialog] = useState(false);
  // Chat list filter: all, private (1:1), groups
  const [chatFilter, setChatFilter] = useState<'all' | 'private' | 'groups'>('all');
  // Message Requests overlay
  const [showRequests, setShowRequests] = useState<boolean>(false);
  const requestChats = useMemo(() => {
    const combined = [...activeChats, ...archivedChats];
    // Only show requests where current user is NOT the initiator
    return combined.filter(c => {
      const req = (c as any).isMessageRequest === true;
      const initiator = (c as any).initiator ?? (c as any).messageRequestInitiatorId;
      return req && initiator !== currentUser?.id;
    });
  }, [activeChats, archivedChats, currentUser?.id]);
  const pendingRequestCount = requestChats.length;

  const selectedDirectOtherUserId = useMemo(() => {
    if (!selectedChat || selectedChat.isGroupChat || !currentUser?.id) return null;
    return selectedChat.otherUser?.id || selectedChat.participants?.find(id => id !== currentUser.id) || null;
  }, [selectedChat, currentUser?.id]);

  const selectedDirectOtherUser = useMemo(() => {
    if (!selectedChat || selectedChat.isGroupChat || !selectedDirectOtherUserId) return null;
    return selectedChat.otherUser || selectedChat.users?.find(u => u.id === selectedDirectOtherUserId) || null;
  }, [selectedChat, selectedDirectOtherUserId]);

  // Get audio call context (global)
  const {
    activeAudioCall,
    callActionLoading,
    incomingCallCallerUid,
    initiateCall: contextInitiateCall,
  } = useAudioCallContext();

  // Compute if can start audio call (chat-specific logic)
  const canStartAudioCall = useMemo(() => {
    if (!currentUser || !selectedChat || selectedChat.isGroupChat) return false;
    if (!selectedDirectOtherUserId || !selectedDirectOtherUser) return false;
    if (blockingStatus.isBlocked || blockingStatus.isBlockedBy || blockingStatus.isLoading) return false;
    if (activeAudioCall) return false;
    if ((selectedChat as any)?.isMessageRequest === true) return false;
    return true;
  }, [
    currentUser,
    selectedChat,
    selectedDirectOtherUser,
    selectedDirectOtherUserId,
    blockingStatus.isBlocked,
    blockingStatus.isBlockedBy,
    blockingStatus.isLoading,
    activeAudioCall,
  ]);

  // Handler to initiate audio call from chat header
  const handleStartAudioCall = useCallback(async () => {
    if (!selectedDirectOtherUserId || !selectedDirectOtherUser) return;
    
    // Additional validation
    if (blockingStatus.isBlocked || blockingStatus.isBlockedBy) {
      showToast('error', `${selectedDirectOtherUser.name || 'This user'} is unavailable right now.`);
      return;
    }
    
    await contextInitiateCall(
      selectedDirectOtherUserId,
      selectedDirectOtherUser,
      selectedDirectOtherUser.name || 'this user'
    );
  }, [selectedDirectOtherUserId, selectedDirectOtherUser, blockingStatus, contextInitiateCall, showToast]);

  // Blocked Users overlay (UI only)
  const [showBlocked, setShowBlocked] = useState<boolean>(false);

  // Memoized chats to display based on filter and minimal data validity
  const displayedChats = useMemo(() => {
    const valid = chats.filter(chat => {
      if (chat.isGroupChat) return !!(chat.name && chat.name.trim() !== '');
      return !!(chat.otherUser && chat.otherUser.name && chat.otherUser.name.trim() !== '');
   })
   // Hide Message Requests from the main chat list; they appear in the Requests tab
   .filter(c => (c as any).isMessageRequest !== true);
    if (chatFilter === 'private') return valid.filter(c => !c.isGroupChat);
    if (chatFilter === 'groups') return valid.filter(c => c.isGroupChat);
    return valid;
  }, [chats, chatFilter]);

  const normalizedChatSearch = chatSearchTerm.trim().toLowerCase();

  const directChatByUserId = useMemo(() => {
    const map = new Map<string, ChatWithDetails>();
    chats.forEach(chat => {
      if (chat.isGroupChat) return;
      const otherId = chat.otherUser?.id || chat.participants?.find(id => id !== currentUser?.id);
      if (otherId) {
        map.set(otherId, chat);
      }
    });
    return map;
  }, [chats, currentUser?.id]);

  const chatMatchesSearch = useCallback((chat: ChatWithDetails, term: string) => {
    if (!term) return true;
    const lowered = term.toLowerCase();
    const fields: string[] = [];

    if (chat.isGroupChat) {
      if (chat.name) fields.push(chat.name);
      chat.users?.forEach(member => {
        if (member?.name) fields.push(member.name);
      });
    } else {
      const other = chat.otherUser
        || chat.users?.find(u => u.id && u.id !== currentUser?.id)
        || chat.participantDetails?.find(u => u.id && u.id !== currentUser?.id);

      if (other) {
        if (other.name) fields.push(other.name);
        if (other.email) fields.push(other.email);
        if (other.id) fields.push(other.id);
      }
    }

    const lastContent = (chat.lastMessage as any)?.content;
    if (typeof lastContent === 'string') {
      fields.push(lastContent);
    }

    return fields.some(value => value && value.toLowerCase().includes(lowered));
  }, [currentUser?.id]);

  const visibleChats = useMemo(() => {
    if (!normalizedChatSearch) return displayedChats;
    return displayedChats.filter(chat => chatMatchesSearch(chat, normalizedChatSearch));
  }, [displayedChats, normalizedChatSearch, chatMatchesSearch]);

  useEffect(() => {
    if (isLoading || !emptyDelayPassed) {
      setIsSortingChats(false);
      if (sortingChatsTimerRef.current) {
        window.clearTimeout(sortingChatsTimerRef.current);
        sortingChatsTimerRef.current = null;
      }
      return;
    }

    setIsSortingChats(true);
    if (sortingChatsTimerRef.current) {
      window.clearTimeout(sortingChatsTimerRef.current);
    }

    sortingChatsTimerRef.current = window.setTimeout(() => {
      setIsSortingChats(false);
      sortingChatsTimerRef.current = null;
    }, 0);

    return () => {
      if (sortingChatsTimerRef.current) {
        window.clearTimeout(sortingChatsTimerRef.current);
        sortingChatsTimerRef.current = null;
      }
    };
  }, [visibleChats, isLoading, emptyDelayPassed]);

  const visibleChatUserIds = useMemo(() => {
    const ids = new Set<string>();
    visibleChats.forEach(chat => {
      if (chat.isGroupChat) return;
      const otherId = chat.otherUser?.id || chat.participants?.find(id => id !== currentUser?.id);
      if (otherId) {
        ids.add(otherId);
      }
    });
    return ids;
  }, [visibleChats, currentUser?.id]);

  const userSearchMatches = useMemo(() => {
    if (!normalizedChatSearch) return [];
    return messageableUsers
      .filter(user => {
        if (!user || !user.id) return false;
        if (user.id === currentUser?.id) return false;
        if (!canStartDirectChat(currentUser as any, user as any)) return false;
        const name = user.name?.toLowerCase() ?? '';
        const email = user.email?.toLowerCase() ?? '';
        const id = user.id.toLowerCase();
        return [name, email, id].some(value => value.includes(normalizedChatSearch));
      })
      .filter(user => !visibleChatUserIds.has(user.id))
      .slice(0, 10);
  }, [normalizedChatSearch, messageableUsers, currentUser?.id, visibleChatUserIds]);

  const hasChatSearch = normalizedChatSearch.length > 0;
  const shouldShowEmptyState = visibleChats.length === 0 && (!hasChatSearch || userSearchMatches.length === 0);

  // Group creation handler
  const handleCreateGroupChat = async (memberIds: string[], groupName: string) => {
    if (!currentUser) return;
    try {
      // Always include the current user as admin/creator
      const allMembers = Array.from(new Set([currentUser.id, ...memberIds]));
      const newGroup = await createChat(allMembers, true, groupName, currentUser.id);
      setSelectedChat(newGroup as ChatWithDetails);
      setShowCreateGroupModal(false);
    } catch (e) {
      alert('Failed to create group chat: ' + (e instanceof Error ? e.message : String(e)));
    }
  };

  // Visit profile handler
  const handleVisitProfile = (userId: string) => {
    safeNavigate(`/profile/${userId}`);
  };

  // Get messages for selected chat using optimized incremental listener
  useEffect(() => {
    if (!selectedChat || !currentUser || !firebaseConnected) return;

    let unsub: (() => void) | null = null;
    let initialized = false;

    const onInit = (initialMessages: any[]) => {
      // Ensure skeletons stay visible for a short minimum duration to avoid UI flicker
      const now = Date.now();
      if (stableTimerRef.current) {
        window.clearTimeout(stableTimerRef.current);
        stableTimerRef.current = null;
      }
      setIsMessagesLoading(false);
      setStableLoading(true);
      stableTimerRef.current = window.setTimeout(() => setStableLoading(false), minLoadingMs);
      // Reset delayed empty indicator each time messages load completes
      setEmptyDelayPassed(false);
      setTimeout(() => setEmptyDelayPassed(true), 450);

      // Merge initial messages with any cached older messages and optimistic local messages
      setMessages(prev => {
        const optimistic = prev.filter(m => (m as LocalMessage).localStatus === 'sending');
        const olderCached = olderMessagesRef.current && olderMessagesRef.current.length > 0 ? olderMessagesRef.current : [];

        // Combine older cache (older -> newer), initial page (newer), and optimistic
        const combined = [...olderCached, ...initialMessages, ...optimistic];

        // Deduplicate by id while preserving order
        const seen = new Set<string>();
        const deduped: any[] = [];
        for (const m of combined) {
          if (!m || !m.id) continue;
          if (!seen.has(m.id)) {
            seen.add(m.id);
            deduped.push(m);
          }
        }

        deduped.sort((a, b) => (a.createdAt instanceof Timestamp ? a.createdAt.toMillis() : 0) - (b.createdAt instanceof Timestamp ? b.createdAt.toMillis() : 0));
        return deduped;
      });

      // Mark read after initial load
      markMessagesAsRead(selectedChat.id, currentUser.id).catch(console.error);
      // Update delivery status
      try {
        updateMessagesDeliveryStatus(selectedChat.id, currentUser.id).catch(console.error);
      } catch (e) {
        console.error('Failed to update delivery status:', e);
      }

      // Scroll to bottom on first load, but wait for images/videos to stabilise so layout
      // doesn't jump after media finishes loading.
      requestAnimationFrame(async () => {
        try {
          await waitForMediaLoad(2000);
        } catch (e) {
          // ignore
        }
        messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
      });

      initialized = true;
      hasScrolledToBottom.current = true;
      // Persist initial page to cache
      (async () => {
        try {
          if (selectedChat) await messageCache.saveMessages(selectedChat.id, initialMessages as any[]);
        } catch (e) {
          console.debug('Failed to save initial messages to cache', e);
        }
      })();
    };

    const onChanges = (change: { type: 'added' | 'modified' | 'removed'; message: any; newIndex: number }) => {
      setMessages(prev => {
        // Keep optimistic sending messages
        const optimistic = prev.filter(m => (m as LocalMessage).localStatus === 'sending');
        const withoutOptimistic = prev.filter(m => !(m as LocalMessage).localStatus);

        let next = [...withoutOptimistic];

        if (change.type === 'added') {
          // Insert according to newIndex (newIndex is ascending index)
          // If newIndex is at end, push
          if (change.newIndex >= next.length) {
            next.push(change.message);
          } else {
            next.splice(change.newIndex, 0, change.message);
          }
        } else if (change.type === 'modified') {
          const idx = next.findIndex(m => m.id === change.message.id);
          if (idx !== -1) {
            const merged = { ...next[idx], ...change.message } as any;
            // Keep reactions authoritative from server updates to avoid stale overwrite in local state.
            if (Object.prototype.hasOwnProperty.call(change.message, 'reactions')) {
              merged.reactions = change.message.reactions || {};
            }
            next[idx] = merged;
          }
        } else if (change.type === 'removed') {
          next = next.filter(m => m.id !== change.message.id);
        }

        // Merge back optimistic messages that are not part of next
        optimistic.forEach(opt => {
          if (!next.some(m => m.id === opt.id)) next.push(opt);
        });

        // Ensure ascending order by timestamp
        next.sort((a, b) => (a.createdAt instanceof Timestamp ? a.createdAt.toMillis() : 0) - (b.createdAt instanceof Timestamp ? b.createdAt.toMillis() : 0));
        return next;
      });

      // Auto-scroll if near bottom
      if (isNearBottomRef.current) {
        requestAnimationFrame(() => messagesEndRef.current?.scrollIntoView({ behavior: 'auto' }));
      }
      // Persist single message change to cache (added/modified)
      (async () => {
        try {
          if (selectedChat && (change.type === 'added' || change.type === 'modified')) {
            await messageCache.saveMessages(selectedChat.id, [change.message]);
          }
        } catch (e) {
          console.debug('Failed to persist message change', e);
  }
      })();
    };

  setIsMessagesLoading(true);
  try {
      unsub = listenToRecentMessages(selectedChat.id, onInit, onChanges, pageSize);
      if (unsub) activeListenersRef.current.push(unsub);
    } catch (err) {
      console.error('Error setting up incremental message listener:', err);
    }

  return () => {
      if (unsub) {
        try { unsub(); } catch (e) { console.error('Error unsubscribing messages listener', e); }
        activeListenersRef.current = activeListenersRef.current.filter(fn => fn !== unsub);
      }
      if (stableTimerRef.current) {
        window.clearTimeout(stableTimerRef.current);
        stableTimerRef.current = null;
      }
    };
  }, [selectedChat, currentUser, firebaseConnected]);

  // Hydrate messages from cache immediately when selecting a chat
  useEffect(() => {
    if (!selectedChat) return;
    (async () => {
      try {
        const cached = await messageCache.getMessagesForConversation(selectedChat.id, pageSize);
        if (cached && cached.length) {
          // Convert createdAt back to Timestamp-like object used in UI if needed
          const normalized = cached.map((m: any) => ({ ...m, createdAt: typeof m.createdAt === 'number' ? { toMillis: () => m.createdAt, toDate: () => new Date(m.createdAt) } : m.createdAt }));
          setMessages(prev => {
            const optimistic = prev.filter(p => (p as LocalMessage).localStatus === 'sending');
            // Merge dedupe
            const ids = new Set(prev.map(p => p.id));
            const merged = [...normalized.reverse().filter((m: any) => !ids.has(m.id)), ...prev];
            merged.sort((a, b) => (a.createdAt && typeof a.createdAt.toMillis === 'function' ? a.createdAt.toMillis() : a.createdAt) - (b.createdAt && typeof b.createdAt.toMillis === 'function' ? b.createdAt.toMillis() : b.createdAt));
            return [...merged, ...optimistic];
          });
        }
      } catch (e) {
        console.debug('No cached messages or failed to read cache', e);
      }
    })();
  }, [selectedChat?.id]);

  // Add this near other refs
  const hasScrolledToBottom = useRef<boolean>(false);
  // Track previous selected chat id so we don't clear messages when only the chat object changes (e.g. theme update)
  const prevChatIdRef = useRef<string | null>(null);
  // Update the useEffect for selectedChat changes
  useEffect(() => {
    if (selectedChat) {
      // Only clear messages when the chat id actually changed (avoid clearing on theme/object updates)
      const prevId = prevChatIdRef.current;
      if (prevId !== selectedChat.id) {
        setMessages([]);
        // Reset the scroll flag when changing chats
        hasScrolledToBottom.current = false;
      }
      prevChatIdRef.current = selectedChat.id;
      
      // For desktop, ensure the input field is correctly positioned immediately
      if (!isMobileView) {
        // Force immediate rendering of the proper elevated position
        const inputContainer = document.querySelector('.bg-\\[\\#121212\\].border-t.border-gray-800\\/10.px-2.sm\\:px-4.py-2');
        if (inputContainer) {
          // Force immediate style application without any delay
          // Set the transform to -2px (matching our CSS) to ensure it's elevated from the start
          (inputContainer as HTMLElement).style.transition = 'none';
          (inputContainer as HTMLElement).style.transform = 'translateY(-2px)';
          // Also force the enhanced shadow to be applied immediately
          (inputContainer as HTMLElement).style.boxShadow = '0 -10px 20px rgba(0, 0, 0, 0.25), 0 -4px 10px rgba(0, 0, 0, 0.15)';
          
          // Ensure the message container is properly spaced relative to the elevated input
          const chatContainer = document.querySelector('.messages-container');
          if (chatContainer) {
            (chatContainer as HTMLElement).style.paddingBottom = '30px';
            (chatContainer as HTMLElement).style.marginBottom = '15px';
          }
        }
      }
      // Only auto-scroll on mobile view
      else if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: 'auto' });
      }
    }
  }, [selectedChat, isMobileView]);  // Update the useEffect for messages

  // Clear prevChatIdRef when chat is deselected
  useEffect(() => {
    if (!selectedChat) prevChatIdRef.current = null;
  }, [selectedChat]);
  useEffect(() => {  // Only scroll if this is the initial load of messages
  if (selectedChat && messagesEndRef.current && !hasScrolledToBottom.current) {
      // Check if this is just a reaction update by comparing message content
      const isReactionUpdate = messages.length > 0 && messages.every((msg, index) => {
        // If this is the first load, it's not a reaction update
        if (index === 0) return false;
        
        const prevMsg = messages[index - 1];
        // Check if content is the same but reactions might be different
  return msg.content === prevMsg.content && 
         msg.senderId === prevMsg.senderId &&
         (msg.createdAt instanceof Timestamp ? msg.createdAt.toMillis() : 0) === (prevMsg.createdAt instanceof Timestamp ? prevMsg.createdAt.toMillis() : 0);
      });
      
      // Only scroll if it's not just a reaction update
      if (!isReactionUpdate) {
        (async () => {
          try {
            await waitForMediaLoad(2000);
          } catch (e) {
            // ignore
          }
          // On desktop, use a more controlled scroll approach to prevent page jumping
          if (!isMobileView) {
            // Get the chat container element
            const chatContainer = document.querySelector('.messages-container');
            if (chatContainer) {
              // Apply scroll immediately for faster response
              // Ensure the input container is in its elevated position
              const inputContainer = document.querySelector('.bg-\\[\\#121212\\].border-t.border-gray-800\\/10.px-2.sm\\:px-4.py-2');
              if (inputContainer) {
                (inputContainer as HTMLElement).style.transform = 'translateY(-2px)';
                (inputContainer as HTMLElement).style.boxShadow = '0 -10px 20px rgba(0, 0, 0, 0.25), 0 -4px 10px rgba(0, 0, 0, 0.15)';
              }

              // Smoothly scroll to bottom without moving the entire page
              // Add extra padding to account for the input field being elevated
              const extraPadding = 40; // Increased padding for the more elevated input field
              chatContainer.scrollTop = chatContainer.scrollHeight + extraPadding;
            }
          } else {
            // Use scrollIntoView for mobile as it works better with mobile layouts
            messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
          }
          hasScrolledToBottom.current = true;
        })();
      }
    }  }, [selectedChat, messages.length, isMobileView]);

  // Mobile keyboard detection and input field positioning
  useEffect(() => {
    if (!isMobileView) return;

    document.body.classList.add('messaging-page');
    
    // Simplified viewport height management
    const updateViewportHeight = () => {
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty('--vh', `${vh}px`);
    };
    
    // Set initial viewport height
    updateViewportHeight();
    
    // Handle viewport changes (keyboard, orientation, resize)
    const handleViewportChange = () => {
      updateViewportHeight();
      
      // Detect keyboard state using visualViewport API if available
      if (window.visualViewport) {
        const keyboardHeight = window.innerHeight - window.visualViewport.height;
        const isKeyboardOpen = keyboardHeight > 100; // Reduced threshold for faster detection
        
        const wasKeyboardOpen = document.body.classList.contains('keyboard-open');
        
        if (isKeyboardOpen) {
          document.body.classList.add('keyboard-open');
          // Instant bottom positioning when keyboard opens
          if (!wasKeyboardOpen) {
            setTimeout(() => instantScrollToBottom(), 100);
          }
        } else {
          document.body.classList.remove('keyboard-open');
          // Instant bottom positioning when keyboard closes
          if (wasKeyboardOpen) {
            setTimeout(() => instantScrollToBottom(), 100);
          }
        }
      }
    };
    
    // Fallback keyboard detection for browsers without visualViewport
    const setupKeyboardDetection = () => {
      let keyboardTimeout: NodeJS.Timeout;
      
      const handleInputFocus = () => {
        clearTimeout(keyboardTimeout);
        keyboardTimeout = setTimeout(() => {
          const wasKeyboardOpen = document.body.classList.contains('keyboard-open');
          document.body.classList.add('keyboard-open');
          // Instant bottom positioning when keyboard opens
          if (!wasKeyboardOpen) {
            setTimeout(() => instantScrollToBottom(), 100);
          }
        }, 100);
      };
      
      const handleInputBlur = () => {
        clearTimeout(keyboardTimeout);
        keyboardTimeout = setTimeout(() => {
          if (!document.querySelector('input:focus, textarea:focus')) {
            const wasKeyboardOpen = document.body.classList.contains('keyboard-open');
            document.body.classList.remove('keyboard-open');
            // Instant bottom positioning when keyboard closes
            if (wasKeyboardOpen) {
              setTimeout(() => instantScrollToBottom(), 100);
            }
          }
        }, 100);
      };
      
      // Add listeners to input elements but ignore those inside modal dialogs
      // (modal inputs manage their own focus/blur and shouldn't trigger global keyboard layout changes)
      const inputs = Array.from(document.querySelectorAll('input, textarea')) as HTMLElement[];
      const attached: HTMLElement[] = [];
      inputs.forEach(input => {
        // Skip inputs that are inside elements with the `.modal-entry` class
        // or already opt-out via `data-no-keyboard` attribute
        try {
          if (input.closest('.modal-entry') || input.hasAttribute('data-no-keyboard')) return;
        } catch (e) {
          // ignore if any DOM API throws for unusual nodes
        }
        input.addEventListener('focus', handleInputFocus);
        input.addEventListener('blur', handleInputBlur);
        attached.push(input);
      });

      return () => {
        clearTimeout(keyboardTimeout);
        attached.forEach(input => {
          input.removeEventListener('focus', handleInputFocus);
          input.removeEventListener('blur', handleInputBlur);
        });
      };
    };
    
    // Set up event listeners
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleViewportChange);
      window.visualViewport.addEventListener('scroll', handleViewportChange);
    } else {
      const cleanupKeyboardDetection = setupKeyboardDetection();
      window.addEventListener('resize', handleViewportChange);
      
      return () => {
        cleanupKeyboardDetection();
        window.removeEventListener('resize', handleViewportChange);
      };
    }
    
    // Add resize listener for orientation changes
    window.addEventListener('resize', handleViewportChange);

    // Cleanup
    return () => {
      document.body.classList.remove('messaging-page');
      document.body.classList.remove('keyboard-open');
      
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleViewportChange);
        window.visualViewport.removeEventListener('scroll', handleViewportChange);
      }
      
      window.removeEventListener('resize', handleViewportChange);
    };
  }, [isMobileView]);

  // Compute if current chat is a pending Message Request where current user is the receiver (view mode)
  const isViewingPendingRequest = useMemo(() => {
    if (!selectedChat || !(selectedChat as any).isMessageRequest) return false;
    const initiator = (selectedChat as any).initiator ?? (selectedChat as any).messageRequestInitiatorId;
    return initiator && currentUser?.id && initiator !== currentUser.id;
  }, [selectedChat, currentUser?.id]);

  const requestInitiatorId = useMemo(() => {
    if (!selectedChat || !(selectedChat as any).isMessageRequest) return null;
    return (selectedChat as any).initiator ?? (selectedChat as any).messageRequestInitiatorId ?? null;
  }, [selectedChat]);

  const isMessageRequestActive = selectedChat?.isMessageRequest === true;
  const isCurrentUserRequestInitiator = isMessageRequestActive && requestInitiatorId === currentUser?.id;

  const requestCounterpartName = useMemo(() => {
    if (!selectedChat) return 'this user';
    if (selectedChat.otherUser?.name) return selectedChat.otherUser.name;
    const otherId = selectedChat.participants?.find(id => id !== currentUser?.id);
    if (otherId && Array.isArray(selectedChat.users)) {
      const fallback = selectedChat.users.find(u => u.id === otherId);
      if (fallback?.name) return fallback.name;
    }
    return 'this user';
  }, [selectedChat, currentUser?.id]);

  const markChatAsRequestAccepted = useCallback((chatId: string) => {
    const transform = (list: ChatWithDetails[]) => list.map(chat => (
      chat.id === chatId ? ({ ...chat, isMessageRequest: false } as ChatWithDetails) : chat
    ));
    setChats(prev => transform(prev));
    setActiveChats(prev => transform(prev));
    setArchivedChats(prev => transform(prev));
  }, [setChats, setActiveChats, setArchivedChats]);

  const removeChatFromLists = useCallback((chatId: string) => {
    const filterFn = (list: ChatWithDetails[]) => list.filter(chat => chat.id !== chatId);
    setChats(prev => filterFn(prev));
    setActiveChats(prev => filterFn(prev));
    setArchivedChats(prev => filterFn(prev));
  }, [setChats, setActiveChats, setArchivedChats]);

  const handleChatListAccept = useCallback((chat: ChatWithDetails) => {
    const chatId = chat.id;
    markChatAsRequestAccepted(chatId);
    // Set the accepted chat as selected (not just update if already selected)
    const updatedChat = { ...chat, isMessageRequest: false } as ChatWithDetails;
    setSelectedChat(updatedChat);
    // In mobile view, close the chat list to show the conversation
    if (isMobileView) {
      setShowChatList(false);
    }
    showToast('success', 'Message request accepted.');
    void messageCache.saveConversation(updatedChat);
  }, [markChatAsRequestAccepted, setSelectedChat, showToast, isMobileView, setShowChatList]);

  const handleChatListDecline = useCallback((chat: ChatWithDetails) => {
    const chatId = chat.id;
    removeChatFromLists(chatId);
    setSelectedChat(prev => {
      if (prev && prev.id === chatId) {
        setMessages([]);
        return null;
      }
      return prev;
    });
    setShowRequests(false);
    showToast('success', 'Message request declined.');
    messageCache.deleteConversation(chatId).catch(() => undefined);
  }, [removeChatFromLists, setMessages, setSelectedChat, setShowRequests, showToast]);

  const handleAcceptMessageRequest = useCallback(async () => {
    if (!selectedChat) return;
    const chatId = selectedChat.id;
    const snapshot = selectedChat;
    setRequestActionLoading('accept');
    try {
      await acceptMessageRequest(chatId);
      markChatAsRequestAccepted(chatId);
      setSelectedChat(prev => (prev && prev.id === chatId ? ({ ...prev, isMessageRequest: false } as ChatWithDetails) : prev));
      if (snapshot) {
        void messageCache.saveConversation({ ...snapshot, isMessageRequest: false });
      }
      setShowRequests(false);
      showToast('success', 'Message request accepted.');
    } catch (error) {
      console.error('Error accepting message request:', error);
      showToast('error', 'Failed to accept request. Please try again.');
    } finally {
      setRequestActionLoading(null);
    }
  }, [selectedChat, markChatAsRequestAccepted, setSelectedChat, setShowRequests, showToast]);

  const handleDeclineMessageRequest = useCallback(async () => {
    if (!selectedChat) return;
    const chatId = selectedChat.id;
    const snapshot = selectedChat;
    setRequestActionLoading('decline');
    try {
      await declineMessageRequest(chatId);
      removeChatFromLists(chatId);
      setSelectedChat(prev => {
        if (prev && prev.id === chatId) {
          setMessages([]);
          return null;
        }
        return prev;
      });
      setShowRequests(false);
      showToast('success', 'Message request declined.');
      if (snapshot) {
        messageCache.deleteConversation(chatId).catch(() => undefined);
      }
    } catch (error) {
      console.error('Error declining message request:', error);
      showToast('error', 'Failed to decline request. Please try again.');
    } finally {
      setRequestActionLoading(null);
    }
  }, [selectedChat, removeChatFromLists, setMessages, setSelectedChat, setShowRequests, showToast]);

  // Update handleSendMessageWithReply to use proper typing
  const handleSendMessageWithReply = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate prerequisites
    if (!currentUser || !selectedChat || !messageText.trim()) {
      if (!currentUser) {
        showToast('error', 'You must be logged in to send messages');
      } else if (!selectedChat) {
        showToast('error', 'No chat selected');
      } else if (!messageText.trim()) {
        showToast('error', 'Message cannot be empty');
      }
      return;
    }

    const textToSend = messageText.trim();

    // If we're editing a message
    if (editingMessage) {
      try {
        await editMessage(editingMessage.id, textToSend);
        // Update message in local state
        setMessages(prev => prev.map(msg => 
          msg.id === editingMessage.id 
            ? { ...msg, content: textToSend, edited: true } 
            : msg
        ));
        setEditingMessage(null);
        setMessageText('');
        
        // Keep keyboard open on mobile after editing message
        if (isMobileView && messageInputRef.current) {
          // Ensure keyboard stays open by maintaining focus
          document.body.classList.add('keyboard-open');
          
          // Use multiple focus attempts with increasing delays to ensure stability
          const focusAttempts = [0, 50, 100, 200];
          focusAttempts.forEach((delay, index) => {
            setTimeout(() => {
              if (messageInputRef.current) {
                messageInputRef.current.focus();
                // Force the keyboard to stay open
                document.body.classList.add('keyboard-open');
              }
              // Reset the sending flag after the last attempt
              if (index === focusAttempts.length - 1) {
                setIsSendingMessage(false);
              }
            }, delay);
          });
        } else {
          // Reset the sending flag for non-mobile or if no input ref
          setIsSendingMessage(false);
        }
        
        showToast('success', 'Message edited successfully');
        return;
      } catch (error) {
        console.error('Error editing message:', error);
        showToast('error', 'Failed to edit message');
        return;
      }
    }

    // Regular message sending logic
    const selectedChatId = selectedChat.id;
    const shouldOptimisticallyAcceptRequest = isViewingPendingRequest;
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Create optimistic message
    const optimisticMsg: LocalMessage = {
      id: tempId,
      chatId: selectedChatId,
      senderId: currentUser.id,
      content: textToSend,
      type: 'text',
      status: 'sent',
      createdAt: Timestamp.now(),
      readBy: [currentUser.id],
      replyTo: replyToMessage?.id ?? null,
      attachments: null,
      edited: false,
      localStatus: 'sending'
    };

    // Update UI state
    setMessages(prev => [...prev, optimisticMsg]);
    setMessageText('');
    setReplyToMessage(null);
    
    // Keep keyboard open on mobile after sending message.
    // Do NOT reset the sending flag here — keep the send button loading until
    // the actual send (and any uploads) finishes. We still attempt to keep
    // the input focused on mobile for UX stability.
    if (isMobileView && messageInputRef.current) {
      document.body.classList.add('keyboard-open');
      const focusAttempts = [0, 50, 100, 200];
      focusAttempts.forEach((delay) => {
        setTimeout(() => {
          if (messageInputRef.current) {
            messageInputRef.current.focus();
            document.body.classList.add('keyboard-open');
          }
        }, delay);
      });
    }

    try {
      const result = await sendMessage(
        selectedChatId,
        currentUser.id,
        textToSend,
        'text',
        [],
        replyToMessage?.id ?? null,
        tempId // pass clientMessageId so server doc uses same ID
      );

      if (result) {
        // Since real message reuses the optimistic ID, just update its localStatus
        setMessages(prev => prev.map(msg => msg.id === tempId ? { ...msg, localStatus: undefined } : msg));
        
        // Move this chat to the top of the list immediately without waiting for Firestore
        // This ensures a responsive UI even before the server timestamp propagates
        setChats(prevChats => {
          // First, find the chat that was just updated
          const updatedChatIndex = prevChats.findIndex(chat => chat.id === selectedChatId);
          if (updatedChatIndex === -1) return prevChats; // Chat not found
          
          // Create a copy of the chats array
          const newChats = [...prevChats];
          
          // Get the chat that was just updated
          const updatedChat = { ...newChats[updatedChatIndex] };
          
          // Update its lastMessage with our new message info
          updatedChat.lastMessage = result;
          
          // Remove the chat from its current position
          newChats.splice(updatedChatIndex, 1);
          
          // Add it back at the beginning (top of the list)
          newChats.unshift(updatedChat);
          
          return newChats;
        });

        if (shouldOptimisticallyAcceptRequest) {
          markChatAsRequestAccepted(selectedChatId);
          setSelectedChat(prev => (
            prev && prev.id === selectedChatId
              ? ({ ...prev, isMessageRequest: false } as ChatWithDetails)
              : prev
          ));
        }
        
        // Don't scroll immediately after sending - let the message listener handle it
        // This prevents double scrolling when the real message comes through
      }
    } catch (error: any) {
      console.error('Error sending message:', error);
      
      // Remove the optimistic message
      setMessages(prev => prev.filter(msg => msg.id !== tempId));
      
      // Check if error is related to blocking
      if (error.message && (error.message.includes('blocked') || error.message.includes('block'))) {
        // This is a blocking-related error, show appropriate message
        showToast('error', error.message);
        
        // Also check real-time block status to ensure UI reflects current state
        if (selectedChat && selectedChat.otherUser) {
          const blockStatus = await checkMutualBlock(currentUser.id, selectedChat.otherUser.id);
          setBlockingStatus({
            isBlocked: blockStatus.user1BlockedUser2,
            isBlockedBy: blockStatus.user2BlockedUser1,
            isLoading: false
          });
        }
      } else {
        // General error
        showToast('error', 'Failed to send message. Please try again.');
      }
    }
    
    // Always reset the sending flag at the end
    setIsSendingMessage(false);
  };

  // Check if input is overflowing and update state
  const checkInputOverflow = useCallback(() => {
    if (messageInputRef.current) {
      const isOverflowing = messageInputRef.current.scrollWidth > messageInputRef.current.clientWidth;
      setIsInputOverflowing(isOverflowing);
    }
  }, []);
  // Handle screen resize
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobileView(mobile);
      
      // On desktop, always show chat list
      if (!mobile) {
        setShowChatList(true);
      }
      // On mobile, show chat list if no chat is selected
      else if (!selectedChat) {
        setShowChatList(true);
      }
    };

    handleResize(); // Call once to set initial state
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [selectedChat]);

  // Mobile keyboard and viewport handling effect
  useEffect(() => {
    if (!isMobileView) return;
    
    document.body.classList.add('messaging-page');
    
    // Simplified viewport height management
    const updateViewportHeight = () => {
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty('--vh', `${vh}px`);
    };
    
    // Set initial viewport height
    updateViewportHeight();
    
    // Handle viewport changes (keyboard, orientation, resize)
    const handleViewportChange = () => {
      updateViewportHeight();
      
      // Detect keyboard state using visualViewport API if available
      if (window.visualViewport) {
        const keyboardHeight = window.innerHeight - window.visualViewport.height;
        const isKeyboardOpen = keyboardHeight > 150; // Threshold for keyboard detection
        
        if (isKeyboardOpen) {
        document.body.classList.add('keyboard-open');
      } else {
        document.body.classList.remove('keyboard-open');
      }
      }
    };
    
    // Fallback keyboard detection for browsers without visualViewport
    const setupKeyboardDetection = () => {
      let keyboardTimeout: NodeJS.Timeout;
      
      const handleInputFocus = () => {
        clearTimeout(keyboardTimeout);
        keyboardTimeout = setTimeout(() => {
          document.body.classList.add('keyboard-open');
        }, 100);
      };
      
      const handleInputBlur = () => {
        clearTimeout(keyboardTimeout);
        keyboardTimeout = setTimeout(() => {
          if (!document.querySelector('input:focus, textarea:focus')) {
            document.body.classList.remove('keyboard-open');
          }
        }, 100);
      };
      
      // Add listeners to all input elements
      const inputs = document.querySelectorAll('input, textarea');
      inputs.forEach(input => {
        input.addEventListener('focus', handleInputFocus);
        input.addEventListener('blur', handleInputBlur);
      });
      
      return () => {
        clearTimeout(keyboardTimeout);
        inputs.forEach(input => {
          input.removeEventListener('focus', handleInputFocus);
          input.removeEventListener('blur', handleInputBlur);
        });
      };
    };
    
    // Set up event listeners
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleViewportChange);
      window.visualViewport.addEventListener('scroll', handleViewportChange);
    } else {
      const cleanupKeyboardDetection = setupKeyboardDetection();
      window.addEventListener('resize', handleViewportChange);
      
      return () => {
        cleanupKeyboardDetection();
        window.removeEventListener('resize', handleViewportChange);
      };
    }
    
    // Add resize listener for orientation changes
    window.addEventListener('resize', handleViewportChange);
    
    // Cleanup
    return () => {
      document.body.classList.remove('messaging-page');
      document.body.classList.remove('keyboard-open');
      
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleViewportChange);
        window.visualViewport.removeEventListener('scroll', handleViewportChange);
      }
      
      window.removeEventListener('resize', handleViewportChange);
    };
  }, [isMobileView]);

  // Handle cleanup of Firebase listeners when component unmounts
  useEffect(() => {
    return () => {
      // Clean up all active listeners
      activeListenersRef.current.forEach(unsubscribe => {
        try {
          unsubscribe();
        } catch (error) {
          console.error('Error cleaning up listener:', error);
        }
      });
      activeListenersRef.current = [];
    };  }, []);
  // Add Firebase connection state listener with improved error handling
  useEffect(() => {
    // Set default connection state to true to prevent false offline warnings
    setFirebaseConnected(true);
    
    // Monitor Firestore connection state
    try {
      const unsubscribe = onSnapshot(
        doc(db, '.info/connected'),
        (snapshot) => {
          // Set connection based on connected field, with true as default/fallback
          setFirebaseConnected(snapshot.exists() ? !!snapshot.data()?.connected : true);
        },
        (error) => {
          console.error('Error monitoring Firestore connection:', error);
          // If there's an error with the connection monitor, assume connected
          setFirebaseConnected(true);
        }
      );
      
      // Also check network connection to handle "online" events
      const handleOnline = () => setFirebaseConnected(true);
      const handleOffline = () => setFirebaseConnected(false);
      
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
      
      return () => {
        unsubscribe();
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    } catch (error) {
      console.error('Failed to set up connection monitor:', error);
      // If there's an error setting up the listener, assume connected
      setFirebaseConnected(true);
      return () => {};
    }
  }, []);

  // Update visibility change listener to track document visibility
  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsDocumentVisible(document.visibilityState === 'visible');
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Track window focus/blur state
  useEffect(() => {
    const handleFocus = () => setIsChatInFocus(true);
    const handleBlur = () => setIsChatInFocus(false);
    
    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);
    
    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  // Update read receipt handling
  useEffect(() => {
    if (!selectedChat || !currentUser || !messages.length) return;
    
    // Track which messages need read receipts
    const unreadMessages = messages.filter(message => 
      message.senderId !== currentUser.id && 
      (!message.readBy || !message.readBy.includes(currentUser.id))
    );
    
    if (unreadMessages.length === 0) return;
    
    // Use the new batched read receipt system
    markMessagesAsReadBatched(
      selectedChat.id,
      currentUser.id,
      unreadMessages.map(msg => msg.id)
    );
    
  }, [selectedChat, currentUser, messages]);

  // Initialize network service for messaging reliability.
  // Presence lifecycle is owned globally by useOnlinePresence.
  useEffect(() => {
    if (!currentUser) return;

    const initializeNetworkServices = async () => {
      try {
        await networkService.initialize();
      } catch (error) {
        console.error('[MessagingPage] Error initializing network service:', error);
      }
    };
    
    initializeNetworkServices();
  }, [currentUser]);

  // (Optional immediate UI sync via event bus removed; rely on Firestore real-time listener above)
  // Scroll to bottom when new messages are received
  // Add scroll lock mechanism to prevent multiple scrolls
  const scrollLockRef = useRef(false);
  const lastScrollTimeRef = useRef(0);
  
  const scrollToBottomOfChat = useCallback((force = false) => {
    const now = Date.now();
    const timeSinceLastScroll = now - lastScrollTimeRef.current;
    
    // Prevent rapid successive scrolls (debounce)
    if (!force && timeSinceLastScroll < 100) {
      return;
    }
    
    // Prevent scroll if already scrolling
    if (scrollLockRef.current && !force) {
      return;
    }
    
    scrollLockRef.current = true;
    lastScrollTimeRef.current = now;
    
    if (isMobileView) {
      // Use scrollIntoView for mobile view
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
    } else {
      // For desktop, scroll the container element instead of the whole page
      const chatContainer = document.querySelector('.messages-container');
      if (chatContainer) {
        chatContainer.scrollTop = chatContainer.scrollHeight;
      }
    }
    
    // Release scroll lock after animation
    setTimeout(() => {
      scrollLockRef.current = false;
    }, 500);
  }, [isMobileView]);

  // Force scroll only when changing chats (initial view)
  useEffect(() => {
    if (selectedChat && messagesEndRef.current) {
      scrollToBottomOfChat(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChat]);

  // Add this near other refs
  const previousMessageCount = useRef<number>(0);

  // Auto-scroll on new messages only if user is already near bottom and not loading older
  useEffect(() => {
    const currentMessageCount = messages.length;
    const messageCountChanged = currentMessageCount !== previousMessageCount.current;

    if (messageCountChanged && currentMessageCount > 0) {
      if (!isLoadingOlder && isNearBottomRef.current) {
        instantScrollToBottom();
      }
    }

    previousMessageCount.current = currentMessageCount;
  }, [messages.length, isLoadingOlder]);

  // Keep chat list's lastMessage preview & ordering in sync with the currently open conversation
  useEffect(() => {
    if (!selectedChat) return;
    if (!messages || messages.length === 0) return;

    // Find the latest visible (non system deletion-for-everyone) message
    let latest: IMessage | null = null;
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (!(m as any).deletedForEveryone) { // skip globally deleted
        latest = m;
        break;
      }
    }
    if (!latest) return; // nothing to show

    // Capture in local constant to help TS understand non-null inside updater
    const latestMessage = latest;
    setChats(prev => {
      let changed = false;
      const updated = prev.map(c => {
        if (c.id !== selectedChat.id) return c;
        const existingId = (c.lastMessage as any)?.id || (c.lastMessage as any)?.messageId;
        const existingContent = (c.lastMessage as any)?.content;
  const existingCreated = (c.lastMessage as any)?.createdAt instanceof Timestamp ? (c.lastMessage as any).createdAt.toMillis() : 0;
  const latestCreated = latestMessage?.createdAt instanceof Timestamp ? latestMessage.createdAt.toMillis() : 0;
        if (existingId !== latestMessage!.id || existingContent !== latestMessage!.content || existingCreated !== latestCreated) {
          changed = true;
          return { ...c, lastMessage: latestMessage! } as ChatWithDetails;
        }
        return c;
      });
      if (!changed) return prev; // no modifications required
      // Re-sort chats locally so the active chat moves if its last message timestamp changed
      const resorted = [...updated].sort((a, b) => {
  const aTime = (a.lastMessage as any)?.createdAt instanceof Timestamp ? (a.lastMessage as any).createdAt.toMillis() : (a.updatedAt instanceof Timestamp ? a.updatedAt.toMillis() : 0);
  const bTime = (b.lastMessage as any)?.createdAt instanceof Timestamp ? (b.lastMessage as any).createdAt.toMillis() : (b.updatedAt instanceof Timestamp ? b.updatedAt.toMillis() : 0);
        return bTime - aTime;
      });
      return resorted;
    });
  }, [messages, selectedChat]);
  // Log call state changes for debugging
  // Render a connection status indicator when offline - modified to be less prominent
  const ConnectionStatusIndicator = useMemo(() => {
    if (firebaseConnected) return null;
    
    return (
      <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 bg-red-600 text-white px-4 py-2 rounded-full shadow-lg z-50 flex items-center">
        <span className="w-2 h-2 bg-white rounded-full mr-2 animate-pulse"></span>
        <span>Connection issue detected</span>
        <button 
          onClick={() => setFirebaseConnected(true)} 
          className="ml-2 bg-white/20 hover:bg-white/30 rounded-full p-1"
          title="Dismiss"
        >
          <span className="material-icons text-sm">close</span>
        </button>
      </div>
    );
  }, [firebaseConnected]);

  // --- Toast Component ---
  {toast && (
    <div className={`fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50 px-6 py-3 rounded-lg shadow-lg ${toast.type === 'error' ? 'bg-red-600 text-white' : 'bg-green-600 text-white'}`}
      role="alert" aria-live="assertive">
      {toast.message}
    </div>
  )}

  // --- Message Status Helper for Sent/Delivered/Seen ---
  const getMessageStatus = (message: IMessage) => {
    if (message.senderId !== currentUser?.id) return null;
    if (message.readBy && message.readBy.includes(currentUser.id) && message.readBy.length > 1) return 'Seen';
    if (message.status === 'delivered') return 'Delivered';
    if (message.status === 'sent') return 'Sent';
    return null;
  };

  // Format timestamp for display
  const formatMessageTime = (timestamp: any) => {
    try {
      if (!timestamp) return '';

      // Normalize different timestamp shapes to a JS Date
      let date: Date;
      if (timestamp && typeof timestamp.toDate === 'function') {
        // Firestore Timestamp from firebase/firestore
        date = timestamp.toDate();
      } else if (timestamp && typeof timestamp.toMillis === 'function') {
        // Some Timestamp-like objects expose toMillis()
        date = new Date(timestamp.toMillis());
      } else if (typeof timestamp === 'number') {
        // Milliseconds since epoch
        date = new Date(timestamp);
      } else if (timestamp instanceof Date) {
        date = timestamp;
      } else if (timestamp && typeof timestamp.seconds === 'number') {
        // Firestore proto-like object { seconds, nanoseconds }
        const secs = Number(timestamp.seconds || 0);
        const nanos = Number(timestamp.nanoseconds || 0);
        date = new Date(secs * 1000 + Math.floor(nanos / 1e6));
      } else {
        // Fallback: try coercion
        date = new Date(timestamp);
      }

      if (isNaN(date.getTime())) return '';

      const now = new Date();

      // Calculate time difference in seconds
      const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

      // If less than 60 seconds ago, show "just now"
      if (diffInSeconds < 60) {
        return 'just now';
      }

      // Get the relative time format from date-fns
      const formattedTime = formatDistanceToNow(date, { addSuffix: true });

      // Replace longer time units with shorter abbreviations
      return formattedTime
        .replace('about ', '')
        .replace('less than ', '<')
        .replace('minutes', 'min')
        .replace('minute', 'min')
        .replace('hours', 'hr')
        .replace('hour', 'hr')
        .replace('seconds', 'sec')
        .replace('second', 'sec')
        .replace('days', 'd')
        .replace('day', 'd')
        .replace('months', 'mo')
        .replace('month', 'mo')
        .replace('years', 'yr')
        .replace('year', 'yr');
    } catch (error) {
      console.error('Error formatting time:', error, 'timestamp=', timestamp);
      return '';
    }
  };

  // Start a new chat with a selected user
  const startNewChat = async (user: User): Promise<void> => {
    if (!currentUser) return;
    if (!canStartDirectChat(currentUser as any, user as any)) {
      showToast('error', 'Messaging this account is restricted.');
      return;
    }
    
    try {
      // Use ensureDirectChat to guarantee only one direct conversation per pair
    const newChat = await ensureDirectChat(currentUser.id, user.id);
    const hydratedChat = {
      ...(newChat as ChatWithDetails),
      isGroupChat: false,
      otherUser: user,
      lastMessage: (newChat as ChatWithDetails).lastMessage ?? null
    } as ChatWithDetails;
    setSelectedChat(hydratedChat);
    FriendUID.friendUID = user.id || '';
    FriendUID.friendName = user.name || '';
    setChatSearchTerm('');
    if (isMobileView) setShowChatList(false);
    } catch (error) {
      console.error('Error starting new chat:', error);
      showToast('error', 'Failed to start chat. Please try again.');
    }
  };

  const handleUserSearchSelect = useCallback(async (user: User) => {
    if (!user || !user.id) return;
    const existingChat = directChatByUserId.get(user.id);
    if (existingChat) {
      setSelectedChat(existingChat);
      FriendUID.friendUID = user.id;
      FriendUID.friendName = user.name || '';
      setChatSearchTerm('');
      if (isMobileView) setShowChatList(false);
      return;
    }
    await startNewChat(user);
  }, [directChatByUserId, isMobileView, startNewChat]);

  // Add new state for mobile action sheet
  const [showActionSheet, setShowActionSheet] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<IMessage | null>(null);
  const [pinnedMessages, setPinnedMessages] = useState<Record<string, PinnedMessage>>({});
  // Media & Files panel state
  // Controls the visibility of the Media & Files slide-in sidebar (replaces old modal)
  const [showMediaFiles, setShowMediaFiles] = useState(false);
  
  // Add touch tracking ref
  const touchStartXRef = useRef<number | null>(0);
  
  // Function to show mobile action sheet
  const showMobileActionSheet = (message: IMessage) => {
    setSelectedMessage(message);
    setShowActionSheet(true);
  };

  // Enhanced message actions handler to handle all actions including new delete options
  const handleMessageAction = async (action: MessageAction, message: IMessage) => {
    switch (action) {
      case 'reply':
        setReplyToMessage(message);
        messageInputRef.current?.focus();
        break;
        
      case 'edit':
        if (message.senderId === currentUser?.id) {
          setEditingMessage(message);
          setMessageText(message.content);
          messageInputRef.current?.focus();
        }
        break;
        
      case 'delete':
        // Open delete dialog with options instead of immediate delete
        if (message.senderId === currentUser?.id) {
          setMessageToDelete(message);
          setShowDeleteDialog(true);
        }
        break;
        
      case 'delete-for-me':
        handleDeleteMessage(message, 'delete-for-me');
        break;
        
      case 'delete-for-everyone':
        handleDeleteMessage(message, 'delete-for-everyone');
        break;
        
      case 'pin':
      case 'unpin':
        try {
          const isCurrentlyPinned = message.isPinned;
          const updatedMessage: IMessage = {
            ...message,
            isPinned: !isCurrentlyPinned,
            pinnedDetails: !isCurrentlyPinned ? {
              messageId: message.id,
              pinnedAt: Timestamp.now(),
              pinnedBy: currentUser?.id || ''
            } : undefined
          };
          
          // Update message in Firestore
          await updateDoc(doc(db, MESSAGES_COLLECTION, message.id), {
            isPinned: !isCurrentlyPinned,
            pinnedDetails: !isCurrentlyPinned ? {
              messageId: message.id,
              pinnedAt: Timestamp.now(),
              pinnedBy: currentUser?.id
            } : null
          });
          
          // Update local state
          setMessages(prev => 
            prev.map(msg => msg.id === message.id ? updatedMessage : msg)
          );
          
          showToast('success', isCurrentlyPinned ? 'Message unpinned' : 'Message pinned');
        } catch (error) {
          console.error('Error pinning/unpinning message:', error);
          showToast('error', 'Failed to pin/unpin message');
        }
        break;      case 'copy':
        try {
          navigator.clipboard.writeText(message.content);
          showToast('success', 'Message copied to clipboard');
        } catch (error) {
          console.error('Error copying message:', error);
          showToast('error', 'Failed to copy message');
        }
        break;
          case 'forward':
        // Show the forward message dialog with the selected message
        setMessageToForward(message);
        setShowForwardDialog(true);
        break;
    }
    
    // Close action sheet after handling action
    setShowActionSheet(false);
  };

  // Handle message deletion (for me or for everyone)
  const handleDeleteMessage = async (message: IMessage, deleteAction: 'delete-for-me' | 'delete-for-everyone') => {
    if (!currentUser) return;
    
    try {
      if (deleteAction === 'delete-for-everyone') {
        // Update the message in Firestore to mark it as deleted for everyone
        const messageRef = doc(db, MESSAGES_COLLECTION, message.id);
        await updateDoc(messageRef, {
          content: "This message was deleted",
          deletedForEveryone: true
        });
        
        // Update local state to show deletion
        setMessages(prev => prev.map(msg => 
          msg.id === message.id 
            ? { ...msg, content: "This message was deleted", deletedForEveryone: true } 
            : msg
        ));
        
        showToast('success', 'Message deleted for everyone');
      } else {
        // Delete for me - hide from current user only
        await hideMessageForUser(message.id, currentUser.id);
        
        // Remove from local state
        setMessages(prev => prev.filter(msg => msg.id !== message.id));
        
        showToast('success', 'Message deleted for you');
      }
      
      // Close delete dialog if open
      setShowDeleteDialog(false);
      setMessageToDelete(null);
    } catch (error) {
      console.error('Error deleting message:', error);
      showToast('error', 'Failed to delete message');
    }
  };

  // Add touch state
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
    // Context menu handlers
  const handleCloseContextMenu = () => {
    setContextMenu(null);
  };
  // Chat Context Menu handlers
  const handleChatRightClick = (e: React.MouseEvent, chat: ChatWithDetails, customPosition?: { x: number; y: number }) => {
    e.preventDefault();
    const position = customPosition || { x: e.clientX, y: e.clientY };
    setChatContextMenu({
      position,
      chat
    });
  };  const handleCloseChatContextMenu = () => {
    setChatContextMenu(null);
  };  
    // Chat Action Sheet handlers (mobile)
  const showChatActionSheet = useCallback((chat: ChatWithDetails) => {
    const timestamp = Date.now();
    console.log('🎬 FUNCTION showChatActionSheet CALLED with chat:', chat?.id, 'at', timestamp);
    
    if (!chat) {
      console.error('❌ showChatActionSheet called with null chat');
      return;
    }
    
    // Create a deep copy of the chat object to eliminate any potential reference issues
    const chatCopy = JSON.parse(JSON.stringify(chat));
      // Create an action sheet object with the chat copy
    const newActionSheet = { chat: chatCopy };
    
    // Use a direct state update to avoid stale closures
    setChatActionSheet(newActionSheet);
  }, [setChatActionSheet]); // Include dependencies
  const handleCloseChatActionSheet = useCallback(() => {
    setChatActionSheet(null);
  }, [setChatActionSheet]);
  const handleArchiveChat = async (chat: ChatWithDetails) => {
    if (!currentUser) return;
    
    try {
      // Check if chat is already archived for this user
      const isArchived = chat.archived?.[currentUser.id] === true;
      
      if (isArchived) {
        // Unarchive the chat
        await unarchiveChat(chat.id, currentUser.id);
        showToast('success', 'Chat unarchived');
      } else {
        // Archive the chat
        await archiveChat(chat.id, currentUser.id);
        showToast('success', 'Chat archived');
        
        // If we're currently viewing archived chats, keep the chat in the list
        // Otherwise, if we're archiving the selected chat, clear selection
        if (!showArchived && selectedChat?.id === chat.id) {
          setSelectedChat(null);
        }
      }
    } catch (error) {
      console.error('Error archiving/unarchiving chat:', error);
      showToast('error', 'Failed to update chat archive status');
    }
  };
  const handleDeleteChat = async (chat: ChatWithDetails) => {
    if (!currentUser) return;
    try {
      // Immediately remove from local state to prevent UI flicker
      setChats(prevChats => prevChats.filter(c => c.id !== chat.id));
      setSelectedChat(null);
      
      if (chat.isGroupChat) {
        await deleteGroupChat(chat.id, currentUser.id);
      } else {
        await deleteOneToOneChat(chat.id, currentUser.id);
      }
      
      // Add a small delay to ensure Firebase operations complete
      await new Promise(resolve => setTimeout(resolve, 100));
      
      showToast('success', 'Chat deleted');
    } catch (error) {
      console.error('Error deleting chat:', error);
      showToast('error', 'Failed to delete chat');
      
      // If deletion failed, restore the chat in the list
      setChats(prevChats => {
        const chatExists = prevChats.find(c => c.id === chat.id);
        if (!chatExists) {
          return [...prevChats, chat];
        }
        return prevChats;
      });
    }
  };

  const handleShowDeleteChatDialog = (chat: ChatWithDetails) => {
    setSelectedChat(chat);
    setShowDeleteChatDialog(true);
  };
  const handleBlockUser = async (chat: ChatWithDetails) => {
    if (!currentUser || !chat || chat.isGroupChat) return;
    
  // Fallback to participants to reliably resolve the other participant
  const otherUserId = chat.otherUser?.id || chat.participants?.find(id => id !== currentUser.id);
    if (!otherUserId) return;
    
    try {
      setBlockingStatus(prev => ({ ...prev, isLoading: true }));
      
      if (blockingStatus.isBlocked) {
        // Unblock the user
        await unblockUser(currentUser.id, otherUserId);
        setBlockingStatus({
          isBlocked: false,
          isBlockedBy: false,
          isLoading: false
        });
        showToast('success', 'User unblocked');
      } else {
        // Block the user
        await blockUser(currentUser.id, otherUserId);
        setBlockingStatus({
          isBlocked: true,
          isBlockedBy: false,
          isLoading: false
        });
        showToast('success', 'User blocked');
      }
    } catch (error) {
      console.error('Error blocking/unblocking user:', error);
      setBlockingStatus(prev => ({ ...prev, isLoading: false }));
      showToast('error', 'Failed to update block status');
    }
  };

  // Get the most recent pinned message
  const mostRecentPinnedMessage = useMemo(() => {
    return messages.find(msg => msg.isPinned) || null;
  }, [messages]);

  // Track pinned messages that have been dismissed
  const [dismissedPinnedMessageIds, setDismissedPinnedMessageIds] = useState<Set<string>>(new Set());

  // Handle dismissing the pinned message banner
  const handleDismissPinnedMessage = () => {
    if (mostRecentPinnedMessage) {
      setDismissedPinnedMessageIds(prev => {
        const updated = new Set(prev);
        updated.add(mostRecentPinnedMessage.id);
        return updated;
      });
    }
  };

  // Get the visible pinned message (if not dismissed)
  const visiblePinnedMessage = useMemo(() => {
    if (mostRecentPinnedMessage && !dismissedPinnedMessageIds.has(mostRecentPinnedMessage.id)) {
      return mostRecentPinnedMessage;
    }
    return null;
  }, [mostRecentPinnedMessage, dismissedPinnedMessageIds]);

  // Handle viewing the pinned message
  const handleViewPinnedMessage = (messageId: string) => {
    const messageElement = document.getElementById(`message-${messageId}`);
    if (messageElement) {
      messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const handleGroupMembersChanged = (updatedChat: ChatWithDetails) => {
    setSelectedChat(prev => prev && prev.id === updatedChat.id ? { ...prev, ...updatedChat } : prev);
  };

  // Handle adding a new member to the group chat
  const handleAddMember = async (memberId: string) => {
    if (!currentUser || !selectedChat) return;

    try {
      // Attempt to add the member to the group
      await addGroupMember(selectedChat.id, currentUser.id, memberId);

      // Update the chat in state to include the new member
      const updatedParticipants = [...selectedChat.participants, memberId];
      const updatedChat = { 
        ...selectedChat, 
        participants: updatedParticipants 
      };

      // Trigger real-time update for group members
      handleGroupMembersChanged(updatedChat);

      // Get the added user's profile to display their name
      try {
        const addedUser = await getUserProfile(memberId);
        if (addedUser) {
          // Send a system message to notify all chat members about the new addition
          // Use the current user's ID as sender but mark it as a system message type
          await sendMessage(
            selectedChat.id,
            currentUser.id, // Use current user ID instead of 'system' for permissions
            `${addedUser.name} was added to the group.`,
            'system' // Message type is 'system'
          );
        }
      } catch (err) {
        console.error('Error creating system message:', err);
        // Continue with the flow even if system message fails
      }

      // Show success message
      showToast('success', 'Member added successfully');

      // Close the Add Member modal
      setShowAddMemberModal(false);
    } catch (error: any) {
      console.error('Error adding member:', error);

      // Provide specific error messages based on the error
      if (error.message.includes('Group is full')) {
        showToast('error', 'The group has reached its member limit.');
      } else if (error.message.includes('User already in group')) {
        showToast('error', 'This user is already a member of the group.');
      } else {
        showToast('error', 'Failed to add member. Please try again.');
      }
    }
  };

  // State for dynamic viewport height and keyboard detection
  const [viewportHeight, setViewportHeight] = useState(window.innerHeight);
  const [safeAreaTop, setSafeAreaTop] = useState(0);
  const [safeAreaBottom, setSafeAreaBottom] = useState(0);
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const initialWindowHeight = useRef(window.innerHeight);

  // Mobile viewport and keyboard handling effect
  useEffect(() => {
    if (!isMobileView) return;

    // Simplified keyboard detection using visual viewport
    const handleVisualViewportChange = () => {
      if (window.visualViewport) {
        const currentHeight = window.visualViewport.height;
        const windowHeight = window.innerHeight;
        
        // If viewport height is significantly smaller than window height, keyboard is likely open
        const keyboardThreshold = windowHeight * 0.75;
        const keyboardIsLikelyOpen = currentHeight < keyboardThreshold;
        
        setIsKeyboardOpen(keyboardIsLikelyOpen);
        
        if (keyboardIsLikelyOpen) {
          document.body.classList.add('keyboard-open');
        } else {
          document.body.classList.remove('keyboard-open');
        }
        
        // Update the viewport height CSS variable
        document.documentElement.style.setProperty('--vh', `${currentHeight * 0.01}`);
      }
    };

    // Handle resize events
    const handleResize = () => {
      setViewportHeight(window.innerHeight);
    };

    // Handle orientation changes
    const handleOrientationChange = () => {
      setTimeout(() => {
        setViewportHeight(window.innerHeight);
        initialWindowHeight.current = window.innerHeight;
      }, 300);
    };

    // Event listeners
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleOrientationChange);
    
    // Add visual viewport listener if available
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleVisualViewportChange);
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleOrientationChange);
      
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleVisualViewportChange);
      }
    };
  }, [isMobileView]);

      // Simplified body class management for mobile
  useEffect(() => {
    if (isMobileView) {
      document.body.classList.add('messaging-page');
      } else {
      document.body.classList.remove('messaging-page', 'keyboard-open');
    }

    return () => {
      document.body.classList.remove('messaging-page', 'keyboard-open');
    };
  }, [isMobileView]);

  // Return the main messaging UI
  return (
    <MainLayout>
  <div className={`h-[calc(var(--vh,1vh)*100)] md:h-[calc(100vh-64px)] w-full flex bg-[#000] overflow-hidden transition-[padding] duration-300 ease-out ${showMediaFiles ? 'md:pr-[420px]' : ''}`}>
        {/* Sidebar - Enhanced with gradient background and improved visual hierarchy */}
  <div className={`hidden md:flex relative flex-col w-[320px] min-w-[280px] max-w-[340px] bg-gradient-to-b from-[#0a0a0a] via-[#0f0f0f] to-[#0a0a0a] border-r border-gray-900/60 transition-all duration-300 backdrop-blur-sm ${showChatList ? '' : 'md:hidden'}`}>
          {/* Enhanced Chat list header with subtle gradient */}
          <div className="p-4 flex justify-between items-center bg-gradient-to-r from-[#0a0a0a] via-[#111111] to-[#0a0a0a] sticky top-0 z-10 border-b border-gray-800/30 shadow-lg shadow-black/20">
            <div className="flex items-center space-x-3">
              <div className="relative">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-green-600 to-emerald-500 flex items-center justify-center shadow-lg shadow-green-900/30">
                  <span className="material-icons text-white text-lg">chat</span>
                </div>
                <div className="absolute -inset-1 rounded-xl bg-gradient-to-br from-green-500/20 to-emerald-500/20 blur-sm opacity-75"></div>
              </div>
              <h2 className="text-lg font-bold text-white tracking-wide">
                {showArchived ? 'Archived' : 'Messages'}
              </h2>
            </div>
            <div className="flex items-center gap-2 relative">
              {/* More options (desktop sidebar header) */}
              <button
                className="group relative h-9 w-9 rounded-xl bg-gradient-to-br from-[#141414] via-[#1b1b1b] to-[#141414] text-white flex items-center justify-center transition-all duration-300 border border-gray-800/60 hover:border-emerald-500/40 shadow-lg shadow-black/40 hover:shadow-emerald-900/30 hover:scale-105 focus:outline-none focus:ring-2 focus:ring-emerald-500/25"
                onClick={() => setShowHeaderMenu(v => !v)}
                aria-label="More options"
              >
                <span className="material-icons text-lg transition-all duration-300 text-gray-300 group-hover:text-emerald-300 group-hover:scale-110">more_vert</span>
                <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-emerald-500/10 to-emerald-400/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                {pendingRequestCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-emerald-500 text-[10px] font-semibold text-white flex items-center justify-center shadow-md border border-emerald-300/80">
                    {pendingRequestCount > 99 ? '99+' : pendingRequestCount}
                  </span>
                )}
              </button>
              {showHeaderMenu && (
                <div ref={headerMenuRef} className="absolute right-0 top-12 z-[9999] min-w-[230px] py-2 animate-fadeIn overflow-hidden rounded-xl border border-gray-800/70 bg-gradient-to-b from-[#101010] via-[#171717] to-[#0f0f0f] shadow-[0_20px_50px_-12px_rgba(0,0,0,0.8)] backdrop-blur-md divide-y divide-gray-800/60">
                  <button
                    className="w-full flex items-center gap-2 text-left px-4 py-2 bg-transparent hover:bg-emerald-500/10 active:bg-emerald-500/15 text-white transition-all duration-150 rounded-md focus:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500/30"
                    onClick={() => {
                      setShowHeaderMenu(false);
                      setShowArchived(prev => {
                        const next = !prev;
                        setChats(next ? archivedChats : activeChats);
                        return next;
                      });
                    }}
                  >
                    <span className="material-icons text-amber-300 rounded-md p-2 bg-emerald-500/10 ring-1 ring-emerald-500/20 shadow-sm">archive</span>
                    {showArchived ? 'Show Messages' : 'Archived'}
                  </button>
                  <button
                    className="w-full flex items-center gap-2 text-left px-4 py-2 bg-transparent hover:bg-emerald-500/10 active:bg-emerald-500/15 text-white transition-all duration-150 rounded-md focus:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500/30"
                    onClick={() => { setShowHeaderMenu(false); setShowCreateGroupModal(true); }}
                  >
                    <span className="material-icons text-green-300 rounded-md p-2 bg-green-500/10 ring-1 ring-green-500/20 shadow-sm">groups</span>
                    Create Group Chat
                  </button>
                  <button
                    className="w-full flex items-center gap-2 text-left px-4 py-2 bg-transparent hover:bg-emerald-500/10 active:bg-emerald-500/15 text-white transition-all duration-150 rounded-md focus:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500/30"
                    onClick={() => { setShowHeaderMenu(false); setShowRequests(true); }}
                  >
                    <span className="material-icons text-blue-300 rounded-md p-2 bg-blue-500/10 ring-1 ring-blue-500/20 shadow-sm">mail</span>
                    <span className="flex-1">Message Requests</span>
                    {pendingRequestCount > 0 && (
                      <span className="ml-2 inline-flex items-center justify-center min-w-[22px] px-2 h-5 rounded-full bg-emerald-500/20 text-emerald-100 text-xs font-semibold border border-emerald-400/40">
                        {pendingRequestCount > 99 ? '99+' : pendingRequestCount}
                      </span>
                    )}
                  </button>
                  <button
                    className="w-full flex items-center gap-2 text-left px-4 py-2 bg-transparent hover:bg-emerald-500/10 active:bg-emerald-500/15 text-white transition-all duration-150 rounded-md focus:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500/30"
                    onClick={() => { setShowHeaderMenu(false); setShowBlocked(true); }}
                  >
                    <span className="material-icons text-orange-300 rounded-md p-2 bg-orange-500/10 ring-1 ring-orange-500/20 shadow-sm">block</span>
                    Blocked
                  </button>
                  <div className="border-t border-gray-800/40 my-1" />
                  <button
                    className="w-full flex items-center gap-2 text-left px-4 py-2 bg-transparent hover:bg-red-500/10 active:bg-red-500/15 text-red-400 transition-all duration-150 rounded-md focus:outline-none focus-visible:ring-1 focus-visible:ring-red-500/30"
                    onClick={async () => {
                      setShowHeaderMenu(false);
                      try {
                        await AuthService.logout();
                      } finally {
                        safeNavigate('/signin');
                      }
                    }}
                  >
                    <span className="material-icons text-red-400 rounded-md p-2 bg-red-500/10 ring-1 ring-red-500/20 shadow-sm">logout</span>
                    Logout
                  </button>
                </div>
              )}
              {isMobileView && selectedChat && (
                <button
                  className="md:hidden group relative h-9 w-9 rounded-xl bg-gradient-to-br from-[#1a1a1a] to-[#2a2a2a] hover:from-red-600/20 hover:to-red-600/20 text-white flex items-center justify-center transition-all duration-300 border border-gray-800/50 hover:border-red-500/30 shadow-lg hover:shadow-red-900/20 hover:scale-105"
                  onClick={() => setShowChatList(false)}
                  aria-label="Close menu"
                >
                  <span className="material-icons text-lg transition-all duration-300 group-hover:text-red-300 group-hover:scale-110">close</span>
                  <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-red-500/10 to-red-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                </button>
              )}
            </div>
          </div>
          
          {/* Enhanced Search bar with modern styling */}
          <div className="px-4 py-3 border-b border-gray-800/30">
            <div className="relative group">
              <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 group-focus-within:text-green-400 transition-colors duration-300">
                <span className="material-icons text-base">search</span>
              </div>
              <input 
                type="text" 
                placeholder="Search conversations..."
                value={chatSearchTerm}
                onChange={(e) => setChatSearchTerm(e.target.value)}
                className="w-full bg-gradient-to-r from-[#1a1a1a] to-[#1e1e1e] text-white placeholder-gray-400 rounded-xl py-3 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:bg-[#222] transition-all duration-300 border border-gray-700/40 focus:border-green-500/50 shadow-inner backdrop-blur-sm hover:bg-[#1e1e1e] hover:border-gray-600/50"
              />
              <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-green-500/5 to-emerald-500/5 opacity-0 group-focus-within:opacity-100 transition-opacity duration-200 pointer-events-none"></div>
            </div>
            {/* Chat type filters */}
            <div className="mt-3 mb-0 px-3 w-full" role="tablist" aria-label="Chat filters">
              <div className="w-full grid grid-cols-3 gap-2">
                {[
                  { key: 'all', label: 'All' },
                  { key: 'private', label: 'Private' },
                  { key: 'groups', label: 'Groups' }
                ].map(({ key, label }) => (
                  <button
                    key={key}
                    role="tab"
                    aria-selected={chatFilter === (key as 'all'|'private'|'groups')}
                    onClick={() => setChatFilter(key as 'all'|'private'|'groups')}
                    className={`inline-flex items-center justify-center w-full h-7 sm:h-8 px-2.5 rounded-full text-xs font-medium tracking-wide whitespace-nowrap transition-colors border focus:outline-none ${
                      chatFilter === (key as any)
                        ? 'bg-green-600/25 text-green-100 border-green-500/40'
                        : 'bg-transparent text-gray-300 border-transparent hover:text-white hover:border-gray-600 hover:bg-white/5'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          
          {/* Enhanced Chat list with improved scrollbar and spacing */}
          <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-900/20 hover:scrollbar-thumb-gray-500 transition-colors duration-300 mobile-scrollbar-hide chat-list-no-select">
            {isLoading || !emptyDelayPassed ? (
              <div className="flex items-center justify-center h-48">
                <Spinner label="Loading chats..." />
              </div>
            ) : isSortingChats ? (
              <ChatListSkeleton rows={8} />
            ) : shouldShowEmptyState ? (
              hasChatSearch ? (
                <div className="text-center py-12 px-4">
                  <div className="relative mb-6">
                    <div className="bg-gradient-to-br from-[#2a2a2a] to-[#3a3b3c] rounded-2xl w-16 h-16 mx-auto flex items-center justify-center shadow-xl border border-gray-700/30">
                      <span className="material-icons text-gray-400 text-3xl">search</span>
                    </div>
                    <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-green-500/10 to-emerald-500/10 blur-xl opacity-50"></div>
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-3 tracking-wide">No matches found</h3>
                  <p className="text-gray-400 text-sm text-center max-w-xs mx-auto leading-relaxed">
                    Try searching with a different name, email, or ID.
                  </p>
                </div>
              ) : (
                <div className="text-center py-12 px-4">
                  <div className="relative mb-6">
                    <div className="bg-gradient-to-br from-[#2a2a2a] to-[#3a3b3c] rounded-2xl w-16 h-16 mx-auto flex items-center justify-center shadow-xl border border-gray-700/30">
                      <span className="material-icons text-gray-400 text-3xl">forum</span>
                    </div>
                    <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-green-500/10 to-emerald-500/10 blur-xl opacity-50"></div>
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-3 tracking-wide">No conversations yet</h3>
                  <p className="text-gray-400 text-sm text-center max-w-xs mx-auto leading-relaxed">
                    Use the search bar above to find someone and start a conversation.
                  </p>
                </div>
              )
            ) : (
              <div className="py-2 px-1 space-y-1">
                {visibleChats.map(chat => (
                  <ChatListItem 
                    key={chat.id} 
                    chat={chat} 
                    currentUser={currentUser} 
                    incomingCallCallerUid={incomingCallCallerUid}
                    selectedChat={selectedChat} 
                    setSelectedChat={setSelectedChat} 
                    formatMessageTime={formatMessageTime}
                    onRightClick={handleChatRightClick}
                    showChatActionSheet={showChatActionSheet}
                    isMobileView={isMobileView}
                    setShowChatList={setShowChatList}
                  />
                ))}
                {hasChatSearch && userSearchMatches.length > 0 && (
                  <div className="mt-4 space-y-1 px-2">
                    <div className="text-[11px] uppercase tracking-[0.2em] text-gray-400/80">People</div>
                    {userSearchMatches.map(user => (
                      <button
                        key={`search-${user.id}`}
                        onClick={() => handleUserSearchSelect(user)}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-xl border border-dashed border-green-600/30 bg-[#151515] hover:bg-[#1d1d1d] transition-all duration-200 text-left group"
                      >
                        <div className="relative">
                          {user.profile_pic ? (
                            <img src={user.profile_pic} alt={user.name} className="w-10 h-10 rounded-full object-cover border border-gray-700/50 group-hover:border-green-500/40 transition-colors" />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-600 to-emerald-500 flex items-center justify-center text-white font-semibold text-sm border border-gray-700/40 group-hover:border-green-500/40 transition-colors">
                              {user.name?.charAt(0) || '?'}
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-white font-medium truncate">{user.name}</span>
                            {directChatByUserId.has(user.id) && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-600/20 text-green-200 border border-green-500/30">Existing chat</span>
                            )}
                          </div>
                          {user.email && (
                            <div className="text-xs text-gray-400 truncate">{user.email}</div>
                          )}
                        </div>
                        <div className="text-xs text-green-300 font-semibold">
                          {directChatByUserId.has(user.id) ? 'Open' : 'Start'}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                <div className="h-4"></div>
              </div>
            )}
          </div>

          {/* Desktop: Message Requests overlay (anchored to chat list) */}
          {!isMobileView && showRequests && (
            <div className="absolute inset-0 z-50">
              <div className="absolute inset-0 flex justify-end">
                <div className="h-full w-full bg-gradient-to-b from-[#0c0c0c] via-[#141414] to-[#0c0c0c] border-r border-gray-800/70 shadow-[0_25px_60px_-12px_rgba(0,0,0,0.9)] backdrop-blur-md transform transition-transform duration-300 ease-out translate-x-0 flex flex-col">
                  {/* Header */}
                  <div className="sticky top-0 z-10 px-4 py-3 border-b border-gray-800/70 flex items-center justify-between bg-gradient-to-r from-emerald-500/5 via-transparent to-transparent shadow-[0_1px_0_0_rgba(16,185,129,0.08)]">
                    <div className="flex items-center gap-2">
                      <span className="material-icons text-blue-300 rounded-md p-2 bg-blue-500/10 ring-1 ring-blue-500/20 shadow-sm">mail</span>
                      <div className="text-sm font-semibold text-gray-300 tracking-wide">Message Requests</div>
                    </div>
                    <button aria-label="Close" className="p-2 rounded-lg hover:bg-white/5 text-gray-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30" onClick={() => setShowRequests(false)}>
                      <span className="material-icons">close</span>
                    </button>
                  </div>
                  {/* Content */}
                  <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent hover:scrollbar-thumb-gray-600 p-2">
                    {requestChats.length === 0 ? (
                      <div className="h-full min-h-[40vh] px-4 py-8 text-center text-gray-400 flex flex-col items-center justify-center">
                        <span className="material-icons text-4xl mb-2">move_to_inbox</span>
                        <div className="font-medium text-white mb-1">No message requests</div>
                        <div className="text-sm text-gray-400">New messages from people you haven't chatted with will appear here.</div>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {requestChats.map(chat => (
                          <ChatListItem
                            key={chat.id}
                            chat={chat}
                            currentUser={currentUser}
                            incomingCallCallerUid={incomingCallCallerUid}
                            selectedChat={selectedChat}
                            setSelectedChat={(c) => {
                              setSelectedChat(c);
                              setShowRequests(false);
                              if (isMobileView) setShowChatList(false);
                            }}
                            formatMessageTime={formatMessageTime}
                            onRightClick={handleChatRightClick}
                            showChatActionSheet={showChatActionSheet}
                            isMobileView={isMobileView}
                            setShowChatList={setShowChatList}
                            onAcceptRequest={(accepted) => {
                              handleChatListAccept(accepted);
                              setShowRequests(false);
                            }}
                            onDeclineRequest={(declined) => {
                              handleChatListDecline(declined);
                              setShowRequests(false);
                            }}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Desktop: Blocked Users overlay (anchored to chat list) */}
          {!isMobileView && showBlocked && (
            <div className="absolute inset-0 z-50">
              <div className="absolute inset-0 flex justify-end">
                <div className="h-full w-full bg-gradient-to-b from-[#0c0c0c] via-[#141414] to-[#0c0c0c] border-r border-gray-800/70 shadow-[0_25px_60px_-12px_rgba(0,0,0,0.9)] backdrop-blur-md transform transition-transform duration-300 ease-out translate-x-0 flex flex-col">
                  {/* Header */}
                  <div className="sticky top-0 z-10 px-4 py-3 border-b border-gray-800/70 flex items-center justify-between bg-gradient-to-r from-emerald-500/5 via-transparent to-transparent shadow-[0_1px_0_0_rgba(16,185,129,0.08)]">
                    <div className="flex items-center gap-2">
                      <span className="material-icons text-orange-300 rounded-md p-2 bg-orange-500/10 ring-1 ring-orange-500/20 shadow-sm">block</span>
                      <div className="text-sm font-semibold text-gray-300 tracking-wide">Blocked Users</div>
                    </div>
                    <button aria-label="Close" className="p-2 rounded-lg hover:bg-white/5 text-gray-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30" onClick={() => setShowBlocked(false)}>
                      <span className="material-icons">close</span>
                    </button>
                  </div>
                  {/* Content */}
                  <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent hover:scrollbar-thumb-gray-600 p-4">
                    <div className="h-full min-h-[40vh] px-2 py-6 text-center text-gray-400 flex flex-col items-center justify-center">
                      <span className="material-icons text-4xl mb-2">block</span>
                      <div className="font-medium text-white mb-1">Blocked users list</div>
                      <div className="text-sm text-gray-400">This is a placeholder overlay. No functions are implemented.</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
        {/* Mobile sidebar overlay */}
  {isMobileView && showChatList && (
          <div className="fixed inset-0 z-40 bg-black/60 md:hidden" onClick={() => setShowChatList(false)} />
        )}
        {isMobileView && showChatList && (
          <div className="fixed inset-0 z-50 bg-[#18191a] flex flex-col w-full min-w-0 max-w-full messaging-mobile-panel">
            {/* Top navigation bar for mobile chat list */}
            <div className="block md:hidden sticky top-0 left-0 w-full bg-[#18191a] z-50 border-b border-gray-800" style={{paddingTop: 0, paddingBottom: 0}}>
              <MobileNavBar />
            </div>
            {/* Everything else inside a scrollable container */}
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden mobile-scrollbar-hide">
              {/* Chat list header */}
              <div className="messaging-mobile-header">
                <div className="flex items-center space-x-3">
                  <div className="relative">
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-green-600 to-emerald-500 flex items-center justify-center shadow-lg shadow-green-900/30">
                      <span className="material-icons text-white text-lg">chat</span>
                    </div>
                    <div className="absolute -inset-1 rounded-xl bg-gradient-to-br from-green-500/20 to-emerald-500/20 blur-sm opacity-75"></div>
                  </div>                  <h3 className="text-lg font-bold text-white tracking-wide">
                    {showArchived ? 'Archived' : 'Messages'}
                  </h3>
                </div>                <div className="flex items-center gap-2 relative">
                  {/* More options (mobile header) */}
                  <button
                    className="group relative h-9 w-9 rounded-xl bg-gradient-to-br from-[#141414] via-[#1b1b1b] to-[#141414] text-white flex items-center justify-center transition-all duration-300 border border-gray-800/60 hover:border-emerald-500/40 shadow-lg shadow-black/40 hover:shadow-emerald-900/30 hover:scale-105"
                    onClick={() => setShowMobileMenu(true)}
                    aria-label="More options"
                  >
                    <span className="material-icons text-lg transition-all duration-300 text-gray-300 group-hover:text-emerald-300 group-hover:scale-110">more_vert</span>
                    <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-emerald-500/10 to-emerald-400/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                    {pendingRequestCount > 0 && (
                      <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-emerald-500 text-[10px] font-semibold text-white flex items-center justify-center shadow-md border border-emerald-300/80">
                        {pendingRequestCount > 99 ? '99+' : pendingRequestCount}
                      </span>
                    )}
                  </button>
                </div>
              </div>
              {/* Mobile right-side sliding drawer for user menu */}
              <div className={`fixed inset-0 z-[1000] md:hidden ${showMobileMenu ? '' : 'pointer-events-none'}`} aria-hidden={!showMobileMenu}>
                {/* Backdrop */}
                <div
                  className={`absolute inset-0 bg-gradient-to-l from-black/60 via-black/50 to-emerald-900/10 backdrop-blur-[2px] transition-opacity duration-300 ${showMobileMenu ? 'opacity-100' : 'opacity-0'}`}
                  onClick={() => setShowMobileMenu(false)}
                />
                {/* Drawer */}
                <div
                  className={`absolute right-0 top-0 h-full w-[80%] max-w-xs bg-gradient-to-b from-[#0c0c0c] via-[#141414] to-[#0c0c0c] border-l border-gray-800/70 shadow-[0_25px_60px_-12px_rgba(0,0,0,0.9)] backdrop-blur-md transform transition-transform duration-300 ease-out ${showMobileMenu ? 'translate-x-0' : 'translate-x-full'} flex flex-col rounded-l-2xl ring-1 ring-emerald-500/10`}
                  role="dialog"
                  aria-modal="true"
                >
                  {/* Drawer header */}
                  <div className="sticky top-0 z-10 px-4 py-3 border-b border-gray-800/70 flex items-center justify-between bg-gradient-to-r from-emerald-500/5 via-transparent to-transparent shadow-[0_1px_0_0_rgba(16,185,129,0.08)]">
                    <div className="text-sm font-semibold text-gray-300 tracking-wide">Menu</div>
                    <button
                      aria-label="Close menu"
                      className="p-2 rounded-lg hover:bg-white/5 text-gray-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30"
                      onClick={() => setShowMobileMenu(false)}
                    >
                      <span className="material-icons">close</span>
                    </button>
                  </div>
                  {/* User info (outside header) */}
                  <div className="px-4 pt-3">
                    <div className="flex items-center gap-3 rounded-xl border border-gray-800/70 bg-[#1c1c1c]/60 backdrop-blur-sm px-3 py-3 shadow-[0_10px_30px_-12px_rgba(0,0,0,0.6)]">
                      <div className="w-12 h-12 rounded-full bg-gray-700/80 flex items-center justify-center overflow-hidden shrink-0 ring-1 ring-emerald-600/15 transition-colors">
                        {currentUser?.profile_pic ? (
                          <img src={currentUser.profile_pic} alt={currentUser?.name || 'User'} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-white text-lg">
                            {(currentUser?.name || currentUser?.email || '?').charAt(0).toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="text-white font-semibold truncate">{currentUser?.name || 'Guest'}</div>
                        {currentUser?.email && (
                          <div className="text-xs text-gray-400 truncate">{currentUser.email}</div>
                        )}
                      </div>
                    </div>
                  </div>
                  {/* Menu options */}
                  <div className="py-2 flex-1 min-h-0 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent hover:scrollbar-thumb-gray-600 divide-y divide-gray-800/60">
                    <button
                      className="group w-full flex items-center gap-3 px-4 py-3 text-left text-white bg-transparent hover:bg-emerald-500/10 active:bg-emerald-500/15 rounded-xl border border-transparent hover:border-emerald-600/20 focus:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500/30 transition-all duration-200"
                      onClick={() => {
                        setShowMobileMenu(false);
                        setShowArchived(prev => {
                          const next = !prev;
                          setChats(next ? archivedChats : activeChats);
                          return next;
                        });
                      }}
                    >
                      <span className="material-icons text-amber-300 rounded-md p-2 bg-emerald-500/10 ring-1 ring-emerald-500/20 shadow-sm">archive</span>
                      <span>{showArchived ? 'Show Messages' : 'Archived'}</span>
                    </button>
                    <button
                      className="group w-full flex items-center gap-3 px-4 py-3 text-left text-white bg-transparent hover:bg-emerald-500/10 active:bg-emerald-500/15 rounded-xl border border-transparent hover:border-emerald-600/20 focus:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500/30 transition-all duration-200"
                      onClick={() => { setShowMobileMenu(false); setShowRequests(true); }}
                    >
                      <span className="material-icons text-blue-300 rounded-md p-2 bg-blue-500/10 ring-1 ring-blue-500/20 shadow-sm">mail</span>
                      <span className="flex-1">Message Requests</span>
                      {pendingRequestCount > 0 && (
                        <span className="ml-2 inline-flex items-center justify-center min-w-[22px] px-2 h-5 rounded-full bg-emerald-500/20 text-emerald-100 text-xs font-semibold border border-emerald-400/40">
                          {pendingRequestCount > 99 ? '99+' : pendingRequestCount}
                        </span>
                      )}
                    </button>
                    <button
                      className="group w-full flex items-center gap-3 px-4 py-3 text-left text-white bg-transparent hover:bg-emerald-500/10 active:bg-emerald-500/15 rounded-xl border border-transparent hover:border-emerald-600/20 focus:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500/30 transition-all duration-200"
                      onClick={() => { setShowMobileMenu(false); setShowCreateGroupModal(true); }}
                    >
                      <span className="material-icons text-green-300 rounded-md p-2 bg-green-500/10 ring-1 ring-green-500/20 shadow-sm">groups</span>
                      <span>Create Group Chat</span>
                    </button>
                    <button
                      className="group w-full flex items-center gap-3 px-4 py-3 text-left text-white bg-transparent hover:bg-emerald-500/10 active:bg-emerald-500/15 rounded-xl border border-transparent hover:border-emerald-600/20 focus:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500/30 transition-all duration-200"
                      onClick={() => { setShowMobileMenu(false); setShowBlocked(true); }}
                    >
                      <span className="material-icons text-orange-300 rounded-md p-2 bg-orange-500/10 ring-1 ring-orange-500/20 shadow-sm">block</span>
                      <span>Blocked</span>
                    </button>
                    <div className="my-2 border-t border-gray-800" />
                    <button
                      className="group w-full flex items-center gap-3 px-4 py-3 text-left text-red-400 bg-transparent hover:bg-red-500/10 active:bg-red-500/15 rounded-xl border border-transparent hover:border-red-600/20 focus:outline-none focus-visible:ring-1 focus-visible:ring-red-500/30 transition-all duration-200"
                      onClick={async () => {
                        setShowMobileMenu(false);
                        try {
                          await AuthService.logout();
                        } finally {
                          safeNavigate('/signin');
                        }
                      }}
                    >
                      <span className="material-icons text-red-400 rounded-md p-2 bg-red-500/10 ring-1 ring-red-500/20 shadow-sm">logout</span>
                      <span>Logout</span>
                    </button>
                  </div>
                  {/* Brand footer */}
                  <div className="px-4 py-6 border-t border-gray-800 flex flex-col items-center justify-center">
                    <img
                      src="/images/bulsu-space-logo.png"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/images/bulsu-space-logo.png'; }}
                      alt="BulSU Space logo"
                      className="h-12 w-auto mb-3 opacity-95 drop-shadow-[0_6px_18px_rgba(16,185,129,0.25)]"
                    />
                    <div className="text-base font-semibold bg-clip-text text-transparent bg-gradient-to-r from-emerald-300 via-green-300 to-emerald-400 tracking-wide">
                      BulSU Space
                    </div>
                    <div className="mt-1 text-[11px] leading-4 text-gray-300/90 text-center max-w-[14rem]">
                      Academic Community Social Platform
                    </div>
                    <div className="mt-3 h-px w-20 bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent rounded-full" />
                  </div>
                </div>
              </div>
              {/* Search bar */}
              <div className="messaging-mobile-search">
                <div className="relative group">
                  <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 group-focus-within:text-green-400 transition-colors duration-300">
                    <span className="material-icons text-base">search</span>
                  </div>
                  <input
                    type="text"
                    placeholder="Search conversations..."
                    value={chatSearchTerm}
                    onChange={(e) => setChatSearchTerm(e.target.value)}
                    className="w-full bg-gradient-to-r from-[#1a1a1a] to-[#1e1e1e] text-white placeholder-gray-400 rounded-xl py-3 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/40 focus:bg-[#222] transition-all duration-300 border border-gray-700/40 focus:border-green-500/50 shadow-inner backdrop-blur-sm hover:bg-[#1e1e1e] hover:border-gray-600/50"
                  />
                  {/* Removed green focus overlay */}
                </div>
              </div>
              {/* Chat type filters (mobile) - moved outside search container for visual separation */}
              <div className="px-2 mt-0 mb-0 w-full" role="tablist" aria-label="Chat filters">
                <div className="w-full grid grid-cols-3 gap-2">
                  {[
                    { key: 'all', label: 'All' },
                    { key: 'private', label: 'Private' },
                    { key: 'groups', label: 'Groups' }
                  ].map(({ key, label }) => (
                    <button
                      key={key}
                      role="tab"
                      aria-selected={chatFilter === (key as 'all'|'private'|'groups')}
                      onClick={() => setChatFilter(key as 'all'|'private'|'groups')}
                      className={`inline-flex items-center justify-center w-full h-4 sm:h-8 px-1.5 rounded-full text-[11px] leading-none font-medium tracking-wide whitespace-nowrap transition-colors border focus:outline-none ${
                        chatFilter === (key as any)
                          ? 'bg-green-600/25 text-green-100 border-green-500/40'
                          : 'bg-transparent text-gray-300 border-transparent hover:text-white hover:border-gray-600 hover:bg-white/5'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {/* User carousel removed on mobile view */}
              {/* Chat list */}
              <div className="flex-1 min-h-0 overflow-y-auto messaging-mobile-list mobile-scrollbar-hide chat-list-no-select">
                {isLoading || !emptyDelayPassed ? (
                  <div className="flex items-center justify-center h-48">
                    <Spinner label="Loading chats..." />
                  </div>
                ) : isSortingChats ? (
                  <ChatListSkeleton rows={8} />
                ) : shouldShowEmptyState ? (
                  hasChatSearch ? (
                    <div className="flex flex-col items-center justify-center h-full min-h-[40vh] text-center py-10 px-4">
                      <div className="relative mb-4">
                        <div className="bg-gradient-to-br from-[#2a2a2a] to-[#3a3b3c] rounded-2xl w-14 h-14 mx-auto flex items-center justify-center shadow-xl border border-gray-700/30">
                          <span className="material-icons text-gray-400 text-2xl">search_off</span>
                        </div>
                        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-green-500/10 to-emerald-500/10 blur-xl opacity-50"></div>
                      </div>
                      <h3 className="text-base font-semibold text-white mb-2 tracking-wide">No matches found</h3>
                      <p className="text-gray-400 text-xs text-center max-w-xs mx-auto leading-relaxed">
                        Try a different search keyword to find conversations or users.
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full min-h-[60vh] text-center py-10 px-4">
                      <div className="relative mb-6">
                        <div className="bg-gradient-to-br from-[#2a2a2a] to-[#3a3b3c] rounded-2xl w-16 h-16 mx-auto flex items-center justify-center shadow-xl border border-gray-700/30">
                          <span className="material-icons text-gray-400 text-3xl">forum</span>
                        </div>
                        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-green-500/10 to-emerald-500/10 blur-xl opacity-50"></div>
                      </div>
                      <h3 className="text-lg font-semibold text-white mb-3 tracking-wide">No conversations yet</h3>
                      <p className="text-gray-400 text-sm text-center max-w-xs mx-auto leading-relaxed">
                        Use the search field above to find someone and start chatting.
                      </p>
                    </div>
                  )
                ) : (
                  <div className="py-2 px-1 space-y-1">
                    {visibleChats.map(chat => {

                      const unreadCount = chat.unreadCount?.[currentUser?.id || ''] ?? 0;
                      const isSelected = selectedChat?.id === chat.id;
                      // Get other user ID with fallback like desktop version
                      const otherUserId = chat.otherUser?.id || (chat.participants?.find(id => id !== currentUser?.id));
                        // Create touch handler with closure to capture chat
                      const handleChatTouchStart = (e: React.TouchEvent) => {
                        e.stopPropagation();
                        
                        if (e.touches.length !== 1) return;
                        
                        const touch = e.touches[0];
                        const startPos = { x: touch.clientX, y: touch.clientY };
                        let longPressTriggered = false;
                        const tolerance = 15;
                        
                        const timeout = setTimeout(() => {
                          longPressTriggered = true;
                          if (showChatActionSheet) {
                            showChatActionSheet(chat);
                          }
                        }, 700);
                        
                        const cleanup = () => {
                          clearTimeout(timeout);
                          document.removeEventListener('touchmove', handleMove);
                          document.removeEventListener('touchend', handleEnd);
                        };
                        
                        const handleMove = (moveEvent: TouchEvent) => {
                          const moveTouch = moveEvent.touches[0];
                          if (!moveTouch) return;
                          
                          const moveX = Math.abs(moveTouch.clientX - startPos.x);
                          const moveY = Math.abs(moveTouch.clientY - startPos.y);
                          
                          if (moveX > tolerance || moveY > tolerance) {
                            cleanup();
                          }
                        };
                        
                        const handleEnd = (endEvent: TouchEvent) => {
                          cleanup();
                          if (longPressTriggered) {
                            endEvent.preventDefault();
                            endEvent.stopPropagation();
                          }
                        };
                        
                        document.addEventListener('touchmove', handleMove);
                        document.addEventListener('touchend', handleEnd);
                      };
                      
                      return (
                        <div 
                          key={chat.id} 
                          className={`messaging-mobile-list-item group relative flex items-center cursor-pointer transition-all duration-300 ${
                            isSelected ? 'selected' : ''
                          }`}
                          onClick={() => {
                            setSelectedChat(chat);
                            FriendUID.friendUID = otherUserId ?? ''
                            if (isMobileView) setShowChatList(false);
                          }}
                          onTouchStart={handleChatTouchStart}
                        >
                          {/* Enhanced Avatar with modern styling - updated to circular design with border */}
                          <div className="avatar relative flex-shrink-0 mr-3">
                            {chat.isGroupChat ? (
                              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-500 via-green-500 to-teal-600 flex items-center justify-center text-white shadow-lg transition-all duration-300 border-2 border-gray-800/40">
                                <span className="material-icons text-xl">groups</span>
                              </div>
                            ) : chat.otherUser?.profile_pic ? (
                              <div className="relative">
                                <img
                                  src={chat.otherUser.profile_pic}
                                  alt={chat.otherUser.name}
                                  className="w-12 h-12 object-cover rounded-full shadow-lg transition-all duration-300"
                                />
                                <div className="absolute inset-0 rounded-full border-2 border-gray-800/40 hover:border-green-500/40"></div>
                                {/* Presence status dot for mobile */}
                                {!chat.isGroupChat && otherUserId && (
                                  <div className="absolute bottom-0 right-0 z-20 translate-x-0.5 translate-y-0.5">
                                    <PresenceStatusIndicator userId={otherUserId} size="xs" />
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="relative">
                                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-600 via-purple-500 to-pink-600 flex items-center justify-center text-white font-bold text-lg shadow-lg transition-all duration-300 border-2 border-gray-800/40">
                                  <span>{chat.otherUser?.name.charAt(0) || '?'}</span>
                                </div>
                                <div className="absolute inset-0 rounded-full hover:border-2 hover:border-green-500/40 transition-all"></div>
                                {/* Presence status dot for mobile */}
                                {!chat.isGroupChat && otherUserId && (
                                  <div className="absolute bottom-0 right-0 z-20 translate-x-0.5 translate-y-0.5">
                                    <PresenceStatusIndicator userId={otherUserId} size="xs" />
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                          
                          {/* Content Area with enhanced typography */}
                          <div className="chat-meta flex-1 min-w-0">                            <div className="flex justify-between items-start mb-1">
                              <h3 className={`name font-semibold text-sm leading-tight truncate transition-colors duration-300 ${
                                unreadCount > 0 
                                  ? 'text-white' 
                                  : 'text-gray-100'
                              }`}>
                                {chat.isGroupChat ? (chat.name || 'Group Chat') : chat.otherUser?.name}
                              </h3>
                              {chat.lastMessage && (
                                <div className="flex flex-col items-end ml-2">
                                  <span className={`timestamp text-xs whitespace-nowrap transition-colors duration-300 ${
                                    unreadCount > 0
                                      ? 'text-gray-300'
                                      : 'text-gray-500'
                                  }`}>
                                    {formatMessageTime(chat.lastMessage.createdAt)}
                                  </span>
                                  {chat.lastMessage.senderId === currentUser?.id && (
                                    <div className="flex items-center mt-0.5">
                                      {/* Removed checkmark icon for sent messages */}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                            
                            <div className="flex items-center justify-between">                              <p className={`last-message text-xs truncate pr-2 transition-colors duration-300 ${
                                unreadCount > 0 
                                  ? 'text-gray-200 font-medium'
                                  : 'text-gray-400'
                              }`}>
                                {chat.lastMessage ? (
                                  <span className="flex items-center">
                                    {chat.isGroupChat && chat.lastMessage.senderId !== currentUser?.id && (                                      <span className="mr-1 font-semibold text-xs px-1.5 py-0.5 rounded transition-colors duration-300 bg-gray-700/50 text-gray-300">
                                        {chat.users?.find(u => u.id === chat.lastMessage?.senderId)?.name?.split(' ')[0] || 'User'}
                                      </span>
                                    )}
                                    {chat.lastMessage.senderId === currentUser?.id && (
                                      <span className={`mr-1 font-semibold text-xs px-1.5 py-0.5 rounded transition-colors duration-300 ${
                                        isSelected 
                                          ? 'bg-blue-500/20 text-blue-200' 
                                          : 'bg-gray-700/50 text-gray-400'
                                      }`}>
                                        You
                                      </span>
                                    )}
                                    {chat.lastMessage.content === "This message was deleted" ? (
                                      <span className="italic flex items-center text-red-400">
                                        <span className="material-icons text-sm mr-1">delete_outline</span>
                                        <span>Message deleted</span>
                                      </span>
                                    ) : (
                                      <span className="flex items-center">
                                        {chat.lastMessage.content.startsWith('📎') && (
                                          <span className="material-icons text-sm mr-1 text-blue-400">attach_file</span>
                                        )}
                                        <span className="truncate">{chat.lastMessage.content}</span>
                                      </span>
                                    )}                                  </span>
                                ) : (
                                  <span className="italic text-gray-500 flex items-center">
                                    <span className="material-icons text-sm mr-1">forum</span>
                                    Open the conversation
                                  </span>
                                )}
                              </p>
                            </div>
                          </div>
                          
                          {/* Enhanced Unread Badge with modern styling */}
                          {unreadCount > 0 && (
                            <div className="ml-3 flex-shrink-0">
                              <div className="unread-badge rounded-full text-white text-xs font-bold flex items-center justify-center">
                                <span>
                                  {unreadCount > 99 ? '99+' : unreadCount}
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {hasChatSearch && userSearchMatches.length > 0 && (
                      <div className="mt-3 space-y-1 px-1">
                        <div className="text-[10px] uppercase tracking-[0.18em] text-gray-400/80 px-1">People</div>
                        {userSearchMatches.map(user => (
                          <button
                            key={`mobile-search-${user.id}`}
                            onClick={() => handleUserSearchSelect(user)}
                            className="messaging-mobile-list-item additional group relative flex items-center w-full px-3 py-2 rounded-xl border border-dashed border-green-600/30 bg-[#151515] text-left"
                          >
                            <div className="mr-3">
                              {user.profile_pic ? (
                                <img src={user.profile_pic} alt={user.name} className="w-10 h-10 rounded-full object-cover border border-gray-700/50 group-hover:border-green-500/40 transition-colors" />
                              ) : (
                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-600 to-emerald-500 flex items-center justify-center text-white font-semibold text-sm border border-gray-700/40 group-hover:border-green-500/40 transition-colors">
                                  {user.name?.charAt(0) || '?'}
                                </div>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1">
                                <span className="text-sm text-white font-medium truncate">{user.name}</span>
                                {directChatByUserId.has(user.id) && (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-green-600/20 text-green-200 border border-green-500/30">Existing chat</span>
                                )}
                              </div>
                              {user.email && (
                                <div className="text-[11px] text-gray-400 truncate">{user.email}</div>
                              )}
                            </div>
                            <div className="text-[10px] text-green-300 font-semibold ml-2">
                              {directChatByUserId.has(user.id) ? 'Open' : 'Start'}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}


        {/* Mobile: Requests overlay as full-screen panel */}
        {isMobileView && showRequests && (
          <div className="fixed inset-0 z-[1001] md:hidden">
            <div className="absolute inset-0 bg-black/60" onClick={() => setShowRequests(false)} />
            <div className="absolute right-0 top-0 h-full w-[90%] max-w-sm bg-gradient-to-b from-[#0c0c0c] via-[#141414] to-[#0c0c0c] border-l border-gray-800/70 shadow-[0_25px_60px_-12px_rgba(0,0,0,0.9)] backdrop-blur-md transform transition-transform duration-300 ease-out translate-x-0 flex flex-col">
              <div className="sticky top-0 z-10 px-4 py-3 border-b border-gray-800/70 flex items-center justify-between bg-gradient-to-r from-emerald-500/5 via-transparent to-transparent shadow-[0_1px_0_0_rgba(16,185,129,0.08)]">
                <div className="flex items-center gap-2">
                  <span className="material-icons text-blue-300 rounded-md p-2 bg-blue-500/10 ring-1 ring-blue-500/20 shadow-sm">mail</span>
                  <div className="text-sm font-semibold text-gray-300 tracking-wide">Message Requests</div>
                </div>
                <button aria-label="Close" className="p-2 rounded-lg hover:bg-white/5 text-gray-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30" onClick={() => setShowRequests(false)}>
                  <span className="material-icons">close</span>
                </button>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent hover:scrollbar-thumb-gray-600 p-2">
                {requestChats.length === 0 ? (
                  <div className="h-full min-h-[40vh] px-4 py-8 text-center text-gray-400 flex flex-col items-center justify-center">
                    <span className="material-icons text-4xl mb-2">move_to_inbox</span>
                    <div className="font-medium text-white mb-1">No message requests</div>
                    <div className="text-sm text-gray-400">New messages from people you haven't chatted with will appear here.</div>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {requestChats.map(chat => (
                      <ChatListItem
                        key={chat.id}
                        chat={chat}
                        currentUser={currentUser}
                        incomingCallCallerUid={incomingCallCallerUid}
                        selectedChat={selectedChat}
                        setSelectedChat={(c) => {
                          setSelectedChat(c);
                          setShowRequests(false);
                          if (isMobileView) setShowChatList(false);
                        }}
                        formatMessageTime={formatMessageTime}
                        onRightClick={handleChatRightClick}
                        showChatActionSheet={showChatActionSheet}
                        isMobileView={isMobileView}
                        setShowChatList={setShowChatList}
                        onAcceptRequest={(accepted) => {
                          handleChatListAccept(accepted);
                          setShowRequests(false);
                          if (isMobileView) setShowChatList(false);
                        }}
                        onDeclineRequest={(declined) => {
                          handleChatListDecline(declined);
                          setShowRequests(false);
                          if (isMobileView) setShowChatList(false);
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        {/* Mobile: Blocked Users overlay as full-screen panel */}
        {isMobileView && showBlocked && (
          <div className="fixed inset-0 z-[1001] md:hidden">
            <div className="absolute inset-0 bg-black/60" onClick={() => setShowBlocked(false)} />
            <div className="absolute right-0 top-0 h-full w-[90%] max-w-sm bg-gradient-to-b from-[#0c0c0c] via-[#141414] to-[#0c0c0c] border-l border-gray-800/70 shadow-[0_25px_60px_-12px_rgba(0,0,0,0.9)] backdrop-blur-md transform transition-transform duration-300 ease-out translate-x-0 flex flex-col">
              <div className="sticky top-0 z-10 px-4 py-3 border-b border-gray-800/70 flex items-center justify-between bg-gradient-to-r from-emerald-500/5 via-transparent to-transparent shadow-[0_1px_0_0_rgba(16,185,129,0.08)]">
                <div className="flex items-center gap-2">
                  <span className="material-icons text-orange-300 rounded-md p-2 bg-orange-500/10 ring-1 ring-orange-500/20 shadow-sm">block</span>
                  <div className="text-sm font-semibold text-gray-300 tracking-wide">Blocked Users</div>
                </div>
                <button aria-label="Close" className="p-2 rounded-lg hover:bg-white/5 text-gray-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30" onClick={() => setShowBlocked(false)}>
                  <span className="material-icons">close</span>
                </button>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent hover:scrollbar-thumb-gray-600 p-4">
                <div className="h-full min-h-[40vh] px-2 py-6 text-center text-gray-400 flex flex-col items-center justify-center">
                  <span className="material-icons text-4xl mb-2">block</span>
                  <div className="font-medium text-white mb-1">Blocked users list</div>
                  <div className="text-sm text-gray-400">This is a placeholder overlay. No functions are implemented.</div>
                </div>
              </div>
            </div>
          </div>
        )}
        {/* Chat view */}
        {!isMobileView || !showChatList ? (
          <div className="flex-1 flex flex-col min-w-0 max-w-full overflow-hidden">
            {selectedChat ? (
              <>
                {/* Chat header */}                <ChatHeader 
                  selectedChat={selectedChat} 
                  setShowChatList={setShowChatList} 
                  setShowGroupModal={setShowGroupModal} 
                  setShowAddMemberModal={setShowAddMemberModal} 
                  currentUser={currentUser} 
                  setSelectedChat={setSelectedChat} 
                  setShowDeleteChatDialog={setShowDeleteChatDialog}
                  blockingStatus={blockingStatus}
                  handleBlockUser={handleBlockUser}
                  onVisitProfile={handleVisitProfile}
                  openThemeModal={openThemeModal}
                  openMediaFiles={() => setShowMediaFiles(true)}
                  onStartAudioCall={handleStartAudioCall}
                  canStartAudioCall={canStartAudioCall}
                  isCallingBusy={callActionLoading !== null}
                />
                {/* Media & Files Slide-in Sidebar (pushes content on desktop, overlay on mobile) */}
                {showMediaFiles && (
                  <>
                    {/* Desktop push effect wrapper: we add a spacer div to visually push content when sidebar is open */}
                    <div className="hidden lg:block" aria-hidden="true"></div>
                    <div 
                      className="fixed top-0 right-0 h-full w-[90%] max-w-sm md:w-[420px] md:max-w-none z-[1100] flex flex-col bg-[#101010] border-l border-gray-800 shadow-2xl shadow-black/50 transform transition-transform duration-300 ease-out translate-x-0"
                      role="dialog" aria-label="Media and Files Sidebar"
                    >
                      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-gradient-to-r from-green-600/10 via-green-500/5 to-transparent">
                        <div className="flex items-center gap-2">
                          <span className="material-icons text-green-400">perm_media</span>
                          <h2 className="text-sm font-semibold text-white tracking-wide">Media & Files</h2>
                        </div>
                        <button 
                          onClick={() => setShowMediaFiles(false)} 
                          aria-label="Close sidebar" 
                          className="p-2 rounded-md text-gray-300 hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500/30"
                        >
                          <span className="material-icons">close</span>
                        </button>
                      </div>
                      <div className="flex-1 min-h-0 flex flex-col">
                        <MediaFilesPanel messages={messages} onClose={() => setShowMediaFiles(false)} />
                      </div>
                    </div>
                    {/* Backdrop only for small screens to allow closing by clicking outside */}
                    <div 
                      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[1099] md:hidden" 
                      onClick={() => setShowMediaFiles(false)}
                      aria-hidden="true"
                    />
                  </>
                )}
                {/* Pinned message banner */}
                <PinnedMessageBanner
                  message={visiblePinnedMessage}
                  chat={selectedChat}
                  currentUser={currentUser}
                  onDismiss={handleDismissPinnedMessage}
                  onViewMessage={handleViewPinnedMessage}
                />
                {/* Messages area */}
                {/* messagesContainerBgStyle uses PUBLIC_URL which is available at runtime */}
                <div
                  ref={chatContainerRef}
                  className="flex-1 overflow-y-auto overflow-x-hidden bg-[#111] w-full scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent messages-container h-full mobile-scrollbar-hide"
                >
                  <style>{`
                    .overflow-wrap-anywhere {
                      overflow-wrap: anywhere;
                      word-break: break-word;
                      white-space: pre-wrap;
                    }

                    .message-bubble {
                      display: inline-block;
                      width: fit-content;
                      min-width: 2.5rem;
                      max-width: 100%;
                      /* For long messages, restrict width, but for short, let it shrink */
                    }

                    .message-content {
                      max-height: 300px;
                      overflow-y: auto;
                      scrollbar-width: thin;
                      scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
                    }

                    .message-content::-webkit-scrollbar {
                      width: 4px;
                    }

                    .message-content::-webkit-scrollbar-track {
                      background: transparent;
                    }

                    .message-content::-webkit-scrollbar-thumb {
                      background-color: rgba(255, 255, 255, 0.2);
                      border-radius: 4px;
                    }

                    .messages-container {
                      scroll-behavior: smooth;
                      -webkit-overflow-scrolling: touch;
                    }

                    .message-group {
                      margin-bottom: 1rem;
                    }

                    .message-group:last-child {
                      margin-bottom: 0;
                    }

                    @media (max-width: 640px) {
                      .message-bubble {
                        max-width: 85%;
                      }
                    }

                    @media (min-width: 641px) and (max-width: 1024px) {
                      .message-bubble {
                        max-width: 75%;
                      }
                    }

                    @media (min-width: 1025px) {
                      .message-bubble {
                        max-width: 65%;
                      }
                    }

                    /* Enhanced responsive behavior for screens between 380px-450px */
                    @media (max-width: 450px) {
                      .message-bubble {
                        max-width: clamp(75%, 80vw, 85%); 
                        box-sizing: border-box;
                        width: fit-content;
                      }
                      
                      /* Use viewport-relative measurements to scale with screen size */
                      .message-bubble-wrapper {
                        max-width: 85vw;
                      }
                      
                      /* Better sizing on smaller screens */
                      .w-full {
                        width: 100% !important;
                        max-width: 100% !important;
                        box-sizing: border-box !important;
                      }
                      
                      /* Fix message container overflow */
                      .flex-1 {
                        flex: 1 1 0% !important;
                        min-width: 0 !important;
                        width: 100% !important;
                      }
                    }
                    
                    /* Smallest screen fixes */
                    @media (max-width: 400px) {
                      .message-bubble-container {
                        padding-left: 0.5rem !important;
                        padding-right: 0.5rem !important;
                      }
                      
                      /* Force correct message sizing */
                      .message-bubble-wrapper {
                        max-width: 80vw !important;
                        box-sizing: border-box !important;
                      }
                    }
                  `}</style>
                  {/* Bottom-align messages when content is shorter than viewport for new conversations */}
                  <div className="min-h-full flex flex-col justify-end">
                    <div className="py-4 space-y-3 px-2">
                    {hasMoreOlder && messages.length >= pageSize && (
                      <div className="flex justify-center py-1">
                        {isLoadingOlder ? (
                          <span className="text-xs text-gray-400">Loading older messages…</span>
                        ) : (
                          <button
                            onClick={() => loadOlderMessages()}
                            className="text-xs text-gray-400 hover:text-gray-300 underline"
                          >
                            Load older messages
                          </button>
                        )}
                      </div>
                    )}
                    {((isMessagesLoading || stableLoading) || !emptyDelayPassed) ? (
                      <Spinner className="py-12" label="Loading messages..." />
                    ) : messages.length === 0 && selectedChat?.isGroupChat ? (
                      <div className="flex flex-col items-center justify-center py-12 animate-fadeIn">
                        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-green-600 to-emerald-500 flex items-center justify-center mb-4 shadow-lg shadow-green-900/20">
                          <span className="material-icons text-3xl text-white">groups</span>
                        </div>
                        <h3 className="text-lg font-medium text-white mb-2">Group chat created!</h3>
                        <p className="text-gray-400 text-center max-w-sm mb-6">
                          Be the first to say hello to the group
                        </p>
                        <button
                          className="px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-400 text-white rounded-full font-semibold shadow-lg hover:shadow-green-900/30 hover:from-green-600 hover:to-emerald-500 transition-all duration-300 flex items-center gap-2"
                          onClick={() => {
                            setMessageText("Hello everyone! 👋");
                            messageInputRef.current?.focus();
                          }}
                        >
                          <span className="material-icons">chat</span>
                          <span>Start the conversation</span>
                        </button>
                      </div>
                    ) : null}
                    
                    {messages.length === 0 && selectedChat && !selectedChat.isGroupChat && selectedChat.otherUser && (
                      (emptyDelayPassed && !stableLoading) ? (
                        <div className="flex flex-col items-center justify-center py-12 animate-fadeIn">
                          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-green-500 to-teal-400 flex items-center justify-center mb-4 shadow-lg shadow-green-900/20">
                            <span className="material-icons text-3xl text-white">person</span>
                          </div>
                          <h3 className="text-lg font-medium text-white mb-2">Chat with {selectedChat.otherUser.name}</h3>
                          <p className="text-gray-400 text-center max-w-sm mb-6">
                            Send your first message to start the conversation
                          </p>
                          <button
                            className="px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-400 text-white rounded-full font-semibold shadow-lg hover:shadow-green-900/30 hover:from-green-600 hover:to-emerald-500 transition-all duration-300 flex items-center gap-2"
                            onClick={() => {
                              setMessageText("Hi! 👋");
                              messageInputRef.current?.focus();
                            }}
                          >
                            <span className="material-icons">chat</span>
                            <span>Say hello</span>
                          </button>
                        </div>
                      ) : (
                        <Spinner className="py-12" label="Loading conversation..." />
                      )
                    )}
        {/* View mode banner inside chat area for Message Requests (receiver only) */}
        {isViewingPendingRequest && (
          <div className="px-4 py-2.5 mb-3 mx-3 rounded-lg bg-amber-500/15 text-amber-100 border border-amber-500/25 ring-1 ring-amber-400/10 shadow-[0_6px_18px_-8px_rgba(245,158,11,0.35)] flex items-center gap-2 text-[11px] sm:text-xs">
            <span className="material-icons text-sm">mail_outline</span>
            <span>
              This conversation is pending your approval. Reviewing is allowed; sending a reply will accept the request and move it to your inbox.
            </span>
          </div>
        )}

        {messages.map((message, index) => {
                      const prev = index > 0 ? messages[index - 1] : null;
                      const showSenderName = !!(selectedChat?.isGroupChat && (!prev || prev.senderId !== message.senderId));
                      return (
                          <MessageItem 
          key={message.id}
                          message={message}
                          messages={messages}
                          isLast={index === messages.length - 1}
                          onAction={handleMessageAction}
                          isPinned={message.isPinned}
                          currentUser={currentUser}
                          selectedChat={selectedChat}
                          isMobileView={isMobileView}
                          touchStartXRef={touchStartXRef}
                          showMobileActionSheet={showMobileActionSheet}
                          setContextMenu={setContextMenu}
                          setSelectedReactions={setSelectedReactions}
                          setShowReactionDetails={setShowReactionDetails}
                          showSenderName={showSenderName}
                          openImagePreview={openImagePreview}
                          openVideoPreview={openVideoPreview}
                        />
                      );
                    })}
                    <div ref={messagesEndRef} id="messages-end" className="h-4 messages-end-ref" />
                    </div>
                  </div>
                  
                  {/* ProfanityModal - displayed in chat area */}
                  <ProfanityModal
                    open={profanityModalOpen}
                    detectedWords={detectedProfaneWords}
                    onClose={() => setProfanityModalOpen(false)}
                  />
                </div>
                
                {/* Mobile Action Sheet */}
                {showActionSheet && selectedMessage && (
                  <MobileActionSheet
                    message={selectedMessage}
                    onAction={(action) => selectedMessage && handleMessageAction(action, selectedMessage)}
                    onClose={() => setShowActionSheet(false)}
                    isSender={selectedMessage.senderId === currentUser?.id}
                  />
                )}
                {isMessageRequestActive && (
                  <div className="bg-[#121212] border-t border-amber-500/20 px-3 sm:px-4 py-3 flex flex-col gap-3">
                    <div className="flex items-start gap-2 text-amber-100 text-xs sm:text-sm">
                      <span className="material-icons text-sm sm:text-base">mail</span>
                      <div className="flex-1">
                        <p className="font-semibold uppercase tracking-wide text-[11px] sm:text-[12px] text-amber-200/95">Message request</p>
                        <p className="text-amber-200/90 leading-snug">
                          {isViewingPendingRequest
                            ? `Accept to move this conversation with ${requestCounterpartName} into your inbox, or decline to remove it.`
                            : `Waiting for ${requestCounterpartName} to accept this request.`}
                        </p>
                      </div>
                    </div>
                    {isViewingPendingRequest ? (
                      <div className="flex flex-col sm:flex-row sm:justify-end gap-2">
                        <button
                          type="button"
                          className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-lg border border-red-500/40 bg-red-600/15 text-red-200 hover:bg-red-600/25 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                          onClick={handleDeclineMessageRequest}
                          disabled={requestActionLoading !== null}
                        >
                          {requestActionLoading === 'decline' ? 'Declining...' : 'Decline'}
                        </button>
                        <button
                          type="button"
                          className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-lg border border-emerald-500/50 bg-emerald-500/20 text-emerald-100 hover:bg-emerald-500/30 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                          onClick={handleAcceptMessageRequest}
                          disabled={requestActionLoading !== null}
                        >
                          {requestActionLoading === 'accept' ? 'Accepting...' : 'Accept'}
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-amber-200/90 text-xs sm:text-sm">
                        <span className="material-icons text-sm">schedule</span>
                        <span>{isCurrentUserRequestInitiator ? `Waiting for ${requestCounterpartName} to respond.` : 'Pending approval.'}</span>
                      </div>
                    )}
                  </div>
                )}
                  {/* Message input area with blocking status handling */}
                {blockingStatus.isBlocked || blockingStatus.isBlockedBy ? (
                  // Show blocking indicator instead of input
                  <div className="bg-[#121212] border-t border-gray-800/10 px-2 sm:px-4 py-4">
                    <div className="flex items-center justify-center bg-red-900/20 border border-red-600/30 rounded-xl py-3 px-4">
                      <span className="material-icons text-red-400 mr-2">block</span>
                      <span className="text-red-400 font-medium">
                        {blockingStatus.isBlocked 
                          ? `You blocked ${selectedChat?.otherUser?.name || 'this user'}`
                          : `You are blocked by ${selectedChat?.otherUser?.name || 'this user'}`
                        }
                      </span>
                      {blockingStatus.isBlocked && (
                        <button
                          onClick={() => handleBlockUser(selectedChat!)}
                          disabled={blockingStatus.isLoading}
                          className="ml-3 px-3 py-1 bg-red-600/80 hover:bg-red-500 text-white text-sm rounded-lg transition-colors disabled:opacity-50"
                        >
                          {blockingStatus.isLoading ? 'Loading...' : 'Unblock'}
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  // Show normal message input
                  <MessageInput
                    messageText={messageText}
                    setMessageText={setMessageText}
                    messageInputRef={messageInputRef}
                    handleSendMessageWithReply={handleSendMessageWithReply}
                    replyToMessage={replyToMessage}
                    setReplyToMessage={setReplyToMessage}
                    currentUser={currentUser}
                    selectedChat={selectedChat}
                    editingMessage={editingMessage}
                    setEditingMessage={setEditingMessage}
                    isSendingMessage={isSendingMessage}
                    setIsSendingMessage={setIsSendingMessage}
                    isMobileView={isMobileView}
                    setProfanityModalOpen={setProfanityModalOpen}
                    setDetectedProfaneWords={setDetectedProfaneWords}
                  />
                )}
              </>
            ) : (
              // Empty state when no chat is selected
              <div className="flex-1 flex flex-col items-center justify-center bg-[#111] p-6">
                <div className="rounded-full bg-[#1a1a1a] p-5 mb-6">
                  <span className="material-icons text-green-500 text-3xl">chat</span>
                </div>
                <h3 className="text-lg font-medium text-white mb-2">No conversation selected</h3>
                <p className="text-gray-400 text-center max-w-sm">
                  Select a conversation from the sidebar or use the search field to start a new one.
                </p>
              </div>
            )}
          </div>
        ) : null}
      </div>
      {/* Connection status indicator */}
      {ConnectionStatusIndicator}

      {/* Delete Message Dialog */}
      {showDeleteDialog && messageToDelete && (
        <DeleteMessageDialog
          message={messageToDelete}
          onDeleteForMe={() => messageToDelete && handleMessageAction('delete-for-me', messageToDelete)}
          onDeleteForEveryone={() => messageToDelete && handleMessageAction('delete-for-everyone', messageToDelete)}
          onClose={() => setShowDeleteDialog(false)}
        />
      )}

      {/* Forward Message Dialog */}
      {showForwardDialog && messageToForward && (
        <ForwardMessageDialog
          isOpen={showForwardDialog}
          onClose={() => setShowForwardDialog(false)}
          onForward={async (targetChatId) => {
            try {
              if (messageToForward && currentUser) {
                await forwardMessage(messageToForward.id, targetChatId, currentUser.id);
                
                // Find the name of the chat we forwarded to for the success message
                const targetChat = chats.find(chat => chat.id === targetChatId);
                const chatName = targetChat?.isGroupChat 
                  ? targetChat.name 
                  : targetChat?.otherUser?.name || 'chat';
                
                showToast('success', `Message forwarded to ${chatName}`);
                
                // If the user is currently viewing the target chat, we should update the messages
                if (selectedChat?.id === targetChatId) {
                  // We don't need to manually refresh the messages as they should be 
                  // automatically updated by the existing listener for the selected chat
                  showToast('success', `Message forwarded to ${chatName}`);
                } else {
                  showToast('success', `Message forwarded to ${chatName}`);
                }
              }
            } catch (error) {
              console.error('Error forwarding message:', error);
              showToast('error', 'Failed to forward message');
            }
          }}
          chats={chats}
          currentUser={currentUser}
        />
      )}

      {/* Reaction Details Modal */}
      {showReactionDetails && (
        <ReactionDetailsModal
          reactions={selectedReactions}
          onClose={() => setShowReactionDetails(false)}
        />
      )}

      {/* Group Chat Modal */}
      {showGroupModal && selectedChat && currentUser && (
        <GroupChatModal
          chat={selectedChat}
          currentUser={currentUser}
          onClose={() => setShowGroupModal(false)}
          onMembersChanged={handleGroupMembersChanged}
        />
      )}

      {/* Group Creation Modal */}
      {showCreateGroupModal && currentUser && (
        <CreateGroupChatModal
          users={messageableUsers}
          currentUser={currentUser}
          onCreate={handleCreateGroupChat}
          onClose={() => setShowCreateGroupModal(false)}
        />
      )}

      {/* Add Member Modal */}
      {showAddMemberModal && (
        <AddMemberModal
          onClose={() => setShowAddMemberModal(false)}
          onAddMember={handleAddMember}
          selectedChat={selectedChat}
        />
      )}

      {/* Theme Modal */}
      {showThemeModal && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60" role="dialog" aria-modal="true" onClick={() => setShowThemeModal(false)}>
          <div className="bg-[#1b1b1b] w-full max-w-md rounded-2xl border border-gray-800 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
              <h3 className="text-white font-semibold">Customize Chat Theme</h3>
              <button className="text-gray-400 hover:text-white" onClick={() => setShowThemeModal(false)} aria-label="Close">
                <span className="material-icons">close</span>
              </button>
            </div>
            <div className="p-5">
              <p className="text-gray-400 text-sm mb-3">Choose a color for your messages in this chat.</p>
              <div className="grid grid-cols-3 gap-3">
                {(Object.entries(THEME_STYLES) as [ThemeKey, ThemeStyle][]).map(([key, cls]) => (
                  <button
                    key={key}
                    className={`relative group rounded-xl p-3 border transition-all duration-200 ${
                      toThemeKey(pendingTheme) === key ? 'border-white/40 ring-2 ring-white/10' : 'border-gray-800 hover:border-gray-700'
                    }`}
                    onClick={() => setPendingTheme(key)}
                  >
                    <div className={`h-10 w-full rounded-lg bg-gradient-to-r ${cls.from} ${cls.to}`}></div>
                    <div className="mt-2 text-xs text-gray-300 capitalize text-center">{key}</div>
                    {toThemeKey(pendingTheme) === key && (
                      <span className="absolute -top-2 -right-2 bg-green-500 text-white rounded-full p-1 shadow-md">
                        <span className="material-icons text-xs">check</span>
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
            <div className="px-5 py-4 border-t border-gray-800 flex items-center justify-end gap-3">
              <button className="px-4 py-2 text-sm rounded-lg bg-[#2a2a2a] text-gray-200 hover:bg-[#333]" onClick={() => setShowThemeModal(false)}>
                Cancel
              </button>
              <button
                className={`px-4 py-2 text-sm rounded-lg text-white shadow-md border bg-gradient-to-r ${getThemeStylesByKey(pendingTheme).from} ${getThemeStylesByKey(pendingTheme).to} ${getThemeStylesByKey(pendingTheme).border} border-opacity-20`}
                onClick={applyChatTheme}
              >
                Save Theme
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Chat Dialog */}
      {showDeleteChatDialog && selectedChat && !selectedChat.isGroupChat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[#1e1e1e] rounded-xl max-w-sm w-full shadow-xl overflow-hidden">
            <div className="p-5">
              <h3 className="text-lg font-bold text-white mb-2">Delete Conversation</h3>
              <p className="text-gray-300 text-sm mb-6">
                This hides the entire conversation from your view. The other participant will still see the existing messages. If new messages are sent later, only those new messages will appear for you (previous history stays hidden).
              </p>
              <div className="flex gap-2 justify-end">
                <button
                  className="px-4 py-2 bg-gray-700 text-gray-300 rounded hover:bg-gray-600"
                  onClick={() => setShowDeleteChatDialog(false)}
                >
                  Cancel
                </button>
                <button
                  className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                  onClick={async () => {
                    if (!currentUser || !selectedChat) {
                      showToast('error', 'User not logged in or chat not selected.');
                      return;
                    }
                    try {
                      // Close dialog & deselect; list filtering will hide until new message
                      setSelectedChat(null);
                      setShowDeleteChatDialog(false);
                      
                      await deleteOneToOneChat(selectedChat.id, currentUser.id);
                      
                      showToast('success', 'Conversation hidden');
                    } catch (e) {
                      setShowDeleteChatDialog(false);
                      showToast('error', 'Failed to delete conversation');
                    }
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>        </div>
      )}      {/* Fullscreen media viewer modal (images/videos) */}
      {mediaPreviewOpen && (
        <div className="fixed inset-0 z-[11000] flex items-center justify-center bg-black/90" onClick={() => setMediaPreviewOpen(false)}>
          {/* Fixed top controls */}
          <button aria-label="Download" onClick={(e) => { e.stopPropagation(); downloadImage(mediaPreviewImages[mediaCurrentIndex]); }} className="fixed top-4 left-4 z-[11050] p-2 rounded-full bg-black/40 hover:bg-black/30">
            <span className="material-icons text-white">download</span>
          </button>
          <button aria-label="Close" onClick={(e) => { e.stopPropagation(); setMediaPreviewOpen(false); }} className="fixed top-4 right-4 z-[11050] p-2 rounded-full bg-black/40 hover:bg-black/30">
            <span className="material-icons text-white">close</span>
          </button>
          <div className="relative max-w-[95vw] max-h-[95vh] w-full flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
            <div className="w-full h-full flex items-center justify-center">
              <img src={displayedImageSrc || mediaPreviewImages[mediaCurrentIndex]} alt={`preview-${mediaCurrentIndex}`} className={`max-w-[95vw] max-h-[95vh] object-contain rounded transition-opacity duration-200 ${imageFade ? 'opacity-0' : 'opacity-100'}`} />
            </div>
            {mediaPreviewImages.length > 1 && (
              <>
                <button aria-label="Previous" onClick={(e) => { e.stopPropagation(); goToPrevious(); }} className="absolute left-2 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/30 text-white">
                  <span className="material-icons">chevron_left</span>
                </button>
                <button aria-label="Next" onClick={(e) => { e.stopPropagation(); goToNext(); }} className="absolute right-2 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/30 text-white">
                  <span className="material-icons">chevron_right</span>
                </button>
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-white text-sm bg-black/30 px-3 py-1 rounded">
                  {mediaCurrentIndex + 1} / {mediaPreviewImages.length}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {mediaVideoOpen && (
        <div className="fixed inset-0 z-[11000] flex items-center justify-center bg-black/90" onClick={() => setMediaVideoOpen(false)}>
          <button aria-label="Close" onClick={(e) => { e.stopPropagation(); setMediaVideoOpen(false); }} className="fixed top-4 right-4 z-[11050] p-2 rounded-full bg-black/40 hover:bg-black/30">
            <span className="material-icons text-white">close</span>
          </button>
          <div className="relative max-w-[95vw] max-h-[95vh] w-full flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
            <div className="w-full h-full flex items-center justify-center">
              <video src={mediaVideoUrl || undefined} controls className="max-w-[95vw] max-h-[95vh] object-contain rounded" />
            </div>
          </div>
        </div>
      )}

      {/* Chat Context Menu for right-click options on chat items */}
      <ChatContextMenu
        position={chatContextMenu?.position || null}
        chat={chatContextMenu?.chat || null}
        currentUser={currentUser}
        onClose={handleCloseChatContextMenu}
        onArchive={handleArchiveChat}
        onDelete={handleDeleteChat}
        onBlock={handleBlockUser}
        onShowDeleteDialog={handleShowDeleteChatDialog}
        isBlocked={blockingStatus.isBlocked}      />        {/* Chat Action Sheet for mobile longpress options on chat items */}
      {chatActionSheet && (
        <ChatActionSheet
          key={`action-sheet-${Date.now()}`} /* Use timestamp to ensure it's always new */
          chat={chatActionSheet.chat}
          currentUser={currentUser}
          onClose={handleCloseChatActionSheet}
          onArchive={handleArchiveChat}
          onDelete={handleDeleteChat}
          onBlock={handleBlockUser}
          onShowDeleteDialog={handleShowDeleteChatDialog}
          isBlocked={blockingStatus.isBlocked}
        />
      )}
    </MainLayout>
  );
};

// Fullscreen media viewer rendered at page level (uses state inside MessagingPage via closure)

export default MessagingPage;
