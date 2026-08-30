import { describe, it, expect } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliPath = path.join(__dirname, '..', 'src', 'cli.js');
const pkg = JSON.parse(
  readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')
);

function runCli(args) {
  return execFileAsync('node', [cliPath, ...args]);
}

describe('work-permit CLI entrypoint', () => {
  it('U1: exits 0 on --help', async () => {
    const { stdout } = await runCli(['--help']);
    expect(stdout).toMatch(/Usage:/i);
  });

  it('U2: exits 0 on --version and matches package.json version', async () => {
    const { stdout } = await runCli(['--version']);
    expect(stdout.trim()).toBe(pkg.version);
  });

  it('U3: exits non-zero on an unrecognized subcommand, with usage on stderr', async () => {
    await expect(runCli(['not-a-real-command'])).rejects.toMatchObject({
      code: expect.any(Number),
      stderr: expect.stringMatching(/Usage: work-permit/),
    });
  });
});
