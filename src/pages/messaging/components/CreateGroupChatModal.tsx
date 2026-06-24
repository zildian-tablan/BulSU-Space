import React, { useEffect, useState } from 'react';
import type { User } from '../../../contexts/AuthContext';

type CreateGroupChatModalProps = {
  users: User[];
  currentUser: User;
  onCreate: (memberIds: string[], groupName: string) => void;
  onClose: () => void;
};

const CreateGroupChatModal: React.FC<CreateGroupChatModalProps> = ({
  users,
  currentUser,
  onCreate,
  onClose,
}) => {
  const [selected, setSelected] = useState<string[]>([]);
  const [groupName, setGroupName] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    if (!searchTerm.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    let mounted = true;
    setIsSearching(true);

    const runSearch = async () => {
      try {
        try {
          const { searchUsers } = await import('../../../services/userService');
          const results = await searchUsers(searchTerm, currentUser.id);
          if (!mounted) return;
          setSearchResults(results.filter((u) => u.id && u.id !== currentUser.id));
        } catch (err) {
          const { getAllUsers } = await import('../../../services/userService');
          const all = await getAllUsers();
          if (!mounted) return;
          const lower = searchTerm.toLowerCase();
          const filtered = all.filter(
            (user) =>
              user.id !== currentUser.id &&
              ((user.name || '')?.toLowerCase().includes(lower) ||
                (user.email || '')?.toLowerCase().includes(lower) ||
                (user.id || '')?.toLowerCase().includes(lower))
          );
          setSearchResults(filtered);
        }
      } catch (error) {
        console.error('CreateGroupChatModal search error', error);
      } finally {
        if (mounted) setIsSearching(false);
      }
    };

    const t = setTimeout(runSearch, 300);
    return () => {
      mounted = false;
      clearTimeout(t);
    };
  }, [searchTerm, currentUser.id]);

  const combinedPoolMap = new Map<string, User>();
  (searchResults.length > 0 ? searchResults : users).forEach((u) => combinedPoolMap.set(u.id, u));
  users.forEach((u) => {
    if (!combinedPoolMap.has(u.id)) combinedPoolMap.set(u.id, u);
  });
  const combinedPool = Array.from(combinedPoolMap.values());

  const selectedUsers = selected.map((id) => combinedPool.find((u) => u.id === id)).filter(Boolean) as User[];
  const otherUsers = combinedPool.filter((u) => !selected.includes(u.id));
  const availableList = [...selectedUsers, ...otherUsers];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#18191a] rounded-xl w-full max-w-md shadow-xl border border-gray-800/30 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800/50">
          <h2 className="text-lg font-semibold text-white">Create Group</h2>
          <button onClick={onClose} className="text-gray-400 p-1 rounded hover:text-white" aria-label="Close">
            <span className="material-icons">close</span>
          </button>
        </div>

        <div className="px-6 py-5 space-y-3">
          <input
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="Group name"
            className="w-full px-4 py-2 rounded-md bg-gray-800/60 border border-gray-700 text-white text-base"
          />

          <div>
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search users by name, email or ID"
              className="w-full px-4 py-2 rounded-md bg-gray-800/60 border border-gray-700 text-white text-base"
            />
          </div>

          <div className="max-h-56 overflow-y-auto mt-1 space-y-1">
            {isSearching ? (
              <div className="py-6 text-center text-sm text-gray-400">Searching...</div>
            ) : availableList.length === 0 ? (
              <div className="py-6 text-center text-sm text-gray-400">No users found</div>
            ) : (
              availableList.map((user) => (
                <div
                  key={user.id}
                  onClick={() =>
                    setSelected((sel) => (sel.includes(user.id) ? sel.filter((id) => id !== user.id) : [...sel, user.id]))
                  }
                  className={`flex items-center justify-between px-2 py-1 rounded-md cursor-pointer hover:bg-gray-800/40 ${
                    selected.includes(user.id) ? 'bg-green-500/10' : ''
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-sm text-white">
                      {user.profile_pic ? (
                        <img src={user.profile_pic} alt={user.name} className="w-full h-full object-cover rounded-full" />
                      ) : (
                        <span>{user.name?.charAt(0) || '?'}</span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm text-white truncate">{user.name || user.email}</p>
                      {user.email && <p className="text-xs text-gray-400 truncate">{user.email}</p>}
                    </div>
                  </div>
                  <div className="ml-2">
                    {selected.includes(user.id) ? (
                      <span className="material-icons text-green-400">check_circle</span>
                    ) : (
                      <span className="material-icons text-gray-400">radio_button_unchecked</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="flex items-center justify-between text-sm text-gray-400">
            <div>{selected.length} selected</div>
            <div className="flex gap-2">
              <button onClick={onClose} className="px-3 py-1 rounded-md bg-gray-700 text-white text-sm">
                Cancel
              </button>
              <button
                onClick={() => onCreate(selected, groupName)}
                disabled={!groupName || selected.length === 0}
                className={`px-3 py-1 rounded-md text-white text-sm ${
                  !groupName || selected.length === 0 ? 'bg-green-600/50 cursor-not-allowed' : 'bg-green-600 hover:bg-green-500'
                }`}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreateGroupChatModal;
