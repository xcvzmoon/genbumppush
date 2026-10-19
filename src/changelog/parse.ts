// Adapted from changelogen 0.6.2. See THIRD_PARTY_NOTICES.md.
import type { ChangelogConfig, GitCommit, RawGitCommit, Reference } from './types.ts';

const conventionalCommit =
  /(?<emoji>:.+:|(\uD83C[\uDF00-\uDFFF])|(\uD83D[\uDC00-\uDE4F\uDE80-\uDEFF])|[\u2600-\u2B55])?( *)?(?<type>[a-z]+)(\((?<scope>.+)\))?(?<breaking>!)?: (?<description>.+)/i;
const coAuthoredBy = /co-authored-by:\s*(?<name>.+)(<(?<email>.+)>)/gim;
const pullRequest = /\([ a-z]*(#\d+)\s*\)/gm;
const issue = /(#\d+)/gm;

export function parseGitCommit(commit: RawGitCommit, config: ChangelogConfig): GitCommit | null {
  const groups = commit.message.match(conventionalCommit)?.groups;
  if (!groups?.type || !groups.description) return null;
  const scope = groups.scope ?? '';
  let mappedScope = config.scopeMap[scope];
  if (mappedScope === undefined || mappedScope === '') mappedScope = scope;
  const description = groups.description;
  const references: Reference[] = [];
  for (const match of description.matchAll(pullRequest)) {
    if (match[1]) references.push({ type: 'pull-request', value: match[1] });
  }
  for (const match of description.matchAll(issue)) {
    if (match[1] && !references.some((ref) => ref.value === match[1])) {
      references.push({ type: 'issue', value: match[1] });
    }
  }
  references.push({ type: 'hash', value: commit.shortHash });
  const authors = [commit.author];
  for (const match of commit.body.matchAll(coAuthoredBy)) {
    authors.push({
      name: (match.groups?.name ?? '').trim(),
      email: (match.groups?.email ?? '').trim(),
    });
  }
  return {
    ...commit,
    authors,
    type: groups.type,
    scope: mappedScope,
    description: description.replace(pullRequest, '').trim(),
    references,
    isBreaking: Boolean(groups.breaking || /breaking change:/i.test(commit.body)),
  };
}

export function parseCommits(commits: RawGitCommit[], config: ChangelogConfig): GitCommit[] {
  return commits.flatMap((commit) => {
    const parsed = parseGitCommit(commit, config);
    return parsed ? [parsed] : [];
  });
}
