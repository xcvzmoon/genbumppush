// Adapted from changelogen 0.6.2. See THIRD_PARTY_NOTICES.md.
import type { Reference, RepoConfig, ResolvedChangelogConfig } from './types.ts';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { git } from '../git.ts';

const providerToDomain: Record<string, string | undefined> = {
  github: 'github.com',
  gitlab: 'gitlab.com',
  bitbucket: 'bitbucket.org',
};
const domainToProvider: Record<string, string | undefined> = {
  'github.com': 'github',
  'gitlab.com': 'gitlab',
  'bitbucket.org': 'bitbucket',
};
const providerPaths: Record<string, Record<Reference['type'], string> | undefined> = {
  github: { 'pull-request': 'pull', hash: 'commit', issue: 'issues' },
  gitlab: { 'pull-request': 'merge_requests', hash: 'commit', issue: 'issues' },
  bitbucket: { 'pull-request': 'pull-requests', hash: 'commit', issue: 'issues' },
};
const providerURL =
  /^(?:(?<user>[\w-]+)@)?(?:(?<provider>[^/:]+):)?(?<repo>[\w-]+\/(?:\w|\.(?!git$)|-)+)(?:\.git)?$/;

export function getRepoConfig(repoUrl = ''): RepoConfig {
  let url: URL | undefined;
  try {
    url = new URL(repoUrl);
  } catch {
    /* Repository shorthand is also supported. */
  }
  const match = repoUrl.match(providerURL)?.groups;
  if (match?.repo && match.provider) {
    const provider = domainToProvider[match.provider] ?? match.provider;
    return { provider, repo: match.repo, domain: providerToDomain[provider] ?? provider };
  }
  if (url) {
    return {
      domain: url.hostname,
      repo: url.pathname
        .split('/')
        .slice(1)
        .join('/')
        .replace(/\.git$/, ''),
      provider: domainToProvider[url.hostname],
    };
  }
  if (match?.repo) return { repo: match.repo, provider: 'github', domain: 'github.com' };
  return {};
}

export async function resolveRepoConfig(cwd: string): Promise<RepoConfig | undefined> {
  try {
    const pkg: unknown = JSON.parse(await readFile(resolve(cwd, 'package.json'), 'utf8'));
    if (pkg && typeof pkg === 'object' && 'repository' in pkg && pkg.repository) {
      const repository = pkg.repository;
      const url =
        typeof repository === 'string'
          ? repository
          : typeof repository === 'object' &&
              'url' in repository &&
              typeof repository.url === 'string'
            ? repository.url
            : '';
      return getRepoConfig(url);
    }
  } catch {
    /* Fall back to the origin remote when no package can be read. */
  }
  try {
    const remote = git(['remote', 'get-url', 'origin'], cwd);
    if (remote) return getRepoConfig(remote);
  } catch {
    /* Local-only repositories need not have a remote. */
  }
  return undefined;
}

function baseUrl(repo: RepoConfig): string {
  return `https://${repo.domain}/${repo.repo}`;
}

export function formatReference(ref: Reference, repo?: RepoConfig): string {
  const paths = repo?.provider ? providerPaths[repo.provider] : undefined;
  if (!repo || !paths) return ref.value;
  return `[${ref.value}](${baseUrl(repo)}/${paths[ref.type]}/${ref.value.replace(/^#/, '')})`;
}

export function formatCompareChanges(
  version: string | undefined,
  config: ResolvedChangelogConfig,
): string {
  const repo = config.repo;
  if (!repo) return '';
  let target = config.to;
  if (version) target = version;
  const part = repo.provider === 'bitbucket' ? 'branches/compare' : 'compare';
  const range =
    repo.provider === 'bitbucket' ? `${target}%0D${config.from}` : `${config.from}...${target}`;
  return `[compare changes](${baseUrl(repo)}/${part}/${range})`;
}
