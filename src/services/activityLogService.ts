import { 
  collection, 
  doc, 
  addDoc, 
  getDocs, 
  query, 
  orderBy, 
  limit, 
  serverTimestamp,
  onSnapshot,
  Timestamp,
  where,
  writeBatch
} from 'firebase/firestore';
import { db, auth } from '../firebase/config';
import { getAuth } from 'firebase/auth';

// Activity types that can be tracked
export type ActivityType = 
  | 'login' 
  | 'logout' 
  | 'profile_update' 
  | 'password_change' 
  | 'mfa_enabled' 
  | 'mfa_disabled' 
  | 'post_created' 
  | 'post_edited' 
  | 'post_deleted' 
  | 'post_reported'
  | 'post_shared'
  | 'comment_added' 
  | 'comment_edited' 
  | 'comment_deleted' 
  | 'reaction_added' 
  | 'reaction_removed' 
  | 'message_sent' 
  | 'message_read' 
  | 'group_joined' 
  | 'group_left' 
  | 'group_created' 
  | 'space_joined' 
  | 'space_left' 
  | 'space_created' 
  | 'file_uploaded' 
  | 'file_downloaded' 
  | 'file_deleted' 
  | 'settings_changed' 
  | 'notification_read' 
  | 'search_performed' 
  | 'security_alert' 
  | 'account_locked' 
  | 'suspicious_activity' 
  | 'data_exported' 
  | 'data_deleted' 
  | 'recovery_email_changed' 
  | 'email_verified' 
  | 'phone_verified' 
  | 'biometric_enabled' 
  | 'biometric_disabled'
  | 'friend_request_sent'
  | 'friend_request_accepted'
  | 'friend_request_declined'
  | 'friend_request_cancelled'
  | 'friend_removed'
  | 'user_access_revoked'
  | 'user_access_restored'
  | 'user_access_restricted'
  | 'announcement_created'
  | 'batch_accounts_created'
  | 'admin_account_created'
  | 'dean_account_created'
  | 'alumni_invites_sent'
  | 'alumni_request_approved'
  | 'alumni_request_rejected'
  | 'academic_event_created'
  | 'academic_event_deleted'
  | 'event_deleted'
  | 'job_post_deleted'
  | 'annual_archive';

// Activity severity levels
export type ActivitySeverity = 'low' | 'medium' | 'high' | 'critical';

// Activity log entry interface
export interface ActivityLogEntry {
  id: string;
  userId: string;
  userEmail: string;
  activityType: ActivityType;
  severity: ActivitySeverity;
  description: string;
  details: Record<string, any>;
  timestamp: Date;
  ipAddress?: string;
  userAgent?: string;
  deviceInfo?: {
    device: string;
    browser: string;
    os: string;
    platform: string;
  };
  location?: string;
  sessionId?: string;
  relatedEntityId?: string; // ID of related post, message, group, etc.
  relatedEntityType?: string; // Type of related entity
}

// Firestore version for storing
interface ActivityLogFirestore {
  userId: string;
  userEmail: string;
  activityType: ActivityType;
  severity: ActivitySeverity;
  description: string;
  details: Record<string, any>;
  timestamp: Timestamp;
  ipAddress?: string;
  userAgent?: string;
  deviceInfo?: {
    device: string;
    browser: string;
    os: string;
    platform: string;
  };
  location?: string;
  sessionId?: string;
  relatedEntityId?: string;
  relatedEntityType?: string;
}

// Activity logger class
export class ActivityLogger {
  private static instance: ActivityLogger;
  private currentSessionId: string;
  private deviceInfo: any;

  private constructor() {
    this.currentSessionId = this.generateSessionId();
    this.deviceInfo = this.getDeviceInfo();
  }

  public static getInstance(): ActivityLogger {
    if (!ActivityLogger.instance) {
      ActivityLogger.instance = new ActivityLogger();
    }
    return ActivityLogger.instance;
  }

  /**
   * Log an activity event
   */
  public async logActivity(
    activityType: ActivityType,
    description: string,
    details: Record<string, any> = {},
    severity: ActivitySeverity = 'low',
    relatedEntityId?: string,
    relatedEntityType?: string
  ): Promise<string | null> {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        console.warn('[ActivityLogger] No authenticated user found, skipping activity log');
        return null;
      }

      // Sanitize details to remove any undefined values (Firestore rejects undefined)
      const sanitizedDetails = this.sanitizeForFirestore(details) || {};

      const activityData: Omit<ActivityLogFirestore, 'id'> = {
        userId: currentUser.uid,
        userEmail: currentUser.email || '',
        activityType,
        severity,
        description,
        details: sanitizedDetails,
        timestamp: serverTimestamp() as Timestamp,
        ipAddress: await this.getIPAddress(),
        userAgent: navigator.userAgent,
        deviceInfo: this.deviceInfo,
        location: 'Unknown', // Would need geolocation service
        sessionId: this.currentSessionId,
      };
      
      // Only add relatedEntityId and relatedEntityType if they are defined and not null
      if (relatedEntityId) {
        activityData.relatedEntityId = relatedEntityId;
      }
      
      if (relatedEntityType) {
        activityData.relatedEntityType = relatedEntityType;
      }

      // Add to user's activity_logs subcollection
      const activityLogsRef = collection(db, 'users', currentUser.uid, 'activity_logs');
      const docRef = await addDoc(activityLogsRef, activityData);

      // Note: Global activity logs are only written by admins for admin monitoring
      // Regular users only have their activities logged to their personal collection
      // This prevents permission errors for non-admin users

      console.log(`[ActivityLogger] Activity logged: ${activityType} - ${description}`);
      return docRef.id;
    } catch (error) {
      // Get current user for enhanced error logging
      const currentUser = auth.currentUser;
      
      // Provide more detailed error messages for specific error cases
      if (error instanceof Error) {
        if (error.message.includes('invalid data') || error.message.includes('undefined')) {
          console.error('[ActivityLogger] Error logging activity - Invalid data:', error.message);
          console.error('[ActivityLogger] Activity details:', { 
            activityType, 
            description, 
            relatedEntityId: relatedEntityId ? relatedEntityId : '(none)', 
            relatedEntityType: relatedEntityType ? relatedEntityType : '(none)',
            timestamp: new Date().toISOString(),
            user: currentUser ? `${currentUser.uid} (${currentUser.email || 'no email'})` : 'no user'
          });
        } else {
          console.error('[ActivityLogger] Error logging activity:', error);
        }
      } else {
        console.error('[ActivityLogger] Error logging activity:', error);
      }
      return null;
    }
  }

  /**
   * Recursively remove undefined fields from an object/array/value so Firestore doesn't reject it.
   */
  private sanitizeForFirestore(value: any): any {
    if (value === undefined) return undefined;
    if (value === null) return null;
    if (Array.isArray(value)) {
      return value
        .map((v) => this.sanitizeForFirestore(v))
        .filter((v) => v !== undefined);
    }
    if (typeof value === 'object') {
      const out: Record<string, any> = {};
      Object.entries(value).forEach(([k, v]) => {
        const sv = this.sanitizeForFirestore(v);
        if (sv !== undefined) out[k] = sv;
      });
      return out;
    }
    return value;
  }

  /**
   * Get user's activity logs
   */
  public async getUserActivityLogs(
    userId: string,
    limitCount: number = 50,
    activityTypes?: ActivityType[]
  ): Promise<ActivityLogEntry[]> {
    try {
      let activityQuery = query(
        collection(db, 'users', userId, 'activity_logs'),
        orderBy('timestamp', 'desc'),
        limit(limitCount)
      );

      // Filter by activity types if specified
      if (activityTypes && activityTypes.length > 0) {
        activityQuery = query(
          collection(db, 'users', userId, 'activity_logs'),
          where('activityType', 'in', activityTypes),
          orderBy('timestamp', 'desc'),
          limit(limitCount)
        );
      }

      const snapshot = await getDocs(activityQuery);
      const activityLogs: ActivityLogEntry[] = [];

      snapshot.forEach((doc) => {
        const data = doc.data() as ActivityLogFirestore;
        activityLogs.push({
          id: doc.id,
          userId: data.userId,
          userEmail: data.userEmail,
          activityType: data.activityType,
          severity: data.severity,
          description: data.description,
          details: data.details,
          timestamp: data.timestamp?.toDate() || new Date(),
          ipAddress: data.ipAddress,
          userAgent: data.userAgent,
          deviceInfo: data.deviceInfo,
          location: data.location,
          sessionId: data.sessionId,
          relatedEntityId: data.relatedEntityId,
          relatedEntityType: data.relatedEntityType
        });
      });

      return activityLogs;
    } catch (error) {
      console.error('[ActivityLogger] Error fetching user activity logs:', error);
      throw error;
    }
  }

  /**
   * Get activity logs for admins (all users)
   */
  public async getGlobalActivityLogs(
    limitCount: number = 100,
    activityTypes?: ActivityType[],
    severityLevels?: ActivitySeverity[]
  ): Promise<ActivityLogEntry[]> {
    try {
      let globalQuery = query(
        collection(db, 'activity_logs'),
        orderBy('timestamp', 'desc'),
        limit(limitCount)
      );

      // Apply filters if specified
      if (activityTypes && activityTypes.length > 0) {
        globalQuery = query(
          collection(db, 'activity_logs'),
          where('activityType', 'in', activityTypes),
          orderBy('timestamp', 'desc'),
          limit(limitCount)
        );
      }

      const snapshot = await getDocs(globalQuery);
      const activityLogs: ActivityLogEntry[] = [];

      snapshot.forEach((doc) => {
        const data = doc.data() as ActivityLogFirestore & { userRole?: string };
        activityLogs.push({
          id: doc.id,
          userId: data.userId,
          userEmail: data.userEmail,
          activityType: data.activityType,
          severity: data.severity,
          description: data.description,
          details: data.details,
          timestamp: data.timestamp?.toDate() || new Date(),
          ipAddress: data.ipAddress,
          userAgent: data.userAgent,
          deviceInfo: data.deviceInfo,
          location: data.location,
          sessionId: data.sessionId,
          relatedEntityId: data.relatedEntityId,
          relatedEntityType: data.relatedEntityType
        });
      });

      // Filter by severity if specified
      if (severityLevels && severityLevels.length > 0) {
        return activityLogs.filter(log => severityLevels.includes(log.severity));
      }

      return activityLogs;
    } catch (error) {
      console.error('[ActivityLogger] Error fetching global activity logs:', error);
      throw error;
    }
  }

  /**
   * Get activity statistics for a user
   */
  public async getUserActivityStats(userId: string): Promise<{
    totalActivities: number;
    activitiesByType: Record<ActivityType, number>;
    activitiesBySeverity: Record<ActivitySeverity, number>;
    recentActivityCount: number;
    lastActivityDate?: Date;
  }> {
    try {
      const activityLogs = await this.getUserActivityLogs(userId, 1000);
      
      const activitiesByType: Record<ActivityType, number> = {} as Record<ActivityType, number>;
      const activitiesBySeverity: Record<ActivitySeverity, number> = {} as Record<ActivitySeverity, number>;
      
      let recentActivityCount = 0;
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

      activityLogs.forEach(log => {
        // Count by type
        activitiesByType[log.activityType] = (activitiesByType[log.activityType] || 0) + 1;
        
        // Count by severity
        activitiesBySeverity[log.severity] = (activitiesBySeverity[log.severity] || 0) + 1;
        
        // Count recent activities
        if (log.timestamp > oneWeekAgo) {
          recentActivityCount++;
        }
      });

      return {
        totalActivities: activityLogs.length,
        activitiesByType,
        activitiesBySeverity,
        recentActivityCount,
        lastActivityDate: activityLogs.length > 0 ? activityLogs[0].timestamp : undefined
      };
    } catch (error) {
      console.error('[ActivityLogger] Error getting user activity stats:', error);
      throw error;
    }
  }

  /**
   * Delete old activity logs (cleanup function)
   */
  public async cleanupOldActivityLogs(userId: string, daysToKeep: number = 90): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      const activityLogs = await this.getUserActivityLogs(userId, 10000);
      const logsToDelete = activityLogs.filter(log => log.timestamp < cutoffDate);

      if (logsToDelete.length === 0) {
        return 0;
      }

      const batch = writeBatch(db);
      logsToDelete.forEach(log => {
        const logRef = doc(db, 'users', userId, 'activity_logs', log.id);
        batch.delete(logRef);
      });

      await batch.commit();
      console.log(`[ActivityLogger] Deleted ${logsToDelete.length} old activity logs for user ${userId}`);
      return logsToDelete.length;
    } catch (error) {
      console.error('[ActivityLogger] Error cleaning up old activity logs:', error);
      throw error;
    }
  }

  /**
   * Generate a unique session ID
   */
  private generateSessionId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  }

  /**
   * Get device information
   */
  private getDeviceInfo(): any {
    const userAgent = navigator.userAgent;
    
    // Simple device detection
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
    const isTablet = /iPad|Android(?=.*\bMobile\b)(?=.*\bSafari\b)/i.test(userAgent);
    
    let device = 'Desktop';
    if (isTablet) device = 'Tablet';
    else if (isMobile) device = 'Mobile';

    // Browser detection
    let browser = 'Unknown';
    if (userAgent.includes('Chrome')) browser = 'Chrome';
    else if (userAgent.includes('Firefox')) browser = 'Firefox';
    else if (userAgent.includes('Safari')) browser = 'Safari';
    else if (userAgent.includes('Edge')) browser = 'Edge';

    // OS detection
    let os = 'Unknown';
    if (userAgent.includes('Windows')) os = 'Windows';
    else if (userAgent.includes('Mac')) os = 'macOS';
    else if (userAgent.includes('Linux')) os = 'Linux';
    else if (userAgent.includes('Android')) os = 'Android';
    else if (userAgent.includes('iOS')) os = 'iOS';

    return {
      device,
      browser,
      os,
      platform: navigator.platform
    };
  }

  /**
   * Get IP address (client-side approximation)
   */
  private async getIPAddress(): Promise<string> {
    try {
      const response = await fetch('https://api.ipify.org?format=json', {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(3000)
      });
      
      if (response.ok) {
        const data = await response.json();
        return data.ip || 'Unknown';
      }
    } catch (error) {
      console.warn('[ActivityLogger] Could not fetch IP address:', error);
    }
    
    return 'Unknown';
  }

  /**
   * Get user role from Firestore
   */
  private async getUserRole(userId: string): Promise<{ role: string } | null> {
    try {
      const userDoc = await getDocs(query(collection(db, 'users'), where('__name__', '==', userId)));
      if (!userDoc.empty) {
        return userDoc.docs[0].data() as { role: string };
      }
    } catch (error) {
      console.error('[ActivityLogger] Error getting user role:', error);
    }
    return null;
  }
}

// Convenience functions for common activities
export const logUserLogin = async (method: string = 'password') => {
  const logger = ActivityLogger.getInstance();
  return logger.logActivity(
    'login',
    'User logged in successfully',
    { method, timestamp: new Date().toISOString() },
    'low'
  );
};

export const logUserLogout = async () => {
  const logger = ActivityLogger.getInstance();
  return logger.logActivity(
    'logout',
    'User logged out',
    { timestamp: new Date().toISOString() },
    'low'
  );
};

export const logProfileUpdate = async (updatedFields: string[]) => {
  const logger = ActivityLogger.getInstance();
  return logger.logActivity(
    'profile_update',
    'Profile information updated',
    { updatedFields, timestamp: new Date().toISOString() },
    'low'
  );
};

export const logPasswordChange = async () => {
  const logger = ActivityLogger.getInstance();
  return logger.logActivity(
    'password_change',
    'Password changed successfully',
    { timestamp: new Date().toISOString() },
    'medium'
  );
};

export const logMFASetup = async (method: 'email' | 'sms' | 'biometric', enabled: boolean) => {
  const logger = ActivityLogger.getInstance();
  return logger.logActivity(
    enabled ? 'mfa_enabled' : 'mfa_disabled',
    `Multi-factor authentication ${enabled ? 'enabled' : 'disabled'}`,
    { method, timestamp: new Date().toISOString() },
    'medium'
  );
};

export const logSecurityAlert = async (alertType: string, details: any) => {
  const logger = ActivityLogger.getInstance();
  return logger.logActivity(
    'security_alert',
    `Security alert: ${alertType}`,
    { alertType, details, timestamp: new Date().toISOString() },
    'high'
  );
};

export const logSettingsChange = async (settingName: string, oldValue: any, newValue: any) => {
  const logger = ActivityLogger.getInstance();
  return logger.logActivity(
    'settings_changed',
    `Setting changed: ${settingName}`,
    { settingName, oldValue, newValue, timestamp: new Date().toISOString() },
    'low'
  );
};

// Export the singleton instance
export const activityLogger = ActivityLogger.getInstance(); 