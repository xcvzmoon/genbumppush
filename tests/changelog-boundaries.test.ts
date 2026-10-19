import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vite-plus/test';
import { loadChangelogConfig } from '../src/changelog/config.ts';
import { getCurrentGitRef, getGitDiff, getLastGitTag } from '../src/changelog/history.ts';
import { getRepoConfig, resolveRepoConfig } from '../src/changelog/repository.ts';
import configurations from './fixtures/changelog/configurations.json' with { type: 'json' };
import histories from './fixtures/changelog/histories.json' with { type: 'json' };
import repositories from './fixtures/changelog/repositories.json' with { type: 'json' };

const folders: string[] = [];
afterEach(async () => {
  await Promise.all(
    folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })),
  );
});
async function temp(): Promise<string> {
  const cwd = await mkdtemp(join(tmpdir(), 'genbumppush-changelog-'));
  folders.push(cwd);
  return cwd;
}
function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: 'pipe',
    env: {
      ...process.env,
      GIT_AUTHOR_DATE: '2026-01-01T00:00:00Z',
      GIT_COMMITTER_DATE: '2026-01-01T00:00:00Z',
    },
  }).trim();
}
async function repository(): Promise<string> {
  const cwd = await temp();
  git(cwd, 'init', '-b', 'main');
  git(cwd, 'config', 'user.name', 'test author');
  git(cwd, 'config', 'user.email', 'test@example.com');
  await writeFile(
    join(cwd, 'package.json'),
    '{"name":"fixture","repository":"https://github.com/acme/project.git"}',
  );
  git(cwd, 'add', '.');
  git(cwd, 'commit', '-m', 'chore: initial');
  return cwd;
}
async function feature(cwd: string): Promise<void> {
  await writeFile(join(cwd, 'feature.txt'), 'hello\n');
  git(cwd, 'add', '.');
  git(
    cwd,
    'commit',
    '-m',
    'feat: new feature',
    '-m',
    'A multiline body\n\nCo-authored-by: Other <other@example.com>',
  );
}
async function mergedRepository(): Promise<string> {
  const cwd = await repository();
  git(cwd, 'tag', 'v1.0.0');
  await feature(cwd);
  git(cwd, 'checkout', '-b', 'side', 'v1.0.0');
  await writeFile(join(cwd, 'side.txt'), 'side\n');
  git(cwd, 'add', '.');
  git(cwd, 'commit', '-m', 'fix: side');
  git(cwd, 'checkout', 'main');
  git(cwd, 'merge', '--no-ff', 'side', '-m', 'chore: merge side');
  return cwd;
}

describe('repository compatibility', () => {
  for (const fixture of repositories) {
    test(`parses ${fixture.url || 'empty repository'}`, () => {
      // Undefined properties disappear in the serialized upstream fixture.
      expect(JSON.parse(JSON.stringify(getRepoConfig(fixture.url)))).toEqual(fixture.expected);
    });
  }
  test('prefers package repository and preserves invalid values without falling back', async () => {
    const cwd = await repository();
    git(cwd, 'remote', 'add', 'origin', 'https://github.com/remote/project.git');
    expect((await resolveRepoConfig(cwd))?.repo).toBe('acme/project');
    await writeFile(join(cwd, 'package.json'), '{"repository":"invalid"}');
    expect(await resolveRepoConfig(cwd)).toEqual({});
    await writeFile(join(cwd, 'package.json'), '{}');
    expect((await resolveRepoConfig(cwd))?.repo).toBe('remote/project');
    git(cwd, 'remote', 'remove', 'origin');
    expect(await resolveRepoConfig(cwd)).toBeUndefined();
  });
});

describe('Git history compatibility', () => {
  for (const fixture of histories) {
    test(fixture.name, async () => {
      let cwd: string;
      if (fixture.name === 'no-tags') cwd = await repository();
      else if (fixture.name === 'tagged') {
        cwd = await repository();
        git(cwd, 'tag', 'v1.0.0');
        await feature(cwd);
      } else {
        cwd = await mergedRepository();
        if (fixture.name === 'diverged') git(cwd, 'reset', '--hard', 'main^1');
      }
      expect(getGitDiff(fixture.from, fixture.to, cwd)).toEqual(fixture.expected);
    });
  }
  test('selects nearest reachable tag and all tags at HEAD', async () => {
    const cwd = await repository();
    expect(getLastGitTag(cwd)).toBeUndefined();
    expect(getCurrentGitRef(cwd)).toBe('main');
    git(cwd, 'tag', 'v9.0.0');
    await feature(cwd);
    git(cwd, 'tag', 'v1.0.0');
    expect(getLastGitTag(cwd)).toBe('v1.0.0');
    git(cwd, 'tag', 'alias');
    expect(getCurrentGitRef(cwd)).toBe('alias\nv1.0.0');
  });
  test('keeps delimiter characters in commit and author metadata', async () => {
    const cwd = await repository();
    git(cwd, 'config', 'user.name', 'Test | Author');
    git(cwd, 'commit', '--allow-empty', '-m', 'fix: handle | and ---- delimiters');
    const [commit] = getGitDiff(undefined, 'HEAD', cwd);
    expect(commit?.message).toBe('fix: handle | and ---- delimiters');
    expect(commit?.author.name).toBe('Test | Author');
  });
});

describe('configuration compatibility', () => {
  for (const fixture of configurations) {
    test(fixture.name, async () => {
      const cwd = await mergedRepository();
      await Promise.all(
        Object.entries(fixture.files).map(([name, value]) =>
          value === undefined ? Promise.resolve() : writeFile(join(cwd, name), value),
        ),
      );
      const config = await loadChangelogConfig(cwd);
      expect(Object.keys(config.types)).toEqual(Object.keys(fixture.expected.types));
      expect(JSON.parse(JSON.stringify(config).replaceAll(cwd, '/fixture'))).toEqual(
        fixture.expected,
      );
      expect(await readFile(join(cwd, 'package.json'), 'utf8')).toBe(
        fixture.files['package.json'] ??
          '{"name":"fixture","repository":"https://github.com/acme/project.git"}',
      );
    });
  }
});
