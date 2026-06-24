import { detectProfanity } from '../src/utils/profanityFilter';

const cases = [
  '/bobo',
  '#bobo',
  '%tanga',
  '$bobo',
  '?bobo',
  '!bobo',
  'b!tch',
  'bobo',
  'tanga',
  'f*ck',
  'sh1t',
  'hello world',
  'wow bobo',
  'wowbobo',
];

for (const text of cases) {
  const detected = detectProfanity(text);
  console.log(`${text} ->`, detected.length ? detected : 'clean');
}
