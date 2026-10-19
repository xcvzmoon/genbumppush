# Phase 3: Replace repository resolution

Status: complete (2026-10-19).

Back to [[plans/01-remove-changelogen/overview]]

## Goal

Replace repository resolution. Depends on completion of preceding phases; internal modules remain unused until integration.

## Changes

- `src/changelog/repository.ts`
- `tests/changelog-repository.test.ts`

Reproduce package.json repository precedence and origin fallback, URL parsing, provider detection, reference URLs, and compare URLs. Preserve current missing/unknown-provider behavior. Treat fixes for nested GitLab paths or custom hosts as separate follow-up work if they differ from the oracle.

## Data structures

Repository, Reference.

## Routing and skills

Use the current implementation agent with testing and ts-best-practices; no specific model or provider required. Use review for the integration and removal gates.

## Verification

Static: run `vp check` for touched code and keep the project type-safe.

Runtime: Compare repository shorthand and URL forms, package precedence, missing remotes, provider-specific links, and unsupported-provider behavior against baseline fixtures.
