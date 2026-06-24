import React, { useMemo, useRef } from 'react';
import { Timestamp } from 'firebase/firestore';
import { PresenceStatusIndicator } from '../../../components/common/PresenceStatusIndicator';
import { acceptMessageRequest, declineMessageRequest } from '../../../services/messageService';
import { FriendUID } from '../constants';
import { normalizeChatId, resolveChatPeerId } from '../utils';
import type { ChatListItemProps } from '../types';

let ChatListItem: React.FC<ChatListItemProps> = ({ 
  chat, 
  currentUser, 
  incomingCallCallerUid,
  selectedChat, 
  setSelectedChat, 
  formatMessageTime,
  onRightClick,
  showChatActionSheet,
  onAcceptRequest,
  onDeclineRequest,
  isMobileView,
  setShowChatList
}) => {
  const otherUser = chat.otherUser;
  const normalizedCurrentUid = normalizeChatId(currentUser?.id);
  const otherUserId = resolveChatPeerId(chat, normalizedCurrentUid);
  const normalizedOtherUserId = normalizeChatId(otherUserId);
  const normalizedIncomingCallerUid = normalizeChatId(incomingCallCallerUid);
  const hasIncomingCallSignal = !!normalizedOtherUserId && !!normalizedIncomingCallerUid && normalizedOtherUserId === normalizedIncomingCallerUid;
  // Defensive: ensure we don't show a stale lastMessage from a previously rendered chat
  // If chat.lastMessage exists but its chatId (if present) doesn't match, ignore it.
  const safeLastMessage = useMemo(() => {
    const lm: any = chat.lastMessage;
    if (!lm) return null;
    if (lm.chatId && lm.chatId !== chat.id) return null; // stale carry-over
    // If required fields missing (content/senderId), treat as absent
    if (typeof lm.content !== 'string' || typeof lm.senderId !== 'string') return null;
    return lm;
  }, [chat.lastMessage, chat.id]);
  const lastMessage = safeLastMessage as typeof chat.lastMessage;
  const unreadCount = chat.unreadCount?.[currentUser?.id || ''] ?? 0;
  const isSelected = selectedChat?.id === chat.id;
  const isArchived = chat.archived?.[currentUser?.id || ''] === true;
  const isRequest = (chat as any).isMessageRequest === true;
  const isInitiator = ((chat as any).initiator ?? (chat as any).messageRequestInitiatorId) === currentUser?.id;
  
  // Touch handling for long press on mobile
  const touchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialTouchRef = useRef<{ x: number; y: number } | null>(null);  const longPressTriggeredRef = useRef<boolean>(false);
  const longPressThreshold = 700;
  const touchMoveTolerance = 15;
  
  const handleTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation();
    
    if (e.touches.length !== 1) return;

    longPressTriggeredRef.current = false;
    const touch = e.touches[0];
    initialTouchRef.current = { x: touch.clientX, y: touch.clientY };

    if (touchTimeoutRef.current) {
      clearTimeout(touchTimeoutRef.current);
      touchTimeoutRef.current = null;
    }
    
    touchTimeoutRef.current = setTimeout(() => {
      longPressTriggeredRef.current = true;
      
      if (initialTouchRef.current && typeof showChatActionSheet === 'function') {
        showChatActionSheet(chat);
      }
    }, longPressThreshold);
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    if (!initialTouchRef.current) return;
    
    e.stopPropagation();
    
    const touch = e.touches[0];
    const moveX = Math.abs(touch.clientX - initialTouchRef.current.x);
    const moveY = Math.abs(touch.clientY - initialTouchRef.current.y);
    
    if (moveX > touchMoveTolerance || moveY > touchMoveTolerance) {
      if (touchTimeoutRef.current) {
        clearTimeout(touchTimeoutRef.current);
        touchTimeoutRef.current = null;
      }
      longPressTriggeredRef.current = false;
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    e.stopPropagation();
    
    if (touchTimeoutRef.current && !longPressTriggeredRef.current) {
      clearTimeout(touchTimeoutRef.current);
      touchTimeoutRef.current = null;
    } else if (longPressTriggeredRef.current) {
      e.preventDefault();
    }
    
    initialTouchRef.current = null;
    setTimeout(() => {
      longPressTriggeredRef.current = false;
    }, 100);
  };
    
    const handleContextMenu = (e: React.MouseEvent) => {
      e.preventDefault(); // Prevent default context menu
      
      // Get the chat item element to position menu relative to it
      const chatElement = e.currentTarget as HTMLElement;
      const rect = chatElement.getBoundingClientRect();      
      // Position menu in the lower right of the chat item
      const x = rect.right - 230; // 230px from the right edge (slightly to the right)
      const y = rect.bottom - 77; // 77px from the bottom edge (3px downward)
      
      onRightClick(e, chat, { x, y });
    };
      return (      <div
        className={`group relative flex items-center px-3 py-3 mx-1 sm:mx-3 my-2 sm:my-2 mb-3 last:mb-0 sm:mb-0 rounded-xl cursor-pointer transition-all duration-300 hover:scale-[1.01] ${
          isSelected 
            ? 'bg-gradient-to-br from-green-900/40 via-emerald-800/30 to-green-900/40 border border-green-600/50 shadow-lg shadow-green-900/10' 
            : 'hover:bg-gradient-to-br hover:from-gray-800/40 hover:via-gray-700/20 hover:to-gray-800/40 border border-transparent hover:border-gray-600/30 hover:shadow-md hover:shadow-black/10'        }`}
        onClick={() => {
          setSelectedChat(chat);
          FriendUID.friendUID = otherUserId ?? '';
          if (isMobileView && setShowChatList) setShowChatList(false);
        }}
        onContextMenu={handleContextMenu}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        {/* Enhanced hover glow effect */}
        <div className="absolute inset-0 bg-gradient-to-br from-green-500/0 via-green-400/0 to-green-500/0 opacity-0 group-hover:opacity-100 transition-all duration-500 rounded-xl blur-md -z-10"></div>
        
        {/* Responsive avatar - slightly smaller on mobile */}
        <div className="relative flex-shrink-0 mr-3 sm:mr-4">
          {chat.isGroupChat ? (
            // Enhanced group chat avatar
            <div className="relative">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-emerald-500 via-green-500 to-teal-600 flex items-center justify-center text-white border border-green-600/40 shadow-lg transform transition-transform group-hover:scale-105 duration-300">
                <span className="material-icons text-lg sm:text-xl">groups</span>
              </div>
              <div className="absolute inset-0 rounded-xl bg-green-400/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 blur-sm"></div>
            </div>
          ) : otherUser?.profile_pic ? (
            // Enhanced profile picture
            <div className="relative overflow-hidden rounded-xl transform transition-transform group-hover:scale-105 duration-300">
              <img
                src={otherUser.profile_pic}
                alt={otherUser.name}
                className="w-10 h-10 sm:w-12 sm:h-12 object-cover rounded-xl border border-gray-600/50 shadow-lg transition-all duration-300 group-hover:brightness-110"
              />
              <div className="absolute inset-0 rounded-xl border border-gray-600/0 group-hover:border-green-500/30 transition-all duration-300"></div>
            </div>
          ) : (
            // Enhanced default avatar
            <div className="relative transform transition-transform group-hover:scale-105 duration-300">              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-indigo-600 via-purple-500 to-pink-600 flex items-center justify-center text-white font-bold text-base sm:text-lg border border-gray-600/50 shadow-lg">
                <span>{otherUser?.name.charAt(0) || 'U'}</span>
              </div>
              <div className="absolute inset-0 rounded-xl bg-indigo-400/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 blur-sm"></div>
            </div>
          )}
          
          {/* Enhanced archive badge */}
          {isArchived && (
            <div className="absolute -bottom-1 -right-1 w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-amber-500/90 flex items-center justify-center shadow-md shadow-black/30 border border-amber-400/30 transform transition-transform group-hover:scale-110 duration-300">
              <span className="material-icons text-white text-[0.5rem] sm:text-[0.6rem]">archive</span>
            </div>
          )}
          
          {/* Presence status dot */}
          {!chat.isGroupChat && otherUserId && (
            <div className="absolute bottom-0 right-0 z-20 translate-x-1 translate-y-1">
              <PresenceStatusIndicator userId={otherUserId} size="xs" />
            </div>
          )}
        </div>        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-start mb-1">
            <div className="flex items-center space-x-1 max-w-[70%]">
              <h3 className={`font-semibold text-xs sm:text-sm leading-tight truncate transition-all duration-300 ${
                isSelected 
                  ? 'text-green-50' 
                  : unreadCount > 0 
                    ? 'text-white' 
                    : 'text-gray-100'
              }`}>
                {chat.isGroupChat ? (chat.name || 'Group Chat') : chat.otherUser?.name}
              </h3>
              {isArchived && (
                <span className="material-icons text-amber-400 text-[0.6rem] sm:text-[0.7rem] ml-0.5 transform transition-transform group-hover:scale-110 duration-300">archive</span>
              )}
            </div>
            <div className="flex flex-col items-end ml-1 sm:ml-2 flex-shrink-0">
              {lastMessage && (
                <span
                  className={`text-[10px] sm:text-xs leading-none whitespace-nowrap transition-all duration-300 ${
                    isSelected
                      ? 'text-green-300'
                      : unreadCount > 0
                        ? 'text-gray-300'
                        : 'text-gray-500'
                  }`}
                >
                  {formatMessageTime(lastMessage.createdAt)}
                </span>
              )}
              {/* Message Request action buttons (only for receiver, not initiator) */}
              {isRequest && !isInitiator && (
                <div className="flex gap-1 mt-1">
                  <button
                    title="Accept"
                    aria-label="Accept message request"
                    className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-emerald-600/30 text-emerald-200 border border-emerald-500/30 hover:bg-emerald-600/40"
                    onClick={async (e) => {
                      e.stopPropagation();
                      await acceptMessageRequest(chat.id);
                      if (typeof onAcceptRequest === 'function') {
                        onAcceptRequest(chat);
                      }
                    }}
                  >
                    <span className="material-icons text-[14px] leading-none">check</span>
                  </button>
                  <button
                    title="Decline"
                    aria-label="Decline message request"
                    className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-red-600/20 text-red-200 border border-red-500/30 hover:bg-red-600/30"
                    onClick={async (e) => {
                      e.stopPropagation();
                      await declineMessageRequest(chat.id);
                      if (typeof onDeclineRequest === 'function') {
                        onDeclineRequest(chat);
                      }
                    }}
                  >
                    <span className="material-icons text-[14px] leading-none">close</span>
                  </button>
                </div>
              )}
            </div>
          </div>
          
          <div className="flex items-center justify-between">            <p className={`text-[10px] sm:text-xs truncate pr-2 max-w-[85%] transition-all duration-300 ${
              unreadCount > 0 
                ? 'text-gray-200 font-medium'
                : 'text-gray-400'
            }`}>
              {lastMessage ? (
                <span className="flex items-center">
                  {chat.isGroupChat && lastMessage.senderId !== currentUser?.id && (                    <span className="mr-1 font-semibold text-xs px-1.5 py-0.5 rounded bg-gray-700/50 text-gray-300">
                      {chat.users?.find(u => u.id === lastMessage.senderId)?.name?.split(' ')[0] || 'User'}
                    </span>
                  )}
                  {lastMessage.senderId === currentUser?.id && (
                    <span className={`mr-1 font-semibold text-xs px-1.5 py-0.5 rounded ${
                      isSelected 
                        ? 'bg-blue-500/20 text-blue-200' 
                        : 'bg-gray-700/50 text-gray-400'
                    }`}>
                      You
                    </span>
                  )}
                  {lastMessage?.content === "This message was deleted" ? (
                    <span className="italic flex items-center text-red-400">
                      <span className="material-icons text-sm mr-1">delete_outline</span>
                      <span>Message deleted</span>
                    </span>
                  ) : (
                    <span className="flex items-center">
                      {lastMessage?.content?.startsWith('📎') && (
                        <span className="material-icons text-sm mr-1 text-blue-400">attach_file</span>
                      )}
                      <span className="truncate">{lastMessage?.content}</span>
                    </span>
                  )}                </span>
              ) : (
                <span className="italic text-gray-500 flex items-center">
                  <span className="material-icons text-sm mr-1">forum</span>
                  Open the conversation
                </span>
              )}
            </p>
          </div>
        </div>
        
        {/* Incoming call + unread badges */}
        {(unreadCount > 0 || hasIncomingCallSignal) && (
          <div className="ml-3 flex-shrink-0 flex items-center gap-1">
            {hasIncomingCallSignal && (
              <span
                className="h-5 w-5 min-w-[1.25rem] rounded-full bg-red-500/90 text-white border border-red-400/50 shadow-md shadow-red-500/20 flex items-center justify-center animate-pulse"
                title="Incoming call"
                aria-label="Incoming call"
              >
                <span className="material-icons text-[11px] leading-none">call</span>
              </span>
            )}
            {unreadCount > 0 && (
              <div className="h-5 w-5 min-w-[1.25rem] bg-green-600 text-white text-xs font-bold flex items-center justify-center rounded-full border border-green-500/50">
                <span>
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    );
};

// Memoize ChatListItem to avoid re-renders when chat object identity is stable and relevant props unchanged
ChatListItem = React.memo(ChatListItem, (prev, next) => {
  // Re-render if selection status changes
  const prevSelected = prev.selectedChat?.id === prev.chat.id;
  const nextSelected = next.selectedChat?.id === next.chat.id;
  if (prevSelected !== nextSelected) return false;

  // Re-render if unread count changed
  const prevUnread = prev.chat.unreadCount?.[prev.currentUser?.id || ''] ?? 0;
  const nextUnread = next.chat.unreadCount?.[next.currentUser?.id || ''] ?? 0;
  if (prevUnread !== nextUnread) return false;

  if ((prev.incomingCallCallerUid || '') !== (next.incomingCallCallerUid || '')) return false;

  // Re-render if last message id or status/content timestamp changed
  const prevLastId = (prev.chat.lastMessage as any)?.id || (prev.chat.lastMessage as any)?.messageId;
  const nextLastId = (next.chat.lastMessage as any)?.id || (next.chat.lastMessage as any)?.messageId;
  if (prevLastId !== nextLastId) return false;

  const prevUpdated = prev.chat.updatedAt instanceof Timestamp ? prev.chat.updatedAt.toMillis() : 0;
  const nextUpdated = next.chat.updatedAt instanceof Timestamp ? next.chat.updatedAt.toMillis() : 0;
  if (prevUpdated !== nextUpdated) return false;

  // Re-render if archived state changed
  const prevArchived = prev.chat.archived?.[prev.currentUser?.id || ''];
  const nextArchived = next.chat.archived?.[next.currentUser?.id || ''];
  if (prevArchived !== nextArchived) return false;

  return true; // props considered equal -> skip render
});

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// interface CallContextType {
//   missedCall: boolean;
//   setMissedCall: React.Dispatch<React.SetStateAction<boolean>>;
// }

// const CallContext = React.createContext<CallContextType | undefined>(undefined);

// interface MessagingPageProps {
//   missedCall: boolean;
//   setMissedCall: React.Dispatch<React.SetStateAction<boolean>>;
// }

export default ChatListItem;
