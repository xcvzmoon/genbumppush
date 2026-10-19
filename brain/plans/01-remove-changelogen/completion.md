# Implementation verification

Back to [[plans/01-remove-changelogen/overview]]

- Completed 2026-10-19; implementation commit c8431dc.
- Internal modules own commit collection/parsing, repository links, changelog settings, bump selection, shortcode mapping, contributor lookup, and Markdown rendering.
- Removed changelogen from package.json, the lockfile, runtime imports, and public declarations. No replacement runtime dependency was added.
- Preserved the previously authorized GitHub draft-release changes in commit 0d2dc52.
- Frozen parity evidence: 32 parsed/filter/bump/Markdown cases, 24 repository/config/history cases, and four complete-shortcode conversion cases.
- End-to-end tests cover exact written sections, unchanged historical entries, dry-run range headings, and generated note bodies sent to GitHub and GitLab.
- Final validation in the main checkout: vp install, vp check, vp test (175 tests across 12 suites), and vp run build all pass.
- Installed tarball in an isolated consumer: declarations compile, CLI dry run produces the expected changelog, dependency tree has no changelogen, and THIRD_PARTY_NOTICES.md ships in the archive.
- Read-only review found no blocking issues; its section-order assertion recommendation was added.
- Contributor output still depends on the same external ungh lookup; deterministic tests use recorded responses.
- Collector framing uses NUL separators to preserve pipe/dash-bearing metadata that the old implementation corrupted. Standard Git-history fixtures remain identical.
- Test discovery now matches tests/**/*.test.ts so fixture JSON and documentation are not treated as test suites.
- A first oracle config capture reused one directory and encountered Jiti caching. Recapture used fresh directories per case; regeneration instructions document that requirement.
- The first historical-draft-only commit attempt failed its hook because the removed package was unavailable while unstaged import replacements were hidden. A temporary reference symlink allowed validating that earlier state; it was removed before final validation. No checks were bypassed.
