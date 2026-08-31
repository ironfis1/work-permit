import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFileCb);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliPath = path.join(__dirname, '..', '..', 'src', 'cli.js');

let tmpDir;

function runCli(args, opts = {}) {
  return execFileAsync('node', [cliPath, ...args], { cwd: tmpDir, ...opts });
}

// util.promisify(execFile)'s `input` option only exists on the *Sync
// variants -- the async callback form never writes to or closes the
// child's stdin for us, so a test that needs to actually pipe (or
// deliberately send empty/closed) stdin has to get the ChildProcess
// handle directly and drive stdin itself.
function runCliWithStdin(args, inputText, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = execFileCb(
      'node',
      [cliPath, ...args],
      { cwd: tmpDir, ...opts },
      (error, stdout, stderr) => {
        if (error) {
          error.stdout = stdout;
          error.stderr = stderr;
          reject(error);
        } else {
          resolve({ stdout, stderr });
        }
      }
    );
    child.stdin.end(inputText);
  });
}

function writeConfig(targetRepo = 'owner/some-repo') {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- test fixture path built from mkdtempSync()/execFile cwd, not external input
  fs.writeFileSync(path.join(tmpDir, '.work-permit.json'), JSON.stringify({ targetRepo }));
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'work-permit-intake-cli-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// These are end-to-end tests per the story's functional test plan: real
// CLI process, real filesystem, no mocking of fs/config.
describe('work-permit intake (functional, end-to-end)', () => {
  it('F1: --text round-trips through intake then intake list then the stored artifact', async () => {
    writeConfig('owner/text-repo');

    const { stdout } = await runCli(['intake', '--text', 'Build the thing']);
    expect(stdout).toMatch(/Intake captured/);
    expect(stdout).toMatch(/source: text/);

    const { stdout: listOut } = await runCli(['intake', 'list']);
    expect(listOut).toMatch(/Build the thing/);
    expect(listOut).toMatch(/\[text\]/);

    const intakeDir = path.join(tmpDir, '.work-permit', 'intake');
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- test fixture path built from mkdtempSync()/execFile cwd, not external input
    const files = fs.readdirSync(intakeDir);
    expect(files).toHaveLength(1);
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- test fixture path built from mkdtempSync()/execFile cwd, not external input
    const artifact = JSON.parse(fs.readFileSync(path.join(intakeDir, files[0]), 'utf8'));
    expect(artifact.text).toBe('Build the thing');
    expect(artifact.source).toBe('text');
    expect(artifact.targetRepo).toBe('owner/text-repo');
  });

  it('F1: --file round-trips through intake then intake list then the stored artifact', async () => {
    writeConfig('owner/file-repo');
    const goalPath = path.join(tmpDir, 'goal.md');
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- test fixture path built from mkdtempSync()/execFile cwd, not external input
    fs.writeFileSync(goalPath, 'Ship the RAG pipeline');

    const { stdout } = await runCli(['intake', '--file', goalPath]);
    expect(stdout).toMatch(/source: file/);

    const { stdout: listOut } = await runCli(['intake', 'list']);
    expect(listOut).toMatch(/Ship the RAG pipeline/);
    expect(listOut).toMatch(/\[file\]/);
  });

  it('F1: real stdin piping round-trips through intake then intake list then the stored artifact', async () => {
    writeConfig('owner/stdin-repo');

    const { stdout } = await runCliWithStdin(['intake'], 'Piped goal text\n');
    expect(stdout).toMatch(/source: stdin/);

    const { stdout: listOut } = await runCli(['intake', 'list']);
    expect(listOut).toMatch(/Piped goal text/);
    expect(listOut).toMatch(/\[stdin\]/);
  });

  it('rejects --text and --file specified together with a specific error', async () => {
    writeConfig();
    await expect(runCli(['intake', '--text', 'a', '--file', 'b.md'])).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringMatching(/conflicting input sources/i),
    });
  });

  it('rejects no input source (no flags, empty piped stdin) with a specific error', async () => {
    writeConfig();
    // input: '' writes nothing and closes stdin immediately -- an
    // empty, non-interactive pipe with nothing meaningful in it, same
    // as running this unattended with no input at all.
    await expect(runCliWithStdin(['intake'], '')).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringMatching(/no input source/i),
    });
  });

  it('F2: no artifact file is written when input is rejected', async () => {
    writeConfig();
    await expect(runCliWithStdin(['intake'], '')).rejects.toBeTruthy();
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- test fixture path built from mkdtempSync()/execFile cwd, not external input
    expect(fs.existsSync(path.join(tmpDir, '.work-permit', 'intake'))).toBe(false);
  });

  it('rejects empty/whitespace-only --text with a specific error, distinct from oversized', async () => {
    writeConfig();
    const emptyResult = runCli(['intake', '--text', '   ']);
    await expect(emptyResult).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringMatching(/empty or whitespace/i),
    });
  });

  it('S3: rejects oversized --text with a specific error at the documented boundary', async () => {
    writeConfig();
    const oversized = 'a'.repeat(100 * 1024 + 1);
    await expect(runCli(['intake', '--text', oversized])).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringMatching(/too large/i),
    });
  });

  it('S3: rejects a --file path that does not exist with a specific, non-crashing error', async () => {
    writeConfig();
    await expect(
      runCli(['intake', '--file', path.join(tmpDir, 'does-not-exist.md')])
    ).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringMatching(/not found/i),
    });
  });

  it('S3: rejects a binary (non-UTF8) --file with a specific, non-crashing error', async () => {
    writeConfig();
    const binPath = path.join(tmpDir, 'binary.dat');
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- test fixture path built from mkdtempSync()/execFile cwd, not external input
    fs.writeFileSync(binPath, Buffer.from([0xff, 0xfe, 0x00, 0xc3, 0x28]));
    await expect(runCli(['intake', '--file', binPath])).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringMatching(/utf-8/i),
    });
  });

  it('fails with the config error when no .work-permit.json is present', async () => {
    await expect(runCli(['intake', '--text', 'hello'])).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringMatching(/config file not found/i),
    });
  });

  it('F2: intake list separates artifacts per targetRepo config, not commingled', async () => {
    writeConfig('owner/repo-a');
    await runCli(['intake', '--text', 'goal for repo a']);

    writeConfig('owner/repo-b');
    await runCli(['intake', '--text', 'goal for repo b']);

    const { stdout: listB } = await runCli(['intake', 'list']);
    expect(listB).toMatch(/goal for repo b/);
    expect(listB).not.toMatch(/goal for repo a/);

    writeConfig('owner/repo-a');
    const { stdout: listA } = await runCli(['intake', 'list']);
    expect(listA).toMatch(/goal for repo a/);
    expect(listA).not.toMatch(/goal for repo b/);
  });

  it('intake list reports no intakes when none have been captured yet', async () => {
    writeConfig();
    const { stdout } = await runCli(['intake', 'list']);
    expect(stdout).toMatch(/No intakes found/);
  });
});
