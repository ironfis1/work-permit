#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Command } from 'commander';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')
);

const program = new Command();

program
  .name('work-permit')
  .description(pkg.description)
  .version(pkg.version, '-v, --version', 'output the current version')
  .exitOverride();

// Subcommands are added by later stories:
//   config   -> Story 1.2 (target-repo config + read-access validation)
//   intake   -> Story 1.3 (goal/vision intake command)
// Registering them here as they land keeps this file the single CLI
// entrypoint without restructuring.

try {
  await program.parseAsync(process.argv);
} catch (err) {
  // commander throws instead of calling process.exit() because of
  // exitOverride() above; --help and --version already printed their
  // own output, so just exit with the code commander determined.
  if (err.code === 'commander.helpDisplayed' || err.code === 'commander.version') {
    process.exit(err.exitCode ?? 0);
  }

  program.outputHelp({ error: true });
  process.exit(err.exitCode && err.exitCode !== 0 ? err.exitCode : 1);
}
