import { 
  ref, 
  onDisconnect, 
  onValue,
  get,
  update,
  remove,
  query,
  push,
  set,
  orderByChild,
  limitToLast,
  serverTimestamp as rtdbServerTimestamp
} from 'firebase/database';
import { rtdb, db, auth } from '../firebase/config';
import { doc, getDoc } from 'firebase/firestore';

// Constants for database references
const PRESENCE_REF = '.info/connected';
const STATUS_REF = 'status';
const CONNECTIONS_REF = 'connections';

// Balanced intervals for performance and responsiveness
const INACTIVITY_THRESHOLD = 60 * 1000; // 60 seconds (more conservative)
const PRESENCE_INTERVAL = 10000; // Less frequent updates (10 seconds)
const HEARTBEAT_INTERVAL = 30000; // Reduced heartbeat (30 seconds)
const ACTIVITY_DEBOUNCE = 200; // Reasonable activity response (200ms)
const FORCE_UPDATE_INTERVAL = 30000; // Force updates every 30 seconds
const MAX_RETRIES = 3; // Fewer retry attempts

// Configurable timeout for offline detection (in milliseconds)
const OFFLINE_TIMEOUT = 300000; // 10 seconds - time before setting user offline when inactive

// Basic user status type for backward compatibility
export interface UserStatus {
  state: 'online' | 'offline';
  lastActive: number;
}

// Enhanced user presence interface with real-time tracking
export interface UserPresence {
  state: 'online' | 'offline' | 'away';
  lastActive: number;
  lastSeen: number;
  connections: { [key: string]: { timestamp: number; active: boolean } };
  // Enhanced real-time fields
  realTimeUpdate?: number;
  connectionQuality?: 'good' | 'poor' | 'disconnected';
  updateSequence?: number;
}

// Module-level variables to track state
let presenceRef: any = null;
let userStatusRef: any = null;
let connectionRef: any = null;
let presenceConnectionUnsubscribe: (() => void) | null = null;
let presenceInterval: NodeJS.Timeout | null = null;
let heartbeatInterval: NodeJS.Timeout | null = null;
let forceUpdateInterval: NodeJS.Timeout | null = null;
let connectionQualityInterval: NodeJS.Timeout | null = null;
let reconnectAttemptTimeout: NodeJS.Timeout | null = null;
let inactivityTimeout: NodeJS.Timeout | null = null;
let sleepDetectionInterval: NodeJS.Timeout | null = null;
let lastActivity = Date.now();
let lastHeartbeat = Date.now();
let isInitialized = false;
let updateSequence = 0;
let lastUpdateTime = 0;
let isCleaningUp = false; // Prevent presence updates during cleanup
let wasVisible = true; // Track previous visibility state
let invisibleSince = 0; // Track when app became invisible

// Improved retry operation with exponential backoff
const retryOperation = async (operation: () => Promise<any>, retries = MAX_RETRIES): Promise<any> => {
  try {
    return await operation();
  } catch (error) {
    console.error("[Presence] Operation failed, attempts left:", retries, error);
    if (retries > 0) {
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, MAX_RETRIES - retries) * 1000));
      return retryOperation(operation, retries - 1);
    }
    throw error;
  }
};

// Enhanced activity tracking with immediate updates and smart propagation
let activityTimeout: NodeJS.Timeout | null = null;
let lastActivityUpdateTime = 0;
const updateActivity = () => {
  if (isCleaningUp) {
    return;
  }
  const now = Date.now();
  const timeSinceLastActivityUpdate = now - lastActivityUpdateTime;
  lastActivity = now;
  updateSequence++;
  
  // Clear any pending timeout
  if (activityTimeout) {
    clearTimeout(activityTimeout);
  }
  
  // If it's been more than 15 seconds since the last activity update,
  // send an immediate update to propagate "online" status faster
  const shouldUpdateImmediately = timeSinceLastActivityUpdate > 15000;
  
  if (shouldUpdateImmediately) {
    sendActivityUpdate(0); // Send update immediately (0ms delay)
  } else {
    // Otherwise use normal debounce to prevent flooding Firebase
    activityTimeout = setTimeout(() => {
      sendActivityUpdate(ACTIVITY_DEBOUNCE);
    }, ACTIVITY_DEBOUNCE);
  }
  
  // Helper function to send the activity update
  function sendActivityUpdate(delay: number) {
    setTimeout(async () => {
      if (!userStatusRef || !connectionRef || !connectionRef.key) {
        return;
      }

      try {
        await update(userStatusRef, {
          state: 'online',
          lastActive: lastActivity,
          lastSeen: rtdbServerTimestamp(),
          realTimeUpdate: now,
          updateSequence: updateSequence,
          connectionQuality: 'good',
          [`connections/${connectionRef.key}`]: {
            timestamp: lastActivity,
            active: true
          },
          // Add unique fields to ensure the update is recognized and propagated
          activitySignal: Math.random().toString(36).substring(2, 10),
          activityTimestamp: now
        });
        
        lastUpdateTime = now;
        lastActivityUpdateTime = now;
        // console.log("[Presence] activity update sent" + (delay === 0 ? " (immediate)" : ""));
      } catch (error) {
        console.error('[Presence] Error updating activity:', error);
      }
    }, delay);
  }
};

// Enhanced real-time connection quality monitoring with more frequent checks
const monitorConnectionQuality = () => {
  if (connectionQualityInterval) {
    clearInterval(connectionQualityInterval);
  }
  
  connectionQualityInterval = setInterval(async () => {
    if (!userStatusRef) return;
    
    const now = Date.now();
    const timeSinceLastUpdate = now - lastUpdateTime;
    
    // More aggressive quality assessment with faster degradation
    let quality: 'good' | 'poor' | 'disconnected' = 'good';
    if (timeSinceLastUpdate > 20000) { // Reduced from 30s to 20s
      quality = 'disconnected';
    } else if (timeSinceLastUpdate > 10000) { // Reduced from 15s to 10s
      quality = 'poor';
    }
    
    // Check navigator.onLine for immediate local network status
    if (!navigator.onLine) {
      quality = 'disconnected';
    }
    
    try {      
      // Update with more fields for better real-time triggering
      await update(userStatusRef, {
        connectionQuality: quality,
        lastQualityCheck: now,
        realTimeUpdate: quality === 'good' ? now : undefined, // Only set realTimeUpdate if connection is good
        qualityUpdateToken: Math.random().toString(36).substring(2, 10) // Random token to force Firebase to send the update
      });
      
      // If quality is not good, trigger a more thorough status update
      if (quality !== 'good' && navigator.onLine) {
        setTimeout(async () => {
          try {
            await updateUserOnlineStatus(auth.currentUser?.uid || '');
          } catch (err) {
            console.warn('[Presence] Failed to update status after poor connection quality detected', err);
          }
        }, 500); // Short delay before trying to recover
      }
    } catch (error) {
      console.error('[Presence] Error updating connection quality:', error);
    }
  }, 5000); // More frequent checks (reduced from 10s to 5s)
};

// Force periodic updates to ensure real-time sync with more frequent updates
const startForceUpdateInterval = () => {
  if (forceUpdateInterval) {
    clearInterval(forceUpdateInterval);
  }
  
  // Staggered updates for better real-time presence
  let updateCount = 0;
  forceUpdateInterval = setInterval(async () => {
    if (!userStatusRef || !navigator.onLine) return;
    
    try {
      const now = Date.now();
      updateSequence++;
      updateCount++;
      
      // Different update patterns based on cycle to avoid Firebase throttling
      const updateData: any = {
        state: 'online',
        lastActive: now,
        lastSeen: rtdbServerTimestamp(),
        realTimeUpdate: now,
        updateSequence: updateSequence
      };
      
      // Add different fields on different cycles to force Firebase to recognize as a change
      if (updateCount % 3 === 0) {
        updateData.forceSync = true;
        updateData.syncToken = Math.random().toString(36).substring(2, 15);
      } else if (updateCount % 3 === 1) {
        updateData.refreshCheck = now;
        updateData.connectionVerified = true;
      } else {
        updateData.heartbeatTimestamp = now;
        updateData.activeSession = true;
      }
      
      await update(userStatusRef, updateData);
      
      lastUpdateTime = now;
      console.log(`[Presence] Force update sent for real-time sync (cycle ${updateCount % 3})`);
    } catch (error) {
      console.error('[Presence] Error in force update:', error);
    }
  }, FORCE_UPDATE_INTERVAL);
};

// Check if user exists in Firestore to confirm authentication
const verifyUserInFirestore = async (userId: string): Promise<boolean> => {
  try {
    const userDoc = await getDoc(doc(db, 'users', userId));
    return userDoc.exists();
  } catch (error) {
    console.error('[Presence] Error verifying user in Firestore:', error);
    return false;
  }
};

// Initialize presence for a user
export const initializePresence = async (userId: string) => {
  console.log("[Presence] Initializing presence for user:", userId);
  
  // Skip if no user ID provided
  if (!userId) {
    console.error("[Presence] Cannot initialize presence: No user ID provided");
    return;
  }
  
  // Clean up any existing presence first
  if (isInitialized) {
    console.log("[Presence] Presence already initialized, cleaning up first");
    await cleanupPresence();
  }

  try {
    // Create database references
    presenceRef = ref(rtdb, PRESENCE_REF);
    userStatusRef = ref(rtdb, `${STATUS_REF}/${userId}`);
    const timestamp = Date.now();
    
    // CRITICAL: First write directly to the status path for immediate presence status
    console.log("[Presence] Writing directly to status path for immediate presence:", userId);
    try {
      // Write at the root level status path
      const rootStatusRef = ref(rtdb, STATUS_REF);
      const userData = {
        [userId]: {
          state: 'online',
          lastActive: timestamp,
          lastSeen: timestamp,
          presenceServiceInitialized: true,
          clientVersion: '3.1.3',
          serverTime: rtdbServerTimestamp(),
          initializedAt: new Date().toISOString()
        }
      };
      
      // Use update at the root level to avoid overwriting other users
      await update(rootStatusRef, userData);
      
      // Also ensure the direct user path is set
      await set(userStatusRef, {
        state: 'online',
        lastActive: timestamp,
        lastSeen: timestamp,
        presenceServiceInitialized: true,
        clientVersion: '3.1.3',
        serverTime: rtdbServerTimestamp(),
        initializedAt: new Date().toISOString()
      });
      
      console.log("[Presence] Direct write to status path completed successfully");
    } catch (directWriteError) {
      console.error("[Presence] Error writing directly to status path:", directWriteError);
      // Continue with normal initialization even if this fails
    }
    
    // Create a new connection entry with a push ID
    connectionRef = push(ref(rtdb, `${CONNECTIONS_REF}/${userId}`));
    
    // Verify the user exists in Firestore
    const userExists = await verifyUserInFirestore(userId);
    if (!userExists) {
      console.warn("[Presence] User not found in Firestore database. Continuing anyway.");
    }

    // Set initial presence state with enhanced real-time tracking
    const initialState = {
      state: 'online',
      lastActive: timestamp,
      lastSeen: timestamp,
      realTimeUpdate: timestamp,
      updateSequence: updateSequence,
      connectionQuality: 'good',
      connections: {
        [connectionRef.key]: {
          timestamp,
          active: true
        }
      }
    };

    // Use set instead of update to ensure complete replacement of any stale data
    await set(userStatusRef, initialState);
    
    // Start a heartbeat to keep status fresh
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
    }
    
    heartbeatInterval = setInterval(async () => {
      try {
        if (userStatusRef && navigator.onLine) {
          const now = Date.now();
          updateSequence++;
          
          await update(userStatusRef, {
            lastSeen: now,
            serverTime: rtdbServerTimestamp(),
            state: 'online',
            realTimeUpdate: now,
            updateSequence: updateSequence,
            heartbeat: true
          });
          
          lastUpdateTime = now;
          lastHeartbeat = now; // Update heartbeat timestamp
          console.log("[Presence] Enhanced heartbeat sent");
        }
      } catch (error) {
        console.error("[Presence] Failed to send heartbeat:", error);
      }
    }, HEARTBEAT_INTERVAL);
    
    // Listen for connection state changes
    if (presenceConnectionUnsubscribe) {
      presenceConnectionUnsubscribe();
      presenceConnectionUnsubscribe = null;
    }

    presenceConnectionUnsubscribe = onValue(presenceRef, async (snapshot) => {
      const isConnected = snapshot.val();
      console.log("[Presence] Connection state changed:", isConnected ? "connected" : "disconnected");
      
      if (!isConnected) {
        console.log("[Presence] Disconnected from Firebase");
        // Handle disconnect - will trigger reconnection attempts
        if (reconnectAttemptTimeout === null && auth.currentUser?.uid === userId) {
          console.log("[Presence] Setting up reconnection attempt");
          reconnectAttemptTimeout = setTimeout(() => {
            console.log("[Presence] Attempting to reconnect");
            reconnectAttemptTimeout = null;
            initializePresence(userId).catch(console.error);
          }, 5000);
        }
        return;
      }
      
      console.log("[Presence] Connected to Firebase, setting up disconnect handlers");
      
      try {
        // Set up disconnect handlers
        await onDisconnect(userStatusRef).update({
          state: 'offline',
          lastActive: lastActivity,
          lastSeen: timestamp, // Use consistent timestamp
        });
        
        await onDisconnect(connectionRef).remove();
        
        // Update the connection and status
        await update(connectionRef, {
          timestamp: lastActivity,
          active: true
        });
        
        // Force set online status immediately after connection
        await update(userStatusRef, {
          state: 'online',
          lastActive: timestamp,
          lastSeen: timestamp,
          [`connections/${connectionRef.key}`]: {
            timestamp: timestamp,
            active: true
          }
        });
        
        // One more forced update to ensure status is reflected
        await updateUserOnlineStatus(userId);
        
        console.log("[Presence] Successfully set up presence");
      } catch (error) {
        console.error('[Presence] Error setting up presence:', error);
      }
    });
    
    // Set up activity listeners
    document.addEventListener('mousemove', updateActivity);
    document.addEventListener('keypress', updateActivity);
    document.addEventListener('touchstart', updateActivity);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleWindowFocus);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    // Start presence interval for regular status updates
    startPresenceInterval();
    
    // Start force update interval for real-time sync
    startForceUpdateInterval();
    
    // Start connection quality monitoring
    monitorConnectionQuality();
    
    // Start sleep detection
    startSleepDetection();
    
    isInitialized = true;
    console.log('[Presence] Enhanced presence initialized successfully for user:', userId);
  } catch (error) {
    console.error('[Presence] Failed to initialize presence:', error);
    // Make sure we clean up on error
    await cleanupPresence();
  }
};

// Clean up presence system
export const cleanupPresence = async () => {
  isCleaningUp = true;
  console.log("[Presence] Cleaning up presence");
  try {
    if (presenceConnectionUnsubscribe) {
      presenceConnectionUnsubscribe();
      presenceConnectionUnsubscribe = null;
    }

    // Immediately stop all periodic tasks to prevent race conditions
    if (presenceInterval) {
      clearInterval(presenceInterval);
      presenceInterval = null;
    }
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
    if (forceUpdateInterval) {
      clearInterval(forceUpdateInterval);
      forceUpdateInterval = null;
    }
    if (connectionQualityInterval) {
      clearInterval(connectionQualityInterval);
      connectionQualityInterval = null;
    }
    // Always attempt to set the user as offline
    if (userStatusRef) {
      try {
        await update(userStatusRef, {
          state: 'offline',
          lastActive: lastActivity,
          lastSeen: rtdbServerTimestamp(),
        });
      } catch (err) {
        console.error("[Presence] Error updating status during cleanup:", err);
      }
    }

    // Remove connection entry if it exists
    if (connectionRef) {
      try {
        await remove(connectionRef);
      } catch (err) {
        console.error("[Presence] Error removing connection during cleanup:", err);
      }
    }

    // Remove all event listeners
    document.removeEventListener('mousemove', updateActivity);
    document.removeEventListener('keypress', updateActivity);
    document.removeEventListener('touchstart', updateActivity);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('focus', handleWindowFocus);
    window.removeEventListener('blur', handleWindowBlur);
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);

    // Clear intervals and timeouts
    if (presenceInterval) {
      clearInterval(presenceInterval);
      presenceInterval = null;
    }
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
    if (forceUpdateInterval) {
      clearInterval(forceUpdateInterval);
      forceUpdateInterval = null;
    }
    if (connectionQualityInterval) {
      clearInterval(connectionQualityInterval);
      connectionQualityInterval = null;
    }
    if (activityTimeout) {
      clearTimeout(activityTimeout);
      activityTimeout = null;
    }
    if (reconnectAttemptTimeout) {
      clearTimeout(reconnectAttemptTimeout);
      reconnectAttemptTimeout = null;
    }
    if (inactivityTimeout) {
      clearTimeout(inactivityTimeout);
      inactivityTimeout = null;
    }
    if (sleepDetectionInterval) {
      clearInterval(sleepDetectionInterval);
      sleepDetectionInterval = null;
    }

    // Clear references
    presenceRef = null;
    userStatusRef = null;
    connectionRef = null;
    isInitialized = false;
    isCleaningUp = false;
  } catch (error) {
    console.error('[Presence] Error cleaning up presence:', error);
  }
};

// Enhanced visibility change handler with sleep/app switch detection
const handleVisibilityChange = () => {
  const isVisible = document.visibilityState === 'visible';
  const now = Date.now();
  
  console.log("[Presence] Document visibility changed:", document.visibilityState);
  
  if (isVisible) {
    // App became visible again
    if (!wasVisible && invisibleSince > 0) {
      const timeAway = now - invisibleSince;
      console.log(`[Presence] App was invisible for ${Math.round(timeAway / 1000)}s`);
      
      // If away for more than 1 minute, user was likely on another app or device was sleeping
      if (timeAway > OFFLINE_TIMEOUT) { // Configurable timeout
        console.log("[Presence] User was away for >1 minute, setting back to online");
        // Force immediate online status update
        updateActivity();
        if (auth.currentUser) {
          updateUserOnlineStatus(auth.currentUser.uid);
        }
      } else {
        updateActivity();
      }
    } else {
      updateActivity();
    }
    
    wasVisible = true;
    invisibleSince = 0;
  } else {
    // App became invisible
    wasVisible = false;
    invisibleSince = now;
    
    // Set a timeout to go offline if invisible for more than 1 minute
    if (inactivityTimeout) {
      clearTimeout(inactivityTimeout);
    }
    
    inactivityTimeout = setTimeout(async () => {
      if (!wasVisible && auth.currentUser) {
        console.log("[Presence] App invisible for >1 minute, setting offline");
        await setUserOffline(auth.currentUser.uid);
      }
    }, OFFLINE_TIMEOUT); // Configurable timeout
    
    setAwayStatus();
  }
};

// Handle window focus with sleep detection
const handleWindowFocus = () => {
  const now = Date.now();
  const timeSinceLastHeartbeat = now - lastHeartbeat;
  
  console.log("[Presence] Window focused");
  
  // If it's been more than 2 minutes since last heartbeat, device might have been sleeping
  if (timeSinceLastHeartbeat > 120000) { // 2 minutes
    console.log(`[Presence] Long gap since last heartbeat (${Math.round(timeSinceLastHeartbeat / 1000)}s), device may have been sleeping`);
    // Force online status update
    if (auth.currentUser) {
      updateUserOnlineStatus(auth.currentUser.uid);
    }
  }
  
  updateActivity();
  lastHeartbeat = now;
};

// Handle window blur with timeout for offline detection
const handleWindowBlur = () => {
  console.log("[Presence] Window blurred");
  
  // Set a timeout to go offline if blurred for more than 1 minute
  if (inactivityTimeout) {
    clearTimeout(inactivityTimeout);
  }
  
  inactivityTimeout = setTimeout(async () => {
    if (document.visibilityState === 'hidden' && auth.currentUser) {
      console.log("[Presence] Window blurred for >1 minute, setting offline");
      await setUserOffline(auth.currentUser.uid);
    }
  }, OFFLINE_TIMEOUT); // 1 minute
  
  setAwayStatus();
};

// Handle online event
const handleOnline = async () => {
  console.log("[Presence] Browser online event");
  if (auth.currentUser && !isInitialized) {
    await initializePresence(auth.currentUser.uid);
  } else if (userStatusRef) {
    updateActivity();
  }
};

// Handle offline event
const handleOffline = async () => {
  console.log("[Presence] Browser offline event");
  
  // Immediately set offline status when browser reports offline
  if (userStatusRef && auth.currentUser) {
    try {
      await setUserOffline(auth.currentUser.uid);
      console.log("[Presence] Successfully set offline status due to network loss");
    } catch (error) {
      console.error("[Presence] Failed to set offline status:", error);
    }
  }
};

// Set away status
const setAwayStatus = async () => {
  if (isCleaningUp) {
    return;
  }
  if (!userStatusRef || !connectionRef || !connectionRef.key) {
    return;
  }
  
  try {
    console.log("[Presence] Setting away status");
    await update(userStatusRef, {
      state: 'online',
      lastActive: lastActivity,
      lastSeen: rtdbServerTimestamp(),
      [`connections/${connectionRef.key}`]: {
        timestamp: lastActivity,
        active: false
      }
    });
  } catch (error) {
    console.error('[Presence] Error setting away status:', error);
  }
};

// Set offline status
const setOfflineStatus = async () => {
  if (!userStatusRef) {
    return;
  }
  
  try {
    console.log("[Presence] Setting offline status");
    await update(userStatusRef, {
      state: 'offline',
      lastActive: lastActivity,
      lastSeen: rtdbServerTimestamp(),
    });
  } catch (error) {
    console.error('[Presence] Error setting offline status:', error);
  }
};

// Sleep detection mechanism to detect device sleep/power off
const startSleepDetection = () => {
  if (sleepDetectionInterval) {
    clearInterval(sleepDetectionInterval);
  }
  
  let lastCheck = Date.now();
  
  sleepDetectionInterval = setInterval(async () => {
    const now = Date.now();
    const expectedInterval = 30000; // 30 seconds
    const actualInterval = now - lastCheck;
    const tolerance = 5000; // 5 second tolerance
    
    // If the actual interval is significantly longer than expected,
    // the device likely went to sleep or was powered off
    if (actualInterval > expectedInterval + tolerance) {
      const sleepDuration = actualInterval - expectedInterval;
      console.log(`[Presence] Detected potential sleep/power off for ${Math.round(sleepDuration / 1000)}s`);
      
      // If sleep was longer than 1 minute, set user offline
      if (sleepDuration > 60000 && auth.currentUser) {
        console.log("[Presence] Device was sleeping/off for >1 minute, setting offline");
        try {
          await setUserOffline(auth.currentUser.uid);
        } catch (error) {
          console.error("[Presence] Failed to set offline after sleep detection:", error);
        }
      }
    }
    
    lastCheck = now;
  }, 30000); // Check every 30 seconds
  
  // Also listen for page visibility changes that might indicate sleep
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      const now = Date.now();
      const timeSinceLastCheck = now - lastCheck;
      
      // If page becomes visible after a long time, device might have been sleeping
      if (timeSinceLastCheck > 120000) { // 2 minutes
        console.log(`[Presence] Page visible after ${Math.round(timeSinceLastCheck / 1000)}s, possible sleep detected`);
        if (auth.currentUser) {
          // Force online status update
          updateUserOnlineStatus(auth.currentUser.uid);
        }
      }
      lastCheck = now;
    }
  });
  
  console.log("[Presence] Sleep detection started");
};

// Start presence interval with enhanced real-time monitoring and immediate propagation
const startPresenceInterval = () => {
  if (presenceInterval) {
    clearInterval(presenceInterval);
  }
  
  // Track user activity patterns for smarter updates
  let lastActivityPattern: number[] = [];
  let consecutiveInactive = 0;
  
  presenceInterval = setInterval(async () => {
    const now = Date.now();
    const timeSinceActivity = now - lastActivity;
    const isActive = timeSinceActivity < 10000; // Consider active if interaction within 10 seconds
    
    // Track activity pattern
    lastActivityPattern.push(isActive ? 1 : 0);
    if (lastActivityPattern.length > 5) {
      lastActivityPattern.shift(); // Keep last 5 activity states
    }
    
    // Calculate activity score
    const activityScore = lastActivityPattern.reduce((sum, val) => sum + val, 0);
    
    if (timeSinceActivity > INACTIVITY_THRESHOLD) {
      await setAwayStatus();
      consecutiveInactive++;
    } else if (document.visibilityState === 'visible') {
      // Reset consecutive inactive counter when user is active
      consecutiveInactive = 0;
      
      // More aggressive activity updates when user has just become active
      if (activityScore <= 2 && isActive) {
        console.log('[Presence] User recently became active, triggering immediate update');
        // Force immediate update to propagate "active now" status
        await updateUserOnlineStatus(auth.currentUser?.uid || '');
      } else {
        updateActivity(); // Regular activity update
      }
    }
    
    // Dynamic connection quality monitoring
    const timeSinceLastUpdate = now - lastUpdateTime;
    
    // More aggressive in recovering from potential disconnections
    if (timeSinceLastUpdate > 10000) { // Reduced from 15 seconds to 10 seconds
      console.log("[Presence] Long time since last update, forcing immediate presence refresh");
      
      // Force an immediate update rather than waiting for next cycle
      try {
        await updateUserOnlineStatus(auth.currentUser?.uid || '');
      } catch (err) {
        console.warn("[Presence] Failed to force update after delay detected:", err);
        // Force an update during the next cycle as fallback
        lastUpdateTime = now - FORCE_UPDATE_INTERVAL + 1000;
      }
    }
  }, PRESENCE_INTERVAL);
  
  // Start connection quality monitoring
  monitorConnectionQuality();
  
  // Start force update interval for real-time sync
  startForceUpdateInterval();
};

// Get user's presence status
export const getUserPresence = async (userId: string): Promise<UserPresence | null> => {
  if (!userId) {
    console.error("[Presence] Cannot get presence for empty user ID");
    return null;
  }
  
  try {
    console.log(`[Presence] Getting presence for user: ${userId}`);
    const statusRef = ref(rtdb, `${STATUS_REF}/${userId}`);
    const snapshot = await get(statusRef);
    
    if (!snapshot.exists()) {
      console.log(`[Presence] No presence data found for user: ${userId} at path: ${STATUS_REF}/${userId}`);
      return {
        state: 'offline',
        lastActive: Date.now(),
        lastSeen: Date.now(),
        connections: {}
      };
    }
    
    const presence = snapshot.val() as UserPresence;
    
    // Validate data - check timestamps and connections
    const now = Date.now();
    // If lastSeen was too long ago (more than 5 minutes), consider offline
    const lastSeenTime = presence.lastSeen ? presence.lastSeen : 0;
    const timeSinceLastSeen = typeof lastSeenTime === 'number' 
      ? now - lastSeenTime 
      : 300000; // Default to 5 minutes if can't determine
    
    if (timeSinceLastSeen > 300000) { // 5 minutes (increased from 30 seconds)
      console.log(`[Presence] User ${userId} last seen too long ago (${timeSinceLastSeen}ms), marking as offline`);
      return {
        ...presence,
        state: 'offline'
      };
    }
    
    // If no connections or no active connections, mark as offline
    const hasConnections = presence.connections && Object.keys(presence.connections).length > 0;
    const hasActiveConnections = hasConnections && 
      Object.values(presence.connections).some(conn => conn.active);
    
    if (!hasConnections || !hasActiveConnections) {
      console.log(`[Presence] User ${userId} has no active connections, marking as offline`);
      return {
        ...presence,
        state: 'offline'
      };
    }
    
    return presence;
  } catch (error) {
    console.error('[Presence] Error getting user presence:', error);
    return null;
  }
};

// Subscribe to a user's presence with better filtering and validation
export const subscribeToUserPresence = (
  userId: string,
  callback: (presence: UserPresence | null) => void
): () => void => {
  if (!userId) {
    console.error("[Presence] Cannot subscribe to presence for empty user ID");
    callback(null);
    return () => {};
  }
  
  console.log(`[Presence] Subscribing to presence for user: ${userId}`);
  const statusRef = ref(rtdb, `${STATUS_REF}/${userId}`);

  // Helper to retry fetching presence if missing
  const retryFetchPresence = async (attempt = 1) => {
    const snapshot = await get(statusRef);
    if (snapshot.exists()) {
      const presence = snapshot.val() as UserPresence;
      processAndReturnPresence(presence, userId, callback);
    } else if (attempt < 3) {
      setTimeout(() => retryFetchPresence(attempt + 1), 500); // Retry after 500ms
    } else {
      // After retries, force another online status update and try one last fetch
      await updateUserOnlineStatus(userId);
      setTimeout(async () => {
        const finalSnapshot = await get(statusRef);
        if (finalSnapshot.exists()) {
          const presence = finalSnapshot.val() as UserPresence;
          processAndReturnPresence(presence, userId, callback);
        } else {
          callback({
            state: 'offline',
            lastActive: Date.now(),
            lastSeen: Date.now(),
            connections: {}
          });
        }
      }, 500);
    }
  };

  // Immediately check if there's data and force a presence value
  get(statusRef).then(snapshot => {
    if (snapshot.exists()) {
      const presence = snapshot.val() as UserPresence;
      processAndReturnPresence(presence, userId, callback);
    } else {
      // Retry a few times before giving up
      retryFetchPresence();
    }
  }).catch(error => {
    console.error(`[Presence] Error getting initial presence for ${userId}:`, error);
  });
  
  const unsubscribe = onValue(statusRef, (snapshot) => {
    console.log(`[Presence] Received presence update for ${userId}:`, snapshot.val());
    
    if (!snapshot.exists()) {
      // Retry a few times before giving up
      retryFetchPresence();
      return;
    }
    
    const presence = snapshot.val() as UserPresence;
    processAndReturnPresence(presence, userId, callback);
  }, (error) => {
    console.error(`[Presence] Error in presence subscription for ${userId}:`, error);
    callback({
      state: 'offline',
      lastActive: Date.now(),
      lastSeen: Date.now(),
      connections: {}
    });
  });
  
  return unsubscribe;
};

// Helper function to process presence data with more aggressive real-time validation
// and improved detection for other users
const processAndReturnPresence = (
  presence: UserPresence, 
  userId: string,
  callback: (presence: UserPresence | null) => void
) => {
  // Early exit: if presence indicates an intentional logout, force offline immediately
  if ((presence as any).intentionalLogout) {
    console.log(`[Presence] User ${userId} intentionally logged out – forcing offline state`);
    callback({
      ...presence,
      state: 'offline',
      connectionQuality: 'disconnected',
      realTimeUpdate: Date.now(),
    });
    return;
  }

  // Validate the presence data
  if (!presence) {
    console.log(`[Presence] Invalid presence data for ${userId}`);
    callback({
      state: 'offline',
      lastActive: Date.now(),
      lastSeen: Date.now(),
      connections: {},
      realTimeUpdate: Date.now() // Add realTimeUpdate for consistency
    });
    return;
  }
  
  // Log the raw presence data for debugging
  console.log(`[Presence] Raw presence data for ${userId}:`, {
    state: presence.state,
    connections: presence.connections ? Object.keys(presence.connections).length : 0,
    activeConnections: presence.connections ? 
      Object.values(presence.connections).filter(c => c.active).length : 0,
    lastActive: presence.lastActive ? new Date(presence.lastActive).toISOString() : 'N/A',
    lastSeen: presence.lastSeen ? new Date(presence.lastSeen).toISOString() : 'N/A',
    timeSinceLastActive: presence.lastActive ? (Date.now() - presence.lastActive) / 1000 : 'N/A',
    timeSinceLastSeen: presence.lastSeen ? (Date.now() - presence.lastSeen) / 1000 : 'N/A',
    realTimeUpdate: presence.realTimeUpdate ? new Date(presence.realTimeUpdate).toISOString() : 'N/A'
  });
  
  // Ensure connections object exists
  if (!presence.connections) {
    presence.connections = {};
  }
  
  // Respect explicit offline state reported by RTDB
  if (presence.state === 'offline') {
    console.log(`[Presence] RTDB reports user ${userId} as offline – respecting status`);
    callback({
      ...presence,
      state: 'offline',
      connectionQuality: 'disconnected',
      realTimeUpdate: Date.now(),
    });
    return;
  }
  
  const now = Date.now();
  
  // ENHANCED FOR OTHER USERS: Much more lenient about considering users online
  // This is crucial for seeing friends as online, especially if they're on mobile devices or poor networks
  
  // Calculate time thresholds for better presence detection
  const oneMinuteAgo = now - 60000;       // 1 minute
  const fiveMinutesAgo = now - 300000;    // 5 minutes
  const tenMinutesAgo = now - 600000;     // 10 minutes
  const thirtyMinutesAgo = now - 1800000; // 30 minutes
  
  // Detect if there are any active connections, and the last activity times
  const hasAnyConnections = presence.connections && Object.keys(presence.connections).length > 0;
  const hasActiveConnections = hasAnyConnections && Object.values(presence.connections).some(conn => conn.active);
  const mostRecentActivity = Math.max(presence.lastActive || 0, presence.lastSeen || 0, presence.realTimeUpdate || 0);
  
  // First check: If state is explicitly online, trust it completely
  if (presence.state === 'online') {
    // Set or update realTimeUpdate field to ensure other components react immediately
    presence.realTimeUpdate = now;
    presence.connectionQuality = 'good';
    
    console.log(`[Presence] User ${userId} is explicitly online - immediate status propagation`);
    callback(presence);
    return;
  }
  
  // Second check: If user was active very recently (within 5 minutes), mark them as online
  if (mostRecentActivity > fiveMinutesAgo) {
    console.log(`[Presence] User ${userId} was active recently (${(now - mostRecentActivity)/1000}s ago), marking as online`);
    callback({
      ...presence,
      state: 'online', // Override to online regardless of what Firebase says
      realTimeUpdate: now,
      connectionQuality: mostRecentActivity > oneMinuteAgo ? 'good' : 'poor'
    });
    return;
  }
  
  // For states other than explicitly 'online', apply more aggressive real-time validation logic
  
  // Check if there are any connections at all
  const hasConnections = presence.connections && Object.keys(presence.connections).length > 0;
  const hasActiveConnectionsForSeen = hasConnections && 
    Object.values(presence.connections).some(conn => conn.active);
  
  // Use a more aggressive check for lastSeen timestamp - 10 minutes instead of 30
  const lastSeenTime = presence.lastSeen ? presence.lastSeen : 0;
  const timeSinceLastSeen = typeof lastSeenTime === 'number' 
    ? now - lastSeenTime 
    : 600000; // Default to 10 minutes if can't determine
  
  // If user was active in the last 10 minutes (reduced from 30), consider them online with real-time update
  const wasRecentlyActive = now - (presence.lastActive || 0) < 600000; // 10 minutes (more stringent)
  
  if (wasRecentlyActive) {
    console.log(`[Presence] User ${userId} was active recently (${(now - (presence.lastActive || 0))/1000}s ago), marking as online with real-time update`);
    callback({
      ...presence,
      state: 'online',
      realTimeUpdate: now, // Add realTimeUpdate to trigger immediate UI refresh
      connectionQuality: timeSinceLastSeen < 60000 ? 'good' : 'poor' // More nuanced quality
    });
    return;
  }
  
  // Third check: If user has active connections and was seen in the last 30 minutes, they're likely online
  // This is a major enhancement that's much more lenient about connection times
  if (hasActiveConnectionsForSeen && timeSinceLastSeen < 1800000) { // 30 minutes - MORE LENIENT
    console.log(`[Presence] User ${userId} has active connections and was seen in the last 30m, marking as online`);
    callback({
      ...presence,
      state: 'online',
      realTimeUpdate: now,
      connectionQuality: timeSinceLastSeen < 600000 ? 'good' : 'poor' // More nuanced quality
    });
    return;
  }
  
  // Fourth check: If there are any connections (even inactive ones), be optimistic
  // This greatly improves the chance of seeing friends as online
  if (hasAnyConnections && presence.lastSeen && presence.lastSeen > thirtyMinutesAgo) {
    // Calculate appropriate status based on time
    const timeSinceActive = now - (presence.lastActive || now);
    // More lenient: consider online for up to 5 minutes of inactivity
    const appropriateState = timeSinceActive < 300000 ? 'online' : 'away';
    
    console.log(`[Presence] User ${userId} has connections with activity in last 30m, marking as ${appropriateState}`);
    callback({
      ...presence,
      state: appropriateState,
      realTimeUpdate: now,
      connectionQuality: timeSinceActive < 300000 ? 'poor' : 'disconnected'
    });
    return;
  }
  
  // Final fallback - more aggressive in showing offline status for truly inactive users
  console.log(`[Presence] User ${userId} appears inactive, marking as offline with real-time update`);
  callback({
    ...presence,
    state: 'offline',
    realTimeUpdate: now, // Add realTimeUpdate to trigger immediate UI refresh
    connectionQuality: 'disconnected'
  });
};

// Force update a user's online status - useful when there are issues with status detection
export const updateUserOnlineStatus = async (userId: string): Promise<boolean> => {
  
  // Only allow updating status for the signed-in user on this client
  if (auth.currentUser?.uid !== userId) {
    console.warn(`[Presence] Skipping online status update for non-current user ${userId}`);
    return false;
  }
  
  if (!userId) {
    console.error("[Presence] Cannot update status for empty user ID");
    return false;
  }

  // Check if we're actually online before setting online status
  if (!navigator.onLine) {
    console.log(`[Presence] Device is offline, setting offline status for user: ${userId}`);
    await setUserOffline(userId);
    return false;
  }
  
  console.log(`[Presence] Forcing online status update for user: ${userId}`);
  
  try {
    const statusRef = ref(rtdb, `${STATUS_REF}/${userId}`);
    const now = Date.now();
    
    // First, check if the user already has presence data
    const snapshot = await get(statusRef);
    
    // Get connection reference
    let connectionKey = null;
    
    if (snapshot.exists()) {
      const presence = snapshot.val() as UserPresence;
      
      // If we have connections, use the most recent one
      if (presence.connections && Object.keys(presence.connections).length > 0) {
        connectionKey = Object.keys(presence.connections)[0];
      }
    }
    
    // If we don't already have a connection, create one
    if (!connectionKey) {
      console.log(`[Presence] No active connection found for ${userId}, creating new one`);
      const newConnectionRef = push(ref(rtdb, `${CONNECTIONS_REF}/${userId}`));
      connectionKey = newConnectionRef.key;
      
      // Also ensure there's a connections node
      await set(ref(rtdb, `${CONNECTIONS_REF}/${userId}/${connectionKey}`), {
        timestamp: now,
        active: true
      });
    }
    
    // Create a status update with enhanced real-time tracking
    const statusUpdate: any = {
      state: 'online',
      lastActive: now,
      lastSeen: now,
      realTimeUpdate: now,
      updateSequence: ++updateSequence,
      connectionQuality: 'good',
      forceOnline: true
    };
    
    // Only add connections if we have a valid key
    if (connectionKey && !connectionKey.includes('.') && !connectionKey.includes('#') && 
        !connectionKey.includes('$') && !connectionKey.includes('/') && 
        !connectionKey.includes('[') && !connectionKey.includes(']')) {
      statusUpdate.connections = {
        [connectionKey]: {
          timestamp: now,
          active: true
        }
      };
    } else {
      console.warn(`[Presence] Invalid connection key detected, skipping connection data`);
    }
    
    // Set (not update) to completely replace the user status
    await set(statusRef, {
      ...statusUpdate,
      serverTime: rtdbServerTimestamp()
    });
    
    // Force multiple updates to ensure the change is propagated
    // with MORE aggressive timings and multiple channels to ensure all clients receive the update
    
    // First quick follow-up (almost immediate)
    setTimeout(async () => {
      try {
        await update(statusRef, {
          lastUpdateCheck: now + 1,
          state: 'online', // Explicitly set again
          realTimeUpdate: Date.now(), // Force realtime update with current timestamp
          // Use a unique field to force Firebase to send an update
          refreshToken: Math.random().toString(36).substring(2, 15)
        });
        console.log(`[Presence] Sent immediate follow-up status update for ${userId}`);
      } catch (err) {
        console.warn(`[Presence] Failed to send immediate follow-up status update: ${err}`);
      }
    }, 100); // Reduced from 300ms to 100ms for faster propagation
    
    // Second follow-up update
    setTimeout(async () => {
      try {
        await update(statusRef, {
          state: 'online',
          lastUpdateConfirmation: now + 2,
          realTimeUpdate: Date.now(), // Another current timestamp
          // Use another unique field to force Firebase to send an update
          confirmationToken: Math.random().toString(36).substring(2, 15)
        });
        console.log(`[Presence] Sent second status update for ${userId}`);
      } catch (err) {
        console.warn(`[Presence] Failed to send second status update: ${err}`);
      }
    }, 500); // Added a middle update at 500ms
    
    // Final confirmation update
    setTimeout(async () => {
      try {
        await update(statusRef, {
          state: 'online',
          lastUpdateConfirmation: now + 3,
          realTimeUpdate: Date.now(), // Yet another current timestamp
          // Use another unique field to force Firebase to send an update
          lastConfirmation: Date.now(),
          // Add an easily detectable field for debugging
          forceRefreshToken: `rt_${Date.now()}`
        });
        console.log(`[Presence] Sent final confirmation update for ${userId}`);
      } catch (err) {
        console.warn(`[Presence] Failed to send final confirmation update: ${err}`);
      }
    }, 1000);
    
    console.log(`[Presence] Successfully forced online status for user: ${userId}`);
    return true;
  } catch (error) {
    console.error(`[Presence] Error forcing online status for user ${userId}:`, error);
    return false;
  }
};

// Legacy functions remain unchanged for backward compatibility
export const setUserOnline = (userId: string) => {
  if (!userId) return;
  
  const statusRef = ref(rtdb, `${STATUS_REF}/${userId}`);
  set(statusRef, {
    state: 'online',
    lastActive: Date.now(),
    lastSeen: rtdbServerTimestamp()
  });
  onDisconnect(statusRef).update({
    state: 'offline',
    lastActive: Date.now(),
    lastSeen: rtdbServerTimestamp()
  });
};

export const setUserOffline = async (userId: string): Promise<boolean> => {
  if (!userId) return false;
  
  try {
    console.log(`[Presence] Setting user offline: ${userId}`);
    const statusRef = ref(rtdb, `${STATUS_REF}/${userId}`);
    await update(statusRef, {
      state: 'offline',
      lastActive: Date.now(),
      lastSeen: rtdbServerTimestamp(),
      // Add extra fields to ensure the update is processed
      logoutTimestamp: Date.now(),
      intentionalLogout: true
    });
    console.log(`[Presence] Successfully set user offline: ${userId}`);
    return true;
  } catch (error) {
    console.error(`[Presence] Error setting user offline: ${userId}`, error);
    return false;
  }
};

export const subscribeToUserStatus = (
  userId: string,
  callback: (status: UserStatus | null) => void
): () => void => {
  return subscribeToUserPresence(userId, (presence) => {
    if (!presence) {
      callback(null);
      return;
    }
    
    callback({
      state: presence.state === 'away' || presence.state === 'offline' ? 'offline' : 'online',
      lastActive: presence.lastActive
    });
  });
};

// Force initialize presence, with multiple retries
export const forceInitializePresence = async (userId: string, maxAttempts = 2) => {
  console.log("[Presence] Force-initializing presence for user:", userId);
  
  if (!userId) {
    console.error("[Presence] Cannot initialize presence: No user ID provided");
    return;
  }
  
  // Clean up any existing intervals to prevent duplicates
  if (presenceInterval) clearInterval(presenceInterval);
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  if (forceUpdateInterval) clearInterval(forceUpdateInterval);
  if (connectionQualityInterval) clearInterval(connectionQualityInterval);
  
  // Set up the basic references
  userStatusRef = ref(rtdb, `${STATUS_REF}/${userId}`);
  
  // Simple, fast write to status path without waiting for .info/connected
  try {
    await set(userStatusRef, {
      state: 'online',
      lastActive: Date.now(),
      lastSeen: Date.now(),
      forceInitialized: true,
      clientVersion: '3.1.4',
      serverTime: rtdbServerTimestamp()
    });
    
    // Start monitoring presence in the background with delay
    setTimeout(() => {
      try {
        initializePresence(userId).catch(err => 
          console.error("[Presence] Error in delayed presence initialization:", err)
        );
      } catch (err) {
        console.error("[Presence] Error starting delayed presence initialization:", err);
      }
    }, 3000);
    
    isInitialized = true;
    return true;
  } catch (error) {
    console.error('[Presence] Error in force initialize presence:', error);
    
    // Try one more time with simplified data
    if (maxAttempts > 0) {
      try {
        await set(userStatusRef, { 
          state: 'online', 
          timestamp: Date.now() 
        });
        return true;
      } catch (retryError) {
        console.error('[Presence] Even simplified presence write failed:', retryError);
        return false;
      }
    }
    return false;
  }
};

// Subscribe to multiple users' statuses
export const subscribeToMultipleUserStatuses = (
  userIds: string[],
  callback: (statuses: Record<string, UserStatus | null>) => void
): () => void => {
  return subscribeToMultiplePresences(userIds, (presences) => {
    const statuses: Record<string, UserStatus | null> = {};
    
    Object.entries(presences).forEach(([userId, presence]) => {
      if (!presence) {
        statuses[userId] = null;
      } else {
        statuses[userId] = {
          state: presence.state === 'away' || presence.state === 'offline' ? 'offline' : 'online',
          lastActive: presence.lastActive
        };
      }
    });
    
    callback(statuses);
  });
};

// Subscribe to multiple users' presence statuses
export const subscribeToMultiplePresences = (
  userIds: string[],
  callback: (presences: Record<string, UserPresence | null>) => void
): () => void => {
  const presences: Record<string, UserPresence | null> = {};
  const unsubscribes: (() => void)[] = [];
  
  userIds.forEach((userId) => {
    const unsubscribe = subscribeToUserPresence(userId, (presence) => {
      presences[userId] = presence;
      callback({ ...presences });
    });
    
    unsubscribes.push(unsubscribe);
  });

  return () => unsubscribes.forEach((unsub) => unsub());
};

/**
 * Directly writes to the status path in RTDB 
 * This is a crucial function for ensuring user presence is immediately visible
 */
export const directWriteUserStatus = async (userId: string, state: 'online' | 'offline' = 'online'): Promise<boolean> => {
  if (!userId) {
    console.error("[Presence] Cannot write status: No user ID provided");
    return false;
  }

  try {
    console.log(`[Presence] Directly writing user status: ${userId} -> ${state}`);
    
    // First, update at the root level status path
    const rootStatusRef = ref(rtdb, STATUS_REF);
    const userData = {
      [userId]: {
        state: state,
        lastActive: Date.now(),
        lastSeen: Date.now(),
        directWrite: true,
        timestamp: Date.now(),
        serverTime: rtdbServerTimestamp()
      }
    };
    
    // Using update at root level to not overwrite other users
    await update(rootStatusRef, userData);
    
    // Also update the user-specific path
    const userStatusRef = ref(rtdb, `${STATUS_REF}/${userId}`);
    await update(userStatusRef, {
      state: state,
      lastActive: Date.now(),
      lastSeen: Date.now(),
      directWrite: true,
      timestamp: Date.now(),
      serverTime: rtdbServerTimestamp()
    });
    
    console.log(`[Presence] Successfully wrote ${state} status directly for user: ${userId}`);
    return true;
  } catch (error) {
    console.error(`[Presence] Failed to directly write ${state} status for user:`, userId, error);
    return false;
  }
};

/**
 * EMERGENCY status write function that bypasses all normal flows 
 * and directly writes to the status path with maximum reliability
 */
export const emergencyWriteStatus = async (userId: string): Promise<boolean> => {
  if (!userId) return false;
  
  console.log('[Presence] EMERGENCY direct write for user:', userId);
  
  try {
    // Super simple direct write to user status path
    const statusRef = ref(rtdb, `status/${userId}`);
    await set(statusRef, {
      state: 'online',
      lastActive: Date.now(),
      lastSeen: Date.now(),
      emergency: true,
      timestamp: Date.now()
    });
    
    // Also write to the user-specific connections path
    const connRef = ref(rtdb, `connections/${userId}`);
    const newConnRef = push(connRef);
    await set(newConnRef, {
      timestamp: Date.now(),
      emergency: true,
      active: true
    });
    
    console.log('[Presence] Emergency write completed for:', userId);
    return true;
  } catch (err) {
    console.error('[Presence] Emergency write failed:', err);
    return false;
  }
};

// Export the module functions
export default {
  initializePresence,
  cleanupPresence,
  updateUserOnlineStatus,
  forceInitializePresence,
  directWriteUserStatus,
  emergencyWriteStatus
};
