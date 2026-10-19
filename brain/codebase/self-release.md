# Self-release workflow

- Run `vp run release` from a clean main checkout with its upstream configured.
- The script runs vp check, vp test, a fresh library build, then the built CLI with --yes.
- Preview with `vp run release --dry-run`; force a patch with `vp run release patch`.
- Vite+ 0.3.1 forwards a literal double-dash separator to the CLI. Do not document `vp run release -- --dry-run`.
- Provider releases remain disabled locally by default. Tag pushes invoke publish.yml for npm and release.yml for a draft GitHub release.
- Both tag workflows verify that the tag equals v plus package.json version.
- CI builds before running npm pack --dry-run from runner.temp, avoiding root devEngines.packageManager validation by npm.
- npm publish --dry-run still rejects an already-published version; use npm pack for repeatable CI checks of published main versions.
- The bin mapping uses dist/bin.mjs without a leading ./ to avoid npm's misleading normalization warning about removing the script name.
- Verified 2026-10-19: all 175 tests, formatting/lint/types, library build, and actionlint 1.7.12 pass.
- A disposable clone ran both the complete preview command and the real self-release script with stdin closed, generating v0.0.9 and atomically pushing the release commit/tag to a local bare remote only.
- npm publish --dry-run succeeded for that candidate version. The tarball retained the bin mapping, executable mode, and notices; an isolated installed CLI successfully ran --help.
- Mocked gh workflow checks covered version match/mismatch, exact notes and --draft, existing-release skip, and generated-note fallback.
- Actual GitHub Actions execution and OIDC publication await a real tag push; no GitHub tag or npm version was published during verification.
