import { 
  collection, 
  doc, 
  addDoc, 
  updateDoc, 
  getDoc, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  serverTimestamp,
  increment,
  arrayUnion,
  arrayRemove,
  writeBatch,
  onSnapshot,
  runTransaction
} from 'firebase/firestore';
import { db } from '../firebase/config';

export interface PollOption {
  id: string;
  text: string;
  count: number;
  voters: string[];
}

export interface Poll {
  id: string;
  type: 'post_poll';
  question: string;
  authorId: string;
  authorName: string;
  authorProfilePic?: string;
  authorRole: string;
  postId: string; // Required for post polls
  createdAt: any;
  updatedAt: any;
  isActive: boolean;
  totalVotes: number;
  optionCount: number;
  durationDays?: number; // Duration in days (1, 2, or 3)
  endDate?: any; // Timestamp when poll expires (legacy field kept for compatibility)
  endPollDateTime?: any; // Duplicate explicit timestamp (ISO string or Firestore Timestamp)
  endpollduration?: any; // User-requested field name to store the end date/time for auto-deletion
  endPollDuration?: number; // Explicit duration in days (alias of durationDays)
}

export interface CreatePollData {
  type: 'post_poll';
  question: string;
  options: Omit<PollOption, 'count' | 'voters'>[];
  authorId: string;
  authorName: string;
  authorProfilePic?: string;
  authorRole: string;
  postId: string; // Required for post polls
  durationDays?: number; // Duration in days (1, 2, or 3)
}

const POLLS_COLLECTION = 'polls';
const POLL_OPTIONS_SUBCOLLECTION = 'pollOptions';

// Simple in-memory caches to optimize initial load and avoid unnecessary refetches
// Note: These caches reset on page reload. They are safe because Firestore real-time listeners
// will keep them fresh in active sessions.
const CACHE_TTL_MS = 60_000; // 1 minute freshness for list queries

type ListCache<T> = { data: T | null; ts: number; promise: Promise<T> | null };

const independentPollsCache: ListCache<Poll[]> = { data: null, ts: 0, promise: null };
const pollsByPostCache = new Map<string, ListCache<Poll[]>>();
const pollOptionsCache = new Map<string, PollOption[]>();

// Maintain shared subscriptions per poll to prevent multiple concurrent onSnapshot listeners
const optionSubscriptions = new Map<string, { listeners: Set<(options: PollOption[]) => void>; unsubscribe: () => void }>();

/**
 * Utilities to control and peek caches
 */
export const invalidateIndependentPollsCache = () => {
  independentPollsCache.data = null;
  independentPollsCache.ts = 0;
  independentPollsCache.promise = null;
};

export const invalidatePollsByPostCache = (postId?: string) => {
  if (postId) {
    pollsByPostCache.delete(postId);
  } else {
    pollsByPostCache.clear();
  }
};

export const getCachedPollOptions = (pollId: string): PollOption[] | null => {
  const cached = pollOptionsCache.get(pollId);
  return cached ? [...cached] : null;
};

export const getCachedIndependentPolls = (): Poll[] | null => {
  return independentPollsCache.data ? [...independentPollsCache.data] : null;
};

export const getCachedPollsByPostId = (postId: string): Poll[] | null => {
  const cached = pollsByPostCache.get(postId);
  return cached && cached.data ? [...cached.data] : null;
};

/**
 * Create a new poll
 */
export const createPoll = async (pollData: CreatePollData): Promise<string> => {
  try {
    // Calculate end date if duration is provided
    let endDate = null;
    if (pollData.durationDays && pollData.durationDays >= 1 && pollData.durationDays <= 3) {
      const now = new Date();
      const endDateTime = new Date(now.getTime() + pollData.durationDays * 24 * 60 * 60 * 1000);
      endDate = endDateTime;
    }

    // Create the main poll document
    const pollDoc: any = {
      type: pollData.type,
      question: pollData.question,
      authorId: pollData.authorId,
      authorName: pollData.authorName,
      authorProfilePic: pollData.authorProfilePic,
      authorRole: pollData.authorRole,
      postId: pollData.postId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      isActive: true,
      totalVotes: 0,
      optionCount: pollData.options.length,
      ...(pollData.durationDays && { durationDays: pollData.durationDays }),
      ...(endDate && { 
        endDate: endDate, // original field (legacy)
        endPollDateTime: endDate, // alias field
        endpollduration: endDate, // user-requested field name (lowercase form)
        endPollDuration: pollData.durationDays, // explicit duration days alias
        endDurationDate: endDate, // NEW alias to satisfy "enddurationdate" auto-delete requirement
        enddurationdate: endDate // defensive duplicate to catch any lowercase variant
      })
    };

    const pollRef = await addDoc(collection(db, POLLS_COLLECTION), pollDoc);
    const pollId = pollRef.id;

    // Create poll options as subcollection
    const batch = writeBatch(db);
    const pollOptionsRef = collection(pollRef, POLL_OPTIONS_SUBCOLLECTION);

    pollData.options.forEach((option) => {
      const optionRef = doc(pollOptionsRef);
      batch.set(optionRef, {
        text: option.text,
        count: 0,
        voters: [],
        createdAt: serverTimestamp()
      });
    });

    await batch.commit();

    console.log(`[PollService] Poll created successfully with ID: ${pollId}`);
    return pollId;
  } catch (error) {
    console.error('[PollService] Error creating poll:', error);
    throw error;
  }
};

/**
 * Get a poll by ID
 */
export const getPoll = async (pollId: string): Promise<Poll | null> => {
  try {
    const pollDoc = await getDoc(doc(db, POLLS_COLLECTION, pollId));
    
    if (!pollDoc.exists()) {
      return null;
    }

    const pollData = pollDoc.data();
    return {
      id: pollDoc.id,
      ...pollData
    } as Poll;
  } catch (error) {
    console.error('[PollService] Error getting poll:', error);
    throw error;
  }
};

/**
 * Get poll options for a specific poll
 */
export const getPollOptions = async (pollId: string): Promise<PollOption[]> => {
  try {
    const pollOptionsRef = collection(doc(db, POLLS_COLLECTION, pollId), POLL_OPTIONS_SUBCOLLECTION);
    const optionsSnapshot = await getDocs(pollOptionsRef);
    
    const options: PollOption[] = [];
    optionsSnapshot.forEach((doc) => {
      const data = doc.data();
      options.push({
        id: doc.id,
        text: data.text,
        count: data.count || 0,
        voters: data.voters || []
      });
    });

  const sorted = options.sort((a, b) => b.count - a.count); // Sort by vote count descending
  // Seed cache for faster initial renders
  pollOptionsCache.set(pollId, sorted);
  return sorted;
  } catch (error) {
    console.error('[PollService] Error getting poll options:', error);
    throw error;
  }
};

/**
 * Subscribe to poll options in real-time
 */
export const subscribeToPollOptions = (
  pollId: string,
  callback: (options: PollOption[]) => void
): (() => void) => {
  // If we already have cached options (from a prior subscriber or fetch), emit immediately
  const cached = pollOptionsCache.get(pollId);
  if (cached && Array.isArray(cached)) {
    try { callback(cached); } catch {}
  }

  // If a shared subscription already exists, just add the listener
  const existing = optionSubscriptions.get(pollId);
  if (existing) {
    existing.listeners.add(callback);
    return () => {
      existing.listeners.delete(callback);
      // Cleanup when last listener unsubscribes
      if (existing.listeners.size === 0) {
        try { existing.unsubscribe(); } catch {}
        optionSubscriptions.delete(pollId);
      }
    };
  }

  // Create a new shared subscription
  const listeners = new Set<(options: PollOption[]) => void>();
  listeners.add(callback);

  const pollOptionsRef = collection(doc(db, POLLS_COLLECTION, pollId), POLL_OPTIONS_SUBCOLLECTION);
  const unsubscribe = onSnapshot(pollOptionsRef, (snapshot) => {
    const options: PollOption[] = snapshot.docs
      .map((d) => {
        const data = d.data();
        return {
          id: d.id,
          text: data.text,
          count: data.count || 0,
          voters: data.voters || []
        };
      })
      .sort((a, b) => b.count - a.count);

    // Update cache and notify all listeners
    pollOptionsCache.set(pollId, options);
    listeners.forEach((fn) => {
      try { fn(options); } catch {}
    });
  });

  optionSubscriptions.set(pollId, { listeners, unsubscribe });

  // Return per-caller unsubscribe that detaches them from the shared subscription
  return () => {
    const entry = optionSubscriptions.get(pollId);
    if (!entry) return;
    entry.listeners.delete(callback);
    if (entry.listeners.size === 0) {
      try { entry.unsubscribe(); } catch {}
      optionSubscriptions.delete(pollId);
    }
  };
};

/**
 * Vote on a poll option
 */
export const voteOnPoll = async (
  pollId: string,
  optionId: string,
  userId: string,
  previousOptionId?: string | null
): Promise<void> => {
  try {
    const pollRef = doc(db, POLLS_COLLECTION, pollId);
    const newRef = doc(pollRef, POLL_OPTIONS_SUBCOLLECTION, optionId);
    const prevRef = previousOptionId ? doc(pollRef, POLL_OPTIONS_SUBCOLLECTION, previousOptionId) : null;

    await runTransaction(db, async (tx) => {
      // Ensure poll exists
      const pollSnap = await tx.get(pollRef);
      if (!pollSnap.exists()) throw new Error('Poll not found');

      // Read new option
      const newSnap = await tx.get(newRef);
      if (!newSnap.exists()) throw new Error('Option not found');
      const newData = newSnap.data() as any;
      const newHasUser = Array.isArray(newData.voters) && newData.voters.includes(userId);

      if (prevRef && prevRef.id === newRef.id) {
        // Toggle unvote when clicking same option
        if (newHasUser) {
          tx.update(newRef, { count: increment(-1), voters: arrayRemove(userId) });
          tx.update(pollRef, { totalVotes: increment(-1), updatedAt: serverTimestamp() });
        } else {
          // If somehow not present, treat as add
          tx.update(newRef, { count: increment(1), voters: arrayUnion(userId) });
          tx.update(pollRef, { totalVotes: increment(1), updatedAt: serverTimestamp() });
        }
        return;
      }

      if (prevRef && prevRef.id !== newRef.id) {
        // Switch vote: remove from prev if present, add to new if absent
        const prevSnap = await tx.get(prevRef);
        if (prevSnap.exists()) {
          const prevData = prevSnap.data() as any;
          const prevHasUser = Array.isArray(prevData.voters) && prevData.voters.includes(userId);
          if (prevHasUser) {
            tx.update(prevRef, { count: increment(-1), voters: arrayRemove(userId) });
          }
        }
        if (!newHasUser) {
          tx.update(newRef, { count: increment(1), voters: arrayUnion(userId) });
        }
        // totalVotes net change 0 for switch
        tx.update(pollRef, { updatedAt: serverTimestamp() });
        return;
      }

      // First-time vote (no previous)
      if (!newHasUser) {
        tx.update(newRef, { count: increment(1), voters: arrayUnion(userId) });
        tx.update(pollRef, { totalVotes: increment(1), updatedAt: serverTimestamp() });
      }
    });
    console.log(`[PollService] Vote processed for poll ${pollId}, option ${optionId}`);
  } catch (error) {
    console.error('[PollService] Error voting on poll:', error);
    throw error;
  }
};

/**
 * Get polls by post ID
 */
export const getPollsByPostId = async (postId: string): Promise<Poll[]> => {
  const now = Date.now();
  const cached = pollsByPostCache.get(postId);
  if (cached && cached.data && now - cached.ts < CACHE_TTL_MS) {
    return cached.data;
  }
  if (cached && cached.promise) {
    return cached.promise;
  }

  const entry: ListCache<Poll[]> = cached ?? { data: null, ts: 0, promise: null };
  const promise = (async () => {
    try {
      const pollsQuery = query(
        collection(db, POLLS_COLLECTION),
        where('postId', '==', postId),
        where('isActive', '==', true),
        orderBy('createdAt', 'desc')
      );
  
      const pollsSnapshot = await getDocs(pollsQuery);
      const polls: Poll[] = [];
  
      pollsSnapshot.forEach((doc) => {
        const data = doc.data();
        polls.push({
          id: doc.id,
          ...data
        } as Poll);
      });
  
      entry.data = polls;
      entry.ts = Date.now();
      entry.promise = null;
      pollsByPostCache.set(postId, entry);
      return polls;
    } catch (error) {
      console.error('[PollService] Error getting polls by post ID:', error);
      throw error;
    } finally {
      entry.promise = null;
    }
  })();

  entry.promise = promise;
  pollsByPostCache.set(postId, entry);
  return promise;
};

/**
 * Deactivate a poll
 */
export const deactivatePoll = async (pollId: string): Promise<void> => {
  try {
    await updateDoc(doc(db, POLLS_COLLECTION, pollId), {
      isActive: false,
      updatedAt: serverTimestamp()
    });

    console.log(`[PollService] Poll ${pollId} deactivated`);
  } catch (error) {
    console.error('[PollService] Error deactivating poll:', error);
    throw error;
  }
};

/**
 * Get user's voting status for a poll
 */
export const getUserVoteStatus = async (pollId: string, userId: string): Promise<string | null> => {
  try {
    const pollOptionsRef = collection(doc(db, POLLS_COLLECTION, pollId), POLL_OPTIONS_SUBCOLLECTION);
    const optionsSnapshot = await getDocs(pollOptionsRef);
    
    for (const doc of optionsSnapshot.docs) {
      const data = doc.data();
      if (data.voters?.includes(userId)) {
        return doc.id;
      }
    }

    return null;
  } catch (error) {
    console.error('[PollService] Error getting user vote status:', error);
    throw error;
  }
};

/**
 * Subscribe to independent polls in real-time.
 * Keeps the in-memory cache in sync and notifies the provided callback when the list changes.
 */
export const subscribeToIndependentPolls = (
  onUpdate: (polls: Poll[]) => void,
  onError?: (error: Error) => void
): (() => void) => {
  const pollsQuery = query(
    collection(db, POLLS_COLLECTION),
    where('isActive', '==', true),
    orderBy('createdAt', 'desc')
  );

  return onSnapshot(
    pollsQuery,
    (snapshot) => {
      const polls: Poll[] = [];

      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.postId && typeof data.postId === 'string' && data.postId.startsWith('independent_')) {
          polls.push({
            id: docSnap.id,
            ...data
          } as Poll);
        }
      });

      independentPollsCache.data = polls;
      independentPollsCache.ts = Date.now();
      independentPollsCache.promise = null;

      try {
        onUpdate(polls);
      } catch (callbackError) {
        console.error('[PollService] Independent poll update handler failed:', callbackError);
      }
    },
    (error) => {
      console.error('[PollService] Independent poll subscription error:', error);
      if (onError) {
        try {
          onError(error);
        } catch (callbackError) {
          console.error('[PollService] Independent poll error handler failed:', callbackError);
        }
      }
    }
  );
};

/**
 * Get independent polls (polls that exist in Firestore but are not associated with actual posts)
 */
export const getIndependentPolls = async (): Promise<Poll[]> => {
  const now = Date.now();
  if (independentPollsCache.data && now - independentPollsCache.ts < CACHE_TTL_MS) {
    return independentPollsCache.data;
  }
  if (independentPollsCache.promise) {
    return independentPollsCache.promise;
  }

  const promise = (async () => {
    try {
      const pollsQuery = query(
        collection(db, POLLS_COLLECTION),
        where('isActive', '==', true),
        orderBy('createdAt', 'desc')
      );
  
      const pollsSnapshot = await getDocs(pollsQuery);
      const polls: Poll[] = [];
  
      pollsSnapshot.forEach((doc) => {
        const data = doc.data();
        // Only include polls that have a postId starting with 'independent_' (our convention for independent polls)
        if (data.postId && data.postId.startsWith('independent_')) {
          polls.push({
            id: doc.id,
            ...data
          } as Poll);
        }
      });
  
      independentPollsCache.data = polls;
      independentPollsCache.ts = Date.now();
      independentPollsCache.promise = null;
      return polls;
    } catch (error) {
      console.error('[PollService] Error getting independent polls:', error);
      throw error;
    } finally {
      independentPollsCache.promise = null;
    }
  })();

  independentPollsCache.promise = promise;
  return promise;
};

/**
 * Clean up expired polls.
 * A poll is considered expired if any of the following timestamp fields are <= now:
 *   - endDate
 *   - endPollDateTime
 *   - endpollduration
 * The function deletes the poll document and its pollOptions subcollection documents.
 * Returns the number of deleted polls.
 */
export const cleanupExpiredPolls = async (): Promise<number> => {
  try {
    console.log('[PollService] Starting cleanup of expired polls...');
    const pollsQuery = query(collection(db, POLLS_COLLECTION));
    const snapshot = await getDocs(pollsQuery);

    const now = Date.now();
    let deletedCount = 0;

    for (const pollSnap of snapshot.docs) {
      const data: any = pollSnap.data();
      // Skip already inactive polls for efficiency
      if (data.isActive === false) continue;

      // Collect all possible expiration timestamp aliases (defensive against schema drift)
      const candidates: any[] = [
        data.endDate,
        data.endPollDateTime,
        data.endpollduration,
        data.endPollDurationTimestamp, // future-proof if a dedicated timestamp field is added
        data.endDurationDate, // newly added alias
        data.enddurationdate // lowercase variant
      ].filter(Boolean);
      if (candidates.length === 0) continue; // no expiry timestamps

      const isExpired = candidates.some((ts) => {
        if (!ts) return false;
        try {
          // Firestore Timestamp has toDate()
          if (typeof ts.toDate === 'function') {
            return ts.toDate().getTime() <= now;
          }
          if (ts instanceof Date) {
            return ts.getTime() <= now;
          }
          if (typeof ts === 'string') {
            const parsed = Date.parse(ts);
            return !isNaN(parsed) && parsed <= now;
          }
          if (typeof ts === 'number') {
            return ts <= now;
          }
        } catch {}
        return false;
      });

      if (!isExpired) continue;

      try {
        // Delete poll options first (best-effort) then poll document
        const pollRef = doc(db, POLLS_COLLECTION, pollSnap.id);
        const optionsRef = collection(pollRef, POLL_OPTIONS_SUBCOLLECTION);
        const optionsSnap = await getDocs(optionsRef);
        const batch = writeBatch(db);
        optionsSnap.forEach((optDoc) => batch.delete(optDoc.ref));
        batch.delete(pollRef);
        await batch.commit();
        deletedCount++;
        console.log(`[PollService] Deleted expired poll ${pollSnap.id}`);
      } catch (err) {
        console.error(`[PollService] Failed to delete expired poll ${pollSnap.id}:`, err);
      }
    }

    if (deletedCount > 0) {
      invalidateIndependentPollsCache();
      invalidatePollsByPostCache();
    }

    console.log(`[PollService] Poll cleanup completed. Deleted ${deletedCount} polls.`);
    return deletedCount;
  } catch (error) {
    console.error('[PollService] Error cleaning up expired polls:', error);
    throw error;
  }
};

/**
 * Schedule periodic cleanup of expired polls.
 * Run on app start (client) or server start. Default every 60 minutes.
 */
export const schedulePollCleanup = (intervalMinutes: number = 60): NodeJS.Timeout => {
  console.log(`[PollService] Scheduling poll cleanup every ${intervalMinutes} minutes`);
  cleanupExpiredPolls().catch(err => console.error('[PollService] Initial poll cleanup failed:', err));
  return setInterval(() => {
    cleanupExpiredPolls().catch(err => console.error('[PollService] Scheduled poll cleanup failed:', err));
  }, intervalMinutes * 60 * 1000);
};
