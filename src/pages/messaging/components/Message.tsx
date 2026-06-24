import React, { useState, useEffect, useCallback, useRef } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Timestamp } from 'firebase/firestore';
import type { User } from '../../../contexts/AuthContext';
import { addMessageReaction, removeMessageReaction } from '../../../services/messageService';
import { getUserProfile } from '../../../services/userService';
import { getThemeStylesByKey, reactionEmojiMap } from '../constants';
import type { IMessage, LocalMessage, MessageProps } from '../types';
import MessageDropdown from './MessageDropdown';

const Message: React.FC<MessageProps> = ({ 
  message, 
  messages, 
  isLast, 
  onAction, 
  isPinned,
  currentUser,
  selectedChat,
  isMobileView,
  touchStartXRef,
  showMobileActionSheet,
  setContextMenu,
  setSelectedReactions,
  setShowReactionDetails,
  showSenderName,
  openImagePreview,
  openVideoPreview
}) => {
  const isSystemMessage = message.senderId === 'system' || message.type === 'system';
  const isCallMessage = message.type === 'call';
  const isSentByCurrentUser = !isSystemMessage && message.senderId === currentUser?.id;
  const sender = selectedChat?.users?.find((user: User) => user.id === message.senderId) || 
                (selectedChat?.otherUser?.id === message.senderId ? selectedChat.otherUser : null);
  // Maintain local sender name state so we can fetch on demand if not present in selectedChat (common when pagination loads older msgs before user list is hydrated)
  const [senderName, setSenderName] = useState<string | null>(sender?.name || null);

  useEffect(() => {
    // If this is a received group chat message and we still don't have the sender's name, fetch it
    if (selectedChat?.isGroupChat && !isSentByCurrentUser && !isSystemMessage) {
      if (!senderName || senderName === 'Unknown User') {
        if (sender?.name) {
          setSenderName(sender.name);
        } else if (message.senderId) {
          let cancelled = false;
          (async () => {
            try {
              const profile = await getUserProfile(message.senderId);
              if (!cancelled) {
                setSenderName(profile?.name || 'Unknown User');
              }
            } catch (e) {
              if (!cancelled) setSenderName('Unknown User');
            }
          })();
          return () => { cancelled = true; };
        }
      }
    }
  }, [selectedChat?.isGroupChat, isSentByCurrentUser, isSystemMessage, sender?.name, senderName, message.senderId]);
  
  // Define specific types for message status
  type MessageStatus = 'sent' | 'delivered' | 'seen' | null;
  
  // Check if message was deleted for everyone
  const isDeletedForEveryone = message.deletedForEveryone === true;

  // State for tracking which messages have their timestamps visible
  const [isTimestampVisible, setIsTimestampVisible] = useState<boolean>(false);
  // State for tracking which message has the dropdown open
  const [showDropdown, setShowDropdown] = useState<boolean>(false);  // --- Reaction click handler must be declared first ---
  const handleReactionClick = async (e: React.MouseEvent | React.TouchEvent) => {
    // Prevent desktop (mouse) events from triggering implicit reactions
    if (!isMobileView) return;
    // Only proceed for touch-based interactions
    const isTouch = 'touches' in e || 'changedTouches' in e;
    if (!isTouch) return;
    e.stopPropagation();
    e.preventDefault();
    if (!currentUser || isDeletedForEveryone) return;
    try {
      const hasReacted = message.reactions && message.reactions[currentUser.id];
      if (hasReacted) {
        await removeMessageReaction(message.id, currentUser.id);
      } else {
        // Create a temporary heart animation at pointer position when adding reaction
        const target = e.currentTarget as HTMLElement;
        const heart = document.createElement('div');
        heart.className = 'heart-pop-animation';
        heart.style.position = 'absolute';
        heart.style.zIndex = '10';
        heart.style.pointerEvents = 'none';
        
        // Position the heart near the click position
        const rect = target.getBoundingClientRect();
        // Since we already restrict to touch events on mobile, derive coords from touch lists
        let clientX = rect.left + rect.width / 2;
        let clientY = rect.top + rect.height / 2;
        const anyEvent: any = e;
        if (anyEvent.touches && anyEvent.touches.length > 0) {
          clientX = anyEvent.touches[0].clientX;
          clientY = anyEvent.touches[0].clientY;
        } else if (anyEvent.changedTouches && anyEvent.changedTouches.length > 0) {
          clientX = anyEvent.changedTouches[0].clientX;
          clientY = anyEvent.changedTouches[0].clientY;
        }
        const x = clientX - rect.left;
        const y = clientY - rect.top;
        heart.style.left = `${x}px`;
        heart.style.top = `${y}px`;
        
        // Add the heart content - always green to match the reaction display
        heart.innerHTML = '<span class="material-icons text-green-500" style="font-size: 20px;">favorite</span>';
        target.appendChild(heart);
        
        // Remove after animation completes
        setTimeout(() => {
          if (heart.parentNode) {
            heart.parentNode.removeChild(heart);
          }
        }, 600);
        
        await addMessageReaction(message.id, currentUser.id, 'heart');
      }
    } catch (error) {
      console.error('Error toggling reaction:', error);
    }
  };

  // Prepare reactions array from message.reactions
  const reactions = message.reactions ? Object.values(message.reactions) : [];

  // --- Long press and touch state must be declared before double-tap handler ---
  const [longPressTimer, setLongPressTimer] = useState<NodeJS.Timeout | null>(null);
  const [touchStartTime, setTouchStartTime] = useState<number>(0);
  // Add tap suppression flags
  const tapSuppressedRef = useRef(false);
  const longPressActiveRef = useRef(false);

  // --- Double-tap detection for mobile reaction trigger ---
  const lastTapRef = useRef<number>(0);
  const doubleTapTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // --- Mobile touch logic ---
  // For mobile, we need to distinguish between single tap, double tap, and long press
  // We'll use a timer for single tap, and cancel it if double-tap or long-press is detected
  const singleTapTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const DOUBLE_TAP_DELAY = 300; // ms

  // Mobile touch end handler
  const handleTouchEnd = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (isDeletedForEveryone || isSystemMessage) return;
    // Only allow mobile view to process touch-based double tap reactions
    if (!isMobileView) return;
    
    // If long press was active, don't do anything else
    if (longPressActiveRef.current) {
      longPressActiveRef.current = false;
      tapSuppressedRef.current = true;
      return;
    }

    const now = Date.now();
    
    // Double-tap detection - check if this is a second tap within the window
    if (lastTapRef.current && now - lastTapRef.current < DOUBLE_TAP_DELAY) {
      // This is a confirmed double tap - cancel any pending single tap or long press action
      if (singleTapTimeoutRef.current) {
        clearTimeout(singleTapTimeoutRef.current);
        singleTapTimeoutRef.current = null;
      }
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        setLongPressTimer(null);
      }
      
      // Reset tap tracking
      lastTapRef.current = 0;
      
      // Mark that we're handling this as a double tap, not a single tap
      tapSuppressedRef.current = true;
      
      // Clear any other double tap detection timeout
      if (doubleTapTimeoutRef.current) {
        clearTimeout(doubleTapTimeoutRef.current);
        doubleTapTimeoutRef.current = null;
      }
      
  // Previously auto-added a heart reaction on double tap; disabled to avoid pre-selecting reaction.
  return;
    }
    
    // This is a first tap or a tap outside the double-tap window
    // Store the tap time for potential double-tap detection
    lastTapRef.current = now;
    
    // Clear any existing double tap detection timeout
    if (doubleTapTimeoutRef.current) {
      clearTimeout(doubleTapTimeoutRef.current);
    }
    
    // Set a timer to reset the last tap time after the double-tap window closes
    doubleTapTimeoutRef.current = setTimeout(() => {
      lastTapRef.current = 0;
    }, DOUBLE_TAP_DELAY + 50);
    
    // Schedule a single-tap action (show timestamp) after the double-tap window closes
    if (!singleTapTimeoutRef.current && !tapSuppressedRef.current) {
      singleTapTimeoutRef.current = setTimeout(() => {
        // Only execute if no double-tap or long-press occurred
        if (!tapSuppressedRef.current) {
          setIsTimestampVisible(prev => !prev);
        }
        tapSuppressedRef.current = false;
        singleTapTimeoutRef.current = null;
      }, DOUBLE_TAP_DELAY + 10);
    }
    
    // Clean up long press timer
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }
    
    // Swipe-to-reply logic (unchanged)
    const touchDuration = Date.now() - touchStartTime;
    if (touchDuration < 500 && touchStartXRef.current !== null) {
      const touch = e.changedTouches[0];
      const swipeDistance = touchStartXRef.current - touch.clientX;
      if (swipeDistance > 50) {
        onAction('reply', message);
      }
    }
  }, [isDeletedForEveryone, handleReactionClick, longPressTimer, touchStartTime, touchStartXRef, onAction, message, DOUBLE_TAP_DELAY]);

  // Mobile touch start handler
  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>): void => {
    if (isDeletedForEveryone || isSystemMessage) return;
    if (!isMobileView) return; // restrict to mobile
    
    // Reset state at the beginning of a new touch
    tapSuppressedRef.current = false;
    longPressActiveRef.current = false;
    
    // Store the touch start position for potential swipe detection
    touchStartXRef.current = e.touches[0].clientX;
    setTouchStartTime(Date.now());
    
    // Cancel any existing single tap timer to avoid unwanted actions
    if (singleTapTimeoutRef.current) {
      clearTimeout(singleTapTimeoutRef.current);
      singleTapTimeoutRef.current = null;
    }
    
    // Start long press timer
    const timer = setTimeout(() => {
      // Mark that a long press occurred
      longPressActiveRef.current = true;
      tapSuppressedRef.current = true;
      
      // Cancel any pending single tap or double tap action
      if (singleTapTimeoutRef.current) {
        clearTimeout(singleTapTimeoutRef.current);
        singleTapTimeoutRef.current = null;
      }
      if (doubleTapTimeoutRef.current) {
        clearTimeout(doubleTapTimeoutRef.current);
        doubleTapTimeoutRef.current = null;
      }
      
      // Only show the action sheet, do not trigger reply automatically
      showMobileActionSheet(message);
    }, 500); // 500ms for long press
    
    setLongPressTimer(timer);
  }, [message, showMobileActionSheet, isDeletedForEveryone]);

  // Mobile touch move cancels long press
  const handleTouchMove = useCallback((e: React.TouchEvent<HTMLDivElement>): void => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }
  }, [longPressTimer]);

  // Desktop single-click disabled per request (no action)

  // --- Desktop right-click handler ---
  const handleDesktopRightClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isSystemMessage && !isDeletedForEveryone) {
      setShowDropdown(true);
    }
  }, [isSystemMessage, isDeletedForEveryone]);
  // handleDesktopDoubleClick function removed - double-click reaction feature removed
  // Context menu handling has been replaced by the MessageDropdown component

  // Memoized format message time helper
  const formatMessageTime = useCallback((timestamp: Timestamp): string => {
    try {
      if (!timestamp || !(timestamp instanceof Timestamp)) return '';
      const date = timestamp.toDate();
      const now = new Date();
      // Calculate time difference in seconds
      const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
      if (diffInSeconds < 60) {
        return 'just now';
      }
      
      // Get the relative time format from date-fns
      return formatDistanceToNow(date, { addSuffix: true })
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
      console.error('Error formatting time:', error);
      return '';
    }
  }, []);

  // Memoized get message status helper with proper typing
  const getMessageStatus = useCallback((msg: IMessage): MessageStatus => {
    if (msg.senderId !== currentUser?.id) return null;
    if (msg.readBy && msg.readBy.includes(currentUser.id) && msg.readBy.length > 1) return 'seen';
    if (msg.status === 'delivered') return 'delivered';
    if (msg.status === 'sent') return 'sent';
    return null;
  }, [currentUser?.id]);

  // Get reply message content in Message component
  const getRepliedMessageContent = useCallback((replyId: string): string => {
    // Find the message being replied to
    const repliedMessage = messages.find(msg => msg.id === replyId);
    if (!repliedMessage) return "Original message not found";
    
    // Return a truncated version if it's too long
    if (repliedMessage.content.length > 50) {
      return repliedMessage.content.substring(0, 50) + '...';
    }
    
    return repliedMessage.content;
  }, [messages]);

  // Toggle timestamp visibility when user clicks on a message
  const handleToggleTimestamp = () => {
    setIsTimestampVisible(prev => !prev);
  };

  // Check if this is the last message in the conversation
  const isLastMessage = (msg: IMessage): boolean => {
    const lastMessage = messages[messages.length - 1];
    return lastMessage && lastMessage.id === msg.id;
  };
  return (
    <div
      id={`message-${message.id}`}
      className={`flex mb-4 group relative px-4 w-full ${
        isPinned 
          ? 'bg-gradient-to-r from-green-900/10 to-transparent py-3 mt-1 rounded-l-md border-l-2 border-green-500/50' 
          : ''
      } ${
        reactions.length > 0 
          ? 'mb-3 pb-3' // Reduced extra bottom space for reactions
          : 'mb-8'
      }`}
      {...(!isSystemMessage && !isDeletedForEveryone && isMobileView ? {
        onTouchStart: handleTouchStart,
        onTouchEnd: handleTouchEnd,
        onTouchMove: handleTouchMove,
      } : !isSystemMessage && !isDeletedForEveryone && !isMobileView ? {
        // Desktop click intentionally does nothing; keep right-click for menu
        onContextMenu: handleDesktopRightClick,
      } : {})}
      tabIndex={isSystemMessage ? -1 : 0}
      aria-label={isSystemMessage ? 'System message' : isSentByCurrentUser ? 'Your message' : `${sender?.name || 'User'}'s message`}
    >
      {isPinned && (
        <div className="absolute -top-3 left-1 flex items-center gap-1 z-10">
          <span className="material-icons text-green-500 text-base">push_pin</span>
          <span className="text-xs text-green-400 font-semibold bg-[#181f1a]/80 px-2 py-0.5 rounded shadow-sm">Pinned</span>
        </div>
      )}          <div className={`flex ${isSystemMessage ? 'justify-center' : isSentByCurrentUser ? 'justify-end' : 'justify-start'} w-full`}>
        <div className={`flex flex-col ${isSystemMessage ? 'items-center' : isSentByCurrentUser ? 'items-end' : 'items-start'} w-full`}>
          <div className={`flex flex-col ${isSystemMessage ? 'items-center w-full' : isSentByCurrentUser ? 'items-end' : 'items-start'} ${isSystemMessage ? '' : 'w-fit max-w-[75%] sm:max-w-[50%]'}`}>
            {message.replyTo && (
              <div className={`reply-bubble text-xs text-gray-400 px-3 py-1.5 rounded-t-lg mx-0.5 ${
                isSentByCurrentUser ? getThemeStylesByKey(selectedChat?.theme ?? undefined).tint : 'bg-gray-800/50'
              }`}>
                <div className="truncate">
                  Replying to: {getRepliedMessageContent(message.replyTo)}
                </div>
              </div>
            )}            <div className={`message-bubble-wrapper group relative ${(isTimestampVisible || isLastMessage(message)) ? (reactions.length > 0 && !isDeletedForEveryone && !isSystemMessage ? 'pb-3' : 'pb-3') : (reactions.length > 0 && !isDeletedForEveryone && !isSystemMessage ? 'pb-3' : '')} ${isSentByCurrentUser ? 'sent-message' : 'received-message'}`}>              {/* Desktop-only reaction bar that appears above message bubble on right-click */}
              {!isMobileView && !isSystemMessage && !isDeletedForEveryone && (
                <MessageDropdown
                  message={message}
                  isSentByCurrentUser={isSentByCurrentUser}
                  currentUser={currentUser}
                  onAction={(action) => onAction(action, message)}
                  showDropdown={showDropdown}
                  onCloseDropdown={() => setShowDropdown(false)}
                />
              )}
              {/* Show sender name for group chats and messages not sent by current user */}
              {selectedChat?.isGroupChat && !isSentByCurrentUser && !isSystemMessage && showSenderName && (
                <div className="text-xs text-green-400 font-medium mb-1 ml-1">
                  {senderName || sender?.name || 'Unknown User'}
                </div>
              )}
              <div 
                className={`group relative overflow-hidden ${
                  message.replyTo ? 'rounded-tr-lg' : 'rounded-t-lg'
                } ${
                  isDeletedForEveryone
                    ? 'bg-red-900/20 text-gray-400 italic border border-red-900/30'
                    : isSystemMessage
                      ? message.content.startsWith('Call —')
                        ? 'bg-gray-800/60 text-gray-300 border border-gray-600/30 mx-auto w-fit max-w-lg rounded-xl shadow-inner'
                        : message.content.includes('was removed from the group')
                          ? 'bg-red-500/10 text-red-300 border border-red-500/20 mx-auto w-full max-w-md rounded-lg shadow-inner'
                          : 'bg-green-500/10 text-green-300 border border-green-500/20 mx-auto w-full max-w-md rounded-lg shadow-inner'
                    : message.forwardedFrom
                      ? isSentByCurrentUser 
                        ? `bg-gradient-to-r ${getThemeStylesByKey(selectedChat?.theme ?? undefined).forwardedFrom} ${getThemeStylesByKey(selectedChat?.theme ?? undefined).forwardedTo} text-white rounded-l-lg rounded-br-none ml-auto border-l-4 ${getThemeStylesByKey(selectedChat?.theme ?? undefined).border}` 
                        : 'bg-[#1e1e1e] text-white rounded-r-lg rounded-bl-none mr-auto border-l-4 border-blue-400'
                      : isSentByCurrentUser 
                        ? `bg-gradient-to-r ${getThemeStylesByKey(selectedChat?.theme ?? undefined).from} ${getThemeStylesByKey(selectedChat?.theme ?? undefined).to} text-white rounded-l-lg rounded-br-none ml-auto` 
                        : 'bg-[#1e1e1e] text-white rounded-r-lg rounded-bl-none mr-auto'
                } px-3.5 py-2 shadow-sm min-w-[40px] rounded-lg select-none`}
                style={{ userSelect: 'none' }}
              >
                <div className={`whitespace-pre-wrap break-words overflow-wrap-anywhere overflow-hidden ${
                  isSystemMessage
                    ? message.content.startsWith('Call —')
                      ? 'text-center text-xs'
                      : 'text-center font-medium text-base sm:text-sm'
                    : 'text-base sm:text-sm'
                }`}>
                  {isDeletedForEveryone ? (
                    <div className="flex items-center gap-1.5">
                      <span className="material-icons text-red-400/80 text-sm">delete</span>
                      <span>This message was deleted</span>
                    </div>
                  ) : isSystemMessage ? (
                    message.content.startsWith('Call —') ? (
                      <div className="flex items-center justify-center gap-2 py-0.5 px-1">
                        <span className="material-icons text-gray-400 text-base flex-shrink-0">videocam</span>
                        <span className="text-gray-300">{message.content}</span>
                      </div>
                    ) : (
                    <div className="flex items-center justify-center gap-2">
                      {message.content.includes('was removed from the group') ? (
                        <span className="material-icons text-red-400 text-sm">person_remove</span>
                      ) : (
                        <span className="material-icons text-green-400 text-sm">person_add</span>
                      )}
                      <span>{message.content}</span>
                    </div>
                    )
                  ) : isCallMessage ? (
                    <div className="flex items-center justify-center gap-2">
                      <span className="material-icons text-emerald-400 text-sm">videocam</span>
                      <span className="font-medium">{message.content}</span>
                    </div>
                  ) : (
                    <>
                      {message.forwardedFrom && (
                        <div className="flex items-center text-xs text-green-400 mb-2 font-medium">
                          <span className="material-icons text-green-400 text-sm mr-1">forward</span>
                          <span>Forwarded message</span>
                        </div>
                      )}
                      {/* Main text content - always display message text above attachments when present */}
                      {message.content && (
                        <div>{message.content}{message.edited && (<span className="ml-1.5 text-[10px] opacity-70">(edited)</span>)}</div>
                      )}

                      {/* Attachments rendering - grid based for images/videos (PostCard-like) */}
                      {message.attachments && message.attachments.length > 0 && (
                        <>
                          {/* Divider between text content and attachments when both exist */}
                          {message.content && (
                            <div className="my-2 border-t border-gray-700/30" />
                          )}
                          {(() => {
                            const mediaItems: string[] = message.attachments || [];
                            const videoItems = mediaItems.filter((u) => !!u.match(/\.(mp4|webm|ogg|mov|m4v)(\?|$)/i));
                            const imageItems = mediaItems.filter((u) => !!u.match(/\.(jpg|jpeg|png|gif|webp|avif|bmp)(\?|$)/i));
                            const imageUrls = imageItems.slice().filter(Boolean);

                            // Single video (and no images) -> full width video
                            if (videoItems.length === 1 && imageItems.length === 0 && mediaItems.length === 1) {
                              const url = videoItems[0];
                              return (
                                <div className="relative rounded-xl overflow-hidden bg-gray-800/60 border border-gray-700/40 w-full shadow aspect-video min-h-[180px] max-h-[260px] sm:min-h-[240px] sm:max-h-96 flex items-center justify-center" onClick={(e) => { e.stopPropagation(); openVideoPreview && openVideoPreview(url); }} style={{ cursor: 'pointer' }}>
                                  <video src={url} controls className="w-full h-full object-cover rounded" />
                                </div>
                              );
                            }

                            // Image-based layouts
                            if (imageItems.length === 1) {
                              const url = imageItems[0];
                              return (
                                <div key={url} className="relative rounded-xl overflow-hidden bg-gray-800/60 border border-gray-700/40 shadow" onClick={(e) => { e.stopPropagation(); openImagePreview && openImagePreview(imageUrls, 0); }} style={{ cursor: 'pointer' }}>
                                  <img src={url} alt="attachment" className="w-full h-auto max-h-96 object-cover rounded" loading="lazy" />
                                </div>
                              );
                            } else if (imageItems.length === 2) {
                              return (
                                <div className="grid grid-cols-2 gap-2">
                                  {imageItems.map((url, index) => (
                                    <div key={index} className="relative rounded-xl overflow-hidden bg-gray-800/60 border border-gray-700/40 shadow aspect-square" onClick={(e) => { e.stopPropagation(); openImagePreview && openImagePreview(imageUrls, index); }} style={{ cursor: 'pointer' }}>
                                      <img src={url} alt={`attachment-${index}`} className="w-full h-full object-cover rounded" loading="lazy" />
                                    </div>
                                  ))}
                                </div>
                              );
                            } else if (imageItems.length === 3) {
                              return (
                                <div className="grid grid-cols-2 grid-rows-2 gap-2 aspect-[4/3] w-full">
                                  <div onClick={(e) => { e.stopPropagation(); openImagePreview && openImagePreview(imageUrls, 0); }} key={imageItems[0]} className="relative rounded-xl overflow-hidden bg-gray-800/60 border border-gray-700/40 shadow row-span-2" style={{ position: 'relative', cursor: 'pointer' }}>
                                    <img src={imageItems[0]} alt="attachment-0" className="absolute inset-0 w-full h-full object-cover rounded" style={{ position: 'absolute', inset: 0 }} loading="lazy" />
                                  </div>
                                  <div onClick={(e) => { e.stopPropagation(); openImagePreview && openImagePreview(imageUrls, 1); }} key={imageItems[1]} className="relative rounded-xl overflow-hidden bg-gray-800/60 border border-gray-700/40 shadow" style={{ position: 'relative', cursor: 'pointer' }}>
                                    <img src={imageItems[1]} alt="attachment-1" className="absolute inset-0 w-full h-full object-cover rounded" style={{ position: 'absolute', inset: 0 }} loading="lazy" />
                                  </div>
                                  <div onClick={(e) => { e.stopPropagation(); openImagePreview && openImagePreview(imageUrls, 2); }} key={imageItems[2]} className="relative rounded-xl overflow-hidden bg-gray-800/60 border border-gray-700/40 shadow" style={{ position: 'relative', cursor: 'pointer' }}>
                                    <img src={imageItems[2]} alt="attachment-2" className="absolute inset-0 w-full h-full object-cover rounded" style={{ position: 'absolute', inset: 0 }} loading="lazy" />
                                  </div>
                                </div>
                              );
                            } else if (imageItems.length >= 4) {
                              const displayItems = imageItems.slice(0, 4);
                              const remainingCount = imageItems.length - 4;
                              return (
                                <div className="grid grid-cols-2 gap-2">
                                  {displayItems.map((url, index) => {
                                    const isLastItem = index === 3;
                                      return (
                                        <div key={index} className="relative rounded-xl overflow-hidden bg-gray-800/60 border border-gray-700/40 shadow aspect-square" onClick={(e) => { e.stopPropagation(); openImagePreview && openImagePreview(imageUrls, index); }} style={{ cursor: 'pointer' }}>
                                          <img src={url} alt={`attachment-${index}`} className="w-full h-full object-cover rounded" loading="lazy" />
                                          {isLastItem && remainingCount > 0 && (
                                            <div className="absolute inset-0 bg-black/50 flex items-center justify-center pointer-events-none">
                                              <span className="text-white font-semibold text-lg">+{remainingCount} more</span>
                                            </div>
                                          )}
                                        </div>
                                      );
                                  })}
                                </div>
                              );
                            }

                            // Mixed media or non-image attachments: fall back to a responsive grid
                            return (
                              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {mediaItems.map((url, i) => {
                                  try {
                                    const lower = (url || '').split('?')[0].toLowerCase();
                                    const isImg = /\.(png|jpe?g|gif|webp|avif|bmp|jff|jfif)$/.test(lower) || lower.includes('/image');
                                    const isVid = /\.(mp4|webm|ogg|mov|m4v)$/.test(lower) || lower.includes('/video');
                                    const isAudio = /\.(mp3|wav|m4a|ogg)$/.test(lower) || lower.includes('/audio');

                                    if (isImg) {
                                      return (
                                        <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="relative rounded-xl overflow-hidden bg-gray-800/60 border border-gray-700/40 shadow aspect-square">
                                          <img src={url} alt={`attachment-${i}`} className="w-full h-full object-cover rounded cursor-pointer" loading="lazy" />
                                        </a>
                                      );
                                    }

                                    if (isVid) {
                                      return (
                                        <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="relative rounded-xl overflow-hidden bg-gray-800/60 border border-gray-700/40 shadow aspect-video flex items-center justify-center">
                                          <video src={url} className="w-full h-full object-cover rounded cursor-pointer" />
                                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                            <span className="material-icons text-white/90">play_circle</span>
                                          </div>
                                        </a>
                                      );
                                    }

                                    if (isAudio) {
                                      return (
                                        <div key={i} className="w-full rounded-lg overflow-hidden border border-gray-700 bg-gray-900 p-2">
                                          <audio controls src={url} className="w-full" />
                                        </div>
                                      );
                                    }

                                    // File chip fallback (reuse previous file chip behavior)
                                    const originalName = (url.split('?')[0].split('/').pop() || `attachment-${i + 1}`);
                                    const decodedSegment = decodeURIComponent(originalName);
                                    let fileName = decodedSegment.includes('/') ? decodedSegment.split('/').pop() || decodedSegment : decodedSegment;
                                    // Remove common storage prefixes added during upload: timestamp_ and uuid_
                                    // Example stored name: "1692961234567_550e8400-e29b-41d4-a716-446655440000_myfile.pdf"
                                    // First remove a leading timestamp segment like "1692961234567_"
                                    fileName = fileName.replace(/^\d+_/, '');
                                    // Then remove a leading UUID segment like "550e8400-e29b-41d4-a716-446655440000_" if present
                                    fileName = fileName.replace(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}_/, '');
                                    const ext = (fileName.split('.').pop() || '').toLowerCase();
                                    let iconUrl = 'https://cdn-icons-png.flaticon.com/512/337/337946.png';
                                    if (ext === 'pdf') iconUrl = 'https://cdn-icons-png.flaticon.com/512/337/337946.png';
                                    else if (ext === 'doc' || ext === 'docx') iconUrl = 'https://cdn-icons-png.flaticon.com/512/337/337932.png';
                                    else if (ext === 'xls' || ext === 'xlsx' || ext === 'csv') iconUrl = 'https://cdn-icons-png.flaticon.com/512/4725/4725976.png';
                                    else if (ext === 'ppt' || ext === 'pptx') iconUrl = 'https://cdn-icons-png.flaticon.com/512/337/337932.png';
                                    else if (ext === 'txt') iconUrl = 'https://cdn-icons-png.flaticon.com/512/3022/3022503.png';
                                    else if (ext === 'zip' || ext === 'rar') iconUrl = 'https://cdn-icons-png.flaticon.com/512/9704/9704802.png';

                                    const fileBase = fileName.split('.').slice(0, -1).join('.') || fileName;
                                    const fileExt = (fileName.split('.').pop() || '').toUpperCase();

                                    return (
                                      <a
                                        key={i}
                                        href={url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={(e) => { e.stopPropagation(); }}
                                        className="flex items-center bg-gray-800 border border-gray-700 rounded-lg shadow px-3 py-2 my-1 min-w-0 max-w-xs transition-colors group text-white hover:text-green-100"
                                        style={{ height: '2.5rem', maxWidth: '100%' }}
                                        title={fileName}
                                      >
                                        <span className="flex-shrink-0 mr-2">
                                          <img src={iconUrl} alt={ext} className="h-6 w-6" style={{ minWidth: 24, minHeight: 24 }} />
                                        </span>
                                        <span className="flex flex-col min-w-0">
                                          {/* Show cleaned filename (including extension) so users see the real file name and not the whole URL */}
                                          <span className="truncate text-xs font-semibold group-hover:text-green-300" style={{ maxWidth: '180px', color: 'inherit' }}>{fileName}</span>
                                        </span>
                                      </a>
                                    );
                                  } catch (err) {
                                    return null;
                                  }
                                })}
                              </div>
                            );
                          })()}
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>                {/* Reaction display */}
                {/* Timestamp and Status Indicator - anchored bottom-right above reactions */}
                {!isSystemMessage && (isTimestampVisible || isLastMessage(message)) && (
                  <div className={`absolute text-[10px] text-gray-400 flex items-center gap-1.5 px-0.5 leading-none whitespace-nowrap right-1 justify-end text-right ${reactions.length > 0 && !isDeletedForEveryone ? 'bottom-[-20px]' : 'bottom-[-3px]'}`}>
                    <span>{message.createdAt instanceof Timestamp ? formatMessageTime(message.createdAt) : ''}</span>
                    {!isDeletedForEveryone && isSentByCurrentUser && getMessageStatus(message) && (
                      <span className={`flex items-center gap-0.5 ${(message as LocalMessage).localStatus === 'failed' ? 'text-red-400' : 'text-green-400'}`}>
                        {(message as LocalMessage).localStatus === 'failed' && (
                          <span className="material-icons text-xs">error_outline</span>
                        )}
                        {getMessageStatus(message)}
                      </span>
                    )}
                  </div>
                )}

                {reactions.length > 0 && !isDeletedForEveryone && !isSystemMessage && (
                  <div 
                    className="message-reaction-capsule absolute right-[-4px] bottom-[-6px] z-10 cursor-pointer"
                    onClick={async () => {
                      try {
                        const chatUsers = selectedChat?.users || [];
                        const reactionsWithUsersPromises = reactions.map(async (r) => {
                          let user = chatUsers.find((u) => u.id === r.userId);
                          if (!user && r.userId) {
                            try {
                              const { getUserProfile } = await import('../../../services/userService');
                              const userProfile = await getUserProfile(r.userId);
                              if (userProfile) {
                                user = userProfile;
                              }
                            } catch (error) {
                              console.error("Failed to fetch user profile:", error);
                            }
                          }
                          return {
                            user: user || null,
                            timestamp: r.timestamp,
                            displayName: user?.name || (r.userId ? `User (${r.userId.substring(0, 5)}...)` : 'Unknown User'),
                            type: r.type
                          };
                        });
                        const reactionsWithUsers = await Promise.all(reactionsWithUsersPromises);
                        setSelectedReactions(reactionsWithUsers);
                        setShowReactionDetails(true);
                      } catch (error) {
                        console.error("Error preparing reaction details:", error);
                      }
                    }}
                    style={{ minWidth: 32, height: 22, padding: '0 8px', display: 'flex', alignItems: 'center', borderRadius: 9999, background: 'linear-gradient(90deg, #4ade80, #34d399)', boxShadow: '0 2px 8px #0008', border: '2px solid #18181b' }}
                  >
                    {/* Show up to 3 distinct reaction types so mixed reactions are visible correctly. */}
                    {Array.from(new Set(reactions.map((r: any) => r?.type).filter(Boolean))).slice(0, 3).map((type, idx) => (
                      <img
                        key={`reaction-chip-${type}-${idx}`}
                        src={reactionEmojiMap[type] || reactionEmojiMap['heart']}
                        alt={type}
                        className={`w-4 h-4 select-none ${idx > 0 ? '-ml-1' : ''}`}
                        style={{ userSelect: 'none', display: 'inline-block', verticalAlign: 'middle' }}
                      />
                    ))}
                    <span className="ml-1 text-[11px] text-white font-bold select-none" style={{ userSelect: 'none' }}>{reactions.length}</span>
                  </div>
                )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// The ContextMenu has been replaced by MessageDropdown which attaches directly to each message

export default Message;
