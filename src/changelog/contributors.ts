// Adapted from changelogen 0.6.2. See THIRD_PARTY_NOTICES.md.
import type { GitCommit, ResolvedChangelogConfig } from './types.ts';

type Contributor = { name: string; emails: Set<string>; github?: string };

export function upperFirst(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : '';
}

function githubUsername(value: unknown): string | undefined {
  if (value && typeof value === 'object' && 'user' in value) {
    const user = value.user;
    if (
      user &&
      typeof user === 'object' &&
      'username' in user &&
      typeof user.username === 'string'
    ) {
      return user.username;
    }
  }
  return undefined;
}

async function lookupUsername(emails: string[]): Promise<string | undefined> {
  const [email, ...remaining] = emails;
  if (email === undefined) return undefined;
  try {
    const response = await fetch(`https://ungh.cc/users/find/${email}`);
    const body: unknown = await response.json();
    // A truthy user ends the original search even if it has no usable username.
    if (body && typeof body === 'object' && 'user' in body && body.user)
      return githubUsername(body);
  } catch {
    /* Try the next email when a lookup is unavailable. */
  }
  return lookupUsername(remaining);
}

export async function contributorLines(
  commits: GitCommit[],
  config: ResolvedChangelogConfig,
): Promise<string[]> {
  const contributors = new Map<string, Contributor>();
  for (const commit of commits) {
    const name = commit.author.name
      .split(' ')
      .map((part) => upperFirst(part.trim()))
      .join(' ');
    if (!name || name.includes('[bot]')) continue;
    if (
      config.excludeAuthors?.some(
        (excluded) => name.includes(excluded) || commit.author.email.includes(excluded),
      )
    )
      continue;
    const existing = contributors.get(name);
    if (existing) existing.emails.add(commit.author.email);
    else contributors.set(name, { name, emails: new Set([commit.author.email]) });
  }
  // Lookups still run with noAuthors, matching the original pipeline's observable behavior.
  await Promise.all(
    [...contributors.values()].map(async (contributor) => {
      contributor.github = await lookupUsername([...contributor.emails]);
    }),
  );
  if (config.noAuthors || contributors.size === 0) return [];
  return [
    '',
    '### ❤️ Contributors',
    '',
    ...[...contributors.values()].map((contributor) => {
      const email = [...contributor.emails].find((value) => !value.includes('noreply.github.com'));
      const suffix = contributor.github
        ? ` ([@${contributor.github}](https://github.com/${contributor.github}))`
        : config.hideAuthorEmail !== true && email
          ? ` <${email}>`
          : '';
      return `- ${contributor.name}${suffix}`;
    }),
  ];
}
