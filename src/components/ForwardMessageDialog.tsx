import React, { useState, useEffect } from 'react';
import { ChatWithDetails } from '../services/messageService';
import { User } from '../contexts/AuthContext';

type ForwardMessageDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  onForward: (chatId: string) => void;
  chats: ChatWithDetails[];
  currentUser: User | null;
};

const ForwardMessageDialog: React.FC<ForwardMessageDialogProps> = ({
  isOpen,
  onClose,
  onForward,
  chats,
  currentUser
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredChats, setFilteredChats] = useState<ChatWithDetails[]>([]);
  const [forwardingChatId, setForwardingChatId] = useState<string | null>(null);
  const [showForwardedMessage, setShowForwardedMessage] = useState<string | null>(null);

  useEffect(() => {
    if (searchTerm.trim() === '') {
      setFilteredChats(chats);
    } else {
      const term = searchTerm.toLowerCase();
      setFilteredChats(
        chats.filter(chat => {
          // For 1:1 chats
          if (!chat.isGroupChat && chat.otherUser) {
            return chat.otherUser.name.toLowerCase().includes(term);
          }
          // For group chats
          return chat.name?.toLowerCase().includes(term);
        })
      );
    }
  }, [searchTerm, chats]);

  // Reset state when dialog opens
  useEffect(() => {
    if (isOpen) {
      setSearchTerm('');
      setFilteredChats(chats);
      setForwardingChatId(null);
      setShowForwardedMessage(null);
    }
  }, [isOpen, chats]);

  // Handle chat selection and forwarding
  const handleChatClick = (chatId: string, chatName: string) => {
    setForwardingChatId(chatId);
    
    // Forward the message
    onForward(chatId);
    
    // Show confirmation message
    setShowForwardedMessage(chatName);
    
    // Close dialog after a short delay
    setTimeout(() => {
      onClose();
    }, 1500);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[150] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#121212] w-full max-w-md rounded-xl shadow-xl border border-gray-800 animate-scale-in">
        <div className="p-4 border-b border-gray-800 flex justify-between items-center">
          <h2 className="text-xl font-medium text-white">Forward Message</h2>
          <button
            className="rounded-full p-1 hover:bg-gray-800 transition-colors"
            onClick={onClose}
          >
            <span className="material-icons text-gray-400">close</span>
          </button>
        </div>
        
        <div className="p-4">
          <div className="relative mb-4">
            <input
              type="text"
              placeholder="Search conversations..."
              className="w-full bg-[#1e1e1e] border border-gray-700 rounded-lg py-2 px-4 pl-10 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <span className="material-icons absolute left-3 top-2.5 text-gray-400">search</span>
          </div>
          
          {showForwardedMessage && (
            <div className="bg-green-900/30 text-green-300 px-4 py-3 rounded-lg mb-4 flex items-center animate-fade-in">
              <span className="material-icons mr-2">check_circle</span>
              <span>Message forwarded to {showForwardedMessage}</span>
            </div>
          )}
          
          <div className="max-h-72 overflow-y-auto">
            {filteredChats.length === 0 ? (
              <div className="text-center py-4 text-gray-400">No conversations found</div>
            ) : (
              filteredChats.map(chat => {
                const chatName = !chat.isGroupChat && chat.otherUser
                  ? chat.otherUser.name
                  : chat.name || 'Group Chat';
                  
                return (
                  <div
                    key={chat.id}
                    className={`flex items-center p-3 rounded-lg cursor-pointer transition-all ${
                      forwardingChatId === chat.id 
                        ? 'bg-green-900/30 border border-green-700' 
                        : 'hover:bg-blue-900/30 hover:border hover:border-blue-700 border border-transparent'
                    }`}
                    onClick={() => handleChatClick(chat.id, chatName)}
                  >
                    {/* Chat Avatar */}
                    <div className="w-10 h-10 rounded-full bg-gray-700 flex-shrink-0 overflow-hidden">
                      {!chat.isGroupChat && chat.otherUser ? (
                        <img
                          src={chat.otherUser.profile_pic || '/images/default-avatar.png'}
                          alt={chat.otherUser.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                          <span className="material-icons text-white">group</span>
                        </div>
                      )}
                    </div>
                    
                    {/* Chat Info */}
                    <div className="ml-3 flex-grow overflow-hidden">
                      <p className="text-white font-medium truncate">
                        {chatName}
                      </p>
                      <p className="text-gray-400 text-sm truncate">
                        {chat.participants.length} participants
                      </p>
                    </div>
                    
                    {/* Forward icon */}
                    <div className="flex-shrink-0 ml-2">
                      <span className="material-icons text-blue-400">forward</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
        
        <div className="p-4 border-t border-gray-800 flex justify-end">
          <button
            className="px-4 py-2 bg-transparent text-gray-400 hover:text-white rounded-lg transition-colors"
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default ForwardMessageDialog;
