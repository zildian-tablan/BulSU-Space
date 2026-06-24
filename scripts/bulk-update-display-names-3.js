// Third bulk name update for provided batch (LAST, First Middle Initials/Suffix)
// Usage: node scripts/bulk-update-display-names-3.js [--dry]

const path = require('path');
const admin = require('firebase-admin');
const DRY = process.argv.includes('--dry');
const serviceAccountPath = path.resolve(__dirname, '../server/serviceAccountKey.json');

function init() {
  if (admin.apps.length) return;
  const sa = require(serviceAccountPath);
  admin.initializeApp({ credential: admin.credential.cert(sa), databaseURL: 'https://bulsuspace.firebaseio.com' });
}

const RAW = `ALAPIDE, Sweet Arabella S
ANG, Denise Rain G
BARTOLOME, Pollyne Anne G
BAUTISTA, Aarhon Q.
CALONZO, MARTIN S
CARPIO, Jean Diane G
CASTRO, Genniviev DC.
CRISOSTOMO, Adrian S
DELA CRUZ, Kzel Britz D
DOMINGO, Allen Paulo S
FLORES, John Andrei D
FRANCIA, Gad Daniel Kellyn C
GASPAR, Harvey DR.
HALILI, Edrian Sedrik E
JAVIER, Mikel Kyan A
MENDOZA, Raflionel C
OCAMPO, Noel Rotsen B
PAGDANGANAN, Hanilhet R
PAHATI, Janelle S
PEREZ, Mark Jonel S
QUEROZ, Dave DJ.
RAMIREZ, Erica Mae DC.
SALAMAT, Mary Sharmain S
SUMALA, John Aldrin S
TIBON, Mark Angel S
VILLALON, Erica P
ANTONIO, Arnel Jr. DC.
AVILA, Paul David S
BALTAZAR, Jamille F
BORLONGAN, Mark Eros P
DELIMA, JENNY ROSE P
DIZON, John Samuel G
FAJARDO, Bea G
FAUSTINO, Lian Fonce F
HALILI, Jirelle Micah P
HORMIGAS, Roan L
JUGNO, Vincent Areff T.
LORETO, Arlene Joy C
MAGALING, Tom Justin C
MALONZO, James Kurt T.
MARTIN, Ronnel Vincent O
NICDAO, RALPH RHOVIN C.
PEREZ, Jan Christian C
PITALLANO, Jeian Kurt S
SANTOS, JONEE ROSE S
SARMIENTO, Sam Gabriel B
SIRON, Erika Nicole L
ANOR, MARCO
SANTOS CEDRICK E.`;

const SUFFIX = new Set(['jr','jr.','iii','ii','iv','v']);
const TRAILING = new Set(['jr','jr.','iii','ii','iv','v','dc','dc.','dr','dr.']);

function titleCase(token) {
  if (!token) return token;
  if (/^[A-Z]{2,}$/.test(token) && token.length <= 4) return token[0] + token.slice(1).toLowerCase();
  return token[0].toUpperCase() + token.slice(1).toLowerCase();
}
function preserveInitial(token) {
  if (/^[A-Za-z]{1,3}\.?$/.test(token)) return token.toUpperCase();
  return titleCase(token);
}
function normalizeLast(raw) {
  return raw.toLowerCase().replace(/\./g,'').trim();
}
function parseLine(line) {
  line = line.trim();
  if (!line) return null;
  // If missing comma (e.g. "SANTOS CEDRICK E.") attempt to insert after first token
  if (!line.includes(',')) {
    const parts = line.split(/\s+/);
    if (parts.length > 1) {
      line = parts[0] + ', ' + parts.slice(1).join(' ');
    }
  }
  const segs = line.split(',').map(s=>s.trim()).filter(Boolean);
  let lastPart='', suffixPart='', firstComposite='';
  if (segs.length === 2) { lastPart=segs[0]; firstComposite=segs[1]; }
  else if (segs.length >=3) { lastPart=segs[0]; suffixPart=segs[1]; firstComposite=segs.slice(2).join(' '); }
  else return null;

  const suffixNorm = suffixPart.toLowerCase();
  if (suffixPart && !SUFFIX.has(suffixNorm)) { firstComposite = suffixPart + ' ' + firstComposite; suffixPart=''; }

  let firstTokens = firstComposite.split(/\s+/).filter(Boolean);
  let trailing='';
  if (firstTokens.length) {
    const lt = firstTokens[firstTokens.length-1].replace(/\./,'').toLowerCase();
    if (TRAILING.has(lt)) trailing = firstTokens.pop();
  }
  const formattedFirst = firstTokens.map(preserveInitial).join(' ');
  const formattedLast = lastPart.split(/\s+/).filter(Boolean).map(preserveInitial).join(' ');
  const suffixes = [suffixPart,trailing].filter(Boolean).map(s=>s.toUpperCase());
  const desiredDisplayName = [formattedFirst, formattedLast, ...suffixes].join(' ').replace(/\s+/g,' ').trim();
  return {
    original: line,
    lastRaw: lastPart,
    lastNorm: normalizeLast(lastPart),
    firstTokenLower: (firstTokens[0]||'').toLowerCase(),
    firstTokens,
    desiredDisplayName
  };
}

const MAPPINGS = RAW.split(/\n+/).map(parseLine).filter(Boolean);
const BY_LAST = MAPPINGS.reduce((acc,m)=>{ acc[m.lastNorm]=acc[m.lastNorm]||[]; acc[m.lastNorm].push(m); return acc; },{});

function updatePayload(mapping) {
  const firstName = titleCase(mapping.firstTokens[0]||'');
  const secondName = mapping.firstTokens.slice(1).map(titleCase).join(' ');
  const lastName = mapping.lastRaw.split(/\s+/).map(titleCase).join(' ');
  return { name: mapping.desiredDisplayName, displayName: mapping.desiredDisplayName, firstName, lastName, ...(secondName?{secondName}:{}) };
}

async function run() {
  init();
  const db = admin.firestore();
  const snap = await db.collection('users').get();
  console.log(`[batch3] Loaded ${snap.size} user docs`);
  let updates=0, skipped=0, ambiguous=0, failed=0; let batch=db.batch(); let count=0;
  for (const doc of snap.docs) {
    const data = doc.data();
    const currentName = (data.name || data.displayName || '').trim();
    if (!currentName) { skipped++; continue; }
    const tokens = currentName.split(/\s+/);
    const firstLower = tokens[0].toLowerCase();
    // generate possible last spans (1-3 tokens)
    const spans=[]; for (let s=1;s<=Math.min(3,tokens.length);s++) spans.push(normalizeLast(tokens.slice(-s).join(' ')));
    let mapping=null; let localAmb=false;
    for (const lastNorm of spans.reverse()) {
      const candidates = BY_LAST[lastNorm];
      if (!candidates) continue;
      const exact = candidates.filter(c=>c.firstTokenLower===firstLower);
      if (exact.length===1) { mapping=exact[0]; break; }
      if (exact.length>1) { localAmb=true; break; }
    }
    if (localAmb) { ambiguous++; continue; }
    if (!mapping) { skipped++; continue; }
    if (currentName === mapping.desiredDisplayName) { skipped++; continue; }
    const payload = updatePayload(mapping);
    try {
      if (!DRY) {
        batch.update(doc.ref, payload); count++;
        if (count===500) { await batch.commit(); batch=db.batch(); count=0; }
      }
      updates++; console.log(`[batch3] ${doc.id}: '${currentName}' -> '${payload.name}'`);
    } catch (e) { failed++; console.error(`[batch3] Failed ${doc.id}:`, e.message); }
  }
  if (!DRY && count) await batch.commit();
  console.log('[batch3] Summary');
  console.log(`  Updates:   ${updates}`);
  console.log(`  Skipped:   ${skipped}`);
  console.log(`  Ambiguous: ${ambiguous}`);
  console.log(`  Failed:    ${failed}`);
  if (DRY) console.log('  (Dry run - no writes performed)');
}

run().then(()=>{ console.log('[batch3] Done'); process.exit(0); }).catch(e=>{ console.error(e); process.exit(1); });
