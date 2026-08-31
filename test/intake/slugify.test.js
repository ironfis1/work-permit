import { describe, it, expect } from 'vitest';
import { slugify } from '../../src/intake/slugify.js';

describe('slugify (U2: deterministic, filesystem-safe slug generation)', () => {
  it('lowercases and hyphenates plain text', () => {
    expect(slugify('Add Login Flow')).toBe('add-login-flow');
  });

  it('is deterministic for the same input', () => {
    expect(slugify('Ship the RAG pipeline')).toBe(slugify('Ship the RAG pipeline'));
  });

  it('strips diacritics', () => {
    expect(slugify('Café résumé')).toBe('cafe-resume');
  });

  it('collapses non-alphanumeric runs into a single hyphen and trims ends', () => {
    expect(slugify('  --Hello,   World!!--  ')).toBe('hello-world');
  });

  it('truncates to a reasonable length', () => {
    const slug = slugify('word '.repeat(50));
    expect(slug.length).toBeLessThanOrEqual(60);
  });

  it('never contains path-traversal characters against adversarial input', () => {
    const adversarial = [
      '../../etc/passwd',
      '..\\..\\windows\\system32',
      'a/b/../../c',
      'null\0byte',
      '~/.ssh/id_rsa',
      '%2e%2e%2fetc%2fpasswd',
    ];
    for (const input of adversarial) {
      const slug = slugify(input);
      expect(slug).toMatch(/^[a-z0-9-]+$/);
      expect(slug).not.toContain('..');
      expect(slug).not.toContain('/');
      expect(slug).not.toContain('\\');
      expect(slug).not.toContain('\0');
    }
  });

  it('falls back to "untitled" when nothing alphanumeric survives', () => {
    expect(slugify('!!!???---')).toBe('untitled');
  });
});
