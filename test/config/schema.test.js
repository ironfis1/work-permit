import { describe, it, expect } from 'vitest';
import { validateConfigShape, ConfigValidationError, classifyRef } from '../../src/config/schema.js';

describe('classifyRef', () => {
  it('classifies owner/repo shapes as github-ref', () => {
    expect(classifyRef('ironfis1/work-permit')).toBe('github-ref');
  });

  it('classifies leading-dot/slash/tilde paths as local-path', () => {
    expect(classifyRef('./repo')).toBe('local-path');
    expect(classifyRef('/abs/repo')).toBe('local-path');
    expect(classifyRef('~/repo')).toBe('local-path');
  });

  it('classifies bare names with no slash as local-path', () => {
    expect(classifyRef('repo')).toBe('local-path');
  });

  it('classifies multi-segment, non-prefixed paths as invalid', () => {
    expect(classifyRef('a/b/c')).toBe('invalid');
  });
});

describe('validateConfigShape', () => {
  it('U1: parses a valid config object correctly, all fields typed as documented', () => {
    const result = validateConfigShape({
      targetRepo: 'ironfis1/work-permit',
      outputRepo: 'ironfis1/other-repo',
      standardsCorpus: './corpus',
    });
    expect(result).toEqual({
      targetRepo: 'ironfis1/work-permit',
      targetRepoType: 'github-ref',
      outputRepo: 'ironfis1/other-repo',
      outputRepoType: 'github-ref',
      standardsCorpus: './corpus',
    });
  });

  it('defaults outputRepo to targetRepo and standardsCorpus to null when omitted', () => {
    const result = validateConfigShape({ targetRepo: './some/local/repo' });
    expect(result.outputRepo).toBe('./some/local/repo');
    expect(result.standardsCorpus).toBeNull();
  });

  it('U2: rejects a config missing targetRepo with a field-specific error', () => {
    expect(() => validateConfigShape({})).toThrowError(ConfigValidationError);
    try {
      validateConfigShape({});
      throw new Error('expected to throw');
    } catch (err) {
      expect(err.field).toBe('targetRepo');
      expect(err.message).toMatch(/targetRepo/);
    }
  });

  it('U3: rejects targetRepo/outputRepo that are structurally invalid (neither valid path nor owner/repo shape)', () => {
    try {
      validateConfigShape({ targetRepo: 'owner/repo/extra-segment' });
      throw new Error('expected to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigValidationError);
      expect(err.field).toBe('targetRepo');
    }

    try {
      validateConfigShape({ targetRepo: './valid/local', outputRepo: 'owner/repo/extra' });
      throw new Error('expected to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigValidationError);
      expect(err.field).toBe('outputRepo');
    }
  });

  it('S2: rejects an unexpected field, including anything token-like, instead of silently accepting it', () => {
    try {
      validateConfigShape({ targetRepo: './x', token: 'gho_secret' });
      throw new Error('expected to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigValidationError);
      expect(err.field).toBe('token');
      expect(err.message).toMatch(/token/);
    }
  });

  it('rejects a non-object config', () => {
    expect(() => validateConfigShape(null)).toThrowError(ConfigValidationError);
    expect(() => validateConfigShape([])).toThrowError(ConfigValidationError);
    expect(() => validateConfigShape('nope')).toThrowError(ConfigValidationError);
  });

  it('S1: JSON has no tag/execution mechanism, so a payload shaped like a YAML exploit tag is treated as an inert, structurally-invalid string -- never executed', () => {
    try {
      validateConfigShape({ targetRepo: '!!python/object/apply:os.system ["echo hi"]' });
      throw new Error('expected to throw');
    } catch (err) {
      // Rejected for the mundane reason that it doesn't match a local path
      // or owner/repo shape -- confirming it was never interpreted as
      // anything beyond a literal string, let alone executed.
      expect(err).toBeInstanceOf(ConfigValidationError);
      expect(err.field).toBe('targetRepo');
    }
  });
});
