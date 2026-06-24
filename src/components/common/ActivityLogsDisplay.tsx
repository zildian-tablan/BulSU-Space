import React, { useState, useEffect, useCallback } from 'react';
import { 
  ClockIcon, 
  ExclamationTriangleIcon, 
  InformationCircleIcon, 
  CheckCircleIcon,
  XCircleIcon,
  EyeIcon,
  EyeSlashIcon,
  FunnelIcon,
  ArrowPathIcon,
  DocumentTextIcon,
  ShieldCheckIcon,
  UserIcon,
  KeyIcon,
  EnvelopeIcon,
  DevicePhoneMobileIcon,
  CogIcon,
  GlobeAltIcon,
  ChatBubbleLeftIcon,
  HeartIcon,
  UserGroupIcon,
  PhotoIcon,
  MagnifyingGlassIcon,
  BellIcon,
  LockClosedIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  AdjustmentsHorizontalIcon,
  PaperAirplaneIcon,
  HandThumbUpIcon,
  TrashIcon,
  PencilIcon,
  ExclamationCircleIcon,
  ArrowRightOnRectangleIcon,
  ShieldExclamationIcon,
  ArrowPathRoundedSquareIcon,
  NoSymbolIcon,
  MegaphoneIcon,
  TableCellsIcon,
  CalendarIcon,
  ShareIcon,
} from '@heroicons/react/24/outline';
import { ActivityLogEntry, ActivityType, ActivitySeverity, activityLogger } from '../../services/activityLogService';
import { useAuth } from '../../contexts/AuthContext';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';

interface ActivityLogsDisplayProps {
  maxLogs?: number;
  showFilters?: boolean;
  showStats?: boolean;
}

// Utility function to resolve UIDs to user names
const resolveUIDToName = async (uid: string): Promise<string> => {
  // Check cache first
  if (uidNameCache.has(uid)) {
    return uidNameCache.get(uid)!;
  }
  
  try {
    const userDoc = await getDoc(doc(db, 'users', uid));
    if (userDoc.exists()) {
      const userData = userDoc.data();
      const name = userData.name || userData.email || 'Unknown User';
      // Cache the result
      uidNameCache.set(uid, name);
      return name;
    }
    // Cache unknown users too
    uidNameCache.set(uid, 'Unknown User');
    return 'Unknown User';
  } catch (error) {
    console.error('Error resolving UID to name:', error);
    // Cache errors too to avoid repeated failed attempts
    uidNameCache.set(uid, 'Unknown User');
    return 'Unknown User';
  }
};

// Cache for resolved UID to name mappings
const uidNameCache = new Map<string, string>();

// Function to process text and replace UIDs with names
const processTextWithNames = async (text: string): Promise<string> => {
  // Check if text contains what looks like a UID
  // Use the same detection logic as isLikelyUID
  const uidPattern = /\b[a-zA-Z0-9]{20,28}\b/g;
  const matches = text.match(uidPattern);
  
  if (!matches) return text;
  
  let processedText = text;
  
  // Remove duplicates and sort by length (longest first to avoid partial matches)
  const uniqueMatches = [...new Set(matches)].sort((a, b) => b.length - a.length);
  
  for (const potentialUID of uniqueMatches) {
    // Use the improved UID detection logic
    if (!isLikelyUID(potentialUID)) {
      continue;
    }
    
    try {
      const name = await resolveUIDToName(potentialUID);
      // Only replace if we actually got a name (not "Unknown User")
      if (name !== 'Unknown User') {
        processedText = processedText.replace(new RegExp(`\\b${potentialUID}\\b`, 'g'), name);
      }
    } catch (error) {
      console.error('Error processing potential UID:', potentialUID, error);
    }
  }
  
  return processedText;
};

// Function to process activity log details and replace UIDs with names
const processActivityLogDetails = async (details: Record<string, any>): Promise<Record<string, any>> => {
  const processedDetails: Record<string, any> = {};
  
  for (const [key, value] of Object.entries(details)) {
    if (typeof value === 'string') {
      // Check if this string value looks like a UID
      if (isLikelyUID(value)) {
        try {
          const userName = await resolveUIDToName(value);
          processedDetails[key] = userName;
        } catch (error) {
          console.error('Error processing UID in details:', key, value, error);
          processedDetails[key] = value; // Keep original if processing fails
        }
      } else {
        // Process text for embedded UIDs
        processedDetails[key] = await processTextWithNames(value);
      }
    } else if (typeof value === 'object' && value !== null) {
      processedDetails[key] = await processActivityLogDetails(value);
    } else {
      processedDetails[key] = value;
    }
  }
  
  return processedDetails;
};

// Helper function to check if a string is likely a UID
const isLikelyUID = (str: string): boolean => {
  // Firebase UIDs are typically 28 characters, but we'll also check for shorter ones
  // and avoid common words or patterns
  if (str.length < 20 || str.length > 28) return false;
  
  // Must contain only alphanumeric characters
  if (!/^[a-zA-Z0-9]+$/.test(str)) return false;
  
  // Skip if it looks like a common word or pattern
  if (/^(admin|user|test|demo|guest|anon|temp|dummy|none|null|undefined)$/i.test(str)) return false;
  
  // Skip if it's all the same character
  if (/^(.)\1+$/.test(str)) return false;
  
  return true;
};

const ActivityLogsDisplay: React.FC<ActivityLogsDisplayProps> = ({ 
  maxLogs = 50, 
  showFilters = true, 
  showStats = true 
}) => {
  const { currentUser } = useAuth();
  const [allActivityLogs, setAllActivityLogs] = useState<ActivityLogEntry[]>([]);
  const [processedLogs, setProcessedLogs] = useState<ActivityLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isRefreshingNames, setIsRefreshingNames] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  
  // Filter states
  const [dateRange, setDateRange] = useState<'all' | 'today' | 'week' | 'month'>('all');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  
  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const logsPerPage = 10;

  // Activity type categories for filtering
  const activityTypeCategories = {
    'Authentication': ['login', 'logout', 'password_change', 'mfa_enabled', 'mfa_disabled', 'email_verified', 'phone_verified', 'biometric_enabled', 'biometric_disabled'] as ActivityType[],
    'Profile': ['profile_update', 'recovery_email_changed'] as ActivityType[],
  'Content': ['post_created', 'post_shared', 'post_edited', 'post_deleted', 'comment_added', 'comment_edited', 'comment_deleted', 'reaction_added', 'reaction_removed'] as ActivityType[],
    'Messages': ['message_sent', 'message_read'] as ActivityType[],
    'Groups': ['group_joined', 'group_left', 'group_created', 'space_joined', 'space_left', 'space_created'] as ActivityType[],
    'Files': ['file_uploaded', 'file_downloaded', 'file_deleted'] as ActivityType[],
    'System': ['settings_changed', 'notification_read', 'search_performed'] as ActivityType[],
    'Security': ['security_alert', 'account_locked', 'suspicious_activity', 'data_exported', 'data_deleted'] as ActivityType[],
    'Friends': ['friend_request_sent', 'friend_request_accepted', 'friend_request_declined', 'friend_request_cancelled'] as ActivityType[]
  };

  // Fallback icon for missing icons
  const FallbackIcon = (props: any) => {
    console.warn('FallbackIcon used: an activity icon is missing or undefined.');
    return <span style={{ color: 'red', fontWeight: 'bold' }}>?</span>;
  };

  // Simple emoji icon components for fallback
  const EmojiUser = (props: any) => <span role="img" aria-label="user" {...props}>👤</span>;
  const EmojiCheck = (props: any) => <span role="img" aria-label="accepted" {...props}>✅</span>;
  const EmojiCross = (props: any) => <span role="img" aria-label="declined" {...props}>❌</span>;
  const EmojiTrash = (props: any) => <span role="img" aria-label="cancelled" {...props}>🗑️</span>;

  // Update activity type icons with more appropriate icons (including post_reported)
  const activityTypeIcons: Record<ActivityType, React.ComponentType<any>> = {
    login: UserIcon,
    logout: ArrowRightOnRectangleIcon,
    profile_update: UserIcon,
    password_change: KeyIcon,
    mfa_enabled: LockClosedIcon,
    mfa_disabled: LockClosedIcon,
    post_created: DocumentTextIcon,
  post_edited: PencilIcon,
  post_shared: ShareIcon,
    post_deleted: TrashIcon,
    post_reported: ExclamationTriangleIcon,
    comment_added: ChatBubbleLeftIcon,
    comment_edited: PencilIcon,
    comment_deleted: TrashIcon,
    reaction_added: HandThumbUpIcon,
    reaction_removed: HeartIcon,
    message_sent: PaperAirplaneIcon,
    message_read: EyeIcon,
    group_joined: UserGroupIcon,
    group_left: UserGroupIcon,
    group_created: UserGroupIcon,
    space_joined: GlobeAltIcon,
    space_left: GlobeAltIcon,
    space_created: GlobeAltIcon,
    file_uploaded: PhotoIcon,
    file_downloaded: PhotoIcon,
    file_deleted: TrashIcon,
    settings_changed: CogIcon,
    notification_read: BellIcon,
    search_performed: MagnifyingGlassIcon,
    security_alert: ExclamationTriangleIcon,
    account_locked: LockClosedIcon,
    suspicious_activity: ExclamationCircleIcon,
    data_exported: DocumentTextIcon,
    data_deleted: TrashIcon,
    recovery_email_changed: EnvelopeIcon,
    email_verified: EnvelopeIcon,
    phone_verified: DevicePhoneMobileIcon,
    biometric_enabled: ShieldCheckIcon,
    biometric_disabled: ShieldCheckIcon,
    friend_request_sent: EmojiUser,
    friend_request_accepted: EmojiCheck,
    friend_request_declined: EmojiCross,
    friend_request_cancelled: EmojiTrash,
    friend_removed: EmojiTrash,
    user_access_revoked: ShieldExclamationIcon,
    user_access_restored: ArrowPathRoundedSquareIcon,
    user_access_restricted: NoSymbolIcon,
    announcement_created: DocumentTextIcon,
    batch_accounts_created: UserGroupIcon,
    admin_account_created: ShieldCheckIcon,
  dean_account_created: ShieldCheckIcon,
  alumni_request_approved: CheckCircleIcon,
  alumni_request_rejected: XCircleIcon,
    alumni_invites_sent: EnvelopeIcon,
    academic_event_created: CalendarIcon,
    academic_event_deleted: CalendarIcon,
    event_deleted: CalendarIcon,
    annual_archive: CalendarIcon,
    job_post_deleted: TrashIcon,
  };

  // Warn if any icon is undefined
  console.log('[ActivityLogsDisplay] Icon check:', {
    friend_request_sent: EmojiUser,
    friend_request_accepted: EmojiCheck,
    friend_request_declined: EmojiCross,
    friend_request_cancelled: EmojiTrash,
    friend_removed: EmojiTrash
  });

  // Severity color mapping
  const severityColors: Record<ActivitySeverity, string> = {
    low: 'text-blue-400 bg-blue-900/20 border-blue-700/50',
    medium: 'text-yellow-400 bg-yellow-900/20 border-yellow-700/50',
    high: 'text-orange-400 bg-orange-900/20 border-orange-700/50',
    critical: 'text-red-400 bg-red-900/20 border-red-700/50'
  };

  // Activity type labels (including post_reported)
  const activityTypeLabels: Record<ActivityType, string> = {
    login: 'Login',
    logout: 'Logout',
    profile_update: 'Profile Update',
    password_change: 'Password Change',
    mfa_enabled: 'MFA Enabled',
    mfa_disabled: 'MFA Disabled',
    post_created: 'Post Created',
  post_edited: 'Post Edited',
  post_shared: 'Post Shared',
    post_deleted: 'Post Deleted',
    post_reported: 'Post Reported',
    comment_added: 'Comment Added',
    comment_edited: 'Comment Edited',
    comment_deleted: 'Comment Deleted',
    reaction_added: 'Reaction Added',
    reaction_removed: 'Reaction Removed',
    message_sent: 'Message Sent',
    message_read: 'Message Read',
    group_joined: 'Group Joined',
    group_left: 'Group Left',
    group_created: 'Group Created',
    space_joined: 'Space Joined',
    space_left: 'Space Left',
    space_created: 'Space Created',
    file_uploaded: 'File Uploaded',
    file_downloaded: 'File Downloaded',
    file_deleted: 'File Deleted',
    settings_changed: 'Settings Changed',
    notification_read: 'Notification Read',
    search_performed: 'Search Performed',
    security_alert: 'Security Alert',
    account_locked: 'Account Locked',
    suspicious_activity: 'Suspicious Activity',
    data_exported: 'Data Exported',
    data_deleted: 'Data Deleted',
    recovery_email_changed: 'Recovery Email Changed',
    email_verified: 'Email Verified',
    phone_verified: 'Phone Verified',
    biometric_enabled: 'Biometric Enabled',
    biometric_disabled: 'Biometric Disabled',
    friend_request_sent: 'Friend Request Sent',
    friend_request_accepted: 'Friend Request Accepted',
    friend_request_declined: 'Friend Request Declined',
    friend_request_cancelled: 'Friend Request Cancelled',
    friend_removed: 'Friend Removed',
    user_access_revoked: 'User Access Revoked',
    user_access_restored: 'User Access Restored',
    user_access_restricted: 'User Access Restricted',
    announcement_created: 'Announcement Created',
    batch_accounts_created: 'Batch Accounts Created',
    admin_account_created: 'Admin Account Created',
  dean_account_created: 'Dean Account Created',
  alumni_request_approved: 'Alumni Request Approved',
  alumni_request_rejected: 'Alumni Request Rejected',
    alumni_invites_sent: 'Alumni Invites Sent',
    academic_event_created: 'Academic Event Created',
    academic_event_deleted: 'Academic Event Deleted',
    event_deleted: 'Event Deleted',
    annual_archive: 'Annual Archive',
    job_post_deleted: 'Job Post Deleted',
  };

  // Load activity logs
  const loadActivityLogs = async () => {
    if (!currentUser?.id) return;

    setIsLoading(true);
    setError(null);

    try {
      const logs = await activityLogger.getUserActivityLogs(currentUser.id, maxLogs);

      // Apply date range filter only
      let filteredLogs = logs;
      
      if (dateRange !== 'all') {
        const now = new Date();
        let cutoffDate: Date;

        switch (dateRange) {
          case 'today':
            cutoffDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            break;
          case 'week':
            cutoffDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
          case 'month':
            cutoffDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            break;
          default:
            cutoffDate = new Date(0);
        }

        filteredLogs = filteredLogs.filter(log => log.timestamp >= cutoffDate);
      }

      setAllActivityLogs(filteredLogs);
      
      // Debug: Log the raw logs to see their structure
      console.log('[UID Processing] Raw logs before processing:', filteredLogs.map(log => ({
        id: log.id,
        activityType: log.activityType,
        description: log.description,
        details: log.details,
        relatedEntityId: log.relatedEntityId,
        relatedEntityType: log.relatedEntityType
      })));
      
      // Process logs to replace UIDs with names
      setIsProcessing(true);
      try {
        const processedLogs = await Promise.all(
          filteredLogs.map(async (log) => {
            const processedLog = { ...log };
            
            try {
              // Process description
              if (log.description) {
                processedLog.description = await processTextWithNames(log.description);
              }
              
              // Process details
              if (log.details && Object.keys(log.details).length > 0) {
                processedLog.details = await processActivityLogDetails(log.details);
              }
              
              // Process relatedEntityId if it's a UID
              if (log.relatedEntityId && log.relatedEntityType === 'user') {
                try {
                  const userName = await resolveUIDToName(log.relatedEntityId);
                  processedLog.relatedEntityId = userName;
                } catch (error) {
                  console.error('Error processing related entity UID:', error);
                }
              }
              
              // Special handling for specific activity types that commonly contain UIDs
              if (log.activityType === 'user_access_revoked' || 
                  log.activityType === 'user_access_restored' || 
                  log.activityType === 'user_access_restricted') {
                // These activities often have UIDs in details.targetUserId
                if (log.details && log.details.targetUserId) {
                  try {
                    const targetUserName = await resolveUIDToName(log.details.targetUserId);
                    processedLog.details = {
                      ...processedLog.details,
                      targetUserId: targetUserName
                    };
                  } catch (error) {
                    console.error('Error processing target user UID:', error);
                  }
                }
              }
              
              // Debug logging for UID processing
              if (log.activityType === 'user_access_revoked') {
                console.log('[UID Processing] user_access_revoked log:', {
                  original: log,
                  processed: processedLog,
                  hasTargetUserId: log.details?.targetUserId,
                  processedTargetUserId: processedLog.details?.targetUserId
                });
              }
              
            } catch (error) {
              console.error('Error processing log entry:', log.id, error);
              // Return the original log if processing fails
              return log;
            }
            
            return processedLog;
          })
        );
        
        // Debug: Log the processed logs to see the results
        console.log('[UID Processing] Processed logs after UID resolution:', processedLogs.map(log => ({
          id: log.id,
          activityType: log.activityType,
          description: log.description,
          details: log.details,
          relatedEntityId: log.relatedEntityId,
          relatedEntityType: log.relatedEntityType
        })));
        
        setProcessedLogs(processedLogs);
      } catch (error) {
        console.error('Error processing activity logs:', error);
        // Fallback to unprocessed logs if processing fails
        setProcessedLogs(filteredLogs);
      } finally {
        setIsProcessing(false);
      }
      setCurrentPage(1); // Reset to first page when filters change

      // Load stats if enabled
      if (showStats) {
        const userStats = await activityLogger.getUserActivityStats(currentUser.id);
        setStats(userStats);
      }
    } catch (err) {
      console.error('Error loading activity logs:', err);
      setError('Failed to load activity logs. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Load logs on component mount and when filters change
  useEffect(() => {
    loadActivityLogs();
    
    // Log page view for analytics
    console.log('[ActivityLogger] Activity logs display rendered');
  }, [currentUser?.id, dateRange]);

  // Auto-hide toast after 3 seconds
  useEffect(() => {
    if (showToast) {
      const timer = setTimeout(() => {
        setShowToast(false);
      }, 3000);
      
      return () => clearTimeout(timer);
    }
  }, [showToast]);

  // Clear all filters
  const clearFilters = useCallback(() => {
    setDateRange('all');
    setCurrentPage(1);
    // Clear the UID cache when filters are cleared
    uidNameCache.clear();
  }, []);

  // Clear UID cache function
  const clearUIDCache = useCallback(async () => {
    setIsRefreshingNames(true);
    try {
      uidNameCache.clear();
      // Reload logs to refresh the display
      await loadActivityLogs();
      // Show a brief success message
      setToastMessage('User names refreshed successfully!');
      setShowToast(true);
    } finally {
      setIsRefreshingNames(false);
    }
  }, [loadActivityLogs]);

  // Format timestamp
  const formatTimestamp = (timestamp: Date) => {
    const now = new Date();
    const diff = now.getTime() - timestamp.getTime();
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    
    return timestamp.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Calculate pagination
  const totalPages = Math.ceil(processedLogs.length / logsPerPage);
  const startIndex = (currentPage - 1) * logsPerPage;
  const endIndex = startIndex + logsPerPage;
  const currentLogs = processedLogs.slice(startIndex, endIndex);

  // Navigation functions
  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  const goToPreviousPage = () => {
    goToPage(currentPage - 1);
  };

  const goToNextPage = () => {
    goToPage(currentPage + 1);
  };

  if (!currentUser) {
    return (
      <div className="text-center py-8 text-gray-400">
        Please log in to view your activity logs.
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Toast Notification */}
      {showToast && (
        <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50 px-6 py-3 rounded-lg shadow-lg bg-green-600 text-white text-sm">
          {toastMessage}
        </div>
      )}
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-green-400 flex items-center">
            <ClockIcon className="h-5 w-5 mr-2" />
            Activity Logs
          </h3>
          <p className="text-sm text-gray-400 mt-1">
            {isLoading ? 'Loading your activity history...' : 'Track all your activities and security events'}
          </p>
        </div>
        <button
          onClick={loadActivityLogs}
          disabled={isLoading}
          className="flex items-center justify-center px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-md text-sm font-medium transition-colors disabled:opacity-50 w-full sm:w-auto"
        >
          <ArrowPathIcon className={`h-4 w-4 mr-1 ${isLoading ? 'animate-spin' : ''}`} />
          {isLoading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {/* Stats Section */}
      {showStats && stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-gray-800/50 p-3 sm:p-4 rounded-lg border border-gray-700">
            <div className="flex items-center">
              <ClockIcon className="h-4 w-4 sm:h-5 sm:w-5 text-blue-400 mr-2" />
              <div>
                <p className="text-xs sm:text-sm text-gray-400">Total Activities</p>
                <p className="text-sm sm:text-lg font-semibold text-white">{stats.totalActivities}</p>
              </div>
            </div>
          </div>
          <div className="bg-gray-800/50 p-3 sm:p-4 rounded-lg border border-gray-700">
            <div className="flex items-center">
              <InformationCircleIcon className="h-4 w-4 sm:h-5 sm:w-5 text-green-400 mr-2" />
              <div>
                <p className="text-xs sm:text-sm text-gray-400">This Week</p>
                <p className="text-sm sm:text-lg font-semibold text-white">{stats.recentActivityCount}</p>
              </div>
            </div>
          </div>
          <div className="bg-gray-800/50 p-3 sm:p-4 rounded-lg border border-gray-700">
            <div className="flex items-center">
              <ExclamationTriangleIcon className="h-4 w-4 sm:h-5 sm:w-5 text-orange-400 mr-2" />
              <div>
                <p className="text-xs sm:text-sm text-gray-400">High Severity</p>
                <p className="text-sm sm:text-lg font-semibold text-white">{stats.activitiesBySeverity?.high || 0}</p>
              </div>
            </div>
          </div>
          <div className="bg-gray-800/50 p-3 sm:p-4 rounded-lg border border-gray-700">
            <div className="flex items-center">
              <CheckCircleIcon className="h-4 w-4 sm:h-5 sm:w-5 text-green-400 mr-2" />
              <div>
                <p className="text-xs sm:text-sm text-gray-400">Last Activity</p>
                <p className="text-xs sm:text-sm font-medium text-white">
                  {stats.lastActivityDate ? formatTimestamp(stats.lastActivityDate) : 'Never'}
                </p>
              </div>
            </div>
          </div>
          
          {/* UID Cache Status */}
          <div className="bg-gray-800/50 p-3 sm:p-4 rounded-lg border border-gray-700">
            <div className="flex items-center">
              <UserIcon className="h-4 w-4 sm:h-5 sm:w-5 text-blue-400 mr-2" />
              <div>
                <p className="text-xs sm:text-sm text-gray-400">Name Cache</p>
                <p className="text-xs sm:text-sm font-medium text-white">
                  {uidNameCache.size} users cached
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filters Section */}
      {showFilters && (
        <div className="bg-gray-800/50 p-3 sm:p-4 rounded-lg border border-gray-700">
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <h4 className="text-sm sm:text-md font-medium text-green-300 flex items-center">
              <FunnelIcon className="h-4 w-4 mr-2" />
              Filters
            </h4>
            <div className="flex items-center space-x-2">
              <button
                onClick={clearUIDCache}
                disabled={isRefreshingNames}
                className={`text-xs sm:text-sm flex items-center ${
                  isRefreshingNames 
                    ? 'text-blue-300 cursor-not-allowed' 
                    : 'text-blue-400 hover:text-blue-300'
                }`}
                title="Refresh user names in activity logs. This will reload user information and replace any UIDs with actual names."
              >
                {isRefreshingNames ? (
                  <div className="animate-spin rounded-full h-3 w-3 mr-1 border-b border-blue-400"></div>
                ) : (
                  <ArrowPathIcon className="h-3 w-3 mr-1" />
                )}
                {isRefreshingNames ? 'Refreshing...' : 'Refresh Names'}
              </button>
              <button
                onClick={() => {
                  clearFilters();
                }}
                className="text-xs sm:text-sm text-gray-400 hover:text-gray-300"
              >
                Clear All
              </button>
            </div>
          </div>

          {/* Date Range Filter */}
          <div className="mb-4">
            <label className="block text-xs sm:text-sm font-medium text-gray-300 mb-2">Date Range</label>
            <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
              {(['all', 'today', 'week', 'month'] as const).map(range => (
                <button
                  key={range}
                  onClick={() => setDateRange(range)}
                  className={`px-2 sm:px-3 py-1.5 sm:py-1 rounded-md text-xs sm:text-sm font-medium transition-colors ${
                    dateRange === range
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {range.charAt(0).toUpperCase() + range.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="bg-red-900/30 border border-red-700 text-red-300 px-3 sm:px-4 py-3 rounded-md text-xs sm:text-sm flex items-center">
          <XCircleIcon className="h-4 w-4 sm:h-5 sm:w-5 mr-2 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Activity Logs List */}
      <div className="space-y-2">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 sm:h-8 sm:w-8 border-b-2 border-green-500 mb-3"></div>
            <p className="text-sm text-gray-400">Loading your activity logs...</p>
          </div>
        ) : isProcessing ? (
          <div className="flex flex-col items-center justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 sm:h-8 sm:w-8 border-b-2 border-blue-500 mb-3"></div>
            <p className="text-sm text-gray-400">Processing activity logs...</p>
          </div>
        ) : currentLogs.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <ClockIcon className="h-8 w-8 sm:h-12 sm:w-12 mx-auto mb-3 sm:mb-4 opacity-50" />
            <p className="text-sm sm:text-base">No activity logs found for the selected filters.</p>
            <p className="text-xs mt-2">Try selecting a different date range or refresh to see your latest activities.</p>
          </div>
        ) : (
          <>
            {/* Minimal Activity Logs */}
            <div className="space-y-1">
              {currentLogs.map((log) => {
                let IconComponent = activityTypeIcons[log.activityType];
                if (!IconComponent) IconComponent = FallbackIcon;
                const isExpanded = expandedLogId === log.id;
                
                return (
                  <div
                    key={log.id}
                    className={`bg-gray-800/50 rounded-lg p-2 sm:p-3 border-l-4 transition-colors ${
                      severityColors[log.severity].split(' ')[2] // Get border color
                    }`}
                  >
                    <div 
                      className="flex items-center space-x-2 sm:space-x-3 cursor-pointer"
                      onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                    >
                      <div className={`p-1 sm:p-1.5 rounded-lg flex-shrink-0 ${severityColors[log.severity].split(' ')[1]}`}>
                        <IconComponent className="h-3 w-3 sm:h-4 sm:w-4" />
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2">
                          <span className="text-xs sm:text-sm font-medium text-white truncate">
                            {activityTypeLabels[log.activityType]}
                          </span>
                          <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${severityColors[log.severity]}`}>
                            {log.severity}
                          </span>
                        </div>
                        <p className="text-xs text-gray-400 truncate">
                          {log.description}
                        </p>
                      </div>
                      
                      <div className="text-xs text-gray-500 flex-shrink-0">
                        {formatTimestamp(log.timestamp)}
                      </div>
                      
                      <div className="text-gray-400 flex-shrink-0">
                        {isExpanded ? (
                          <ChevronUpIcon className="h-4 w-4" />
                        ) : (
                          <ChevronDownIcon className="h-4 w-4" />
                        )}
                      </div>
                    </div>
                    
                    {/* Expanded Details */}
                    {isExpanded && (
                      <div className="mt-3 pt-3 border-t border-gray-700">
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <p className="text-gray-400">Device</p>
                            <p className="text-gray-300">{log.deviceInfo?.device || 'Unknown'}</p>
                          </div>
                          <div>
                            <p className="text-gray-400">Browser</p>
                            <p className="text-gray-300">{log.deviceInfo?.browser || 'Unknown'}</p>
                          </div>
                          <div>
                            <p className="text-gray-400">OS</p>
                            <p className="text-gray-300">{log.deviceInfo?.os || 'Unknown'}</p>
                          </div>
                          <div>
                            <p className="text-gray-400">IP Address</p>
                            <p className="text-gray-300">{log.ipAddress || 'Unknown'}</p>
                          </div>
                        </div>
                        
                        {/* Details specific to the activity type */}
                        {log.details && Object.keys(log.details).length > 0 && (
                          <div className="mt-2 pt-2 border-t border-gray-700">
                            <p className="text-gray-400 text-xs mb-1">Details</p>
                            <div className="bg-gray-900/50 p-2 rounded text-xs">
                              {Object.entries(log.details).map(([key, value]) => (
                                key !== 'timestamp' && (
                                  <div key={`${log.id}-${key}`} className="grid grid-cols-3 gap-2 mb-1">
                                    <span className="text-gray-400 col-span-1">{key.replace(/_/g, ' ')}:</span>
                                    <span className="text-gray-300 col-span-2 break-words">
                                      {typeof value === 'object' 
                                        ? JSON.stringify(value) 
                                        : String(value)}
                                      {key === 'targetUserId' && typeof value === 'string' && !value.includes('Unknown User') && (
                                        <span className="ml-1 text-blue-400 text-xs">(UID resolved)</span>
                                      )}
                                    </span>
                                  </div>
                                )
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {/* Related Entity Information */}
                        {log.relatedEntityId && log.relatedEntityType && (
                          <div className="mt-2 pt-2 border-t border-gray-700">
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div>
                                <p className="text-gray-400">Related {log.relatedEntityType.replace(/_/g, ' ')}</p>
                                <p className="text-gray-300">{log.relatedEntityId}</p>
                              </div>
                            </div>
                          </div>
                        )}
                        
                        {/* Timestamp with full date and time */}
                        <div className="mt-2 pt-2 border-t border-gray-700 text-xs text-gray-400">
                          <p>Full timestamp: {log.timestamp.toLocaleString()}</p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-4 border-t border-gray-700">
                <div className="flex items-center space-x-2">
                  <button
                    onClick={goToPreviousPage}
                    disabled={currentPage === 1}
                    className="p-1 sm:p-2 text-gray-400 hover:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed rounded"
                  >
                    <ChevronLeftIcon className="h-4 w-4" />
                  </button>
                  <span className="text-xs sm:text-sm text-gray-400">
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    onClick={goToNextPage}
                    disabled={currentPage === totalPages}
                    className="p-1 sm:p-2 text-gray-400 hover:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed rounded"
                  >
                    <ChevronRightIcon className="h-4 w-4" />
                  </button>
                </div>
                
                <div className="text-xs sm:text-sm text-gray-400">
                  Showing {startIndex + 1}-{Math.min(endIndex, processedLogs.length)} of {processedLogs.length} logs
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default ActivityLogsDisplay;