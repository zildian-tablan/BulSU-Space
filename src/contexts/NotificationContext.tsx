import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from './AuthContext';
import { listenToNotifications, shouldPlaySoundForNotification } from '../services/notificationService';
import type { Notification as AppNotification } from '../services/notificationService';
import { useNotificationSound, NotificationSoundOptions } from '../hooks/useNotificationSound';
import { registerFCMToken, setupForegroundMessageListener } from '../services/fcmTokenService';

interface NotificationContextType {
  notifications: AppNotification[];
  unreadCount: number;
  loading: boolean;
  soundOptions: NotificationSoundOptions;
  updateSoundOptions: (options: Partial<NotificationSoundOptions>) => void;
  testNotificationSound: () => void;
  markAsRead: (notificationId: string) => void;
  playMessageNotification: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const previousNotificationIdsRef = useRef<Set<string>>(new Set());
  const lastShownWebNotifIdRef = useRef<string | null>(null);
  
  // Sound settings with localStorage persistence
  const [soundOptions, setSoundOptions] = useState<NotificationSoundOptions>(() => {
    const saved = localStorage.getItem('notificationSoundSettings');
    return saved ? JSON.parse(saved) : {
      enabled: true,
      volume: 0.5,
      soundType: 'default' as const
    };
  });

  const { playTypedNotificationSound, playMessageSound, testSound } = useNotificationSound(soundOptions);

  // Save sound options to localStorage when they change
  useEffect(() => {
    localStorage.setItem('notificationSoundSettings', JSON.stringify(soundOptions));
  }, [soundOptions]);

  // Helper: request permission for Web Notifications if needed
  const ensureWebNotifPermission = useCallback(async (): Promise<boolean> => {
    if (typeof window === 'undefined' || typeof Notification === 'undefined') return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    try {
      const perm = await Notification.requestPermission();
      return perm === 'granted';
    } catch {
      return false;
    }
  }, []);

  // Helper: show a system notification when tab is hidden
  const showWebNotification = useCallback((n: AppNotification) => {
    if (typeof window === 'undefined' || typeof Notification === 'undefined') return;
    if (!n || !n.id) return;
    if (document.visibilityState === 'visible') return; // Only when not active
    if (Notification.permission !== 'granted') return;

    try {
      const title = 'BulSUSpace';
      const body = n.message || 'You have a new notification';
      const icon = '/images/bulsu-space-logo.png';
      const tag = `notif-${n.id}`; // de-dup

      // Build a navigation URL. For moderation notifications, default to post highlight
      // and only route to flares when explicitly tagged as flare.
      let targetUrl = '/notifications';
      try {
        const relatedId = (n as any).relatedId || (n as any).relatedID || (n.extra && n.extra.relatedId) || null;
        const entityType = n.extra && n.extra.entityType;
        if (relatedId && entityType === 'flare') {
          targetUrl = `/flares/${encodeURIComponent(relatedId)}?deepLink=1`;
        } else if (relatedId && (n.type === 'warn' || n.type === 'takedown')) {
          targetUrl = `/home?highlight=${encodeURIComponent(String(relatedId))}`;
        }
      } catch (e) {
        // ignore
      }

      const notif = new Notification(title, {
        body,
        icon,
        // Some browsers support badge for monochrome icon in status area
        badge: '/images/bulsu-space-logo.png',
        tag,
        silent: true,
        data: { url: targetUrl }
      });

      notif.onclick = (event: any) => {
        try {
          window.focus();
          const url = event?.target?.data?.url || (event?.target && event.target.data && event.target.data.url) || targetUrl;
          // Use assign so history reflects navigation; this will load FlaresPage which reads the URL
          if (url && window.location.pathname !== url) {
            window.location.assign(url);
          } else if (url) {
            // If already on same path, still try to reload so FlaresPage can react to param
            window.location.reload();
          }
        } catch {}
      };

      lastShownWebNotifIdRef.current = n.id;
    } catch (e) {
      // Best-effort only
      // eslint-disable-next-line no-console
      console.warn('Failed to show web notification', e);
    }
  }, []);

  // Listen for service worker foreground broadcasts (e.g., when SW receives a push and
  // the page is active it will postMessage channel 'fcm_foreground'). Show a small
  // system notification that navigates to the provided URL on click (if permission).
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    const handleSWMessage = (ev: MessageEvent) => {
      try {
        const payload = ev.data;
        if (!payload || payload.channel !== 'fcm_foreground') return;
        const data = payload.data || {};
        // Determine URL: prefer explicit url, otherwise fallback to data.url
        const url = data.url || (data.data && data.data.url) || '/notifications';

        // Only show when tab is not visible (to avoid duplicates)
        if (document.visibilityState === 'visible') return;

        if (Notification.permission === 'granted') {
          const title = data.title || 'BulSUSpace';
          const body = data.body || '';
          const tag = `fcm-fw-${Date.now()}-${Math.random().toString(36).slice(2)}`;
          const notif = new Notification(title, { body, tag, data: { url }, icon: '/images/bulsu-space-logo.png', badge: '/images/bulsu-space-logo.png' });
          notif.onclick = (e: any) => {
            try {
              window.focus();
              const dest = e?.target?.data?.url || url;
              if (dest && window.location.pathname !== dest) {
                window.location.assign(dest);
              } else if (dest) {
                window.location.reload();
              }
            } catch {}
          };
        }
      } catch (e) {
        // ignore
      }
    };

    navigator.serviceWorker.addEventListener('message', handleSWMessage as any);
    return () => {
      try { navigator.serviceWorker.removeEventListener('message', handleSWMessage as any); } catch {}
    };
  }, []);

  // Listen for explicit navigation messages from the service worker
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    const handleNavigateMessage = (ev: MessageEvent) => {
      try {
        const payload = ev.data;
        if (!payload || payload.channel !== 'fcm_navigate') return;
        const url = payload.url || (payload.data && payload.data.url) || '/notifications';

        // Navigate the client to the requested URL
        try {
          if (url && window.location.pathname !== url) {
            window.location.assign(url);
          } else if (url) {
            // Force reload to ensure FlaresPage reacts to params
            window.location.reload();
          }
        } catch (e) {
          console.error('[NotificationContext] Failed to navigate to SW requested URL', e);
        }
      } catch (e) {
        // ignore
      }
    };

    navigator.serviceWorker.addEventListener('message', handleNavigateMessage as any);
    return () => {
      try { navigator.serviceWorker.removeEventListener('message', handleNavigateMessage as any); } catch {}
    };
  }, []);

  // Listen to notifications
  useEffect(() => {
    if (!currentUser) {
      setNotifications([]);
      setLoading(false);
      previousNotificationIdsRef.current = new Set();
      lastShownWebNotifIdRef.current = null;
      return;
    }

    setLoading(true);
    const unsubscribe = listenToNotifications(currentUser.id, (fetchedNotifications) => {
      // Check for new notifications by comparing with previous ones
      const currentNotificationIds = new Set(
        fetchedNotifications
          .map(n => n.id)
          .filter((id): id is string => id !== undefined)
      );
      const newNotifications = fetchedNotifications.filter(notification => 
        notification.id && 
        !previousNotificationIdsRef.current.has(notification.id) &&
        !notification.read
      );      // Controlled sound playing for new notifications (only for genuinely new ones)
      if (previousNotificationIdsRef.current.size > 0 && newNotifications.length > 0) {
        // Only play sounds for the most recent new notification
        const mostRecentNew = newNotifications[0];
        
        console.log('Notification detected:', { 
          type: mostRecentNew.type, 
          id: mostRecentNew.id, 
          message: mostRecentNew.message,
          timestamp: mostRecentNew.timestamp?.toDate?.() || 'unknown',
          age: mostRecentNew.timestamp ? `${(Date.now() - mostRecentNew.timestamp.toMillis())/1000}s ago` : 'unknown'
        });
        
        // Use our helper function to determine if we should play a sound
        if (mostRecentNew.type && shouldPlaySoundForNotification(mostRecentNew)) {
          // Use dedicated message sound for message notifications
          if (mostRecentNew.type === 'message') {
            console.log('Playing MESSAGE SOUND via playMessageSound()');
            playMessageSound();
          } else {
            console.log(`Playing ${mostRecentNew.type} sound via playTypedNotificationSound()`);
            playTypedNotificationSound(mostRecentNew.type);
          }
        } else {
          console.log('Skipping sound for notification (already played or too old)');
        }

        // Also show a system notification when the tab is hidden/minimized
        // Avoid duplicate popups for the same id
        (async () => {
          if (document.visibilityState !== 'visible') {
            const ok = await ensureWebNotifPermission();
            if (ok && lastShownWebNotifIdRef.current !== mostRecentNew.id) {
              showWebNotification(mostRecentNew);
            }
          }
        })();
      }

      setNotifications(fetchedNotifications);
      previousNotificationIdsRef.current = currentNotificationIds;
      setLoading(false);
    });    return () => unsubscribe();
  }, [currentUser, playTypedNotificationSound, playMessageSound
    , ensureWebNotifPermission, showWebNotification
  ]);

  // Register FCM token when user logs in
  useEffect(() => {
    if (!currentUser) return;

    // Register FCM token for push notifications
    registerFCMToken(currentUser.id).catch(err => 
      console.error('[FCM] Failed to register token:', err)
    );

    // Set up foreground message listener
    const unsubscribe = setupForegroundMessageListener((payload) => {
      console.log('[FCM] Foreground message:', payload);
      // You can show a custom in-app notification here if needed
      // The notification will already be in Firestore and picked up by listenToNotifications
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [currentUser]);

  // Update sound options
  const updateSoundOptions = useCallback((newOptions: Partial<NotificationSoundOptions>) => {
    setSoundOptions(prev => ({ ...prev, ...newOptions }));
  }, []);

  // Test notification sound
  const testNotificationSound = useCallback(() => {
    testSound();
  }, [testSound]);

  // Mark notification as read (local state only)
  const markAsRead = useCallback((notificationId: string) => {
    // This would typically call the notification service
    // For now, we'll just update the local state
    setNotifications(prev => 
      prev.map(notification => 
        notification.id === notificationId 
          ? { ...notification, read: true }
          : notification
      )
    );
  }, []);

  const unreadCount = notifications.filter(n => !n.read).length;
  // Play message notification directly (bypasses throttling in regular notifications)
  const playMessageNotification = useCallback(() => {
    console.log('🔊 playMessageNotification called');
    if (soundOptions.enabled) {
      console.log('✅ Sound enabled, calling playMessageSound()');
      try {
        // Use both our standard sound method
        playMessageSound();
        
        // If in development mode, log additional details
        if (process.env.NODE_ENV === 'development') {
          console.log('Sound settings:', soundOptions);
        }
      } catch (error) {
        console.error('Failed to play message sound through standard method:', error);
        
        // Fallback method using simple Audio API
        try {
          const audio = new Audio();
          audio.src = 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tAwAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAAElgC1tbW1tbW1tbW1tbW1tbW1tbW1tbW1tbW1tbW1tbW1tbW1tbW1tbW1tbW1tbW1tbW1//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAABJa/PG7aAAAAAAAAAAAAAAAAAAAA';
          audio.volume = soundOptions.volume;
          audio.play().catch(err => console.error('Audio fallback also failed:', err));
          console.log('✅ Used emergency audio element fallback');
        } catch (audioErr) {
          console.error('💥 All sound methods failed:', audioErr);
        }
      }
    } else {
      console.log('❌ Sound disabled in settings');
    }
  }, [soundOptions.enabled, soundOptions.volume, playMessageSound]);
    // Initialize message notification handling
  useEffect(() => {
    if (currentUser) {
      console.log('📱 Message notification handler initialized');
      // No automatic test sound to prevent random sounds
    }
  }, [currentUser]);

  const value: NotificationContextType = {
    notifications,
    unreadCount,
    loading,
    soundOptions,
    updateSoundOptions,
    testNotificationSound,
    markAsRead,
    playMessageNotification
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotificationContext = () => {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotificationContext must be used within a NotificationProvider');
  }
  return context;
};
