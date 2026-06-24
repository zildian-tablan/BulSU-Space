// Debug script to monitor presence function calls
import { initializePresence as originalInitialize, 
         updateUserOnlineStatus as originalUpdate,
         cleanupPresence as originalCleanup } from './src/services/presenceService';

// Counter for function calls
const callCounts = {
  initialize: 0,
  update: 0,
  cleanup: 0
};

// Timestamps for last calls
const lastCallTime = {
  initialize: null,
  update: null,
  cleanup: null
};

// Keep track of parameters
const lastParameters = {
  initialize: null,
  update: null,
  cleanup: null
};

// Stack traces for calls
const lastStackTraces = {
  initialize: null,
  update: null, 
  cleanup: null
};

// Helper to get stack trace
function getStackTrace() {
  const obj = {};
  Error.captureStackTrace(obj, getStackTrace);
  return obj.stack;
}

// Wrap initialize function
export async function initializePresence(userId) {
  const stack = getStackTrace();
  console.log(`[MONITOR] initializePresence called with userId: ${userId}`);
  console.log(`[MONITOR] Stack trace for initializePresence:`, stack);
  
  callCounts.initialize++;
  lastCallTime.initialize = new Date().toISOString();
  lastParameters.initialize = userId;
  lastStackTraces.initialize = stack;
  
  try {
    const result = await originalInitialize(userId);
    console.log(`[MONITOR] initializePresence completed successfully for ${userId}`);
    return result;
  } catch (error) {
    console.error(`[MONITOR] initializePresence failed for ${userId}:`, error);
    throw error;
  }
}

// Wrap update function
export async function updateUserOnlineStatus(userId) {
  const stack = getStackTrace();
  console.log(`[MONITOR] updateUserOnlineStatus called with userId: ${userId}`);
  console.log(`[MONITOR] Stack trace for updateUserOnlineStatus:`, stack);
  
  callCounts.update++;
  lastCallTime.update = new Date().toISOString();
  lastParameters.update = userId;
  lastStackTraces.update = stack;
  
  try {
    const result = await originalUpdate(userId);
    console.log(`[MONITOR] updateUserOnlineStatus completed successfully for ${userId}`);
    return result;
  } catch (error) {
    console.error(`[MONITOR] updateUserOnlineStatus failed for ${userId}:`, error);
    throw error;
  }
}

// Wrap cleanup function
export async function cleanupPresence() {
  const stack = getStackTrace();
  console.log(`[MONITOR] cleanupPresence called`);
  console.log(`[MONITOR] Stack trace for cleanupPresence:`, stack);
  
  callCounts.cleanup++;
  lastCallTime.cleanup = new Date().toISOString();
  lastStackTraces.cleanup = stack;
  
  try {
    const result = await originalCleanup();
    console.log(`[MONITOR] cleanupPresence completed successfully`);
    return result;
  } catch (error) {
    console.error(`[MONITOR] cleanupPresence failed:`, error);
    throw error;
  }
}

// Function to get statistics
export function getPresenceStats() {
  return {
    callCounts,
    lastCallTime,
    lastParameters
  };
}

console.log('[MONITOR] Presence function monitoring initialized');
console.log('[MONITOR] Ready to track initializePresence, updateUserOnlineStatus, and cleanupPresence calls');
