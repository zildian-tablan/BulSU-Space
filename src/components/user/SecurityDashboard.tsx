import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { SecurityAuditManager, SecurityAuditLog } from '../../utils/securityAuditUtils';
import SecuritySettings from './SecuritySettings';

const SecurityDashboard: React.FC = () => {
  const { currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState<'overview' | 'logs' | 'settings' | 'reports'>('overview');
  const [metrics, setMetrics] = useState<any>(null);
  const [recentLogs, setRecentLogs] = useState<SecurityAuditLog[]>([]);
  const [unresolvedIssues, setUnresolvedIssues] = useState<SecurityAuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (currentUser) {
      loadSecurityData();
    }
  }, [currentUser]);

  const loadSecurityData = () => {
    setLoading(true);
    try {
      // Get security metrics
      const securityMetrics = SecurityAuditManager.getSecurityMetrics();
      setMetrics(securityMetrics);

      // Get recent logs for the user
      const userLogs = SecurityAuditManager.getUserAuditLogs(currentUser!.email, 20);
      setRecentLogs(userLogs);

      // Get unresolved issues
      const issues = SecurityAuditManager.getUnresolvedIssues();
      setUnresolvedIssues(issues);
    } catch (error) {
      console.error('Error loading security data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleResolveIssue = (auditId: string) => {
    SecurityAuditManager.markIssueResolved(auditId);
    loadSecurityData(); // Refresh data
  };

  const getThreatLevelColor = (level: string) => {
    switch (level) {
      case 'critical':
        return 'text-red-400 bg-red-500/20 border-red-500/50';
      case 'high':
        return 'text-orange-400 bg-orange-500/20 border-orange-500/50';
      case 'medium':
        return 'text-yellow-400 bg-yellow-500/20 border-yellow-500/50';
      default:
        return 'text-green-400 bg-green-500/20 border-green-500/50';
    }
  };

  const getEventIcon = (eventType: string) => {
    switch (eventType) {
      case 'login_success':
        return '✅';
      case 'login_failed':
        return '❌';
      case 'login_locked':
        return '🔒';
      case 'password_reset_requested':
      case 'password_reset_completed':
      case 'password_changed':
        return '🔑';
      case 'mfa_enabled':
      case 'mfa_disabled':
        return '🔐';
      case 'suspicious_activity':
      case 'brute_force_detected':
        return '⚠️';
      case 'account_creation':
        return '👤';
      case 'session_hijack_attempt':
        return '🚨';
      default:
        return '📝';
    }
  };

  const formatEventType = (eventType: string) => {
    return eventType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  const downloadReport = () => {
    const report = SecurityAuditManager.generateSecurityReport(30);
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `security-report-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="bg-gray-800 rounded-lg p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-700 rounded w-1/4"></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-gray-700 rounded-lg p-4">
                <div className="h-4 bg-gray-600 rounded w-3/4 mb-2"></div>
                <div className="h-8 bg-gray-600 rounded w-1/2"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gray-800 rounded-lg p-6">
        <h2 className="text-2xl font-bold text-white mb-4">Security Dashboard</h2>
        
        {/* Tab Navigation */}
        <div className="flex space-x-1 bg-gray-700/50 rounded-lg p-1">
          {[
            { id: 'overview', label: 'Overview', icon: '📊' },
            { id: 'logs', label: 'Activity Logs', icon: '📋' },
            { id: 'settings', label: 'Settings', icon: '⚙️' },
            { id: 'reports', label: 'Reports', icon: '📈' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center space-x-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-green-600 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-gray-600'
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && metrics && (
        <div className="space-y-6">
          {/* Security Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="bg-gray-800 rounded-lg p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">Threat Level</p>
                  <p className={`text-2xl font-bold capitalize ${getThreatLevelColor(metrics.threatLevel).split(' ')[0]}`}>
                    {metrics.threatLevel}
                  </p>
                </div>
                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${getThreatLevelColor(metrics.threatLevel)}`}>
                  🛡️
                </div>
              </div>
            </div>

            <div className="bg-gray-800 rounded-lg p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">Active Threats</p>
                  <p className="text-2xl font-bold text-white">{metrics.activeThreats}</p>
                </div>
                <div className="w-12 h-12 rounded-full bg-red-500/20 border border-red-500/50 flex items-center justify-center">
                  ⚠️
                </div>
              </div>
            </div>

            <div className="bg-gray-800 rounded-lg p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">Recent Events (24h)</p>
                  <p className="text-2xl font-bold text-white">{metrics.recentEvents}</p>
                </div>
                <div className="w-12 h-12 rounded-full bg-blue-500/20 border border-blue-500/50 flex items-center justify-center">
                  📊
                </div>
              </div>
            </div>

            <div className="bg-gray-800 rounded-lg p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">MFA Adoption</p>
                  <p className="text-2xl font-bold text-white">{metrics.mfaAdoption}%</p>
                </div>
                <div className="w-12 h-12 rounded-full bg-green-500/20 border border-green-500/50 flex items-center justify-center">
                  🔐
                </div>
              </div>
            </div>
          </div>

          {/* Unresolved Issues */}
          {unresolvedIssues.length > 0 && (
            <div className="bg-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Unresolved Security Issues</h3>
              <div className="space-y-3">
                {unresolvedIssues.slice(0, 5).map(issue => (
                  <div key={issue.id} className="bg-gray-700/50 rounded-lg p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start space-x-3">
                        <span className="text-lg">{getEventIcon(issue.eventType)}</span>
                        <div>
                          <p className="text-white font-medium">{formatEventType(issue.eventType)}</p>
                          <p className="text-gray-400 text-sm">{formatDate(issue.timestamp)}</p>
                          <div className="flex items-center space-x-2 mt-1">
                            <span className={`px-2 py-1 rounded text-xs font-medium ${getThreatLevelColor(issue.severity)}`}>
                              {issue.severity.toUpperCase()}
                            </span>
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => handleResolveIssue(issue.id)}
                        className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-sm rounded transition-colors"
                      >
                        Resolve
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Accounts at Risk */}
          {metrics.accountsAtRisk.length > 0 && (
            <div className="bg-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Accounts at Risk</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {metrics.accountsAtRisk.map((email: string, index: number) => (
                  <div key={index} className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                    <div className="flex items-center space-x-2">
                      <span className="text-red-400">👤</span>
                      <span className="text-white text-sm">{email}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Activity Logs Tab */}
      {activeTab === 'logs' && (
        <div className="bg-gray-800 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">Your Security Activity</h3>
            <button
              onClick={loadSecurityData}
              className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors text-sm"
            >
              Refresh
            </button>
          </div>
          
          {recentLogs.length === 0 ? (
            <p className="text-gray-400">No recent security activity.</p>
          ) : (
            <div className="space-y-3">
              {recentLogs.map(log => (
                <div key={log.id} className="bg-gray-700/50 rounded-lg p-4">
                  <div className="flex items-start space-x-3">
                    <span className="text-lg">{getEventIcon(log.eventType)}</span>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <p className="text-white font-medium">{formatEventType(log.eventType)}</p>
                        <span className={`px-2 py-1 rounded text-xs font-medium ${getThreatLevelColor(log.severity)}`}>
                          {log.severity.toUpperCase()}
                        </span>
                      </div>
                      <p className="text-gray-400 text-sm">{formatDate(log.timestamp)}</p>
                      {log.ipAddress && (
                        <p className="text-gray-500 text-xs">IP: {log.ipAddress}</p>
                      )}
                      {log.details && Object.keys(log.details).length > 0 && (
                        <details className="mt-2">
                          <summary className="text-gray-400 text-xs cursor-pointer">Details</summary>
                          <pre className="text-gray-500 text-xs mt-1 bg-gray-800 p-2 rounded overflow-auto">
                            {JSON.stringify(log.details, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Settings Tab */}
      {activeTab === 'settings' && (
        <SecuritySettings />
      )}

      {/* Reports Tab */}
      {activeTab === 'reports' && (
        <div className="bg-gray-800 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">Security Reports</h3>
            <button
              onClick={downloadReport}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded transition-colors flex items-center space-x-2"
            >
              <span>📥</span>
              <span>Download Report</span>
            </button>
          </div>
          
          <div className="space-y-4">
            <div className="bg-gray-700/50 rounded-lg p-4">
              <h4 className="text-white font-medium mb-2">Available Reports</h4>
              <ul className="text-gray-400 text-sm space-y-1">
                <li>• 30-day security activity summary</li>
                <li>• Threat analysis and recommendations</li>
                <li>• User activity patterns</li>
                <li>• Security event timeline</li>
                <li>• Compliance and audit trail</li>
              </ul>
            </div>
            
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
              <div className="flex items-start space-x-2">
                <span className="text-blue-400 text-lg">ℹ️</span>
                <div>
                  <p className="text-blue-400 font-medium">Export Information</p>
                  <p className="text-blue-300 text-sm mt-1">
                    Reports include security events, threat analysis, and recommendations for the past 30 days. 
                    Data is exported in JSON format for compliance and backup purposes.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SecurityDashboard;
