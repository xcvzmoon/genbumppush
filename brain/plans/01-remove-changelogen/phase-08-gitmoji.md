# Phase 8: Own shortcode conversion data

Status: complete (2026-10-19).

Back to [[plans/01-remove-changelogen/overview]]

## Goal

Own shortcode conversion data. Depends on completion of preceding phases; internal modules remain unused until integration.

## Changes

- `src/changelog/gitmoji.ts`
- `tests/changelog-gitmoji.test.ts`
- `THIRD_PARTY_NOTICES.md`

Inspect the installed convert-gitmoji implementation and exact mapping data, then reproduce its relevant conversion semantics without a new runtime dependency. Record provenance, versions, and required notices for copied code/data, including changelogen attribution. Preserve unknown shortcodes and matching behavior rather than substituting a current gitmoji catalog.

## Data structures

GitmojiMapping.

## Routing and skills

Use the current implementation agent with testing and ts-best-practices; no specific model or provider required. Use review for the integration and removal gates.

## Verification

Static: run `vp check` for touched code and keep the project type-safe.

Runtime: Compare known aliases, unknown values, repeated shortcodes, Unicode emoji, and shortcode occurrences throughout rendered Markdown against the baseline.
