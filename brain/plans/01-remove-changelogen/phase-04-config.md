# Phase 4: Load compatible changelog settings

Status: complete (2026-10-19).

Back to [[plans/01-remove-changelogen/overview]]

## Goal

Load compatible changelog settings. Depends on completion of preceding phases; internal modules remain unused until integration.

## Changes

- `src/changelog/config.ts`
- `tests/changelog-config.test.ts`

Reuse the existing direct c12 dependency while preserving changelogen config discovery, package key, dotenv behavior, precedence, and merge semantics. Inventory local/global RC and supported filenames from the installed loader before implementation. Keep genbumppush config and changelog config separate. Preserve default section insertion order, type bump rules, scopeMap, author settings, refs, and tagBody template.

## Data structures

ChangelogConfig, ResolvedChangelogConfig.

## Routing and skills

Use the current implementation agent with testing and ts-best-practices; no specific model or provider required. Use review for the integration and removal gates.

## Verification

Static: run `vp check` for touched code and keep the project type-safe.

Runtime: Compare defaults and merge order, config discovery, dotenv precedence, type disabling/customization, and ref resolution. Use isolated temporary directories and home settings so user configuration cannot affect tests.
