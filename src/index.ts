/**
 * genbumppush — generate a changelog, bump the version, commit, tag, and push.
 *
 * Common entry points:
 * - {@link defineConfig} — type-safe config for `genbumppush.config.ts`
 * - {@link loadReleaseConfig} — merge config from file / `package.json` / overrides
 * - {@link runRelease} — run a release programmatically
 * - {@link ReleaseError} — catchable error with a stable `code`
 *
 * @packageDocumentation
 */

export { defineConfig, loadReleaseConfig } from './config.ts';
export { ReleaseError } from './error.ts';
export { runRelease } from './release.ts';
export type {
  CliOptions,
  GenBumpPushConfig,
  GitHubOptions,
  GitOptions,
  GitLabOptions,
  HookOptions,
  ReleaseResult,
  ReleaseType,
} from './types.ts';
