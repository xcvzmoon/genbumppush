import { execFileSync } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vite-plus/test';
import { runRelease } from '../src/release.ts';

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}
async function repository(): Promise<string> {
  const cwd = await mkdtemp(join(tmpdir(), 'genbumppush-repo-'));
  git(cwd, 'init', '-b', 'main');
  git(cwd, 'config', 'user.name', 'Test User');
  git(cwd, 'config', 'user.email', 'test@example.com');
  await writeFile(join(cwd, 'package.json'), '{"name":"fixture","version":"1.2.3"}\n');
  await writeFile(
    join(cwd, 'genbumppush.config.mjs'),
    'export default { changelog: false, git: { push: false } };\n',
  );
  git(cwd, 'remote', 'add', 'origin', 'https://github.com/example/fixture.git');
  git(cwd, 'add', '.');
  git(cwd, 'commit', '-m', 'chore: initialize fixture');
  git(cwd, 'tag', '-a', 'v1.2.3', '-m', 'v1.2.3');
  await writeFile(join(cwd, 'feature.txt'), 'feature\n');
  git(cwd, 'add', '.');
  git(cwd, 'commit', '-m', 'feat: initial feature');
  return cwd;
}
describe('runRelease', () => {
  test('rejects a directory that is not a Git repository', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'genbumppush-not-git-'));
    await expect(
      runRelease({ cwd, release: 'patch', dryRun: true, yes: true, help: false }),
    ).rejects.toThrow('not a Git repository');
  });

  test('detects a minor release from a feat commit', async () => {
    const cwd = await repository();
    const result = await runRelease({ cwd, dryRun: true, yes: true, help: false });
    expect(result.releaseType).toBe('minor');
    expect(result.commitCount).toBe(1);
  });

  test('dry run leaves files and Git unchanged', async () => {
    const cwd = await repository();
    const before = git(cwd, 'rev-parse', 'HEAD');
    const result = await runRelease({
      cwd,
      release: 'patch',
      dryRun: true,
      yes: true,
      help: false,
    });
    expect(result.releaseType).toBe('patch');
    expect(result.newVersion).toBe('1.2.4');
    expect(result.tag).toBe('v1.2.4');
    expect(JSON.parse(await readFile(join(cwd, 'package.json'), 'utf8')).version).toBe('1.2.3');
    expect(git(cwd, 'rev-parse', 'HEAD')).toBe(before);
    expect(git(cwd, 'status', '--porcelain')).toBe('');
  });
  test('creates a release commit and annotated local tag', async () => {
    const cwd = await repository();
    const result = await runRelease({
      cwd,
      release: 'patch',
      dryRun: false,
      yes: true,
      help: false,
    });
    expect(result).toMatchObject({ newVersion: '1.2.4', tag: 'v1.2.4', pushed: false });
    expect(JSON.parse(await readFile(join(cwd, 'package.json'), 'utf8')).version).toBe('1.2.4');
    expect(git(cwd, 'cat-file', '-t', 'v1.2.4')).toBe('tag');
    expect(git(cwd, 'log', '-1', '--pretty=%s')).toBe('chore(release): v1.2.4');
    expect(git(cwd, 'status', '--porcelain')).toBe('');
  });

  test('rejects a dirty worktree before making changes', async () => {
    const cwd = await repository();
    await writeFile(join(cwd, 'uncommitted.txt'), 'dirty\n');
    await expect(
      runRelease({ cwd, release: 'patch', dryRun: false, yes: true, help: false }),
    ).rejects.toThrow('Commit or stash');
    expect(JSON.parse(await readFile(join(cwd, 'package.json'), 'utf8')).version).toBe('1.2.3');
  });

  test('rejects detached HEAD and a missing upstream when pushing', async () => {
    const detached = await repository();
    git(detached, 'checkout', '--detach');
    await expect(
      runRelease({ cwd: detached, release: 'patch', dryRun: true, yes: true, help: false }),
    ).rejects.toThrow('checked-out branch');

    const noUpstream = await repository();
    await writeFile(
      join(noUpstream, 'genbumppush.config.mjs'),
      'export default { changelog: false, git: { push: true } };\n',
    );
    git(noUpstream, 'add', '.');
    git(noUpstream, 'commit', '-m', 'chore: enable push');
    await expect(
      runRelease({ cwd: noUpstream, release: 'patch', dryRun: true, yes: true, help: false }),
    ).rejects.toThrow('git rev-parse');
  });

  test('updates configured Tauri-style version files', async () => {
    const cwd = await repository();
    await mkdir(join(cwd, 'src-tauri'));
    await writeFile(join(cwd, 'src-tauri', 'tauri.conf.json'), '{"version":"1.2.3"}\n');
    await writeFile(
      join(cwd, 'src-tauri', 'Cargo.toml'),
      '[package]\nname = "fixture-app"\nversion = "1.2.3"\n\n[dependencies]\n',
    );
    await writeFile(
      join(cwd, 'src-tauri', 'Cargo.lock'),
      '[[package]]\nname = "fixture-app"\nversion = "1.2.3"\n\n[[package]]\nname = "dependency"\nversion = "1.2.3"\n',
    );
    await writeFile(
      join(cwd, 'genbumppush.config.mjs'),
      "export default { changelog: false, files: ['package.json', 'src-tauri/tauri.conf.json', 'src-tauri/Cargo.toml', 'src-tauri/Cargo.lock'], git: { push: false } };\n",
    );
    git(cwd, 'add', '.');
    git(cwd, 'commit', '-m', 'chore: add Tauri configuration');
    await runRelease({ cwd, release: 'patch', dryRun: false, yes: true, help: false });
    expect(
      JSON.parse(await readFile(join(cwd, 'src-tauri', 'tauri.conf.json'), 'utf8')).version,
    ).toBe('1.2.4');
    expect(await readFile(join(cwd, 'src-tauri', 'Cargo.toml'), 'utf8')).toContain(
      'version = "1.2.4"',
    );
    const cargoLock = await readFile(join(cwd, 'src-tauri', 'Cargo.lock'), 'utf8');
    expect(cargoLock).toContain('name = "fixture-app"\nversion = "1.2.4"');
    expect(cargoLock).toContain('name = "dependency"\nversion = "1.2.3"');
  });

  test('returns without mutation when there are no releasable commits', async () => {
    const cwd = await repository();
    git(cwd, 'tag', '-a', 'latest-test', '-m', 'latest-test');
    await writeFile(
      join(cwd, 'genbumppush.config.mjs'),
      'export default { changelog: false, git: { push: false }, release: undefined };\n',
    );
    git(cwd, 'add', '.');
    git(cwd, 'commit', '-m', 'docs: configuration note');
    git(cwd, 'tag', '-a', 'v1.2.4', '-m', 'v1.2.4');
    const head = git(cwd, 'rev-parse', 'HEAD');
    const result = await runRelease({ cwd, dryRun: false, yes: true, help: false });
    expect(result.newVersion).toBeUndefined();
    expect(result.commitCount).toBe(0);
    expect(git(cwd, 'rev-parse', 'HEAD')).toBe(head);
  });

  test('rejects an existing tag before running hooks or changing files', async () => {
    const cwd = await repository();
    git(cwd, 'tag', '-a', 'v1.2.4', '-m', 'collision');
    await writeFile(
      join(cwd, 'genbumppush.config.mjs'),
      "export default { changelog: false, hooks: { before: 'touch hook-ran' }, git: { push: false } };\n",
    );
    git(cwd, 'add', '.');
    git(cwd, 'commit', '-m', 'chore: configure hook');
    await expect(
      runRelease({ cwd, release: 'patch', dryRun: false, yes: true, help: false }),
    ).rejects.toThrow('already exists');
    await expect(access(join(cwd, 'hook-ran'))).rejects.toThrow();
    expect(JSON.parse(await readFile(join(cwd, 'package.json'), 'utf8')).version).toBe('1.2.3');
  });

  test('restores every file when the release commit fails', async () => {
    const cwd = await repository();
    git(cwd, 'config', 'gpg.program', 'false');
    await writeFile(
      join(cwd, 'genbumppush.config.mjs'),
      'export default { changelog: true, git: { push: false, sign: true } };\n',
    );
    git(cwd, 'add', '.');
    git(cwd, 'commit', '-m', 'chore: require signing');
    const packageBefore = await readFile(join(cwd, 'package.json'), 'utf8');
    await expect(
      runRelease({ cwd, release: 'patch', dryRun: false, yes: true, help: false }),
    ).rejects.toThrow('git commit');
    expect(await readFile(join(cwd, 'package.json'), 'utf8')).toBe(packageBefore);
    await expect(access(join(cwd, 'CHANGELOG.md'))).rejects.toThrow();
    expect(git(cwd, 'status', '--porcelain')).toBe('');
  });

  test('restores the exact index when a release commit fails', async () => {
    const cwd = await repository();
    git(cwd, 'config', 'gpg.program', 'false');
    await writeFile(
      join(cwd, 'genbumppush.config.mjs'),
      'export default { changelog: false, git: { push: false, sign: true, requireClean: false } };\n',
    );
    git(cwd, 'add', '.');
    git(cwd, 'commit', '-m', 'chore: allow dirty releases');
    await writeFile(join(cwd, 'staged.txt'), 'keep staged\n');
    git(cwd, 'add', 'staged.txt');
    const indexBefore = git(cwd, 'write-tree');

    await expect(
      runRelease({ cwd, release: 'patch', dryRun: false, yes: true, help: false }),
    ).rejects.toThrow('git commit');

    expect(git(cwd, 'write-tree')).toBe(indexBefore);
    expect(git(cwd, 'diff', '--cached', '--name-only')).toBe('staged.txt');
    expect(JSON.parse(await readFile(join(cwd, 'package.json'), 'utf8')).version).toBe('1.2.3');
  });

  test('rejects invalid GitLab configuration before creating a commit or tag', async () => {
    const cwd = await repository();
    await writeFile(
      join(cwd, 'genbumppush.config.mjs'),
      'export default { changelog: false, git: { push: false }, gitlab: { enabled: true } };\n',
    );
    git(cwd, 'add', '.');
    git(cwd, 'commit', '-m', 'chore: enable GitLab releases');
    const head = git(cwd, 'rev-parse', 'HEAD');

    await expect(
      runRelease({ cwd, release: 'patch', dryRun: false, yes: true, help: false }),
    ).rejects.toThrow('git.push');

    expect(git(cwd, 'rev-parse', 'HEAD')).toBe(head);
    expect(git(cwd, 'tag', '--list', 'v1.2.4')).toBe('');
  });

  test('rejects a changelog symlink outside the repository before mutation', async () => {
    const cwd = await repository();
    const outside = await mkdtemp(join(tmpdir(), 'genbumppush-changelog-'));
    const target = join(outside, 'CHANGELOG.md');
    await writeFile(target, '# External notes\n');
    await symlink(target, join(cwd, 'CHANGELOG.md'));
    await writeFile(
      join(cwd, 'genbumppush.config.mjs'),
      'export default { changelog: true, git: { push: false } };\n',
    );
    git(cwd, 'add', '.');
    git(cwd, 'commit', '-m', 'chore: configure changelog');
    const head = git(cwd, 'rev-parse', 'HEAD');

    await expect(
      runRelease({ cwd, release: 'patch', dryRun: false, yes: true, help: false }),
    ).rejects.toThrow('resolves outside');

    expect(git(cwd, 'rev-parse', 'HEAD')).toBe(head);
    expect(await readFile(target, 'utf8')).toBe('# External notes\n');
  });

  test('retries GitLab release creation for an existing remote tag', async () => {
    const cwd = await repository();
    const remote = await mkdtemp(join(tmpdir(), 'genbumppush-remote-'));
    git(remote, 'init', '--bare');
    git(cwd, 'remote', 'set-url', 'origin', remote);
    git(cwd, 'push', '-u', 'origin', 'main', '--tags');
    await writeFile(
      join(cwd, 'genbumppush.config.mjs'),
      "export default { changelog: false, gitlab: { enabled: true, project: 'group/project' } };\n",
    );
    const originalToken = process.env.GITLAB_TOKEN;
    const originalFetch = globalThis.fetch;
    process.env.GITLAB_TOKEN = 'secret';
    globalThis.fetch = () => Promise.resolve(new Response('', { status: 201 }));
    try {
      const result = await runRelease({
        cwd,
        gitlabRetryTag: 'v1.2.3',
        dryRun: false,
        yes: true,
        help: false,
      });
      expect(result).toMatchObject({
        tag: 'v1.2.3',
        pushed: true,
        gitlabReleaseCreated: true,
      });
    } finally {
      globalThis.fetch = originalFetch;
      if (originalToken === undefined) delete process.env.GITLAB_TOKEN;
      else process.env.GITLAB_TOKEN = originalToken;
    }
  });

  test('reports a retry command when GitLab fails after the Git push', async () => {
    const cwd = await repository();
    const remote = await mkdtemp(join(tmpdir(), 'genbumppush-remote-'));
    git(remote, 'init', '--bare');
    git(cwd, 'remote', 'set-url', 'origin', remote);
    git(cwd, 'push', '-u', 'origin', 'main');
    await writeFile(
      join(cwd, 'genbumppush.config.mjs'),
      "export default { changelog: false, git: { push: true }, gitlab: { enabled: true, project: 'group/project', tokenEnv: 'TEST_GITLAB_TOKEN' } };\n",
    );
    git(cwd, 'add', '.');
    git(cwd, 'commit', '-m', 'chore: enable GitLab releases');
    const originalFetch = globalThis.fetch;
    process.env.TEST_GITLAB_TOKEN = 'secret';
    globalThis.fetch = () => Promise.resolve(new Response('unavailable', { status: 503 }));
    try {
      await expect(
        runRelease({ cwd, release: 'patch', dryRun: false, yes: true, help: false }),
      ).rejects.toThrow('genbumppush --retry-gitlab v1.2.4');
      expect(git(remote, 'cat-file', '-t', 'refs/tags/v1.2.4')).toBe('tag');
    } finally {
      globalThis.fetch = originalFetch;
      delete process.env.TEST_GITLAB_TOKEN;
    }
  });

  test('uses templates, changelog, and before/after hooks', async () => {
    const cwd = await repository();
    await writeFile(join(cwd, 'CHANGELOG.md'), '# Changes\n\nOlder notes.\n');
    await writeFile(
      join(cwd, 'genbumppush.config.mjs'),
      "export default { changelog: 'CHANGELOG.md', hooks: { before: 'touch before-ran', after: 'touch after-ran' }, git: { push: false, commitMessage: 'release {{version}}', tagName: 'release-{{version}}', tagMessage: 'Release {{version}}' } };\n",
    );
    git(cwd, 'add', '.');
    git(cwd, 'commit', '-m', 'chore: configure release');
    const result = await runRelease({
      cwd,
      release: 'patch',
      dryRun: false,
      yes: true,
      help: false,
    });
    expect(result.tag).toBe('release-1.2.4');
    expect(git(cwd, 'log', '-1', '--pretty=%s')).toBe('release 1.2.4');
    expect(await readFile(join(cwd, 'CHANGELOG.md'), 'utf8')).toContain('Older notes.');
    await expect(access(join(cwd, 'before-ran'))).resolves.toBeUndefined();
    await expect(access(join(cwd, 'after-ran'))).resolves.toBeUndefined();
  });

  test('pushes the branch and tag atomically to a configured Git remote', async () => {
    const cwd = await repository();
    const remote = await mkdtemp(join(tmpdir(), 'genbumppush-remote-'));
    git(remote, 'init', '--bare');
    git(cwd, 'remote', 'set-url', 'origin', remote);
    git(cwd, 'push', '-u', 'origin', 'main');
    await writeFile(
      join(cwd, 'genbumppush.config.mjs'),
      'export default { changelog: false, git: { push: true } };\n',
    );
    git(cwd, 'add', '.');
    git(cwd, 'commit', '-m', 'chore: enable publishing');
    const result = await runRelease({
      cwd,
      release: 'patch',
      dryRun: false,
      yes: true,
      help: false,
    });
    expect(result.pushed).toBe(true);
    expect(git(remote, 'show', 'refs/heads/main:package.json')).toContain('"version":"1.2.4"');
    expect(git(remote, 'cat-file', '-t', 'refs/tags/v1.2.4')).toBe('tag');
  });

  test('rejects GitHub releases without push before creating a commit or tag', async () => {
    const cwd = await repository();
    await writeFile(
      join(cwd, 'genbumppush.config.mjs'),
      'export default { changelog: false, git: { push: false }, github: { enabled: true, repo: "group/project" } };\n',
    );
    git(cwd, 'add', '.');
    git(cwd, 'commit', '-m', 'chore: enable GitHub releases');
    const head = git(cwd, 'rev-parse', 'HEAD');

    await expect(
      runRelease({ cwd, release: 'patch', dryRun: false, yes: true, help: false }),
    ).rejects.toThrow('git.push');

    expect(git(cwd, 'rev-parse', 'HEAD')).toBe(head);
    expect(git(cwd, 'tag', '--list', 'v1.2.4')).toBe('');
  });

  test('creates a GitHub release after a successful push', async () => {
    const cwd = await repository();
    const remote = await mkdtemp(join(tmpdir(), 'genbumppush-remote-'));
    git(remote, 'init', '--bare');
    git(cwd, 'remote', 'set-url', 'origin', remote);
    git(cwd, 'push', '-u', 'origin', 'main');
    await writeFile(
      join(cwd, 'genbumppush.config.mjs'),
      "export default { changelog: false, git: { push: true }, github: { enabled: true, repo: 'group/project' } };\n",
    );
    git(cwd, 'add', '.');
    git(cwd, 'commit', '-m', 'chore: enable GitHub releases');

    const originalFetch = globalThis.fetch;
    process.env.GITHUB_TOKEN = 'secret';
    const calls: { method: string; url: string }[] = [];
    globalThis.fetch = (input, init) => {
      const request = new Request(input, init);
      calls.push({ method: request.method, url: request.url });
      if (request.method === 'GET') {
        return Promise.resolve(new Response('Not Found', { status: 404 }));
      }
      return Promise.resolve(new Response(JSON.stringify({ id: 7 }), { status: 201 }));
    };

    try {
      const result = await runRelease({
        cwd,
        release: 'patch',
        dryRun: false,
        yes: true,
        help: false,
      });
      expect(result).toMatchObject({
        newVersion: '1.2.4',
        tag: 'v1.2.4',
        pushed: true,
        githubReleaseCreated: true,
      });
      expect(calls.some((call) => call.method === 'POST' && call.url.endsWith('/releases'))).toBe(
        true,
      );
    } finally {
      globalThis.fetch = originalFetch;
      delete process.env.GITHUB_TOKEN;
    }
  });

  test('reports a retry command when GitHub fails after the Git push', async () => {
    const cwd = await repository();
    const remote = await mkdtemp(join(tmpdir(), 'genbumppush-remote-'));
    git(remote, 'init', '--bare');
    git(cwd, 'remote', 'set-url', 'origin', remote);
    git(cwd, 'push', '-u', 'origin', 'main');
    await writeFile(
      join(cwd, 'genbumppush.config.mjs'),
      "export default { changelog: false, git: { push: true }, github: { enabled: true, repo: 'group/project', tokenEnv: 'TEST_GITHUB_TOKEN' } };\n",
    );
    git(cwd, 'add', '.');
    git(cwd, 'commit', '-m', 'chore: enable GitHub releases');

    const originalFetch = globalThis.fetch;
    process.env.TEST_GITHUB_TOKEN = 'secret';
    globalThis.fetch = () => Promise.resolve(new Response('unavailable', { status: 503 }));

    try {
      await expect(
        runRelease({ cwd, release: 'patch', dryRun: false, yes: true, help: false }),
      ).rejects.toThrow('genbumppush --retry-github v1.2.4');
      expect(git(remote, 'cat-file', '-t', 'refs/tags/v1.2.4')).toBe('tag');
    } finally {
      globalThis.fetch = originalFetch;
      delete process.env.TEST_GITHUB_TOKEN;
    }
  });

  test('rejects a missing GitHub token before creating a commit or tag', async () => {
    const cwd = await repository();
    await writeFile(
      join(cwd, 'genbumppush.config.mjs'),
      "export default { changelog: false, git: { push: true, requireUpstream: false }, github: { enabled: true, repo: 'group/project', tokenEnv: 'MISSING_GITHUB_TOKEN' } };\n",
    );
    git(cwd, 'add', '.');
    git(cwd, 'commit', '-m', 'chore: enable GitHub releases');
    const head = git(cwd, 'rev-parse', 'HEAD');
    delete process.env.MISSING_GITHUB_TOKEN;

    await expect(
      runRelease({ cwd, release: 'patch', dryRun: false, yes: true, help: false }),
    ).rejects.toThrow('Set MISSING_GITHUB_TOKEN');
    expect(git(cwd, 'rev-parse', 'HEAD')).toBe(head);
    expect(git(cwd, 'tag', '--list', 'v1.2.4')).toBe('');
  });
});
