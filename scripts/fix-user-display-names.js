// Script to standardize user display names in Firestore
// Usage: node fix-user-display-names.js
// Requires Firebase Admin credentials at ./server/serviceAccountKey.json or application default credentials.

const path = require('path');
const admin = require('firebase-admin');

const firebaseConfig = {
  projectId: 'bulsuspace'
};

const serviceAccountPath = path.resolve(__dirname, '../server/serviceAccountKey.json');

const PREFIX_TOKENS = new Set([
  'mr',
  'mr.',
  'mrs',
  'mrs.',
  'ms',
  'ms.',
  'miss',
  'dr',
  'dr.',
  'prof',
  'prof.',
  'engr',
  "engr.",
  "eng'r",
  'rev',
  'rev.'
]);

const SUFFIX_TOKENS = new Set([
  'jr',
  'jr.',
  'sr',
  'sr.',
  'ii',
  'iii',
  'iv',
  'v',
  'vi',
  'phd',
  'ph.d',
  'md',
  'm.d',
  'dmd',
  'd.m.d',
  'dvm',
  'd.v.m',
  'mba',
  'rn',
  'r.n'
]);

function initializeFirebase() {
  if (admin.apps.length) {
    return admin.app();
  }

  try {
    const serviceAccount = require(serviceAccountPath);
    return admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: `https://${firebaseConfig.projectId}.firebaseio.com`
    });
  } catch (error) {
    console.warn('[fix-user-display-names] Falling back to default credentials:', error.message);
    return admin.initializeApp({ projectId: firebaseConfig.projectId });
  }
}

function normalizeToken(token) {
  return token
    .toLowerCase()
    .replace(/[^a-z0-9.']/g, '')
    .replace(/\.+$/, '.');
}

function cleanNamePart(part) {
  if (!part) return '';
  return part
    .replace(/^[\s,]+/, '')
    .replace(/[\s,]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripAffixes(tokens) {
  const working = [...tokens];

  while (working.length) {
    const normalized = normalizeToken(working[0]);
    if (!PREFIX_TOKENS.has(normalized)) break;
    working.shift();
  }

  while (working.length) {
    const normalized = normalizeToken(working[working.length - 1]);
    if (!SUFFIX_TOKENS.has(normalized)) break;
    working.pop();
  }

  return working;
}

function parseNameParts(rawName) {
  if (!rawName) {
    return { first: '', middle: '', last: '' };
  }

  let working = rawName.replace(/\s+/g, ' ').trim();
  let commaLast = '';

  if (working.includes(',')) {
    const [beforeComma, afterComma] = working.split(/,/, 2).map(part => part.trim());
    if (beforeComma) {
      commaLast = cleanNamePart(beforeComma);
    }
    working = afterComma || '';
  }

  let tokens = working.split(' ').filter(Boolean).map(cleanNamePart);
  tokens = stripAffixes(tokens).filter(Boolean);

  if (!tokens.length && commaLast) {
    return { first: '', middle: '', last: commaLast };
  }

  if (!tokens.length) {
    return { first: '', middle: '', last: '' };
  }

  const first = cleanNamePart(tokens[0]);
  let last = commaLast || cleanNamePart(tokens[tokens.length - 1]);
  const middleTokens = tokens.slice(1, tokens.length > 1 ? -1 : 1);
  const middle = middleTokens.join(' ').trim();

  if (!last && tokens.length > 1) {
    last = cleanNamePart(tokens[tokens.length - 1]);
  }

  if (!last) {
    last = commaLast;
  }

  return { first, middle, last };
}

function buildDisplayInfo(data) {
  let firstName = (data.firstName || data.first_name || '').trim();
  let secondName = (data.secondName || data.second_name || '').trim();
  let lastName = (data.lastName || data.last_name || '').trim();

  if (!firstName || !lastName || !secondName) {
    const parsed = parseNameParts((data.name || data.displayName || '').trim());
    if (!firstName) firstName = parsed.first;
    if (!secondName) secondName = parsed.middle;
    if (!lastName) lastName = parsed.last;
  }

  firstName = cleanNamePart(firstName);
  secondName = cleanNamePart(secondName);
  lastName = cleanNamePart(lastName);

  if (secondName) {
    const lowerSecond = secondName.toLowerCase();
    const lowerLast = lastName.toLowerCase();
    if (lowerLast === lowerSecond || lowerLast.startsWith(`${lowerSecond} `)) {
      secondName = '';
    }
  }

  if (!firstName || !lastName) {
    return null;
  }

  const displayName = [firstName, secondName, lastName]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  return { firstName, secondName, lastName, displayName };
}

async function fixDisplayNames() {
  initializeFirebase();
  const db = admin.firestore();

  console.log('[fix-user-display-names] Fetching user documents...');
  const snapshot = await db.collection('users').get();
  console.log(`[fix-user-display-names] Found ${snapshot.size} user documents.`);

  if (snapshot.empty) {
    console.log('[fix-user-display-names] No users to process.');
    return;
  }

  let processed = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;
  let batch = db.batch();
  let writesInBatch = 0;
  const commitBatch = async () => {
    if (!writesInBatch) {
      return;
    }
    await batch.commit();
    batch = db.batch();
    writesInBatch = 0;
  };

  for (const doc of snapshot.docs) {
    processed += 1;
    const data = doc.data();
    const displayInfo = buildDisplayInfo(data);

    if (!displayInfo) {
      skipped += 1;
      console.warn(`[fix-user-display-names] Skipping ${doc.id} - unable to derive first and last name.`);
      continue;
    }

    const { firstName, secondName, lastName, displayName } = displayInfo;

    const updatePayload = {};
    const existingFirst = (data.firstName || '').trim();
    const existingSecond = (data.secondName || '').trim();
    const existingLast = (data.lastName || '').trim();
    const existingFirstSnake = (data.first_name || '').trim();
    const existingSecondSnake = (data.second_name || '').trim();
    const existingLastSnake = (data.last_name || '').trim();
    const currentName = (data.name || '').trim();
    const currentDisplayName = (data.displayName || '').trim();

    if (existingFirst !== firstName) {
      updatePayload.firstName = firstName;
    }

    if (secondName && existingSecond !== secondName) {
      updatePayload.secondName = secondName;
    }

    if (existingLast !== lastName) {
      updatePayload.lastName = lastName;
    }

    if ('first_name' in data && existingFirstSnake !== firstName) {
      updatePayload.first_name = firstName;
    }

    if (secondName && 'second_name' in data && existingSecondSnake !== secondName) {
      updatePayload.second_name = secondName;
    }

    if ('last_name' in data && existingLastSnake !== lastName) {
      updatePayload.last_name = lastName;
    }

    if (currentName !== displayName) {
      updatePayload.name = displayName;
    }

    if (currentDisplayName !== displayName) {
      updatePayload.displayName = displayName;
    }

    if (!Object.keys(updatePayload).length) {
      skipped += 1;
      continue;
    }

    try {
      batch.update(doc.ref, updatePayload);
      writesInBatch += 1;
      updated += 1;
      console.log(`[fix-user-display-names] Updating ${doc.id} -> ${displayName}`);
    } catch (error) {
      failed += 1;
      console.error(`[fix-user-display-names] Failed to queue update for ${doc.id}:`, error.message);
    }

    if (writesInBatch === 500) {
      await commitBatch();
    }
  }

  await commitBatch();

  console.log('[fix-user-display-names] Processing complete.');
  console.log(`[fix-user-display-names] Processed: ${processed}`);
  console.log(`[fix-user-display-names] Updated: ${updated}`);
  console.log(`[fix-user-display-names] Skipped: ${skipped}`);
  console.log(`[fix-user-display-names] Failed: ${failed}`);
}

fixDisplayNames()
  .then(() => {
    console.log('[fix-user-display-names] Script finished successfully.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('[fix-user-display-names] Script failed:', error);
    process.exit(1);
  });
