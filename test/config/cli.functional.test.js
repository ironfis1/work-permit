import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliPath = path.join(__dirname, '..', '..', 'src', 'cli.js');
const repoRoot = path.join(__dirname, '..', '..');

function runCli(args, envOverrides = {}) {
  return execFileAsync('node', [cliPath, ...args], {
    env: { ...process.env, ...envOverrides },
  });
}

let tmpDir;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'work-permit-cli-'));
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// These are end-to-end tests per the story's functional test plan: they
// invoke the real CLI process and, for the GitHub-ref cases, the real
// GitHub REST API. F2/F3 only need public, unauthenticated requests, so
// they don't depend on any CI secret.
describe('work-permit config validate (functional, end-to-end)', () => {
  it('F1: succeeds against a real local clone (this repo, used as its own fixture)', async () => {
    const configPath = path.join(tmpDir, 'local-valid.json');
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- test fixture path built from mkdtempSync(), not user input
    fs.writeFileSync(configPath, JSON.stringify({ targetRepo: repoRoot }));

    const { stdout } = await runCli(['config', 'validate', '--config', configPath]);
    expect(stdout).toMatch(/targetRepo resolved/);
    expect(stdout).toMatch(path.resolve(repoRoot));
    expect(stdout).toMatch(/Config is valid/);
  });

  it('F2: fails against a real but nonexistent GitHub repo reference with a 404-specific message', async () => {
    const configPath = path.join(tmpDir, 'github-404.json');
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- test fixture path built from mkdtempSync(), not user input
    fs.writeFileSync(
      configPath,
      JSON.stringify({ targetRepo: 'ironfis1/definitely-does-not-exist-wp-fixture' })
    );

    await expect(
      runCli(['config', 'validate', '--config', configPath], { GH_TOKEN: '' })
    ).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringMatching(/not found/i),
    });
  });

  it('F3: fails with an auth-specific message (not conflated with "not found") when GH_TOKEN is invalid', async () => {
    const configPath = path.join(tmpDir, 'github-badtoken.json');
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- test fixture path built from mkdtempSync(), not user input
    fs.writeFileSync(configPath, JSON.stringify({ targetRepo: 'ironfis1/work-permit' }));

    await expect(
      runCli(['config', 'validate', '--config', configPath], {
        GH_TOKEN: 'obviously-invalid-token-value',
      })
    ).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringMatching(/not authenticated/i),
    });
  });

  it('fails against a missing config file, naming that the file is missing', async () => {
    const configPath = path.join(tmpDir, 'does-not-exist.json');
    await expect(runCli(['config', 'validate', '--config', configPath])).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringMatching(/not found/i),
    });
  });

  it('fails against a malformed config, naming the missing field', async () => {
    const configPath = path.join(tmpDir, 'missing-field.json');
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- test fixture path built from mkdtempSync(), not user input
    fs.writeFileSync(configPath, JSON.stringify({ standardsCorpus: './x' }));

    await expect(runCli(['config', 'validate', '--config', configPath])).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringMatching(/targetRepo/),
    });
  });
});
