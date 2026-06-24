import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { SecurityManager } from '../../utils/securityUtils';
import { SecurityAuditManager } from '../../utils/securityAuditUtils';

const SecuritySettings: React.FC = () => {
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [securityLogs, setSecurityLogs] = useState<any[]>([]);
  const [accountLockout, setAccountLockout] = useState<any>(null);

  useEffect(() => {
    if (currentUser) {
      loadSecuritySettings();
    }
  }, [currentUser]);
  const loadSecuritySettings = async () => {
    if (!currentUser) return;
    
    setLoading(true);    try {
      // Load recent security logs (using SecurityAuditManager instead)
      const logs = SecurityAuditManager.getUserAuditLogs(currentUser.email, 10);
      setSecurityLogs(logs);
      
      // Check account lockout status
      const lockout = await SecurityManager.isAccountLocked(currentUser.email);
      setAccountLockout(lockout);
    } catch (error) {
      console.error('Error loading security settings:', error);
    } finally {
      setLoading(false);
    }  };

  const clearSecurityLogs = () => {
    if (currentUser) {
      SecurityManager.clearSecurityData();
      setSecurityLogs([]);
      setAccountLockout(null);
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };
  const getEventIcon = (eventType: string) => {
    switch (eventType) {
      case 'LOGIN_SUCCESS':
        return '✅';
      case 'LOGIN_FAILED':
        return '❌';
      case 'SUSPICIOUS_ACTIVITY':
        return '⚠️';
      default:
        return '📝';
    }
  };
  const getEventDescription = (log: any) => {
    switch (log.eventType) {
      case 'LOGIN_SUCCESS':
        return 'Successful login';
      case 'LOGIN_FAILED':
        return `Login failed: ${log.details.reason || 'Invalid credentials'}`;
      case 'SUSPICIOUS_ACTIVITY':
        return `Suspicious activity detected: ${log.details.reason}`;
      default:
        return log.eventType.replace(/_/g, ' ').toLowerCase();
    }
  };

  if (loading) {
    return (
      <div className="bg-gray-800 rounded-lg p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-700 rounded w-1/4 mb-4"></div>
          <div className="space-y-3">
            <div className="h-4 bg-gray-700 rounded w-3/4"></div>
            <div className="h-4 bg-gray-700 rounded w-1/2"></div>
            <div className="h-4 bg-gray-700 rounded w-2/3"></div>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-6">
      {/* Account Security Status */}
      <div className="bg-gray-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Account Security Status</h3>
        
        {accountLockout ? (
          <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4 mb-4">
            <div className="flex items-center space-x-2 mb-2">
              <svg className="h-5 w-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <span className="text-red-400 font-medium">Account Temporarily Locked</span>
            </div>
            <p className="text-red-300 text-sm">
              Locked until: {formatDate(accountLockout.lockedUntil)}
            </p>
            <p className="text-red-300 text-sm mt-1">
              Reason: {accountLockout.attempts} failed login attempts
            </p>
          </div>
        ) : (
          <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 mb-4">
            <div className="flex items-center space-x-2">
              <svg className="h-5 w-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-green-400 font-medium">Account Active</span>
            </div>
          </div>
        )}
      </div>

      {/* Security Activity Log */}
      <div className="bg-gray-800 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">Recent Security Activity</h3>
          {securityLogs.length > 0 && (
            <button
              onClick={clearSecurityLogs}
              className="px-3 py-1 text-sm bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors duration-200"
            >
              Clear Logs
            </button>
          )}
        </div>
        
        {securityLogs.length === 0 ? (
          <p className="text-gray-400">No recent security activity.</p>
        ) : (
          <div className="space-y-3">
            {securityLogs.map((log, index) => (
              <div key={index} className="flex items-start space-x-3 p-3 bg-gray-700/50 rounded-lg">
                <span className="text-lg">{getEventIcon(log.eventType)}</span>
                <div className="flex-1">
                  <p className="text-white">{getEventDescription(log)}</p>
                  <p className="text-gray-400 text-sm">{formatDate(log.timestamp)}</p>
                  {log.details.ipAddress && (
                    <p className="text-gray-500 text-xs">IP: {log.details.ipAddress}</p>
                  )}
                </div>
              </div>
            ))}
          </div>        )}
      </div>
    </div>
  );
};

export default SecuritySettings;
