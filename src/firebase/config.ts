import { initializeApp, FirebaseApp } from "firebase/app";
import { getAuth, setPersistence, browserLocalPersistence } from "firebase/auth";
import { initializeFirestore, connectFirestoreEmulator, enableMultiTabIndexedDbPersistence } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAnalytics, isSupported } from "firebase/analytics";
import { getDatabase } from "firebase/database";
import { getMessaging, isSupported as isMessagingSupported } from "firebase/messaging";

import { AuthInstanceManager } from './auth-instance-manager';
import { isLocalhost } from "./cors-proxy";
import { getFunctions } from "firebase/functions";

/**
 * Validates required environment variables and logs warnings if any are missing
 * @returns boolean indicating if all required variables are present
 */
const validateEnvVariables = (): boolean => {
  const requiredVars = [
    'REACT_APP_FIREBASE_API_KEY',
    'REACT_APP_FIREBASE_AUTH_DOMAIN',
    'REACT_APP_FIREBASE_PROJECT_ID',
    'REACT_APP_FIREBASE_STORAGE_BUCKET',
  // (No messaging sender ID required)
    'REACT_APP_FIREBASE_APP_ID'
  ];
  
  let allValid = true;
  
  requiredVars.forEach(varName => {
    if (!process.env[varName]) {
      console.warn(`Missing environment variable: ${varName}`);
      allValid = false;
    }
  });
  
  return allValid;
};

// Perform validation check
const envValid = validateEnvVariables();
// Your web app's Firebase configuration
// Get values from environment variables for security
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.REACT_APP_FIREBASE_DATABASE_URL || "https://bulsuspace-default-rtdb.firebaseio.com/",
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
  measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID
};

// Initialize Firebase
let app: FirebaseApp;
try {
  app = initializeApp(firebaseConfig);
  if (!envValid) {
    console.warn("Firebase initialized with incomplete configuration. Some features may not work correctly.");
  }
} catch (error) {
  console.error("Failed to initialize Firebase:", error);
  // Create a minimal placeholder config for graceful degradation
  const fallbackConfig = {
    apiKey: process.env.REACT_APP_FIREBASE_API_KEY || "placeholder-api-key",
    projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID || "placeholder-project",
    appId: process.env.REACT_APP_FIREBASE_APP_ID || "placeholder-app-id"
  };
  
  console.warn("Using fallback Firebase configuration to prevent application crash");
  app = initializeApp(fallbackConfig);
}

// Initialize Auth
export const auth = getAuth(app);

// Register this as the primary auth instance
AuthInstanceManager.registerPrimaryAuth(auth);



// Initialize Firestore with networking settings that play nicer behind proxies/adblockers
export const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
});

// Enable offline persistence
enableMultiTabIndexedDbPersistence(db)
  .then(() => {
    console.log('Firestore persistence enabled');
  })
  .catch((err) => {
    if (err.code === 'failed-precondition') {
      console.warn('Firestore persistence could not be enabled. Multiple tabs open?');
    } else if (err.code === 'unimplemented') {
      console.warn('Browser does not support IndexedDB persistence');
    } else {
      console.error('Error enabling persistence:', err);
    }
  });

// Initialize Storage with explicit bucket
export const storage = getStorage(app, "gs://bulsuspace.firebasestorage.app");

// Initialize Realtime Database with explicit confirmation
export const rtdb = getDatabase(app);
export const rtdb2 = getDatabase(app);

// Log RTDB initialization for debugging
console.log('[Firebase Config] RTDB initialized with URL:', 
  firebaseConfig.databaseURL || rtdb.app.options.databaseURL || 
  'https://bulsuspace-default-rtdb.firebaseio.com/');

// Default to session persistence, but check for "remember me" preference
// This will respect user choice about staying signed in

// Remove shouldRemember and rememberMe logic

// Set persistence based on user preference
setPersistence(auth, browserLocalPersistence)
  .then(() => {
    console.log(`Auth persistence set to local (only forget after tab/browser close)`);
    
    // Track token refresh failures to avoid immediate logouts
    let tokenRefreshFailCount = 0;
    const MAX_REFRESH_FAILURES = 3;
    
    // Set up automatic session validation
    setInterval(async () => {
      const user = auth.currentUser;
      if (user) {
        // Check if a protected auth operation is in progress
        if (AuthInstanceManager.isAuthOperationInProgress()) {
          console.log('Protected auth operation in progress, delaying token refresh');
          return;
        }
        
        // Force token refresh every 30 minutes for security
        try {
          await user.getIdToken(true);
          console.log('Token refresh successful');
          // Reset failure count after a successful refresh
          tokenRefreshFailCount = 0;
        } catch (error: any) {
          console.warn('Token refresh failed:', error);
          tokenRefreshFailCount++;
          
          console.log(`Token refresh failure count: ${tokenRefreshFailCount}/${MAX_REFRESH_FAILURES}`);
          
          // Only force sign out after multiple consecutive failures
          if (error?.code === 'auth/user-token-expired' && 
              !AuthInstanceManager.isAuthOperationInProgress() &&
              tokenRefreshFailCount >= MAX_REFRESH_FAILURES) {
            console.warn(`Token refresh failed ${MAX_REFRESH_FAILURES} times, forcing re-authentication`);
            // Force re-authentication
            auth.signOut();
          }
        }
      }
    }, 30 * 60 * 1000); // 30 minutes
  })
  .then(() => {
    console.log('Auth persistence enabled');
  })
  .catch((error) => {
    console.error('Error enabling auth persistence:', error);
  });

// Initialize analytics conditionally
export const analytics = isSupported().then(yes => yes ? getAnalytics(app) : null);

// Initialize Firebase Cloud Messaging (FCM) conditionally
// Messaging is only supported in browsers with service worker support
let messagingInstance: ReturnType<typeof getMessaging> | null = null;
try {
  if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
    messagingInstance = getMessaging(app);
    console.log('[Firebase Config] FCM initialized');
  } else {
    console.warn('[Firebase Config] FCM not supported in this environment');
  }
} catch (error) {
  console.warn('[Firebase Config] Failed to initialize FCM:', error);
}

export const functionsInstance = getFunctions(app);
   

export const messaging = messagingInstance;

export default app;
