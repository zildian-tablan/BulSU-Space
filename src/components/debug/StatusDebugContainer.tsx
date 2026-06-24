import React, { useEffect, useState, useCallback, useRef } from 'react';
import { ref, onValue, update, serverTimestamp } from 'firebase/database';
import { rtdb } from '../../firebase/config';
import { useAuth } from '../../contexts/AuthContext';

interface UserStatusData {
  state: string;
  lastActive: number;
  lastSeen: number;
  connections?: Record<string, any>;
  presenceServiceInitialized?: boolean;
  clientVersion?: string;
  initializedAt?: string;
  [key: string]: any;
}

const StatusDebugContainer: React.FC = () => {
  const { currentUser } = useAuth();
  const [statusData, setStatusData] = useState<UserStatusData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [realTimeStatus, setRealTimeStatus] = useState<'online' | 'away' | 'offline'>('offline');
  const lastActivityRef = useRef<number>(Date.now());
  const activityTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Constants for activity timeouts
  const AWAY_TIMEOUT = 60 * 1000; // 1 minute of inactivity = away
  const OFFLINE_TIMEOUT = 5 * 60 * 1000; // 5 minutes of inactivity = offline

  // Function to update user activity
  const updateActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    
    // If current status is not online, update it
    if (realTimeStatus !== 'online') {
      setRealTimeStatus('online');
      
      // Update the database if we have a user
      if (currentUser?.id && statusData) {
        const statusRef = ref(rtdb, `status/${currentUser.id}`);
        update(statusRef, {
          state: 'online',
          lastActive: Date.now(),
          lastSeen: serverTimestamp(),
          realTimeUpdate: Date.now()
        }).catch(err => console.error("Error updating online status:", err));
      }
    }
    
    // Clear any existing timeout
    if (activityTimeoutRef.current) {
      clearTimeout(activityTimeoutRef.current);
    }
    
    // Set a new timeout to check for inactivity
    activityTimeoutRef.current = setTimeout(() => {
      checkInactivity();
    }, AWAY_TIMEOUT);
  }, [currentUser, realTimeStatus, statusData]);
  
  // Function to check user inactivity
  const checkInactivity = useCallback(() => {
    const now = Date.now();
    const inactiveTime = now - lastActivityRef.current;
    
    if (inactiveTime >= OFFLINE_TIMEOUT) {
      // User is offline
      setRealTimeStatus('offline');
      
      // Update the database
      if (currentUser?.id && statusData) {
        const statusRef = ref(rtdb, `status/${currentUser.id}`);
        update(statusRef, {
          state: 'offline',
          lastActive: lastActivityRef.current,
          lastSeen: serverTimestamp()
        }).catch(err => console.error("Error updating offline status:", err));
      }
    } else if (inactiveTime >= AWAY_TIMEOUT) {
      // User is away
      setRealTimeStatus('away');
      
      // Update the database
      if (currentUser?.id && statusData) {
        const statusRef = ref(rtdb, `status/${currentUser.id}`);
        update(statusRef, {
          state: 'away',
          lastActive: lastActivityRef.current,
          lastSeen: serverTimestamp()
        }).catch(err => console.error("Error updating away status:", err));
      }
      
      // Set another timeout to check for offline status
      activityTimeoutRef.current = setTimeout(() => {
        checkInactivity();
      }, OFFLINE_TIMEOUT - AWAY_TIMEOUT);
    }
  }, [currentUser, statusData]);

  // Set up activity listeners
  useEffect(() => {
    if (!currentUser?.id) return;
    
    // Set up document-level event listeners to track user activity
    const handleActivity = () => updateActivity();
    
    document.addEventListener('mousemove', handleActivity);
    document.addEventListener('keypress', handleActivity);
    document.addEventListener('click', handleActivity);
    document.addEventListener('touchstart', handleActivity);
    document.addEventListener('scroll', handleActivity);
    
    // Handle tab visibility changes
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        updateActivity();
      } else {
        // If tab is hidden, consider user away
        setRealTimeStatus('away');
        if (currentUser?.id && statusData) {
          const statusRef = ref(rtdb, `status/${currentUser.id}`);
          update(statusRef, {
            state: 'away',
            lastActive: lastActivityRef.current,
            lastSeen: serverTimestamp()
          }).catch(err => console.error("Error updating away status:", err));
        }
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Initialize activity tracker
    updateActivity();
    
    // Clean up event listeners
    return () => {
      document.removeEventListener('mousemove', handleActivity);
      document.removeEventListener('keypress', handleActivity);
      document.removeEventListener('click', handleActivity);
      document.removeEventListener('touchstart', handleActivity);
      document.removeEventListener('scroll', handleActivity);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      
      if (activityTimeoutRef.current) {
        clearTimeout(activityTimeoutRef.current);
      }
    };
  }, [currentUser, statusData, updateActivity]);

  // Listen for changes to the user's status in RTDB
  useEffect(() => {
    if (!currentUser?.id) {
      setError("No authenticated user");
      return;
    }

    // Get a reference to the user's status node
    const statusRef = ref(rtdb, `status/${currentUser.id}`);
    
    // Listen for changes to the user's status
    const unsubscribe = onValue(statusRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val() as UserStatusData;
        setStatusData(data);
        
        // Update real-time status based on database state
        if (data.state === 'online' || data.state === 'away' || data.state === 'offline') {
          setRealTimeStatus(data.state);
        }
        
        setError(null);
      } else {
        setStatusData(null);
        setError("Status data not found");
      }
    }, (err) => {
      console.error("Error fetching status:", err);
      setError(`Error fetching status: ${err.message}`);
    });

    // Cleanup the listener on unmount
    return () => unsubscribe();
  }, [currentUser]);

  // Handle manual status change
  const setStatus = (status: 'online' | 'away' | 'offline') => {
    if (!currentUser?.id) return;
    
    const statusRef = ref(rtdb, `status/${currentUser.id}`);
    setRealTimeStatus(status);
    
    update(statusRef, {
      state: status,
      lastActive: status === 'online' ? Date.now() : lastActivityRef.current,
      lastSeen: serverTimestamp(),
      manualChange: true
    }).catch(err => console.error(`Error updating to ${status} status:`, err));
  };

  if (!currentUser) {
    return null;
  }

  const formatTimestamp = (timestamp: number | undefined) => {
    if (!timestamp) return 'N/A';
    
    const date = new Date(timestamp);
    return `${date.toLocaleTimeString()} (${Math.floor((Date.now() - timestamp) / 1000)}s ago)`;
  };

  const toggleExpand = () => {
    setIsExpanded(!isExpanded);
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 bg-white dark:bg-gray-800 rounded-md shadow-lg p-3 max-w-sm w-64 border border-gray-200 dark:border-gray-700 opacity-90 hover:opacity-100 transition-opacity">
      <div 
        className="flex justify-between items-center cursor-pointer mb-2" 
        onClick={toggleExpand}
      >
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
          User Status Debug
        </h3>
        <div className="flex items-center">
          <div 
            className={`w-3 h-3 rounded-full mr-2 ${
              realTimeStatus === 'online' 
                ? 'bg-green-500 animate-pulse' 
                : realTimeStatus === 'away' 
                  ? 'bg-yellow-500' 
                  : 'bg-red-500'
            }`}
          />
          <span className="text-gray-500">
            {isExpanded ? '▼' : '▶'}
          </span>
        </div>
      </div>

      {isExpanded && (
        <div className="text-xs">
          {error ? (
            <div className="text-red-500">{error}</div>
          ) : statusData ? (
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="font-medium">User ID:</span>
                <span className="text-gray-600 dark:text-gray-300">{currentUser.id.substring(0, 8)}...</span>
              </div>
              
              <div className="flex justify-between">
                <span className="font-medium">Real-time State:</span>
                <span className={`${
                  realTimeStatus === 'online' 
                    ? 'text-green-500' 
                    : realTimeStatus === 'away' 
                      ? 'text-yellow-500' 
                      : 'text-red-500'
                }`}>
                  {realTimeStatus}
                </span>
              </div>
              
              <div className="flex justify-between">
                <span className="font-medium">RTDB State:</span>
                <span className={`${
                  statusData.state === 'online' 
                    ? 'text-green-500' 
                    : statusData.state === 'away' 
                      ? 'text-yellow-500' 
                      : 'text-red-500'
                }`}>
                  {statusData.state}
                </span>
              </div>
              
              <div className="flex justify-between">
                <span className="font-medium">Last Active:</span>
                <span className="text-gray-600 dark:text-gray-300">{formatTimestamp(statusData.lastActive)}</span>
              </div>
              
              <div className="flex justify-between">
                <span className="font-medium">Last Seen:</span>
                <span className="text-gray-600 dark:text-gray-300">{formatTimestamp(statusData.lastSeen)}</span>
              </div>
              
              <div className="flex justify-between">
                <span className="font-medium">Initialized:</span>
                <span className="text-gray-600 dark:text-gray-300">
                  {statusData.presenceServiceInitialized ? 'Yes' : 'No'}
                </span>
              </div>
              
              <div className="flex justify-between">
                <span className="font-medium">Connections:</span>
                <span className="text-gray-600 dark:text-gray-300">
                  {statusData.connections ? Object.keys(statusData.connections).length : '0'}
                </span>
              </div>

              {/* Manual status control */}
              <div className="mt-3 border-t pt-2 border-gray-200 dark:border-gray-700">
                <div className="text-xs font-medium mb-2">Set Status Manually:</div>
                <div className="flex space-x-2">
                  <button 
                    onClick={() => setStatus('online')} 
                    className={`px-2 py-1 rounded text-xs ${
                      realTimeStatus === 'online' 
                        ? 'bg-green-500 text-white' 
                        : 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                    }`}
                  >
                    Online
                  </button>
                  <button 
                    onClick={() => setStatus('away')} 
                    className={`px-2 py-1 rounded text-xs ${
                      realTimeStatus === 'away' 
                        ? 'bg-yellow-500 text-white' 
                        : 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                    }`}
                  >
                    Away
                  </button>
                  <button 
                    onClick={() => setStatus('offline')} 
                    className={`px-2 py-1 rounded text-xs ${
                      realTimeStatus === 'offline' 
                        ? 'bg-red-500 text-white' 
                        : 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                    }`}
                  >
                    Offline
                  </button>
                </div>
              </div>
              
              {statusData.clientVersion && (
                <div className="flex justify-between">
                  <span className="font-medium">Client Version:</span>
                  <span className="text-gray-600 dark:text-gray-300">{statusData.clientVersion}</span>
                </div>
              )}
              
              <details className="mt-2">
                <summary className="cursor-pointer text-blue-500 hover:text-blue-600">Show Raw Data</summary>
                <pre className="mt-2 bg-gray-100 dark:bg-gray-900 p-2 rounded overflow-auto max-h-40">
                  {JSON.stringify(statusData, null, 2)}
                </pre>
              </details>
            </div>
          ) : (
            <div className="text-gray-500">Loading status...</div>
          )}
        </div>
      )}
    </div>
  );
};

export default StatusDebugContainer;
