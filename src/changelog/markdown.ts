// Adapted from changelogen 0.6.2. See THIRD_PARTY_NOTICES.md.
import type { GitCommit, Reference, ResolvedChangelogConfig } from './types.ts';
import { contributorLines, upperFirst } from './contributors.ts';
import { convertGitmoji } from './gitmoji.ts';
import { formatCompareChanges, formatReference } from './repository.ts';

function formatReferences(references: Reference[], config: ResolvedChangelogConfig): string {
  const visible = [
    ...references.filter((ref) => ref.type === 'pull-request'),
    ...references.filter((ref) => ref.type === 'issue'),
  ];
  if (visible.length)
    return ` (${visible.map((ref) => formatReference(ref, config.repo)).join(', ')})`;
  const first = references[0];
  return first ? ` (${formatReference(first, config.repo)})` : '';
}

function formatCommit(commit: GitCommit, config: ResolvedChangelogConfig): string {
  return (
    '- ' +
    (commit.scope ? `**${commit.scope.trim()}:** ` : '') +
    (commit.isBreaking ? '⚠️  ' : '') +
    upperFirst(commit.description) +
    formatReferences(commit.references, config)
  );
}

export async function generateMarkDown(
  commits: GitCommit[],
  config: ResolvedChangelogConfig,
): Promise<string> {
  const groups = new Map<string, GitCommit[]>();
  for (const commit of commits) {
    const group = groups.get(commit.type);
    if (group) group.push(commit);
    else groups.set(commit.type, [commit]);
  }
  const version =
    config.newVersion && config.templates.tagBody.replaceAll('{{newVersion}}', config.newVersion);
  let heading = `${config.from ?? ''}...${config.to}`;
  if (version) heading = version;
  const markdown = ['', `## ${heading}`, ''];
  const breakingChanges: string[] = [];
  if (config.repo && config.from) markdown.push(formatCompareChanges(version, config));
  for (const [type, settings] of Object.entries(config.types)) {
    const group = groups.get(type);
    if (!group?.length) continue;
    markdown.push('', `### ${typeof settings === 'object' ? settings.title : undefined}`, '');
    for (const commit of group.toReversed()) {
      const line = formatCommit(commit, config);
      markdown.push(line);
      if (commit.isBreaking) breakingChanges.push(line);
    }
  }
  if (breakingChanges.length) markdown.push('', '#### ⚠️ Breaking Changes', '', ...breakingChanges);
  markdown.push(...(await contributorLines(commits, config)));
  return convertGitmoji(markdown.join('\n').trim());
}
