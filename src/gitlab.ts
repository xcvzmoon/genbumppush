import { ENV, readEnv, readEnvFirst } from './env.ts';
import { ReleaseError } from './error.ts';

export type GitLabReleaseOptions = {
  host: string;
  project: string;
  token: string;
  tag: string;
  name: string;
  description: string;
};

export const GITLAB_TOKEN_FALLBACKS = [ENV.GITLAB_TOKEN, 'GITLAB_TOKEN'] as const;

export function gitLabTokenEnvLabel(tokenEnv?: string): string {
  return tokenEnv ?? `${ENV.GITLAB_TOKEN} (or GITLAB_TOKEN)`;
}

export function resolveGitLabToken(tokenEnv?: string): string | undefined {
  if (tokenEnv !== undefined) {
    return readEnv(tokenEnv);
  }
  return readEnvFirst(...GITLAB_TOKEN_FALLBACKS);
}

export function resolveGitLabHost(host?: string): string {
  return host ?? readEnv(ENV.GITLAB_HOST) ?? readEnv('GITLAB_HOST') ?? 'https://gitlab.com';
}

export function resolveGitLabProject(project?: string): string | undefined {
  return project ?? readEnvFirst(ENV.GITLAB_PROJECT, 'GITLAB_PROJECT');
}

export function releaseNotes(changelog: string, tag: string): string {
  const lines = changelog.split('\n');
  const heading = `## ${tag}`;

  const start = lines.findIndex((line) => line === heading || line.startsWith(`${heading} `));
  if (start < 0) return 'See CHANGELOG.md for release notes.';

  const notes: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith('## ')) break;
    notes.push(line);
  }

  return notes.join('\n').trim() || 'See CHANGELOG.md for release notes.';
}

export const PROVIDER_FETCH_TIMEOUT_MS = 30_000;

export async function createGitLabRelease(options: GitLabReleaseOptions): Promise<void> {
  const host = options.host.replace(/\/$/, '');
  const url = `${host}/api/v4/projects/${encodeURIComponent(options.project)}/releases`;
  let response: Response;

  try {
    response = await fetch(url, {
      method: 'POST',
      signal: AbortSignal.timeout(PROVIDER_FETCH_TIMEOUT_MS),
      headers: {
        Authorization: `Bearer ${options.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tag_name: options.tag,
        name: options.name,
        description: options.description,
      }),
    });
  } catch (error) {
    throw new ReleaseError('GITLAB_RELEASE_FAILED', 'Could not send the GitLab release request.', {
      cause: error,
    });
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new ReleaseError(
      'GITLAB_RELEASE_FAILED',
      `GitLab release creation failed with ${response.status}: ${body || response.statusText}`,
    );
  }
}
