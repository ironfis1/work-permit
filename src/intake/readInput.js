import fs from 'node:fs';
import path from 'node:path';
import { MAX_INPUT_BYTES } from './store.js';

export class IntakeInputError extends Error {
  constructor(message) {
    super(message);
    this.name = 'IntakeInputError';
  }
}

function decodeUtf8Strict(buffer, describeSource) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    throw new IntakeInputError(`${describeSource} is not valid UTF-8 text`);
  }
}

function readStdin() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    let settled = false;

    const fail = (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    };

    process.stdin.on('data', (chunk) => {
      total += chunk.length;
      if (total > MAX_INPUT_BYTES) {
        process.stdin.destroy();
        fail(new IntakeInputError(`stdin input exceeds the ${MAX_INPUT_BYTES}-byte input limit`));
        return;
      }
      chunks.push(chunk);
    });

    process.stdin.on('end', () => {
      if (settled) return;
      settled = true;
      try {
        resolve(decodeUtf8Strict(Buffer.concat(chunks), 'stdin input'));
      } catch (err) {
        reject(err);
      }
    });

    process.stdin.on('error', fail);
  });
}

/**
 * Resolves exactly one goal/vision input source: --text, --file, or
 * piped stdin.
 *
 * --text and --file supplied together is a conflict, rejected
 * immediately. With neither flag given, stdin is read only when it
 * isn't an interactive TTY (i.e. something is actually piped in) --
 * an interactive terminal with no flag and nothing piped is "no input
 * source", not a hang waiting on stdin.
 */
export async function resolveIntakeInput({
  text,
  file,
  cwd = process.cwd(),
  stdinIsTTY = process.stdin.isTTY,
} = {}) {
  if (text !== undefined && file !== undefined) {
    throw new IntakeInputError('conflicting input sources specified: --text and --file -- provide exactly one');
  }

  if (text !== undefined) {
    return { text, source: 'text' };
  }

  if (file !== undefined) {
    const resolved = path.isAbsolute(file) ? file : path.resolve(cwd, file);

    let stat;
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- resolved is the user-supplied --file path, exactly what this function exists to read
      stat = fs.statSync(resolved);
    } catch (err) {
      if (err.code === 'ENOENT') {
        throw new IntakeInputError(`file not found: ${resolved}`);
      }
      throw new IntakeInputError(`could not access file: ${resolved} (${err.code})`);
    }

    if (stat.size > MAX_INPUT_BYTES) {
      throw new IntakeInputError(
        `file exceeds the ${MAX_INPUT_BYTES}-byte input limit: ${resolved} is ${stat.size} bytes`
      );
    }

    let raw;
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- resolved is the same user-supplied --file path, size-checked above
      raw = fs.readFileSync(resolved);
    } catch (err) {
      throw new IntakeInputError(`could not read file: ${resolved} (${err.code})`);
    }

    return { text: decodeUtf8Strict(raw, `file ${resolved}`), source: 'file' };
  }

  // Neither --text nor --file: fall back to stdin, but don't block
  // waiting on it when nothing is actually piped in. An interactive TTY
  // means there's no pipe to read at all; an empty (or whitespace-only)
  // piped stream means something ran this non-interactively without
  // supplying any input -- both are "no input source", not a hang and
  // not an "empty text" error, since no explicit source was named.
  const NO_INPUT_MESSAGE = 'no input source provided: use --text, --file, or pipe input via stdin';

  if (stdinIsTTY) {
    throw new IntakeInputError(NO_INPUT_MESSAGE);
  }

  const stdinText = await readStdin();
  if (stdinText.trim().length === 0) {
    throw new IntakeInputError(NO_INPUT_MESSAGE);
  }

  return { text: stdinText, source: 'stdin' };
}
