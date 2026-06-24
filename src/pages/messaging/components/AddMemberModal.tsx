import React, { useEffect, useState } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { getAllUsers } from '../../../services/userService';
import type { ChatWithDetails } from '../../../services/messageService';
import type { User } from '../../../contexts/AuthContext';

type AddMemberModalProps = {
  onClose: () => void;
  onAddMember: (memberId: string) => void;
  selectedChat: ChatWithDetails | null;
};

const AddMemberModal: React.FC<AddMemberModalProps> = ({ onClose, onAddMember, selectedChat }) => {
  const { currentUser } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [addedMembers, setAddedMembers] = useState<{ id: string; name: string }[]>([]);
  const [isAddingMember, setIsAddingMember] = useState<string | null>(null);

  useEffect(() => {
    if (!searchTerm.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    const loadPotentialMembers = async () => {
      if (!currentUser) return;

      setIsLoading(true);
      setIsSearching(true);

      try {
        try {
          const { searchUsers } = await import('../../../services/userService');
          const results = await searchUsers(searchTerm, currentUser.id);
          const filtered = results.filter(
            (u) =>
              u.id !== currentUser.id &&
              u.role !== 'admin' &&
              u.role !== 'super admin' &&
              !(selectedChat?.participants || []).includes(u.id)
          );
          setSearchResults(filtered as User[]);
        } catch (err) {
          const all = await getAllUsers();
          const filtered = all.filter(
            (user) =>
              user.id !== currentUser.id &&
              user.role !== 'admin' &&
              user.role !== 'super admin' &&
              ((user.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                ((user.id || '') && user.id.toLowerCase().includes(searchTerm.toLowerCase())) ||
                ((user.email || '') && user.email.toLowerCase().includes(searchTerm.toLowerCase()))) &&
              !(selectedChat?.participants || []).includes(user.id)
          );
          setSearchResults(filtered);
        }
      } catch (error) {
        console.error('Error loading potential members:', error);
      } finally {
        setIsLoading(false);
      }
    };

    const delayDebounceFn = setTimeout(() => {
      loadPotentialMembers();
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [currentUser, searchTerm, selectedChat?.participants]);

  const handleAddMemberInModal = async (user: User) => {
    if (isAddingMember === user.id) return;

    setIsAddingMember(user.id);
    try {
      await onAddMember(user.id);
      setAddedMembers((prev) => [...prev, { id: user.id, name: user.name || user.email || 'Unknown' }]);
      setSearchResults((prev) => prev.filter((u) => u.id !== user.id));
    } catch (error) {
      console.error('Error adding member:', error);
    } finally {
      setIsAddingMember(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="bg-gradient-to-br from-[#1a1b23] via-[#222329] to-[#1e1f24] rounded-2xl w-full max-w-md p-6 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.9)] border border-gray-700/30 transform transition-all duration-300 scale-100">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-green-600 to-green-400 p-[2px] shadow-lg shadow-green-700/20">
              <div className="w-full h-full rounded-full bg-[#1a1b23] flex items-center justify-center">
                <span className="material-icons text-green-400 text-xl">person_add</span>
              </div>
            </div>
            <div>
              <h2 className="text-xl font-bold text-white bg-clip-text text-transparent bg-gradient-to-r from-green-300 to-green-500">
                Add Members
              </h2>
              <p className="text-xs text-gray-400 mt-1">Search and add users to the group</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors duration-200 rounded-full p-1 hover:bg-gray-800/50"
            aria-label="Close"
          >
            <span className="material-icons">close</span>
          </button>
        </div>

        {addedMembers.length > 0 && (
          <div className="mb-4 p-3 rounded-lg bg-gradient-to-r from-green-900/40 to-emerald-900/40 border border-green-500/30 backdrop-blur-sm animate-slideDown">
            <div className="flex items-center space-x-2">
              <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
                <span className="material-icons text-white text-sm">check</span>
              </div>
              <div className="flex-1">
                <p className="text-green-300 font-medium text-sm">
                  Successfully added {addedMembers.length} member{addedMembers.length > 1 ? 's' : ''}
                </p>
                <p className="text-green-400/80 text-xs">{addedMembers.map((member) => member.name).join(', ')}</p>
              </div>
            </div>
          </div>
        )}

        <div className="mb-6">
          <div className="relative group">
            <input
              type="text"
              placeholder="Search by name, ID or email"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-[#2a2c33] text-white placeholder-gray-500 rounded-lg py-3 px-4 focus:outline-none focus:ring-2 focus:ring-green-500/50 transition-all border border-gray-700/30 focus:border-green-500/40 shadow-inner"
            />
            <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-green-500/0 via-green-400/5 to-green-300/0 opacity-0 group-focus-within:opacity-100 transition-opacity duration-300 pointer-events-none"></div>
          </div>
        </div>

        <div className="mb-4">
          <div className="h-48 rounded-lg bg-[#1d1e25] border border-gray-800/30 flex flex-col">
            <div className="overflow-y-auto pr-2 modal-scrollbar p-2 flex-grow">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center py-8 px-4">
                  <div className="relative mb-3">
                    <div className="w-6 h-6 border-2 border-gray-600 border-t-green-500 rounded-full animate-spin"></div>
                  </div>
                  <p className="text-gray-400 text-sm font-medium">Searching members...</p>
                </div>
              ) : !isSearching ? (
                <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
                  <div className="relative mb-3">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center shadow-lg">
                      <span className="material-icons text-gray-400 text-2xl">person_search</span>
                    </div>
                  </div>
                  <p className="text-gray-400 text-sm font-medium">Search to add members</p>
                  <p className="text-gray-500 text-xs mt-1">Type a name, ID, or email to find users</p>
                </div>
              ) : searchResults.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
                  <div className="relative mb-3">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center shadow-lg">
                      <span className="material-icons text-gray-400 text-2xl">search_off</span>
                    </div>
                  </div>
                  <p className="text-gray-400 text-sm font-medium">No matching members found</p>
                  <p className="text-gray-500 text-xs mt-1">Try searching with different keywords</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {searchResults.map((user) => {
                    const isAlreadyMember = selectedChat?.participants.includes(user.id) || false;

                    return (
                      <div
                        key={user.id}
                        className="group flex items-center justify-between p-2 hover:bg-gray-800/30 rounded-lg transition-colors duration-200 mb-1 last:mb-0"
                      >
                        <div className="flex items-center space-x-3">
                          {user.profile_pic ? (
                            <div className="relative">
                              <img src={user.profile_pic} alt={user.name} className="w-8 h-8 rounded-full object-cover" />
                            </div>
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-600 to-gray-700 flex items-center justify-center text-white font-medium text-sm">
                              {user.name?.charAt(0) || '?'}
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-white font-medium text-sm truncate">{user.name}</p>
                              {isAlreadyMember && (
                                <span className="text-xs text-blue-400 bg-blue-900/30 px-2 py-0.5 rounded-full font-medium">
                                  Member
                                </span>
                              )}
                            </div>
                            {user.email && <p className="text-gray-400 text-xs truncate">{user.email}</p>}
                          </div>
                        </div>
                        {isAlreadyMember ? (
                          <div className="p-1.5 rounded-full bg-gray-600/50 text-gray-400">
                            <span className="material-icons text-sm">check</span>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleAddMemberInModal(user)}
                            disabled={isAddingMember === user.id}
                            className={`p-1.5 rounded-full transition-all duration-200 shadow-lg ${
                              isAddingMember === user.id
                                ? 'bg-gray-600 cursor-not-allowed'
                                : 'bg-gradient-to-r from-green-600 to-green-500 hover:from-green-500 hover:to-green-400 hover:scale-105 shadow-green-700/20'
                            } text-white`}
                            aria-label={`Add ${user.name}`}
                          >
                            {isAddingMember === user.id ? (
                              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                            ) : (
                              <span className="material-icons text-sm">add</span>
                            )}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        <button
          className="w-full px-4 py-3 rounded-lg bg-[#2d2f36] hover:bg-[#35373f] text-white font-semibold transition-all duration-200 shadow-lg border border-gray-700/30 hover:shadow-xl"
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </div>
  );
};

export default AddMemberModal;
