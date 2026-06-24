/*
 * Backup script: snapshot media URLs and storage paths for all posts
 * Usage:
 * 1. Install firebase-admin in the workspace (if not present):
 *    npm install firebase-admin
 * 2. Set Google service account key JSON path in env:
 *    $env:GOOGLE_APPLICATION_CREDENTIALS = 'C:\path\to\serviceAccountKey.json'
 * 3. Run: node scripts/backup-media-urls.js
 *
 * This will write documents under collection `media_backups` with id = postId
 * containing `media` array extracted from the post document.
 */

const admin = require('firebase-admin');

try {
  admin.initializeApp({});
} catch (e) {
  // ignore if already initialized
}

const db = admin.firestore();

(async () => {
  console.log('Starting media backup...');
  try {
    const postsSnap = await db.collection('posts').get();
    console.log('Found', postsSnap.size, 'posts');

    let processed = 0;
    for (const doc of postsSnap.docs) {
      const postId = doc.id;
      const data = doc.data() || {};
      const media = Array.isArray(data.media) ? data.media : [];

      // Normalize media items (keep url and storagePath if present)
      const normalized = media.map(m => {
        if (m && typeof m === 'object') {
          return {
            url: m.url || null,
            storagePath: m.storagePath || null,
            name: m.name || null,
            size: m.size || null,
            type: m.type || null
          };
        }
        return { url: m || null, storagePath: null, name: null, size: null, type: null };
      });

      if (normalized.length === 0) continue;

      await db.collection('media_backups').doc(postId).set({
        postId,
        media: normalized,
        backedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      processed += 1;
      if (processed % 100 === 0) console.log('Processed', processed, 'posts');
    }

    console.log('Media backup completed. Posts backed up:', processed);
  } catch (err) {
    console.error('Error during media backup:', err);
    process.exitCode = 2;
  }
})();
