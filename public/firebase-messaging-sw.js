// Minimal noop Firebase Messaging service worker
// This file exists to satisfy requests from clients expecting /firebase-messaging-sw.js
// No FCM logic is implemented; it only listens for basic lifecycle events.
self.addEventListener('install', event => {
  // Activate immediately
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

// Utility: determine if any window client is focused/visible
async function anyClientActive() {
  try {
    const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // Treat ANY open window client as active to avoid duplicates when the app is open
    return clientList.length > 0;
  } catch (e) {
    return false;
  }
}

// Utility: broadcast to all clients
async function broadcastToClients(channel, data) {
  try {
    const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    clientList.forEach(c => {
      try { c.postMessage && c.postMessage({ channel, data }); } catch (e) {}
    });
  } catch (e) {}
}

// Optional: handle push events with BulSUSpace branding if any platform sends them
// Handle generic Push events cautiously: suppress browser "updated in background" notices
self.addEventListener('push', event => {
  try {
    if (!event.data) return; // No payload → ignore to avoid generic browser notification
    const data = event.data.json();

    const hasContent =
      !!(data && (data.title || data.body || (data.notification && (data.notification.title || data.notification.body))));
    if (!hasContent) return; // Missing useful content → ignore

    const title = data.title || (data.notification && data.notification.title) || 'BulSUSpace';
    const body = data.body || (data.notification && data.notification.body) || '';
    const icon = (data.icon || (data.notification && data.notification.icon)) || '/images/bulsu-space-logo.png';
    const badge = (data.badge || (data.notification && data.notification.badge)) || '/images/bulsu-space-logo.png';
    const url = (data.click_action || (data.data && data.data.url)) || '/notifications';
    const vibrate = data.vibrate || [100, 50, 100];
    const uniqueTag = (data.data && data.data.notificationId) || (data.tag || (data.notification && data.notification.tag)) || `bulsuspace-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const options = {
      body,
      icon,
      badge,
      tag: uniqueTag,
      silent: false,
      renotify: true,
      requireInteraction: !!data.requireInteraction,
      vibrate,
      data: { url }
    };
    event.waitUntil((async () => {
      // If a client is active (focused/visible), don't show system notification; broadcast instead
      if (await anyClientActive()) {
        await broadcastToClients('fcm_foreground', { title, body, url });
        return;
      }

      // Best-effort: close existing with same tag to avoid stacking
      try {
        const existing = await self.registration.getNotifications({ tag: uniqueTag });
        existing.forEach(n => n.close());
      } catch (e) { /* ignore */ }

      return self.registration.showNotification(title, options);
    })());
  } catch (e) {
    // Ignore malformed push
  }
});

// Handle notificationclick gracefully
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = (event.notification && event.notification.data && event.notification.data.url) || '/notifications';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientsArr => {
      const client = clientsArr.find(c => c.visibilityState === 'visible' || c.focused || true);
      if (client) {
        // Focus the client and ask it to navigate via postMessage. This is more reliable
        // than client.navigate in some browsers.
        try {
          client.focus && client.focus();
        } catch (e) {}

        try {
          client.postMessage && client.postMessage({ channel: 'fcm_navigate', url: targetUrl });
        } catch (e) {}

        // Also attempt client.navigate as a best-effort
        try { client.navigate && client.navigate(targetUrl); } catch (e) {}
        return;
      }
      // No client found: open a new window/tab
      return self.clients.openWindow(targetUrl);
    })
  );
});

// ------------------------------------------------------------
// Firebase Messaging (background) using compat SDK
// 
// ⚠️ IMPORTANT: Service workers cannot access environment variables.
// Before deploying, you MUST replace the placeholder values below with
// your actual Firebase configuration from the Firebase Console.
// 
// To get your config:
// 1. Go to Firebase Console > Project Settings > General
// 2. Under "Your apps", find your web app
// 3. Copy the firebaseConfig values
// ------------------------------------------------------------
try {
  importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
  importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

  // Initialize Firebase in service worker
  // TODO: Replace these placeholder values with your actual Firebase config before deployment
  firebase.initializeApp({
    apiKey: "YOUR_FIREBASE_API_KEY",
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    databaseURL: "https://YOUR_PROJECT_ID-default-rtdb.firebaseio.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT_ID.firebasestorage.app",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID",
  });

  const messaging = firebase.messaging();

  // Handle background messages delivered via FCM
  messaging.onBackgroundMessage((payload) => {
    console.log('[SW] Background message received:', payload);
    
    // Normalize fields from payload
    const title = (payload.notification && payload.notification.title) || 'BulSUSpace';
    const body = (payload.notification && payload.notification.body) || 'You have a new notification';
    const icon = (payload.notification && payload.notification.icon) || '/images/bulsu-space-logo.png';
    const badge = (payload.notification && payload.notification.badge) || '/images/bulsu-space-logo.png';
    const url = (payload.data && payload.data.url) || '/notifications';

    const uniqueTag = (payload.data && payload.data.notificationId) || (payload.notification && payload.notification.tag) || `bulsuspace-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const options = {
      body,
      icon,
      badge,
      tag: uniqueTag,
      silent: false,
      renotify: true,
      data: { url }
    };
    return (async () => {
      if (await anyClientActive()) {
        await broadcastToClients('fcm_foreground', { title, body, url });
        return;
      }

      try {
        const existing = await self.registration.getNotifications({ tag: uniqueTag });
        existing.forEach(n => n.close());
      } catch (e) { /* ignore */ }

      return self.registration.showNotification(title, options);
    })();
  });
  
  console.log('[SW] Firebase Messaging initialized successfully');
} catch (e) {
  console.error('[SW] Failed to initialize Firebase Messaging:', e);
}
