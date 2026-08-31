import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  writeIntake,
  listIntakes,
  validateIntakeText,
  IntakeValidationError,
  MAX_INPUT_BYTES,
} from '../../src/intake/store.js';

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'work-permit-store-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('validateIntakeText', () => {
  it('rejects empty input', () => {
    expect(() => validateIntakeText('')).toThrow(IntakeValidationError);
  });

  it('rejects whitespace-only input', () => {
    expect(() => validateIntakeText('   \n\t  ')).toThrow(IntakeValidationError);
  });

  it('U3: accepts input at exactly the size boundary', () => {
    const atLimit = 'a'.repeat(MAX_INPUT_BYTES);
    expect(() => validateIntakeText(atLimit)).not.toThrow();
  });

  it('U3: rejects input exactly one byte over the size boundary', () => {
    const overLimit = 'a'.repeat(MAX_INPUT_BYTES + 1);
    let error;
    try {
      validateIntakeText(overLimit);
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(IntakeValidationError);
    expect(error.kind).toBe('too-large');
  });

  it('distinguishes empty from oversized with specific error messages', () => {
    let emptyErr;
    try {
      validateIntakeText('');
    } catch (err) {
      emptyErr = err;
    }
    let largeErr;
    try {
      validateIntakeText('a'.repeat(MAX_INPUT_BYTES + 1));
    } catch (err) {
      largeErr = err;
    }
    expect(emptyErr.message).not.toBe(largeErr.message);
    expect(emptyErr.kind).toBe('empty');
    expect(largeErr.kind).toBe('too-large');
  });
});

describe('writeIntake / listIntakes (U1, U4)', () => {
  it('U1: writes a single artifact with correct schema for each source', () => {
    for (const source of ['text', 'file', 'stdin']) {
      const { filePath, artifact } = writeIntake({
        text: `goal via ${source}`,
        source,
        targetRepo: 'owner/repo',
        cwd: tmpDir,
      });

      // eslint-disable-next-line security/detect-non-literal-fs-filename -- test fixture path built from mkdtempSync(), not external input
      expect(fs.existsSync(filePath)).toBe(true);
      expect(artifact).toMatchObject({
        source,
        targetRepo: 'owner/repo',
        text: `goal via ${source}`,
      });
      expect(typeof artifact.intakeId).toBe('string');
      expect(artifact.intakeId.length).toBeGreaterThan(0);
      expect(() => new Date(artifact.timestamp).toISOString()).not.toThrow();

      // eslint-disable-next-line security/detect-non-literal-fs-filename -- test fixture path built from mkdtempSync(), not external input
      const onDisk = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      expect(onDisk).toEqual(artifact);
    }
  });

  it('S1: confines the artifact file to the intake dir even for adversarial text', () => {
    const adversarial = '../../etc/passwd \0 ' + 'x'.repeat(200);
    const { filePath } = writeIntake({
      text: adversarial,
      source: 'text',
      targetRepo: 'owner/repo',
      cwd: tmpDir,
    });

    const expectedDir = path.join(tmpDir, '.work-permit', 'intake');
    expect(path.dirname(filePath)).toBe(expectedDir);
    expect(path.resolve(filePath).startsWith(path.resolve(expectedDir) + path.sep)).toBe(true);
  });

  it('S2: stores shell-metacharacter-laden text inert and returns it byte-for-byte', () => {
    const dangerous = 'do the thing; rm -rf / `touch pwned` $(whoami) && echo hi';
    const { artifact, filePath } = writeIntake({
      text: dangerous,
      source: 'text',
      targetRepo: 'owner/repo',
      cwd: tmpDir,
    });

    expect(artifact.text).toBe(dangerous);
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- test fixture path built from mkdtempSync(), not external input
    const onDisk = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    expect(onDisk.text).toBe(dangerous);
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- test fixture path built from mkdtempSync(), not external input
    expect(fs.existsSync(path.join(tmpDir, 'pwned'))).toBe(false);
  });

  it('rejects empty/oversized text before ever writing a file', () => {
    expect(() =>
      writeIntake({ text: '   ', source: 'text', targetRepo: 'owner/repo', cwd: tmpDir })
    ).toThrow(IntakeValidationError);
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- test fixture path built from mkdtempSync(), not external input
    expect(fs.existsSync(path.join(tmpDir, '.work-permit'))).toBe(false);
  });

  it('U4: intake list returns [] when nothing has been captured yet', () => {
    expect(listIntakes({ targetRepo: 'owner/repo', cwd: tmpDir })).toEqual([]);
  });

  it('U4: sorts by timestamp, most recent first', () => {
    writeIntake({ text: 'first', source: 'text', targetRepo: 'owner/repo', cwd: tmpDir });
    writeIntake({ text: 'second', source: 'text', targetRepo: 'owner/repo', cwd: tmpDir });
    writeIntake({ text: 'third', source: 'text', targetRepo: 'owner/repo', cwd: tmpDir });

    const intakes = listIntakes({ targetRepo: 'owner/repo', cwd: tmpDir });
    const timestamps = intakes.map((i) => i.timestamp);
    const sorted = [...timestamps].sort().reverse();
    expect(timestamps).toEqual(sorted);
  });

  it('U4: filters strictly by the current targetRepo, not commingled', () => {
    writeIntake({ text: 'for repo a', source: 'text', targetRepo: 'owner/repo-a', cwd: tmpDir });
    writeIntake({ text: 'for repo b', source: 'text', targetRepo: 'owner/repo-b', cwd: tmpDir });

    const forA = listIntakes({ targetRepo: 'owner/repo-a', cwd: tmpDir });
    const forB = listIntakes({ targetRepo: 'owner/repo-b', cwd: tmpDir });

    expect(forA).toHaveLength(1);
    expect(forA[0].text).toBe('for repo a');
    expect(forB).toHaveLength(1);
    expect(forB[0].text).toBe('for repo b');
  });
});
