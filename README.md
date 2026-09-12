# genbumppush

[![CI](https://img.shields.io/github/actions/workflow/status/xcvzmoon/genbumppush/ci.yml?branch=main&color=black)](https://github.com/xcvzmoon/genbumppush/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/actions/workflow/status/xcvzmoon/genbumppush/release.yml?color=black)](https://github.com/xcvzmoon/genbumppush/actions/workflows/release.yml)
[![npm version](https://img.shields.io/npm/v/genbumppush?color=black)](https://www.npmjs.com/package/genbumppush)
[![npm downloads](https://img.shields.io/npm/dm/genbumppush?color=black)](https://www.npmjs.com/package/genbumppush)

`genbumppush` handles the repetitive parts of releasing a Conventional Commit repository. It picks the next semantic version, updates the files you choose, writes the changelog, commits, tags, and can push the branch and tag together.

It supports Node packages, web applications (React, Vue, Solid, Svelte, Astro, Next, Nuxt, etc.), fixed-version monorepos, Tauri applications, and tag-driven publication/deployment. It does not publish packages or create provider releases itself; GitHub Actions or GitLab CI should handle those after the tag is pushed.

```bash
npm install --save-dev genbumppush
```

```json
{ "scripts": { "release": "genbumppush" } }
```

The package exports `defineConfig`, `loadReleaseConfig`, `runRelease`, and release types. The `genbumppush` binary is also available directly.

## Release lifecycle

The command loads C12 configuration, validates the Git worktree, detects the release type, and previews or confirms the release. It then calculates the version, checks local/remote tag collisions, runs `before` hooks, validates every version file, writes versions and the changelog, commits, tags, atomically pushes, and runs `after` hooks.

Version-file and commit-preparation failures restore files and the index. A failed tag or network push leaves the release commit locally for inspection and retry. If no releasable commit exists, it exits successfully without mutation.

## CLI

```text
genbumppush [release] [options]
```

| Type         | Result from `1.2.3` |
| ------------ | ------------------- |
| `major`      | `2.0.0`             |
| `minor`      | `1.3.0`             |
| `patch`      | `1.2.4`             |
| `premajor`   | `2.0.0-beta.0`      |
| `preminor`   | `1.3.0-beta.0`      |
| `prepatch`   | `1.2.4-beta.0`      |
| `prerelease` | `1.2.4-beta.0`      |

```bash
npm run release                                             # detect from Conventional Commits
npm run release patch                                       # force a release type
npm run release preminor --preid beta                       # start a prerelease channel
npm run release prerelease --preid beta
npm run release --dry-run                                   # preview without mutation
npm run release patch --no-push                             # local commit and tag only
npm run release patch --yes                                 # non-interactive
genbumppush --cwd ../app --config release.config.ts patch
genbumppush --retry-gitlab v1.2.4                           # retry provider release after a successful Git push
```

| Option                 | Meaning                                                  |
| ---------------------- | -------------------------------------------------------- |
| positional release     | One supported release type                               |
| `--cwd <path>`         | Repository directory; defaults to the current directory  |
| `--config <path>`      | Explicit C12 config file                                 |
| `--preid <id>`         | Identifier containing letters, numbers, and hyphens      |
| `--retry-gitlab <tag>` | Retry GitLab release creation for an existing remote tag |
| `--retry-github <tag>` | Retry GitHub release creation for an existing remote tag |
| `--dry-run`            | Preview without changing files, Git, or remotes          |
| `--no-push`            | Keep commit and tag local                                |
| `--yes`, `-y`          | Skip confirmation                                        |
| `--help`, `-h`         | Print help                                               |

Values are resolved in this order: CLI flags, C12 config file, the `"genbumppush"` key in `package.json`, then defaults. A CLI flag such as `--no-push` overrides both config surfaces.

## Commit detection

Automatic detection uses `changelogen`:

```text
feat: add an adapter       -> minor
fix: handle empty input    -> patch
feat!: remove old API      -> major
refactor(api)!: change API -> major
chore(deps): update vite   -> excluded by default
```

`BREAKING CHANGE:` footers are supported. Set `release` to force a type. Non-breaking `chore(deps)` commits are excluded by default; set `excludeDependencyCommits: false` to include them.

## Configuration

Prefer a dedicated C12 file so the config stays typed, commented, and out of dependency diffs. Create `genbumppush.config.ts`:

```ts
import { defineConfig } from 'genbumppush';

export default defineConfig({
  // release: 'patch', // omit for automatic detection
  preid: 'beta',
  changelog: 'CHANGELOG.md',
  excludeDependencyCommits: true,
  recursive: false,
  files: ['package.json'],
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
  hooks: {
    before: ['vp check', 'vp test'],
    after: 'echo Release complete',
  },
});
```

JavaScript C12 files are also supported. Use `--config <path>` to load a file at another location.

### Config in `package.json`

For simple setups, the same object can live under the exact top-level key `"genbumppush"` in `package.json`. Other keys are ignored.

```json
{
  "name": "my-app",
  "version": "1.2.3",
  "genbumppush": {
    "changelog": "CHANGELOG.md",
    "files": ["package.json"],
    "git": {
      "remote": "origin",
      "push": true,
      "tagName": "v{{version}}"
    }
  }
}
```

JSON has no comments and no `defineConfig` typing, so move to `genbumppush.config.ts` once the release config grows nested `github`/`gitlab` blocks or custom hooks. A config file always wins over the `package.json` key.

**Never put secrets in either surface.** Tokens, host credentials, and project IDs with credentials belong in the process environment or an uncommitted `.env`. Config may only name which env var to read (for example `tokenEnv`).

| Key                        | Type                      | Default                        | Behavior                                |
| -------------------------- | ------------------------- | ------------------------------ | --------------------------------------- |
| `release`                  | release type              | detected                       | Force release type                      |
| `preid`                    | string                    | `beta`                         | Prerelease channel                      |
| `changelog`                | `false \| true \| string` | `CHANGELOG.md`                 | Disable, default, or custom path        |
| `excludeDependencyCommits` | boolean                   | `true`                         | Ignore non-breaking dependency commits  |
| `files`                    | string[]                  | `['package.json']`             | Version files                           |
| `recursive`                | boolean                   | `false`                        | Discover nested manifests               |
| `git.remote`               | string                    | `origin`                       | Remote for checks and push              |
| `git.push`                 | boolean                   | `true`                         | Push branch and tag                     |
| `git.sign`                 | boolean                   | `false`                        | Sign commit and tag                     |
| `git.requireClean`         | boolean                   | `true`                         | Reject uncommitted changes              |
| `git.requireUpstream`      | boolean                   | `true`                         | Require upstream before pushing         |
| `git.commitMessage`        | string                    | `chore(release): v{{version}}` | Commit template                         |
| `git.tagName`              | string                    | `v{{version}}`                 | Tag template                            |
| `git.tagMessage`           | string                    | `v{{version}}`                 | Annotated tag template                  |
| `hooks.before`             | string or string[]        | unset                          | Commands before file changes            |
| `hooks.after`              | string or string[]        | unset                          | Commands after tag/push                 |
| `github.enabled`           | boolean                   | `false`                        | Create a GitHub release after push      |
| `github.host`              | string                    | `github.com`                   | github.com or GHES host                 |
| `github.repo`              | string                    | env / remote                   | `owner/name`                            |
| `github.tokenEnv`          | string                    | auto                           | Exact env var name (disables fallbacks) |
| `github.releaseName`       | string                    | tag                            | Release title template                  |
| `gitlab.enabled`           | boolean                   | `false`                        | Create a GitLab release after push      |

`{{version}}` is replaced in commit and tag templates. Hooks run through the shell in the repository directory; only use trusted configuration.

## Environment variables and `.env`

Config never stores secrets — not in `genbumppush.config.ts`, not in `"genbumppush"` inside `package.json`. Those files are committed; tokens must not be. Provider credentials are read from the process environment. On every run, genbumppush loads `.env` from the working directory (same behavior as changelogen). Values already set in the real environment win over `.env`.

Preferred names use the `GENBUMPPUSH_` prefix. Legacy provider variables still work as fallbacks:

| Purpose           | Preferred                       | Fallbacks                                               |
| ----------------- | ------------------------------- | ------------------------------------------------------- |
| GitHub token      | `GENBUMPPUSH_GITHUB_TOKEN`      | `GITHUB_TOKEN`, `GH_TOKEN`, `CHANGELOGEN_TOKENS_GITHUB` |
| GitHub host       | `GENBUMPPUSH_GITHUB_HOST`       | `GITHUB_API_URL`                                        |
| GitHub repository | `GENBUMPPUSH_GITHUB_REPOSITORY` | `GITHUB_REPOSITORY`                                     |
| GitLab token      | `GENBUMPPUSH_GITLAB_TOKEN`      | `GITLAB_TOKEN`                                          |
| GitLab host       | `GENBUMPPUSH_GITLAB_HOST`       | `GITLAB_HOST`                                           |
| GitLab project    | `GENBUMPPUSH_GITLAB_PROJECT`    | `GITLAB_PROJECT`                                        |

When `tokenEnv` is set in config, only that exact variable name is read; the fallback chain is skipped. Leave `tokenEnv` unset to use the preferred/fallback chain above.

```bash
# .env (do not commit)
GENBUMPPUSH_GITHUB_TOKEN=ghp_...
```

`.env` is optional. Add it to `.gitignore`. CI should inject the same variables through the job environment instead of a file.

## Version-file adapters

Every configured file is validated before writes begin. Structured files must agree with the root version; mismatches fail without partial updates.

Supported adapters:

- `package.json`: top-level `version`
- `package-lock.json`: root `version` and `packages['']` version
- Explicit JSON such as `tauri.conf.json`: top-level `version`
- `Cargo.toml`: `version` in `[package]`
- `Cargo.lock`: only the package matching the adjacent Cargo manifest

Other files use exact text replacement: the current version must occur exactly once. This suits a `VERSION` file, but not arbitrary lockfiles. There is no general pnpm-lock.yaml adapter; configure it only when the current version occurs exactly once.

### Fixed-version monorepo

```ts
export default defineConfig({
  recursive: true,
  files: ['package.json', 'package-lock.json'],
});
```

Discovery ignores `.git`, `node_modules`, `dist`, `target`, and `.output`. It assumes versioned workspaces share one version; independent-version packages need a separate strategy.

### Tauri

```ts
export default defineConfig({
  files: [
    'package.json',
    'src-tauri/tauri.conf.json',
    'src-tauri/Cargo.toml',
    'src-tauri/Cargo.lock',
  ],
});
```

Cargo dependency versions are not changed. Only the application package and matching lock entry are updated.

## Git safety and recovery

Defaults reject dirty worktrees, detached HEAD, missing upstreams, and existing local or remote tags. Branch and tag are sent with `git push --atomic`.

Use `--no-push` for a local rehearsal. If a push fails after commit/tag creation, inspect `git status`, `git log`, and `git show`, then retry the push or remove local artifacts deliberately. If GitLab release creation fails after the Git push succeeds, fix the provider or credentials and run `genbumppush --retry-gitlab <tag>`.

For deliberate exceptions, set `git.requireClean: false` or `git.requireUpstream: false`. These do not disable tag collision checks or version validation.

## GitHub Actions and npm

The included workflows split CI, release creation, and package publication into separate jobs:

- `ci.yml` runs `vp check`, `vp test`, and `vp pack` on pull requests and main pushes.
- `release.yml` reacts to `v*` tags and creates a GitHub Release from the changelog section.
- `publish.yml` reacts to `v*` tags, verifies `v${package.json.version}`, rebuilds, and publishes.

A release commit message alone does not trigger tag workflows. The tag must exist and be pushed:

```bash
git push origin main v0.0.1
```

For npm trusted publishing, configure the npm package trusted publisher to match the repository/workflow, keep `id-token: write`, and use a current npm. The included workflow enables provenance for public repositories. Private source repositories should set `NPM_CONFIG_PROVENANCE=false` because npm rejects private-source provenance bundles.

## GitHub and GitLab releases

GitHub Releases are supported as an opt-in provider after the Git branch and tag are pushed atomically. genbumppush uses the exact `git.tagName` string (so custom templates work) and creates or updates the release via the GitHub API (including GHES).

```ts
export default defineConfig({
  git: { push: true },
  github: {
    enabled: true,
    // host: 'github.com', // or a GHES host
    // repo: 'group/project', // or GENBUMPPUSH_GITHUB_REPOSITORY / GITHUB_REPOSITORY / package.json
    // omit tokenEnv to use GENBUMPPUSH_GITHUB_TOKEN, then GITHUB_TOKEN / GH_TOKEN / CHANGELOGEN_TOKENS_GITHUB
    releaseName: 'v{{version}}',
  },
});
```

If GitHub release creation fails after the Git push succeeds, fix credentials and run `genbumppush --retry-github <tag>`.

GitLab release creation remains supported the same way. Configure a project path and provide an API token through the environment:

```ts
export default defineConfig({
  git: { push: true },
  gitlab: {
    enabled: true,
    host: 'https://gitlab.com',
    project: 'group/project',
    releaseName: 'v{{version}}',
  },
});
```

Without `tokenEnv`, GitLab tokens resolve from `GENBUMPPUSH_GITLAB_TOKEN`, then `GITLAB_TOKEN`. `GENBUMPPUSH_GITLAB_HOST` / `GITLAB_HOST` and `GENBUMPPUSH_GITLAB_PROJECT` / `GITLAB_PROJECT` cover host and project fallbacks. GitLab receives
the matching `CHANGELOG.md` section as the release description. If `git.push` is false,
the provider is rejected because GitLab cannot create a release for an unpublished tag.

```yaml
release:
  image: node:20
  rules:
    - if: '$CI_COMMIT_TAG =~ /^v/'
  script:
    - npm ci
    - npx genbumppush --dry-run --yes
    - npm run build
  release:
    tag_name: '$CI_COMMIT_TAG'
    name: 'Release $CI_COMMIT_TAG'
```

Keep artifact publication and GitLab release creation in protected, tag-triggered jobs with their own credentials.

## Scenario guide

| Scenario               | Recommended setup                                  |
| ---------------------- | -------------------------------------------------- |
| Local release          | `npm run release`, confirm interactively           |
| CI release             | `genbumppush --yes` with protected Git credentials |
| Preview only           | `genbumppush --dry-run --yes`                      |
| Local commit/tag only  | `genbumppush patch --no-push --yes`                |
| Nuxt or Node package   | Default `package.json` adapter                     |
| npm lockfile           | Add `package-lock.json` explicitly                 |
| Fixed-version monorepo | `recursive: true`                                  |
| Tauri                  | Explicit JSON, Cargo.toml, and Cargo.lock files    |
| Custom VERSION file    | Add only if the old version occurs once            |
| GitHub/npm publication | Push `v*`; let workflows publish                   |
| GitLab release         | Run downstream jobs on `$CI_COMMIT_TAG`            |

## Troubleshooting

### Tag does not match package version

```bash
node -p "require('./package.json').version"
git describe --tags --exact-match HEAD
```

The publisher requires `v${package.json.version}`. Correct the release commit before creating or pushing a replacement tag.

### Dirty worktree, existing tag, or version mismatch

Run `git status --short` and inspect an existing tag with `git show <tag>`. Commit/stash changes, align every configured manifest with the root version, and never overwrite a published tag as a normal retry.

### `EBADDEVENGINES`

`devEngines.packageManager` is npm metadata. Run with the declared package manager or align the metadata with the manager used by CI; it is separate from release logic.

### Private-repository provenance failure

npm rejects provenance bundles identifying private GitHub source repositories. Set `NPM_CONFIG_PROVENANCE=false` in the publish workflow, or make the source public and keep provenance enabled.

### Workflow did not run

Verify the tag was pushed, matches `v*`, and the workflow exists on the pushed commit:

```bash
git ls-remote --tags origin
gh run list --workflow release.yml
```

## Development

```bash
vp install
vp check
vp test
vp pack
```

The test suite covers CLI parsing, C12 configuration, SemVer edges, JSON/npm/Cargo adapters, recursive workspaces, dry runs, rollback, hooks, tag collisions, detached HEAD, upstream checks, and a real atomic push to a temporary bare Git remote.

## License

MIT
