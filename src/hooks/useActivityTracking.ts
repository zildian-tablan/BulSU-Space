import { useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

/**
 * Hook to automatically track user activities
 */
export const useActivityTracking = () => {
  const location = useLocation();
  const { currentUser } = useAuth();

  // Track page visits
  useEffect(() => {
    if (currentUser) {
      const pageName = location.pathname.split('/').pop() || 'home';
    }
  }, [location.pathname, currentUser]);

  // Function to log settings changes
  const logSettingChange = useCallback(async (
    settingName: string, 
    oldValue: any, 
    newValue: any
  ) => {
    if (currentUser) {
      try {
      } catch (err) {
        console.warn('Failed to log setting change:', err);
      }
    }
  }, [currentUser]);

  return {
    logSettingChange
  };
};

/**
 * Hook to track form interactions
 */
export const useFormActivityTracking = (formName: string) => {
  const { currentUser } = useAuth();

  const logFormStart = useCallback(async () => {
    if (currentUser) {
      try {
        // This would be logged as a page_visited or settings_changed activity
        // depending on the context
      } catch (err) {
        console.warn('Failed to log form start:', err);
      }
    }
  }, [currentUser, formName]);

  const logFormSubmit = useCallback(async (success: boolean, details?: any) => {
    if (currentUser) {
      try {
        // This would be logged as a settings_changed activity
        if (success) {
        }
      } catch (err) {
        console.warn('Failed to log form submit:', err);
      }
    }
  }, [currentUser, formName]);

  return {
    logFormStart,
    logFormSubmit
  };
};

/**
 * Hook to track search activities
 */
export const useSearchActivityTracking = () => {
  const { currentUser } = useAuth();

  const logSearch = useCallback(async (searchTerm: string, resultsCount: number) => {
    if (currentUser) {
      try {
        // Import the activity logger directly for search logging
        const { activityLogger } = await import('../services/activityLogService');
        await activityLogger.logActivity(
          'search_performed',
          `Search performed: "${searchTerm}"`,
          { searchTerm, resultsCount },
          'low'
        );
      } catch (err) {
        console.warn('Failed to log search:', err);
      }
    }
  }, [currentUser]);

  return {
    logSearch
  };
};

/**
 * Hook to track file operations
 */
export const useFileActivityTracking = () => {
  const { currentUser } = useAuth();

  const logFileUpload = useCallback(async (fileName: string, fileSize: number, fileType: string) => {
    if (currentUser) {
      try {
        const { activityLogger } = await import('../services/activityLogService');
        await activityLogger.logActivity(
          'file_uploaded',
          `File uploaded: ${fileName}`,
          { fileName, fileSize, fileType },
          'low'
        );
      } catch (err) {
        console.warn('Failed to log file upload:', err);
      }
    }
  }, [currentUser]);

  const logFileDownload = useCallback(async (fileName: string, fileSize: number) => {
    if (currentUser) {
      try {
        const { activityLogger } = await import('../services/activityLogService');
        await activityLogger.logActivity(
          'file_downloaded',
          `File downloaded: ${fileName}`,
          { fileName, fileSize },
          'low'
        );
      } catch (err) {
        console.warn('Failed to log file download:', err);
      }
    }
  }, [currentUser]);

  const logFileDelete = useCallback(async (fileName: string) => {
    if (currentUser) {
      try {
        const { activityLogger } = await import('../services/activityLogService');
        await activityLogger.logActivity(
          'file_deleted',
          `File deleted: ${fileName}`,
          { fileName },
          'medium'
        );
      } catch (err) {
        console.warn('Failed to log file delete:', err);
      }
    }
  }, [currentUser]);

  return {
    logFileUpload,
    logFileDownload,
    logFileDelete
  };
};

/**
 * Hook to track social interactions
 */
export const useSocialActivityTracking = () => {
  const { currentUser } = useAuth();

  const logPostCreate = useCallback(async (postId: string, postType: string) => {
    if (currentUser) {
      try {
        const { activityLogger } = await import('../services/activityLogService');
        const activityType = postType === 'announcement' ? 'announcement_created' : 'post_created';
        await activityLogger.logActivity(
          activityType,
          postType === 'announcement' ? 'Announcement created' : 'Post created',
          { postId, postType },
          'low',
          postId,
          'post'
        );
      } catch (err) {
        console.warn('Failed to log post creation:', err);
      }
    }
  }, [currentUser]);

  const logPostEdit = useCallback(async (postId: string) => {
    if (currentUser) {
      try {
        const { activityLogger } = await import('../services/activityLogService');
        await activityLogger.logActivity(
          'post_edited',
          `Post edited`,
          { postId },
          'low',
          postId,
          'post'
        );
      } catch (err) {
        console.warn('Failed to log post edit:', err);
      }
    }
  }, [currentUser]);

  const logPostDelete = useCallback(async (postId: string) => {
    if (currentUser) {
      try {
        const { activityLogger } = await import('../services/activityLogService');
        await activityLogger.logActivity(
          'post_deleted',
          `Post deleted`,
          { postId },
          'medium',
          postId,
          'post'
        );
      } catch (err) {
        console.warn('Failed to log post delete:', err);
      }
    }
  }, [currentUser]);

  const logCommentAdd = useCallback(async (commentId: string, postId: string) => {
    if (currentUser) {
      try {
        const { activityLogger } = await import('../services/activityLogService');
        await activityLogger.logActivity(
          'comment_added',
          `Comment added`,
          { commentId, postId },
          'low',
          commentId,
          'comment'
        );
      } catch (err) {
        console.warn('Failed to log comment add:', err);
      }
    }
  }, [currentUser]);

  const logReactionAdd = useCallback(async (reactionType: string, postId: string) => {
    if (currentUser) {
      try {
        const { activityLogger } = await import('../services/activityLogService');
        await activityLogger.logActivity(
          'reaction_added',
          `Reaction added: ${reactionType}`,
          { reactionType, postId },
          'low',
          postId,
          'post'
        );
      } catch (err) {
        console.warn('Failed to log reaction add:', err);
      }
    }
  }, [currentUser]);

  return {
    logPostCreate,
    logPostEdit,
    logPostDelete,
    logCommentAdd,
    logReactionAdd
  };
};

/**
 * Hook to track messaging activities
 */
export const useMessagingActivityTracking = () => {
  const { currentUser } = useAuth();

  const logMessageSent = useCallback(async (messageId: string, recipientId: string) => {
    if (currentUser) {
      try {
        const { activityLogger } = await import('../services/activityLogService');
        await activityLogger.logActivity(
          'message_sent',
          `Message sent`,
          { messageId, recipientId },
          'low',
          messageId,
          'message'
        );
      } catch (err) {
        console.warn('Failed to log message sent:', err);
      }
    }
  }, [currentUser]);

  const logMessageRead = useCallback(async (messageId: string, senderId: string) => {
    if (currentUser) {
      try {
        const { activityLogger } = await import('../services/activityLogService');
        await activityLogger.logActivity(
          'message_read',
          `Message read`,
          { messageId, senderId },
          'low',
          messageId,
          'message'
        );
      } catch (err) {
        console.warn('Failed to log message read:', err);
      }
    }
  }, [currentUser]);

  return {
    logMessageSent,
    logMessageRead
  };
};

/**
 * Hook to track group/space activities
 */
export const useGroupActivityTracking = () => {
  const { currentUser } = useAuth();

  const logGroupJoin = useCallback(async (groupId: string, groupName: string) => {
    if (currentUser) {
      try {
        const { activityLogger } = await import('../services/activityLogService');
        await activityLogger.logActivity(
          'group_joined',
          `Joined group: ${groupName}`,
          { groupId, groupName },
          'low',
          groupId,
          'group'
        );
      } catch (err) {
        console.warn('Failed to log group join:', err);
      }
    }
  }, [currentUser]);

  const logGroupLeave = useCallback(async (groupId: string, groupName: string) => {
    if (currentUser) {
      try {
        const { activityLogger } = await import('../services/activityLogService');
        await activityLogger.logActivity(
          'group_left',
          `Left group: ${groupName}`,
          { groupId, groupName },
          'low',
          groupId,
          'group'
        );
      } catch (err) {
        console.warn('Failed to log group leave:', err);
      }
    }
  }, [currentUser]);

  const logGroupCreate = useCallback(async (groupId: string, groupName: string) => {
    if (currentUser) {
      try {
        const { activityLogger } = await import('../services/activityLogService');
        await activityLogger.logActivity(
          'group_created',
          `Created group: ${groupName}`,
          { groupId, groupName },
          'low',
          groupId,
          'group'
        );
      } catch (err) {
        console.warn('Failed to log group creation:', err);
      }
    }
  }, [currentUser]);

  return {
    logGroupJoin,
    logGroupLeave,
    logGroupCreate
  };
};

/**
 * Hook to track space activities
 */
export const useSpaceActivityTracking = () => {
  const { currentUser } = useAuth();

  const logSpaceJoin = useCallback(async (spaceId: string, spaceName: string) => {
    if (currentUser) {
      try {
        const { activityLogger } = await import('../services/activityLogService');
        await activityLogger.logActivity(
          'space_joined',
          `Joined space: ${spaceName}`,
          { spaceId, spaceName },
          'low',
          spaceId || 'unknown-space', // Providing fallback to prevent undefined error
          'space'
        );
      } catch (err) {
        console.warn('Failed to log space join:', err);
      }
    }
  }, [currentUser]);

  const logSpaceLeave = useCallback(async (spaceId: string, spaceName: string) => {
    if (currentUser) {
      try {
        const { activityLogger } = await import('../services/activityLogService');
        await activityLogger.logActivity(
          'space_left',
          `Left space: ${spaceName}`,
          { spaceId, spaceName },
          'low',
          spaceId || 'unknown-space',
          'space'
        );
      } catch (err) {
        console.warn('Failed to log space leave:', err);
      }
    }
  }, [currentUser]);

  const logSpaceCreate = useCallback(async (spaceId: string, spaceName: string) => {
    if (currentUser) {
      try {
        const { activityLogger } = await import('../services/activityLogService');
        await activityLogger.logActivity(
          'space_created',
          `Created space: ${spaceName}`,
          { spaceId, spaceName },
          'low',
          spaceId || 'unknown-space',
          'space'
        );
      } catch (err) {
        console.warn('Failed to log space creation:', err);
      }
    }
  }, [currentUser]);

  return {
    logSpaceJoin,
    logSpaceLeave,
    logSpaceCreate
  };
};