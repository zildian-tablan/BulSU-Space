// Bulk update user names to include middle/second names based on provided mapping.
// Usage: node scripts/bulk-update-display-names.js [--dry]
// If --dry is passed, no writes are performed.
// Requires Firebase Admin credentials at ../server/serviceAccountKey.json

const path = require('path');
const admin = require('firebase-admin');

const DRY_RUN = process.argv.includes('--dry');

const serviceAccountPath = path.resolve(__dirname, '../server/serviceAccountKey.json');

function init() {
  if (admin.apps.length) return;
  try {
    const sa = require(serviceAccountPath);
    admin.initializeApp({ credential: admin.credential.cert(sa), databaseURL: `https://bulsuspace.firebaseio.com` });
  } catch (e) {
    console.error('[bulk-update] Failed to load service account:', e.message);
    process.exit(1);
  }
}

// Raw mapping lines: First composite + TAB or spaces + LAST (may contain spaces) all last names uppercase.
const RAW = `Israel James\tAGAPAY
Reiben Marion\tBAGUNA
Shamel\tBAJE
Leila Anne\tBALATAYO
Mark Laurence\tCAJIDA
Ian Karlo\tCALAGUAS
Julia Mikah\tDAVID
Raymart\tDE GUIA
Charles David\tESTRELLA
JOHN MANUEL\tESTRELLA
Reoroi\tFELIPE
Harvey\tFLORES
Russel Louise\tHIPPLE
John Christopher\tINOCENCIO
Raymond\tJAVIER
ALECK JOSEPH\tLOPEZ
Jayson\tLUCAS
Francine Louisse\tMIRANDA
Mel Christopher\tREYES
Ronnie Rhey\tROYO
Kirsten Denz\tSAGUINSIN
Josh Andrie\tSANTOS
LHYCKA LOREINNE\tSULIT
John Lawrence\tTAYSON
Jennifer Antonette\tTIONGSON
John Paul\tTORRES
John Sandrex\tVERANO
Vincent Aaron\tVICENTE
Renz Miguel\tVICTORIA
Janier\tABLAZA
GWYNETH KAYE\tAGUILAR
Led\tALMENIANA
Dean Paolo\tBAUTISTA
Joshua\tBAUTISTA
Mark Christian\tBAUTISTA
Justfer\tCARABUENA
Albert Christian\tCRUZ
Mark Justin\tCRUZ
Alfred Jolo\tDE JESUS
Charles Klarenze\tDELA CRUZ
Lhorenz\tDELA CRUZ
Luke Andrei\tDE LEON
Richmond\tENRIQUEZ
Nicos Denielle\tFRANCISCO
Lougene\tGUINTO
Mark Vincent\tINGCO
Mark Raven\tJIMENEZ
Ernest John\tLIWANAG
Maria Cassandra\tMANIQUIS
John Laurence\tMASANGCAY
Joonnie\tMORALES
Kirsten Keisha\tPERALTA
Lari Andrei\tRAMOS
Ehngeel John\tREYES
Erica\tROBLES
Alexis\tSALIM
Ashley\tSANTIAGO
Zildian Benedict\tTABLAN
Brien\tTAMAYO
Joshua\tTAMAYO
Raven Gillian\tTAN
Christian John\tTAROL
Aeron\tTOLENTINO`;

function parseMapping(raw) {
  return raw.trim().split(/\n+/).map(line => {
    const parts = line.split(/\t+/); // try tab first
    let firstComposite, lastUpper;
    if (parts.length >= 2) {
      firstComposite = parts[0].trim();
      lastUpper = parts.slice(1).join(' ').trim();
    } else {
      // fallback: split by two or more spaces
      const m = line.match(/^(.*?)[ ]{2,}(.*)$/);
      if (m) {
        firstComposite = m[1].trim();
        lastUpper = m[2].trim();
      } else {
        // final fallback: split by single space (NOT ideal)
        const tokens = line.trim().split(' ');
        lastUpper = tokens.pop();
        firstComposite = tokens.join(' ');
      }
    }
    const normalizedLast = normalizeLast(lastUpper);
    return {
      original: line.trim(),
      firstComposite,
      lastUpper,
      normalizedLast,
      desiredDisplayName: `${capitalizeWords(firstComposite)} ${formatLast(lastUpper)}`.trim(),
      firstToken: firstComposite.split(/\s+/)[0].toLowerCase()
    };
  });
}

function normalizeLast(last) {
  return last.toLowerCase().replace(/\s+/g, ' ').trim();
}
function formatLast(last) {
  // Keep particles (DE, DELA, DE LA, etc.) capitalized properly
  return last
    .toLowerCase()
    .split(' ') 
    .map(tok => tok.length <= 3 ? tok.toLowerCase() : tok) // smaller tokens keep lower
    .map(tok => tok.replace(/^[a-z]/, c => c.toUpperCase()))
    .join(' ')
    .replace(/\b(De|Dela|La|Le|Del)\b/gi, m => m.charAt(0).toUpperCase() + m.slice(1).toLowerCase());
}
function capitalizeWords(str) {
  return str
    .toLowerCase()
    .split(/\s+/)
    .map(w => w ? w[0].toUpperCase() + w.slice(1) : '')
    .join(' ');
}

const MAPPINGS = parseMapping(RAW);
const LAST_INDEX = MAPPINGS.reduce((acc, m) => {
  acc[m.normalizedLast] = acc[m.normalizedLast] || [];
  acc[m.normalizedLast].push(m);
  return acc;
}, {});

function parseCurrentName(name) {
  if (!name) return { first: '', middle: '', last: '' };
  const tokens = name.trim().split(/\s+/);
  if (tokens.length === 1) return { first: tokens[0], middle: '', last: '' };
  const first = tokens[0];
  const last = tokens[tokens.length - 1];
  const middle = tokens.slice(1, -1).join(' ');
  return { first, middle, last };
}

async function run() {
  init();
  const db = admin.firestore();
  const snapshot = await db.collection('users').get();
  console.log(`[bulk-update] Loaded ${snapshot.size} user docs`);

  let updates = 0, skipped = 0, ambiguous = 0, failed = 0;
  let batch = db.batch();
  let batchCount = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const currentName = (data.name || data.displayName || '').trim();
    if (!currentName) { skipped++; continue; }

    const { first, middle, last } = parseCurrentName(currentName);
    const normalizedLast = normalizeLast(last);

    const candidates = LAST_INDEX[normalizedLast];
    if (!candidates || !candidates.length) { skipped++; continue; }

    // Try match by first token
    const lowerFirst = first.toLowerCase();
    let match = candidates.find(c => c.firstToken === lowerFirst);

    // If no direct match, attempt partial contains (for cases where stored first is first token of composite)
    if (!match) {
      match = candidates.find(c => c.firstComposite.toLowerCase().startsWith(lowerFirst + ' '));
    }

    if (!match) { ambiguous++; continue; }

    const desired = match.desiredDisplayName; // already capitalized

    if (currentName === desired) { skipped++; continue; }

    // Build structured fields
    const firstCompositeTokens = match.firstComposite.split(/\s+/);
    const firstName = firstCompositeTokens[0];
    const secondName = firstCompositeTokens.slice(1).join(' ');
    const lastName = formatLast(match.lastUpper); // Title-case last

    const payload = {
      name: desired,
      displayName: desired,
      firstName: capitalizeWords(firstName),
      lastName: lastName,
    };
    if (secondName) {
      payload.secondName = capitalizeWords(secondName);
    }

    try {
      if (!DRY_RUN) {
        batch.update(doc.ref, payload);
        batchCount++;
        if (batchCount === 500) { await batch.commit(); batch = db.batch(); batchCount = 0; }
      }
      updates++;
      console.log(`[bulk-update] ${doc.id}: '${currentName}' -> '${desired}'`);
    } catch (e) {
      failed++;
      console.error(`[bulk-update] Failed ${doc.id}:`, e.message);
    }
  }

  if (!DRY_RUN && batchCount) await batch.commit();

  console.log('[bulk-update] Summary');
  console.log(`  Updates:   ${updates}`);
  console.log(`  Skipped:   ${skipped}`);
  console.log(`  Ambiguous: ${ambiguous}`);
  console.log(`  Failed:    ${failed}`);
  if (DRY_RUN) console.log('  (Dry run - no writes performed)');
}

run().then(() => { console.log('[bulk-update] Done'); process.exit(0); }).catch(e => { console.error(e); process.exit(1); });
