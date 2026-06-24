import { getToken, deleteToken, onMessage } from 'firebase/messaging';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { messaging } from '../firebase/config';
import { db } from '../firebase/config';

const VAPID_KEY = process.env.REACT_APP_FIREBASE_MESSAGING_VAPID_KEY;

/**
 * Register FCM token for the current user
 * Requests notification permission and stores token in Firestore
 */
export async function registerFCMToken(userId: string): Promise<string | null> {
  try {
    if (!messaging) {
      console.warn('[FCM] Messaging not supported in this environment');
      return null;
    }

    if (!VAPID_KEY) {
      console.error('[FCM] VAPID key not configured. Add REACT_APP_FIREBASE_MESSAGING_VAPID_KEY to .env');
      return null;
    }

    // Request notification permission first
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.log('[FCM] Notification permission denied');
      return null;
    }

    // Ensure service worker is registered at the expected path
    let swReg: ServiceWorkerRegistration | undefined;
    if ('serviceWorker' in navigator) {
      try {
        // Ensure registration exists
        const existingRegistration = await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js');
        if (!existingRegistration) {
          await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' });
          console.log('[FCM] Service worker registered');
        } else {
          console.log('[FCM] Service worker already registered');
        }

        // Wait for an ACTIVE registration to avoid pushManager being undefined
        const activeRegistration = await navigator.serviceWorker.ready;
        swReg = activeRegistration;

        // Extra safety: verify pushManager exists
        if (!(swReg as any)?.pushManager) {
          console.warn('[FCM] Service worker ready but pushManager missing. Browser may not support Push, or context is not secure.');
        }
      } catch (e) {
        console.error('[FCM] Failed to ensure service worker readiness:', e);
        // Continue without service worker - foreground notifications will still work
      }
    }

    // Get FCM token
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      // Passing the active registration ensures getToken can access pushManager
      serviceWorkerRegistration: swReg,
    });
    
    if (token) {
      // Store token in Firestore
      await setDoc(doc(db, 'fcmTokens', userId), {
        token,
        updatedAt: new Date(),
        platform: 'web',
        userAgent: navigator.userAgent
      });
      
      console.log('[FCM] Token registered successfully');
      return token;
    } else {
      console.warn('[FCM] No registration token available');
      return null;
    }
  } catch (error) {
    console.error('[FCM] Error registering token:', error);
    return null;
  }
}

/**
 * Unregister FCM token for the current user
 * Deletes token from FCM and removes from Firestore
 */
export async function unregisterFCMToken(userId: string): Promise<void> {
  try {
    if (!messaging) {
      console.warn('[FCM] Messaging not supported');
      return;
    }

    await deleteToken(messaging);
    await deleteDoc(doc(db, 'fcmTokens', userId));
    console.log('[FCM] Token unregistered successfully');
  } catch (error) {
    console.error('[FCM] Error unregistering token:', error);
  }
}

/**
 * Set up foreground message listener
 * This handles messages when the app is open and visible
 */
export function setupForegroundMessageListener(callback: (payload: any) => void): (() => void) | null {
  if (!messaging) {
    console.warn('[FCM] Messaging not supported');
    return null;
  }

  const unsubscribe = onMessage(messaging, (payload) => {
    console.log('[FCM] Foreground message received:', payload);
    callback(payload);
  });

  return unsubscribe;
}
