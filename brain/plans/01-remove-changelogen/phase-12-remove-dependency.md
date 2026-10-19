# Phase 12: Remove package and finish verification

Status: complete (2026-10-19).

Back to [[plans/01-remove-changelogen/overview]]

## Goal

Remove package and finish verification. Depends on completion of preceding phases; internal modules remain unused until integration.

## Changes

- `src/types.ts`
- `package.json`
- `pnpm-lock.yaml`

Remove the external SemverBumpType constraint while retaining the public ReleaseType union. Remove changelogen and its exact reference pin. The baseline harness must already use internal modules by the integration gate, with oracle-only generation tooling retired in that phase; preserve recorded fixtures and internal assertions. Regenerate the lockfile using vp. Keep CHANGELOGEN_TOKENS_GITHUB as an intentional credential compatibility alias; it is not a package dependency.

## Data structures

Public ReleaseType remains unchanged.

## Routing and skills

Use the current implementation agent with testing and ts-best-practices; no specific model or provider required. Use review for the integration and removal gates.

## Verification

Static: run `vp check` for touched code and keep the project type-safe.

Runtime: Run vp install, vp check, vp test, and vp run build. Inspect bundled code and emitted declarations for changelogen imports. Verify a packed installation in an isolated consumer can import defineConfig/runRelease and execute the CLI dry run without changelogen installed.
