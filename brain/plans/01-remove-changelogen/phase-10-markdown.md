# Phase 10: Render identical Markdown

Status: complete (2026-10-19).

Back to [[plans/01-remove-changelogen/overview]]

## Goal

Render identical Markdown. Depends on completion of preceding phases; internal modules remain unused until integration.

## Changes

- `src/changelog/markdown.ts`
- `tests/changelog-markdown.test.ts`

Compose section headers, compare links, ordered entries, breaking section, contributor section, and final gitmoji conversion. Preserve first-character capitalization, scope trimming, reference priority, double spaces around breaking markers, blank lines, and final trimming. Keep file prepending in release.ts unchanged.

## Data structures

ParsedCommit, ResolvedChangelogConfig, Contributor.

## Routing and skills

Use the current implementation agent with testing and ts-best-practices; no specific model or provider required. Use review for the integration and removal gates.

## Verification

Static: run `vp check` for touched code and keep the project type-safe.

Runtime: Require byte-for-byte equality for normal/custom sections, reference formatting, breaking sections, contributor combinations, and empty/dry-run rendering fixtures. Rendering the same input twice must produce the same result.
