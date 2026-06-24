import React, { useState, useEffect, useLayoutEffect } from 'react';
import ReactDOM from 'react-dom';
import { 
  PencilIcon,
  TrashIcon,
  EyeSlashIcon,
  FlagIcon,
  ShareIcon
} from '@heroicons/react/24/outline';
import { useAuth } from '../../contexts/AuthContext';
import { Post } from '../../models/Post';
import { hidePost, deletePost } from '../../services/postService';
import './PostActionSheet.css';

interface PostActionSheetProps {
  post: Post;
  isAuthor: boolean;
  isAdminOrSuperAdmin?: boolean;
  onEdit: () => void;
  onDelete?: () => void; // Optional as we'll handle deletion internally
  onHide?: () => void; // Optional as we'll handle hiding internally
  onShare?: () => void;
  onReport?: () => void;
  onUnreport?: () => void; // <-- Add this
  onWarn?: () => void; // New: trigger warn confirmation in parent
  className?: string;
  isMobile?: boolean;
  onActionComplete?: (action: string) => void; // Callback for when actions complete
  isOpen: boolean;
  onClose: () => void;
  currentFilter?: string;
  currentUserRole?: string;
  // Optional anchor element for desktop positioning; when provided, dropdown will render via portal
  anchorRef?: React.RefObject<HTMLElement>;
  canEdit?: boolean;
}

const PostActionSheet: React.FC<PostActionSheetProps> = ({
  post,
  isAuthor,
  isAdminOrSuperAdmin = false,
  onEdit,
  onDelete,
  onHide,
  onShare,
  onReport,
  onUnreport,
  onWarn,
  className = '',
  isMobile = false,
  onActionComplete,
  isOpen,
  onClose,
  currentFilter,
  currentUserRole,
  anchorRef,
  canEdit = true
}) => {
  const { currentUser } = useAuth();

  // For desktop portal positioning when anchorRef is provided
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  // Use layout effect so the menu is positioned before the first paint
  useLayoutEffect(() => {
    if (!isMobile && isOpen && anchorRef) {
      const updatePosition = () => {
        if (!anchorRef.current) return;
        const rect = anchorRef.current.getBoundingClientRect();
        const gap = 8; // small gap below the button
        const menuWidth = 192; // 12rem (w-48)
        let left = rect.right - menuWidth; // right-align to trigger
        // Keep within viewport horizontally
        left = Math.max(8, Math.min(left, window.innerWidth - menuWidth - 8));
        // Prefer below the anchor; clamp to viewport bottom with small margin
        const top = Math.min(rect.bottom + gap, window.innerHeight - 8);
        setCoords({ top, left });
      };
      updatePosition();
      window.addEventListener('resize', updatePosition);
      // capture scroll on ancestors too
      window.addEventListener('scroll', updatePosition, true);
      return () => {
        window.removeEventListener('resize', updatePosition);
        window.removeEventListener('scroll', updatePosition, true);
      };
    } else {
      setCoords(null);
    }
  }, [isMobile, isOpen, anchorRef]);

  // Determine if current user is an admin assigned to the Program Chair office
  const isAdminProgramChair = (() => {
    if (!currentUserRole || currentUserRole.toLowerCase() !== 'admin') return false;
    const officeString: string | undefined = (currentUser as any)?.office;
    const officesArray: string[] = Array.isArray((currentUser as any)?.offices)
      ? ((currentUser as any).offices as string[])
      : [];

    const normalizedOffice = typeof officeString === 'string' ? officeString.toLowerCase() : '';
    const normalizedOffices = officesArray.map(o => (typeof o === 'string' ? o.toLowerCase() : ''));

    return normalizedOffice === 'program chair' || normalizedOffices.includes('program chair');
  })();

  // Add effect to track mount/unmount for debugging
  useEffect(() => {
    // console.log('🧩 PostActionSheet MOUNTED with post:', post.id);
    // console.log('🧩 PostActionSheet isOpen state:', isOpen);
    // console.log('🧩 PostActionSheet isMobile:', isMobile);
    
    // Add click outside listener for desktop dropdown
    const handleClickOutside = (event: MouseEvent) => {
      if (!isMobile && isOpen) {
        // Check if the click is outside the dropdown menu
        const targetElement = event.target as Element;
        if (!targetElement.closest('.post-action-dropdown') && 
            !targetElement.closest('[aria-label="Post options"]')) {
          // console.log('🧩 PostActionSheet outside click detected, closing dropdown');
          onClose();
        }
      }
    };
    
    // Add listener
    document.addEventListener('mousedown', handleClickOutside);
    
    return () => {
      // console.log('🧩 PostActionSheet UNMOUNTED for post ID:', post.id);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [post.id, isOpen, isMobile, onClose]);
  
  // Safety check
  if (!post) {
    console.error('⛔ PostActionSheet received null post object!');
    return null;
  }

  const handleDeleteAction = () => {
    // console.log('🧩 Delete action triggered for post:', post.id);
    // Call the onDelete callback to trigger the confirmation modal at the PostCard level
    if (onDelete) {
      onDelete();
    }
    // Close the action sheet when delete action is triggered
    onClose();
  };

  const handleHidePost = async () => {
    if (!currentUser) return;
    
    // Extra safety check: Prevent authors from hiding their own posts
    if (isAuthor || currentUser.id === post.userId) {
      console.error('Post authors cannot hide their own posts');
      onClose();
      return;
    }
    
    try {
      // Use the user's ID from our custom User type
      await hidePost(post.id, currentUser.id);
      if (onHide) {
        onHide();
      }
      if (onActionComplete) {
        onActionComplete('hide');
      }
      onClose();
    } catch (error) {
      console.error('Error hiding post:', error);
    }
  };

  const handleReport = () => {
    // Prevent admins and super admins from reporting posts
    if (isAdminOrSuperAdmin || currentUserRole === 'admin' || currentUserRole === 'super admin') {
      console.error('Admins and super admins cannot report posts');
      onClose();
      return;
    }
    
    if (onReport) {
      onReport();
    }
    if (onActionComplete) {
      onActionComplete('report');
    }
    onClose();
  };

  const handleSharePost = () => {
    if (onShare) {
      onShare();
    }
    if (onActionComplete) {
      onActionComplete('share');
    }
    onClose();
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // console.log('🧩 PostActionSheet backdrop clicked, calling onClose');
    onClose();
  };
  
  // Helper function to render action buttons for both mobile and desktop
  const renderActionButtons = (isDesktop: boolean) => {
    // Add debugging for action button rendering
    // console.log('🧩 renderActionButtons called with:', {
    //   isDesktop,
    //   isAuthor,
    //   isAdminOrSuperAdmin,
    //   hasOnShare: !!onShare,
    //   hasOnReport: !!onReport
    // });
    
    // Desktop styling classes
  const desktopButtonClass = "flex items-center w-full px-3 py-2 text-sm bg-transparent hover:bg-gray-700/70";
    const desktopIconClass = "h-4 w-4 mr-2";
    
    // Mobile styling classes
    const mobileButtonClass = "w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gradient-to-r hover:from-gray-800/40 hover:to-gray-700/20 rounded-xl transition-all duration-200 action-sheet-button";
    const mobileIconContainerClass = "w-9 h-9 rounded-full flex items-center justify-center";
    const mobileIconClass = "h-5 w-5";
    
    // Choose appropriate classes based on view
    const buttonClass = isDesktop ? desktopButtonClass : mobileButtonClass;
    const iconClass = isDesktop ? desktopIconClass : mobileIconClass;
    
    return (
      <>
      {/* Admin actions (only visible to super admins) */}
        {currentUserRole && currentUserRole.toLowerCase() === 'super admin' && !isAuthor && (
          <div className={isDesktop ? "border-b border-gray-700/50" : ""}>
            <button
              onClick={handleDeleteAction}
              className={`${buttonClass} text-red-400`}
              role="menuitem"
            >
              {isDesktop ? (
                <TrashIcon className={`${iconClass} text-red-400`} />
              ) : (
                <div className={`${mobileIconContainerClass} bg-gradient-to-br from-red-700/20 to-red-600/20`}>
                  <TrashIcon className={`${mobileIconClass} text-red-500`} />
                </div>
              )}
              <span className={isDesktop ? "" : "font-medium"}>Admin Delete</span>
            </button>
          </div>
        )}

        {/* Warn user - visible to admins assigned to Program Chair (delegates confirmation to parent via onWarn) */}
        {isAdminProgramChair && !isAuthor && (
          <div className={isDesktop ? "border-b border-gray-700/50" : ""}>
            <button
              onClick={() => {
                if (onWarn) onWarn();
                // Close sheet after triggering parent confirmation
                onClose();
              }}
              className={`${buttonClass} ${isDesktop ? "text-amber-400" : "text-amber-300"}`}
              role="menuitem"
            >
              {isDesktop ? (
                <FlagIcon className={`${iconClass} text-amber-400`} />
              ) : (
                <div className={`${mobileIconContainerClass} bg-gradient-to-br from-yellow-700/20 to-yellow-600/20`}>
                  <FlagIcon className={`${mobileIconClass} text-yellow-500`} />
                </div>
              )}
              <span className={isDesktop ? "" : "font-medium"}>Warn user</span>
            </button>
          </div>
        )}
        
        {/* Author actions */}
        {isAuthor && (
          <div className={isDesktop ? "border-b border-gray-700/50" : ""}>
            {canEdit && (
              <button
                onClick={() => {
                  if (!canEdit) return;
                  onEdit();
                  onClose();
                }}
                className={`${buttonClass} ${isDesktop ? "text-gray-300" : "text-white"}`}
                role="menuitem"
              >
                {isDesktop ? (
                  <PencilIcon className={`${iconClass} text-gray-400`} />
                ) : (
                  <div className={`${mobileIconContainerClass} bg-gradient-to-br from-blue-600/20 to-blue-500/20`}>
                    <PencilIcon className={`${mobileIconClass} text-blue-400`} />
                  </div>
                )}
                <span className={isDesktop ? "" : "font-medium"}>Edit post</span>
              </button>
            )}
            <button
              onClick={handleDeleteAction}
              className={`${buttonClass} text-red-400`}
              role="menuitem"
            >
              {isDesktop ? (
                <TrashIcon className={`${iconClass} text-red-400`} />
              ) : (
                <div className={`${mobileIconContainerClass} bg-gradient-to-br from-red-700/20 to-red-600/20`}>
                  <TrashIcon className={`${mobileIconClass} text-red-500`} />
                </div>
              )}
              <span className={isDesktop ? "" : "font-medium"}>Delete post</span>
            </button>
          </div>
        )}
        
        {/* Hide option - Available only for non-authors */}
        {!isAuthor && (
          <button
            onClick={handleHidePost}
            className={`${buttonClass} ${isDesktop ? "text-gray-300" : "text-white"}`}
            role="menuitem"
          >
            {isDesktop ? (
              <EyeSlashIcon className={`${iconClass} text-gray-400`} />
            ) : (
              <div className={`${mobileIconContainerClass} bg-gradient-to-br from-gray-600/20 to-gray-500/20`}>
                <EyeSlashIcon className={`${mobileIconClass} text-gray-400`} />
              </div>
            )}
            <span className={isDesktop ? "" : "font-medium"}>Hide for me</span>
          </button>
        )}
        
        {onShare && (
          <button
            onClick={handleSharePost}
            className={`${buttonClass} ${isDesktop ? "text-gray-300" : "text-white"}`}
            role="menuitem"
          >
            {isDesktop ? (
              <ShareIcon className={`${iconClass} text-gray-400`} />
            ) : (
              <div className={`${mobileIconContainerClass} bg-gradient-to-br from-blue-600/20 to-blue-500/20`}>
                <ShareIcon className={`${mobileIconClass} text-blue-400`} />
              </div>
            )}
            <span className={isDesktop ? "" : "font-medium"}>{isDesktop ? 'Share' : 'Share post'}</span>
          </button>
        )}
        
        {/* Report option (not for post author and not for admins/super admins) */}
        {!isAuthor && onReport && !isAdminOrSuperAdmin && currentUserRole !== 'admin' && currentUserRole !== 'super admin' && (
          <button
            onClick={handleReport}
            className={`${buttonClass} ${isDesktop ? "text-yellow-500" : "text-yellow-400"}`}
            role="menuitem"
          >
            {isDesktop ? (
              <FlagIcon className={`${iconClass} text-yellow-500`} />
            ) : (
              <div className={`${mobileIconContainerClass} bg-gradient-to-br from-yellow-700/20 to-yellow-600/20`}>
                <FlagIcon className={`${mobileIconClass} text-yellow-500`} />
              </div>
            )}
            <span className={isDesktop ? "" : "font-medium"}>{isDesktop ? 'Report' : 'Report post'}</span>
          </button>
        )}
        
        {currentFilter === 'reported' && (currentUserRole === 'admin' || currentUserRole === 'super admin') && post.reported && onUnreport && (
          <button
            onClick={async () => {
              await onUnreport();
              if (onActionComplete) onActionComplete('unreport');
              onClose();
            }}
            className={`${buttonClass} text-green-400`}
            role="menuitem"
          >
            <FlagIcon className={`${iconClass} text-green-400`} />
            <span className={isDesktop ? '' : 'font-medium'}>Unreport</span>
          </button>
        )}
        
        {/* Cancel button for mobile only */}
        {!isDesktop && (
          <div className="pt-2 mt-2 border-t border-gray-800/30">
            <button
              className="w-full text-gray-400 text-sm font-medium py-3 hover:text-gray-200 transition-colors"
              onClick={onClose}
            >
              Cancel
            </button>
          </div>
        )}
        
        {/* Fallback: If no other actions are available, show a message */}
        {!isAuthor && !isAdminOrSuperAdmin && !onShare && !onReport && (
          <div className={`${isDesktop ? "px-3 py-2" : "px-4 py-3"} text-gray-500 text-sm`}>
            No actions available
          </div>
        )}
      </>
    );
  };

  // If not open, return null
  if (!isOpen) {
    // console.log('🧩 PostActionSheet not open, returning null');
    return null;
  }
  
  // console.log('🧩 PostActionSheet rendering with:', {
  //   isOpen,
  //   isMobile,
  //   isAuthor,
  //   isAdminOrSuperAdmin,
  //   postId: post.id
  // });

  // For desktop, render a dropdown menu
  if (!isMobile) {
    // console.log('🧩 Rendering desktop dropdown menu');
    // If an anchor is provided, use a portal to avoid clipping/stacking issues
    if (anchorRef && isOpen) {
      // Avoid initial flicker: wait until we have computed coords
      if (!coords) {
        return null;
      }
      const portal = (
        <div
          className={`post-action-dropdown ${className || ''}`}
          style={{
            position: 'fixed',
            top: coords.top,
            left: coords.left,
            zIndex: 2147483648,
            minWidth: '12rem'
          }}
        >
          <div className="w-48 rounded-lg border border-gray-700/60 shadow-xl bg-gray-800/95 backdrop-blur-sm overflow-hidden">
            <div className="py-1" role="menu" aria-orientation="vertical">
              {renderActionButtons(true)}
            </div>
          </div>
        </div>
      );
      return ReactDOM.createPortal(portal, document.body);
    }

    // Fallback to inline positioning ONLY if no anchor provided in props
    return (
      <div className={`relative ${className}`}>
        <div
          className="absolute right-0 top-full mt-1 z-[2147483648] w-48 rounded-lg border border-gray-700/60 shadow-xl bg-gray-800/95 backdrop-blur-sm overflow-hidden post-action-dropdown"
          style={{
            position: 'absolute',
            zIndex: 2147483648,
            minWidth: '12rem'
          }}
        >
          <div className="py-1" role="menu" aria-orientation="vertical">
            {renderActionButtons(true)}
          </div>
        </div>
      </div>
    );
  }

  // For mobile, create a portal element to render the action sheet at document root
  // console.log('🧩 Rendering mobile action sheet portal');
  const portalContent = (
    <div 
      className="post-action-sheet-container bg-black/70 backdrop-blur-sm" 
      onClick={handleBackdropClick}
    >
      <div 
        className="action-sheet-content bg-gradient-to-b from-[#1e1e1e] to-[#121212] rounded-t-2xl p-5 shadow-lg border-t border-gray-800/30"
        onClick={e => e.stopPropagation()}
      >
        {/* Drag indicator */}
        <div className="flex justify-center mb-3">
          <div className="w-10 h-1 bg-gray-600 rounded-full"></div>
        </div>
        
        <div className="space-y-2">
          {renderActionButtons(false)}
        </div>
      </div>
    </div>
  );

  // Use document body as the portal container
  return ReactDOM.createPortal(portalContent, document.body);
};

export default PostActionSheet;
