const leoProfanity = require('leo-profanity');
const badwords = require('../src/utils/badwords.json');

leoProfanity.clearList();
leoProfanity.add(badwords.en || []);
leoProfanity.add(badwords.tl || []);

console.log('Loaded profanities count:', leoProfanity.list().length);
console.log('Contains "bobo" in list?', leoProfanity.list().map(w => w.toLowerCase()).includes('bobo'));

const leetMap = {
  '1': 'i','!': 'i','3': 'e','4': 'a','@': 'a','5': 's','$': 's','7': 't','0': 'o','9': 'g','8': 'b','|': 'i','€':'e','£':'l','¥':'y','¢':'c','(': 'c','+':'t','?':'q','§':'s','2':'z','6':'g','*':'a','^':'a','%':'p','#':'h','>':'v','<':'v','/':'i','\\':'v',';':'i','_':' ',' .':' ',',':' '
};

function normalizeContent(content) {
  let normalized = content.normalize('NFKC').toLowerCase();
  try {
    normalized = normalized.normalize('NFKD').replace(/\p{M}/gu, '');
  } catch (e) {
    normalized = normalized.replace(/[\u0300-\u036f]/g, '');
  }
  normalized = normalized.split('').map(c => leetMap[c] || c).join('');
  normalized = normalized.replace(/(.)\1+/g, '$1');
  normalized = normalized.replace(/\b(?:[a-zA-Z](?:\W+[a-zA-Z]){2,})\b/g, m => m.replace(/[^a-zA-Z]/g, ''));
  let spaceSeparated = normalized.replace(/([^\w\s]|[\d])/g, ' $1 ');
  let noZero = spaceSeparated.replace(/[\u200B-\u200D\uFEFF]/g, '');
  noZero = noZero.replace(/vv/g, 'w').replace(/ph/g, 'f').replace(/0ne/g, 'one').replace(/z3r0/g, 'zero');
  noZero = noZero.replace(/\|{2,}/g, 'gg');
  return noZero;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function detectProfanityJS(content) {
  const normalized = normalizeContent(content);
  const normalizedLettersOnly = normalized.replace(/[^a-zA-Z]/g, ' ');
  // debugging
  // console.log('normalized:', JSON.stringify(normalized));
  // console.log('normalizedLettersOnly:', JSON.stringify(normalizedLettersOnly));
  const profaneSet = new Set(leoProfanity.list().map(w => w.toLowerCase()));
  const found = new Set();
  for (const w of profaneSet) {
    if (!w || w.length < 2) continue;
    const pattern = new RegExp('(^|[^a-zA-Z])' + escapeRegex(w) + '($|[^a-zA-Z])', 'i');
    if (pattern.test(normalizedLettersOnly)) found.add(w);
  }
  return Array.from(found);
}

const tests = [
  'wow bobo',
  'wowbobo',
  'wow, bobo!',
  'wowbobo wow',
  'this is a bobo test',
  'boboman',
  'wow bobong',
];

for (const t of tests) {
  const normalized = normalizeContent(t);
  const normalizedLettersOnly = normalized.replace(/[^a-zA-Z]/g, ' ');
  console.log('---');
  console.log('input:', JSON.stringify(t));
  console.log('normalized:', JSON.stringify(normalized));
  console.log('normalizedLettersOnly:', JSON.stringify(normalizedLettersOnly));
  console.log('detected =>', detectProfanityJS(t));
}
