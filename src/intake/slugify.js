const MAX_SLUG_LENGTH = 60;

/**
 * Turns raw intake text into a deterministic, filesystem-safe slug. Only
 * lowercase a-z0-9 and single hyphens ever survive, so the result can
 * never contain path-traversal characters ("..", "/", null bytes, etc.)
 * regardless of what's in the input -- this is what keeps intake
 * filenames (built from this slug) confined to the intake directory.
 */
export function slugify(text) {
  const normalized = text
    .toString()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip combining diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  const truncated = normalized.slice(0, MAX_SLUG_LENGTH).replace(/-+$/g, '');
  return truncated.length > 0 ? truncated : 'untitled';
}
