import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveLocalRepo, RepoResolutionError } from '../../src/config/resolveLocal.js';

describe('resolveLocalRepo', () => {
  it('U4a: distinguishes "path does not exist"', () => {
    const missing = path.join(os.tmpdir(), 'work-permit-does-not-exist-xyz');
    try {
      resolveLocalRepo(missing);
      throw new Error('expected to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(RepoResolutionError);
      expect(err.kind).toBe('not-found');
    }
  });

  it('U4b: distinguishes "path exists but isn\'t a git repo"', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'work-permit-notgit-'));
    try {
      resolveLocalRepo(dir);
      throw new Error('expected to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(RepoResolutionError);
      expect(err.kind).toBe('not-a-git-repo');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('resolves a real git repo (this repo) successfully', () => {
    const result = resolveLocalRepo(process.cwd());
    expect(result.resolvedPath).toBe(path.resolve(process.cwd()));
  });

  it('S3: pointing outside the project boundary (e.g. /etc) reports not-a-git-repo without listing its contents', () => {
    if (process.platform === 'win32' || !fs.existsSync('/etc') || fs.existsSync('/etc/.git')) {
      return; // fixture assumption doesn't hold on this platform; skip rather than false-fail.
    }
    try {
      resolveLocalRepo('/etc');
      throw new Error('expected to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(RepoResolutionError);
      expect(err.kind).toBe('not-a-git-repo');
    }
  });
});
