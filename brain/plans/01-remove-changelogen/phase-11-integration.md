# Phase 11: Switch release and GitHub integration

Status: complete (2026-10-19).

Back to [[plans/01-remove-changelogen/overview]]

## Goal

Switch release and GitHub integration. Depends on completion of preceding phases; internal modules remain unused until integration.

## Changes

- `src/release.ts`
- `src/github.ts`
- `tests/release.test.ts`

Replace runtime and type imports with internal modules after their individual parity gates pass. Keep filtering, hooks, validation, rollback, tag/version templates, changelog output path, GitHub drafts, GitLab behavior, Docker publication, and retries intact. Update GitHub fallback repository resolution to use the shared internal resolver. Transition the parity harness to internal-only fixture assertions and retire temporary oracle generation tooling as a separate mechanical cleanup if needed to keep this phase small.

## Data structures

Existing ReleaseResult and provider contexts; internal changelog types.

## Routing and skills

Use the current implementation agent with testing and ts-best-practices; no specific model or provider required. Use review for the integration and removal gates.

## Verification

Static: run `vp check` for touched code and keep the project type-safe.

Runtime: Exercise dry-run output, complete local release plus exact prepended changelog, provider release-note bodies, dependency filtering/forced bump, and no-releasable-change paths. Assert existing changelog suffix bytes remain unchanged and dry runs do not mutate files/Git. Run existing provider and rollback suites.
