# Compatibility details to freeze

Back to [[plans/01-remove-changelogen/overview]]

- History uses symmetric `from...to`; nearest reachable tag comes from git describe, not semver sorting.
- The current-ref fallback uses all tags at HEAD joined with newlines before falling back to the branch.
- Raw bodies include git log name-status output. Preserve relevant parsing behavior.
- Git log order is newest-first; section rows reverse each type group, while contributors retain first-seen newest-first order.
- The commit regex is unanchored and case insensitive. The caller normalizes type afterward.
- Body breaking detection accepts BREAKING CHANGE case insensitively, but not BREAKING-CHANGE.
- PR markers are stripped from descriptions; ordinary issue markers remain and also become reference links.
- Coauthors are parsed but not displayed as contributors by the current renderer.
- Contributor lookup runs even with noAuthors enabled. Keep side-effect cleanup separate unless explicitly approved; fixtures must model current calls.
- Type entries set to true survive filtering and may render an undefined title. Record this behavior rather than silently redefining it.
- Gitmoji conversion runs over the entire rendered document, including headings and author names.
- A present but invalid package repository prevents origin fallback.
- Self-hosted domains do not automatically imply a known provider.
- Dry-run rendering omits newVersion and uses a range heading; written sections use templates.tagBody independently of git.tagName.
- Tests currently focus on release workflow and often disable changelog writing; they are not an exact renderer compatibility suite.
- Nondeterministic inputs include contributor responses and Git hash abbreviation length. Freeze the environment/metadata where exact comparisons require it.
