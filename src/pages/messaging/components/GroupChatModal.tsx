import React, { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import type { User } from '../../../contexts/AuthContext';
import type { ChatWithDetails } from '../../../services/messageService';
import { changeGroupName, removeGroupMember, sendMessage } from '../../../services/messageService';
import { db } from '../../../firebase/config';

const GroupChatModal: React.FC<{
  chat: ChatWithDetails;
  currentUser: User;
  onClose: () => void;
  onMembersChanged: (updatedChat: ChatWithDetails) => void;
}> = ({ chat, currentUser, onClose, onMembersChanged }) => {
  const [groupName, setGroupName] = useState(chat.name || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const isAdmin = chat.adminId === currentUser.id;
  const [groupMembers, setGroupMembers] = useState<User[]>(chat.users || []);
  
  // Fetch all group members when component mounts
  useEffect(() => {
    const fetchGroupMembers = async () => {
      // If chat.users already contains all participants, use that directly
      if (chat.users && chat.users.length === chat.participants.length) {
        setGroupMembers(chat.users);
        return;
      }
      
      // Otherwise, we need to fetch any missing users
      try {
        // Get user information for all participants
        const memberPromises = chat.participants.map(async (participantId) => {
          // Check if the user is already in chat.users
          const existingUser = chat.users?.find(user => user.id === participantId);
          if (existingUser) {
            return existingUser;
          }
          
          // Otherwise fetch the user data
          try {
            // Replace this with your actual user fetch function
            // This is a placeholder for actual user fetching logic
            const userDoc = await getDoc(doc(db, 'users', participantId));
            if (userDoc.exists()) {
              return { id: participantId, ...userDoc.data() } as User;
            }
            return { id: participantId, name: 'Unknown User' } as User;
          } catch (err) {
            console.error('Error fetching user', err);
            return { id: participantId, name: 'Unknown User' } as User;
          }
        });
        
        const resolvedMembers = await Promise.all(memberPromises);
        setGroupMembers(resolvedMembers);
      } catch (err) {
        console.error('Error fetching group members:', err);
        // Fall back to using chat.users if available
        if (chat.users) {
          setGroupMembers(chat.users);
        }
      }
    };
    
    fetchGroupMembers();
  }, [chat]);

  const handleChangeName = async () => {
    setError('');
    setLoading(true);
    try {
      await changeGroupName(chat.id, currentUser.id, groupName);
      onMembersChanged({ ...chat, name: groupName });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    setError('');
    setLoading(true);
    try {
      await removeGroupMember(chat.id, currentUser.id, memberId);
      
      // Update both the participants array and the local groupMembers state
      const updatedParticipants = chat.participants.filter(id => id !== memberId);
      const updatedGroupMembers = groupMembers.filter(member => member.id !== memberId);
      
      setGroupMembers(updatedGroupMembers);
      onMembersChanged({ ...chat, participants: updatedParticipants });

      // Send a system message to notify about the member removal
      try {
        // Get the removed user's profile to display their name
        const removedUser = groupMembers.find(member => member.id === memberId);
        const removedUserName = removedUser?.name || 'A member';
        
        await sendMessage(
          chat.id,
          currentUser.id, // Use current user ID instead of 'system' for permissions
          `${removedUserName} was removed from the group.`,
          'system' // Message type is 'system'
        );
      } catch (err) {
        console.error('Error creating system message:', err);
        // Continue with the flow even if system message fails
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="bg-gradient-to-br from-[#1a1b23] via-[#222329] to-[#1e1f24] rounded-2xl w-full max-w-md p-6 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.9)] border border-gray-700/30 transform transition-all duration-300 scale-100">
        <div className="flex justify-end">
          <button
            className="text-gray-400 hover:text-white transition-colors duration-200 rounded-full p-1 hover:bg-gray-800/50"
            onClick={onClose}
            aria-label="Close"
          >
            <span className="material-icons">close</span>
          </button>
        </div>
        <div className="flex flex-col items-center mb-4">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-green-600 to-green-400 p-[2px] mb-3">
            <div className="w-full h-full rounded-full bg-[#1a1b23] flex items-center justify-center">
              <span className="material-icons text-2xl text-green-400">group</span>
            </div>
          </div>
          <h2 className="text-xl font-bold text-white bg-clip-text text-transparent bg-gradient-to-r from-green-300 to-green-500">Group Chat Settings</h2>
          <div className="text-xs text-gray-400 mt-2 flex items-center">
            <span className="material-icons text-green-500 mr-1 text-xs">people</span>
            {chat.participants.length} / 70 members
          </div>
        </div>
        <div className="flex items-center gap-2 mb-4">
          <input
            className="flex-1 bg-[#2a2c33] text-white rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-green-500/50 transition-all border border-gray-700/30"
            value={groupName}
            onChange={e => setGroupName(e.target.value)}
            disabled={!isAdmin || loading}
            placeholder="Group Name"
          />
          {isAdmin && (
            <button
              className="px-4 py-2.5 rounded-lg bg-gradient-to-r from-green-600 to-green-500 hover:from-green-500 hover:to-green-400 text-white font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-green-700/20"
              onClick={handleChangeName}
              disabled={loading || !groupName.trim()}
            >
              Rename
            </button>
          )}
        </div>
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-gray-300 mb-2 flex items-center">
            <span className="material-icons text-green-500 mr-1 text-sm">people_alt</span>
            Members
          </h3>
          <div className="h-32 rounded-lg bg-[#1d1e25] border border-gray-800/30 flex flex-col">
            <ul className="overflow-y-auto pr-2 modal-scrollbar p-2 flex-grow">
              {groupMembers.map(member => (
                <li key={member.id} className="flex items-center justify-between py-2 px-2 hover:bg-gray-800/30 rounded-lg transition-colors duration-200 mb-1 last:mb-0">
                  <div className="flex items-center">
                    <div className="w-6 h-6 rounded-full bg-gray-700 flex items-center justify-center mr-2 text-xs text-white font-medium">
                      {member.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-white text-sm">{member.name}</span>
                    {member.id === chat.adminId && (
                      <span className="ml-2 text-xs text-green-400 bg-green-900/30 px-1.5 py-0.5 rounded-full">Admin</span>
                    )}
                  </div>
                  {isAdmin && member.id !== currentUser.id && (
                    <button
                      className="text-red-400 hover:text-red-300 text-xs bg-red-900/20 hover:bg-red-800/30 px-2 py-1 rounded-full transition-colors duration-200 flex items-center"
                      onClick={() => handleRemoveMember(member.id)}
                    >
                      <span className="material-icons text-xs mr-1">person_remove</span>
                      Remove
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
        {error && (
          <div className="text-red-500 text-sm mb-3 bg-red-900/20 p-2 rounded-lg flex items-center">
            <span className="material-icons text-red-500 mr-1 text-sm">error</span>
            {error}
          </div>
        )}
        <button
          className="mt-2 w-full px-4 py-3 rounded-lg bg-[#2d2f36] hover:bg-[#35373f] text-white font-semibold transition-all duration-200 shadow-lg border border-gray-700/30 hover:shadow-xl"
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </div>
  );
};

// Define MessageProps type
// Message component scoped inside MessagingPage

export default GroupChatModal;
