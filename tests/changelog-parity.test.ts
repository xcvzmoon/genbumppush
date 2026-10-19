import type { ResolvedChangelogConfig } from '../src/changelog/types.ts';
import { afterEach, describe, expect, test } from 'vite-plus/test';
import { determineSemverChange } from '../src/changelog/bump.ts';
import { convertGitmoji } from '../src/changelog/gitmoji.ts';
import { generateMarkDown } from '../src/changelog/markdown.ts';
import { parseCommits } from '../src/changelog/parse.ts';
import fixtures from './fixtures/changelog/baseline.json' with { type: 'json' };
import gitmojiFixtures from './fixtures/changelog/gitmoji.json' with { type: 'json' };

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});
const usernames: Record<string, string> = {
  'alice@example.com': 'alice',
  'alice@work.example': 'alice-work',
  '123+bob@users.noreply.github.com': 'bob',
};

describe('changelog 0.6.2 compatibility', () => {
  for (const fixture of fixtures) {
    test(fixture.name, async () => {
      globalThis.fetch = (input) => {
        const url = input instanceof Request ? input.url : input.toString();
        const email = url.slice('https://ungh.cc/users/find/'.length);
        if (email === 'offline@example.com') return Promise.reject(new Error('offline'));
        const username = usernames[email];
        return Promise.resolve(
          new Response(JSON.stringify({ user: username ? { username } : null })),
        );
      };
      const config: ResolvedChangelogConfig = fixture.config;
      const parsed = parseCommits(fixture.raw, config);
      expect(parsed).toEqual(fixture.parsed);
      const commits = parsed
        .map((commit) => ({ ...commit, type: commit.type.toLowerCase() }))
        .filter((commit) => {
          const type = config.types[commit.type];
          return (
            type !== undefined &&
            type !== false &&
            !(
              fixture.excludeDependencies &&
              commit.type === 'chore' &&
              commit.scope === 'deps' &&
              !commit.isBreaking
            )
          );
        });
      expect(commits).toEqual(fixture.filtered);
      expect(determineSemverChange(commits, config)).toBe(fixture.bump);
      expect(await generateMarkDown(commits, config)).toBe(fixture.markdown);
      expect(await generateMarkDown(commits, config)).toBe(fixture.markdown);
    });
  }
});

for (const [index, fixture] of gitmojiFixtures.entries()) {
  test(`gitmoji mapping compatibility ${index + 1}`, () => {
    expect(convertGitmoji(fixture.input)).toBe(fixture.expected);
  });
}
