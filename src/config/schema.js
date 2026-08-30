// Config file is JSON, not YAML, specifically to avoid arbitrary-tag /
// executable-content risk in the parser (see Story 1.2 security note S1).
// JSON.parse has no notion of custom tags or code execution, so that
// concern doesn't apply here -- it's a property of the format choice,
// not something this module has to defend against separately.

const ALLOWED_KEYS = new Set(['targetRepo', 'outputRepo', 'standardsCorpus']);

export class ConfigValidationError extends Error {
  constructor(message, field) {
    super(message);
    this.name = 'ConfigValidationError';
    this.field = field;
  }
}

/**
 * Classifies a targetRepo/outputRepo string as a local filesystem path or
 * a GitHub "owner/repo" reference, without touching the filesystem or
 * network -- pure shape validation only.
 */
export function classifyRef(value) {
  if (typeof value !== 'string' || value.length === 0) {
    return 'invalid';
  }

  if (
    value.startsWith('/') ||
    value.startsWith('./') ||
    value.startsWith('../') ||
    value.startsWith('~')
  ) {
    return 'local-path';
  }

  if (!value.includes('/')) {
    // Bare relative directory name, e.g. "some-repo".
    return 'local-path';
  }

  const segments = value.split('/');
  if (segments.length === 2) {
    const [owner, repo] = segments;
    const ownerPattern = /^[A-Za-z0-9](?:[A-Za-z0-9-]){0,38}$/;
    const repoPattern = /^[A-Za-z0-9._-]+$/;
    if (ownerPattern.test(owner) && repoPattern.test(repo)) {
      return 'github-ref';
    }
  }

  // Multiple slashes (or an invalid owner/repo shape) without an explicit
  // local-path prefix (., /, ~) is ambiguous and rejected rather than
  // guessed at -- callers who mean a nested relative path must write it
  // as "./sub/dir".
  return 'invalid';
}

/**
 * Validates the shape of a parsed config object. Throws
 * ConfigValidationError naming the specific offending field on any
 * problem. Never touches the filesystem or network.
 */
export function validateConfigShape(raw) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ConfigValidationError('config must be a JSON object', null);
  }

  const unknownKeys = Object.keys(raw).filter((key) => !ALLOWED_KEYS.has(key));
  if (unknownKeys.length > 0) {
    throw new ConfigValidationError(
      `unknown field(s): ${unknownKeys.join(', ')}. Allowed fields: ${[...ALLOWED_KEYS].join(
        ', '
      )}. Auth tokens must never be stored in the config file -- set the GH_TOKEN environment variable instead.`,
      unknownKeys[0]
    );
  }

  if (typeof raw.targetRepo !== 'string' || raw.targetRepo.trim().length === 0) {
    throw new ConfigValidationError('missing required field: targetRepo', 'targetRepo');
  }

  const targetRepoType = classifyRef(raw.targetRepo);
  if (targetRepoType === 'invalid') {
    throw new ConfigValidationError(
      `targetRepo "${raw.targetRepo}" is neither a valid local path nor a valid "owner/repo" GitHub reference`,
      'targetRepo'
    );
  }

  let outputRepoType = targetRepoType;
  if (raw.outputRepo !== undefined) {
    if (typeof raw.outputRepo !== 'string' || raw.outputRepo.trim().length === 0) {
      throw new ConfigValidationError('outputRepo must be a non-empty string if provided', 'outputRepo');
    }
    outputRepoType = classifyRef(raw.outputRepo);
    if (outputRepoType === 'invalid') {
      throw new ConfigValidationError(
        `outputRepo "${raw.outputRepo}" is neither a valid local path nor a valid "owner/repo" GitHub reference`,
        'outputRepo'
      );
    }
  }

  if (
    raw.standardsCorpus !== undefined &&
    (typeof raw.standardsCorpus !== 'string' || raw.standardsCorpus.trim().length === 0)
  ) {
    throw new ConfigValidationError('standardsCorpus must be a non-empty string if provided', 'standardsCorpus');
  }

  return {
    targetRepo: raw.targetRepo,
    targetRepoType,
    outputRepo: raw.outputRepo ?? raw.targetRepo,
    outputRepoType,
    standardsCorpus: raw.standardsCorpus ?? null,
  };
}
