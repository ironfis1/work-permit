import fs from 'node:fs';
import path from 'node:path';

export class RepoResolutionError extends Error {
  constructor(message, kind) {
    super(message);
    this.name = 'RepoResolutionError';
    this.kind = kind; // 'not-found' | 'not-a-git-repo'
  }
}

/**
 * Resolves a local-path targetRepo/outputRepo value and confirms it's an
 * existing git repo, without reading or listing anything beyond the path
 * itself and its immediate ".git" entry -- deliberately, so pointing this
 * at an arbitrary filesystem location (e.g. "/etc") never causes this
 * tool to enumerate contents outside the expected project boundary.
 */
export function resolveLocalRepo(targetPath, cwd = process.cwd()) {
  const resolved = path.isAbsolute(targetPath) ? targetPath : path.resolve(cwd, targetPath);

  let stat;
  try {
    // `resolved` is the user-configured targetRepo/outputRepo path; this
    // is the existence check this function exists to perform (see S3:
    // it never reads/lists beyond this path and its immediate .git entry).
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- see comment above
    stat = fs.statSync(resolved);
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new RepoResolutionError(`path not found: ${resolved}`, 'not-found');
    }
    throw new RepoResolutionError(`cannot access path: ${resolved} (${err.code})`, 'not-found');
  }

  if (!stat.isDirectory()) {
    throw new RepoResolutionError(`path is not a directory: ${resolved}`, 'not-a-git-repo');
  }

  const gitDir = path.join(resolved, '.git');
  // same bounded, user-configured path as above, checking only for the
  // presence of .git -- no directory listing, no file content read.
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- see comment above
  if (!fs.existsSync(gitDir)) {
    throw new RepoResolutionError(
      `path exists but is not a git repo (no .git found): ${resolved}`,
      'not-a-git-repo'
    );
  }

  return { resolvedPath: resolved };
}
