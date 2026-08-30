import fs from 'node:fs';
import { validateConfigShape, ConfigValidationError } from './schema.js';

export { ConfigValidationError };

/**
 * Reads and parses the work-permit config file, then validates its shape.
 * Every failure mode (missing file, unreadable, malformed JSON, invalid
 * shape) throws ConfigValidationError with a message naming the specific
 * problem -- callers should not need to inspect the error further to
 * report something actionable to the user.
 */
export function loadConfigFile(filePath) {
  let raw;
  try {
    // filePath is the user-supplied --config path, which is exactly what
    // this function exists to read; it's read-only and bounded by the
    // running user's own filesystem permissions, same as any CLI tool
    // that takes a --config flag.
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- see comment above
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new ConfigValidationError(`config file not found: ${filePath}`, null);
    }
    throw new ConfigValidationError(`could not read config file: ${filePath} (${err.code})`, null);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new ConfigValidationError(`config file is not valid JSON: ${err.message}`, null);
  }

  return validateConfigShape(parsed);
}
