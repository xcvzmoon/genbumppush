# Phase 7: Preserve bump decisions

Status: complete (2026-10-19).

Back to [[plans/01-remove-changelogen/overview]]

## Goal

Preserve bump decisions. Depends on completion of preceding phases; internal modules remain unused until integration.

## Changes

- `src/changelog/bump.ts`
- `tests/changelog-bump.test.ts`

Implement stable major/minor/patch selection from configured types and breaking flags. Preserve null for no releasable bump and existing forced-release precedence. Keep version arithmetic in the existing version module.

## Data structures

ParsedCommit, StableBump.

## Routing and skills

Use the current implementation agent with testing and ts-best-practices; no specific model or provider required. Use review for the integration and removal gates.

## Verification

Static: run `vp check` for touched code and keep the project type-safe.

Runtime: Compare all default type mappings, configured mappings, breaking precedence, excluded dependency commits, and empty/chore-only inputs.
