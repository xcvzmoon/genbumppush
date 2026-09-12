import type { SemverBumpType } from 'changelogen';

/**
 * Every release type genbumppush can apply.
 *
 * The first seven values match Semantic Versioning. The `pre*` variants
 * enter a prerelease channel (`beta` by default); `prerelease` continues
 * an existing one.
 *
 * @example
 * ```ts
 * import type { ReleaseType } from 'genbumppush';
 *
 * const forced: ReleaseType = 'minor';
 * ```
 */
export const RELEASE_TYPES = [
  'major',
  'premajor',
  'minor',
  'preminor',
  'patch',
  'prepatch',
  'prerelease',
] as const satisfies readonly SemverBumpType[];

/** One of {@link RELEASE_TYPES}. */
export type ReleaseType = (typeof RELEASE_TYPES)[number];

/**
 * How genbumppush talks to Git: remote name, commit/tag templates,
 * and the safety checks run before anything is written.
 */
export type GitOptions = {
  /** Remote used for tag collision checks and `git push`. Default: `'origin'`. */
  remote?: string;
  /**
   * Push the release commit and tag together with `git push --atomic`.
   * Set to `false` for a local-only rehearsal.
   * @defaultValue true
   */
  push?: boolean;
  /**
   * Sign the release commit (`git commit -S`) and annotated tag (`git tag -s`).
   * @defaultValue false
   */
  sign?: boolean;
  /**
   * Refuse to release when the worktree has uncommitted changes.
   * @defaultValue true
   */
  requireClean?: boolean;
  /**
   * Require the current branch to have an upstream before pushing.
   * Ignored when {@link GitOptions.push} is `false`.
   * @defaultValue true
   */
  requireUpstream?: boolean;
  /**
   * Release commit subject. `{{version}}` is replaced with the new version
   * (without a leading `v` unless the template adds one).
   * @defaultValue `'chore(release): v{{version}}'`
   * @example `'release: v{{version}}'`
   */
  commitMessage?: string;
  /**
   * Tag name template. `{{version}}` is replaced with the new version.
   * @defaultValue `'v{{version}}'`
   */
  tagName?: string;
  /**
   * Annotated tag message template. `{{version}}` is replaced with the new version.
   * @defaultValue `'v{{version}}'`
   */
  tagMessage?: string;
};

/**
 * Shell commands run around the release.
 *
 * Commands run in the repository root with a shell. Use them for gates you
 * want on every release (checks, tests), not for storing secrets.
 */
export type HookOptions = {
  /**
   * Runs after validation and before version files or the changelog change.
   * A failing hook aborts the release with nothing written.
   * @example
   * ```ts
   * hooks: {
   *   before: ['npm run check', 'npm test'],
   * }
   * ```
   */
  before?: string | string[];
  /**
   * Runs after the commit, tag, and optional provider release succeed.
   * @example
   * ```ts
   * hooks: {
   *   after: 'echo "Shipped {{version}}"',
   * }
   * ```
   */
  after?: string | string[];
};

/**
 * Optional GitLab release creation after a successful Git push.
 *
 * Credentials come from the environment (`GENBUMPPUSH_GITLAB_TOKEN` or
 * `GITLAB_TOKEN`). Never put the token itself in this object.
 */
export type GitLabOptions = {
  /**
   * Create a GitLab release for the new tag.
   * Requires {@link GitOptions.push} to stay enabled and a token in the environment.
   * @defaultValue false
   */
  enabled?: boolean;
  /**
   * GitLab base URL, including protocol when not on gitlab.com.
   * @defaultValue `'https://gitlab.com'`
   * @example `'https://gitlab.example.com'`
   */
  host?: string;
  /**
   * Project path or numeric ID, as used by the GitLab API.
   * Falls back to `GENBUMPPUSH_GITLAB_PROJECT` or `GITLAB_PROJECT`.
   * @example `'group/subgroup/project'`
   */
  project?: string;
  /**
   * Exact environment variable name to read the token from.
   * When set, the usual fallback chain is skipped.
   * @example `'CI_JOB_TOKEN'`
   */
  tokenEnv?: string;
  /**
   * Release title template. `{{version}}` is replaced with the new version.
   * @defaultValue the tag name (for example `v1.2.3`)
   */
  releaseName?: string;
};

/**
 * Optional GitHub (or GitHub Enterprise Server) release after a successful Git push.
 *
 * Credentials come from the environment (`GENBUMPPUSH_GITHUB_TOKEN`,
 * `GITHUB_TOKEN`, or `GH_TOKEN`). Never put the token itself in this object.
 */
export type GitHubOptions = {
  /**
   * Create a GitHub release for the new tag.
   * Requires {@link GitOptions.push} to stay enabled and a token in the environment.
   * @defaultValue false
   */
  enabled?: boolean;
  /**
   * GitHub host. `github.com` uses the public API; any other host is treated
   * as GitHub Enterprise Server (`https://<host>/api/v3`).
   * @defaultValue `'github.com'`
   */
  host?: string;
  /**
   * Repository as `owner/name`. Usually inferred from the Git remote.
   * Override when inference is wrong or unavailable.
   * @example `'xcvzmoon/genbumppush'`
   */
  repo?: string;
  /**
   * Exact environment variable name to read the token from.
   * When set, the usual fallback chain is skipped.
   */
  tokenEnv?: string;
  /**
   * Release title template. `{{version}}` is replaced with the new version.
   * @defaultValue the tag name (for example `v1.2.3`)
   */
  releaseName?: string;
};

/**
 * Full genbumppush configuration.
 *
 * Every field is optional. Missing values fall back to the built-in defaults
 * documented on each property. Prefer {@link defineConfig} in a config file
 * so your editor can check the shape.
 *
 * @example Minimal config in `genbumppush.config.ts`
 * ```ts
 * import { defineConfig } from 'genbumppush';
 *
 * export default defineConfig({
 *   files: ['package.json', 'package-lock.json'],
 *   git: { tagName: 'v{{version}}' },
 * });
 * ```
 *
 * @example Same object under `"genbumppush"` in `package.json`
 * ```json
 * {
 *   "genbumppush": {
 *     "changelog": false,
 *     "git": { "push": false }
 *   }
 * }
 * ```
 */
export type GenBumpPushConfig = {
  /**
   * Force a release type instead of detecting it from Conventional Commits.
   * Leave unset for automatic detection.
   * @example `'patch'`
   */
  release?: ReleaseType;
  /**
   * Prerelease identifier used by `premajor`, `preminor`, `prepatch`,
   * and `prerelease`.
   * @defaultValue `'beta'`
   * @example `'rc'` produces `1.2.4-rc.0` from `1.2.3`
   */
  preid?: string;
  /**
   * Files whose version strings are updated for the release.
   * Each path is relative to the repository root and must stay inside it.
   * @defaultValue `['package.json']`
   * @example
   * ```ts
   * files: [
   *   'package.json',
   *   'src-tauri/tauri.conf.json',
   *   'src-tauri/Cargo.toml',
   * ]
   * ```
   */
  files?: string[];
  /**
   * Also update every nested `package.json` under the repository.
   * Meant for fixed-version monorepos that share one version number.
   * @defaultValue false
   */
  recursive?: boolean;
  /**
   * Changelog behavior:
   * - `false` — do not write a changelog
   * - `true` — write `CHANGELOG.md`
   * - `string` — write that path
   * @defaultValue `'CHANGELOG.md'`
   * @example `'docs/RELEASES.md'`
   */
  changelog?: boolean | string;
  /**
   * Ignore non-breaking `chore(deps): …` commits when detecting the next
   * version and building the changelog.
   * @defaultValue true
   */
  excludeDependencyCommits?: boolean;
  /** Git commit, tag, and push behavior. See {@link GitOptions}. */
  git?: GitOptions;
  /** Optional GitLab release after push. See {@link GitLabOptions}. */
  gitlab?: GitLabOptions;
  /** Optional GitHub release after push. See {@link GitHubOptions}. */
  github?: GitHubOptions;
  /** Shell commands run before and after the release. See {@link HookOptions}. */
  hooks?: HookOptions;
};

/**
 * Parsed CLI arguments for {@link runRelease}.
 *
 * You usually receive this from the binary rather than building it by hand.
 * When embedding genbumppush, the minimum object is `{ cwd, dryRun: false, yes: true }`
 * (plus `help: false` if you want a complete {@link CliOptions}).
 *
 * @example Non-interactive patch release in another directory
 * ```ts
 * import { runRelease } from 'genbumppush';
 *
 * await runRelease({
 *   cwd: '/path/to/repo',
 *   dryRun: false,
 *   yes: true,
 *   help: false,
 *   release: 'patch',
 * });
 * ```
 */
export type CliOptions = {
  /** Absolute path to the Git repository to release. Defaults to `process.cwd()` in the CLI. */
  cwd: string;
  /** Explicit C12 config file path. Overrides discovery and the `package.json` key. */
  configFile?: string;
  /** Retry only GitLab release creation for a tag that already exists on the remote. */
  gitlabRetryTag?: string;
  /** Retry only GitHub release creation for a tag that already exists on the remote. */
  githubRetryTag?: string;
  /** Force a release type; otherwise it is detected from commits (or config). */
  release?: ReleaseType;
  /** Prerelease identifier; overrides the value from config when set. */
  preid?: string;
  /** Preview the release without changing files, Git, or remotes. */
  dryRun: boolean;
  /** `false` keeps the commit and tag local. Unset means “use config”. */
  push?: boolean;
  /** Skip the interactive `Create a … release?` confirmation. */
  yes: boolean;
  /** Print CLI help and exit without running a release. */
  help: boolean;
};

/**
 * What {@link runRelease} did (or would do, for a dry run).
 *
 * When there are no releasable commits, `releaseType`, `newVersion`, and
 * `tag` stay `undefined` and `pushed` is `false`. That is a successful no-op.
 *
 * @example Inspect a dry run
 * ```ts
 * import { runRelease } from 'genbumppush';
 *
 * const result = await runRelease({ cwd: process.cwd(), dryRun: true, yes: true, help: false });
 * if (result.releaseType === undefined) {
 *   console.log('Nothing to release');
 * } else {
 *   console.log(`${result.currentVersion} → ${result.newVersion} as ${result.tag}`);
 * }
 * ```
 */
export type ReleaseResult = {
  /** Version before this run (from the root `package.json`). */
  currentVersion: string;
  /** Version after the bump. Absent on dry-run skips and “no releasable commits”. */
  newVersion?: string;
  /** Release type that was applied (or planned, for a dry run). */
  releaseType?: ReleaseType;
  /** Tag name created or planned, after `{{version}}` substitution. */
  tag?: string;
  /** `true` only when the branch and tag were pushed to the remote. */
  pushed: boolean;
  /** `true` when the run was a dry run and nothing was written. */
  dryRun: boolean;
  /** Number of Conventional Commits that fed the release decision. */
  commitCount: number;
  /** `true` when a GitLab release was created after the Git push. */
  gitlabReleaseCreated?: boolean;
  /** `true` when a GitHub release was created after the Git push. */
  githubReleaseCreated?: boolean;
};
