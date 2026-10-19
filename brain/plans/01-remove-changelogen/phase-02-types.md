# Phase 2: Define internal compatibility types

Status: complete (2026-10-19).

Back to [[plans/01-remove-changelogen/overview]]

## Goal

Define internal compatibility types. Depends on completion of preceding phases; internal modules remain unused until integration.

## Changes

- `src/changelog/types.ts`
- `tests/changelog-types.test.ts`

Define only the types needed by commit collection, configuration, rendering, repository resolution, and bump selection. Keep external configuration input distinct from validated internal data. Avoid exporting implementation details or changing public ReleaseType yet.

## Data structures

RawCommit, ParsedCommit, Reference, Repository, ChangelogConfig, ResolvedChangelogConfig, StableBump.

## Routing and skills

Use the current implementation agent with testing and ts-best-practices; no specific model or provider required. Use review for the integration and removal gates.

## Verification

Static: run `vp check` for touched code and keep the project type-safe.

Runtime: Type-check valid configuration and narrowing at unknown boundaries. Ensure disabled and title-bearing type entries remain distinguishable without unsafe casts.
