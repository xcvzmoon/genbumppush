// Adapted from changelogen 0.6.2. See THIRD_PARTY_NOTICES.md.
import type { ChangelogConfig, ResolvedChangelogConfig } from './types.ts';
import { loadConfig, setupDotenv } from 'c12';
import { resolve } from 'node:path';
import { getCurrentGitRef, getLastGitTag } from './history.ts';
import { getRepoConfig, resolveRepoConfig } from './repository.ts';

export function changelogDefaults(cwd: string): ChangelogConfig {
  return {
    cwd,
    types: {
      feat: { title: '🚀 Enhancements', semver: 'minor' },
      perf: { title: '🔥 Performance', semver: 'patch' },
      fix: { title: '🩹 Fixes', semver: 'patch' },
      refactor: { title: '💅 Refactors', semver: 'patch' },
      docs: { title: '📖 Documentation', semver: 'patch' },
      build: { title: '📦 Build', semver: 'patch' },
      types: { title: '🌊 Types', semver: 'patch' },
      chore: { title: '🏡 Chore' },
      examples: { title: '🏀 Examples' },
      test: { title: '✅ Tests' },
      style: { title: '🎨 Styles' },
      ci: { title: '🤖 CI' },
    },
    from: '',
    to: '',
    output: 'CHANGELOG.md',
    scopeMap: {},
    templates: {
      commitMessage: 'chore(release): v{{newVersion}}',
      tagMessage: 'v{{newVersion}}',
      tagBody: 'v{{newVersion}}',
    },
    excludeAuthors: [],
    noAuthors: false,
  };
}

export async function loadChangelogConfig(cwd: string): Promise<ResolvedChangelogConfig> {
  await setupDotenv({ cwd });
  const { config } = await loadConfig<Partial<ChangelogConfig>>({
    cwd,
    name: 'changelog',
    packageJson: true,
    defaults: changelogDefaults(cwd),
    overrides: { cwd },
  });
  return resolveChangelogConfig({ ...changelogDefaults(cwd), ...config }, cwd);
}

export async function resolveChangelogConfig(
  config: ChangelogConfig,
  cwd: string,
): Promise<ResolvedChangelogConfig> {
  let repo = config.repo;
  if (repo === undefined || repo === '') repo = await resolveRepoConfig(cwd);
  let from = config.from;
  if (from === undefined || from === '') from = getLastGitTag(cwd);
  let to = config.to;
  if (!to) to = getCurrentGitRef(cwd);
  return {
    ...config,
    from,
    to,
    output: config.output
      ? config.output === true
        ? 'CHANGELOG.md'
        : resolve(cwd, config.output)
      : false,
    repo: typeof repo === 'string' ? getRepoConfig(repo) : repo,
  };
}
