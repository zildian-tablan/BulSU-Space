#!/usr/bin/env node
/**
 * Auto-delete revoked users older than retention period.
 * Logic:
 *  - Query Firestore users where revoked == true
 *  - If revokedAt missing, skip (or set now to start clock)
 *  - If (now - revokedAt) > RETENTION_DAYS -> delete Firestore doc + Auth user
 *  - Logs summary
 *
 * Run manually: node scripts/auto-delete-revoked.js
 * Add to package.json scripts as needed or schedule via external cron.
 */

const admin = require('firebase-admin');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const RETENTION_DAYS = parseInt(process.env.REVOKED_RETENTION_DAYS || '10', 10);

(async () => {
  try {
    if (admin.apps.length === 0) {
      admin.initializeApp({
        credential: admin.credential.applicationDefault()
      });
    }
    const db = admin.firestore();
    const auth = admin.auth();
    const now = Date.now();
    const cutoffMs = RETENTION_DAYS * 24 * 60 * 60 * 1000;

    console.log(`[AutoDelete] Starting cleanup. Retention: ${RETENTION_DAYS} days`);

    const snapshot = await db.collection('users').where('revoked', '==', true).get();
    if (snapshot.empty) {
      console.log('[AutoDelete] No revoked users found.');
      process.exit(0);
    }

    let checked = 0, deleted = 0, flagged = 0, errors = 0;

    for (const docSnap of snapshot.docs) {
      checked++;
      const data = docSnap.data();
      let revokedAt = data.revokedAt;

      if (!revokedAt) {
        // Initialize revokedAt so the clock starts
        await docSnap.ref.update({ revokedAt: new Date().toISOString() });
        flagged++;
        continue;
      }

      let revokedTime;
      try {
        if (revokedAt.toDate) {
          revokedTime = revokedAt.toDate().getTime(); // Firestore Timestamp
        } else {
          revokedTime = new Date(revokedAt).getTime();
        }
      } catch (e) {
        console.warn('[AutoDelete] Invalid revokedAt for', docSnap.id, revokedAt);
        continue;
      }

      if (now - revokedTime >= cutoffMs) {
        console.log(`[AutoDelete] Deleting user ${docSnap.id} (revokedAt=${revokedAt})`);
        try {
          await docSnap.ref.delete();
          try {
            await auth.deleteUser(docSnap.id);
          } catch (authErr) {
            if (!String(authErr.code || '').includes('not-found')) {
              console.error('[AutoDelete] Auth delete failed for', docSnap.id, authErr.message);
              errors++;
            }
          }
          deleted++;
        } catch (e) {
          console.error('[AutoDelete] Failed deleting user', docSnap.id, e.message);
          errors++;
        }
      }
    }

    console.log(`[AutoDelete] Finished. Checked=${checked} Deleted=${deleted} InitializedRevokedAt=${flagged} Errors=${errors}`);
    process.exit(0);
  } catch (err) {
    console.error('[AutoDelete] Fatal error:', err);
    process.exit(1);
  }
})();
