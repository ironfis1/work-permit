// Node's built-in fetch does not honor HTTP_PROXY/HTTPS_PROXY env vars on
// its own -- it needs an explicit proxy-aware dispatcher. Some environments
// this CLI runs in (e.g. a sandboxed dev VM) route all outbound HTTPS
// through such a proxy, so wire one in whenever those env vars are set,
// rather than silently failing DNS lookups for every GitHub API call.
// `undici` is imported lazily (only when a GitHub-ref target is actually
// being validated, and only when a proxy env var is present) so that
// unrelated commands -- --help, --version, local-path config validation --
// never pay its load cost or depend on it at all.
// Guarded by a module-level flag so repeated calls don't keep replacing
// the global dispatcher.
let proxyDispatcherConfigured = false;
async function ensureProxyAwareFetch() {
  if (proxyDispatcherConfigured) return;
  proxyDispatcherConfigured = true;
  const hasProxyEnv = Boolean(
    process.env.HTTPS_PROXY ||
      process.env.https_proxy ||
      process.env.HTTP_PROXY ||
      process.env.http_proxy
  );
  if (hasProxyEnv) {
    const { EnvHttpProxyAgent, setGlobalDispatcher } = await import('undici');
    setGlobalDispatcher(new EnvHttpProxyAgent());
  }
}

export class GithubResolutionError extends Error {
  constructor(message, kind) {
    super(message);
    this.name = 'GithubResolutionError';
    this.kind = kind; // 'not-found' | 'not-authenticated' | 'error'
  }
}

/**
 * Confirms an "owner/repo" targetRepo/outputRepo reference is reachable
 * and readable via the GitHub REST API. Only ever requests repo metadata
 * (read access) -- never anything requiring write scopes, since that
 * isn't needed until Epic 8.
 *
 * GitHub's API intentionally returns 404 (not 403) both for a repo that
 * truly doesn't exist and for one that exists but is inaccessible to the
 * caller, to avoid leaking private-repo existence. This function can't
 * un-conflate that at the network layer, so on a 404 it reports both
 * possibilities and tailors the guidance to whether a token was even
 * provided -- an invalid/malformed token is still cleanly distinguishable
 * as 401 "not authenticated", since GitHub checks credentials before repo
 * lookup.
 */
export async function resolveGithubRepo(ownerRepo, { token = process.env.GH_TOKEN, fetchImpl = fetch } = {}) {
  await ensureProxyAwareFetch();
  const [owner, repo] = ownerRepo.split('/');

  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'work-permit-cli',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let response;
  try {
    response = await fetchImpl(`https://api.github.com/repos/${owner}/${repo}`, { headers });
  } catch (err) {
    throw new GithubResolutionError(`could not reach GitHub API: ${err.message}`, 'error');
  }

  if (response.status === 401) {
    throw new GithubResolutionError(
      'not authenticated: GH_TOKEN is missing or invalid for the GitHub API',
      'not-authenticated'
    );
  }

  if (response.status === 404) {
    const guidance = token
      ? 'repo does not exist, or the current GH_TOKEN does not have read access to it'
      : 'repo does not exist, or it is private and no GH_TOKEN was provided -- set GH_TOKEN to check access';
    throw new GithubResolutionError(`repo not found: ${owner}/${repo} (${guidance})`, 'not-found');
  }

  if (!response.ok) {
    throw new GithubResolutionError(`GitHub API returned ${response.status} for ${owner}/${repo}`, 'error');
  }

  const body = await response.json();
  return { defaultBranch: body.default_branch, fullName: body.full_name };
}
