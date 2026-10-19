# Replace changelogen with compatible internal generation

## Context and outcome

- Requested 2026-10-19; status: complete, implemented and verified on 2026-10-19.
- Remove changelogen from production and development dependencies while retaining new generated changelog content and release decisions for supported existing inputs.
- Compatibility target: installed changelogen 0.6.2 and its resolved helper versions, not upstream main or a floating range.
- Existing release-draft edits in the working tree belong to earlier work and must be preserved.

## Scope and constraints

- Replace history collection, commit parsing, changelog configuration, bump selection, Markdown rendering, contributor lookup, gitmoji conversion, and repository resolution.
- Preserve public APIs, legacy credential aliases, separate changelog config discovery, default mappings, provider links, and existing release orchestration.
- No new runtime dependency. Keep the existing c12 dependency. Node built-ins provide Git process execution, file access, and fetch.
- Contributor output is equal given identical lookup responses; historical live network results cannot be guaranteed indefinitely.
- Leave existing changelog entries untouched. Do not regenerate historical sections.
- No provider publication changes, parser/spec upgrades, new CLI flags, global config redesign, or dependency-free claim for the entire package.
- Do not copy the whole changelogen package: adapt only the reachable behavior, retaining appropriate upstream notices.
- No brain/principles.md exists in this repository. There are no project principle files to cite; AGENTS.md and established source/test conventions govern this plan.

## Alternatives and chosen architecture

- Chosen: internal, typed pipeline with a frozen compatibility corpus. It removes the dependency while giving us control over a bounded implementation.
- Rejected: another changelog generator. It adds a dependency and still requires reproducing rendering/configuration behavior.
- Rejected: a minimal conventional-commit regex and template. It misses reference, author, configuration, and version-decision compatibility.
- Separate pure parsing/rendering/bump functions from Git/config/network boundaries. Share repository resolution with GitHub release configuration.
- Prefer preservation over cleanup in this migration. Capture discrepancies explicitly; do not silently improve upstream quirks or alter expected fixtures.

## Compatibility inventory

See [[plans/01-remove-changelogen/compatibility-notes]] for source-confirmed quirks that fixtures must cover.

## Phases

1. [[plans/01-remove-changelogen/phase-01-baseline|Capture the compatibility oracle]]
2. [[plans/01-remove-changelogen/phase-02-types|Define internal compatibility types]]
3. [[plans/01-remove-changelogen/phase-03-repository|Replace repository resolution]]
4. [[plans/01-remove-changelogen/phase-04-config|Load compatible changelog settings]]
5. [[plans/01-remove-changelogen/phase-05-git-history|Collect the same Git history]]
6. [[plans/01-remove-changelogen/phase-06-parser|Parse commits compatibly]]
7. [[plans/01-remove-changelogen/phase-07-bump|Preserve bump decisions]]
8. [[plans/01-remove-changelogen/phase-08-gitmoji|Own shortcode conversion data]]
9. [[plans/01-remove-changelogen/phase-09-contributors|Preserve contributor resolution]]
10. [[plans/01-remove-changelogen/phase-10-markdown|Render identical Markdown]]
11. [[plans/01-remove-changelogen/phase-11-integration|Switch release and GitHub integration]]
12. [[plans/01-remove-changelogen/phase-12-remove-dependency|Remove package and finish verification]]
13. [[plans/01-remove-changelogen/phase-13-documentation|Document ownership and compatibility]]

## Implementation evidence

See [[plans/01-remove-changelogen/completion]] for verification results and the bounded collector difference.

## Verification and acceptance gates

- Before changing behavior: capture expected parsed commits, bump decisions, and exact Markdown from the frozen oracle; mock network and isolate environment/configuration.
- Before integration: internal stages pass their recorded parity fixtures and temporary differential comparisons.
- Before removal: end-to-end dry run, file prepend, provider notes, forced/detected versions, and rollback tests pass.
- Final commands: vp install, vp check, vp test, vp run build. Inspect package.json/vite.config.ts again for any additional required checks at execution time.
- Packed-consumer smoke test proves CLI execution and portable declarations without changelogen installed. No live remote push, release creation, or package publication is needed.
- Production source, emitted declarations, and dependency graph contain no changelogen package reference; documentation, provenance, and legacy environment aliases may mention its name.
- Any intentional incompatibility must be identified and accepted before dependency removal. Fixture changes require an explained behavior change, never blind snapshot updates.

## Applicable skills

- execute: implementation sequencing and verification.
- testing: compatibility fixtures and integration regressions.
- ts-best-practices: internal types and validation of external values.
- review: parity and scope review before final removal.
- brain and plan: this planning deliverable.

## Reference material

- Local baseline: node_modules/changelogen/dist/shared/changelogen.D-9f3HTX.mjs and changelogen.Ck48ZmxS.mjs.
- Upstream renderer: https://github.com/unjs/changelogen/blob/v0.6.2/src/markdown.ts
- Upstream config: https://github.com/unjs/changelogen/blob/v0.6.2/src/config.ts
- Upstream parser/history: https://github.com/unjs/changelogen/blob/v0.6.2/src/git.ts
- Upstream license: https://github.com/unjs/changelogen/blob/v0.6.2/LICENSE
