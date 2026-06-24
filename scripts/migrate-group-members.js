#!/usr/bin/env node
/**
 * migrate-group-members.js
 *
 * One-time migration script: duplicate existing `group_members` documents
 * to deterministic ids of the form `{userId}_{groupId}` so Firestore rules
 * that check `group_members/{uid}_{groupId}` will succeed.
 *
 * Usage:
 *   - Install dependencies: `npm install firebase-admin` (global/project)
 *   - Provide credentials:
 *       * Option A (recommended): set `GOOGLE_APPLICATION_CREDENTIALS` to
 *         your service account JSON file path, then run `node migrate-group-members.js`
 *       * Option B: pass `--key ./path/to/serviceAccountKey.json`
 *   - Dry run: `node migrate-group-members.js --dry` (shows what would change)
 *   - Run for real: `node migrate-group-members.js`
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

function usage() {
  console.log('Usage: node migrate-group-members.js [--key ./serviceAccount.json] [--dry]');
}

async function main() {
  const args = process.argv.slice(2);
  let keyPath;
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--key' && args[i+1]) {
      keyPath = args[i+1];
      i++;
    } else if (args[i] === '--dry' || args[i] === '--dry-run') {
      dryRun = true;
    } else if (args[i] === '--help' || args[i] === '-h') {
      usage();
      process.exit(0);
    }
  }

  // Initialize admin SDK
  if (keyPath) {
    const fullPath = path.resolve(keyPath);
    if (!fs.existsSync(fullPath)) {
      console.error('Service account key not found at', fullPath);
      process.exit(1);
    }
    const serviceAccount = require(fullPath);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  } else {
    // Try application default credentials
    try {
      admin.initializeApp({ credential: admin.credential.applicationDefault() });
    } catch (e) {
      console.error('Failed to initialize Firebase Admin. Provide a service account with --key or set GOOGLE_APPLICATION_CREDENTIALS.');
      console.error(e);
      process.exit(1);
    }
  }

  const db = admin.firestore();
  console.log('Fetching all documents from `group_members`...');

  const snapshot = await db.collection('group_members').get();
  console.log(`Found ${snapshot.size} membership documents.`);

  let created = 0;
  let skipped = 0;
  let already = 0;
  let errors = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const userId = data.userId;
    const groupId = data.groupId;
    if (!userId || !groupId) {
      console.warn('Skipping invalid doc', doc.id);
      skipped++;
      continue;
    }
    const newId = `${userId}_${groupId}`;
    if (doc.id === newId) {
      already++;
      continue;
    }
    const newRef = db.collection('group_members').doc(newId);
    const existing = await newRef.get();
    if (existing.exists) {
      // If deterministic document already exists, we skip to avoid overwriting
      skipped++;
      continue;
    }

    console.log(`${dryRun ? '[DRY] ' : ''}Would create: group_members/${newId} (from ${doc.id})`);
    if (!dryRun) {
      try {
        // Preserve original fields, including role/joinedAt/updatedAt
        await newRef.set(data);
        created++;
      } catch (e) {
        console.error('Failed to create', newId, e);
        errors++;
      }
    }
  }

  console.log('--- Migration summary ---');
  console.log('Total scanned:', snapshot.size);
  console.log('Created:', created);
  console.log('Already deterministic:', already);
  console.log('Skipped (conflicts/invalid):', skipped);
  console.log('Errors:', errors);

  process.exit(errors > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
