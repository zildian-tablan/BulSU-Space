/**
 * Login History Test Utility
 * 
 * This file provides a utility function to test the login history feature.
 * It simulates a login event and checks if it's properly recorded in Firestore.
 */

import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { SecurityLogger } from '../utils/securityUtils';

/**
 * Tests the login history feature by:
 * 1. Logging out the current user
 * 2. Logging back in with the provided email and password
 * 3. Checking if the login event was recorded in Firestore
 * 
 * @param email User's email
 * @param password User's password
 */
export const testLoginHistoryFeature = async (email: string, password: string): Promise<{success: boolean, message: string}> => {
  try {
    // Step 1: Log out current user
    const auth = getAuth();
    await auth.signOut();
    console.log('Successfully logged out');
    
    // Step 2: Log back in
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    console.log('Successfully logged back in');
    
    // Manually trigger a login history entry
    SecurityLogger.logSecurityEvent('login_success', { email });
    console.log('Triggered login history event');
    
    // Wait a moment for Firestore to process
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Step 3: Check if login was recorded
    const db = getFirestore();
    const user = userCredential.user;
    
    if (!user) {
      return { success: false, message: 'Failed to get current user after login' };
    }
    
    const loginHistoryRef = collection(db, 'users', user.uid, 'login_history');
    const q = query(loginHistoryRef, orderBy('timestamp', 'desc'), limit(1));
    const loginSnapshot = await getDocs(q);
    
    if (loginSnapshot.empty) {
      return { success: false, message: 'No login history records found after test login' };
    }
    
    // Get the most recent login entry
    const latestLogin = loginSnapshot.docs[0].data();
    const loginTime = latestLogin.timestamp?.toDate ? latestLogin.timestamp.toDate() : new Date();
    
    // Check if login was recorded within the last 5 minutes
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    if (loginTime < fiveMinutesAgo) {
      return { 
        success: false, 
        message: `Latest login history entry is too old (${loginTime.toLocaleString()}). Test failed.`
      };
    }
    
    return { 
      success: true, 
      message: `Login history feature is working! Latest login recorded at ${loginTime.toLocaleString()}`
    };
    
  } catch (error: any) {
    return { 
      success: false, 
      message: `Error testing login history feature: ${error.message || 'Unknown error'}`
    };
  }
};
