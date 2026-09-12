# Config recipes

Full option surface, defaults, and scenario templates for genbumppush.

## Config sources and precedence

1. CLI flags (`--no-push`, `--preid`, positional release type, …)
2. Explicit `--config <path>` C12 file
3. Auto-discovered C12 file named `genbumppush` in cwd (`genbumppush.config.ts`, `.js`, `.mjs`, …)
4. `"genbumppush"` key in `package.json`
5. Built-in defaults

`defineConfig` is a typed identity helper from the package. `loadReleaseConfig(cwd, configFile?, overrides?)` loads C12 + dotenv and returns the merged object.

## Defaults (as implemented)

| Key                            | Default                            |
| ------------------------------ | ---------------------------------- |
| `release`                      | detected from commits (unless set) |
| `preid`                        | `beta` (used only for pre* types)  |
| `changelog`                    | `'CHANGELOG.md'`                   |
| `excludeDependencyCommits`     | `true`                             |
| `recursive`                    | `false`                            |
| `files`                        | `['package.json']`                 |
| `git.remote`                   | `'origin'`                         |
| `git.push`                     | `true`                             |
| `git.sign`                     | `false`                            |
| `git.requireClean`             | `true`                             |
| `git.requireUpstream`          | `true`                             |
| `git.commitMessage`            | `'chore(release): v{{version}}'`   |
| `git.tagName`                  | `'v{{version}}'`                   |
| `git.tagMessage`               | `'v{{version}}'`                   |
| `github.enabled`               | `false`                            |
| `gitlab.enabled`               | `false`                            |
| `hooks.before` / `hooks.after` | unset                              |

`{{version}}` is replaced in `commitMessage`, `tagName`, `tagMessage`, and provider `releaseName`.

## Minimal / package / monorepo / Tauri

### Minimal npm package

```ts
import { defineConfig } from 'genbumppush';

export default defineConfig({
  files: ['package.json'],
});
```

### package-lock.json in sync

```ts
export default defineConfig({
  files: ['package.json', 'package-lock.json'],
});
```

`package-lock.json` updates root `version` and `packages[''].version`.

### Fixed-version monorepo

```ts
export default defineConfig({
  recursive: true,
  files: ['package.json', 'package-lock.json'],
});
```

Recursive discovery walks nested directories and finds every `package.json`, ignoring `.git`, `node_modules`, `dist`, `target`, `.output`. All discovered manifests must already share the root version (or fail with `VERSION_MISMATCH`). Independent-version packages are out of scope.

### Tauri desktop app

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

Only the application Cargo package and its matching `Cargo.lock` entry are rewritten. Dependency versions in Cargo are not touched.

### Custom VERSION file

```ts
export default defineConfig({
  files: ['package.json', 'VERSION'],
});
```

Non-special files use exact text replacement: the current version string must appear **exactly once**. There is no general `pnpm-lock.yaml` adapter.

### Disable changelog

```ts
export default defineConfig({
  changelog: false,
});
```

### Force type + signed Git

```ts
export default defineConfig({
  release: 'patch',
  git: { sign: true },
});
```

### Local-only rehearsal (config, not only CLI)

```ts
export default defineConfig({
  git: { push: false },
});
```

Note: GitHub/GitLab release providers reject `push: false`.

## Version-file adapter matrix

| Path / shape                                                        | Adapter behavior                                           |
| ------------------------------------------------------------------- | ---------------------------------------------------------- |
| `package.json`                                                      | Top-level `version`                                        |
| `package-lock.json`                                                 | Root `version` + `packages['']`                            |
| Other JSON with top-level string `version` (e.g. `tauri.conf.json`) | Structured top-level update                                |
| `Cargo.toml`                                                        | `version` under `[package]`                                |
| `Cargo.lock`                                                        | Entry for the package matching the adjacent Cargo manifest |
| Any other file                                                      | Exact single occurrence replace of current version         |

All configured files are **validated first**; mismatches abort without partial writes. Paths must stay inside the repository (symlink escape → `PATH_OUTSIDE_REPOSITORY`).

## Environment variables

Preferred prefix `GENBUMPPUSH_`. On each run, `.env` is loaded from cwd (changelogen-compatible). Process env already set wins over `.env`.

| Purpose        | Preferred                       | Fallbacks                                                            |
| -------------- | ------------------------------- | -------------------------------------------------------------------- |
| GitHub token   | `GENBUMPPUSH_GITHUB_TOKEN`      | `GITHUB_TOKEN`, `GH_TOKEN`, `CHANGELOGEN_TOKENS_GITHUB`              |
| GitHub host    | `GENBUMPPUSH_GITHUB_HOST`       | `GITHUB_API_URL`                                                     |
| GitHub repo    | `GENBUMPPUSH_GITHUB_REPOSITORY` | `GITHUB_REPOSITORY`, then remote via changelogen `resolveRepoConfig` |
| GitLab token   | `GENBUMPPUSH_GITLAB_TOKEN`      | `GITLAB_TOKEN`                                                       |
| GitLab host    | `GENBUMPPUSH_GITLAB_HOST`       | `GITLAB_HOST` → `https://gitlab.com`                                 |
| GitLab project | `GENBUMPPUSH_GITLAB_PROJECT`    | `GITLAB_PROJECT`                                                     |

If `tokenEnv` is set on the provider config, **only** that exact variable is read (no fallbacks).

```bash
# .env — do not commit
GENBUMPPUSH_GITHUB_TOKEN=ghp_...
```

CI should inject the same names via the job environment, not a file.

## Provider release config

### GitHub (incl. GHES)

```ts
export default defineConfig({
  git: { push: true },
  github: {
    enabled: true,
    // host: 'github.com',           // or GHES host → https://HOST/api/v3
    // repo: 'owner/name',
    // tokenEnv: 'MY_GITHUB_TOKEN',  // disables fallback chain
    releaseName: 'v{{version}}',
  },
});
```

Repo resolution: config `github.repo` → `GENBUMPPUSH_GITHUB_REPOSITORY` / `GITHUB_REPOSITORY` → git remote metadata. Description is the matching `## <tag>` section of the changelog.

### GitLab

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

Project path is required (config or env). Without a token: clear error telling the user which env var to set.

## Hooks

```ts
export default defineConfig({
  hooks: {
    before: ['vp check', 'vp test'], // string or string[]
    after: 'echo Release complete',
  },
});
```

- `before`: after tag-collision check, before version-file writes.
- `after`: after tag, optional atomic push, and provider releases.
- Run with `shell: true` in the repo cwd; non-zero → `HOOK_FAILED` (before hooks: no files written yet if they fail before apply; after hooks: release already pushed).

## What genbumppush does not do

- Does not publish to npm (use tag-triggered publish workflow).
- Does not support independent multi-package versioning in one run.
- Does not modify Cargo dependency versions.
- Does not disable tag collision checks when relaxing `requireClean` / `requireUpstream`.
