import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { slugify } from './slugify.js';

export const MAX_INPUT_BYTES = 100 * 1024; // 100KB

export class IntakeValidationError extends Error {
  constructor(message, kind) {
    super(message);
    this.name = 'IntakeValidationError';
    this.kind = kind; // 'empty' | 'too-large'
  }
}

function intakeDir(cwd) {
  return path.join(cwd, '.work-permit', 'intake');
}

/**
 * Rejects empty/whitespace-only text and text over the size cap. Shared
 * by every input source (--text, --file, stdin) so the boundary is
 * enforced identically regardless of how the text arrived.
 */
export function validateIntakeText(text) {
  if (typeof text !== 'string' || text.trim().length === 0) {
    throw new IntakeValidationError('intake text is empty or whitespace-only', 'empty');
  }

  const byteLength = Buffer.byteLength(text, 'utf8');
  if (byteLength > MAX_INPUT_BYTES) {
    throw new IntakeValidationError(
      `intake text is too large: ${byteLength} bytes exceeds the ${MAX_INPUT_BYTES}-byte limit`,
      'too-large'
    );
  }
}

/**
 * Writes one intake artifact to `<cwd>/.work-permit/intake/<ISO
 * timestamp>-<slug>.json` and returns its path and parsed content. The
 * intake text is stored as an inert JSON string field only -- never
 * interpolated into a shell command or a filesystem path -- so
 * shell-metacharacter-laden input round-trips byte-for-byte with no
 * execution side effect.
 */
export function writeIntake({ text, source, targetRepo, cwd = process.cwd() }) {
  validateIntakeText(text);

  const timestamp = new Date().toISOString();
  const slug = slugify(text);
  const intakeId = crypto.randomUUID();
  const dir = intakeDir(cwd);

  // eslint-disable-next-line security/detect-non-literal-fs-filename -- dir is cwd + fixed literal segments, not user input
  fs.mkdirSync(dir, { recursive: true });

  // The filename is built only from the ISO timestamp (":"/"." -> "-")
  // and slugify()'s [a-z0-9-] output -- neither can ever contain "/",
  // "..", or a null byte, so this can never resolve outside `dir`
  // regardless of what the raw intake text contains.
  const fileName = `${timestamp.replace(/[:.]/g, '-')}-${slug}.json`;
  const filePath = path.join(dir, fileName);

  const artifact = { intakeId, timestamp, source, targetRepo, text };

  // eslint-disable-next-line security/detect-non-literal-fs-filename -- filePath is derived as described above, always confined to the fixed intake dir
  fs.writeFileSync(filePath, JSON.stringify(artifact, null, 2));

  return { filePath, artifact };
}

/**
 * Lists prior intakes for `targetRepo`, most recent first. Intakes
 * belonging to other targetRepo configs are filtered out rather than
 * commingled. Returns [] if the intake directory doesn't exist yet
 * (nothing captured so far), and silently skips any file that isn't
 * readable/parseable JSON rather than crashing the whole listing.
 */
export function listIntakes({ targetRepo, cwd = process.cwd() }) {
  const dir = intakeDir(cwd);

  let files;
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- dir is cwd + fixed literal segments
    files = fs.readdirSync(dir);
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }

  const intakes = [];
  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    const filePath = path.join(dir, file);

    let parsed;
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- filePath comes from readdirSync() of the fixed intake dir, not external input
      parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
      continue;
    }

    if (parsed.targetRepo !== targetRepo) continue;
    intakes.push(parsed);
  }

  intakes.sort((a, b) => {
    if (a.timestamp === b.timestamp) return 0;
    return a.timestamp < b.timestamp ? 1 : -1;
  });

  return intakes;
}
