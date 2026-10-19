import type { ChangelogConfig, GitCommit, StableBump } from './types.ts';

export function determineSemverChange(
  commits: GitCommit[],
  config: ChangelogConfig,
): StableBump | null {
  let minor = false;
  let patch = false;
  for (const commit of commits) {
    const type = config.types[commit.type];
    const semver = typeof type === 'object' ? type.semver : undefined;
    if (semver === 'major' || commit.isBreaking) return 'major';
    if (semver === 'minor') minor = true;
    if (semver === 'patch') patch = true;
  }
  return minor ? 'minor' : patch ? 'patch' : null;
}
