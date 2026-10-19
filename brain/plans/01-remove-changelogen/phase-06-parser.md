# Phase 6: Parse commits compatibly

Status: complete (2026-10-19).

Back to [[plans/01-remove-changelogen/overview]]

## Goal

Parse commits compatibly. Depends on completion of preceding phases; internal modules remain unused until integration.

## Changes

- `src/changelog/parse.ts`
- `tests/changelog-parse.test.ts`

Match 0.6.2 header acceptance, optional emoji, scope remapping, breaking detection, description cleanup, reference extraction/deduplication, and co-author metadata. Keep current lowercasing and dependency exclusion at their established pipeline position. Do not replace legacy parsing with stricter specification rules during this migration.

## Data structures

RawCommit, ParsedCommit, Reference.

## Routing and skills

Use the current implementation agent with testing and ts-best-practices; no specific model or provider required. Use review for the integration and removal gates.

## Verification

Static: run `vp check` for touched code and keep the project type-safe.

Runtime: Compare header and scope cases, breaking markers/body handling, PR versus issue references, co-author metadata, and rejected or unusual messages against the oracle.
