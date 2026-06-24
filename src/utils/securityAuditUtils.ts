import { SecurityLogger } from './securityUtils';

export interface SecurityAuditLog {
  id: string;
  timestamp: number;
  eventType: SecurityEventType;
  userId?: string;
  userEmail?: string;
  ipAddress?: string;
  userAgent?: string;
  details: any;
  severity: 'low' | 'medium' | 'high' | 'critical';
  resolved: boolean;
}

export type SecurityEventType = 
  | 'login_success'
  | 'login_failed'
  | 'login_locked'
  | 'password_reset_requested'
  | 'password_reset_completed'
  | 'password_changed'
  | 'mfa_enabled'
  | 'mfa_disabled'
  | 'mfa_backup_code_used'
  | 'suspicious_activity'
  | 'account_creation'
  | 'account_deletion'
  | 'permission_change'
  | 'data_export'
  | 'security_settings_changed'
  | 'session_hijack_attempt'
  | 'brute_force_detected'
  | 'unusual_location'
  | 'device_change';

/**
 * Advanced security audit and monitoring system
 */
export class SecurityAuditManager {
  private static readonly AUDIT_LOG_KEY = 'security_audit_logs';
  private static readonly MAX_LOGS = 1000;
  private static readonly RETENTION_PERIOD = 30 * 24 * 60 * 60 * 1000; // 30 days

  /**
   * Generate unique audit ID
   */
  private static generateAuditId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  /**
   * Get user's IP address (simplified for client-side)
   */
  private static async getUserIP(): Promise<string> {
    try {
      // In production, you might want to use a proper IP detection service
      return 'client-detected';
    } catch {
      return 'unknown';
    }
  }

  /**
   * Get user agent information
   */
  private static getUserAgent(): string {
    return navigator.userAgent || 'unknown';
  }

  /**
   * Determine event severity
   */
  private static getEventSeverity(eventType: SecurityEventType): 'low' | 'medium' | 'high' | 'critical' {
    const severityMap: Record<SecurityEventType, 'low' | 'medium' | 'high' | 'critical'> = {
      'login_success': 'low',
      'login_failed': 'medium',
      'login_locked': 'high',
      'password_reset_requested': 'medium',
      'password_reset_completed': 'medium',
      'password_changed': 'medium',
      'mfa_enabled': 'low',
      'mfa_disabled': 'high',
      'mfa_backup_code_used': 'medium',
      'suspicious_activity': 'high',
      'account_creation': 'low',
      'account_deletion': 'critical',
      'permission_change': 'high',
      'data_export': 'medium',
      'security_settings_changed': 'medium',
      'session_hijack_attempt': 'critical',
      'brute_force_detected': 'critical',
      'unusual_location': 'high',
      'device_change': 'medium'
    };

    return severityMap[eventType] || 'medium';
  }

  /**
   * Log security audit event
   */
  static async logAuditEvent(
    eventType: SecurityEventType,
    details: any = {},
    userId?: string,
    userEmail?: string
  ): Promise<void> {
    try {
      const auditLog: SecurityAuditLog = {
        id: this.generateAuditId(),
        timestamp: Date.now(),
        eventType,
        userId,
        userEmail,
        ipAddress: await this.getUserIP(),
        userAgent: this.getUserAgent(),
        details,
        severity: this.getEventSeverity(eventType),
        resolved: false
      };

      // Also log to SecurityLogger for backward compatibility
      SecurityLogger.logSecurityEvent(eventType, {
        ...details,
        auditId: auditLog.id,
        severity: auditLog.severity
      });

      // Store audit log
      const existingLogs = this.getAuditLogs();
      existingLogs.push(auditLog);

      // Maintain log size limit
      if (existingLogs.length > this.MAX_LOGS) {
        existingLogs.splice(0, existingLogs.length - this.MAX_LOGS);
      }

      localStorage.setItem(this.AUDIT_LOG_KEY, JSON.stringify(existingLogs));

      // Check for security patterns that require immediate attention
      this.analyzeSecurityPatterns(auditLog);

    } catch (error) {
      console.error('Failed to log audit event:', error);
    }
  }

  /**
   * Get all audit logs
   */
  static getAuditLogs(): SecurityAuditLog[] {
    try {
      const logs = localStorage.getItem(this.AUDIT_LOG_KEY);
      if (!logs) return [];

      const parsedLogs: SecurityAuditLog[] = JSON.parse(logs);
      
      // Filter out expired logs
      const cutoffTime = Date.now() - this.RETENTION_PERIOD;
      return parsedLogs.filter(log => log.timestamp > cutoffTime);
    } catch {
      return [];
    }
  }

  /**
   * Get audit logs by user
   */
  static getUserAuditLogs(userEmail: string, limit: number = 50): SecurityAuditLog[] {
    const allLogs = this.getAuditLogs();
    return allLogs
      .filter(log => log.userEmail === userEmail.toLowerCase())
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  /**
   * Get audit logs by severity
   */
  static getLogsBySeverity(severity: 'low' | 'medium' | 'high' | 'critical'): SecurityAuditLog[] {
    const allLogs = this.getAuditLogs();
    return allLogs
      .filter(log => log.severity === severity)
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Get unresolved security issues
   */
  static getUnresolvedIssues(): SecurityAuditLog[] {
    const allLogs = this.getAuditLogs();
    return allLogs
      .filter(log => !log.resolved && (log.severity === 'high' || log.severity === 'critical'))
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Mark security issue as resolved
   */
  static markIssueResolved(auditId: string): void {
    try {
      const logs = this.getAuditLogs();
      const logIndex = logs.findIndex(log => log.id === auditId);
      
      if (logIndex !== -1) {
        logs[logIndex].resolved = true;
        localStorage.setItem(this.AUDIT_LOG_KEY, JSON.stringify(logs));
      }
    } catch (error) {
      console.error('Failed to mark issue as resolved:', error);
    }
  }

  /**
   * Analyze security patterns for immediate threats
   */
  private static analyzeSecurityPatterns(newLog: SecurityAuditLog): void {
    const recentLogs = this.getAuditLogs().filter(
      log => Date.now() - log.timestamp < 5 * 60 * 1000 // Last 5 minutes
    );

    // Pattern: Multiple failed login attempts
    if (newLog.eventType === 'login_failed') {
      const failedAttempts = recentLogs.filter(
        log => log.eventType === 'login_failed' && 
               log.userEmail === newLog.userEmail
      ).length;

      if (failedAttempts >= 3) {
        this.logAuditEvent('brute_force_detected', {
          attempts: failedAttempts,
          timeWindow: '5 minutes',
          targetEmail: newLog.userEmail
        });
      }
    }

    // Pattern: MFA disabled after failed login attempts
    if (newLog.eventType === 'mfa_disabled') {
      const recentFailures = recentLogs.filter(
        log => log.eventType === 'login_failed' && 
               log.userEmail === newLog.userEmail
      );

      if (recentFailures.length > 0) {
        this.logAuditEvent('suspicious_activity', {
          pattern: 'mfa_disabled_after_failed_logins',
          failedAttempts: recentFailures.length,
          concern: 'Account may be compromised'
        });
      }
    }

    // Pattern: Rapid password changes
    if (newLog.eventType === 'password_changed') {
      const recentPasswordChanges = recentLogs.filter(
        log => log.eventType === 'password_changed' && 
               log.userEmail === newLog.userEmail
      ).length;

      if (recentPasswordChanges >= 3) {
        this.logAuditEvent('suspicious_activity', {
          pattern: 'rapid_password_changes',
          changes: recentPasswordChanges,
          timeWindow: '5 minutes'
        });
      }
    }
  }

  /**
   * Generate security report
   */
  static generateSecurityReport(days: number = 7): {
    summary: any;
    events: SecurityAuditLog[];
    recommendations: string[];
  } {
    const cutoffTime = Date.now() - (days * 24 * 60 * 60 * 1000);
    const logs = this.getAuditLogs().filter(log => log.timestamp > cutoffTime);

    // Event summary
    const eventCounts: Record<string, number> = {};
    const severityCounts = { low: 0, medium: 0, high: 0, critical: 0 };
    const userActivity: Record<string, number> = {};

    logs.forEach(log => {
      eventCounts[log.eventType] = (eventCounts[log.eventType] || 0) + 1;
      severityCounts[log.severity]++;
      if (log.userEmail) {
        userActivity[log.userEmail] = (userActivity[log.userEmail] || 0) + 1;
      }
    });

    // Generate recommendations
    const recommendations: string[] = [];

    if (severityCounts.critical > 0) {
      recommendations.push('⚠️ Critical security events detected - immediate review required');
    }

    if (severityCounts.high > 10) {
      recommendations.push('🔴 High number of high-severity events - consider security audit');
    }

    if (eventCounts.login_failed > 50) {
      recommendations.push('🛡️ Many failed login attempts - consider implementing stricter rate limiting');
    }

    if (eventCounts.mfa_disabled > 5) {
      recommendations.push('🔐 Multiple MFA disablements - enforce MFA policy for sensitive accounts');
    }

    const topUser = Object.entries(userActivity).sort(([,a], [,b]) => b - a)[0];
    if (topUser && topUser[1] > 20) {
      recommendations.push(`👤 User ${topUser[0]} has high activity (${topUser[1]} events) - review if suspicious`);
    }

    if (recommendations.length === 0) {
      recommendations.push('✅ No significant security concerns detected in this period');
    }

    return {
      summary: {
        totalEvents: logs.length,
        eventTypes: eventCounts,
        severityDistribution: severityCounts,
        topUsers: Object.entries(userActivity)
          .sort(([,a], [,b]) => b - a)
          .slice(0, 5),
        timeRange: `${days} days`
      },
      events: logs.sort((a, b) => b.timestamp - a.timestamp),
      recommendations
    };
  }

  /**
   * Export audit logs (for compliance/backup)
   */
  static exportAuditLogs(): string {
    const logs = this.getAuditLogs();
    return JSON.stringify({
      exportDate: new Date().toISOString(),
      logsCount: logs.length,
      logs
    }, null, 2);
  }

  /**
   * Clear old audit logs (maintenance)
   */
  static clearOldLogs(): void {
    const cutoffTime = Date.now() - this.RETENTION_PERIOD;
    const logs = this.getAuditLogs();
    const recentLogs = logs.filter(log => log.timestamp > cutoffTime);
    
    localStorage.setItem(this.AUDIT_LOG_KEY, JSON.stringify(recentLogs));
  }

  /**
   * Get security metrics for dashboard
   */
  static getSecurityMetrics(): {
    threatLevel: 'low' | 'medium' | 'high' | 'critical';
    activeThreats: number;
    recentEvents: number;
    mfaAdoption: number;
    accountsAtRisk: string[];
  } {
    const recentLogs = this.getAuditLogs().filter(
      log => Date.now() - log.timestamp < 24 * 60 * 60 * 1000 // Last 24 hours
    );

    const unresolvedIssues = this.getUnresolvedIssues();
    const criticalIssues = unresolvedIssues.filter(log => log.severity === 'critical').length;
    const highIssues = unresolvedIssues.filter(log => log.severity === 'high').length;

    // Determine threat level
    let threatLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';
    if (criticalIssues > 0) threatLevel = 'critical';
    else if (highIssues > 3) threatLevel = 'high';
    else if (highIssues > 0 || unresolvedIssues.length > 5) threatLevel = 'medium';

    // Find accounts at risk
    const accountsAtRisk = new Set<string>();
    unresolvedIssues.forEach(log => {
      if (log.userEmail && (log.severity === 'high' || log.severity === 'critical')) {
        accountsAtRisk.add(log.userEmail);
      }
    });

    // Calculate MFA adoption (simplified)
    const mfaEvents = recentLogs.filter(log => 
      log.eventType === 'mfa_enabled' || log.eventType === 'mfa_disabled'
    );
    const mfaEnabled = mfaEvents.filter(log => log.eventType === 'mfa_enabled').length;
    const mfaDisabled = mfaEvents.filter(log => log.eventType === 'mfa_disabled').length;
    const mfaAdoption = Math.max(0, (mfaEnabled - mfaDisabled) / Math.max(1, mfaEvents.length)) * 100;

    return {
      threatLevel,
      activeThreats: unresolvedIssues.length,
      recentEvents: recentLogs.length,
      mfaAdoption: Math.round(mfaAdoption),
      accountsAtRisk: Array.from(accountsAtRisk)
    };
  }
}

export default SecurityAuditManager;
