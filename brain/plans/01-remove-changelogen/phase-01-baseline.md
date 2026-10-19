# Phase 1: Capture the compatibility oracle

Status: complete (2026-10-19).

Back to [[plans/01-remove-changelogen/overview]]

## Goal

Capture the compatibility oracle. Depends on completion of preceding phases; internal modules remain unused until integration.

## Changes

- `tests/changelog-parity.test.ts`
- `tests/fixtures/changelog/ (fixture collection)`
- `package.json`

Record the resolved changelogen 0.6.2 version and relevant helper versions. Pin the reference exactly during migration. Generate checked-in expected Markdown, parsed commits, and bump decisions from that version, with fixed Git metadata and mocked contributor responses. Separate synthetic edge cases from historical release inputs; existing CHANGELOG.md is evidence, not the sole oracle. Keep reference execution temporary and fixtures permanent.

## Data structures

RawCommit, ParsedCommitFixture, ChangelogParityFixture.

## Routing and skills

Use the current implementation agent with testing and ts-best-practices; no specific model or provider required. Use review for the integration and removal gates.

## Verification

Static: run `vp check` for touched code and keep the project type-safe.

Runtime: Compare clean and configured rendering, breaking/reference parsing, contributor responses, gitmoji, and release-range behavior. Group cases into fixture families rather than one oversized test. Prove fixture capture is reproducible without network access.
