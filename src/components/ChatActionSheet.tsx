import React, { useEffect } from 'react';
import { ChatWithDetails } from '../services/messageService';
import { User } from '../contexts/AuthContext';

type ChatActionProps = {
  chat: ChatWithDetails | null;
  currentUser: User | null;
  onClose: () => void;
  onArchive: (chat: ChatWithDetails) => void;
  onDelete: (chat: ChatWithDetails) => void;
  onBlock: (chat: ChatWithDetails) => void;
  onShowDeleteDialog: (chat: ChatWithDetails) => void;
  isBlocked?: boolean;
};

const ChatActionSheet: React.FC<ChatActionProps> = ({
  chat,
  currentUser,
  onClose,
  onArchive,
  onDelete,
  onBlock,
  onShowDeleteDialog,
  isBlocked = false
}) => {
  // Add effect to track mount/unmount - must be before early return
  useEffect(() => {
    console.log('🧩 ChatActionSheet MOUNTED with chat:', chat);
    if (chat) {
      console.log('🧩 ChatActionSheet MOUNTED for chat ID:', chat.id);
    } else {
      console.log('⚠️ ChatActionSheet MOUNTED but chat is null!');
    }
    return () => {
      console.log('🧩 ChatActionSheet UNMOUNTED');
      if (chat) console.log('🧩 ChatActionSheet UNMOUNTED for chat ID:', chat.id);
    };
  }, []);

  // Safety check - MUST be after hooks
  if (!chat) {
    console.error('⛔ ChatActionSheet received null chat object!');
    return null;
  }
    // Check if current chat is a group chat (for block option)
  const isGroupChat = chat.isGroupChat === true;
  // Check if chat is already archived for current user
  const isArchived = chat?.archived?.[currentUser?.id || ''] === true;
  
  console.log('✅ ChatActionSheet rendering successful for chat:', chat.id);
  
  const handleBackdropClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('🧩 ChatActionSheet backdrop clicked, calling onClose');
    if (typeof onClose === 'function') {
      onClose();
    } else {
      console.error('⛔ onClose is not a function:', onClose);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-end bg-black/70 backdrop-blur-sm action-sheet" onClick={handleBackdropClick}>
      <div 
        className="w-full bg-gradient-to-b from-[#1e1e1e] to-[#121212] rounded-t-2xl p-5 shadow-lg border-t border-gray-800/30"
        style={{
          maxHeight: 'calc(calc(var(--vh, 1vh) * 100) - env(safe-area-inset-bottom))',
          paddingBottom: 'env(safe-area-inset-bottom)'
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Drag indicator */}
        <div className="flex justify-center mb-3">
          <div className="w-10 h-1 bg-gray-600 rounded-full"></div>
        </div>
        
        <div className="space-y-2">
          <button
            className="w-full text-left px-4 py-3 flex items-center gap-3 text-white hover:bg-gradient-to-r hover:from-gray-800/40 hover:to-gray-700/20 rounded-xl transition-all duration-200"
            onClick={() => {
              onArchive(chat);
              onClose();
            }}
          >
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-amber-600/20 to-yellow-500/20 flex items-center justify-center">
              <span className="material-icons text-amber-400">
                {isArchived ? 'unarchive' : 'archive'}
              </span>
            </div>
            <span className="font-medium">{isArchived ? 'Unarchive chat' : 'Archive chat'}</span>
          </button>
          
          <button
            className="w-full text-left px-4 py-3 flex items-center gap-3 text-red-400 hover:bg-gradient-to-r hover:from-red-900/20 hover:to-red-800/10 rounded-xl transition-all duration-200"
            onClick={() => {
              onShowDeleteDialog(chat);
              onClose();
            }}
          >
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-red-700/20 to-red-600/20 flex items-center justify-center">
              <span className="material-icons text-red-500">delete_forever</span>
            </div>
            <span className="font-medium">Delete chat</span>
          </button>
          
          {!isGroupChat && (
            <button
              className="w-full text-left px-4 py-3 flex items-center gap-3 text-orange-400 hover:bg-gradient-to-r hover:from-orange-900/20 hover:to-orange-800/10 rounded-xl transition-all duration-200"
              onClick={() => {
                onBlock(chat);
                onClose();
              }}
            >
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-orange-700/20 to-orange-600/20 flex items-center justify-center">
                <span className="material-icons text-orange-400">
                  {isBlocked ? 'person' : 'block'}
                </span>
              </div>
              <span className="font-medium">{isBlocked ? 'Unblock user' : 'Block user'}</span>
            </button>
          )}
          
          <div className="pt-2 mt-2 border-t border-gray-800/30">
            <button
              className="w-full text-gray-400 text-sm font-medium py-3 hover:text-gray-200 transition-colors"
              onClick={onClose}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatActionSheet;
