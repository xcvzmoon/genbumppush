# Changelog compatibility fixtures

Captured on 2026-10-19 before removing the reference dependency:

- changelogen 0.6.2
- convert-gitmoji 0.1.5
- scule 1.3.0
- c12 3.3.4 (reference); c12 4.0.0-rc.1 (internal loader)

`baseline.json` stores raw commits, resolved settings, original parsed commits, the app's normalized/filtered commits, bump decisions, and exact rendered Markdown. It includes the real v0.0.7...v0.0.8 commit history rendered with a fixed fixture repository and deterministic contributor responses; it does not claim to reproduce historical network responses.

`repositories.json`, `histories.json`, and `configurations.json` capture the reference repository resolver, Git collector, and consumed configuration fields. `gitmoji.json` captures every shortcode from the installed converter, uppercase aliases, adjacent shortcodes, unknown values, and spacing. Type-order equality is exercised by rendered Markdown rather than JSON property-order comparisons alone.

Contributor lookup responses are fixed in `changelog-parity.test.ts`: Alice and Bob resolve to usernames, the offline email rejects, and all others return a null user. No network access is needed to run the tests.

## Independently regenerate the reference

1. Install exactly `changelogen@0.6.2` in a disposable directory, retaining its captured helper versions above. Do not add it back to this project's package or lockfile.
2. Set the reference process's global fetch stub **before dynamically importing** the reference module: node-fetch-native captures fetch at module load.
3. For each baseline fixture, pass its `raw` and `config` to `parseCommits`. Lowercase types and apply the app's type/dependency filter to obtain `filtered`. Evaluate `determineSemverChange` and `generateMarkDown` from the reference against those filtered commits. Compare results to the recorded fields.
4. For repository fixtures, call `getRepoConfig` with each URL. Omitted undefined properties are normalized through JSON serialization.
5. Recreate history using the setup in `changelog-boundaries.test.ts`. Commits use the fixed date 2026-01-01T00:00:00Z and fixed name/email; compare `getGitDiff` output. Keep the diverged case before the merge.
6. For config fixtures, use a **fresh directory for every case**, apply the recorded files over the test's merged-repository setup, then call `loadChangelogConfig`. Remove unused `tokens`/`publish` fields and replace the actual cwd with `/fixture` before comparing. Reusing a directory can make Jiti return cached config-file contents.
7. For gitmoji fixtures, call the converter's `convert(input, true)`.

Review every difference before updating expected data. These files define compatibility with a frozen release, not with upstream's latest behavior. Git hash lengths can depend on Git configuration; the history fixtures use the default seven-character abbreviation.

The new collector deliberately uses NUL framing instead of the old pipe/dash delimiters, preserving valid delimiter-bearing metadata that the old collector corrupted. Standard-history fixtures remain byte-identical. Upstream source attribution is in THIRD_PARTY_NOTICES.md.
