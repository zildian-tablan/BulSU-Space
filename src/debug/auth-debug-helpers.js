// Debug patch for AuthContext to diagnose presence initialization issues
// To use this, import the functions from this file into the AuthContext
// and replace the original functions with these wrapped versions

import { initializePresence as originalInitialize, 
         updateUserOnlineStatus as originalUpdate } from '../services/presenceService';

// Enhanced versions with detailed logging
export async function initializePresence(userId) {
  console.log('[AuthDebug] initializePresence called with userId:', userId);
  console.log('[AuthDebug] Current time:', new Date().toISOString());
  console.log('[AuthDebug] Stack trace:', new Error().stack);
  
  try {
    const result = await originalInitialize(userId);
    console.log('[AuthDebug] initializePresence completed successfully');
    return result;
  } catch (error) {
    console.error('[AuthDebug] initializePresence failed:', error);
    console.error('[AuthDebug] Error details:', {
      message: error.message,
      code: error.code,
      stack: error.stack
    });
    throw error;
  }
}

export async function updateUserOnlineStatus(userId) {
  console.log('[AuthDebug] updateUserOnlineStatus called with userId:', userId);
  console.log('[AuthDebug] Current time:', new Date().toISOString());
  
  try {
    const result = await originalUpdate(userId);
    console.log('[AuthDebug] updateUserOnlineStatus completed successfully');
    return result;
  } catch (error) {
    console.error('[AuthDebug] updateUserOnlineStatus failed:', error);
    console.error('[AuthDebug] Error details:', {
      message: error.message,
      code: error.code,
      stack: error.stack
    });
    throw error;
  }
}

// Function to insert at the beginning of an async function to log its execution
export function logAsyncFunction(functionName, ...args) {
  console.log(`[AuthDebug] ${functionName} started with args:`, JSON.stringify(args));
  console.log(`[AuthDebug] ${functionName} time:`, new Date().toISOString());
  return async (result) => {
    console.log(`[AuthDebug] ${functionName} completed with result:`, result);
    return result;
  };
}
