import type { GenBumpPushConfig } from './types.ts';
import { createDefineConfig, loadConfig, setupDotenv } from 'c12';

/**
 * Identity helper that types a release config for your editor.
 *
 * It does not change the object at runtime — it only enables autocomplete
 * and catches typos inside `defineConfig({ … })`.
 *
 * @typeParam Config - Config object shape; defaults to {@link GenBumpPushConfig}.
 * @returns The same object you passed in.
 *
 * @example `genbumppush.config.ts`
 * ```ts
 * import { defineConfig } from 'genbumppush';
 *
 * export default defineConfig({
 *   preid: 'beta',
 *   files: ['package.json'],
 *   git: {
 *     commitMessage: 'chore(release): v{{version}}',
 *   },
 *   hooks: {
 *     before: ['npm run check', 'npm test'],
 *   },
 * });
 * ```
 */
export const defineConfig = createDefineConfig<GenBumpPushConfig>();

/**
 * Built-in defaults used when neither the CLI, a config file, nor
 * `package.json` sets a field.
 *
 * Useful if you want to document or assert what an empty config resolves to.
 */
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

/**
 * Load the effective release config for a repository.
 *
 * Resolution order (later wins):
 * 1. {@link defaults}
 * 2. `"genbumppush"` key in that directory’s `package.json`
 * 3. C12 config file (`genbumppush.config.ts` / `.js`, or `configFile` when given)
 * 4. `overrides` you pass here (CLI flags in the binary go through this)
 *
 * Also loads `.env` from `cwd` into `process.env` without overwriting
 * variables that are already set. Secrets still belong in the environment —
 * not in config files.
 *
 * @param cwd - Repository root to load config from.
 * @param configFile - Optional explicit path to a C12 config file.
 * @param overrides - Highest-priority values (for example CLI flags).
 * @returns The fully merged config object.
 * @throws May reject if the config file throws or cannot be loaded.
 *
 * @example Read what a repo already configured
 * ```ts
 * import { loadReleaseConfig } from 'genbumppush';
 *
 * const config = await loadReleaseConfig(process.cwd());
 * console.log(config.git?.remote ?? 'origin');
 * ```
 *
 * @example Force a dry-run-style push disable from a script
 * ```ts
 * import { loadReleaseConfig } from 'genbumppush';
 *
 * const config = await loadReleaseConfig(process.cwd(), undefined, {
 *   git: { push: false },
 * });
 * // config.git.push === false even if the file enabled push
 * ```
 */
export async function loadReleaseConfig(
  cwd: string,
  configFile?: string,
  overrides?: GenBumpPushConfig,
): Promise<GenBumpPushConfig> {
  await setupDotenv({ cwd });

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
