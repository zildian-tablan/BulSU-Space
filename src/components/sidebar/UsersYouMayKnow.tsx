import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { User } from '../../contexts/AuthContext';
import { getAllUsers } from '../../services/userService';

const REFRESH_INTERVAL = 10 * 60 * 1000; // 10 minutes in milliseconds
const USERS_TO_DISPLAY = 10;

interface UsersYouMayKnowProps {
  className?: string;
}

const UsersYouMayKnow: React.FC<UsersYouMayKnowProps> = ({ className = '' }) => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [recommendedUsers, setRecommendedUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  /**
   * Shuffle array using Fisher-Yates algorithm
   */
  const shuffleArray = <T,>(array: T[]): T[] => {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  };

  /**
   * Fetch and filter users, then select 10 random ones
   */
  const fetchRecommendedUsers = async () => {
    if (!currentUser?.id) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      // Fetch all users from the database
      const allUsers = await getAllUsers();

      // Filter out:
      // 1. Admin and Super Admin roles
      // 2. The current logged-in user
      const eligibleUsers = allUsers.filter((user) => {
        const isAdminOrSuperAdmin = user.role === 'admin' || user.role === 'super admin';
        const isCurrentUser = user.id === currentUser.id;
        return !isAdminOrSuperAdmin && !isCurrentUser;
      });

      // Shuffle the eligible users and select the first 10
      const shuffled = shuffleArray(eligibleUsers);
      const selected = shuffled.slice(0, USERS_TO_DISPLAY);

      setRecommendedUsers(selected);
    } catch (err) {
      console.error('Error fetching recommended users:', err);
      setRecommendedUsers([]);
    } finally {
      setLoading(false);
    }
  };

  // Initial fetch
  useEffect(() => {
    fetchRecommendedUsers();
  }, [currentUser?.id]);

  // Set up auto-refresh every 10 minutes
  useEffect(() => {
    const intervalId = setInterval(() => {
      fetchRecommendedUsers();
    }, REFRESH_INTERVAL);

    // Cleanup interval on unmount
    return () => clearInterval(intervalId);
  }, [currentUser?.id]);

  if (!currentUser) return null;

  const getInitials = (name: string): string => {
    const parts = name.trim().split(/\s+/);
    if (parts.length === 0) return 'U';
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  };

  const getRoleColor = (role: string): string => {
    switch (role) {
      case 'student': return 'text-green-400';
      case 'faculty': return 'text-blue-400';
      case 'alumni': return 'text-amber-400';
      case 'dean': return 'text-purple-400';
      default: return 'text-gray-400';
    }
  };

  // Loading State
  if (loading) {
    return (
      <div className={`space-y-2 ${className}`}>
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="flex items-center gap-2 p-2 bg-gray-800/30 rounded-lg animate-pulse">
            <div className="w-8 h-8 rounded-full bg-gray-700 flex-shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-2.5 bg-gray-700 rounded w-3/4" />
              <div className="h-2 bg-gray-700 rounded w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Empty State
  if (recommendedUsers.length === 0) {
    return (
      <div className={`text-center py-4 text-gray-400 text-xs ${className}`}>
        No users to recommend right now.
      </div>
    );
  }

  // Users List
  return (
    <div className={`space-y-2 ${className}`}>
      {recommendedUsers.map((user) => (
        <div
          key={user.id}
          onClick={() => navigate(`/profile/${user.id}`)}
          className="flex items-center gap-2 p-2 bg-gray-800/30 hover:bg-gray-800/50 rounded-lg 
            transition-all duration-300 group cursor-pointer"
        >
          {/* Avatar */}
          {user.profile_pic ? (
            <img
              src={user.profile_pic}
              alt={user.name}
              className="w-8 h-8 rounded-full object-cover ring-1 ring-gray-700 
                group-hover:ring-green-500/30 flex-shrink-0"
            />
          ) : (
            <div
              className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-700 to-gray-800 
                flex items-center justify-center text-green-400 font-bold text-xs 
                ring-1 ring-gray-700 group-hover:ring-green-500/30 flex-shrink-0"
            >
              {getInitials(user.name)}
            </div>
          )}

          {/* User Info */}
          <div className="flex-1 min-w-0">
            <h4 className="text-xs font-medium text-gray-200 group-hover:text-green-400 
              transition-colors duration-300 truncate">
              {user.name}
            </h4>
            <p className={`text-[10px] capitalize ${getRoleColor(user.role)}`}>
              {user.role}
            </p>
          </div>

          {/* Arrow Icon */}
          <span className="material-icons text-gray-500 group-hover:text-gray-300 text-xs 
            transition-colors duration-300 bg-transparent">
            chevron_right
          </span>
        </div>
      ))}
    </div>
  );
};

export default UsersYouMayKnow;
