// Use ts-node to require TypeScript modules directly for quick testing
require('ts-node/register/transpile-only');
const path = require('path');
const { detectProfanity } = require(path.join(__dirname, '..', 'src', 'utils', 'profanityFilter'));

const samples = [
  'fuck',
  'fuuuuck',
  'FuCk',
  'FUCK',
  'f.u.c.k',
  'f u c k',
  'b1tch',
  'BItCh',
  'b!tch',
  'ni||er',
  'n i g g e r',
  'NiGgEr',
  'sick (positive slang)',
  'assassin',
  'k0k0l0',
  'putang ina mo',
  'salamat',
  'p h o n e',
  'phuck',
  'f*cking',
  'f_ck',
  'f\u200B\u200C\u200D\uFEFFu c k', // zero width chars inserted
  'Fu.Ck',
  'F U C K',
  'fUcKiNg'
];

for (const s of samples) {
  try {
    const detected = detectProfanity(s);
    console.log(JSON.stringify({ input: s, detected }));
  } catch (err) {
    console.error('Error processing', s, err && err.message);
  }
}
