import { describe, it, expect, vi } from 'vitest';
import { resolveGithubRepo, GithubResolutionError } from '../../src/config/resolveGithub.js';

function mockFetch(status, body = {}) {
  return vi.fn().mockResolvedValue({
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  });
}

describe('resolveGithubRepo (mocked network, isolates the status-classification logic)', () => {
  it('resolves successfully on 200, returning the default branch', async () => {
    const fetchImpl = mockFetch(200, { default_branch: 'main', full_name: 'ironfis1/work-permit' });
    const result = await resolveGithubRepo('ironfis1/work-permit', { fetchImpl, token: undefined });
    expect(result).toEqual({ defaultBranch: 'main', fullName: 'ironfis1/work-permit' });
  });

  it('classifies 401 as not-authenticated', async () => {
    const fetchImpl = mockFetch(401);
    await expect(
      resolveGithubRepo('ironfis1/work-permit', { fetchImpl, token: 'bad-token' })
    ).rejects.toMatchObject({ kind: 'not-authenticated' });
  });

  it('classifies 404 as not-found', async () => {
    const fetchImpl = mockFetch(404);
    await expect(
      resolveGithubRepo('ironfis1/definitely-does-not-exist', { fetchImpl, token: undefined })
    ).rejects.toMatchObject({ kind: 'not-found' });
  });

  it('gives distinct guidance in the not-found message depending on whether a token was set', async () => {
    const fetchImpl = mockFetch(404);

    let noTokenMessage;
    try {
      await resolveGithubRepo('a/b', { fetchImpl, token: undefined });
    } catch (err) {
      noTokenMessage = err.message;
    }

    let withTokenMessage;
    try {
      await resolveGithubRepo('a/b', { fetchImpl, token: 'tok' });
    } catch (err) {
      withTokenMessage = err.message;
    }

    expect(noTokenMessage).toMatch(/GH_TOKEN/);
    expect(withTokenMessage).not.toBe(noTokenMessage);
  });

  it('classifies other error statuses distinctly from not-found/not-authenticated', async () => {
    const fetchImpl = mockFetch(500);
    await expect(
      resolveGithubRepo('ironfis1/work-permit', { fetchImpl, token: undefined })
    ).rejects.toMatchObject({ kind: 'error' });
  });

  it('wraps a network-level failure as a GithubResolutionError', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('DNS lookup failed'));
    await expect(
      resolveGithubRepo('ironfis1/work-permit', { fetchImpl, token: undefined })
    ).rejects.toBeInstanceOf(GithubResolutionError);
  });
});
