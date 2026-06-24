
import leoProfanity from 'leo-profanity';
import badwords from './badwords.json';

// Load English and Tagalog bad words into leo-profanity
leoProfanity.clearList();
leoProfanity.add(badwords.en);
leoProfanity.add(badwords.tl);

// Map of common leetspeak/substitution characters to their alphabetic equivalents
const leetMap: Record<string, string> = {
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '0': 'o',
  '9': 'g',
  '8': 'b',
  '€': 'e',
  '£': 'l',
  '¥': 'y',
  '¢': 'c',
  '(': 'c',
  '+': 't',
  '§': 's',
  '2': 'z',
  '6': 'g',
  '*': 'u',
  '^': 'a',
  '_': ' ', // underscore to space conversion
  '.': ' ', // period to space conversion
  ',': ' ', // comma to space conversion
};

// Characters that behave like letters when sandwiched between alphanumerics
// but should become separators when leading/trailing a word.
const contextualLeetMap: Record<string, string> = {
  '!': 'i',
  '@': 'a',
  '#': 'h',
  '%': 'p',
  '$': 's',
  '?': 'i',
  '>': 'v',
  '<': 'v',
  '/': 'i',
  '\\': 'v',
  ';': 'i',
  '|': 'i',
};

function normalizeContent(content: string): string {
  // Unicode normalize first
  let normalized = content.normalize('NFKC').toLowerCase();

  // Remove diacritics (accents) so letters like é -> e
  try {
    normalized = normalized.normalize('NFKD').replace(/\p{M}/gu, '');
  } catch (e) {
    // If environment doesn't support Unicode property escapes, fall back to a simpler removal
    normalized = normalized.replace(/[\u0300-\u036f]/g, '');
  }

  const chars = Array.from(normalized);
  const isAlphaNumeric = (value: string) => /[a-z0-9]/.test(value);

  // Replace leet characters while keeping track of surrounding context so that
  // punctuation used as a prefix/suffix stays as a separator instead of
  // becoming a bogus leading letter.
  normalized = chars
    .map((char, index) => {
      const prev = chars[index - 1] ?? ' ';
      const next = chars[index + 1] ?? ' ';

      if (contextualLeetMap[char]) {
        const prevIsAlphaNum = isAlphaNumeric(prev);
        const nextIsAlphaNum = isAlphaNumeric(next);
        if (prevIsAlphaNum && nextIsAlphaNum) {
          return contextualLeetMap[char];
        }
        return ' ';
      }

      return leetMap[char] || char;
    })
    .join('');

  // Collapse repeated characters to a single instance (e.g., 'fuuuuck' -> 'fuck')
  normalized = normalized.replace(/(.)\1+/g, '$1');

  // Collapse common obfuscation patterns where single letters are separated by non-letters
  // e.g., "f.u.c.k" or "f u c k" -> "fuck"
  // Use a stricter pattern: match a single letter followed by one or more non-letter separators
  // and another single letter, repeated at least twice. This avoids collapsing normal words
  // like "wow bobo" into "wowbobo".
  normalized = normalized.replace(/\b(?:[a-zA-Z](?:\W+[a-zA-Z]){2,})\b/g, match => {
    return match.replace(/[^a-zA-Z]/g, '');
  });

  // Add spaces around numbers and special characters to prevent character hiding
  // This helps catch things like "f*u*c*k" or "b1tc3h"
  let spaceSeparated = normalized.replace(/([^\w\s]|[\d])/g, ' $1 ');

  // Remove zero-width characters which might be used to break up words
  let noZeroWidth = spaceSeparated.replace(/[\u200B-\u200D\uFEFF]/g, '');

  // Replace a few common letter-sequence normalizations
  noZeroWidth = noZeroWidth
    .replace(/vv/g, 'w') // vv -> w
    .replace(/ph/g, 'f') // ph -> f
    .replace(/0ne/g, 'one') // 0ne -> one
    .replace(/z3r0/g, 'zero'); // z3r0 -> zero

  // Fix common pipe-based obfuscation like "ni||er" -> replace double pipes with 'gg'
  noZeroWidth = noZeroWidth.replace(/\|{2,}/g, 'gg');

  return noZeroWidth;
}

export function detectProfanity(content: string): string[] {
  const normalized = normalizeContent(content);
  // A version of normalized content where non-letters are converted to spaces
  const normalizedLettersOnly = normalized.replace(/[^a-zA-Z]/g, ' ');
  // Build a set of profane words for fast lookup
  const profaneSet = new Set(leoProfanity.list().map(w => w.toLowerCase()));

  function escapeRegex(s: string) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // Tokenize normalized content into ASCII letter-only tokens (ES5/TS friendly)
  const tokens: string[] = (normalized.match(/[a-zA-Z]+/g) || []).map(t => t.toLowerCase());

  const found = new Set<string>();

  // First pass: whole-word check against normalized content to catch words embedded in punctuation
  for (const w of profaneSet) {
    if (!w || w.length < 2) continue;
    const pattern = new RegExp('(^|[^a-zA-Z])' + escapeRegex(w) + '($|[^a-zA-Z])', 'i');
    if (pattern.test(normalizedLettersOnly)) {
      found.add(w);
    }
  }

  if (found.size === 0) {
    // Fallback token-based checks (handles stems, slight obfuscations)
    for (const tok of tokens) {
      if (profaneSet.has(tok)) {
        found.add(tok);
        continue;
      }

      const cleaned = tok.replace(/[^a-z]/g, '');
      if (cleaned && profaneSet.has(cleaned)) {
        found.add(cleaned);
        continue;
      }

      for (const suf of ['ing', 'ed', 's']) {
        if (cleaned.endsWith(suf)) {
          const base = cleaned.slice(0, -suf.length);
          if (base && profaneSet.has(base)) {
            found.add(base);
            break;
          }
        }
      }
    }
  }

  return Array.from(found);
} 