import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveIntakeInput, IntakeInputError } from '../../src/intake/readInput.js';
import { MAX_INPUT_BYTES } from '../../src/intake/store.js';

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'work-permit-readinput-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('resolveIntakeInput', () => {
  it('resolves --text as the "text" source', async () => {
    const result = await resolveIntakeInput({ text: 'a goal', stdinIsTTY: true });
    expect(result).toEqual({ text: 'a goal', source: 'text' });
  });

  it('resolves --file as the "file" source', async () => {
    const filePath = path.join(tmpDir, 'goal.md');
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- test fixture path built from mkdtempSync(), not external input
    fs.writeFileSync(filePath, 'goal from a file');
    const result = await resolveIntakeInput({ file: filePath, cwd: tmpDir, stdinIsTTY: true });
    expect(result).toEqual({ text: 'goal from a file', source: 'file' });
  });

  it('resolves a relative --file path against cwd', async () => {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- test fixture path built from mkdtempSync(), not external input
    fs.writeFileSync(path.join(tmpDir, 'goal.md'), 'relative goal');
    const result = await resolveIntakeInput({ file: 'goal.md', cwd: tmpDir, stdinIsTTY: true });
    expect(result).toEqual({ text: 'relative goal', source: 'file' });
  });

  it('rejects --text and --file supplied together', async () => {
    await expect(
      resolveIntakeInput({ text: 'a', file: 'b.md', stdinIsTTY: true })
    ).rejects.toThrow(IntakeInputError);
  });

  it('rejects no input source when stdin is an interactive TTY', async () => {
    await expect(resolveIntakeInput({ stdinIsTTY: true })).rejects.toThrow(IntakeInputError);
  });

  it('rejects a --file path that does not exist', async () => {
    await expect(
      resolveIntakeInput({ file: path.join(tmpDir, 'nope.md'), cwd: tmpDir, stdinIsTTY: true })
    ).rejects.toMatchObject({ message: expect.stringMatching(/not found/i) });
  });

  it('rejects a --file over the size cap without reading past the boundary', async () => {
    const filePath = path.join(tmpDir, 'big.md');
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- test fixture path built from mkdtempSync(), not external input
    fs.writeFileSync(filePath, 'a'.repeat(MAX_INPUT_BYTES + 1));
    await expect(
      resolveIntakeInput({ file: filePath, cwd: tmpDir, stdinIsTTY: true })
    ).rejects.toMatchObject({ message: expect.stringMatching(/exceeds/i) });
  });

  it('accepts a --file at exactly the size cap', async () => {
    const filePath = path.join(tmpDir, 'exact.md');
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- test fixture path built from mkdtempSync(), not external input
    fs.writeFileSync(filePath, 'a'.repeat(MAX_INPUT_BYTES));
    const result = await resolveIntakeInput({ file: filePath, cwd: tmpDir, stdinIsTTY: true });
    expect(result.text.length).toBe(MAX_INPUT_BYTES);
  });

  it('rejects a non-UTF8 (binary) --file with a specific, non-crashing error', async () => {
    const filePath = path.join(tmpDir, 'binary.dat');
    // Lone continuation byte + truncated multi-byte sequence: invalid UTF-8.
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- test fixture path built from mkdtempSync(), not external input
    fs.writeFileSync(filePath, Buffer.from([0xff, 0xfe, 0x00, 0xc3, 0x28]));
    await expect(
      resolveIntakeInput({ file: filePath, cwd: tmpDir, stdinIsTTY: true })
    ).rejects.toMatchObject({ message: expect.stringMatching(/utf-8/i) });
  });
});
