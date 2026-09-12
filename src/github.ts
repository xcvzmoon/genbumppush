import { resolveRepoConfig } from 'changelogen';
import { ENV, readEnv, readEnvFirst } from './env.ts';
import { ReleaseError } from './error.ts';

export type GitHubReleaseOptions = {
  host: string;
  repo: string;
  token: string;
  tag: string;
  name: string;
  description: string;
};

export type GitHubRepoSource = {
  host?: string;
  repo?: string;
};

function normalizeHost(host: string): string {
  return host.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

function apiBase(host: string): string {
  const normalized = normalizeHost(host);
  if (normalized === 'github.com' || normalized === 'api.github.com') {
    return 'https://api.github.com';
  }
  return `https://${normalized}/api/v3`;
}

function encodeRepoPath(repo: string): string {
  return repo
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

export const GITHUB_TOKEN_FALLBACKS = [
  ENV.GITHUB_TOKEN,
  'GITHUB_TOKEN',
  'GH_TOKEN',
  'CHANGELOGEN_TOKENS_GITHUB',
] as const;

export function githubTokenEnvLabel(tokenEnv?: string): string {
  return tokenEnv ?? `${ENV.GITHUB_TOKEN} (or GITHUB_TOKEN, GH_TOKEN, CHANGELOGEN_TOKENS_GITHUB)`;
}

export function resolveGitHubToken(tokenEnv?: string): string | undefined {
  if (tokenEnv !== undefined) {
    return readEnv(tokenEnv);
  }
  return readEnvFirst(...GITHUB_TOKEN_FALLBACKS);
}

export async function resolveGitHubRepo(
  cwd: string,
  source: GitHubRepoSource,
): Promise<{ host: string; repo: string }> {
  const host = normalizeHost(
    source.host ?? readEnv(ENV.GITHUB_HOST) ?? readEnv('GITHUB_API_URL') ?? 'github.com',
  );
  const explicit = source.repo ?? readEnvFirst(ENV.GITHUB_REPOSITORY, 'GITHUB_REPOSITORY');
  if (explicit !== undefined && explicit.length > 0) {
    return { host, repo: explicit };
  }

  const resolved = await resolveRepoConfig(cwd);
  if (resolved?.provider === 'github' && resolved.repo) {
    return {
      host: normalizeHost(resolved.domain ?? host),
      repo: resolved.repo,
    };
  }

  throw new ReleaseError(
    'GITHUB_RELEASE_FAILED',
    `Set github.repo or ${ENV.GITHUB_REPOSITORY} (or GITHUB_REPOSITORY) to create a GitHub release.`,
  );
}

async function githubFetch(
  options: GitHubReleaseOptions,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const url = `${apiBase(options.host)}/repos/${encodeRepoPath(options.repo)}${path}`;
  const headers = new Headers({
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    Authorization: `Bearer ${options.token}`,
    'Content-Type': 'application/json',
  });
  if (init?.headers) {
    new Headers(init.headers).forEach((value, key) => {
      headers.set(key, value);
    });
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: init?.method,
      body: init?.body,
      headers,
      signal: init?.signal ?? AbortSignal.timeout(30_000),
    });
  } catch (error) {
    throw new ReleaseError('GITHUB_RELEASE_FAILED', 'Could not send the GitHub release request.', {
      cause: error,
    });
  }
  return response;
}

function parseReleaseId(body: unknown): number | undefined {
  if (typeof body !== 'object' || body === null || !('id' in body)) return undefined;
  const id: unknown = body.id;
  return typeof id === 'number' ? id : undefined;
}

/**
 * Create or update a GitHub (or GHES) release for an existing tag.
 * Uses the exact tag string so custom genbumppush tag templates stay valid.
 */
export async function createGitHubRelease(options: GitHubReleaseOptions): Promise<void> {
  const tagPath = `/releases/tags/${encodeURIComponent(options.tag)}`;
  const existing = await githubFetch(options, tagPath, { method: 'GET' });
  let existingId: number | undefined;

  if (existing.ok) {
    const body: unknown = await existing.json().catch(() => ({}));
    existingId = parseReleaseId(body);
  } else if (existing.status !== 404) {
    const text = await existing.text().catch(() => '');
    throw new ReleaseError(
      'GITHUB_RELEASE_FAILED',
      `GitHub release lookup failed with ${existing.status}: ${text || existing.statusText}`,
    );
  }

  const payload = JSON.stringify({
    tag_name: options.tag,
    name: options.name,
    body: options.description,
  });

  const response =
    existingId === undefined
      ? await githubFetch(options, '/releases', { method: 'POST', body: payload })
      : await githubFetch(options, `/releases/${existingId}`, { method: 'PATCH', body: payload });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new ReleaseError(
      'GITHUB_RELEASE_FAILED',
      `GitHub release creation failed with ${response.status}: ${text || response.statusText}`,
    );
  }
}
