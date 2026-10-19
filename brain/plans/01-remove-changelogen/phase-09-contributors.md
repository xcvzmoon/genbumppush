# Phase 9: Preserve contributor resolution

Status: complete (2026-10-19).

Back to [[plans/01-remove-changelogen/overview]]

## Goal

Preserve contributor resolution. Depends on completion of preceding phases; internal modules remain unused until integration.

## Changes

- `src/changelog/contributors.ts`
- `tests/changelog-contributors.test.ts`

Retain name normalization, insertion order, grouping, bot exclusions, author filters, noreply handling, hidden-email behavior, and username-versus-email fallback. Use native fetch for the existing ungh lookup. Preserve the renderer’s actual author selection: parsed co-authors are not automatically displayed by 0.6.2. Document network timeout/caching changes as separate proposals rather than combining them with parity work.

## Data structures

Contributor, ContributorLookup.

## Routing and skills

Use the current implementation agent with testing and ts-best-practices; no specific model or provider required. Use review for the integration and removal gates.

## Verification

Static: run `vp check` for touched code and keep the project type-safe.

Runtime: Compare duplicate names with multiple emails, bot/filter exclusions, username success, unavailable or malformed lookup responses, and privacy/display flags. Mock every external request and assert visible Markdown, not only request shape.
