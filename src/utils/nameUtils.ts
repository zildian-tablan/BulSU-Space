/**
 * Name formatting utilities
 * Provides helpers to normalize personal names to proper case.
 */

/**
 * Proper-case a single word, preserving common delimiters like hyphens and apostrophes.
 * Examples:
 *  - "O'BRIEN" -> "O'Brien"
 *  - "ANNE-MARIE" -> "Anne-Marie"
 */
const properCaseWord = (word: string): string => {
  if (!word) return '';

  // Keep delimiters and proper-case each alpha segment
  const parts = word.split(/([-'’])/g); // capture delimiters to keep them
  return parts
    .map((part) => {
      // Return delimiters as-is
      if (part === '-' || part === "'" || part === '’') return part;

      // For alphanumeric segments, uppercase first letter character and lowercase the rest
      // Use locale-aware casing for better diacritic handling
      const lower = part.toLocaleLowerCase();
      if (lower.length === 0) return lower;
      return lower.charAt(0).toLocaleUpperCase() + lower.slice(1);
    })
    .join('');
};

/**
 * Convert a name string to proper case:
 * - Trims whitespace and collapses multiple spaces
 * - Proper-cases each word
 * - Preserves hyphens and apostrophes within words
 *
 * Examples:
 *  - "JOHN DOE" -> "John Doe"
 *  - "John DOE" -> "John Doe"
 *  - "  ANNE   MARIE  " -> "Anne Marie"
 */
export const properCaseName = (input: string | undefined | null): string => {
  if (!input || typeof input !== 'string') return '';
  const trimmed = input.trim().replace(/\s+/g, ' ');
  if (!trimmed) return '';

  return trimmed
    .split(' ')
    .map((w) => properCaseWord(w))
    .join(' ');
};

/**
 * Proper-case a full name that may include first/middle/last in one string.
 * Alias for properCaseName for clarity.
 */
export const properCaseFullName = (input: string | undefined | null): string => properCaseName(input);

export default properCaseName;
