import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Timestamp, QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';
import MainLayout from '../components/layout/MainLayout';
import { 
  getGroupById, 
  getGroupByIdRealtime,
  getGroupMembers,
  getGroupMembersRealtime, 
  isGroupMember, 
  leaveGroup,
  deleteGroup,
  updateGroupAppearance,
  updateMemberRole,
  removeMember,
  joinGroup,
  sendGroupInvite,
  ensureSpaceChat,
  Group,
  GroupMember 
} from '../services/groupService';
import { 
  createSpacePost, 
  deleteSpacePost,
  getSpacePostsRealtime,
  getSpacePostById
} from '../services/spacePostService';
import { SpacePost, CreateSpacePostData } from '../models/SpacePost';
import { User } from '../contexts/AuthContext';
import { fetchUsersBatch, searchUsers } from '../services/userService';
import ConfirmDialog from '../components/common/ConfirmDialog';
import SpacePostCard from '../components/feed/SpacePostCard';
import SpaceCreatePost from '../components/feed/SpaceCreatePost';
import { 
  UsersIcon, 
  ArrowLeftIcon, 
  ExclamationTriangleIcon,
  LockClosedIcon,
  UserMinusIcon,
  Cog6ToothIcon,
  SparklesIcon,
  ClockIcon,
  TrashIcon,
  ChatBubbleLeftEllipsisIcon,
  EyeIcon,
  XMarkIcon,
  UserPlusIcon,
  UserMinusIcon as UserRemoveIcon,
  ShieldCheckIcon
} from '@heroicons/react/24/outline';
import { 
  UsersIcon as UsersIconSolid,
  LockClosedIcon as LockClosedIconSolid,
  ShieldCheckIcon as ShieldCheckIconSolid
} from '@heroicons/react/24/solid';
// QR modal uses ReactDOM.createPortal like AccountCreatorPage
// We'll generate a QR image using qrserver API to avoid adding deps

const GroupPage = (): React.ReactElement => {
  const { groupId } = useParams<{ groupId: string }>();
  const { currentUser } = useAuth();
  const currentUserId = currentUser?.id;
  const navigate = useNavigate();
  
  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<(GroupMember & { user: User })[]>([]);
  const [posts, setPosts] = useState<SpacePost[]>([]);
  const [isUserMember, setIsUserMember] = useState(false);
  const [userRole, setUserRole] = useState<'admin' | 'moderator' | 'member' | null>(null);
  const [loading, setLoading] = useState(true);
  const [postsLoading, setPostsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [isLeavingGroup, setIsLeavingGroup] = useState(false);
  const [showSettingsDropdown, setShowSettingsDropdown] = useState(false);
  const settingsDropdownRefDesktop = useRef<HTMLDivElement>(null);
  const settingsDropdownRefMobile = useRef<HTMLDivElement>(null);
  const joinSuccessCloseIntentRef = useRef(false);
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [isPromotingUser, setIsPromotingUser] = useState(false);
  const [isRemovingUser, setIsRemovingUser] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [isAutoJoining, setIsAutoJoining] = useState(false);
  const [showJoinSuccessModal, setShowJoinSuccessModal] = useState(false);
  // Pagination state for members modal
  const [currentPage, setCurrentPage] = useState(1);
  const membersPerPage = 10;
  const [memberSearch, setMemberSearch] = useState('');
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteCandidates, setInviteCandidates] = useState<User[]>([]);
  const [inviteCursor, setInviteCursor] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [inviteHasMore, setInviteHasMore] = useState(true);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteLoadingMore, setInviteLoadingMore] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSearch, setInviteSearch] = useState('');
  const [inviteSearchResults, setInviteSearchResults] = useState<User[]>([]);
  const [inviteSearchLoading, setInviteSearchLoading] = useState(false);
  const [inviteStatus, setInviteStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [inviteSendingId, setInviteSendingId] = useState<string | null>(null);
  const [inviteSentIds, setInviteSentIds] = useState<Set<string>>(new Set());
  const invitePageSize = 15;
  const [isOpeningChat, setIsOpeningChat] = useState(false);

  const resetInviteModalState = useCallback(() => {
    setInviteCandidates([]);
    setInviteCursor(null);
    setInviteHasMore(true);
    setInviteLoading(false);
    setInviteLoadingMore(false);
    setInviteError(null);
    setInviteSearch('');
    setInviteSearchResults([]);
    setInviteSearchLoading(false);
    setInviteStatus(null);
    setInviteSendingId(null);
    setInviteSentIds(new Set<string>());
  }, []);

  const loadInviteBatch = useCallback(async (mode: 'reset' | 'more' = 'reset') => {
    if (!currentUser || !groupId) return;
    if (mode === 'more') {
      if (inviteLoadingMore || !inviteHasMore) return;
      setInviteLoadingMore(true);
    } else {
      if (inviteLoading) return;
      setInviteLoading(true);
    }
    setInviteError(null);

    const excludeIds = new Set<string>(members.map(m => m.userId));
    excludeIds.add(currentUser.id);
    inviteSentIds.forEach(id => excludeIds.add(id));
    const excludeArray = Array.from(excludeIds);

    let cursor: QueryDocumentSnapshot<DocumentData> | null = mode === 'more' ? inviteCursor : null;
    let aggregated: User[] = [];
    let hasMoreFlag = true;
    let lastCursor: QueryDocumentSnapshot<DocumentData> | null = cursor;
    let attempts = 0;

    try {
      while (aggregated.length < invitePageSize && hasMoreFlag) {
        const { users, lastDoc, hasMore } = await fetchUsersBatch({
          limitCount: invitePageSize,
          startAfterDoc: cursor,
          excludeUserIds: excludeArray
        });

        users.forEach(user => {
          if (user.id && !aggregated.some(existing => existing.id === user.id)) {
            aggregated.push(user);
          }
        });

        cursor = lastDoc || cursor;
        lastCursor = lastDoc || lastCursor;
        hasMoreFlag = hasMore;
        attempts++;

        if (!lastDoc) {
          hasMoreFlag = false;
        }

        if (!hasMoreFlag || attempts >= 3) {
          break;
        }

        if (users.length === 0) {
          continue;
        }

        if (aggregated.length >= invitePageSize) {
          break;
        }
      }

      if (!showInviteModal) {
        return;
      }

      if (mode === 'reset') {
        setInviteCandidates(aggregated);
      } else if (aggregated.length) {
        setInviteCandidates(prev => {
          const existingIds = new Set(prev.map(u => u.id));
          const merged = [...prev];
          aggregated.forEach(user => {
            if (!existingIds.has(user.id)) {
              merged.push(user);
            }
          });
          return merged;
        });
      }

      setInviteCursor(lastCursor ?? cursor ?? null);
      setInviteHasMore(hasMoreFlag);
    } catch (err) {
      console.error('Error loading invite candidates:', err);
      setInviteError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      if (mode === 'reset') {
        setInviteLoading(false);
      } else {
        setInviteLoadingMore(false);
      }
    }
  }, [currentUser, groupId, inviteCursor, inviteHasMore, inviteLoading, inviteLoadingMore, inviteSentIds, members, showInviteModal]);

  const handleOpenInviteModal = useCallback(() => {
    resetInviteModalState();
    setShowInviteModal(true);
    setShowSettingsDropdown(false);
  }, [resetInviteModalState]);

  const handleCloseInviteModal = useCallback(() => {
    setShowInviteModal(false);
    resetInviteModalState();
  }, [resetInviteModalState]);

  useEffect(() => {
    if (!showInviteModal) return;
    loadInviteBatch('reset');
  }, [showInviteModal, loadInviteBatch]);

  useEffect(() => {
    if (!showInviteModal) return;
    const term = inviteSearch.trim();
    if (!term) {
      setInviteSearchResults([]);
      setInviteSearchLoading(false);
      setInviteError(null);
      return;
    }

    let active = true;
    setInviteSearchLoading(true);
    setInviteError(null);
    const handle = setTimeout(async () => {
      try {
        const results = await searchUsers(term, currentUser?.id || '', 40);
        if (!active) return;
        const excludeIds = new Set<string>(members.map(m => m.userId));
        if (currentUser?.id) excludeIds.add(currentUser.id);
        inviteSentIds.forEach(id => excludeIds.add(id));
        setInviteSearchResults(results.filter(user => user.id && !excludeIds.has(user.id)));
      } catch (err) {
        if (active) {
          console.error('Error searching users for invite:', err);
          setInviteError('Failed to search users');
        }
      } finally {
        if (active) setInviteSearchLoading(false);
      }
    }, 300);

    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [inviteSearch, showInviteModal, currentUser, members, inviteSentIds]);

  useEffect(() => {
    if (!inviteStatus) return;
    const timer = setTimeout(() => setInviteStatus(null), 4000);
    return () => clearTimeout(timer);
  }, [inviteStatus]);

  const handleSendInvite = useCallback(async (user: User) => {
    if (!currentUser || !groupId || !user.id) return;
    setInviteStatus(null);
    setInviteError(null);
    setInviteSendingId(user.id);
    try {
      await sendGroupInvite(groupId, currentUser.id, user.id);
      setInviteSentIds(prev => {
        const next = new Set(prev);
        next.add(user.id);
        return next;
      });
      setInviteStatus({ type: 'success', message: `Invitation sent to ${user.name || 'this user'}` });
    } catch (err) {
      console.error('Error sending invite:', err);
      setInviteStatus({ type: 'error', message: err instanceof Error ? err.message : 'Failed to send invitation' });
    } finally {
      setInviteSendingId(null);
    }
  }, [currentUser, groupId]);

  // Copy latest space code from Firestore (avoids stale state)
  const handleCopySpaceCode = async () => {
    try {
      if (!groupId) throw new Error('Missing groupId');

      // Prefer current state to keep action synchronous with user gesture
      let codeFromState = group?.spaceCode;
      if (group?.isPrivate && codeFromState) {
        try {
          if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(codeFromState);
          } else {
            const textarea = document.createElement('textarea');
            textarea.value = codeFromState;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.focus();
            textarea.select();
            const ok = document.execCommand('copy');
            document.body.removeChild(textarea);
            if (!ok) window.prompt('Copy this space code', codeFromState);
          }
          alert('Space code copied to clipboard!');
          setShowSettingsDropdown(false);
          return;
        } catch (e) {
          console.warn('Copy from state failed, will fetch latest and retry', e);
        }
      }

      // Fallback: fetch latest then copy (may not be treated as user gesture in some browsers)
      const latest = await getGroupById(groupId);
      const code = latest?.spaceCode;
      if (!latest || !latest.isPrivate || !code) {
        alert('Space code not available');
        return;
      }

      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(code);
        } else {
          const textarea = document.createElement('textarea');
          textarea.value = code;
          textarea.style.position = 'fixed';
          textarea.style.opacity = '0';
          document.body.appendChild(textarea);
          textarea.focus();
          textarea.select();
          const ok = document.execCommand('copy');
          document.body.removeChild(textarea);
          if (!ok) window.prompt('Copy this space code', code);
        }
        alert('Space code copied to clipboard!');
        setShowSettingsDropdown(false);
      } catch (e2) {
        console.error('Copy after fetch failed', e2);
        window.prompt('Copy this space code', code);
      }
    } catch (err) {
      console.error('Failed to copy space code', err);
      alert('Failed to copy space code');
    }
  };

  // Filter members by search
  const filteredMembers = memberSearch.trim()
    ? members.filter(m => {
        const name = (m.user.name || '').toLowerCase();
        const email = (m.user.email || '').toLowerCase();
        const q = memberSearch.toLowerCase();
        return name.includes(q) || email.includes(q);
      })
    : members;

  // Calculate pagination on filtered list
  const totalPages = Math.max(1, Math.ceil(filteredMembers.length / membersPerPage));
  const paginatedMembers = filteredMembers.slice((currentPage - 1) * membersPerPage, currentPage * membersPerPage);
  const inviteSearchActive = inviteSearch.trim().length > 0;
  const inviteDisplayUsers = inviteSearchActive ? inviteSearchResults : inviteCandidates;

  // Reset page when modal opens or members change
  useEffect(() => {
    if (showMembersModal) setCurrentPage(1);
  }, [showMembersModal, members.length]);

  // Reset page when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [memberSearch]);
  // Theme utility functions
  const getThemeColors = () => {
    if (group?.themeColors) {
      return group.themeColors;
    }
    // Default theme colors if no theme is set
    return {
      primaryColor: '#10b981',
      secondaryColor: '#059669', 
      accentColor: '#34d399',
      textColor: '#ffffff',
      bgColor: '#1f2937'
    };
  };

  const getThemeStyles = () => {
    const colors = getThemeColors();
    return {
      primary: colors.primaryColor,
      secondary: colors.secondaryColor,
      accent: colors.accentColor,
      text: colors.textColor,
      bg: colors.bgColor
    };
  };

  const createDynamicStyle = (property: string, value: string, opacity?: number) => {
    return {
      [property]: opacity ? `${value}${Math.round(opacity * 255).toString(16).padStart(2, '0')}` : value
    };
  };

  // Get theme-aware styles for dynamic styling
  const themeStyles = getThemeStyles();
  const dynamicHeaderStyle = {
    background: `linear-gradient(to bottom right, ${themeStyles.primary}, ${themeStyles.secondary}, ${themeStyles.accent})`
  };
  const dynamicButtonStyle = {
    backgroundColor: themeStyles.primary,
    borderColor: themeStyles.accent
  };
  const dynamicAccentStyle = {
    color: themeStyles.accent
  };

  // Handle click outside of settings dropdown(s)
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const isInsideDesktop = settingsDropdownRefDesktop.current?.contains(target);
      const isInsideMobile = settingsDropdownRefMobile.current?.contains(target);
      if (!isInsideDesktop && !isInsideMobile) setShowSettingsDropdown(false);
    };

    // Use 'click' to ensure it fires after button onClick handlers
    document.addEventListener('click', handleClickOutside, true);
    return () => {
      document.removeEventListener('click', handleClickOutside, true);
    };
  }, []);

  // Fetch group data and check membership
  useEffect(() => {
    if (!groupId || !currentUserId) return;

    let isCancelled = false;

    const fetchGroupData = async () => {
      try {
        if (!isCancelled) {
          setLoading(true);
        }
          // Get group details
        const groupData = await getGroupById(groupId);
        if (isCancelled) return;
        if (!groupData) {
          setError('Space not found');
          return;
        }
  setGroup(groupData);
  setError(null); // Clear any previous error now that group loaded successfully
  // Check if user is member
        console.log('Checking membership for user:', currentUserId, 'in group:', groupId);
        const isMember = await isGroupMember(currentUserId, groupId);
        console.log('Membership check result:', isMember);
        if (isCancelled) return;
        setIsUserMember(isMember);

        if (isMember) {
          // Get group members with user details
          const groupMembers = await getGroupMembers(groupId);
          if (isCancelled) return;
          setMembers(groupMembers);

          // Find user's role in the group
          const userMembership = groupMembers.find(member => member.userId === currentUserId);
          setUserRole(userMembership?.role || null);
        }      } catch (err) {
        console.error('Error fetching group data:', err);
        setError('Failed to load space');
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    };

    fetchGroupData();
    return () => {
      isCancelled = true;
    };
  }, [groupId, currentUserId]);  // Set up real-time group data listener to auto-refresh when group properties change
  useEffect(() => {
    if (!groupId || !currentUserId) return;

    console.log('Setting up real-time group data listener');
    
    const unsubscribe = getGroupByIdRealtime(groupId, (updatedGroupData) => {
      if (updatedGroupData) {
        console.log('Group data updated:', updatedGroupData);
  setGroup(updatedGroupData);
  setError(null); // Clear previous errors when realtime group data arrives
          // Members will be updated by the dedicated members real-time listener
      }
    });

    return () => {
      console.log('Cleaning up real-time group data listener');
      unsubscribe();
    };
  }, [groupId, currentUserId]);

  // Set up real-time group members listener to auto-refresh when member roles change
  useEffect(() => {
    if (!groupId || !currentUserId || !isUserMember) return;

    console.log('Setting up real-time group members listener');
    
    const unsubscribe = getGroupMembersRealtime(groupId, (updatedMembers) => {
      console.log('Group members updated:', updatedMembers.length, 'members');
      setMembers(updatedMembers);
      
      // Update user role if needed
      const userMembership = updatedMembers.find(member => member.userId === currentUserId);
      setUserRole(userMembership?.role || null);
    });

    return () => {
      console.log('Cleaning up real-time group members listener');
      unsubscribe();
    };
  }, [groupId, currentUserId, isUserMember]);

  // Set up real-time posts listener for members
  useEffect(() => {
    console.log('Posts listener effect - groupId:', groupId, 'currentUser:', !!currentUserId, 'isUserMember:', isUserMember);
    
    if (!groupId || !currentUserId || !isUserMember) {
      console.log('Posts listener - early return, setting empty posts');
      setPosts([]);
      setPostsLoading(false);
      return;
    }

    console.log('Setting up posts listener for group:', groupId);
    setPostsLoading(true);
    
    const unsubscribe = getSpacePostsRealtime(groupId, (spacePosts: SpacePost[]) => {
      console.log('Received posts update:', spacePosts.length, 'posts');
      setPosts(prevPosts => {
        // Remove optimistic posts that now have real counterparts
        const optimisticPosts = prevPosts.filter(post => post.isOptimistic && 
          !spacePosts.some(realPost => 
            realPost.content === post.content && 
            realPost.userId === post.userId &&
            Math.abs((realPost.createdAt?.seconds || 0) - (post.createdAt?.seconds || 0)) < 10
          )
        );
        
        // Combine optimistic posts with real posts and sort by creation time
        const allPosts = [...optimisticPosts, ...spacePosts].sort((a, b) => {
          const timeA = a.createdAt?.seconds || 0;
          const timeB = b.createdAt?.seconds || 0;
          return timeB - timeA;
        });
        
        console.log('Final posts array:', allPosts.length, 'posts');
        return allPosts;
      });
  setError(null); // Clear any previous load errors when posts successfully arrive
  setPostsLoading(false);
    });

    return () => {
      console.log('Cleaning up posts listener');
      unsubscribe();
    };
  }, [groupId, currentUserId, isUserMember]);// Handle creating a new post
  const handleCreatePost = async (data: CreateSpacePostData) => {
    if (!currentUser || !groupId || !isUserMember) return;

    // Create optimistic post for immediate UI feedback
    const optimisticPost: SpacePost = {
      id: `temp-${Date.now()}`,
      content: data.content,
      userId: currentUser.id,
      userName: currentUser.name || 'Unknown User',
      userRole: currentUser.role || 'student',
      userProfilePic: currentUser.profile_pic || '',
      groupId: groupId,
      createdAt: Timestamp.fromDate(new Date()),
      updatedAt: Timestamp.fromDate(new Date()),
      isPinned: false,
      isEdited: false,
      commentCount: 0,
      reactionCount: 0,
      reactions: {},
      viewCount: 0,
      viewedBy: [],
      tags: data.tags || [],
      media: data.media ? data.media.map(file => ({ 
        type: 'image' as const, 
        url: URL.createObjectURL(file), 
        name: file.name,
        size: file.size
      })) : [],
      isOptimistic: true // Flag to identify optimistic posts
    };

    // Add optimistic post to the beginning of the posts array
    setPosts(prevPosts => [optimisticPost, ...prevPosts]);    try {
      const newPostId = await createSpacePost(data, currentUser.id);
      // Try to fetch the newly created post immediately and replace the optimistic one
      try {
        const realPost = await getSpacePostById(newPostId);
        if (realPost) {
          setPosts(prevPosts => {
            const filtered = prevPosts.filter(p => p.id !== optimisticPost.id && p.id !== realPost.id);
            return [realPost, ...filtered];
          });
          return;
        }
      } catch (fetchErr) {
        console.warn('Could not fetch created post immediately, will rely on realtime listener', fetchErr);
      }

      // Fallback: remove the optimistic post and wait for realtime listener
      setPosts(prevPosts => prevPosts.filter(post => post.id !== optimisticPost.id));
    } catch (error) {
      // Remove optimistic post on error
      setPosts(prevPosts => prevPosts.filter(post => post.id !== optimisticPost.id));
      console.error('Error creating space post:', error);
      alert('Failed to create post. Please try again.');
    }
  };
  // Handle deleting a post
  const handleDeletePost = async (postId: string) => {
    if (!currentUser || !groupId) return;

    try {
      await deleteSpacePost(postId, currentUser.id);
      // Real-time listener will update the posts
    } catch (error) {
      console.error('Error deleting space post:', error);
      alert('Failed to delete post. Please try again.');
    }
  };

  // Handle leaving the group
  const handleLeaveGroup = async () => {
    if (!currentUser || !groupId) return;

    setIsLeavingGroup(true);
    try {
      await leaveGroup(currentUser.id, groupId);
      navigate('/groups');    } catch (error) {
      console.error('Error leaving group:', error);
      alert(error instanceof Error ? error.message : 'Failed to leave space. Please try again.');
    } finally {
      setIsLeavingGroup(false);
      setShowLeaveModal(false);
    }
  };

  // Handle managing members
  const handleManageMembers = () => {
    // Show the members management modal
    setShowMembersModal(true);
    setShowSettingsDropdown(false);
  };

  const handleMessageSpace = useCallback(async () => {
    if (!groupId || !isUserMember) {
      navigate('/messages');
      return;
    }

    try {
      setIsOpeningChat(true);
      const chatId = await ensureSpaceChat(groupId);
      navigate(`/messages?chatId=${chatId}`);
    } catch (err) {
      console.error('Failed to open space chat:', err);
      alert(err instanceof Error ? err.message : 'Unable to open space chat right now.');
    } finally {
      setIsOpeningChat(false);
    }
  }, [groupId, isUserMember, navigate]);

  const openQrModal = () => {
    setQrModalOpen(true);
  };
  const closeQrModal = () => setQrModalOpen(false);
  const joinSuccessModalKey = groupId ? `JOIN_SUCCESS_MODAL_OPEN_${groupId}` : null;

  const setJoinSuccessModalOpen = useCallback((isOpen: boolean) => {
    setShowJoinSuccessModal(isOpen);
    if (isOpen) {
      joinSuccessCloseIntentRef.current = false;
    }
    if (!joinSuccessModalKey) return;
    if (isOpen) {
      sessionStorage.setItem(joinSuccessModalKey, 'true');
    } else {
      sessionStorage.removeItem(joinSuccessModalKey);
    }
  }, [joinSuccessModalKey]);

  useEffect(() => {
    if (!joinSuccessModalKey) return;
    const shouldShow = sessionStorage.getItem(joinSuccessModalKey) === 'true';
    if (shouldShow) {
      joinSuccessCloseIntentRef.current = false;
      setShowJoinSuccessModal(true);
    }
  }, [joinSuccessModalKey]);

  const handleCloseJoinSuccessModal = () => {
    // Close only after an explicit user press on Start Exploring.
    if (!joinSuccessCloseIntentRef.current) {
      return;
    }
    joinSuccessCloseIntentRef.current = false;
    setJoinSuccessModalOpen(false);
    // Remove join query params only when user dismisses the success modal.
    try {
      navigate(window.location.pathname, { replace: true });
    } catch (e) {
      console.warn('Failed to navigate to clean URL after dismissing success modal:', e);
    }
  };
  // Build the public link to this space using the deployed domain to avoid localhost URLs in QR.
  const publicBaseUrl = process.env.REACT_APP_PUBLIC_APP_URL || 'https://bulsuspace.web.app';
  const shareParams = new URLSearchParams({ join: '1', via: 'qr' });
  if (group?.isPrivate && group.spaceCode) {
    shareParams.set('code', group.spaceCode);
  }
  const spaceLink = `${publicBaseUrl}/groups/${groupId}?${shareParams.toString()}`;
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(spaceLink)}`;

  // Auto-join flow for QR/link: if URL has ?join=1 (or legacy params), not a member yet -> join automatically
  useEffect(() => {
    try {
      if (!groupId) return;
      const params = new URLSearchParams(window.location.search);
      const wantsJoin = params.get('join') === '1' || params.get('autoJoin') === '1' || params.get('via') === 'qr' || params.get('via') === 'invite';
      if (!wantsJoin) return;
      const flagKey = `AUTO_JOIN_DONE_${groupId}`;
      if (sessionStorage.getItem(flagKey) === 'true') return;
      if (!currentUser) return; // ProtectedRoute will redirect to signin and return here post-login
      if (isUserMember) {
        sessionStorage.setItem(flagKey, 'true');
        return;
      }
      if (isAutoJoining) return;
      (async () => {
        try {
          setIsAutoJoining(true);
          // collect join code if present for private spaces
          const joinCode = params.get('code') || params.get('spaceCode') || params.get('c') || undefined;
          await joinGroup(currentUser.id, groupId, joinCode);
          sessionStorage.setItem(flagKey, 'true');

          // Mark user as member locally so listeners that depend on isUserMember start immediately
          setIsUserMember(true);

          // Fetch members immediately and set user role so UI updates without waiting for realtime listener
          try {
            const groupMembers = await getGroupMembers(groupId);
            setMembers(groupMembers);
            const userMembership = groupMembers.find(member => member.userId === currentUser.id);
            setUserRole(userMembership?.role || null);
          } catch (e) {
            console.warn('Could not fetch members immediately after join:', e);
          }

          // Show success modal and wait for explicit user dismissal.
          setJoinSuccessModalOpen(true);
          console.log('[GroupPage] Successfully joined space via QR/link');
        } catch (err) {
          console.warn('Auto-join via link/QR failed:', err);
        } finally {
          setIsAutoJoining(false);
        }
      })();
    } catch (e) {
      console.warn('Auto-join check error:', e);
    }
  }, [groupId, currentUser, isUserMember, isAutoJoining, navigate, setJoinSuccessModalOpen]);
    // Handle promoting a member to admin
  const handlePromoteMember = async (memberId: string, userId: string, currentRole: 'admin' | 'moderator' | 'member') => {
    if (!currentUser || !groupId || !group) return;
    
    // Only creator can demote other admins
    if (currentRole === 'admin' && currentUser.id !== group.creatorId) {
      alert('Only the space creator can demote admins');
      return;
    }
    
    // Don't allow demoting the creator
    if (userId === group.creatorId && currentUser.id !== group.creatorId) {
      alert('The space creator role cannot be changed');
      return;
    }
    
    setSelectedMemberId(memberId);
    setIsPromotingUser(true);
    
    try {
      // Determine the new role - toggle between admin and member
      const newRole = currentRole === 'admin' ? 'member' : 'admin';
      
      await updateMemberRole(groupId, currentUser.id, memberId, newRole);
      
      // Real-time listener will update the members list automatically
      console.log(`Member role updated: ${userId} is now ${newRole}`);
      
    } catch (error) {
      console.error('Error promoting/demoting member:', error);
      alert(error instanceof Error ? error.message : 'Failed to update member role. Please try again.');
    } finally {
      setIsPromotingUser(false);
      setSelectedMemberId(null);
    }
  };
  
  // Handle removing a member
  const handleRemoveMember = async (memberId: string, userId: string) => {
    if (!currentUser || !groupId || !group) return;
    
    // Don't allow removing self from this function
    if (userId === currentUser.id) {
      alert('You cannot remove yourself. Use the leave space option instead.');
      return;
    }
    
    // Don't allow removing the creator unless it's the creator themselves
    if (userId === group.creatorId && currentUser.id !== group.creatorId) {
      alert('The space creator cannot be removed by other admins');
      return;
    }
    
    if (window.confirm('Are you sure you want to remove this member from the space?')) {
      setSelectedMemberId(memberId);
      setIsRemovingUser(true);
        try {
        await removeMember(groupId, currentUser.id, memberId, userId);
        
        // Real-time listener will update the members list automatically
        console.log(`Member removed: ${userId}`);
        
      } catch (error) {
        console.error('Error removing member:', error);
        alert(error instanceof Error ? error.message : 'Failed to remove member. Please try again.');
      } finally {
        setIsRemovingUser(false);
        setSelectedMemberId(null);
      }
    }
  };
  // Handle appearance settings
  const handleAppearanceSettings = () => {
    // Navigate to appearance settings page
    if (groupId) {
      navigate(`/groups/${groupId}/appearance`);
    }
    setShowSettingsDropdown(false);
  };

  // Handle deleting the group
  const handleDeleteSpace = async () => {
    if (!currentUser?.id || !groupId) return;
    
    if (window.confirm('Are you sure you want to delete this space? This action cannot be undone.')) {
      try {
        await deleteGroup(groupId, currentUser.id);
        navigate('/groups');
      } catch (error) {
        console.error('Error deleting space:', error);
        alert(error instanceof Error ? error.message : 'Failed to delete space. Please try again.');
      }
    }
    setShowSettingsDropdown(false);
  };

  const joinSuccessModalPortal = showJoinSuccessModal && typeof document !== 'undefined' && ReactDOM.createPortal(
    <div className="fixed inset-0 z-[2147483647] pointer-events-none">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm animate-fadeIn pointer-events-auto" />
      <div className="fixed inset-0 flex items-center justify-center px-4">
        <div className="w-full max-w-md pointer-events-auto inline-block bg-gradient-to-br from-green-900/90 to-gray-900/90 rounded-2xl border border-green-500/30 shadow-xl shadow-green-800/20 text-left transform transition-all duration-300 ease-out animate-modalSlideIn" onClick={(e)=>e.stopPropagation()}>
          <div className="relative p-6 pt-8 space-y-4">
            {/* Success Icon */}
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center border-2 border-green-500/50">
                <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </div>

            {/* Title */}
            <h3 className="text-xl font-bold text-green-300 text-center">Successfully Joined!</h3>

            {/* Message */}
            <div className="text-center space-y-2">
              <p className="text-sm text-gray-300">
                You are now a member of <span className="font-semibold text-white">"{group?.name || 'this space'}"</span>
              </p>
              <p className="text-xs text-gray-400">
                You can now view posts, participate in discussions, and connect with other members.
              </p>
            </div>

            {/* Space Info */}
            {group && (
              <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700/50">
                <div className="flex items-center gap-3">
                  {group.coverImage ? (
                    <img src={group.coverImage} alt={group.name} className="w-12 h-12 rounded-lg object-cover" />
                  ) : (
                    <div className="w-12 h-12 bg-gradient-to-br from-sky-500 to-blue-600 rounded-lg flex items-center justify-center">
                      <span className="text-white font-bold text-lg">{group.name.charAt(0).toUpperCase()}</span>
                    </div>
                  )}
                  <div className="flex-1">
                    <p className="font-semibold text-white text-sm">{group.name}</p>
                    <p className="text-xs text-gray-400">{members.length} {members.length === 1 ? 'member' : 'members'}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Action Button */}
            <div className="mt-6 flex justify-center">
              <button
                type="button"
                onPointerDown={() => {
                  joinSuccessCloseIntentRef.current = true;
                }}
                onClick={handleCloseJoinSuccessModal}
                className="px-8 py-2.5 bg-gradient-to-r from-green-600 to-emerald-700 hover:from-green-500 hover:to-emerald-600 text-white rounded-lg font-medium shadow-lg shadow-green-900/30 transition-all duration-200"
              >
                Start Exploring
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );

  if (loading) {
    return (
      <MainLayout>
  <div className="min-h-screen w-full flex justify-center items-center relative overflow-hidden">
          {/* Decorative elements */}
          <div className="absolute w-1/3 h-1/3 bg-green-500/10 rounded-full filter blur-3xl top-1/4 left-1/4 animate-blob"></div>
          <div className="absolute w-1/3 h-1/3 bg-blue-600/10 rounded-full filter blur-3xl bottom-1/4 right-1/4 animate-blob animation-delay-2000"></div>
          <div className="absolute w-1/3 h-1/3 bg-purple-500/10 rounded-full filter blur-3xl top-1/3 right-1/3 animate-blob animation-delay-4000"></div>
          
          <div className="text-center z-10">
            <div className="relative mb-8 inline-block">
              <div className="animate-spin rounded-full h-20 w-20 border-t-4 border-b-4 border-green-500 mx-auto"></div>
              <div className="absolute inset-0 rounded-full border-4 border-green-500/20 animate-pulse"></div>
              <div className="absolute inset-0 rounded-full border-4 border-l-green-500/40 border-r-green-500/40 border-t-transparent border-b-transparent animate-pulse-slow"></div>
            </div>
            <h3 className="text-2xl font-semibold bg-gradient-to-r from-white to-green-100 bg-clip-text text-transparent mb-3">Loading Space</h3>
            <p className="text-gray-400 text-lg">Preparing your space experience...</p>
          </div>
        </div>
        {joinSuccessModalPortal}
      </MainLayout>
    );
  }  if (error || !group) {
    return (      <MainLayout>
  <div className="min-h-screen w-full">
          <div className="w-full px-4 py-16">
            <div className="max-w-lg mx-auto">
              {/* Enhanced error card with glass effect */}
              <div className="bg-gray-800/50 backdrop-blur-2xl border border-gray-700/30 rounded-3xl p-10 text-center shadow-2xl transform transition-all duration-500 hover:shadow-red-500/5">
                <div className="relative mb-8">
                  <div className="absolute inset-0 bg-red-500/20 rounded-full animate-pulse"></div>
                  <div className="absolute inset-0 bg-gradient-to-br from-red-500/30 to-orange-500/20 rounded-full blur-xl"></div>
                  <ExclamationTriangleIcon className="h-24 w-24 text-red-400 mx-auto relative z-10" />
                </div>
                
                <h1 className="text-3xl font-bold bg-gradient-to-r from-red-300 to-red-100 bg-clip-text text-transparent mb-4">
                  {error || 'Space not found'}
                </h1>
                
                <p className="text-gray-300 mb-10 leading-relaxed text-lg">
                  {error === 'Space not found' 
                    ? 'This space may have been deleted or you may not have permission to view it.'
                    : 'There was an error loading this space.'}
                </p>
                
                <button
                  onClick={() => navigate('/groups')}
                  className="group relative px-10 py-4 bg-gradient-to-r from-green-600 to-green-500 hover:from-green-500 hover:to-green-400 text-white rounded-xl font-semibold transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-green-500/50"
                >
                  <span className="relative z-10 flex items-center gap-3">
                    <ArrowLeftIcon className="h-5 w-5 transition-transform group-hover:-translate-x-2" />
                    <span className="text-lg">Back to Spaces</span>
                  </span>
                  <div className="absolute inset-0 bg-gradient-to-r from-green-400 to-green-300 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                </button>
              </div>
            </div>
          </div>
        </div>
        {joinSuccessModalPortal}
      </MainLayout>
    );
  }  // Non-member view
  if (!isUserMember) {
    return (
      <MainLayout>
  <div className="min-h-screen w-full">
          <div className="w-full px-6 md:px-12 py-8">
            <div className="max-w-4xl mx-auto">
              {/* Enhanced Header with animated gradient */}
              <div className="flex items-center gap-6 mb-8 relative">
                <div className="absolute -left-10 -top-10 w-60 h-60 bg-blue-500/10 rounded-full filter blur-3xl animate-pulse-slow"></div>                <button
                  onClick={() => navigate('/groups')}
                  className="group p-3.5 rounded-xl transition-all duration-300 border z-10 shadow-lg"
                  style={{
                    backgroundColor: 'rgba(31, 41, 55, 0.7)',
                    borderColor: `${themeStyles.primary}80`
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = `${themeStyles.primary}4D`;
                    e.currentTarget.style.borderColor = themeStyles.accent;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(31, 41, 55, 0.7)';
                    e.currentTarget.style.borderColor = `${themeStyles.primary}80`;
                  }}
                >
                  <ArrowLeftIcon 
                    className="h-5 w-5 text-gray-400 group-hover:text-blue-300 transition-colors group-hover:-translate-x-1 transform duration-300" 
                    style={{ color: themeStyles.accent }}
                  />
                </button>
                <div className="z-10">
                  <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-200 to-white bg-clip-text text-transparent">
                    Space Access Required
                  </h1>
                  <p className="text-gray-400 mt-1">Join this space to view content and participate</p>
                </div>
              </div>              {/* Enhanced Group info card with advanced glass morphism */}
              <div className="bg-gray-800/40 backdrop-blur-2xl border border-gray-700/30 rounded-3xl overflow-hidden shadow-[0_20px_80px_-20px_rgba(0,100,255,0.1)] hover:shadow-[0_20px_80px_-20px_rgba(0,100,255,0.2)] transition-all duration-700">
                {/* Cover/Header section with themed animated gradient */}
                <div 
                  className="relative h-40 overflow-hidden"
                  style={dynamicHeaderStyle}
                >                  <div 
                    className="absolute w-1/2 h-1/2 rounded-full filter blur-3xl top-0 left-0 animate-blob"
                    style={{ backgroundColor: `${themeStyles.primary}66` }}
                  ></div>
                  <div 
                    className="absolute w-1/2 h-1/2 rounded-full filter blur-3xl bottom-0 right-0 animate-blob animation-delay-2000"
                    style={{ backgroundColor: `${themeStyles.secondary}4D` }}
                  ></div>
                  <div 
                    className="absolute w-1/2 h-1/2 rounded-full filter blur-3xl top-0 right-0 animate-blob animation-delay-4000"
                    style={{ backgroundColor: `${themeStyles.accent}33` }}
                  ></div>
                  <div className="absolute inset-0 bg-black/30"></div>
                  <div className="absolute bottom-4 left-6 flex items-end gap-6">
                    <div className="relative">
                      {group.coverImage ? (
                        <img
                          src={group.coverImage}
                          alt={group.name}
                          className="w-24 h-24 rounded-2xl object-cover border-4 border-white/20 shadow-xl transform transition-transform duration-500 hover:scale-105"
                        />                      ) : (
                        <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-white/30 to-white/10 backdrop-blur-lg flex items-center justify-center border-4 border-white/20 shadow-xl transform transition-transform duration-500 hover:scale-105">
                          <UsersIconSolid className="h-12 w-12 text-white" />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                
                {/* Content section with improved typography and spacing */}
                <div className="p-10 relative">
                  {/* Background decorative elements */}
                  <div className="absolute -right-10 -bottom-20 w-40 h-40 bg-blue-500/5 rounded-full filter blur-3xl"></div>
                  
                  <div className="text-center mb-8">
                    <h2 className="text-3xl font-bold text-white mb-4 leading-tight">{group.name}</h2>
                    <p className="text-gray-300 text-lg leading-relaxed max-w-xl mx-auto">{group.description}</p>
                  </div>
                  
                  <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-gray-400 mb-10">
                    <div className="flex items-center gap-3 bg-gray-700/30 backdrop-blur-md px-5 py-2.5 rounded-full border border-gray-700/50 shadow-inner">
                      <UsersIconSolid className="h-5 w-5 text-blue-400" />
                      <span className="font-medium">{group.memberCount} member{group.memberCount !== 1 ? 's' : ''}</span>
                    </div>
                    {group.isPrivate && (
                      <div className="flex items-center gap-3 bg-yellow-500/10 backdrop-blur-md text-yellow-400 px-5 py-2.5 rounded-full border border-yellow-500/30 shadow-inner">
                        <LockClosedIconSolid className="h-5 w-5" />
                        <span className="font-medium">Private Space</span>
                      </div>
                    )}
                  </div>

                  {/* Enhanced members only section with visual improvements */}
                  <div className="bg-gradient-to-br from-yellow-500/10 to-orange-500/10 border border-yellow-500/20 rounded-2xl p-8 mb-10 shadow-inner">
                    <div className="text-center">
                      <div className="relative mb-6 inline-block">
                        <div className="absolute inset-0 bg-yellow-500/20 rounded-full animate-pulse"></div>
                        <div className="absolute inset-0 bg-gradient-to-br from-yellow-500/30 to-orange-500/20 rounded-full blur-xl"></div>
                        <LockClosedIconSolid className="h-16 w-16 text-yellow-400 relative z-10" />
                      </div>
                      <h3 className="font-bold text-white mb-4 text-xl">Members Only Content</h3>
                      <p className="text-gray-300 leading-relaxed text-lg max-w-lg mx-auto">
                        This is a private space. Only members can view and interact with posts in this space. 
                        Join the space to participate in discussions and see exclusive content.
                      </p>
                    </div>
                  </div>                  {/* Enhanced action button with themed hover effects */}
                  <div className="text-center">
                    <button
                      onClick={() => navigate('/groups')}
                      className="group relative px-10 py-4 text-white rounded-xl font-semibold transition-all duration-500 transform hover:scale-105 shadow-lg"
                      style={{
                        background: `linear-gradient(to right, ${themeStyles.primary}, ${themeStyles.secondary})`,
                        ...createDynamicStyle('--hover-shadow-color', themeStyles.accent)
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = `linear-gradient(to right, ${themeStyles.accent}, ${themeStyles.primary})`;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = `linear-gradient(to right, ${themeStyles.primary}, ${themeStyles.secondary})`;
                      }}
                    >
                      <span className="relative z-10 flex items-center gap-3">
                        <ArrowLeftIcon className="h-6 w-6 transition-transform duration-500 group-hover:-translate-x-2" />
                        <span className="text-lg">Explore Other Spaces</span>
                      </span>
                      <div className="absolute inset-0 bg-gradient-to-r from-green-400 to-blue-400 rounded-xl opacity-0 group-hover:opacity-100 transition-all duration-500"></div>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        {joinSuccessModalPortal}
      </MainLayout>
    );
  }  // Member view
  return (
    <MainLayout>
  <div className="min-h-screen w-full">
        <div className="w-full px-0 sm:px-6 md:px-12 py-8 pb-20">
          <div className="max-w-7xl mx-auto">            {/* Simple Header with back button - edge-to-edge on mobile */}
            <div className="flex items-center justify-between mb-6 sm:mb-8 relative px-4 sm:px-0">
              <div className="absolute -left-10 -top-10 w-60 h-60 bg-green-500/10 rounded-full filter blur-3xl animate-pulse-slow opacity-60"></div>
              {/* Back button - hidden on mobile (we show a mobile-only one inside the cover) */}
              <div className="hidden sm:flex items-center gap-5">
                <button
                  onClick={() => navigate('/groups')}
                  className="group p-3.5 bg-gray-800/70 hover:bg-green-800/30 rounded-xl transition-all duration-300 border border-gray-700/50 hover:border-green-500/50 z-10 shadow-lg"
                >
                  <ArrowLeftIcon className="h-5 w-5 text-gray-400 group-hover:text-green-300 transition-colors group-hover:-translate-x-1 transform duration-300" />
                </button>
              </div>
              
              {/* Enhanced Group actions with improved visuals */}
              <div className="hidden sm:flex items-center gap-4 z-10">
                {userRole === 'admin' && (
                  <div className="relative group">
                    <button
                      onClick={(e) => { e.stopPropagation(); setShowSettingsDropdown(!showSettingsDropdown); }}
                      className="p-3.5 text-gray-400 hover:text-green-400 bg-gray-800/70 hover:bg-green-500/10 rounded-xl transition-all duration-300 border border-gray-700/50 hover:border-green-500/30 shadow-lg hover:shadow-green-500/20"
                      title="Space Settings"
                    >
                      <Cog6ToothIcon className="h-5 w-5 transform group-hover:rotate-45 transition-transform duration-500" />
                    </button>
                    <div className="absolute -top-1.5 -right-1.5">
                      <ShieldCheckIconSolid className="h-5 w-5 text-green-400" />
                    </div>
                    {/* Settings Dropdown Menu */}
          {showSettingsDropdown && (
                      <div 
            ref={settingsDropdownRefDesktop}
                        className="fixed sm:absolute right-4 sm:right-0 top-16 sm:top-12 bg-gray-800/95 backdrop-blur-xl border border-gray-700 rounded-xl shadow-2xl shadow-green-500/10 z-[9999] w-64 overflow-hidden"
                      >
                        <div className="p-3 border-b border-gray-700/50 bg-gradient-to-r from-green-900/30 to-gray-800/60">
                          <h3 className="text-sm font-medium text-white">Space Settings</h3>
                        </div>
                        <div className="p-1">
                          {/* Menu Items */}
                          <button
                            onClick={(e) => { e.stopPropagation(); handleOpenInviteModal(); }}
                            className="w-full flex items-center gap-3 p-3 text-sm text-gray-300 bg-transparent hover:bg-green-700/40 hover:text-white rounded-lg transition-colors"
                          >
                            <UserPlusIcon className="h-5 w-5 text-green-400" />
                            <span>Invite Members</span>
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleManageMembers(); }}
                            className="w-full flex items-center gap-3 p-3 text-sm text-gray-300 bg-transparent hover:bg-gray-700/50 hover:text-white rounded-lg transition-colors"
                          >
                            <UsersIcon className="h-5 w-5 text-blue-400" />
                            <span>Manage Members</span>
                          </button>
                          {/* Appearance Settings removed temporarily */}
              {/* Copy Space Code button for private spaces, admin only */}
              {group?.isPrivate && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleCopySpaceCode(); }}
                              className="w-full flex items-center gap-3 p-3 text-sm text-yellow-300 bg-transparent hover:bg-yellow-900/30 hover:text-yellow-200 rounded-lg transition-colors"
                            >
                              <LockClosedIcon className="h-5 w-5 text-yellow-400" />
                              <span>Copy Space Code</span>
                            </button>
                          )}
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteSpace(); }}
                            className="w-full flex items-center gap-3 p-3 text-sm text-red-400 bg-transparent hover:bg-red-900/30 hover:text-red-300 rounded-lg transition-colors"
                          >
                            <TrashIcon className="h-5 w-5" />
                            <span>Delete Space</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                <button
                  onClick={handleMessageSpace}
                  disabled={isOpeningChat}
                  className={`p-3.5 rounded-xl transition-all duration-300 border shadow-lg ${isOpeningChat ? 'text-gray-500 bg-gray-800/40 border-gray-700/30 cursor-wait' : 'text-gray-400 hover:text-blue-300 bg-gray-800/70 hover:bg-blue-500/10 border-gray-700/50 hover:border-blue-500/30 hover:shadow-blue-500/20'}`}
                  title="Message Space"
                  aria-label="Message Space"
                >
                  {isOpeningChat ? (
                    <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" aria-hidden="true">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                    </svg>
                  ) : (
                    <ChatBubbleLeftEllipsisIcon className="h-5 w-5" />
                  )}
                </button>
                {/* QR Code button - visible to admins and members alike (shows link to space) */}
                <button
                  onClick={openQrModal}
                  aria-label="QR Code"
                  title="QR Code"
                  className="p-3.5 text-gray-400 hover:text-blue-300 bg-gray-800/70 hover:bg-blue-500/10 rounded-xl transition-all duration-300 border border-gray-700/50 hover:border-blue-500/30 shadow-lg hover:shadow-blue-500/20"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M3 3h8v8H3V3zm2 2v4h4V5H5zM13 3h8v8h-8V3zm2 2v4h4V5h-4zM3 13h8v8H3v-8zm2 2v4h4v-4H5zM13 13h8v2h-2v2h2v4h-6v-8z"/></svg>
                </button>
                {/* Add View Members button for non-admins */}
                {userRole !== 'admin' && (
                  <button
                    onClick={() => setShowMembersModal(true)}
                    className="p-3.5 text-gray-400 hover:text-blue-400 bg-gray-800/70 hover:bg-blue-500/10 rounded-xl transition-all duration-300 border border-gray-700/50 hover:border-blue-500/30 shadow-lg hover:shadow-blue-500/20"
                    title="View Members"
                  >
                    <UsersIcon className="h-5 w-5" />
                  </button>
                )}
                {group?.creatorId !== currentUser?.id && (
                  <button
                    onClick={() => setShowLeaveModal(true)}
                    className="p-3.5 text-gray-400 hover:text-red-400 bg-gray-800/70 hover:bg-red-500/10 rounded-xl transition-all duration-300 border border-gray-700/50 hover:border-red-500/30 shadow-lg hover:shadow-red-500/20"
                    title="Leave Space"
                  >
                    <UserMinusIcon className="h-5 w-5 transform hover:scale-110 transition-transform duration-300" />
                  </button>
                )}
              </div>
            </div>            {/* Enhanced Group info with themed animated gradients - full width and edge-to-edge on mobile */}
            <div className="w-full bg-gray-800/40 backdrop-blur-2xl border-t border-b sm:border border-gray-700/30 rounded-none sm:rounded-3xl overflow-visible sm:overflow-hidden -mt-12 sm:mt-0 mb-6 sm:mb-10 sm:shadow-[0_20px_80px_-15px_rgba(0,200,100,0.15)] sm:hover:shadow-[0_20px_80px_-15px_rgba(0,200,100,0.25)] transition-all duration-700">
              {/* Cover/Header section with themed animated background */}
              <div 
                className="relative h-48 overflow-hidden"
                style={dynamicHeaderStyle}
              >                {/* Themed animated gradient blobs */}
                <div 
                  className="absolute w-1/2 h-1/2 rounded-full filter blur-3xl top-0 left-0 animate-blob"
                  style={{ backgroundColor: `${themeStyles.primary}66` }}
                ></div>
                <div 
                  className="absolute w-1/2 h-1/2 rounded-full filter blur-3xl bottom-0 right-0 animate-blob animation-delay-2000"
                  style={{ backgroundColor: `${themeStyles.secondary}4D` }}
                ></div>
                <div 
                  className="absolute w-1/2 h-1/2 rounded-full filter blur-3xl top-0 right-0 animate-blob animation-delay-4000"
                  style={{ backgroundColor: `${themeStyles.accent}33` }}
                ></div>
                
                <div className="absolute inset-0 bg-black/40"></div>
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
                
                {/* Floating elements with improved design */}
                <div className="absolute top-4 right-4 flex gap-2.5">
                  <div className="bg-white/10 backdrop-blur-md rounded-full px-4 py-1.5 text-xs text-white font-medium flex items-center gap-2 border border-white/10 shadow-lg">
                    <SparklesIcon className="h-3.5 w-3.5" />
                    <span>Active Space</span>
                  </div>
                  {userRole === 'admin' && (
                    <div className="bg-green-500/20 backdrop-blur-md rounded-full px-4 py-1.5 text-xs text-green-300 font-medium flex items-center gap-2 border border-green-500/20 shadow-lg">
                      <ShieldCheckIconSolid className="h-3.5 w-3.5" />
                      <span>Admin</span>
                    </div>
                  )}
                </div>

                {/* Mobile-only back button (top-left) and action buttons (top-right) placed inside cover */}
                <div className="absolute top-3 left-3 sm:hidden z-20">
                  <button
                    onClick={() => navigate('/groups')}
                    className="p-2.5 bg-gray-800/60 hover:bg-green-700/20 rounded-xl border border-gray-700/40 shadow-lg text-gray-300 transition-all duration-200"
                    aria-label="Back to spaces"
                  >
                    <ArrowLeftIcon className="h-4 w-4" />
                  </button>
                </div>

                {/* Mobile actions: positioned under the badge (vertical stack, right-aligned) */}
                <div className="absolute top-14 right-4 sm:hidden z-20 flex flex-col items-end gap-2.5">
                  {userRole === 'admin' && (
                    <div className="relative group">
                      <button
                        onClick={(e) => { e.stopPropagation(); setShowSettingsDropdown(!showSettingsDropdown); }}
                        className="p-2.5 text-gray-300 hover:text-green-400 bg-gray-800/60 hover:bg-green-500/10 rounded-xl transition-all duration-300 border border-gray-700/40 hover:border-green-500/30 shadow-lg"
                        title="Space Settings"
                      >
                        <Cog6ToothIcon className="h-4 w-4 transform group-hover:rotate-45 transition-transform duration-500" />
                      </button>
                      <div className="absolute -top-1 -right-1">
                        <ShieldCheckIconSolid className="h-4 w-4 text-green-400" />
                      </div>
            {showSettingsDropdown && (
                        <div 
              ref={settingsDropdownRefMobile}
                          className="fixed sm:absolute right-4 sm:right-0 top-16 sm:top-12 bg-gray-800/95 backdrop-blur-xl border border-gray-700 rounded-xl shadow-2xl shadow-green-500/10 z-[9999] w-56 overflow-hidden"
                        >
                          <div className="p-3 border-b border-gray-700/50 bg-gradient-to-r from-green-900/30 to-gray-800/60">
                            <h3 className="text-sm font-medium text-white">Space Settings</h3>
                          </div>
                          <div className="p-1">
                            <button
                              onClick={(e) => { e.stopPropagation(); handleOpenInviteModal(); }}
                              className="w-full flex items-center gap-3 p-3 text-sm text-gray-300 bg-transparent hover:bg-green-700/40 hover:text-white rounded-lg transition-colors"
                            >
                              <UserPlusIcon className="h-4 w-4 text-green-400" />
                              <span>Invite Members</span>
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleManageMembers(); }}
                              className="w-full flex items-center gap-3 p-3 text-sm text-gray-300 bg-transparent hover:bg-gray-700/50 hover:text-white rounded-lg transition-colors"
                            >
                              <UsersIcon className="h-4 w-4 text-blue-400" />
                              <span>Manage Members</span>
                            </button>
                            {/* Appearance Settings removed temporarily */}
              {group?.isPrivate && (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleCopySpaceCode(); }}
                                className="w-full flex items-center gap-3 p-3 text-sm text-yellow-300 bg-transparent hover:bg-yellow-900/30 hover:text-yellow-200 rounded-lg transition-colors"
                              >
                                <LockClosedIcon className="h-4 w-4 text-yellow-400" />
                                <span>Copy Space Code</span>
                              </button>
                            )}
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDeleteSpace(); }}
                              className="w-full flex items-center gap-3 p-3 text-sm text-red-400 bg-transparent hover:bg-red-900/30 hover:text-red-300 rounded-lg transition-colors"
                            >
                              <TrashIcon className="h-4 w-4" />
                              <span>Delete Space</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <button
                    onClick={handleMessageSpace}
                    disabled={isOpeningChat}
                    className={`p-2.5 rounded-xl transition-all duration-300 border shadow-lg ${isOpeningChat ? 'text-gray-500 bg-gray-800/50 border-gray-700/40 cursor-wait' : 'text-gray-300 hover:text-blue-300 bg-gray-800/60 hover:bg-blue-500/10 border-gray-700/40 hover:border-blue-500/30'}`}
                    title="Message Space"
                    aria-label="Message Space"
                  >
                    {isOpeningChat ? (
                      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" aria-hidden="true">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                      </svg>
                    ) : (
                      <ChatBubbleLeftEllipsisIcon className="h-4 w-4" />
                    )}
                  </button>

                  {userRole !== 'admin' && (
                    <button
                      onClick={() => setShowMembersModal(true)}
                      className="p-2.5 text-gray-300 hover:text-blue-400 bg-gray-800/60 hover:bg-blue-500/10 rounded-xl transition-all duration-300 border border-gray-700/40 hover:border-blue-500/30 shadow-lg"
                      title="View Members"
                    >
                      <UsersIcon className="h-4 w-4" />
                    </button>
                  )}

                  {group?.creatorId !== currentUser?.id && (
                    <button
                      onClick={() => setShowLeaveModal(true)}
                      className="p-2.5 text-gray-300 hover:text-red-400 bg-gray-800/60 hover:bg-red-500/10 rounded-xl transition-all duration-300 border border-gray-700/40 hover:border-red-500/30 shadow-lg"
                      title="Leave Space"
                    >
                      <UserMinusIcon className="h-4 w-4 transform hover:scale-110 transition-transform duration-300" />
                    </button>
                  )}
                  {/* Mobile QR button */}
                  <div className="sm:hidden">
                    <button
                      onClick={openQrModal}
                      className="p-2.5 mt-2 text-gray-300 hover:text-blue-300 bg-gray-800/60 hover:bg-blue-500/10 rounded-xl transition-all duration-300 border border-gray-700/40 hover:border-blue-500/30 shadow-lg"
                      title="QR Code"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M3 3h8v8H3V3zm2 2v4h4V5H5zM13 3h8v8h-8V3zm2 2v4h4V5h-4zM3 13h8v8H3v-8zm2 2v4h4v-4H5zM13 13h8v2h-2v2h2v4h-6v-8z"/></svg>
                    </button>
                  </div>
                </div>

                <div className="absolute bottom-6 left-6 flex items-end gap-6">
                  <div className="relative transform transition-transform duration-500 hover:scale-105">
                    {group.coverImage ? (
                      <img
                        src={group.coverImage}
                        alt={group.name}
                        className="w-28 h-28 rounded-2xl object-cover border-4 border-white/20 shadow-2xl"
                      />
                    ) : (
                      <div className="w-28 h-28 rounded-2xl bg-gradient-to-br from-white/30 to-white/10 backdrop-blur-lg flex items-center justify-center border-4 border-white/20 shadow-2xl">
                        <UsersIconSolid className="h-14 w-14 text-white" />
                      </div>                    )}
                  </div>
                  
                  <div className="text-white mb-2">
                    <h2 className="text-2xl font-bold mb-2">{group.name}</h2>
                    <p className="text-white/90 text-base leading-relaxed max-w-xl">
                      {group.description}
                    </p>
                  </div>
                </div>
              </div>
              
              {/* Stats section with improved visuals */}
              <div className="p-6 bg-gradient-to-r from-gray-800/50 to-gray-700/40 backdrop-blur-lg border-t border-white/5">                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex flex-wrap items-center gap-6">
                    <div 
                      className="flex items-center gap-2.5 px-4 py-2 rounded-xl border"
                      style={{ 
                        color: themeStyles.accent,
                        backgroundColor: `${themeStyles.primary}1A`,
                        borderColor: `${themeStyles.primary}33`
                      }}
                    >
                      <UsersIconSolid className="h-5 w-5" />
                      <span className="font-semibold">{group.memberCount}</span>
                      <span className="text-gray-300 text-sm">members</span>
                    </div>
                    <div 
                      className="flex items-center gap-2.5 px-4 py-2 rounded-xl border"
                      style={{ 
                        color: themeStyles.accent,
                        backgroundColor: `${themeStyles.secondary}1A`,
                        borderColor: `${themeStyles.secondary}33`
                      }}
                    >
                      <ChatBubbleLeftEllipsisIcon className="h-5 w-5" />
                      <span className="font-semibold">{posts.length}</span>
                      <span className="text-gray-300 text-sm">posts</span>
                    </div>
                    <div 
                      className="flex items-center gap-2.5 px-4 py-2 rounded-xl border"
                      style={{ 
                        color: themeStyles.accent,
                        backgroundColor: `${themeStyles.accent}1A`,
                        borderColor: `${themeStyles.accent}33`
                      }}
                    >
                      <ClockIcon className="h-5 w-5" />
                      <span className="text-gray-300 text-sm">
                        Created {new Date(group.createdAt.seconds * 1000).toLocaleDateString('en-US', { 
                          month: 'short', 
                          day: 'numeric',
                          year: 'numeric'
                        })}
                      </span>
                    </div>                  </div>
                </div>
              </div>
            </div>            {/* Main content area with edge-to-edge styling like homepage feed */}
            <div className="w-full space-y-2 sm:space-y-3">              {/* Enhanced Create Post - now edge-to-edge like homepage */}
              <div 
                className="w-full backdrop-blur-2xl border-t border-b sm:border rounded-none sm:rounded-2xl px-4 py-3 sm:px-5 sm:py-4 transition-all duration-500 -mt-4 sm:-mt-5"
                style={{
                  backgroundColor: 'rgba(31, 41, 55, 0.4)',
                  borderColor: `${themeStyles.primary}4D`,
                }}
              >
                <SpaceCreatePost 
                  groupId={groupId!}
                  onPost={handleCreatePost}
                  placeholder={`Share something amazing with ${group.name}...`}
                />              </div>

              {/* Enhanced Posts - now edge-to-edge like homepage */}
              <div className="w-full space-y-0 sm:space-y-1">                {postsLoading ? (
                  <div className="w-full flex justify-center py-16 relative overflow-hidden">
                    {/* Themed decorative elements */}
                    <div 
                      className="absolute w-1/4 h-1/4 rounded-full filter blur-3xl top-1/4 left-1/4 animate-blob"
                      style={{ backgroundColor: `${themeStyles.primary}0D` }}
                    ></div>
                    <div 
                      className="absolute w-1/4 h-1/4 rounded-full filter blur-3xl bottom-1/4 right-1/4 animate-blob animation-delay-2000"
                      style={{ backgroundColor: `${themeStyles.secondary}0D` }}
                    ></div>
                    
                    <div className="relative">
                      <div 
                        className="animate-spin rounded-full h-20 w-20 border-t-3 border-b-3"
                        style={{ borderTopColor: themeStyles.primary, borderBottomColor: themeStyles.primary }}
                      ></div>
                      <div 
                        className="absolute inset-0 rounded-full border-3"
                        style={{ borderColor: `${themeStyles.primary}33` }}
                      ></div>
                      <div 
                        className="absolute inset-0 rounded-full border-3 border-t-transparent border-b-transparent animate-pulse"
                        style={{ 
                          borderRightColor: `${themeStyles.accent}66`,
                          borderLeftColor: `${themeStyles.accent}66`
                        }}
                      ></div>
                    </div>
                  </div>                ) : posts.length > 0 ? (                  <div>                    <div className="flex flex-col space-y-2 sm:space-y-4">
                      {posts.map((post) => (
                        <div 
                          key={post.id} 
                          className="transform transition-all duration-500 sm:hover:scale-[1.01] sm:hover:shadow-xl mb-0 sm:mb-0"
                        >
                          <SpacePostCard 
                            post={post} 
                            onDeletePost={handleDeletePost}
                          />
                        </div>
                      ))}
                    </div>
                    
                    {/* No more posts to load indicator */}
                    {!postsLoading && posts.length > 0 && (
                      <div className="flex flex-col items-center justify-center py-6 sm:py-8 animate-fadeInSlow">
                        <div 
                          className="inline-flex items-center justify-center w-12 h-12 rounded-full mb-2 shadow-lg"
                          style={{ 
                            background: `linear-gradient(to bottom right, ${themeStyles.primary}30, ${themeStyles.secondary}20)` 
                          }}
                        >
                          <span className="material-icons text-3xl animate-bounce" style={{ color: themeStyles.accent }}>
                            hourglass_empty
                          </span>
                        </div>
                        <span className="text-gray-400 text-sm sm:text-base font-semibold tracking-wide select-none">
                          No more posts to load
                        </span>
                      </div>
                    )}
                  </div>) : (
                  <div className="w-full bg-gray-800/40 backdrop-blur-2xl border-t border-b sm:border border-gray-700/30 rounded-none sm:rounded-2xl p-16 text-center transition-all duration-500 relative overflow-hidden">
                    {/* Themed decorative elements */}
                    <div 
                      className="absolute w-1/3 h-1/3 rounded-full filter blur-3xl top-0 left-1/4 animate-blob"
                      style={{ backgroundColor: `${themeStyles.primary}0D` }}
                    ></div>
                    <div 
                      className="absolute w-1/3 h-1/3 rounded-full filter blur-3xl bottom-0 right-1/4 animate-blob animation-delay-2000"
                      style={{ backgroundColor: `${themeStyles.secondary}0D` }}
                    ></div>
                    
                    <div className="relative mb-8 inline-block">
                      <div 
                        className="absolute inset-0 rounded-full animate-pulse"
                        style={{ backgroundColor: `${themeStyles.primary}33` }}
                      ></div>
                      <div 
                        className="absolute inset-0 rounded-full blur-xl"
                        style={{ 
                          background: `linear-gradient(to bottom right, ${themeStyles.primary}4D, ${themeStyles.accent}33)`
                        }}
                      ></div>
                      <ChatBubbleLeftEllipsisIcon 
                        className="h-20 w-20 relative z-10"
                        style={{ color: themeStyles.accent }}
                      />
                    </div>
                    <h3 className="text-2xl font-bold text-white mb-4 relative z-10">No posts yet</h3>
                    <p className="text-gray-400 leading-relaxed max-w-md mx-auto text-lg relative z-10">
                      Be the first to spark a conversation in this space! Share your thoughts, ideas, or updates to engage with the community.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* Leave Group Confirm Dialog */}
      {/* QR Code Modal */}
      {qrModalOpen && typeof document !== 'undefined' && ReactDOM.createPortal(
        <div className="fixed inset-0 z-[2147483646] pointer-events-none">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm animate-fadeIn pointer-events-auto" onClick={closeQrModal} />
          <div className="fixed inset-0 flex items-center justify-center px-4">
            <div className="w-full max-w-md pointer-events-auto inline-block bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl border border-sky-500/30 shadow-xl shadow-sky-800/20 text-left transform transition-all duration-300 ease-out animate-modalSlideIn" onClick={(e)=>e.stopPropagation()}>
              <div className="relative p-6 pt-8 space-y-4">
                <h3 className="text-lg font-bold text-sky-300">QR Code</h3>
                <p className="text-sm text-gray-300">Scan to open this space on another device or copy the link.</p>
                <div className="flex flex-col items-center mt-4">
                  <img src={qrSrc} alt={`QR code for ${group?.name || 'space'}`} className="w-40 h-40 bg-white p-1 rounded-md" />
                  <p className="mt-3 text-xs text-gray-400 text-center">Scan to open this space on another device.</p>
                  <div className="mt-4 flex gap-3">
                    <button onClick={() => window.open(spaceLink, '_blank')} className="px-4 py-2 bg-gradient-to-r from-sky-600 to-blue-700 hover:from-sky-500 hover:to-blue-600 text-white rounded-lg text-sm">Open link</button>
                    <button onClick={() => { navigator.clipboard.writeText(spaceLink); }} className="px-4 py-2 bg-gray-800 border border-gray-700 text-gray-200 rounded-lg text-sm">Copy link</button>
                  </div>
                </div>
                <div className="mt-6 flex justify-center">
                  <button onClick={closeQrModal} className="px-6 py-2 bg-gradient-to-r from-sky-600 to-blue-700 hover:from-sky-500 hover:to-blue-600 text-white rounded-lg font-medium">Close</button>
                </div>
              </div>
            </div>
          </div>
        </div>, document.body)}

      <ConfirmDialog
        open={showLeaveModal}
        title="Leave Space"
        message={
          <div className="space-y-3">
            <p>
              Are you sure you want to leave <span className="font-semibold text-white">"{group.name}"</span>? You will need to be invited again to rejoin.
            </p>
            {userRole === 'admin' && (
              <div className="mt-1 text-yellow-300 bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <ShieldCheckIcon className="h-5 w-5 text-yellow-400" />
                  <p className="text-xs sm:text-sm">
                    You are an admin of this space. Consider promoting another member before leaving.
                  </p>
                </div>
              </div>
            )}
          </div>
        }
        confirmLabel={isLeavingGroup ? 'Leaving…' : 'Leave Space'}
        cancelLabel="Cancel"
        confirmTone="danger"
        isProcessing={isLeavingGroup}
        onConfirm={handleLeaveGroup}
        onCancel={() => setShowLeaveModal(false)}
      />

      {showInviteModal && typeof document !== 'undefined' && ReactDOM.createPortal(
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) handleCloseInviteModal(); }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="invite-members-title"
        >
          <div
            className="relative bg-gradient-to-br from-[#161821] via-[#1f2129] to-[#12131a] rounded-2xl w-full max-w-lg shadow-[0_25px_50px_-12px_rgba(0,0,0,0.75)] border border-gray-700/30 overflow-hidden flex flex-col max-h-[80vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500/10 border border-green-400/20">
                  <UserPlusIcon className="h-5 w-5 text-green-400" />
                </div>
                <div>
                  <h2 id="invite-members-title" className="text-lg font-semibold text-white">Invite Members</h2>
                  <p className="text-xs text-gray-400">Send space invitations instantly</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCloseInviteModal}
                className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
                aria-label="Close"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <div className="px-6 py-4 space-y-3 overflow-y-auto flex-1">
              <div className="relative">
                <input
                  type="text"
                  value={inviteSearch}
                  onChange={(e) => setInviteSearch(e.target.value)}
                  placeholder="Search by name or email"
                  className="w-full pl-3 pr-10 py-2 text-sm bg-white/5 rounded-md border border-white/10 placeholder:text-gray-400 text-gray-100 focus:outline-none focus:ring-1 focus:ring-green-500"
                />
                {inviteSearchLoading && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <span className="material-icons text-sm text-gray-400 animate-spin">autorenew</span>
                  </div>
                )}
              </div>

              {inviteStatus && (
                <div
                  className={`px-3 py-2 rounded-md text-sm border ${inviteStatus.type === 'success' ? 'bg-green-500/10 border-green-500/30 text-green-300' : 'bg-red-500/10 border-red-500/30 text-red-300'}`}
                >
                  {inviteStatus.message}
                </div>
              )}

              {inviteError && (
                <div className="px-3 py-2 rounded-md text-sm bg-red-500/10 border border-red-500/30 text-red-300">
                  {inviteError}
                </div>
              )}

              <div className="space-y-2">
                {inviteLoading && inviteDisplayUsers.length === 0 ? (
                  <div className="flex justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-green-500"></div>
                  </div>
                ) : inviteDisplayUsers.length > 0 ? (
                  <ul className="space-y-2">
                    {inviteDisplayUsers.map(user => {
                      const isInvited = user.id ? inviteSentIds.has(user.id) : false;
                      const isProcessing = inviteSendingId === user.id;
                      return (
                        <li key={user.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/3 border border-white/5">
                          <img
                            src={user.profile_pic || '/images/default-avatar.png'}
                            alt={user.name || 'User'}
                            className="h-9 w-9 rounded-full object-cover"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-white font-medium truncate">{user.name || 'Unknown User'}</p>
                            <p className="text-xs text-gray-400 truncate">{user.email || 'No email available'}</p>
                            {user.department && (
                              <p className="text-[11px] text-gray-500 mt-0.5 truncate">{user.department}</p>
                            )}
                          </div>
                          <button
                            onClick={() => handleSendInvite(user)}
                            disabled={isInvited || isProcessing}
                            className={`px-3 py-1.5 text-xs rounded-md font-semibold transition-colors ${
                              isInvited
                                ? 'bg-green-700/40 text-green-200 cursor-default border border-green-600/50'
                                : isProcessing
                                  ? 'bg-green-700/40 text-green-200 border border-green-600/50 cursor-wait'
                                  : 'bg-green-600/80 hover:bg-green-500 text-white border border-green-500/70'
                            }`}
                          >
                            {isInvited ? 'Invited' : isProcessing ? 'Inviting…' : 'Invite'}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  (!inviteLoading && !inviteSearchLoading) && (
                    <div className="text-center py-10 text-sm text-gray-400">
                      {inviteSearchActive ? 'No users match your search.' : 'Everyone you can invite is already part of this space.'}
                    </div>
                  )
                )}
              </div>
            </div>

            <div className="px-6 py-3 border-t border-white/5 bg-black/20 flex items-center justify-between gap-3">
              <span className="text-xs text-gray-400">
                {inviteSearchActive
                  ? `Showing ${inviteDisplayUsers.length} result${inviteDisplayUsers.length === 1 ? '' : 's'}`
                  : `Loaded ${inviteCandidates.length} potential member${inviteCandidates.length === 1 ? '' : 's'}`}
              </span>
              {!inviteSearchActive && (
                <button
                  onClick={() => loadInviteBatch('more')}
                  disabled={!inviteHasMore || inviteLoadingMore || inviteLoading}
                  className={`px-3 py-1.5 text-xs rounded-md font-semibold transition-colors ${(!inviteHasMore || inviteLoadingMore || inviteLoading)
                    ? 'bg-gray-700/50 text-gray-400 cursor-not-allowed'
                    : 'bg-green-600/80 hover:bg-green-500 text-white border border-green-500/70'}`}
                >
                  {inviteLoadingMore ? 'Loading…' : inviteHasMore ? 'Load More' : 'All Loaded'}
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Members Management Modal (restyled like ConfirmDialog) */}
      {showMembersModal && typeof document !== 'undefined' && ReactDOM.createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setShowMembersModal(false); }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="manage-members-title"
        >
          <div
            className="relative bg-gradient-to-br from-[#1a1b23] via-[#242526] to-[#1e1f24] rounded-2xl w-full max-w-md shadow-[0_25px_50px_-12px_rgba(0,0,0,0.8)] border border-gray-700/30 overflow-hidden modal-entry flex flex-col max-h-[80vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500/10 border border-blue-400/20">
                  <UsersIcon className="h-5 w-5 text-blue-400" />
                </div>
                <div>
                  <h2 id="manage-members-title" className="text-lg font-semibold text-white">Manage Members</h2>
                  <p className="text-xs text-gray-400">{members.length} member{members.length !== 1 ? 's' : ''}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowMembersModal(false)}
                className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
                aria-label="Close"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            {/* Body: Members list with search */}
            <div className="px-5 py-4 text-gray-200 text-sm overflow-y-auto space-y-3 flex-1">
              {/* Search */}
              <div className="mb-3">
                <label className="sr-only">Search members</label>
                <div>
                  <input
                    type="text"
                    value={memberSearch}
                    onChange={(e) => setMemberSearch(e.target.value)}
                    placeholder="Search by name or email"
                    className="w-full pl-3 pr-3 py-2 text-sm bg-white/3 rounded-md border border-white/5 placeholder:text-gray-400 text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
              {paginatedMembers.length === 0 ? (
                <div className="py-8 text-center">
                  <UsersIcon className="h-10 w-10 text-gray-600 mx-auto mb-3" />
                  <p className="text-gray-400">No members found</p>
                </div>
              ) : (
                <ul className="space-y-2">
                  {paginatedMembers.map(member => (
                    <li key={member.id} className="flex items-center gap-3 px-2 py-1 rounded-md bg-white/3 border border-white/5">
                      <img
                        src={member.user.profile_pic || '/images/default-avatar.png'}
                        alt={member.user.name || 'User'}
                        className="h-7 w-7 rounded-full object-cover"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 text-xs sm:text-sm">
                          <span className="text-white font-medium truncate">{member.user.name || 'Unknown User'}</span>
                          {group && member.userId === group.creatorId && (
                            <span className="text-[10px] bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded-full">Creator</span>
                          )}
                          {currentUser?.id === member.userId && (
                            <span className="text-[10px] bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full">You</span>
                          )}
                        </div>
                        <p className="text-[10px] text-gray-400 mt-0.5">Joined {new Date(member.joinedAt.seconds * 1000).toLocaleDateString()}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Footer: Pagination (compact) */}
            <div className="px-5 py-3 flex items-center justify-between gap-4 border-t border-white/5 bg-black/20">
              <span className="text-xs text-gray-400">Page {currentPage} of {totalPages}</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1 rounded-md text-xs bg-gray-700/50 text-gray-200 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
                >Prev</button>
                <button
                  type="button"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1 rounded-md text-xs bg-gray-700/50 text-gray-200 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
                >Next</button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {joinSuccessModalPortal}
    </MainLayout>
  );
};

export default GroupPage;
