import React, { useState, useRef, useEffect } from 'react';
import { ChevronLeftIcon, PhoneIcon, EllipsisHorizontalIcon } from '@heroicons/react/24/outline';
import { PresenceStatusIndicator } from '../../../components/common/PresenceStatusIndicator';
import { deleteGroupChat, removeGroupMember } from '../../../services/messageService';
import { getFirstName } from '../utils';
import type { ChatHeaderProps } from '../types';

const ChatHeader: React.FC<ChatHeaderProps> = ({ 
  selectedChat, 
  setShowChatList, 
  setShowGroupModal, 
  setShowAddMemberModal, 
  currentUser, 
  setSelectedChat, 
  setShowDeleteChatDialog,
  blockingStatus,
  handleBlockUser,
  onVisitProfile,
  openThemeModal,
  openMediaFiles,
  onStartAudioCall,
  canStartAudioCall,
  isCallingBusy,
}) => {
  const [showChatMenu, setShowChatMenu] = useState(false);
  const chatMenuRef = useRef<HTMLDivElement>(null);


  useEffect(() => {
    if (!showChatMenu) return;
    function handleClickOutside(event: MouseEvent) {
      if (chatMenuRef.current && !chatMenuRef.current.contains(event.target as Node)) {
        setShowChatMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showChatMenu]);

  const otherId: string | undefined = selectedChat?.otherUser?.id ?? (
    selectedChat && currentUser ? selectedChat.participants?.find(id => id !== currentUser.id) : undefined
  );

  return (
    <div className="flex items-center justify-between h-14 px-4 border-b border-gray-800 bg-transparent relative">
      <div className="flex items-center gap-3 relative z-10">
        <div className="md:hidden mr-1">
          <button onClick={() => setShowChatList(true)} className="text-gray-400 hover:text-white p-1 rounded-md">
            <ChevronLeftIcon className="w-5 h-5" />
          </button>
        </div>
        {selectedChat && (
          <div className="flex items-center gap-3">
            {selectedChat.isGroupChat ? (
              
              <>
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-600 to-emerald-500 flex items-center justify-center text-white text-sm font-semibold border border-gray-800/20">
                  <span className="material-icons">group</span>
                </div>
                <div className="min-w-0 flex flex-col items-start relative pl-0 ml-0">
                  <div className="w-full pl-0 ml-0">
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setShowGroupModal(true)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setShowGroupModal(true); }}
                      className="block w-full text-white font-semibold truncate text-sm text-left bg-transparent p-0 ml-0 pl-0 leading-tight cursor-pointer"
                    >
                      {selectedChat.name || 'Group Chat'}
                    </div>
                  </div>
                  <div className="text-xs text-gray-400 truncate w-full ml-0 pl-0 mt-0.5" onClick={() => setShowGroupModal(true)}>
                    {selectedChat.participants.length} members
                  </div>
                </div>
              </>
            ) : (
 
              <>
                <div className="relative flex-shrink-0">
                  {selectedChat.otherUser?.profile_pic ? (
                    <img src={selectedChat.otherUser.profile_pic} alt={selectedChat.otherUser.name} className="w-10 h-10 rounded-full object-cover border border-gray-700" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center text-white font-semibold border border-gray-700">
                      {selectedChat.otherUser?.name.charAt(0) || '?'}
                    </div>
                  )}
                  
                  {/* Presence status dot for chat header */}
                  {otherId && (
                    <div className="absolute bottom-0 right-0 z-20 translate-x-1 translate-y-1">
                      <PresenceStatusIndicator userId={otherId} size="xs" />
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <h3 className="font-medium text-white text-sm truncate">
                    <span className="block md:hidden">{getFirstName(selectedChat.otherUser?.name || 'Chat')}</span>
                    <span className="hidden md:block">{selectedChat.otherUser?.name || 'Chat'}</span>
                  </h3>
                </div>
              </>
            )}
          </div>
        )}
  </div>
      <div className="flex items-center space-x-2 relative z-10">
        {!selectedChat?.isGroupChat && (
          <button
            aria-label="start-audio-call"
            onClick={onStartAudioCall}
            disabled={!canStartAudioCall || isCallingBusy}
            className={`p-2 rounded-lg transition-all transform duration-150 ${
              !canStartAudioCall || isCallingBusy
                ? 'text-gray-600 cursor-not-allowed'
                : 'text-gray-300 hover:text-green-300 hover:bg-white/5 hover:scale-105 active:scale-95'
            }`}
            title="Start audio call"
          >
            <PhoneIcon className="w-5 h-5" />
          </button>
        )}
        <button aria-label="more" onClick={() => setShowChatMenu(v => !v)} className="text-gray-300 hover:text-white p-2 rounded-lg transition-all transform hover:scale-105 active:scale-95 duration-150 bg-transparent hover:bg-white/5 shadow-sm hover:shadow-md focus:outline-none">
          <EllipsisHorizontalIcon className="w-5 h-5" />
        </button>
        {showChatMenu && (
          <div ref={chatMenuRef} className="absolute right-2 top-12 z-[9999] bg-[#171717] border border-gray-800 rounded-lg shadow-xl min-w-[220px] py-2">
            {selectedChat?.isGroupChat ? (
              selectedChat.adminId === currentUser?.id ? (
                <>
                  <button className="w-full flex items-center gap-2 text-left px-4 py-2 bg-transparent hover:bg-white/5 text-white transition-colors duration-150 rounded-md" onClick={() => { setShowGroupModal(true); setShowChatMenu(false); }}>
                    <span className="material-icons text-green-400">manage_accounts</span>
                    Manage Members
                  </button>
                  <button className="w-full flex items-center gap-2 text-left px-4 py-2 bg-transparent hover:bg-white/5 text-white transition-colors duration-150 rounded-md" onClick={() => { setShowAddMemberModal(true); setShowChatMenu(false); }}>
                    <span className="material-icons text-green-400">person_add</span>
                    Add Members
                  </button>
                  <button className="w-full flex items-center gap-2 text-left px-4 py-2 bg-transparent hover:bg-white/5 text-white transition-colors duration-150 rounded-md" onClick={() => { setShowGroupModal(true); setShowChatMenu(false); }}>
                    <span className="material-icons text-green-400">edit</span>
                    Change Group Name
                  </button>
                  {/** Removed: Customize Theme option from chat header dropdown for group chats **/}
                  <button className="w-full flex items-center gap-2 text-left px-4 py-2 bg-transparent hover:bg-white/5 text-white transition-colors duration-150 rounded-md" onClick={() => { openMediaFiles(); setShowChatMenu(false); }}>
                    <span className="material-icons text-green-400">perm_media</span>
                    Media & Files
                  </button>
                  <button className="w-full flex items-center gap-2 text-left px-4 py-2 bg-transparent hover:bg-red-900/20 text-red-400 transition-colors duration-150 rounded-md" onClick={async () => {
                    setShowChatMenu(false);
                    if (!currentUser) return;
                    
                    // Show confirmation dialog before deleting the group
                    const confirmed = window.confirm(`Are you sure you want to delete "${selectedChat.name || 'this group'}"? This action cannot be undone and all messages will be permanently lost for all members.`);
                    
                    if (confirmed) {
                      try {
                        await deleteGroupChat(selectedChat.id, currentUser.id);
                        setSelectedChat(null);
                      } catch (e) {
                        alert('Failed to delete group chat: ' + (e instanceof Error ? e.message : String(e)));
                      }
                    }
                  }}>
                    <span className="material-icons text-red-400">delete_forever</span>
                    Delete Group Chat
                  </button>
                </>
              ) : (
                <>
                  <button className="w-full flex items-center gap-2 text-left px-4 py-2 bg-transparent hover:bg-white/5 text-white transition-colors duration-150 rounded-md" onClick={() => { setShowGroupModal(true); setShowChatMenu(false); }}>
                    <span className="material-icons text-green-400">groups</span>
                    See Members
                  </button>
                  <button className="w-full flex items-center gap-2 text-left px-4 py-2 bg-transparent hover:bg-white/5 text-white transition-colors duration-150 rounded-md" onClick={() => { setShowAddMemberModal(true); setShowChatMenu(false); }}>
                    <span className="material-icons text-green-400">person_add</span>
                    Add Member
                  </button>
                  <button className="w-full flex items-center gap-2 text-left px-4 py-2 bg-transparent hover:bg-white/5 text-white transition-colors duration-150 rounded-md" onClick={() => { openMediaFiles(); setShowChatMenu(false); }}>
                    <span className="material-icons text-green-400">perm_media</span>
                    Media & Files
                  </button>
                  <button className="w-full flex items-center gap-2 text-left px-4 py-2 bg-transparent hover:bg-red-900/20 text-red-400 transition-colors duration-150 rounded-md" onClick={async () => {
                    setShowChatMenu(false);
                    if (!currentUser) return;
                    
                    // Show confirmation dialog before leaving the group
                    const confirmed = window.confirm(`Are you sure you want to leave "${selectedChat.name || 'this group'}"? You will no longer receive messages from this group and will need to be re-added by an admin to join again.`);
                    
                    if (confirmed) {
                      try {
                        await removeGroupMember(selectedChat.id, selectedChat.adminId || '', currentUser.id);
                        setSelectedChat(null);
                      } catch (e) {
                        alert('Failed to leave group: ' + (e instanceof Error ? e.message : String(e)));
                      }
                    }
                  }}>
                    <span className="material-icons text-red-400">logout</span>
                    Leave Group
                  </button>
                </>
              )
            ) : (
              <>
                <button
                  className="w-full flex items-center gap-2 text-left px-4 py-2 bg-transparent hover:bg-white/5 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150 rounded-md"
                  onClick={() => {
                    setShowChatMenu(false);
                    if (otherId) {
                      onVisitProfile(otherId);
                    }
                  }}
                  disabled={!otherId}
                >
                  <span className="material-icons text-green-400">person</span>
                  Visit Profile
                </button>
                {/** Removed: Customize Theme option from chat header dropdown for direct messages **/}
                <button 
                  className="w-full flex items-center gap-2 text-left px-4 py-2 bg-transparent hover:bg-white/5 text-white transition-colors duration-150 rounded-md" 
                  onClick={() => { setShowChatMenu(false); openMediaFiles(); }}
                >
                  <span className="material-icons text-green-400">perm_media</span>
                  Media & Files
                </button>
                <button 
                  className={`w-full flex items-center gap-2 text-left px-4 py-2 bg-transparent transition-colors duration-200 rounded-md ${
                    blockingStatus.isLoading ? 'text-gray-500 cursor-not-allowed' : 'text-orange-400 hover:text-orange-300'
                  }`}
                  onClick={async () => { 
                    setShowChatMenu(false); 
                    if (selectedChat && !blockingStatus.isLoading) {
                      await handleBlockUser(selectedChat);
                    }
                  }}
                  disabled={blockingStatus.isLoading}
                >
                  <span className={`material-icons ${
                    blockingStatus.isLoading ? 'text-gray-500' : 'text-orange-400'
                  }`}>
                    {blockingStatus.isLoading ? 'hourglass_empty' : (blockingStatus.isBlocked ? 'person' : 'block')}
                  </span>
                  {blockingStatus.isLoading ? 'Loading...' : (blockingStatus.isBlocked ? 'Unblock User' : 'Block User')}
                </button>
                <div className="border-t border-gray-800 my-2" />
                <button className="w-full flex items-center gap-2 text-left px-4 py-2 bg-transparent hover:bg-red-900/20 text-red-400 transition-colors duration-150 rounded-md" onClick={() => {
                  setShowChatMenu(false);
                  setShowDeleteChatDialog(true); // use the prop
                }}>
                  <span className="material-icons text-red-400">delete_forever</span>
                  Delete Chat
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// Panel to display media & file attachments of the current chat (with tabs)

export default ChatHeader;
