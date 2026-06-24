import React, { useEffect, useRef } from 'react';
import { ChatWithDetails } from '../services/messageService';
import { User } from '../contexts/AuthContext';

type ChatContextMenuProps = {
  position: { x: number; y: number } | null;
  chat: ChatWithDetails | null;
  currentUser: User | null;
  onClose: () => void;
  onArchive: (chat: ChatWithDetails) => void;
  onDelete: (chat: ChatWithDetails) => void;
  onBlock: (chat: ChatWithDetails) => void;
  onShowDeleteDialog: (chat: ChatWithDetails) => void;
  isBlocked?: boolean;
};

const ChatContextMenu: React.FC<ChatContextMenuProps> = ({
  position,
  chat,
  currentUser,
  onClose,
  onArchive,
  onDelete,
  onBlock,
  onShowDeleteDialog,
  isBlocked = false
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  // Close menu when pressing Escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);  if (!position || !chat) return null;

  // Check if current chat is a group chat (for block option)
  const isGroupChat = chat.isGroupChat === true;
  // Check if chat is already archived for current user
  const isArchived = chat?.archived?.[currentUser?.id || ''] === true;

  return (
    <div
      ref={menuRef}
      className="fixed z-[100] bg-[#1e1e1e] border border-gray-700 rounded-lg shadow-xl py-1 min-w-[180px] animate-fadeIn"
      style={{
        top: `${position.y}px`,
        left: `${position.x}px`,
      }}
    >
      <button
        className="w-full text-left px-4 py-2.5 hover:bg-[#2a2a2a] flex items-center gap-3 text-gray-100 transition-all duration-200 hover:pl-5"
        onClick={() => {
          onArchive(chat);
          onClose();
        }}
      >
        <span className="material-icons text-gray-400 text-[20px] transition-colors duration-200">
          {isArchived ? 'unarchive' : 'archive'}
        </span>
        <span className="font-medium">{isArchived ? 'Unarchive chat' : 'Archive chat'}</span>
      </button>
      <button
        className="w-full text-left px-4 py-2.5 hover:bg-[#2a2a2a] flex items-center gap-3 text-red-400 transition-all duration-200 hover:pl-5"
        onClick={() => {
          onShowDeleteDialog(chat);
          onClose();
        }}
      >
        <span className="material-icons text-red-400 text-[20px] transition-colors duration-200">delete</span>
        <span className="font-medium">Delete chat</span>
      </button>
      {!isGroupChat && (
        <button
          className="w-full text-left px-4 py-2.5 hover:bg-[#2a2a2a] flex items-center gap-3 text-orange-400 transition-all duration-200 hover:pl-5"
          onClick={() => {
            onBlock(chat);
            onClose();
          }}
        >
          <span className="material-icons text-orange-400 text-[20px] transition-colors duration-200">
            {isBlocked ? 'person' : 'block'}
          </span>
          <span className="font-medium">{isBlocked ? 'Unblock user' : 'Block user'}</span>
        </button>
      )}
    </div>
  );
};

export default ChatContextMenu;
