import { collection, getDocs, query, deleteDoc, doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase/config';

/**
 * Delete sticky notes older than 24 hours.
 * Returns number of deleted documents.
 */
export const cleanupExpiredStickyNotes = async (): Promise<number> => {
  try {
    // Only admins/super admins should run this cleanup from the client
    const user = auth.currentUser;
    if (!user) {
      // Not signed in; skip silently to avoid redirect flows
      return 0;
    }

    // Lightweight admin check without redirect side-effects
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    const role = userDoc.exists() ? (userDoc.data() as any)?.role : undefined;
    const isAdmin = role === 'admin' || role === 'super admin';
    if (!isAdmin) {
      // Non-admin clients should not attempt bulk deletes due to security rules
      return 0;
    }

    console.log('Cleaning up sticky notes older than 24 hours...');
    const notesQuery = query(collection(db, 'sticky_notes'));
    const snapshot = await getDocs(notesQuery);

    const now = Date.now();
    const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
    let deletedCount = 0;

    for (const docSnap of snapshot.docs) {
      const data = docSnap.data();
      const createdAt: any = data.createdAt;

      let createdDate: Date | null = null;
      // Firestore Timestamp has toDate(), otherwise try to coerce
      if (createdAt && typeof createdAt.toDate === 'function') {
        createdDate = createdAt.toDate();
      } else if (typeof createdAt === 'number') {
        createdDate = new Date(createdAt);
      } else if (typeof createdAt === 'string') {
        const t = Date.parse(createdAt);
        if (!isNaN(t)) createdDate = new Date(t);
      }

      if (!createdDate) continue; // skip if no timestamp

      if (now - createdDate.getTime() > TTL_MS) {
        try {
          await deleteDoc(docSnap.ref);
          deletedCount++;
          console.log(`Deleted expired sticky note ${docSnap.id}`);
        } catch (err) {
          console.error(`Failed to delete sticky note ${docSnap.id}:`, err);
        }
      }
    }

    console.log(`Sticky note cleanup completed. Deleted ${deletedCount} documents.`);
    return deletedCount;
  } catch (error) {
    console.error('Error cleaning up sticky notes:', error);
    throw error;
  }
};

/**
 * Schedule periodic cleanup. Call on app/server start.
 */
export const scheduleStickyNoteCleanup = (intervalMinutes: number = 60): NodeJS.Timeout => {
  console.log(`Scheduling sticky note cleanup every ${intervalMinutes} minutes`);

  // Run initial cleanup immediately (best-effort)
  cleanupExpiredStickyNotes().catch(error => {
    console.error('Initial sticky note cleanup failed:', error);
  });

  return setInterval(() => {
    cleanupExpiredStickyNotes().catch(error => {
      console.error('Scheduled sticky note cleanup failed:', error);
    });
  }, intervalMinutes * 60 * 1000);
};

export default cleanupExpiredStickyNotes;
