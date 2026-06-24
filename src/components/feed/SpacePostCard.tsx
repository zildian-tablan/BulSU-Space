import React, { useState, useEffect, useRef } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import DOMPurify from 'dompurify';
import { useAuth } from '../../contexts/AuthContext';
import { SpacePost, MediaItem as SpaceMediaItem } from '../../models/SpacePost';
import { Comment } from '../../models/Post';
import RoleBadge from '../common/RoleBadge';
import {
  addSpacePostReaction,
  deleteSpacePost,
  getSpacePostReactionStatusRealtime,
  addSpacePostComment,
  deleteSpacePostComment,
  getSpacePostCommentsRealtime,
  getSpaceRepliesRealtime,
  deleteSpaceReply
} from '../../services/spacePostService';
import { getUserNameRealtime, getUserProfilePicRealtime } from '../../services/userNameService';
import { getGroupById } from '../../services/groupService';
import { 
  HeartIcon, 
  ChatBubbleLeftIcon, 
  EllipsisHorizontalIcon, 
  PencilIcon,
  TrashIcon,
  PaperAirplaneIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';
import { DocumentTextIcon } from '@heroicons/react/24/outline';
import { 
  HeartIcon as HeartIconSolid
  
} from '@heroicons/react/24/solid';
import { Timestamp, doc, getDoc, onSnapshot, collection, getDocs, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import FirebaseImage from '../common/FirebaseImage';
import ReactDOM from 'react-dom';
import FullScreenSpacePost from './FullScreenSpacePost';
import { ArrowDownTrayIcon, ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { processStorageUrl, getStorageDownloadUrl } from '../../firebase/storage-proxy';
import { storage } from '../../firebase/config';
import { ref as storageRef, uploadBytes, deleteObject } from 'firebase/storage';
import { v4 as uuidv4 } from 'uuid';
import { isMobileDevice } from '../../utils/mobileUtils';
import { useSocialActivityTracking } from '../../hooks/useActivityTracking';
import ConfirmDialog from '../common/ConfirmDialog';
import { updateSpacePost } from '../../services/spacePostService';

interface SpacePostCardProps {
  post: SpacePost;
  onPostUpdated?: () => void;
  // If provided, parent will handle deletion (async allowed). If not provided, component will perform delete itself.
  onDeletePost?: (postId: string) => Promise<void> | void;
}

const SpacePostCard: React.FC<SpacePostCardProps> = ({ 
  post, 
  onPostUpdated,
  onDeletePost 
}) => {  const { currentUser } = useAuth();
  const { logCommentAdd, logReactionAdd } = useSocialActivityTracking();
  const [hasReacted, setHasReacted] = useState(false);
  const [reactionCount, setReactionCount] = useState(post.reactionCount || 0);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUserSpaceAdmin, setIsUserSpaceAdmin] = useState(false);
  const [isPinned, setIsPinned] = useState(post.isPinned || false);
  // Unified confirm dialog state for deletions
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; kind: 'post' | 'comment'; targetId?: string }>({ open: false, kind: 'post' });
  const [isProcessingDelete, setIsProcessingDelete] = useState(false);
  // Edit state
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(post.content);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  // Editable media state for replace/remove during edit
  const [editedMedia, setEditedMedia] = useState<SpaceMediaItem[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const replaceIndexRef = useRef<number | null>(null);
  
  // Comments state
  const [showComments, setShowComments] = useState(false);  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState('');
  // Reply state for space posts
  const [replyToCommentId, setReplyToCommentId] = useState<string | null>(null);
  // Map of commentId -> replies
  const [repliesMap, setRepliesMap] = useState<Record<string, Comment[]>>({});
  const [commentCount, setCommentCount] = useState(post.commentCount || 0);
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);  const [viewCount, setViewCount] = useState(post.viewCount || 0);
  const [spaceAdminUsers, setSpaceAdminUsers] = useState<Set<string>>(new Set());
  
  // Full-screen desktop modal state & helpers
  const [isFullscreen, setIsFullscreen] = useState(false);
  const prevShowCommentsRef = useRef<boolean>(false);
  const fullscreenMenuBtnRef = useRef<HTMLButtonElement | null>(null); // anchor for dropdown reuse if needed later

  const [isMobile, setIsMobile] = useState(isMobileDevice());
  // Image preview state (mimic PostCard behavior)
  const [previewOpen, setPreviewOpen] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [previewImages, setPreviewImages] = useState<string[]>([]);
  // Video preview state
  const [videoPreviewOpen, setVideoPreviewOpen] = useState(false);
  const [previewVideoUrl, setPreviewVideoUrl] = useState<string | null>(null);
  // File preview state
  const [filePreviewOpen, setFilePreviewOpen] = useState(false);
  const [previewFile, setPreviewFile] = useState<{ url: string; name: string; ext: string } | null>(null);
  
  // Dynamic user name and profile picture state
  const [displayName, setDisplayName] = useState(post.userName);
  const [profilePic, setProfilePic] = useState(post.userProfilePic);
  // Heart animation state for pop heart effect (match PostCard)
  const [showHeartAnimation, setShowHeartAnimation] = useState(false);
  // Theme colors for the space (fallback to green theme)
  const [spaceTheme, setSpaceTheme] = useState<{
    primaryColor: string;
    secondaryColor?: string;
    accentColor?: string;
    textColor?: string;
    bgColor?: string;
  } | null>(null);
  
  // Real-time listener for user name and profile picture changes
  useEffect(() => {
    if (!post.userId) return () => {};
    
    const unsubscribeName = getUserNameRealtime(post.userId, (name) => {
      if (name && name !== displayName) {
        setDisplayName(name);
      }
    });
    
    const unsubscribePic = getUserProfilePicRealtime(post.userId, (pic) => {
      if (pic && pic !== profilePic) {
        setProfilePic(pic);
      }
    });
    
    return () => {
      unsubscribeName();
      unsubscribePic();
    };
  }, [post.userId, displayName, profilePic]);

  // Fetch space/group theme colors for styling action buttons
  useEffect(() => {
    let mounted = true;
    const fetchTheme = async () => {
      try {
        if (!post.groupId) return;
        const group = await getGroupById(post.groupId);
        if (mounted && group && group.themeColors) {
          setSpaceTheme(group.themeColors as any);
        }
      } catch (error) {
        // ignore
      }
    };
    fetchTheme();
    return () => {
      mounted = false;
    };
  }, [post.groupId]);

  // Derived inline style for action buttons
  const actionColor = spaceTheme?.primaryColor || '#10b981';
  const actionStyle: React.CSSProperties = { color: actionColor };
  // Effect to check if the post creator is a space admin
  useEffect(() => {
    const checkSpaceAdminStatus = async () => {
      try {
        // Import needed only when function is called
        const { isGroupMember, getGroupMembers } = await import('../../services/groupService');
        const postUserId = post.userId;
        const groupId = post.groupId;
        
        // Check if the user is a member of the space
        const isMember = await isGroupMember(postUserId, groupId);
        if (isMember) {
          // Get all members with their roles
          const groupMembers = await getGroupMembers(groupId);
          // Check if this user is an admin in this specific space
          const userMembership = groupMembers.find(member => member.userId === postUserId);
          setIsUserSpaceAdmin(userMembership?.role === 'admin' || userMembership?.role === 'moderator');
          
          // Also populate the space admin users set for comments
          const adminUserIds = new Set<string>();
          groupMembers.forEach(member => {
            if (member.role === 'admin' || member.role === 'moderator') {
              adminUserIds.add(member.userId);
            }
          });
          setSpaceAdminUsers(adminUserIds);
        }
      } catch (error) {
        console.error('Error checking space admin status:', error);
        setIsUserSpaceAdmin(false);
        setSpaceAdminUsers(new Set());
      }
    };
      checkSpaceAdminStatus();
  }, [post.userId, post.groupId]);

  // Mobile detection effect
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(isMobileDevice());
    };

    handleResize(); // Set initial state
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Setup real-time listener for reactions
  useEffect(() => {
    let unsubscribe: () => void = () => {};
    
    if (currentUser) {      unsubscribe = getSpacePostReactionStatusRealtime(
        post.id, 
        currentUser.id, 
        (hasReacted, count) => {
          if (hasReacted !== null) {
            setHasReacted(hasReacted);
          }
          if (count !== -1) {
            setReactionCount(count);
          }
        },
        (updatedPost) => {
          // Update other post properties when they change
          if (updatedPost) {
            if (updatedPost.isPinned !== undefined) {
              setIsPinned(updatedPost.isPinned);
            }
            if (updatedPost.commentCount !== undefined) {
              setCommentCount(updatedPost.commentCount);
            }
            if (updatedPost.viewCount !== undefined) {
              setViewCount(updatedPost.viewCount);
            }
          }
        }
      );
    } else {
      // If no user is logged in, just update the reaction count
      setReactionCount(post.reactionCount || 0);
      setHasReacted(false);
    }
    
    return () => unsubscribe();
  }, [post.id, currentUser]);
  // Comments + replies real-time listeners
  useEffect(() => {
    let unsubscribeComments: () => void = () => {};
    const unsubscribeReplies: (() => void)[] = [];

    if (showComments) {
      unsubscribeComments = getSpacePostCommentsRealtime(post.id, (newComments) => {
        setComments(newComments);

        // Rebuild reply listeners whenever the top-level comment list changes.
        unsubscribeReplies.forEach((u) => u());
        unsubscribeReplies.length = 0;

        newComments.forEach((comment) => {
          const unsubscribeReply = getSpaceRepliesRealtime(post.id, comment.id, (replies) => {
            setRepliesMap((prev) => ({ ...prev, [comment.id]: replies }));
          });
          unsubscribeReplies.push(unsubscribeReply);
        });

        // Get the post to ensure we have the latest commentCount from the database
        const getUpdatedPost = async () => {
          try {
            const postRef = doc(db, 'spacePosts', post.id);
            const postSnap = await getDoc(postRef);
            if (postSnap.exists()) {
              const postData = postSnap.data();
              // Use the database's commentCount as source of truth
              if (postData && postData.commentCount !== undefined) {
                setCommentCount(postData.commentCount);
              }
            }
          } catch (error) {
            console.error('Error fetching updated space post:', error);
          }
        };

        // Fetch updated post data when comments change
        getUpdatedPost();

        // If the comment count doesn't match, notify the parent component
        if (newComments.length !== commentCount && onPostUpdated) {
          onPostUpdated();
        }
      });
    } else {
      setRepliesMap({});
    }

    return () => {
      unsubscribeComments();
      unsubscribeReplies.forEach((u) => u());
    };
  }, [post.id, showComments, onPostUpdated, commentCount]);  

  // Always listen for post document changes for real-time counts
  useEffect(() => {
    // Create a dedicated listener just for the post document to track counts
    const postRef = doc(db, 'spacePosts', post.id);
    
    console.log(`[SpacePostCard] Setting up post document listener for post ${post.id}`);
    
    const unsubscribe = onSnapshot(postRef, (docSnapshot) => {
      if (docSnapshot.exists()) {
        const postData = docSnapshot.data();
        
        // Get actual number of comments to ensure accuracy
        const getActualCommentCount = async () => {
          try {
            // Query to count the actual number of comments
            const commentsRef = collection(db, 'spacePosts', post.id, 'comments');
            const commentsSnapshot = await getDocs(commentsRef);
            const actualCommentCount = commentsSnapshot.size;

            // Get the stored commentCount from the post document
            const storedCommentCount = postData.commentCount || 0;
            
            console.log(`[SpacePostCard] Actual comment count: ${actualCommentCount}, stored: ${storedCommentCount}`);
            
            // If there's a mismatch, update the post document with the correct count
            if (actualCommentCount !== storedCommentCount) {
              console.log(`[SpacePostCard] Fixing comment count mismatch for post ${post.id}`);
              await updateDoc(postRef, {
                commentCount: actualCommentCount
              });
              // Use the actual count for the UI
              setCommentCount(actualCommentCount);
              return actualCommentCount;
            }
            return storedCommentCount;
          } catch (error) {
            console.error('Error getting actual comment count:', error);
            return postData.commentCount || 0;
          }
        };
        
        // Get data from the post document
        const newReactionCount = postData.reactionCount || 0;
        const newViewCount = postData.viewCount || 0;
        
        console.log(`[SpacePostCard] Post document updated: commentCount=${postData.commentCount || 0}, reactionCount=${newReactionCount}, viewCount=${newViewCount}`);
        
        // Immediately update reaction and view counts
        setReactionCount(newReactionCount);
        setViewCount(newViewCount);
        
        // Verify and update comment count
        getActualCommentCount();
        
        // Notify the parent about updates
        if (onPostUpdated) {
          onPostUpdated();
        }
      }
    });
    
    return () => unsubscribe();
  }, [post.id, onPostUpdated]); // Remove the dependencies on counts to ensure this always listens for server updates

  // Sync with post prop on initial mount and when post ID changes
  useEffect(() => {
    // Initialize state from post props when the post changes
    setCommentCount(post.commentCount || 0);
    setIsPinned(post.isPinned || false);
    setViewCount(post.viewCount || 0);
    setReactionCount(post.reactionCount || 0);
  }, [post.id]); // Only sync when post ID changes, otherwise rely on real-time updates

  // Handle adding a new comment
  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim() || !currentUser) return;
    
    setIsSubmittingComment(true);
    try {
      // Optimistically update the UI for better responsiveness
      const optimisticComment: Comment = {
        id: 'temp-' + Date.now(),
        postId: post.id,
        userId: currentUser.id,
        userName: currentUser.name || '',
        userProfilePic: currentUser.profile_pic || '',
        userRole: currentUser.role || 'student',
        content: commentText,
  replyTo: replyToCommentId || null,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        isEdited: false
      };
      
      // We'll get the real comment count from the database in the real-time listener
      // No need to manually update comment count here
      
      // Add the comment to the local comments array for immediate feedback
      setComments(prevComments => [...prevComments, optimisticComment]);
        // Actually add the comment to the database
  const commentId = await addSpacePostComment(post.id, currentUser.id, commentText, replyToCommentId || null);
      
      // Log the comment activity
      await logCommentAdd(commentId, post.id);
      
  setCommentText('');
  setReplyToCommentId(null);
      
      // Notify the parent component about the update
      if (onPostUpdated) {
        onPostUpdated();
      }
    } catch (error) {
      console.error('Error adding comment:', error);
      // Revert optimistic update if there was an error
      setCommentCount(prevCount => prevCount - 1);
    } finally {
      setIsSubmittingComment(false);
    }
  };
  // Handle deleting a comment
  const handleDeleteComment = async (commentId: string, commentUserId: string) => {
    if (!currentUser) return;
    
    // Check if current user is admin or superadmin
    const userRole = currentUser?.role as string | undefined;
    const isAdminOrSuperAdmin = userRole === 'admin' || userRole === 'super admin';
    
    try {
      // Optimistically update the UI
      setCommentCount(prevCount => Math.max(0, prevCount - 1));
      
      // Remove the comment from the local comments array
      setComments(prevComments => prevComments.filter(c => c.id !== commentId));
        // Actually delete the comment from the database
      await deleteSpacePostComment(post.id, commentId, currentUser.id, isAdminOrSuperAdmin);
      
      // Notify the parent component about the update
      if (onPostUpdated) {
        onPostUpdated();
      }
    } catch (error) {
      console.error('Error deleting comment:', error);
      // Revert optimistic update if there was an error
      setCommentCount(prevCount => prevCount + 1);
      // Show error message
      alert('Failed to delete comment. You may not have permission or the comment no longer exists.');
    }
  };  const handleReaction = async () => {
    if (!currentUser) return;

    // Store original state for potential rollback outside try/catch for proper scope
    const originalHasReacted = hasReacted;
    const originalCount = reactionCount;

    try {
      // Optimistically update UI for better responsiveness
      setHasReacted(!originalHasReacted);
      setReactionCount(originalHasReacted ? originalCount - 1 : originalCount + 1);
      // Play animation and sound when adding a reaction (only on like)
      if (!originalHasReacted) {
        setShowHeartAnimation(true);
        try {
          const audio = new window.Audio('/audio/pop-heart-sound.mp3');
          audio.play();
        } catch (e) {
          // ignore audio errors
        }
        // Reset animation after it completes
        setTimeout(() => setShowHeartAnimation(false), 600);
      }
      
      // Make the actual API call
      await addSpacePostReaction(post.id, currentUser.id);
      
      // Log the reaction activity
      await logReactionAdd('like', post.id);
      
      // The real-time listener will update the state if needed
    } catch (error) {
      // Revert optimistic update on error
      console.error('Error reacting to post:', error);
      
      // Show error message to user
      alert('Failed to update reaction. Please try again.');
      
      // Only revert if real-time updates aren't working
      // This prevents UI flicker when the real-time listener would update anyway
      setTimeout(() => {
        // Check if state was updated by real-time listener already
        if (hasReacted === !originalHasReacted) {
          // If not updated by listener, revert to original state
          setHasReacted(originalHasReacted);
          setReactionCount(originalCount);
        }
      }, 1000); // Give real-time listener a chance to update first
    }
  };

  const performDeletePost = async () => {
    if (!currentUser) return;
    setIsDeleting(true);
    try {
      if (onDeletePost) {
        await onDeletePost(post.id);
      } else {
        await deleteSpacePost(post.id, currentUser.id);
      }
    } catch (error) {
      console.error('Error deleting post:', error);
      alert('Failed to delete post. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleConfirmDelete = async () => {
    setIsProcessingDelete(true);
    try {
      if (confirmDialog.kind === 'post') {
        await performDeletePost();
      } else if (confirmDialog.kind === 'comment' && confirmDialog.targetId) {
        await handleDeleteComment(confirmDialog.targetId, '');
      }
    } finally {
      setIsProcessingDelete(false);
      setConfirmDialog(prev => ({ ...prev, open: false, targetId: undefined }));
    }
  };
  
  const handlePin = async () => {
    
    console.log('Pin functionality has been removed');
  };

  // Handle mobile card click to open full-screen view
  const handleMobileCardClick = (e: React.MouseEvent) => {
    // Don't open modal if clicking on interactive elements
    const target = e.target as HTMLElement;
    const isInteractiveElement = target.closest('button, a, input, textarea, .dropdown, .actions');
    
    if (!isInteractiveElement && isMobile) {
      
    }
  };

  // Unified comment action: always open fullscreen (comments only available there)
  const handleCommentAction = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setIsFullscreen(true);
  };

  // Remember prior comment visibility & lock body scroll when fullscreen
  useEffect(() => {
    if (isFullscreen) {
      prevShowCommentsRef.current = showComments;
      setShowComments(true); // always show comments inside fullscreen for richer context
      document.body.style.overflow = 'hidden';
    } else {
      setShowComments(prevShowCommentsRef.current);
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isFullscreen]);

  // Escape key closes fullscreen
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape' && isFullscreen) setIsFullscreen(false); };
    if (isFullscreen) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isFullscreen]);

  const openImagePreview = (images: string[], startIndex: number) => {
    setPreviewImages(images);
    setCurrentImageIndex(startIndex);
    setPreviewOpen(true);
  };

  const openVideoPreview = (url: string) => {
    setPreviewVideoUrl(url);
    setVideoPreviewOpen(true);
  }

  const openFilePreview = (url: string, name: string, ext: string) => {
    setPreviewFile({ url, name, ext });
    setFilePreviewOpen(true);
  }

  const downloadImage = async (url: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      // pick sensible filename
      link.download = `media-${Date.now()}.${(url.split('.').pop() || 'jpg').split('?')[0]}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      console.error('Failed to download media:', error);
    }
  };

  const goToPrevious = () => {
    setCurrentImageIndex((prev) => (prev > 0 ? prev - 1 : previewImages.length - 1));
  };

  const goToNext = () => {
    setCurrentImageIndex((prev) => (prev < previewImages.length - 1 ? prev + 1 : 0));
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return 'Just now';
    
    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      const now = new Date();
      const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);
      
      if (diffInHours < 24) {
        return formatDistanceToNow(date, { addSuffix: true });
      }
      return format(date, 'MMM d, yyyy • h:mm a');
    } catch {
      return 'Just now';
    }
  };

  // Function to process content and highlight hashtags
  const processContentWithHashtags = (content: string) => {
    // Replace hashtags with green-colored spans using Tailwind utilities (direct element style beats inherited color)
    const processedContent = content.replace(
      /#(\w+)/g,
      '<span class="text-green-400 font-semibold">#$1</span>'
    );

    // Replace line breaks with HTML breaks
    return processedContent.replace(/\n/g, '<br>');
  };

  // Check permissions
  const isAuthor = currentUser?.id === post.userId;
  const userRole = currentUser?.role as string | undefined;
  const isAdminOrSuperAdmin = userRole === 'admin' || userRole === 'super admin';
  const canDelete = isAuthor || isAdminOrSuperAdmin;
  const canEdit = isAuthor; // Only authors can edit (service enforces this)

  const openEdit = () => {
    if (!canEdit) return;
    setEditContent(post.content);
    setEditError(null);
    setIsEditing(true);
  };

  // Initialize editable media when entering edit mode
  useEffect(() => {
    if (isEditing) {
      try {
        const baseMedia: SpaceMediaItem[] = (post.media && post.media.length > 0 ? post.media : (post.mediaUrls || [])).map((m: any) => {
          if (!m) return null as any;
          if (typeof m === 'string') {
            return { url: m, type: detectType(m), name: extractNameFromUrl(m) } as SpaceMediaItem;
          }
          // Ensure existing objects have a name
          const obj = { ...(m as SpaceMediaItem) } as SpaceMediaItem;
          if (!obj.name && obj.url) {
            obj.name = extractNameFromUrl(obj.url)
          }
          if (!obj.type && obj.url) {
            obj.type = detectType(obj.url)
          }
          return obj;
        }).filter(Boolean);
        setEditedMedia(baseMedia);
      } catch (e) {
        console.warn('[SpacePostCard] Failed to initialize editedMedia', e);
        setEditedMedia([]);
      }
    }
  }, [isEditing, post.media, post.mediaUrls]);

  const safeDeleteStoragePath = async (path?: string | null) => {
    if (!path) return
    try {
      await deleteObject(storageRef(storage, path))
    } catch (e: any) {
      if (e?.code === 'storage/object-not-found' || (e?.message && e.message.includes('does not exist'))) {
        console.debug('[SpacePostCard] safeDeleteStoragePath: object not found, ignoring', path)
        return
      }
      console.warn('[SpacePostCard] safeDeleteStoragePath failed for', path, e)
    }
  }

  // Helper: detect media type from a URL or storage path
  const detectType = (u: string): 'image' | 'video' | 'document' => {
    if (!u) return 'document'
    const lower = u.split('?')[0].toLowerCase()
    if (/\.(mp4|webm|ogg)(?:$|\?)/.test(lower)) return 'video'
    if (/\.(jpe?g|jpg|jfif|png|gif|webp|bmp|svg)(?:$|\?)/.test(lower)) return 'image'
    return 'document'
  }

  const extractNameFromUrl = (u: string) => {
    try {
      const cleaned = u.split('?')[0].split('#')[0]
      let raw = cleaned.split('/').pop() || 'file'
      try { raw = decodeURIComponent(raw) } catch (_) {}
      raw = raw.replace(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}_?/, '')
      raw = raw.replace(/^[0-9a-fA-F]{32}_?/, '')
      return raw || 'file'
    } catch (e) {
      return 'file'
    }
  }

  const cancelEdit = () => {
    if (isSavingEdit) return;
    setIsEditing(false);
    setEditError(null);
  };

  const saveEdit = async () => {
    if (!currentUser) return;
    const trimmed = editContent.trim();
    if (!trimmed) {
      setEditError('Post content cannot be empty.');
      return;
    }
    const contentChanged = trimmed !== post.content;
    const mediaChanged = (() => {
      try {
        const original = (post.media && post.media.length > 0 ? post.media : (post.mediaUrls || [])).map((m:any)=> typeof m === 'string' ? m : (m.storagePath || m.url)).filter(Boolean);
        const edited = (editedMedia || []).map(m => m.storagePath || m.url).filter(Boolean);
        if (original.length !== edited.length) return true;
        for (let i = 0; i < original.length; i++) {
          if (original[i] !== edited[i]) return true;
        }
        return false;
      } catch (e) {
        return true;
      }
    })();

    if (!contentChanged && !mediaChanged) {
      // No changes
      setIsEditing(false);
      return;
    }
    try {
      setIsSavingEdit(true);
      setEditError(null);
      // Compute mediaUrls from editedMedia (prefer canonical storagePath when available)
      await updateSpacePost(post.id, currentUser.id, { content: trimmed, media: editedMedia });
      // Optimistic local update (will be reconciled by realtime listener)
      post.content = trimmed;
      post.isEdited = true;
      if (onPostUpdated) onPostUpdated();
      setIsEditing(false);
    } catch (e:any) {
      console.error('Failed to save edit', e);
      setEditError(e.message || 'Failed to save changes');
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Trigger file input to replace a media item at index
  const triggerReplace = (index: number) => {
    replaceIndexRef.current = index;
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  // Handle file selected for replacement or adding
  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    const idx = replaceIndexRef.current;
    try {
      if (!currentUser) throw new Error('Not authenticated');
      const id = uuidv4();
      const path = `space_posts/${id}_${file.name}`;
      const sRef = storageRef(storage, path);
      await uploadBytes(sRef, file);
      const mediaType: 'image' | 'video' | 'document' = file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : 'document';
      const newMedia: SpaceMediaItem = {
        type: mediaType,
        url: await getStorageDownloadUrl(sRef.fullPath),
        name: file.name,
        size: (file as any).size,
        storagePath: sRef.fullPath,
      } as SpaceMediaItem;

      // Capture previous storage path (if replacing) so we can delete it safely
      if (typeof idx === 'number' && idx >= 0 && idx < (editedMedia || []).length) {
        const oldPath = editedMedia[idx]?.storagePath;
        setEditedMedia((prev) => {
          const copy = [...prev];
          copy[idx] = newMedia;
          return copy;
        });
        if (oldPath) {
          await safeDeleteStoragePath(oldPath);
        }
      } else {
        setEditedMedia((prev) => [...prev, newMedia]);
      }
    } catch (err) {
      console.error('[SpacePostCard] Failed to replace/upload media', err);
      alert('Failed to upload replacement media. Please try again.');
    } finally {
      replaceIndexRef.current = null;
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveMedia = async (index: number) => {
    try {
      const removedPath = editedMedia && editedMedia[index] ? editedMedia[index].storagePath : undefined;
      setEditedMedia((prev) => {
        const copy = [...prev];
        copy.splice(index, 1);
        return copy;
      });
      if (removedPath) {
        await safeDeleteStoragePath(removedPath);
      }
    } catch (err) {
      console.error('[SpacePostCard] Failed to remove media', err);
      alert('Failed to remove media. Please try again.');
    }
  };

  type NormalizedMediaItem = {
    type: 'image' | 'video' | 'document';
    url: string;
    name?: string;
  };

  const getNormalizedPostMedia = (): NormalizedMediaItem[] => {
    const source = (post.media && post.media.length > 0)
      ? post.media
      : (post.mediaUrls || []);

    return source
      .map((item: any) => {
        if (typeof item === 'string') {
          const cleanedUrl = processStorageUrl(item);
          return {
            type: detectType(cleanedUrl),
            url: cleanedUrl,
            name: extractNameFromUrl(cleanedUrl),
          } as NormalizedMediaItem;
        }

        const baseUrl = item?.url || item?.storagePath || '';
        if (!baseUrl) return null;
        const cleanedUrl = processStorageUrl(baseUrl);
        return {
          type: item.type || detectType(cleanedUrl),
          url: cleanedUrl,
          name: item.name || extractNameFromUrl(cleanedUrl),
        } as NormalizedMediaItem;
      })
      .filter(Boolean) as NormalizedMediaItem[];
  };

  const renderPostMediaLayout = (isFullscreenView = false) => {
    const normalizedMedia = getNormalizedPostMedia();
    if (!normalizedMedia.length) return null;

    const imageItems = normalizedMedia.filter((item) => item.type === 'image');
    const visualMediaItems = normalizedMedia.filter((item) => item.type === 'image' || item.type === 'video');
    const documentItems = normalizedMedia.filter((item) => item.type === 'document');
    const imagePreviewUrls = imageItems.map((item) => item.url).filter(Boolean);
    const imageIndexMap = new Map<string, number>();
    imageItems.forEach((item, idx) => {
      imageIndexMap.set(item.url, idx);
    });

    const handleVisualTileClick = (item: NormalizedMediaItem) => {
      if (item.type === 'video') {
        openVideoPreview(item.url);
        return;
      }
      const imageIndex = imageIndexMap.get(item.url) ?? 0;
      openImagePreview(imagePreviewUrls, imageIndex);
    };

    const visualSection = (() => {
      const visualCount = visualMediaItems.length;
      if (!visualCount) return null;

      const displayedItems = visualMediaItems.slice(0, Math.min(4, visualCount));
      const remainingCount = visualCount > 4 ? visualCount - 4 : 0;
      const mediaObjectFitClass = visualCount === 1 ? 'w-full h-full object-contain' : 'w-full h-full object-cover';

      let containerClasses = 'relative grid gap-0 overflow-hidden rounded-2xl border border-gray-700/40 bg-gray-800/60 shadow';
      const containerStyle: React.CSSProperties = { gridAutoRows: 'minmax(0, 1fr)' };

      if (visualCount === 1) {
        containerClasses += ' grid-cols-1';
        containerStyle.aspectRatio = '16 / 9';
      } else if (visualCount === 2) {
        containerClasses += ' grid-cols-2';
        containerStyle.aspectRatio = '3 / 2';
      } else {
        containerClasses += ' grid-cols-2';
        containerStyle.gridTemplateRows = 'repeat(2, minmax(0, 1fr))';
        containerStyle.aspectRatio = visualCount === 3 ? '3 / 2' : '1';
      }

      return (
        <div className={containerClasses} style={containerStyle}>
          {displayedItems.map((item, index) => {
            const isTrailingWideTile = visualCount === 3 && index === 2;
            const isOverflowTile = remainingCount > 0 && index === 3;
            const tileClasses = [
              'relative flex items-center justify-center bg-black overflow-hidden w-full h-full cursor-pointer !p-0 !px-0 !py-0 border-0',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-green-400/60',
            ];

            if (isTrailingWideTile) {
              tileClasses.push('col-span-2');
            }

            if (visualCount === 2) {
              if (index === 0) tileClasses.push('border-r border-r-green-500/60');
            } else if (visualCount === 3) {
              if (index === 0) tileClasses.push('border-r border-r-green-500/60', 'border-b border-b-green-500/60');
              if (index === 1) tileClasses.push('border-b border-b-green-500/60');
            } else if (visualCount >= 4) {
              if (index === 0 || index === 2) tileClasses.push('border-r border-r-green-500/60');
              if (index === 0 || index === 1) tileClasses.push('border-b border-b-green-500/60');
            }

            return (
              <button
                type="button"
                key={`visual-media-${index}`}
                onClick={(e) => {
                  e.stopPropagation();
                  handleVisualTileClick(item);
                }}
                className={tileClasses.join(' ')}
              >
                {item.type === 'video' ? (
                  <video
                    src={item.url}
                    controls
                    className={mediaObjectFitClass}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleVisualTileClick(item);
                    }}
                    onTouchStart={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleVisualTileClick(item);
                    }}
                  />
                ) : (
                  <img
                    src={item.url || '/placeholder.svg'}
                    alt="Post media"
                    className={mediaObjectFitClass}
                    loading="lazy"
                    onError={(e) => { (e.target as HTMLImageElement).src = '/images/placeholder.png'; }}
                  />
                )}
                {isOverflowTile && (
                  <div className="absolute inset-0 bg-black/65 flex items-center justify-center pointer-events-none">
                    <span className="text-white text-2xl sm:text-3xl font-semibold">+{remainingCount}</span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      );
    })();

    const documentSection = documentItems.length > 0 ? (
      <div className="flex flex-wrap items-start gap-2">
        {documentItems.map((item, index) => {
          const fileName = item.name || extractNameFromUrl(item.url) || 'File';
          const ext = (fileName.split('.').pop() || '').toLowerCase();
          const fileBase = fileName.split('.').slice(0, -1).join('.') || fileName;
          const fileExt = (fileName.split('.').pop() || '').toUpperCase();

          let icon: React.ReactNode = <DocumentTextIcon className="h-6 w-6 text-gray-400" />;
          if (ext === 'pdf') {
            icon = <img src="https://cdn-icons-png.flaticon.com/512/337/337946.png" alt="PDF" className="h-6 w-6" style={{ minWidth: 24, minHeight: 24 }} />;
          } else if (ext === 'doc' || ext === 'docx') {
            icon = <img src="https://cdn-icons-png.flaticon.com/512/5968/5968517.png" alt="DOC" className="h-6 w-6" style={{ minWidth: 24, minHeight: 24 }} />;
          } else if (ext === 'xls' || ext === 'xlsx' || ext === 'csv') {
            icon = <img src="https://cdn-icons-png.flaticon.com/512/4725/4725976.png" alt="Excel" className="h-6 w-6" style={{ minWidth: 24, minHeight: 24 }} />;
          } else if (ext === 'ppt' || ext === 'pptx') {
            icon = <img src="https://cdn-icons-png.flaticon.com/512/337/337932.png" alt="PPT" className="h-6 w-6" style={{ minWidth: 24, minHeight: 24 }} />;
          } else if (ext === 'txt') {
            icon = <img src="https://cdn-icons-png.flaticon.com/512/3022/3022503.png" alt="TXT" className="h-6 w-6" style={{ minWidth: 24, minHeight: 24 }} />;
          } else if (ext === 'zip' || ext === 'rar') {
            icon = <img src="https://cdn-icons-png.flaticon.com/512/9704/9704802.png" alt="ZIP" className="h-6 w-6" style={{ minWidth: 24, minHeight: 24 }} />;
          }

          return (
            <button
              key={`doc-${index}`}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                openFilePreview(item.url, fileName, fileExt || ext.toUpperCase());
              }}
              className="flex items-center bg-gradient-to-r from-gray-800/60 via-gray-700/40 to-green-900/30 border border-gray-700/30 rounded-lg shadow px-3 py-2 my-1 min-w-0 max-w-xs hover:from-gray-800/80 hover:to-green-800/50 transition-colors group backdrop-blur-sm text-white hover:text-green-100 text-left"
              style={{ height: '2.5rem', maxWidth: '260px', marginRight: 0, marginLeft: 0 }}
              title={fileName}
            >
              <span className="flex-shrink-0 mr-2">{icon}</span>
              <span className="flex flex-col min-w-0">
                <span className="truncate text-xs font-semibold group-hover:text-green-300" style={{ maxWidth: '140px', color: 'inherit' }}>
                  {fileBase}
                </span>
                <span className="text-[10px] text-gray-500 font-bold tracking-widest group-hover:text-blue-600">
                  {fileExt}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    ) : null;

    if (!visualSection && !documentSection) return null;

    return (
      <div className={`flex flex-col ${isFullscreenView ? 'gap-3' : 'gap-2'}`}>
        {visualSection}
        {documentSection}
      </div>
    );
  };
  

  // Container classes aligned with regular PostCard styling (simplified subset)
  const containerClasses = `bg-gradient-to-b from-gray-800/90 to-gray-900/95 rounded-none sm:rounded-2xl shadow-none sm:shadow-xl border-0 sm:border border-t border-b border-gray-700/40 overflow-hidden hover:shadow-2xl hover:shadow-green-900/20 transition-all duration-300 backdrop-blur-md py-4 sm:py-6`;

  return (
    <>
    {/* Base (feed) card */}
    <div
      className={containerClasses}
      onClick={(e) => {
        if (!isMobile) return;
        const target = e.target as HTMLElement;
        if (target.closest('button, a, input, textarea, [role="menu"], .no-fullscreen')) return;
        setIsFullscreen(true);
      }}
    >
  {/* Header (aligned closer to PostCard spacing rhythm) */}
  <div className="flex items-start justify-between mb-3 sm:mb-4 px-4 sm:px-6">
  <div className="flex items-start gap-2 sm:gap-3 flex-1 min-w-0">          <div className="relative flex-shrink-0">
            <img
              src={profilePic || '/images/default-avatar.png'}
              alt={displayName}
              className="w-10 h-10 sm:w-12 sm:h-12 rounded-full object-cover"
            />
          </div>            <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
              <h3 className="font-semibold text-white truncate text-sm sm:text-base">{displayName}</h3><RoleBadge 
                role={post.userRole} 
                size="small" 
                isSpaceAdmin={isUserSpaceAdmin || post.userId === post.groupId}
              />
            </div>
            
            <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-gray-400 mt-0.5 sm:mt-1">
              <span>{formatDate(post.createdAt)}</span>
              {post.isEdited && (
                <>
                  <span>•</span>
                  <span className="text-gray-500">edited</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Desktop controls: fullscreen toggle + dropdown (dropdown retained) */}
        <div className="relative flex-shrink-0 flex items-center gap-1">
          {!isMobile && (
            <button
              onClick={() => setIsFullscreen(true)}
              title="Open full screen"
              aria-label="Open full screen"
              className="p-1.5 sm:p-2 bg-transparent text-white/80 hover:text-white hover:bg-gray-700/50 rounded-lg transition-colors focus:outline-none focus:ring-1 focus:ring-green-500/40"
            >
              {/* enter fullscreen icon */}
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="h-4 w-4 sm:h-5 sm:w-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 9V6a1 1 0 0 1 1-1h3M21 15v3a1 1 0 0 1-1 1h-3M21 9V6a1 1 0 0 0-1-1h-3M3 15v3a1 1 0 0 0 1 1h3" />
              </svg>
            </button>
          )}
          {currentUser && canDelete && (
            <div className="relative">
              <button
                onClick={() => setShowDropdown(!showDropdown)}
                ref={fullscreenMenuBtnRef}
                className="p-1.5 sm:p-2 bg-transparent text-white/80 hover:text-white hover:bg-gray-700/50 rounded-lg transition-colors touch-manipulation"
              >
                <EllipsisHorizontalIcon className="h-4 w-4 sm:h-5 sm:w-5" />
              </button>
              {showDropdown && (
                <div className="absolute right-0 top-8 sm:top-10 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-40 min-w-[140px] sm:min-w-[160px]">
          {isAuthor && (
                    <button
            onClick={() => { setShowDropdown(false); openEdit(); }}
                      className="w-full flex items-center gap-2 px-3 sm:px-4 py-2 text-xs sm:text-sm bg-transparent text-white/80 hover:text-white hover:bg-gray-700/50 transition-colors"
                    >
                      <PencilIcon className="h-4 w-4" />
                      Edit Post
                    </button>
                  )}
                  {canDelete && (
                    <button
                      onClick={() => { setConfirmDialog({ open: true, kind: 'post' }); setShowDropdown(false); }}
                      disabled={isDeleting}
                      className="w-full flex items-center gap-2 px-3 sm:px-4 py-2 text-xs sm:text-sm bg-transparent text-red-400 hover:text-red-300 hover:bg-gray-700/50 transition-colors disabled:opacity-50"
                    >
                      <TrashIcon className="h-4 w-4" />
                      {isDeleting ? 'Deleting...' : 'Delete Post'}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>      {/* Content */}
  <div className="mb-3 sm:mb-4 px-4 sm:px-6">
        <div 
          className="text-gray-100 leading-relaxed space-y-2 text-sm sm:text-base"
          dangerouslySetInnerHTML={{
            __html: DOMPurify.sanitize(processContentWithHashtags(post.content))
          }}
        />
      </div>

      {/* Media - aligned with Home PostCard layout */}
      {(() => {
        const mediaLayout = renderPostMediaLayout(false);
        if (!mediaLayout) return null;
        return (
          <div className="mt-3 mb-3 sm:mb-4 px-4 sm:px-6">
            {mediaLayout}
          </div>
        );
      })()}

      {/* Image preview portal like PostCard */}
      {previewOpen && typeof document !== 'undefined' && ReactDOM.createPortal(
        <>
          <div className="fixed inset-0 bg-black/90 z-[2147483646]" onClick={() => setPreviewOpen(false)} />
          <img
            src={previewImages[currentImageIndex] || '/placeholder.svg'}
            alt="Preview"
            className="fixed left-1/2 top-1/2 z-[2147483647] max-w-full max-h-full object-contain"
            style={{ transform: 'translate(-50%, -50%)' }}
            onClick={(e) => e.stopPropagation()}
          />
          <button onClick={() => setPreviewOpen(false)} className="fixed top-4 right-4 z-[2147483648] p-2 bg-black/50 rounded-full text-white hover:bg-black/70 transition-colors">
            <XMarkIcon className="w-6 h-6" />
          </button>
          <button onClick={() => downloadImage(previewImages[currentImageIndex])} className="fixed top-4 right-16 z-[2147483648] p-2 bg-black/50 rounded-full text-white hover:bg-black/70 transition-colors">
            <ArrowDownTrayIcon className="w-6 h-6" />
          </button>
          {previewImages.length > 1 && (
            <>
              <button onClick={goToPrevious} className="fixed left-4 top-1/2 z-[2147483648] p-2 bg-black/50 rounded-full text-white hover:bg-black/70 transition-colors" style={{ transform: 'translateY(-50%)' }}>
                <ChevronLeftIcon className="w-6 h-6" />
              </button>
              <button onClick={goToNext} className="fixed right-4 top-1/2 z-[2147483648] p-2 bg-black/50 rounded-full text-white hover:bg-black/70 transition-colors" style={{ transform: 'translateY(-50%)' }}>
                <ChevronRightIcon className="w-6 h-6" />
              </button>
            </>
          )}
          {previewImages.length > 1 && (
            <div className="fixed bottom-4 left-1/2 z-[2147483648] bg-black/50 px-3 py-1 rounded-full text-white text-sm" style={{ transform: 'translateX(-50%)' }}>
              {currentImageIndex + 1} / {previewImages.length}
            </div>
          )}
        </>, document.body
      )}

      {/* Video preview portal */}
      {videoPreviewOpen && previewVideoUrl && typeof document !== 'undefined' && ReactDOM.createPortal(
        <>
          <div className="fixed inset-0 bg-black/90 z-[2147483646]" onClick={() => setVideoPreviewOpen(false)} />
          <video
            src={previewVideoUrl}
            controls
            autoPlay
            className="fixed left-1/2 top-1/2 z-[2147483647] object-contain"
            style={{ transform: 'translate(-50%, -50%)', maxWidth: '90vw', maxHeight: '90vh' }}
            onClick={(e) => e.stopPropagation()}
          />
          <button onClick={() => setVideoPreviewOpen(false)} className="fixed top-4 right-4 z-[2147483647] p-2 bg-black/50 rounded-full text-white hover:bg-black/70 transition-colors">
            <XMarkIcon className="w-6 h-6" />
          </button>
          <button onClick={() => downloadImage(previewVideoUrl || '')} className="fixed top-4 right-16 z-[2147483647] p-2 bg-black/50 rounded-full text-white hover:bg-black/70 transition-colors">
            <ArrowDownTrayIcon className="w-6 h-6" />
          </button>
        </>, document.body
      )}

      {/* File preview portal - styled like the file chip */}
      {filePreviewOpen && previewFile && typeof document !== 'undefined' && ReactDOM.createPortal(
        <>
          <div className="fixed inset-0 bg-black/60 z-[2147483646]" onClick={() => setFilePreviewOpen(false)} />
          <div className="fixed left-1/2 top:50% z-[2147483647]" style={{ transform: 'translate(-50%, -50%)' }}>
            <div className="flex items-center bg-gradient-to-r from-gray-800/60 via-gray-700/40 to-green-900/30 border border-gray-700/30 rounded-lg shadow px-4 py-3 min-w-[260px] max-w-[90vw] text-white">
              <div className="flex-shrink-0 mr-3">
                <DocumentTextIcon className="h-6 w-6 text-gray-200" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="truncate font-semibold text-sm">{previewFile.name}</div>
                <div className="text-[11px] text-gray-400 font-bold tracking-widest">{previewFile.ext}</div>
              </div>
              <div className="flex items-center gap-2 ml-3">
                <button onClick={() => window.open(previewFile.url, '_blank', 'noopener')} className="px-3 py-1 rounded bg-green-600 hover:bg-green-500 text-white text-xs">Open</button>
                <button onClick={() => downloadImage(previewFile.url)} className="px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-white text-xs">Download</button>
                <button onClick={() => setFilePreviewOpen(false)} className="px-2 py-1 rounded bg-black/40 hover:bg-black/60 text-white text-xs">Close</button>
              </div>
            </div>
          </div>
        </>, document.body
      )}

      {/* Tags */}
      {post.tags && post.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 sm:gap-2 mb-3 sm:mb-4">
          {post.tags.map((tag, index) => (
            <span
              key={index}
              className="px-2 sm:px-3 py-1 bg-green-500/20 text-green-400 text-xs sm:text-sm rounded-full"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}

      {/* Actions - restyled to mirror PostCard */}
      <div className="relative px-0">
        <div className="px-4 sm:px-6 pt-3 sm:pt-4 border-t border-gray-800/40 flex items-center justify-between bg-transparent relative rounded-b-xl">
          {showHeartAnimation && (
            <div className="absolute left-6 sm:left-8 top-1/2 -translate-y-1/2 pointer-events-none z-10">
              <div className="animate-bounce">
                <HeartIconSolid className="h-8 w-8 text-red-500 animate-pulse" />
              </div>
            </div>
          )}
          <div className="flex items-center gap-4 sm:gap-6 flex-1">
            <button
              onClick={handleReaction}
              disabled={!currentUser}
              className={`flex items-center gap-1.5 sm:gap-2 p-2 rounded-lg transition-all duration-200 touch-manipulation bg-transparent relative ${
                hasReacted ? 'text-green-500 hover:text-green-400 scale-105' : 'text-gray-400 hover:text-gray-300'
              } ${!currentUser ? 'opacity-50 cursor-not-allowed' : 'hover:scale-110'}`}
              aria-label={hasReacted ? 'Unlike space post' : 'Like space post'}
            >
              {hasReacted ? (
                <HeartIconSolid className={`h-4 w-4 sm:h-5 sm:w-5 text-green-500 transition-all duration-200 ${showHeartAnimation ? 'animate-ping' : ''}`} />
              ) : (
                <HeartIcon className="h-4 w-4 sm:h-5 sm:w-5 transition-all duration-200" />
              )}
              <span className={`text-xs sm:text-sm font-medium ${hasReacted ? 'bg-green-700/40' : 'bg-transparent'} px-1.5 py-0.5 rounded-md transition-all duration-300`}>
                {reactionCount > 0 ? reactionCount : '0'}
              </span>
            </button>
            <button
              onClick={handleCommentAction}
              disabled={!currentUser}
              className={`flex items-center gap-1.5 sm:gap-2 p-2 rounded-lg text-gray-400 hover:text-gray-300 transition-colors touch-manipulation bg-transparent ${!currentUser ? 'opacity-50 cursor-not-allowed' : ''}`}
              aria-label={isMobile ? (showComments ? 'Hide comments' : 'Show comments') : 'View & comment'}
            >
              <ChatBubbleLeftIcon className="h-4 w-4 sm:h-5 sm:w-5" />
              <span className="text-xs sm:text-sm font-medium px-1.5 py-0.5 rounded-md">{commentCount > 0 ? commentCount : '0'}</span>
            </button>
            <div className="flex items-center gap-2 p-2 text-gray-400">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="h-5 w-5 sm:h-6 sm:w-6"
              >
                <path d="M10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" />
                <path
                  fillRule="evenodd"
                  d="M.664 10.59a1.651 1.651 0 010-1.186A10.004 10.004 0 0110 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0110 17c-4.257 0-7.893-2.66-9.336-6.41zM14 10a4 4 0 11-8 0 4 4 0 018 0z"
                  clipRule="evenodd"
                />
              </svg>
              <span className="text-xs sm:text-sm font-medium px-1.5 py-0.5 rounded-md">
                {viewCount > 0 ? viewCount : '0'}
              </span>
            </div>
          </div>
        </div>
      </div>

  {/* Inline comments removed: comments accessible only in fullscreen */}
  </div>

  {/* Mobile fullscreen uses dedicated component; desktop retains inline portal */}
  {isMobile && isFullscreen && (
    <FullScreenSpacePost
      post={post}
      isOpen={isFullscreen}
      onClose={() => setIsFullscreen(false)}
      onPostUpdated={onPostUpdated}
    />
  )}
  {!isMobile && isFullscreen && typeof document !== 'undefined' && ReactDOM.createPortal(
    <div className="fixed inset-0 z-[2147483647] flex items-center justify-center p-4">
      {/* Backdrop (semi-transparent + subtle blur) */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm animate-fadeIn" onClick={() => setIsFullscreen(false)} />
      {/* Container with pop animation */}
      <div
        className="relative w-full h-full sm:h-auto max-w-4xl sm:max-h-[90vh] rounded-none sm:rounded-3xl bg-gradient-to-b from-gray-900 via-gray-900 to-gray-800 border border-gray-700 shadow-2xl shadow-green-900/20 overflow-hidden flex flex-col animate-pop-in"
        onClick={(e) => e.stopPropagation()}
        style={{ boxShadow: '0 25px 50px -12px rgba(0,0,0,0.85), 0 0 0 1px rgba(34,197,94,0.15)' }}
      >
        {/* Header (opaque) */}
        <div className="relative p-4 pb-3 border-b border-gray-700 bg-gradient-to-r from-gray-900 to-gray-800">
          <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
            <button
              onClick={() => setIsFullscreen(false)}
              className="p-1.5 rounded-md bg-gray-800 hover:bg-gray-700 text-gray-300 focus:outline-none focus:ring-1 focus:ring-green-500/40 transition-all border border-gray-700 hover:border-gray-600"
              aria-label="Close"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          </div>
          <div className="flex items-start gap-3">
            <div className="relative">
              <img src={profilePic || '/images/default-avatar.png'} alt={displayName} className="w-12 h-12 rounded-xl object-cover border border-green-600/40" />
              {post.userRole && (
                <div className="absolute -bottom-1 -right-1">
                  <RoleBadge role={post.userRole} size="medium" isSpaceAdmin={isUserSpaceAdmin || post.userId === post.groupId} />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-semibold text-white leading-tight mb-1">{displayName}</h3>
              <div className="flex items-center gap-2 text-xs text-gray-400 flex-wrap">
                <span>{formatDate(post.createdAt)}</span>
                {post.isEdited && <span className="text-gray-500">(edited)</span>}
              </div>
            </div>
          </div>
        </div>
        {/* Scrollable content */}
        <div className="relative flex-1 overflow-auto">
          <div className="p-6">
            {/* Content */}
            <div className="mb-6 text-lg text-gray-200 leading-relaxed break-words" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(processContentWithHashtags(post.content)) }} />
            {/* Media - aligned with Home PostCard layout */}
            {(() => {
              const mediaLayout = renderPostMediaLayout(true);
              if (!mediaLayout) return null;
              return <div className="mb-6">{mediaLayout}</div>;
            })()}
            {/* Tags */}
            {post.tags && post.tags.length>0 && (
              <div className="mb-6 flex flex-wrap gap-2">
                {post.tags.map((t,i)=>(<span key={i} className="px-3 py-1 bg-green-500/20 text-green-400 text-xs rounded-full">#{t}</span>))}
              </div>
            )}
            {/* Actions */}
            <div className="flex items-center gap-6 mb-6">
              <button onClick={handleReaction} disabled={!currentUser} className={`flex items-center gap-3 p-3 rounded-xl bg-transparent text-gray-200 transition-all ${hasReacted? 'text-green-500 hover:text-green-400 bg-green-700 hover:bg-green-600':'hover:text-gray-100 hover:bg-gray-800'} ${!currentUser?'opacity-50 cursor-not-allowed':''}`}>
                {hasReacted ? <HeartIconSolid className="w-6 h-6" /> : <HeartIcon className="w-6 h-6" />}
                <span className="font-medium">{reactionCount}</span>
              </button>
              <button onClick={()=>handleCommentAction()} className="flex items-center gap-3 p-3 rounded-xl bg-transparent text-gray-200 hover:text-gray-100 hover:bg-gray-800 transition-all">
                <ChatBubbleLeftIcon className="w-6 h-6" />
                <span className="font-medium">{commentCount}</span>
              </button>
              <div className="flex items-center gap-2 text-gray-400 p-3">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-6 w-6"><path d="M10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" /><path fillRule="evenodd" d="M.664 10.59a1.651 1.651 0 010-1.186A10.004 10.004 0 0110 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0110 17c-4.257 0-7.893-2.66-9.336-6.41zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" /></svg>
                <span className="font-medium">{viewCount}</span>
              </div>
            </div>
            {/* Comments (fullscreen) */}
            {showComments && (
              <div className="border-t border-gray-700 pt-6 relative">
                <div className="space-y-5 mb-40">
                  {comments.length===0 ? (
                    <div className="text-center py-8">
                      <p className="text-gray-500 text-lg">No comments yet</p>
                      <p className="text-gray-600 text-sm mt-1">Be the first to share your thoughts!</p>
                    </div>
                  ) : (
                    comments.filter(c=>!c.replyTo).map(c=> (
                      <div key={c.id}>
                        <div className="group flex items-start gap-2 p-1 rounded-md hover:bg-gray-800 transition-colors">
                          <div className="flex-shrink-0">
                            {c.userProfilePic ? <img src={c.userProfilePic} alt={c.userName} className="w-9 h-9 rounded-lg object-cover border border-gray-700/40" /> : <div className="w-9 h-9 rounded-lg bg-gray-800 flex items-center justify-center text-green-400 font-bold text-sm border border-gray-700/40">{c.userName?.charAt(0).toUpperCase()||'U'}</div>}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="bg-gray-800 rounded-md px-3 py-2 border border-gray-700">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                                    <h4 className="text-sm font-semibold text-gray-200 truncate">{c.userName}</h4>
                                    <RoleBadge role={c.userRole} size="small" isSpaceAdmin={spaceAdminUsers.has(c.userId)} />
                                    {c.userId === post.userId && <span className="text-[10px] text-green-500 font-bold bg-green-500/20 px-1.5 py-0.5 rounded-full">Author</span>}
                                  </div>
                                  <div className="text-sm text-gray-300 leading-snug break-words">{c.content}</div>
                                </div>
                                <div className="text-right flex-shrink-0">
                                  <p className="text-[10px] text-gray-500">{c.createdAt instanceof Timestamp ? format(c.createdAt.toDate(),'MMM d • h:mm a') : 'Just now'}</p>
                                  <div className="flex items-center justify-end gap-1 mt-1">
                                    {(currentUser?.id === c.userId || isAdminOrSuperAdmin) && (
                                      <button onClick={()=>setConfirmDialog({ open: true, kind: 'comment', targetId: c.id })} className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-red-500 rounded-md hover:bg-red-500/10 transition-colors" title="Delete" aria-label="Delete comment">
                                        <span className="material-icons text-[16px] leading-none">delete_forever</span>
                                      </button>
                                    )}
                                    <button onClick={()=>{setReplyToCommentId(c.id); handleCommentAction();}} className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-green-400 rounded-md hover:bg-green-500/10" title="Reply"><span className="material-icons text-[16px]">reply</span></button>
                                  </div>
                                </div>
                              </div>
                            </div>
                            {(repliesMap[c.id]||[]).length>0 && (
                              <div className="ml-7 mt-2 space-y-2">
                                {(repliesMap[c.id]||[]).map(r=> (
                                  <div key={r.id} className="flex items-start gap-2 p-1 rounded bg-gray-800 border border-gray-700">
                                    <div className="flex-shrink-0">{r.userProfilePic ? <img src={r.userProfilePic} alt={r.userName} className="w-6 h-6 rounded object-cover border border-gray-700/40" /> : <div className="w-6 h-6 rounded bg-gray-800 flex items-center justify-center text-green-400 text-xs border border-gray-700/40">{r.userName?.charAt(0).toUpperCase()||'U'}</div>}</div>
                                    <div className="flex-1 min-w-0">
                                      <div className="bg-gray-800 rounded px-2 py-1 border border-gray-700">
                                        <div className="flex items-center justify-between mb-0.5">
                                          <div className="flex items-center gap-1.5">
                                            <h5 className="text-[11px] font-medium text-gray-200">{r.userName}</h5>
                                            <span className="material-icons text-[12px] text-gray-400">reply</span>
                                          </div>
                                          <p className="text-[9px] text-gray-500">{r.createdAt instanceof Timestamp ? format(r.createdAt.toDate(),'MMM d • h:mm a') : 'Just now'}</p>
                                        </div>
                                        <div className="text-[12px] text-gray-300 leading-snug">{r.content}</div>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
        {/* Pinned bottom comment input */}
        {showComments && (
          <div className="w-full border-t border-gray-700 p-4 bg-gray-900 rounded-b-3xl">
            {currentUser && (
              <form onSubmit={handleAddComment} className="flex items-center gap-4 w-full">
                <div className="flex-shrink-0">
                  <img src={currentUser.profile_pic || '/images/default-avatar.png'} alt={currentUser.name} className="w-9 h-9 rounded-lg object-cover border border-green-500/30" />
                </div>
                <div className="flex-1">
                  {replyToCommentId && (
                    <div className="mb-2 text-sm text-gray-400 bg-gray-800/50 px-3 py-2 rounded-xl border border-gray-700/30">Replying • <button type="button" onClick={()=>setReplyToCommentId(null)} className="text-green-400 underline">Cancel</button></div>
                  )}
                  <div className="relative">
                    <input value={commentText} onChange={e=>setCommentText(e.target.value)} placeholder="Write a comment..." className="w-full bg-gray-800 border border-gray-700 rounded-lg py-2 pl-3 pr-10 text-sm text-gray-200 placeholder-gray-400 focus:ring-1 focus:ring-green-500/40 focus:border-green-500/40" />
                    <button type="submit" disabled={!commentText.trim() || isSubmittingComment} className="absolute right-2 top-1/2 -translate-y-1/2 text-green-500 hover:text-green-400 disabled:text-gray-600 p-1.5 rounded-md bg-transparent hover:bg-green-600/20">
                      {isSubmittingComment ? <div className="w-4 h-4 border-2 border-t-transparent border-green-500 rounded-full animate-spin" /> : <PaperAirplaneIcon className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body
  )}

  {/* Simple Edit Modal (Portal) */}
  {isEditing && typeof document !== 'undefined' && ReactDOM.createPortal(
    <div className="fixed inset-0 z-[2147483647] flex items-center justify-center p-4 select-none">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={cancelEdit} />
      <div className="relative w-full max-w-xl bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl p-6 space-y-4 animate-pop-in">
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold text-white">Edit Space Post</h2>
          <button
            onClick={cancelEdit}
            disabled={isSavingEdit}
            className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white transition disabled:opacity-50"
            aria-label="Close edit modal"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        <div>
          <textarea
            className="w-full h-48 resize-none rounded-lg bg-gray-800 border border-gray-600 focus:border-green-500 focus:ring-1 focus:ring-green-500 text-gray-100 p-3 text-sm leading-relaxed scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-transparent"
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            disabled={isSavingEdit}
            placeholder="Update your post content"
            autoFocus
          />
          <div className="mt-2 flex justify-between text-xs text-gray-400">
            <span>{editContent.trim().length} chars</span>
            {post.content !== editContent && <span className="text-green-400">Modified</span>}
          </div>

          {/* Editable media controls during edit */}
          <div className="mt-3">
            <div className="flex flex-wrap gap-2">
              {editedMedia && editedMedia.length > 0 ? (
                editedMedia.map((m, idx) => (
                  <div key={idx} className="flex items-center gap-2 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2">
                    <div className="flex-shrink-0 w-12 h-8 overflow-hidden rounded-md bg-black/40">
                      {m.type === 'image' ? (
                        <img src={m.url} alt={m.name} className="w-full h-full object-cover" />
                      ) : m.type === 'video' ? (
                        <video src={m.url} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xs text-gray-400">{(m.name || '').slice(0,8)}</div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs text-gray-200 truncate max-w-[140px]">{m.name || 'Media'}</div>
                      <div className="text-[10px] text-gray-400">{m.type}</div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => triggerReplace(idx)} className="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-xs rounded">Replace</button>
                      <button type="button" onClick={() => handleRemoveMedia(idx)} className="px-2 py-1 bg-red-700 hover:bg-red-600 text-xs rounded">Remove</button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-xs text-gray-400">No attachments</div>
              )}
              <div className="flex items-center">
                <button type="button" onClick={() => { replaceIndexRef.current = null; if (fileInputRef.current) { fileInputRef.current.value = ''; fileInputRef.current.click(); } }} className="px-3 py-1 bg-green-600 hover:bg-green-500 text-white text-sm rounded">Add Media</button>
              </div>
            </div>
            <input ref={fileInputRef} type="file" accept="image/*,video/*,application/*" onChange={handleFileSelected} className="hidden" />
          </div>

          {editError && <div className="mt-2 text-sm text-red-400">{editError}</div>}
        </div>
        <div className="flex flex-wrap justify-end gap-3 pt-2">
          <button
            onClick={cancelEdit}
            disabled={isSavingEdit}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-700 hover:bg-gray-600 text-gray-200 disabled:opacity-50"
          >Cancel</button>
          <button
            onClick={saveEdit}
            disabled={isSavingEdit}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-green-600 hover:bg-green-500 text-white flex items-center gap-2 disabled:opacity-50"
          >
            {isSavingEdit && (
              <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
              </svg>
            )}
            <span>{isSavingEdit ? 'Saving...' : 'Save Changes'}</span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  )}
    <ConfirmDialog
      open={confirmDialog.open}
      title={confirmDialog.kind === 'post' ? 'Delete Post' : 'Delete Comment'}
      message={
        confirmDialog.kind === 'post' ? (
          <div>
            <p className="mb-2">This post will be permanently removed, including all its comments and reactions.</p>
            <p className="text-red-400 text-sm">This action cannot be undone.</p>
          </div>
        ) : (
          <div>
            <p className="mb-2">This comment will be permanently removed for everyone.</p>
            <p className="text-red-400 text-sm">This action cannot be undone.</p>
          </div>
        )
      }
      confirmLabel={isProcessingDelete ? 'Deleting...' : 'Delete'}
      cancelLabel="Cancel"
      confirmTone="danger"
      isProcessing={isProcessingDelete}
      zIndex={isFullscreen ? 2147483648 : undefined}
      onConfirm={handleConfirmDelete}
      onCancel={() => !isProcessingDelete && setConfirmDialog(prev => ({ ...prev, open: false, targetId: undefined }))}
    />
    </>
  )
}

export default SpacePostCard;
