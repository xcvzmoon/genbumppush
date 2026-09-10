import type { GenBumpPushConfig } from './types.ts';
import { createDefineConfig, loadConfig } from 'c12';

export const defineConfig = createDefineConfig<GenBumpPushConfig>();

export const defaults: GenBumpPushConfig = {
  changelog: 'CHANGELOG.md',
  excludeDependencyCommits: true,
  recursive: false,
  git: {
    remote: 'origin',
    push: true,
    sign: false,
    requireClean: true,
    requireUpstream: true,
    commitMessage: 'chore(release): v{{version}}',
    tagName: 'v{{version}}',
    tagMessage: 'v{{version}}',
  },
};

export async function loadReleaseConfig(
  cwd: string,
  configFile?: string,
  overrides?: GenBumpPushConfig,
): Promise<GenBumpPushConfig> {
  return (
    await loadConfig<GenBumpPushConfig>({
      name: 'genbumppush',
      cwd,
      configFile,
      packageJson: 'genbumppush',
      defaults,
      overrides,
      rcFile: false,
      globalRc: false,
    })
  ).config;
}
