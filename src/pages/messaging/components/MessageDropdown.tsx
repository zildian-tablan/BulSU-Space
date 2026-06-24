import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { addMessageReaction, removeMessageReaction } from '../../../services/messageService';
import type { MessageAction, MessageDropdownProps } from '../types';

const MessageDropdown: React.FC<MessageDropdownProps> = ({
  message,
  isSentByCurrentUser,
  currentUser,
  onAction,
  showDropdown,
  onCloseDropdown,
}) => {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [showMenu, setShowMenu] = useState(false);

  const handleToggle = () => {
    setShowMenu(!showMenu);
  };

  const handleReaction = async (reactionType: string) => {
    if (!currentUser || message.deletedForEveryone === true) return;
    try {
      const existing = message.reactions && message.reactions[currentUser.id];
      const existingType = existing ? existing.type : undefined;

      if (existingType === reactionType) {
        await removeMessageReaction(message.id, currentUser.id);
      } else {
        await addMessageReaction(message.id, currentUser.id, reactionType);
      }

      setShowMenu(false);
      onCloseDropdown();
    } catch (error) {
      console.error('Error toggling reaction:', error);
    }
  };

  useEffect(() => {
    if (!showMenu && !showDropdown) return;

    function handleClickOutside(event: MouseEvent): void {
      const target = event.target as Node;
      const clickedInsideDropdown = dropdownRef.current && dropdownRef.current.contains(target);
      const clickedInsideMenu = menuRef.current && menuRef.current.contains(target);
      if (clickedInsideDropdown || clickedInsideMenu) return;

      if (showMenu) setShowMenu(false);
      if (showDropdown) onCloseDropdown();
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMenu, showDropdown, onCloseDropdown]);

  const handleItemClick = (action: MessageAction) => {
    onAction(action);
    setShowMenu(false);
  };

  const isDeletedForEveryone = message.deletedForEveryone === true;

  const menuItems = [
    {
      action: 'reply' as MessageAction,
      icon: 'reply',
      label: 'Reply',
      color: 'text-white',
    },
    ...(!isDeletedForEveryone
      ? [
          {
            action: 'copy' as MessageAction,
            icon: 'content_copy',
            label: 'Copy text',
            color: 'text-white',
          },
          {
            action: 'forward' as MessageAction,
            icon: 'forward',
            label: 'Forward',
            color: 'text-white',
          },
        ]
      : []),
    ...(message.senderId === currentUser?.id
      ? [
          {
            action: 'edit' as MessageAction,
            icon: 'edit',
            label: 'Edit',
            color: 'text-white',
          },
          {
            action: 'delete' as MessageAction,
            icon: 'delete_forever',
            label: 'Delete',
            color: 'text-red-500',
          },
        ]
      : [
          {
            action: 'delete-for-me' as MessageAction,
            icon: 'delete',
            label: 'Delete for me',
            color: 'text-red-500',
          },
        ]),
    {
      action: 'pin' as MessageAction,
      icon: 'push_pin',
      label: message.isPinned ? 'Unpin' : 'Pin',
      color: message.isPinned ? 'text-green-400' : 'text-white',
    },
  ];

  const reactionOptions = [
    { type: 'heart', label: 'Heart', img: '/images/emoji/heart.png' },
    { type: 'haha', label: 'Haha', img: '/images/emoji/haha.png' },
    { type: 'love', label: 'Love', img: '/images/emoji/love.png' },
    { type: 'sob', label: 'Sob', img: '/images/emoji/sob.png' },
    { type: 'sad', label: 'Sad', img: '/images/emoji/sad.png' },
    { type: 'angry', label: 'Angry', img: '/images/emoji/angry.png' },
  ];

  const userReactionType = currentUser ? message.reactions?.[currentUser.id]?.type : undefined;

  return (
    <div
      className={`absolute ${
        showDropdown ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      } transition-all duration-200 top-0 transform -translate-y-full z-10 ${
        isSentByCurrentUser ? 'right-0' : 'left-0'
      } flex flex-row items-center gap-2`}
      ref={dropdownRef}
    >
      <div
        className={`flex items-center gap-0.5 bg-[#1e1e1e] border border-gray-800 rounded-lg shadow-xl p-0.5 desktop-reaction-picker ${
          showDropdown ? 'desktop-reaction-show' : ''
        }`}
      >
        {reactionOptions.map((reaction) => {
          const selected = reaction.type === userReactionType;
          return (
            <button
              key={reaction.type}
              onClick={() => handleReaction(reaction.type)}
              className={`flex flex-col items-center focus:outline-none transition-all duration-200 ${
                selected ? '' : 'hover:scale-110'
              }`}
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
              tabIndex={0}
              aria-label={reaction.label + (selected ? ' (selected)' : '')}
              title={reaction.label + (selected ? ' (your reaction)' : '')}
            >
              <div
                className={`rounded-full flex items-center justify-center reaction-emoji-wrapper ${
                  selected ? 'bg-green-500/15 reaction-selected' : ''
                }`}
                style={{ background: 'transparent', overflow: 'hidden' }}
              >
                <img
                  src={reaction.img}
                  alt={reaction.label}
                  className="reaction-emoji object-cover"
                  style={{ display: 'block', borderRadius: '50%' }}
                />
              </div>
              <span
                className={`text-[7px] mt-0 text-center ${selected ? 'text-green-300' : 'text-gray-200'}`}
                style={{ fontWeight: 500 }}
              >
                {reaction.label}
              </span>
            </button>
          );
        })}

        <div className="w-px h-4 bg-gray-700 mx-0.5"></div>

        <div
          className="cursor-pointer hover:scale-105 transition-transform duration-200 pr-1"
          onClick={handleToggle}
          style={{ userSelect: 'none' }}
        >
          <span
            className="material-icons text-gray-300 hover:text-white text-xs cursor-pointer bg-gray-800/70 hover:bg-gray-700/90 rounded-full p-0.5 transition-all duration-200 shadow-md select-none"
            style={{ fontSize: '14px' }}
          >
            more_vert
          </span>
        </div>
      </div>

      {showMenu &&
        typeof document !== 'undefined' &&
        (() => {
          const rect = dropdownRef.current ? dropdownRef.current.getBoundingClientRect() : null;
          const top = rect ? rect.bottom + window.scrollY + 6 : undefined;
          const left = rect ? rect.left + window.scrollX : undefined;
          const style: React.CSSProperties = {
            position: 'absolute',
            zIndex: 99999,
            top,
            left,
            marginTop: '0px',
            display: 'flex',
            flexDirection: 'row',
            gap: '8px',
            justifyContent: 'center',
            alignItems: 'center',
            overflowX: 'auto',
            whiteSpace: 'nowrap',
            background: '#232323',
            boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
          };

          const menu = (
            <div
              ref={menuRef}
              className="z-[99999] bg-[#1e1e1e] border border-gray-800 rounded-xl shadow-xl py-1 px-0.5 min-w-[100px] animate-fadeIn reaction-menu-pop"
              style={style}
            >
              {menuItems.map((item) => (
                <button
                  key={item.action}
                  className="menu-option flex flex-col items-center justify-center p-0.5 rounded bg-transparent text-gray-300 hover:bg-[#2a2a2a] transition-all duration-150 focus:outline-none"
                  onClick={() => handleItemClick(item.action)}
                  style={{ minWidth: 0, background: 'transparent' }}
                >
                  <span className="material-icons menu-icon mb-0.5 text-gray-300" style={{ fontSize: 15 }}>
                    {item.icon}
                  </span>
                  <span
                    className="menu-label text-[8px] text-gray-300 font-medium text-center leading-tight"
                    style={{ maxWidth: 32, wordBreak: 'break-word' }}
                  >
                    {item.label}
                  </span>
                </button>
              ))}
            </div>
          );

          return createPortal(menu, document.body);
        })()}
    </div>
  );
};

export default MessageDropdown;
