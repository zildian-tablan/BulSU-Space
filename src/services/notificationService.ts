import { collection, query, where, orderBy, onSnapshot, addDoc, updateDoc, doc, getDocs, writeBatch, serverTimestamp, limit } from 'firebase/firestore';
import { db } from '../firebase/config';

export interface Notification {
  id?: string;
  userId: string;
  // Added 'warn' and 'takedown' types for admin/super-admin actions
  type: 'reaction' | 'comment' | 'friend_request' | 'friend_post' | 'announcement' | 'space_post' | 'message' | 'warn' | 'takedown' | 'message_request' | 'space_invite' | 'report_alert';
  message: string;
  relatedId?: string; // postId, userId, etc.
  extra?: any;
  timestamp: any;
  read: boolean;
}

const NOTIFICATIONS_COLLECTION = 'notifications';
const MAX_NOTIFICATIONS = 200; // cap real-time and initial fetch for performance

// Track notifications we've already played sounds for
const soundPlayedForNotification = new Set<string>();

// Load previously played notification sounds from localStorage
function loadPlayedSounds() {
  try {
    const saved = localStorage.getItem('played_notification_sounds');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        // Add all previously played sounds to our set
        parsed.forEach(id => {
          // Only load notifications from the last 24 hours (to avoid infinite growth)
          const [notificationId, timestamp] = id.split('|');
          if (timestamp && Date.now() - parseInt(timestamp) < 86400000) { // 24 hours
            soundPlayedForNotification.add(notificationId);
          }
        });
      }
    }
  } catch (e) {
    console.error('Error loading played notification sounds', e);
  }
}

// Save played sounds to localStorage
function savePlayedSounds() {
  try {
    // Convert the set to an array with timestamps
    const withTimestamps = Array.from(soundPlayedForNotification).map(id => {
      // Add current timestamp if not already present
      if (id.includes('|')) return id;
      return `${id}|${Date.now()}`;
    });
    
    // Only save the most recent 100 notifications to avoid localStorage bloat
    const recent = withTimestamps.slice(-100);
    localStorage.setItem('played_notification_sounds', JSON.stringify(recent));
  } catch (e) {
    console.error('Error saving played notification sounds', e);
  }
}

// Initialize on module load
loadPlayedSounds();

// Save periodically
setInterval(savePlayedSounds, 30000); // Every 30 seconds

// Helper to check if we should play sound for a notification
export function shouldPlaySoundForNotification(notification: Notification): boolean {
  if (!notification.id) return false;
  
  // If we've already played a sound for this notification, don't play it again
  if (soundPlayedForNotification.has(notification.id)) {
    return false;
  }
  
  // For messages, check timestamp to ensure it's recent
  if (notification.type === 'message') {
    if (!notification.timestamp) return false;
    
    // Only play sounds for messages less than 10 seconds old
    const age = Date.now() - notification.timestamp.toMillis();
    if (age > 10000) {
      return false;
    }
  }
  
  // Mark this notification as having had its sound played
  soundPlayedForNotification.add(notification.id);
  return true;
}

// Add a notification
export async function addNotification(notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) {
  await addDoc(collection(db, NOTIFICATIONS_COLLECTION), {
    ...notification,
    timestamp: serverTimestamp(),
    clientTimestamp: Date.now(),
    read: false,
  });
}

// Create or update a grouped notification for reactions/comments so multiple actors are merged
export async function upsertGroupedNotification(params: {
  userId: string;
  type: 'reaction' | 'comment' | 'space_post' | 'friend_post' | 'announcement' | 'message' | string;
  relatedId?: string;
  actorId: string;
  actorName: string;
  excerpt?: string; // optional comment text or post excerpt
}) {
  const { userId, type, relatedId, actorId, actorName, excerpt } = params;

  // Find the most recent existing grouped notification for this user/type.
  // We purposely do NOT restrict by relatedId in the query because some older
  // notifications may have been created without relatedId. Instead we fetch
  // recent notifications for this user/type and pick the best candidate client-side:
  // 1) prefer a doc whose relatedId === relatedId (exact match),
  // 2) otherwise prefer a doc with no relatedId or empty relatedId.
  const q = query(
    collection(db, NOTIFICATIONS_COLLECTION),
    where('userId', '==', userId),
    where('type', '==', type),
    orderBy('timestamp', 'desc')
  );

  const snapshot = await getDocs(q);
  let targetDoc = undefined as any;
  if (!snapshot.empty) {
    // Try to find exact match first
    for (const docSnap of snapshot.docs) {
      const data = docSnap.data() as any;
      if (data.relatedId === relatedId) {
        targetDoc = docSnap;
        break;
      }
    }
    // If no exact match, find a recent notification with missing/empty relatedId
    if (!targetDoc) {
      for (const docSnap of snapshot.docs) {
        const data = docSnap.data() as any;
        if (!data.relatedId) { // undefined, null, or empty string
          targetDoc = docSnap;
          break;
        }
      }
    }
    // As a last resort, pick the most recent doc
    if (!targetDoc) targetDoc = snapshot.docs[0];
  }

  if (!targetDoc) {
    // No existing grouped notification: create one
    const actors = [{ id: actorId, name: actorName }];
    const actorCount = 1;
    const baseMessage = type === 'reaction'
      ? `${actorName} reacted to your post`
      : type === 'comment'
        ? `${actorName} commented on your post${excerpt ? `: "${excerpt}"` : ''}`
        : `${actorName} performed an action`;

    await addDoc(collection(db, NOTIFICATIONS_COLLECTION), {
      userId,
      type,
      message: baseMessage,
      relatedId: relatedId || '',
  extra: { actors, actorCount, latestActor: { id: actorId, name: actorName }, excerpt: excerpt || null },
  timestamp: serverTimestamp(),
  clientTimestamp: Date.now(),
      read: false,
    });
    return;
  }

  // Update existing grouped notification
  const docRef = doc(db, NOTIFICATIONS_COLLECTION, targetDoc.id);
  // Deduplicate: delete other notification documents for this user/type that refer to the same relatedId
  try {
    const duplicates = snapshot.docs.filter(d => d.id !== targetDoc.id).filter(d => {
      const ddata = d.data() as any;
      if (relatedId) return ddata.relatedId === relatedId;
      return !ddata.relatedId; // both missing/empty
    });
    if (duplicates.length > 0) {
      const batch = writeBatch(db);
      duplicates.forEach(d => batch.delete(doc(db, NOTIFICATIONS_COLLECTION, d.id)));
      await batch.commit();
      console.log('[upsertGroupedNotification] Removed', duplicates.length, 'duplicate notification(s) for user', userId, 'type', type, 'relatedId', relatedId);
    }
  } catch (dedupeErr) {
    console.error('[upsertGroupedNotification] Error removing duplicate notifications:', dedupeErr);
  }
  const data = targetDoc.data() as Notification;
  const extra = (data.extra && typeof data.extra === 'object') ? data.extra : {};
  const actors: Array<{ id: string; name: string }> = Array.isArray(extra.actors) ? extra.actors : [];

  // If actor already recorded, move them to front; otherwise add to front
  const already = actors.find(a => a.id === actorId);
  if (!already) {
    actors.unshift({ id: actorId, name: actorName });
  } else {
    // Move existing actor to front
    const filtered = actors.filter(a => a.id !== actorId);
    actors.length = 0;
    actors.push({ id: actorId, name: actorName }, ...filtered);
  }

  // Keep actor list reasonably small
  const MAX_ACTORS = 50;
  if (actors.length > MAX_ACTORS) actors.length = MAX_ACTORS;

  // Compute actorCount correctly: if we previously tracked a larger total, keep it and only
  // increment it by 1 when a new (previously unseen) actor is added. Also ensure it's at
  // least as large as the current actors array length (in case of out-of-band changes).
  let actorCount: number;
  if (typeof extra.actorCount === 'number' && extra.actorCount > 0) {
    actorCount = extra.actorCount;
    if (!already) {
      actorCount = Math.max(actorCount + 1, actors.length);
    } else {
      actorCount = Math.max(actorCount, actors.length);
    }
  } else {
    actorCount = actors.length;
  }

  // Build friendly message using the first actor and actorCount
  const first = actors[0];
  const others = Math.max(0, actorCount - 1);
  let message: string;
  if (type === 'reaction') {
    if (actorCount === 1) {
      message = `${first.name} reacted to your post`;
    } else if (actorCount === 2 && actors[1]) {
      message = `${first.name} and ${actors[1].name} reacted to your post`;
    } else {
      message = others > 0 ? `${first.name} and ${others} others reacted to your post` : `${first.name} reacted to your post`;
    }
  } else if (type === 'comment') {
    if (excerpt) {
      if (actorCount === 2 && actors[1]) {
        message = `${first.name} and ${actors[1].name} commented on your post: "${excerpt}"`;
      } else {
        message = others > 0 ? `${first.name} and ${others} others commented on your post: "${excerpt}"` : `${first.name} commented on your post: "${excerpt}"`;
      }
    } else {
      if (actorCount === 2 && actors[1]) {
        message = `${first.name} and ${actors[1].name} commented on your post`;
      } else {
        message = others > 0 ? `${first.name} and ${others} others commented on your post` : `${first.name} commented on your post`;
      }
    }
  } else if (type === 'space_post') {
    if (actorCount === 2 && actors[1]) {
      message = `${first.name} and ${actors[1].name} posted in your space`;
    } else {
      message = others > 0 ? `${first.name} and ${others} others posted in your space` : `${first.name} posted in your space`;
    }
  } else {
    if (actorCount === 2 && actors[1]) {
      message = `${first.name} and ${actors[1].name}`;
    } else {
      message = others > 0 ? `${first.name} and ${others} others` : `${first.name}`;
    }
  }

  // Update the notification document
  try {
    await updateDoc(docRef, {
      message,
  extra: { ...extra, actors, actorCount, latestActor: { id: actorId, name: actorName }, excerpt: excerpt || extra.excerpt || null },
  timestamp: serverTimestamp(),
  clientTimestamp: Date.now(),
  read: false,
    });
  } catch (e) {
    console.error('Error upserting grouped notification:', e);
  }
}

// Listen to notifications for a user (real-time)
export function listenToNotifications(userId: string, callback: (notifications: Notification[]) => void) {
  const q = query(
    collection(db, NOTIFICATIONS_COLLECTION),
    where('userId', '==', userId),
    // Order by clientTimestamp (immediate client-side ordering)
    orderBy('clientTimestamp', 'desc'),
    limit(MAX_NOTIFICATIONS)
  );
  return onSnapshot(q, (snapshot) => {
    // Build a map to deduplicate notifications by (type, relatedId)
    const map = new Map<string, Notification>();
    snapshot.forEach(docSnap => {
      const raw = { id: docSnap.id, ...docSnap.data() } as Notification;
      const key = `${raw.type}|${raw.relatedId || ''}`;

      const existing = map.get(key);
      if (!existing) {
        map.set(key, raw);
        return;
      }

      // Merge logic: prefer the most recent by clientTimestamp, but merge actor lists and counts
      const existingTs = (existing as any).clientTimestamp || 0;
      const rawTs = (raw as any).clientTimestamp || 0;

      // Merge extras if present and look like grouped notifications
      const existingActors = Array.isArray(existing.extra?.actors) ? existing.extra.actors : [];
      const rawActors = Array.isArray(raw.extra?.actors) ? raw.extra.actors : [];
      const mergedActorsMap = new Map<string, { id: string; name: string }>();
      existingActors.concat(rawActors).forEach((a: any) => { if (a && a.id) mergedActorsMap.set(a.id, { id: a.id, name: a.name }); });
      const mergedActors = Array.from(mergedActorsMap.values());

      const existingCount = typeof existing.extra?.actorCount === 'number' ? existing.extra.actorCount : existingActors.length;
      const rawCount = typeof raw.extra?.actorCount === 'number' ? raw.extra.actorCount : rawActors.length;
      const mergedCount = Math.max(existingCount, rawCount, mergedActors.length);

      // Choose the more recent notification as base, but override extras/message with merged values
      const base = rawTs >= existingTs ? raw : existing;
      // Recompute friendly message following server rules.
      // Build a stable list of display names from merged actors and latestActor fallbacks
      const namesSet = new Set<string>();
      mergedActors.forEach(a => { if (a && a.name) namesSet.add(a.name); });
      if (base.extra?.latestActor?.name) namesSet.add(base.extra.latestActor.name);
      if (raw.extra?.latestActor?.name) namesSet.add(raw.extra.latestActor.name);
      const names = Array.from(namesSet);
      const firstName = names[0] || 'Someone';
      const secondName = names[1];
      const others = Math.max(0, mergedCount - 1);
      let mergedMessage = base.message;
      if (raw.type === 'reaction' || existing.type === 'reaction') {
        if (mergedCount === 1) {
          mergedMessage = `${firstName} reacted to your post`;
        } else if (mergedCount === 2 && secondName) {
          mergedMessage = `${firstName} and ${secondName} reacted to your post`;
        } else {
          mergedMessage = others > 0 ? `${firstName} and ${others} others reacted to your post` : `${firstName} reacted to your post`;
        }
      } else if (raw.type === 'comment' || existing.type === 'comment') {
        const excerpt = base.extra?.excerpt || raw.extra?.excerpt;
        if (mergedCount === 1) {
          mergedMessage = `${firstName} commented on your post${excerpt ? `: "${excerpt}"` : ''}`;
        } else if (mergedCount === 2 && secondName) {
          mergedMessage = `${firstName} and ${secondName} commented on your post${excerpt ? `: "${excerpt}"` : ''}`;
        } else {
          mergedMessage = others > 0 ? `${firstName} and ${others} others commented on your post${excerpt ? `: "${excerpt}"` : ''}` : `${firstName} commented on your post${excerpt ? `: "${excerpt}"` : ''}`;
        }
      } else if (raw.type === 'space_post' || existing.type === 'space_post') {
        if (mergedCount === 1) {
          mergedMessage = `${firstName} posted in your space`;
        } else if (mergedCount === 2 && secondName) {
          mergedMessage = `${firstName} and ${secondName} posted in your space`;
        } else {
          mergedMessage = others > 0 ? `${firstName} and ${others} others posted in your space` : `${firstName} posted in your space`;
        }
      }

      const merged: Notification = {
        ...base,
        message: mergedMessage,
        extra: { ...base.extra, actors: mergedActors, actorCount: mergedCount, latestActor: base.extra?.latestActor || raw.extra?.latestActor, excerpt: base.extra?.excerpt || raw.extra?.excerpt },
      };

      // Put merged back (also keep the doc id of the most recent)
      map.set(key, merged);
    });

    // Convert to array and sort by clientTimestamp desc for consistent ordering
    const result = Array.from(map.values()).sort((a, b) => ((b as any).clientTimestamp || 0) - ((a as any).clientTimestamp || 0));
    callback(result);
  });
}

// One-time fetch helper in case callers want to fetch notifications without listening
export async function fetchNotificationsForUser(userId: string): Promise<Notification[]> {
  try {
    const q = query(
      collection(db, NOTIFICATIONS_COLLECTION),
      where('userId', '==', userId),
      orderBy('clientTimestamp', 'desc'),
      limit(MAX_NOTIFICATIONS)
    );

    const snapshot = await getDocs(q);
    const notifs: Notification[] = [];
    snapshot.forEach(docSnap => {
      notifs.push({ id: docSnap.id, ...(docSnap.data() as any) } as Notification);
    });

    return notifs;
  } catch (err) {
    console.error('[fetchNotificationsForUser] Error fetching notifications for', userId, err);
    return [];
  }
}

// Mark all notifications as read for a user
export async function markAllNotificationsAsRead(userId: string) {
  const q = query(
    collection(db, NOTIFICATIONS_COLLECTION),
    where('userId', '==', userId),
    where('read', '==', false)
  );
  const snapshot = await getDocs(q);
  const docs = snapshot.docs;
  if (!docs.length) return 0;

  // Firestore limits a batch to 500 writes; chunk if necessary
  let updated = 0;
  for (let i = 0; i < docs.length; i += 500) {
    const slice = docs.slice(i, i + 500);
    const batch = writeBatch(db);
    slice.forEach(d => {
      batch.update(d.ref, { read: true });
      updated++;
    });
    await batch.commit();
  }
  return updated;
}

// Mark a single notification as read
export async function markNotificationAsRead(notificationId: string) {
  await updateDoc(doc(db, NOTIFICATIONS_COLLECTION, notificationId), { read: true });
}

// Batch mark multiple notifications as read by their IDs
export async function markNotificationsAsReadByIds(notificationIds: string[]): Promise<number> {
  if (!notificationIds || notificationIds.length === 0) return 0;
  let updated = 0;
  for (let i = 0; i < notificationIds.length; i += 500) {
    const slice = notificationIds.slice(i, i + 500);
    const batch = writeBatch(db);
    slice.forEach(id => {
      batch.update(doc(db, NOTIFICATIONS_COLLECTION, id), { read: true });
      updated++;
    });
    await batch.commit();
  }
  return updated;
}

// Listen to unread notification count (real-time)
export function listenToUnreadNotificationCount(userId: string, callback: (count: number) => void) {
  const q = query(
    collection(db, NOTIFICATIONS_COLLECTION),
    where('userId', '==', userId),
    where('read', '==', false)
  );
  return onSnapshot(q, (snapshot) => {
    callback(snapshot.size);
  });
}

// Delete a notification by userId, type, and relatedId
export async function deleteNotificationByTypeAndRelatedId(userId: string, type: string, relatedId: string) {
  const q = query(
    collection(db, NOTIFICATIONS_COLLECTION),
    where('userId', '==', userId),
    where('type', '==', type),
    where('relatedId', '==', relatedId)
  );
  const snapshot = await getDocs(q);
  const batch = writeBatch(db);
  snapshot.forEach(docSnap => {
    batch.delete(doc(db, NOTIFICATIONS_COLLECTION, docSnap.id));
  });
  await batch.commit();
}

// Delete all notifications of a specific type for a user
export async function deleteNotificationsOfType(userId: string, type: string) {
  const q = query(
    collection(db, NOTIFICATIONS_COLLECTION),
    where('userId', '==', userId),
    where('type', '==', type)
  );
  const snapshot = await getDocs(q);
  if (snapshot.empty) return 0;
  const batch = writeBatch(db);
  let deleted = 0;
  snapshot.forEach(docSnap => {
    batch.delete(doc(db, NOTIFICATIONS_COLLECTION, docSnap.id));
    deleted++;
  });
  await batch.commit();
  return deleted;
}

// Debugging helper to check message notifications
export async function debugMessageNotifications(userId: string) {
  try {
    const q = query(
      collection(db, NOTIFICATIONS_COLLECTION),
      where('userId', '==', userId),
      where('type', '==', 'message'),
      orderBy('timestamp', 'desc')
    );
    
    const snapshot = await getDocs(q);
    const messageNotifs: Notification[] = [];
    snapshot.forEach(doc => {
      messageNotifs.push({ id: doc.id, ...doc.data() } as Notification);
    });
    
    console.log(`Found ${messageNotifs.length} message notifications for user ${userId}:`, messageNotifs);
    return messageNotifs;
  } catch (error) {
    console.error('Error debugging message notifications:', error);
    return [];
  }
}
