import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test, vi } from 'vite-plus/test';
import { runRelease } from '../src/release.ts';

const originalFetch = globalThis.fetch;
const folders: string[] = [];
afterEach(async () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await Promise.all(folders.splice(0).map((cwd) => rm(cwd, { recursive: true, force: true })));
});
function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' }).trim();
}
const olderNotes = '## v0.9.0\n\nKeep these existing notes.\n';
async function repository(provider?: 'github' | 'gitlab'): Promise<string> {
  const cwd = await mkdtemp(join(tmpdir(), 'genbumppush-changelog-release-'));
  folders.push(cwd);
  git(cwd, 'init', '-b', 'main');
  git(cwd, 'config', 'user.name', 'alice smith');
  git(cwd, 'config', 'user.email', 'alice@example.com');
  await writeFile(
    join(cwd, 'package.json'),
    '{"name":"fixture","version":"1.0.0","repository":"https://github.com/acme/project.git"}\n',
  );
  await writeFile(
    join(cwd, 'genbumppush.config.mjs'),
    `export default ${JSON.stringify({ git: { push: provider !== undefined, requireUpstream: false }, ...(provider === 'github' ? { github: { enabled: true, repo: 'acme/project', tokenEnv: 'CHANGELOG_PROVIDER_TEST_TOKEN' } } : provider === 'gitlab' ? { gitlab: { enabled: true, project: 'acme/project', tokenEnv: 'CHANGELOG_PROVIDER_TEST_TOKEN' } } : {}) })};\n`,
  );
  await writeFile(join(cwd, 'CHANGELOG.md'), `# Changes\n\n${olderNotes}`);
  git(cwd, 'add', '.');
  git(cwd, 'commit', '-m', 'chore: initialize');
  git(cwd, 'tag', 'v1.0.0');
  git(cwd, 'commit', '--allow-empty', '-m', 'feat(api): add :sparkles: widget (#42)');
  git(cwd, 'commit', '--allow-empty', '-m', 'fix(api)!: remove old #7');
  git(cwd, 'commit', '--allow-empty', '-m', 'chore(deps): update dependencies');
  globalThis.fetch = () => Promise.resolve(new Response('{"user":{"username":"alice"}}'));
  return cwd;
}
function section(heading: string, target: string): string {
  return `## ${heading}

[compare changes](https://github.com/acme/project/compare/v1.0.0...${target})

### 🚀 Enhancements

- **api:** Add ✨  widget ([#42](https://github.com/acme/project/pull/42))

### 🩹 Fixes

- **api:** ⚠️  Remove old #7 ([#7](https://github.com/acme/project/issues/7))

#### ⚠️ Breaking Changes

- **api:** ⚠️  Remove old #7 ([#7](https://github.com/acme/project/issues/7))

### ❤️ Contributors

- Alice Smith ([@alice](https://github.com/alice))`;
}

test('writes exact compatible Markdown and retains existing sections', async () => {
  const cwd = await repository();
  const result = await runRelease({ cwd, yes: true, dryRun: false, help: false });
  expect(result.releaseType).toBe('major');
  expect(result.newVersion).toBe('2.0.0');
  expect(result.commitCount).toBe(2);
  expect(await readFile(join(cwd, 'CHANGELOG.md'), 'utf8')).toBe(
    `# Changes\n\n${section('v2.0.0', 'v2.0.0')}\n\n${olderNotes}`,
  );
  expect(git(cwd, 'status', '--porcelain')).toBe('');
  expect(git(cwd, 'tag', '--points-at', 'HEAD')).toBe('v2.0.0');
});

test('dry run preserves range headings and does not mutate files or Git', async () => {
  const cwd = await repository();
  const log = vi.spyOn(console, 'info').mockImplementation(() => {});
  const head = git(cwd, 'rev-parse', 'HEAD');
  const result = await runRelease({ cwd, yes: true, dryRun: true, help: false });
  expect(result.newVersion).toBe('2.0.0');
  expect(log).toHaveBeenCalledWith(section('v1.0.0...main', 'main'));
  expect(await readFile(join(cwd, 'CHANGELOG.md'), 'utf8')).toBe(`# Changes\n\n${olderNotes}`);
  expect(git(cwd, 'rev-parse', 'HEAD')).toBe(head);
  expect(git(cwd, 'status', '--porcelain')).toBe('');
});

for (const provider of ['github', 'gitlab'] as const) {
  test(`sends the generated changelog section to ${provider}`, async () => {
    const cwd = await repository(provider);
    const remote = await mkdtemp(join(tmpdir(), 'genbumppush-changelog-remote-'));
    folders.push(remote);
    git(remote, 'init', '--bare');
    git(cwd, 'remote', 'add', 'origin', remote);
    vi.stubEnv('CHANGELOG_PROVIDER_TEST_TOKEN', 'fixture-token');
    let payload: unknown;
    globalThis.fetch = (input, init) => {
      const request = new Request(input, init);
      if (request.url.startsWith('https://ungh.cc/')) {
        return Promise.resolve(new Response('{"user":{"username":"alice"}}'));
      }
      if (request.method === 'GET') return Promise.resolve(new Response('', { status: 404 }));
      return request.json().then((body: unknown) => {
        payload = body;
        return new Response('{"id":1}', { status: 201 });
      });
    };
    const result = await runRelease({ cwd, yes: true, dryRun: false, help: false });
    const notes = section('v2.0.0', 'v2.0.0').replace('## v2.0.0\n\n', '');
    expect(payload).toMatchObject(
      provider === 'github'
        ? { tag_name: 'v2.0.0', body: notes, draft: true }
        : { tag_name: 'v2.0.0', description: notes },
    );
    expect(result.pushed).toBe(true);
    expect(provider === 'github' ? result.githubReleaseCreated : result.gitlabReleaseCreated).toBe(
      true,
    );
  });
}
