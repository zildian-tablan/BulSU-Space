// Second bulk name update script for lines formatted as
// LAST_PART[, optional suffix part], First Middle/Initial Parts
// Example lines:
// APOSTOL, John Bernard L
// IGNACIO, Jr., Manuel G.
// CRUZ, Basilio C III
// Usage: node scripts/bulk-update-display-names-2.js [--dry]

const path = require('path');
const admin = require('firebase-admin');
const DRY_RUN = process.argv.includes('--dry');
const serviceAccountPath = path.resolve(__dirname, '../server/serviceAccountKey.json');

function init() {
  if (admin.apps.length) return;
  try {
    const sa = require(serviceAccountPath);
    admin.initializeApp({ credential: admin.credential.cert(sa), databaseURL: 'https://bulsuspace.firebaseio.com' });
  } catch (e) {
    console.error('[bulk2] Service account load failed:', e.message);
    process.exit(1);
  }
}

// Provided raw list (lines may contain periods and suffix segments)
const RAW = `APOSTOL, John Bernard L
AQUINO, Karylle J.
BALUYOT, Anilov Jamil U
BALUYOT, JOHN ROY S.
BUENSUCESO, Justine Joy B
CALONZO, Carmela R
DEL CASTILLO, Rica Mae T
EBRADA, Reih Allen S
ELIGIO, Jemelyn C
FAJARDO JR, CRISANTO E
GUTIERREZ, Krisha Marie P
HEWA KALUANNAKKAGE, Binara Osanda Miguel P.P
IGNACIO, Jr., Manuel G.
LAPAZ, Charles Andrei C
ARCEGA, MISAEL C.
MURAMATSU, Akira L
PAÑA, Rachelle Dahl V
PEREZ, Raizen Lheluer P
RAMOS, Llana B
ROQUE, John Michael G
SANCHEZ, Dhanrei AL M
SANTIAGO, Miyuki G
SANTOS, Bryan A.
SANTOS, Rodner L.
SOLLESTRE, Laurisse Anne L
SUAREZ, Leo A
SUMALA, Nonilone B
UMALI, Airel Vince J
CAPARAS, Marivic R
CRUZ, Basilio C III
DE GUZMAN, Dex Roduel DC
DELA CRUZ, Rhayzzie Juslene G
DE LEON, Bryan Dominic R
DE LEON, Jan Meryk C
GUEVARRA, Raven S
HALILI, Justine G
HAWA, Eduard T
JARALVE, Daniella DJ.
LOPEZ, Kateleen Joy L
MAGNO, Kirsten M
MANALO, Tyron Rex P
MATEO, Darwin C
PEREZ, Richnie V
PEREZ, ROMARICA MAE L
REFORMA, Vladimir Jose L
REYES, Christine Joy P
REYES, Rica Mae A
SANTOS, Marcel Grachzelli T
SEBASTIAN, Angelo DC
SIBULAN, Johnmarkhel V
VENTUCILLO, John Kirby E
VILLANUEVA, Mark Renz I
BAUTISTA, KLINT REMIEL P.
BAUTISTA, MARC JOSEPH G.`;

const SUFFIX_TOKENS = new Set(['jr','jr.','iii','ii','iv']);
const TRAILING_SUFFIX_TOKENS = new Set(['jr','jr.','iii','ii','iv','dc']); // include DC as possible course initials suffix

function titleCaseWord(w) {
  if (!w) return w;
  if (/^[A-Z]{2,}$/.test(w) && w.length <= 4) return w.charAt(0) + w.slice(1).toLowerCase();
  return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
}
function preserveInitial(token) {
  if (/^[A-Za-z]{1,2}\.?$/.test(token)) return token.toUpperCase().endsWith('.') ? token.toUpperCase() : token.toUpperCase();
  return titleCaseWord(token);
}
function formatNameSegment(segment) {
  return segment.split(/\s+/).filter(Boolean).map(preserveInitial).join(' ');
}
function normalizeLastForMatch(lastComposite) {
  return lastComposite.toLowerCase().replace(/\./g,'').trim();
}
function parseLine(line) {
  let original = line.trim();
  if (!original) return null;
  const parts = original.split(',').map(p => p.trim()).filter(Boolean);
  let lastPart = ''; let suffixPart = ''; let firstComposite = '';
  if (parts.length === 1) {
    // No comma, attempt split by space (fallback)
    return null;
  } else if (parts.length === 2) {
    lastPart = parts[0];
    firstComposite = parts[1];
  } else if (parts.length >= 3) {
    // Assume pattern LAST, SUFFIX, FIRSTCOMPOSITE
    lastPart = parts[0];
    suffixPart = parts[1];
    firstComposite = parts.slice(2).join(' ');
  }

  // If suffixPart looks like a suffix token keep; else maybe part of firstComposite
  const suffixNorm = suffixPart.toLowerCase();
  if (suffixPart && !SUFFIX_TOKENS.has(suffixNorm)) {
    // Merge back into first composite
    firstComposite = suffixPart + ' ' + firstComposite;
    suffixPart = '';
  }

  // Title case last (handle multi-word particles like DE, DELA, etc.)
  const lastTokens = lastPart.split(/\s+/).filter(Boolean).map(t => {
    if (/^(DE|DEL|DELA|LA|LE|VAN|VON|DA|DOS|LAS|LOS)$/i.test(t)) return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
    return titleCaseWord(t);
  });

  // Handle trailing suffix like III after first composite tokens
  let firstTokens = firstComposite.split(/\s+/).filter(Boolean);
  let trailingSuffix = '';
  if (firstTokens.length) {
    const lastToken = firstTokens[firstTokens.length - 1].replace(/\./,'').toLowerCase();
    if (TRAILING_SUFFIX_TOKENS.has(lastToken)) {
      trailingSuffix = firstTokens.pop();
    }
  }

  const formattedFirstComposite = firstTokens.map(preserveInitial).join(' ');
  const formattedLast = lastTokens.map(preserveInitial).join(' ');
  const formattedSuffixes = [suffixPart, trailingSuffix].filter(Boolean).map(s => s.toUpperCase());

  const desiredDisplayName = [formattedFirstComposite, formattedLast, ...formattedSuffixes].join(' ').replace(/\s+/g,' ').trim();

  const firstTokenLower = firstTokens[0] ? firstTokens[0].toLowerCase() : '';
  return {
    original,
    lastRaw: lastPart,
    lastNormalized: normalizeLastForMatch(lastPart),
    suffixes: formattedSuffixes,
    firstCompositeRaw: firstComposite,
    firstTokens,
    firstTokenLower,
    desiredDisplayName
  };
}

const MAPPINGS = RAW.split(/\n+/).map(parseLine).filter(Boolean);
const BY_LAST = MAPPINGS.reduce((acc,m)=>{ acc[m.lastNormalized] = acc[m.lastNormalized]||[]; acc[m.lastNormalized].push(m); return acc; },{});

function splitCurrentName(name) {
  if (!name) return { firstTokenLower:'', lastNorm:'', name };
  const tokens = name.trim().split(/\s+/);
  const firstTokenLower = tokens[0].toLowerCase();
  const lastTokenSequence = tokens.slice(-4).join(' '); // heuristic
  return { firstTokenLower, lastNorm: normalizeLastForMatch(tokens[tokens.length-1]), name };
}

async function run() {
  init();
  const db = admin.firestore();
  const snapshot = await db.collection('users').get();
  console.log(`[bulk2] Loaded ${snapshot.size} user docs`);
  let updates=0, skipped=0, ambiguous=0, failed=0;
  let batch = db.batch(); let batchCount=0;

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const currentName = (data.name || data.displayName || '').trim();
    if (!currentName) { skipped++; continue; }

    // Determine current last name (try parsing by known particles) - simpler: last token(s) matching mapping lastNormalized
    // Build candidate normals for multi-word last names (up to 3 tokens)
    const tokens = currentName.split(/\s+/);
    const possibilities = [];
    for (let span=1; span<=Math.min(3,tokens.length); span++) {
      const slice = tokens.slice(-span).join(' ');
      possibilities.push(normalizeLastForMatch(slice));
    }
    let matchedMapping = null;
    let localAmbiguous = false;
    const firstLower = tokens[0].toLowerCase();
    // Prioritize longest last-name match (reverse possibilities array)
    for (const poss of possibilities.reverse()) {
      const candidates = BY_LAST[poss];
      if (!candidates) continue;
      const exactFirstMatches = candidates.filter(c => c.firstTokenLower === firstLower);
      if (exactFirstMatches.length === 1) {
        matchedMapping = exactFirstMatches[0];
        break;
      } else if (exactFirstMatches.length > 1) {
        localAmbiguous = true;
        break; // ambiguous for this last form
      } else {
        // no exact first token match; skip this last form (do NOT fallback to arbitrary candidate)
        continue;
      }
    }
    if (localAmbiguous) { ambiguous++; continue; }
    if (!matchedMapping) { skipped++; continue; }

    const desired = matchedMapping.desiredDisplayName;
    if (currentName === desired) { skipped++; continue; }

    // Prepare structured fields
    const displayTokens = desired.split(/\s+/);
    const lastNameTokens = matchedMapping.lastRaw.split(/\s+/).filter(Boolean).map(titleCaseWord);
    const firstCompositeTokens = matchedMapping.firstTokens.map(titleCaseWord);
    const firstName = firstCompositeTokens[0];
    const secondName = firstCompositeTokens.slice(1).join(' ');
    const lastName = lastNameTokens.map(titleCaseWord).join(' ');

    const payload = { name: desired, displayName: desired, firstName, lastName };
    if (secondName) payload.secondName = secondName;

    try {
      if (!DRY_RUN) {
        batch.update(doc.ref, payload);
        batchCount++;
        if (batchCount === 500) { await batch.commit(); batch = db.batch(); batchCount=0; }
      }
      updates++;
      console.log(`[bulk2] ${doc.id}: '${currentName}' -> '${desired}'`);
    } catch (e) {
      failed++; console.error(`[bulk2] Failed ${doc.id}:`, e.message);
    }
  }

  if (!DRY_RUN && batchCount) await batch.commit();

  console.log('[bulk2] Summary');
  console.log(`  Updates:   ${updates}`);
  console.log(`  Skipped:   ${skipped}`);
  console.log(`  Ambiguous: ${ambiguous}`);
  console.log(`  Failed:    ${failed}`);
  if (DRY_RUN) console.log('  (Dry run - no writes performed)');
}

run().then(()=>{ console.log('[bulk2] Done'); process.exit(0); }).catch(e=>{ console.error(e); process.exit(1); });
