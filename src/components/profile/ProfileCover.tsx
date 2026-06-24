import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { User } from '../../contexts/AuthContext';
import { IdentificationIcon, AcademicCapIcon, BuildingOfficeIcon, UserIcon, EnvelopeIcon, EyeIcon, NoSymbolIcon, ChatBubbleLeftIcon } from '@heroicons/react/24/outline';
import { getDepartmentName, getRoleDisplayName } from '../../services/userService';
import { blockUser, isUserBlocked, checkMutualBlock, unblockUser, listenToBlockStatus } from '../../services/userService';
import { useAuth } from '../../contexts/AuthContext';
import ConfirmDialog from '../common/ConfirmDialog';
import { canSendDirectMessage } from '../../utils/messagingPermissions';

interface ProfileCoverProps {
  coverPhoto?: string;
  user?: User | null; // Add user data to display on cover
  showUserInfo?: boolean; // Optional flag to control user info display
  profilePicture?: string; // Add profile picture prop
  onProfilePictureClick?: () => void; // Add click handler for profile picture
  isOwnProfile?: boolean; // Whether this is the current user's profile
  inViewMode?: boolean; // Whether user is in view mode (seeing as others see it)
  onViewProfile?: () => void; // Handler for view profile action
  onBlockStatusChange?: () => void; // Handler for block status changes
  onViewProfilePicture?: () => void; // Handler to open profile picture viewer
}

const ProfileCover: React.FC<ProfileCoverProps> = ({ 
  coverPhoto, 
  user, 
  showUserInfo = true,
  profilePicture,
  onProfilePictureClick,
  isOwnProfile = false,
  inViewMode = false,
  onViewProfile,
  onBlockStatusChange,
  onViewProfilePicture
}) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  
  // Determine if action buttons (message, block) should be hidden for admin/super admin viewing non-admin academic users
  const normalizedViewerRole = (currentUser?.role ?? '').toString().replace(/_/g, ' ').toLowerCase();
  const isSuperAdminViewer = normalizedViewerRole === 'super admin';
  const canShowActionButtons = Boolean(currentUser && user && !isOwnProfile);
  const canMessageUser = canSendDirectMessage(currentUser as any, user as any);
  
  // Check blocking status
  const [isBlockedBy, setIsBlockedBy] = useState(false);
  const [isBlocking, setIsBlocking] = useState(false);
  const [blockStatusKey, setBlockStatusKey] = useState(0); // Force refresh key
  // Modal state
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState<{
    title: string;
    message: React.ReactNode;
    tone: 'danger' | 'primary' | 'neutral';
    onConfirm: () => Promise<void> | void;
  } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  // Inline status banner
  const [actionBanner, setActionBanner] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);

  // Auto-dismiss action banner
  useEffect(() => {
    if (!actionBanner) return;
    const t = setTimeout(() => setActionBanner(null), 3000);
    return () => clearTimeout(t);
  }, [actionBanner]);
  
  useEffect(() => {
    if (!currentUser || !user || isOwnProfile) return;
    
    console.log('Setting up block status listener for:', currentUser.id, 'and', user.id);
    
    // Use real-time listener for blocking status
    const unsubscribe = listenToBlockStatus(
      currentUser.id,
      user.id,
      (blockStatus) => {
        console.log('Block status update received:', blockStatus);
        setIsBlockedBy(blockStatus.user2BlockedUser1); // user2 is the profile owner
        setIsBlocking(blockStatus.user1BlockedUser2); // user1 is the current user
        
        // Notify parent component of block status change
        if (onBlockStatusChange) {
          onBlockStatusChange();
        }
      }
    );

    return () => {
      console.log('Cleaning up block status listener');
      unsubscribe();
    };
  }, [currentUser, user, isOwnProfile, onBlockStatusChange]);

  

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleDropdownToggle = () => {
    setIsDropdownOpen(!isDropdownOpen);
  };

  // Privileged users (admins) should not see the Edit Profile option
  // Note: UserRole defines 'super admin' (with a space) in AuthContext, so match that string
  const isPrivilegedUser = !!currentUser && (currentUser.role === 'admin' || currentUser.role === 'super admin');

  const handleViewProfile = () => {
    setIsDropdownOpen(false);
    onViewProfile?.();
  };

  const handleViewProfilePicture = () => {
    setIsDropdownOpen(false);
    onViewProfilePicture?.();
  };

  

  // Handle block user action
  const handleBlockUser = async () => {
    if (!currentUser || !user) {
      console.error('Cannot block user: missing currentUser or target user');
      return;
    }

    if (isSuperAdminViewer) {
      return;
    }

    if (currentUser.id === user.id) {
      setActionBanner({ type: 'error', message: 'You cannot block yourself' });
      return;
    }

    // If they blocked you and you haven't blocked them, disallow initiating block
    if (isBlockedBy && !isBlocking) {
      setActionBanner({ type: 'error', message: 'You cannot block this user because they have blocked you.' });
      return;
    }

    // Open modal confirm
    if (isBlocking) {
      setConfirmConfig({
        title: 'Unblock user',
        message: (
          <span>
            Unblock <span className="font-semibold">{user.name}</span>? They will be able to see your posts and message you again.
          </span>
        ),
        tone: 'primary',
        onConfirm: async () => {
          try {
            setIsProcessing(true);
            console.log('Unblocking user:', user.id);
            await unblockUser(currentUser.id, user.id);
            setActionBanner({ type: 'success', message: 'User has been unblocked successfully' });
          } catch (error) {
            console.error('Error unblocking user:', error);
            setActionBanner({ type: 'error', message: 'Failed to update block status. Please try again.' });
          } finally {
            setIsProcessing(false);
            setConfirmOpen(false);
          }
        },
      });
      setConfirmOpen(true);
    } else {
      setConfirmConfig({
        title: 'Block user',
        message: (
          <span>
            Block <span className="font-semibold">{user.name}</span>? They won't be able to message you or see your posts. You also won't see their messages.
          </span>
        ),
        tone: 'danger',
        onConfirm: async () => {
          try {
            setIsProcessing(true);
            console.log('Blocking user:', user.id);
            const alreadyBlocked = await isUserBlocked(currentUser.id, user.id);
            if (alreadyBlocked) {
              setActionBanner({ type: 'info', message: 'You have already blocked this user' });
              return;
            }
            await blockUser(currentUser.id, user.id);
            setActionBanner({ type: 'success', message: 'User has been blocked successfully' });
          } catch (error) {
            console.error('Error blocking user:', error);
            setActionBanner({ type: 'error', message: 'Failed to update block status. Please try again.' });
          } finally {
            setIsProcessing(false);
            setConfirmOpen(false);
          }
        },
      });
      setConfirmOpen(true);
    }
  };

  

  const handleMessageUser = () => {
    if (!user) return;
    if (!canMessageUser) {
      setActionBanner({ type: 'info', message: 'Messaging this account is restricted.' });
      return;
    }
    // Disable messaging if either side has blocked
    if (isBlocking || isBlockedBy) {
      setActionBanner({ type: 'info', message: 'Messaging is disabled due to block settings.' });
      return;
    }
    // Navigate to messaging page with query param for quick start
    navigate(`/messages?userId=${encodeURIComponent(user.id)}`);
  };

  

  // Compute displayed email per view rules:
  // - In view mode: only censor BulSUSpace emails (…@bulsuspace.com). Others show fully.
  // - Owner (not in view mode): show fully.
  // - Default behavior for other views remains as before (masked).
  const displayedEmail = React.useMemo(() => {
    if (!user?.email) return '';
    const email = user.email;
    const isBulSUSpace = /@bulsuspace\.com$/i.test(email);
    if (isOwnProfile && !inViewMode) return email;
    if (inViewMode) {
      return isBulSUSpace ? email.replace(/(.{2})(.*)(@.*)/, '$1•••••$3') : email;
    }
    // Viewing another user's profile normally — keep previous masking behavior
    return email.replace(/(.{2})(.*)(@.*)/, '$1•••••$3');
  }, [user?.email, isOwnProfile, inViewMode]);

  return (
    <div className="w-full relative">
      {/* Inline action banner */}
      {actionBanner && (
        <div className={`absolute top-2 left-1/2 -translate-x-1/2 z-[60] px-3 py-2 rounded-lg text-sm shadow-lg border 
          ${actionBanner.type === 'success' ? 'bg-green-600/20 text-green-200 border-green-500/40' : ''}
          ${actionBanner.type === 'error' ? 'bg-red-600/20 text-red-200 border-red-500/40' : ''}
          ${actionBanner.type === 'info' ? 'bg-blue-600/20 text-blue-200 border-blue-500/40' : ''}
        `}>
          {actionBanner.message}
        </div>
      )}
      {/* Cover Photo Container with Enhanced Styling */}
      <div className="relative h-32 sm:h-36 md:h-52 lg:h-64 w-full overflow-hidden shadow-2xl">
        {coverPhoto ? (
          // Custom cover photo with overlay gradient
          <div className="w-full h-full relative">
            <img 
              src={coverPhoto} 
              alt="Profile cover" 
              className="w-full h-full object-cover"
              loading="eager"
            />
            {/* Subtle gradient overlay for better text readability */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/20"></div>
            {/* Action buttons (moved below profile info for mobile) */}
          </div>
        ) : (
          // Enhanced default cover with modern gradient design
          <div className="w-full h-full bg-gradient-to-br from-gray-900 via-green-900/20 to-gray-800 relative overflow-hidden">
            {/* Animated background pattern */}
            <div className="absolute inset-0 opacity-10">
              <div className="absolute inset-0 bg-[radial-gradient(rgba(34,197,94,0.3)_1px,transparent_1px)] bg-[size:30px_30px] animate-pulse"></div>
              <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(34,197,94,0.1)_50%,transparent_75%)] bg-[size:60px_60px]"></div>
            </div>
            {/* Subtle light effect */}
            <div className="absolute top-0 left-1/4 w-1/2 h-1/2 bg-gradient-to-br from-green-400/10 to-transparent rounded-full blur-3xl"></div>
            {/* Action buttons (moved below profile info for mobile) */}
          </div>
        )}
      </div>
      {/* User Information Section - Redesigned with profile picture on the left */}
      {showUserInfo && user && (
        <div className="relative -mt-2">
          {/* Main info container with glassmorphism effect - merged with cover */}
          <div className="bg-gradient-to-br from-gray-900/95 via-gray-800/90 to-gray-900/95 backdrop-blur-xl shadow-lg px-3 py-3 sm:px-6 sm:py-5">
            
            {/* Profile content with left-aligned profile picture */}
            <div className="flex flex-col lg:flex-row items-center lg:items-start gap-4 lg:gap-6 relative">
              
              {/* Profile Picture on the left */}
              <div className="flex-shrink-0 self-center lg:self-start">
                <div className="relative group">
                  {profilePicture ? (
                    <div className="relative">
                      {/* Enhanced decorative glowing effect */}
                      <div className="absolute -inset-2 bg-gradient-to-r from-green-600/30 via-green-400/20 to-green-600/30 rounded-full blur-xl opacity-70 group-hover:opacity-100 transition-opacity duration-500 animate-pulse"></div>
                      <div className="absolute -inset-1 bg-gradient-to-r from-green-500/40 to-green-600/40 rounded-full blur-lg opacity-0 group-hover:opacity-80 transition-opacity duration-500"></div>
                      
                      <div className="relative bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-full p-1.5 shadow-2xl">
                        <img
                          src={profilePicture}
                          alt={user.name}
                          className="w-20 h-20 sm:w-24 sm:h-24 lg:w-28 lg:h-28 rounded-full border-2 border-green-500/60 shadow-2xl object-cover bg-gray-800 group-hover:shadow-green-500/40 group-hover:border-green-400/80 transition-all duration-300 ring-1 ring-green-500/20 group-hover:ring-green-400/40 cursor-pointer"
                          loading="eager"
                          onClick={onProfilePictureClick}
                        />
                        {isOwnProfile && onProfilePictureClick && (
                          <div 
                            onClick={onProfilePictureClick}
                            className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm rounded-full opacity-0 group-hover:opacity-100 active:opacity-100 cursor-pointer transition-all duration-300"
                            role="button"
                            aria-label="Change profile picture"
                          >
                            <div className="flex flex-col items-center gap-0.5">
                              <svg className="h-5 w-5 text-white filter drop-shadow-lg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                              <span className="text-xs text-white font-medium drop-shadow-lg">Change</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="relative">
                      {/* Enhanced decorative glowing effect for default avatar */}
                      <div className="absolute -inset-2 bg-gradient-to-r from-green-600/30 via-green-400/20 to-green-600/30 rounded-full blur-xl opacity-70 group-hover:opacity-100 transition-opacity duration-500 animate-pulse"></div>
                      <div className="absolute -inset-1 bg-gradient-to-r from-green-500/40 to-green-600/40 rounded-full blur-lg opacity-0 group-hover:opacity-80 transition-opacity duration-500"></div>
                      
                      <div className="relative bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-full p-1.5 shadow-2xl">
                        <div className="w-20 h-20 sm:w-24 sm:h-24 lg:w-28 lg:h-28 rounded-full bg-gradient-to-br from-green-600 via-green-500 to-green-700 flex items-center justify-center border-2 border-green-500/60 shadow-2xl group-hover:shadow-green-500/40 group-hover:border-green-400/80 transition-all duration-300 ring-1 ring-green-500/20 group-hover:ring-green-400/40 cursor-pointer"
                             onClick={onProfilePictureClick}>
                          <span className="text-white text-xl sm:text-2xl lg:text-3xl font-bold drop-shadow-2xl">{user.name.charAt(0)}</span>
                        </div>
                        {isOwnProfile && onProfilePictureClick && (
                          <div 
                            onClick={onProfilePictureClick}
                            className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm rounded-full opacity-0 group-hover:opacity-100 active:opacity-100 cursor-pointer transition-all duration-300"
                            role="button"
                            aria-label="Add profile picture"
                          >
                            <div className="flex flex-col items-center gap-0.5">
                              <svg className="h-5 w-5 text-white filter drop-shadow-lg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                              </svg>
                              <span className="text-xs text-white font-medium drop-shadow-lg">Add</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* User information on the right */}
              <div className="flex-1 text-center lg:text-left space-y-2 sm:space-y-3">

                {/* Desktop-only action buttons: placed inline with profile info on large screens */}
                {canShowActionButtons && (
                  <div className="hidden lg:flex lg:absolute lg:bottom-3 lg:right-4 items-center gap-3 z-40">
                    {/* Message */}
                    <div className="relative group">
                      <button
                          onClick={handleMessageUser}
                          aria-label="Message user"
                          disabled={isBlocking || isBlockedBy || !canMessageUser}
                          className={`p-3 rounded-full text-white transform transition-all duration-200 shadow-2xl ${isBlocking || isBlockedBy || !canMessageUser ? 'opacity-60 cursor-not-allowed bg-gray-600' : 'hover:scale-105 bg-gradient-to-br from-sky-500 to-blue-600'}`}
                        >
                          <ChatBubbleLeftIcon className="h-5 w-5 text-white drop-shadow" />
                        </button>
                        <div className="hidden lg:group-hover:flex absolute -top-10 left-1/2 transform -translate-x-1/2 whitespace-nowrap bg-black/80 text-xs text-white px-2 py-1 rounded-md shadow-2xl">
                          {isBlocking || isBlockedBy || !canMessageUser ? 'Messaging disabled' : 'Message'}
                        </div>
                    </div>

                    {/* Follow feature removed */}

                    {/* Block */}
                    <div className="relative group">
                      <button
                        onClick={handleBlockUser}
                        aria-label={isBlocking ? 'Unblock user' : 'Block user'}
                        disabled={isBlockedBy && !isBlocking}
                        className={`p-3 rounded-full text-white transform transition-all duration-200 shadow-2xl ${
                          isBlockedBy && !isBlocking
                            ? 'opacity-60 cursor-not-allowed bg-gray-700'
                            : `hover:scale-105 ${isBlocking ? 'bg-gradient-to-br from-red-600 to-rose-600' : 'bg-gradient-to-br from-red-700 to-red-600'}`
                        }`}
                      >
                        <NoSymbolIcon className="h-5 w-5 text-white drop-shadow" />
                      </button>
                      <div className="hidden lg:group-hover:flex absolute -top-10 left-1/2 transform -translate-x-1/2 whitespace-nowrap bg-black/80 text-xs text-white px-2 py-1 rounded-md shadow-2xl">
                        {isBlockedBy && !isBlocking ? 'Blocked — action disabled' : (isBlocking ? 'Unblock' : 'Block')}
                      </div>
                    </div>
                  </div>
                )}

                {/* Action buttons moved to lower-right of the cover photo (visible for student/faculty/alumni and not on own profile) */}
                
                {/* User name with enhanced typography */}
                <div className="space-y-1.5 text-center lg:text-left">
                  <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-white tracking-tight leading-tight">
                    {user.name}
                  </h1>
                  {/* Subtle underline decoration - same width as name */}
                  <div className="h-0.5 bg-gradient-to-r from-transparent via-green-400 to-transparent"></div>
          {(isBlocking || isBlockedBy) && (
                    <div className="mt-2 inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-red-600/20 border border-red-500/40 text-red-300 text-xs font-semibold">
                      <NoSymbolIcon className="h-3.5 w-3.5 text-red-400" />
            <span>{isBlockedBy ? `${user.name} has blocked you` : `You blocked ${user.name}`}</span>
                    </div>
                  )}
                </div>

                {/* Badges layout - Organized in two rows */}
                {/* First row with identity information - Role, ID, Department */}
                <div className="flex flex-wrap justify-start gap-1.5 sm:gap-2 mb-1.5 sm:mb-2">
                  {/* Role badge */}
                  <div className="flex items-center gap-1 sm:gap-1.5 bg-gradient-to-r from-green-600/20 to-green-500/20 backdrop-blur-sm px-2 sm:px-3 py-1 sm:py-1.5 rounded-full text-green-200 text-xs sm:text-sm font-semibold border border-green-500/40 shadow-lg">
                    <UserIcon className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-green-400" />
                    <span>{getRoleDisplayName(user.role)}</span>
                  </div>
                  
                  {/* Department badge - moved to first row */}
                  {user.department && user.department !== 'NONE' && (
                    <div className="flex items-center gap-1 sm:gap-1.5 bg-gradient-to-r from-gray-600/20 to-gray-500/20 backdrop-blur-sm px-2 sm:px-3 py-1 sm:py-1.5 rounded-full text-gray-200 text-xs sm:text-sm border border-gray-500/40 shadow-md">
                      <BuildingOfficeIcon className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-gray-400 flex-shrink-0" />
                      <span className="truncate max-w-[120px] sm:max-w-[180px] font-medium">{getDepartmentName(user.department)}</span>
                    </div>
                  )}
                  {/* Office badge for admins */}
                  {user.role === 'admin' && user.office && (
                    <div className="flex items-center gap-1 sm:gap-1.5 bg-gradient-to-r from-orange-600/20 to-orange-500/20 backdrop-blur-sm px-2 sm:px-3 py-1 sm:py-1.5 rounded-full text-orange-200 text-xs sm:text-sm border border-orange-500/40 shadow-md">
                      <BuildingOfficeIcon className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-orange-400 flex-shrink-0" />
                      <span className="truncate max-w-[120px] sm:max-w-[180px] font-medium">{user.office}</span>
                    </div>
                  )}
                  
                  {/* ID Number badge */}
                  {/* ID Number badge removed per request */}
                </div>
                
                {/* Second row with contact and academic information - Email and Academic details */}
                <div className="flex flex-wrap justify-start gap-1.5 sm:gap-2">
                  {/* Email badge */}
                  <div className="flex items-center gap-1 sm:gap-1.5 bg-gradient-to-r from-emerald-600/15 to-green-600/15 backdrop-blur-sm px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-full text-emerald-200 text-xs sm:text-sm border border-emerald-500/30 shadow-md hover:shadow-emerald-500/20 transition-all duration-300">
                    <EnvelopeIcon className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-emerald-400 flex-shrink-0" />
                    <span className="truncate max-w-[120px] sm:max-w-[200px] font-medium">{displayedEmail}</span>
                  </div>
                  
                  {/* Academic info - conditionally rendered based on role */}
          {user.role === 'alumni' && user.graduationBatch && (
                    <div className="flex items-center gap-1 sm:gap-1.5 bg-gradient-to-r from-amber-600/15 to-orange-600/15 backdrop-blur-sm px-2 sm:px-3 py-1 sm:py-1.5 rounded-full text-amber-200 text-xs sm:text-sm border border-amber-500/30 shadow-md hover:shadow-amber-500/20 transition-all duration-300">
                      <AcademicCapIcon className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-amber-400 flex-shrink-0" />
            <span className="font-medium">{`Batch ${user.graduationBatch}`}</span>
                    </div>
                  )}
                  
          {user.role === 'student' && user.yearSection && (
                    <div className="flex items-center gap-1 sm:gap-1.5 bg-gradient-to-r from-blue-600/15 to-indigo-600/15 backdrop-blur-sm px-2 sm:px-3 py-1 sm:py-1.5 rounded-full text-blue-200 text-xs sm:text-sm border border-blue-500/30 shadow-md hover:shadow-blue-500/20 transition-all duration-300">
                      <AcademicCapIcon className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-blue-400 flex-shrink-0" />
            <span className="font-medium">{user.yearSection}</span>
                    </div>
                  )}
                </div>
                
              </div>
            </div>
            
            
          </div>
        </div>
      )}

    {/* Mobile action buttons: placed under the profile information row, visible only on small screens */}
  {canShowActionButtons && (
        <div className="mt-3 px-3 lg:hidden">
      <div className="flex justify-end items-center gap-3">
            <button
              onClick={handleMessageUser}
              aria-label="Message user"
              disabled={isBlocking || isBlockedBy || !canMessageUser}
              className={`p-3 rounded-full text-white transform transition-all duration-200 shadow-md ${isBlocking || isBlockedBy || !canMessageUser ? 'opacity-60 cursor-not-allowed bg-gray-600' : 'hover:scale-105 bg-gradient-to-br from-sky-500 to-blue-600'}`}
            >
              <ChatBubbleLeftIcon className="h-5 w-5 text-white" />
            </button>

            <button
              onClick={handleBlockUser}
              aria-label={isBlocking ? 'Unblock user' : 'Block user'}
              disabled={isBlockedBy && !isBlocking}
              className={`p-3 rounded-full text-white transform transition-all duration-200 shadow-md ${
                isBlockedBy && !isBlocking
                  ? 'opacity-60 cursor-not-allowed bg-gray-700'
                  : `hover:scale-105 ${isBlocking ? 'bg-gradient-to-br from-red-600 to-rose-600' : 'bg-gradient-to-br from-red-700 to-red-600'}`
              }`}
            >
              <NoSymbolIcon className="h-5 w-5 text-white" />
            </button>
          </div>
        </div>
      )}

      {/* Minimalist Three Dots Button with Dropdown - Positioned in top right */}
      {isOwnProfile && (
        <div className="absolute top-2 right-2 sm:top-3 sm:right-3 z-10" ref={dropdownRef}>
          <div className="relative">
            {/* Three Dots Button - Smaller button size on mobile, same icon size */}
            <button
              onClick={handleDropdownToggle}
              className="group relative p-0 sm:p-1.5 bg-transparent sm:bg-gray-800/70 backdrop-blur-sm hover:bg-gray-700/30 rounded-full border-0 shadow-none sm:shadow-lg transition-all duration-200 transform hover:scale-105 active:scale-95"
              aria-label="Profile actions"
            >
              {/* Original-sized three dots in a compact container */}
              <div className="flex items-center space-x-0.5 sm:space-x-1 p-1 sm:p-0">
                <div className="w-1.5 h-1.5 sm:w-1.5 sm:h-1.5 bg-green-400/80 rounded-full animate-pulse"></div>
                <div className="w-1.5 h-1.5 sm:w-1.5 sm:h-1.5 bg-green-400/60 rounded-full animate-pulse" style={{animationDelay: '0.5s'}}></div>
                <div className="w-1.5 h-1.5 sm:w-1.5 sm:h-1.5 bg-green-400/80 rounded-full animate-pulse" style={{animationDelay: '1s'}}></div>
              </div>
            </button>

            {/* Dropdown Menu */}
            {isDropdownOpen && (
              <div className="absolute top-full right-0 mt-2 w-48 bg-gray-800/95 backdrop-blur-xl border border-gray-600/50 rounded-lg shadow-xl py-2 transform transition-all duration-200 origin-top-right">
                {/* Profile View Option */}
                <button
                  onClick={handleViewProfile}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-200 bg-transparent hover:text-white hover:bg-gray-700/50 transition-all duration-200 group"
                >
                  <EyeIcon className="h-4 w-4 text-blue-400 group-hover:text-blue-300" />
                  <span className="font-medium">{inViewMode ? 'Exit View Mode' : 'View as Others'}</span>
                </button>

                {/* View Profile Picture (owner) */}
                <button
                  onClick={handleViewProfilePicture}
                  disabled={!profilePicture}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-sm bg-transparent transition-all duration-200 group ${profilePicture ? 'text-gray-200 hover:text-white hover:bg-gray-700/50' : 'text-gray-500 cursor-not-allowed opacity-60'}`}
                >
                  {/* Using Photo icon */}
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={`h-4 w-4 ${profilePicture ? 'text-emerald-400 group-hover:text-emerald-300' : 'text-gray-500'}`}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0L21.75 21M4.5 19.5h15A2.25 2.25 0 0021.75 17.25V6.75A2.25 2.25 0 0019.5 4.5h-15A2.25 2.25 0 002.25 6.75v10.5A2.25 2.25 0 004.5 19.5z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 8.25h.008v.008H8.25V8.25z" />
                  </svg>
                  <span className="font-medium">View Profile Picture</span>
                </button>

                {/* Edit Profile Option (hidden for admin / super_admin) */}
                {!isPrivilegedUser && (
                  <button
                    onClick={() => {
                      setIsDropdownOpen(false);
                      // Navigate to Settings page and open Profile Information tab
                      navigate('/settings?section=profile');
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-200 bg-transparent hover:text-white hover:bg-gray-700/50 transition-all duration-200 group"
                  >
                    <IdentificationIcon className="h-4 w-4 text-green-400 group-hover:text-green-300" />
                    <span className="font-medium">Edit Profile</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* Friend Button is now moved to the bottom row */}

      {/* Confirm dialog for block/unblock */}
      <ConfirmDialog
        open={confirmOpen}
        title={confirmConfig?.title}
        message={confirmConfig?.message || ''}
        confirmLabel={isBlocking ? 'Unblock' : 'Block'}
        cancelLabel="Cancel"
        confirmTone={confirmConfig?.tone || 'neutral'}
        isProcessing={isProcessing}
        onConfirm={() => confirmConfig?.onConfirm?.()}
        onCancel={() => { if (!isProcessing) setConfirmOpen(false); }}
      />
    </div>
  );
};

export default ProfileCover;
