# Phase 5: Collect the same Git history

Status: complete (2026-10-19).

Back to [[plans/01-remove-changelogen/overview]]

## Goal

Collect the same Git history. Depends on completion of preceding phases; internal modules remain unused until integration.

## Changes

- `src/changelog/history.ts`
- `tests/changelog-history.test.ts`

Use existing Git execution infrastructure with argument arrays. Preserve nearest-tag selection, current-ref fallback, symmetric three-dot range behavior, traversal order, hash abbreviation, author metadata, and body semantics. Use unambiguous record framing; document pathological inputs that the old delimiter parser mishandles instead of silently claiming universal equivalence.

## Data structures

RawCommit.

## Routing and skills

Use the current implementation agent with testing and ts-best-practices; no specific model or provider required. Use review for the integration and removal gates.

## Verification

Static: run `vp check` for touched code and keep the project type-safe.

Runtime: Compare first releases without tags, linear tagged histories, diverged and merged histories, tag-at-HEAD behavior, and multiline/delimiter-bearing metadata. Derive expected results from fixed temporary repositories.
