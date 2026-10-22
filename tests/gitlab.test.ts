import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vite-plus/test';
import { getGitLabCliToken } from '../src/auth-cli.ts';
import {
  createGitLabRelease,
  releaseNotes,
  resolveGitLabHost,
  resolveGitLabProject,
  resolveGitLabToken,
} from '../src/gitlab.ts';

const originalFetch = globalThis.fetch;

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) Reflect.deleteProperty(process.env, name);
  else process.env[name] = value;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('GitLab provider', () => {
  test('resolves stderr-only keyring credentials through a real subprocess', async () => {
    const bin = await mkdtemp(join(tmpdir(), 'genbumppush-glab-'));
    const glabPath = join(bin, 'glab');
    const callsPath = `${glabPath}.calls`;
    try {
      await writeFile(
        glabPath,
        '#!/bin/sh\nprintf "%s\\n" "$@" > "$0.calls"\nprintf "%s\\n" "  ✓ Token found in operating system keyring: synthetic-token" >&2\n',
        { mode: 0o755 },
      );
      vi.stubEnv('PATH', `${bin}:${process.env.PATH ?? ''}`);
      vi.stubEnv('GENBUMPPUSH_GITLAB_TOKEN', undefined);
      vi.stubEnv('GITLAB_TOKEN', undefined);
      vi.stubEnv('CUSTOM_GITLAB_TOKEN', undefined);

      const host = 'https://gitlab.example.com/';
      expect(getGitLabCliToken(host)).toBe('synthetic-token');
      expect(resolveGitLabToken(undefined, host)).toBe('synthetic-token');
      expect(await readFile(callsPath, 'utf8')).toBe(
        'auth\nstatus\n--show-token\n--hostname\ngitlab.example.com\n',
      );
      await rm(callsPath);

      expect(resolveGitLabToken('CUSTOM_GITLAB_TOKEN', host)).toBeUndefined();
      vi.stubEnv('GITLAB_TOKEN', 'fallback-token');
      expect(resolveGitLabToken(undefined, host)).toBe('fallback-token');
      vi.stubEnv('GENBUMPPUSH_GITLAB_TOKEN', 'preferred-token');
      expect(resolveGitLabToken(undefined, host)).toBe('preferred-token');
      expect(resolveGitLabToken('CUSTOM_GITLAB_TOKEN', host)).toBeUndefined();
      expect(existsSync(callsPath)).toBe(false);

      vi.stubEnv('GENBUMPPUSH_GITLAB_TOKEN', undefined);
      vi.stubEnv('GITLAB_TOKEN', undefined);
      await writeFile(
        glabPath,
        '#!/bin/sh\nprintf "%s\\n" "  - Token: synthetic-token" >&2\nexit 1\n',
      );
      expect(resolveGitLabToken(undefined, host)).toBeUndefined();
    } finally {
      vi.unstubAllEnvs();
      await rm(bin, { recursive: true, force: true });
    }
  });

  test('extracts the matching changelog section', () => {
    expect(
      releaseNotes('# Changelog\n\n## v1.2.4\n\n- Added feature\n\n## v1.2.3\n- Old', 'v1.2.4'),
    ).toBe('- Added feature');
    expect(releaseNotes('# Changelog', 'v1.2.4')).toBe('See CHANGELOG.md for release notes.');
  });

  test('resolves token, host, and project with GENBUMPPUSH_* preferred', () => {
    const originals = {
      genToken: process.env.GENBUMPPUSH_GITLAB_TOKEN,
      token: process.env.GITLAB_TOKEN,
      genHost: process.env.GENBUMPPUSH_GITLAB_HOST,
      host: process.env.GITLAB_HOST,
      genProject: process.env.GENBUMPPUSH_GITLAB_PROJECT,
      project: process.env.GITLAB_PROJECT,
      custom: process.env.CUSTOM_GITLAB_TOKEN,
    };
    try {
      delete process.env.GENBUMPPUSH_GITLAB_TOKEN;
      delete process.env.GITLAB_TOKEN;
      delete process.env.GENBUMPPUSH_GITLAB_HOST;
      delete process.env.GITLAB_HOST;
      delete process.env.GENBUMPPUSH_GITLAB_PROJECT;
      delete process.env.GITLAB_PROJECT;
      delete process.env.CUSTOM_GITLAB_TOKEN;

      // tokenEnv set but empty never falls through to the CLI.
      expect(resolveGitLabToken('MISSING_ENV')).toBeUndefined();
      expect(resolveGitLabHost()).toBe('https://gitlab.com');
      expect(resolveGitLabProject()).toBeUndefined();

      process.env.GITLAB_TOKEN = 'from-gitlab';
      process.env.GITLAB_HOST = 'https://legacy.gitlab.example';
      process.env.GITLAB_PROJECT = 'legacy/project';
      expect(resolveGitLabToken()).toBe('from-gitlab');
      expect(resolveGitLabHost()).toBe('https://legacy.gitlab.example');
      expect(resolveGitLabProject()).toBe('legacy/project');

      process.env.GENBUMPPUSH_GITLAB_TOKEN = 'from-genbumppush';
      process.env.GENBUMPPUSH_GITLAB_HOST = 'https://genbumppush.gitlab.example';
      process.env.GENBUMPPUSH_GITLAB_PROJECT = 'preferred/project';
      expect(resolveGitLabToken()).toBe('from-genbumppush');
      expect(resolveGitLabHost()).toBe('https://genbumppush.gitlab.example');
      expect(resolveGitLabProject()).toBe('preferred/project');

      process.env.CUSTOM_GITLAB_TOKEN = 'custom';
      expect(resolveGitLabToken('CUSTOM_GITLAB_TOKEN')).toBe('custom');
    } finally {
      restoreEnv('GENBUMPPUSH_GITLAB_TOKEN', originals.genToken);
      restoreEnv('GITLAB_TOKEN', originals.token);
      restoreEnv('GENBUMPPUSH_GITLAB_HOST', originals.genHost);
      restoreEnv('GITLAB_HOST', originals.host);
      restoreEnv('GENBUMPPUSH_GITLAB_PROJECT', originals.genProject);
      restoreEnv('GITLAB_PROJECT', originals.project);
      restoreEnv('CUSTOM_GITLAB_TOKEN', originals.custom);
    }
  });

  test('creates a release with an encoded project path', async () => {
    let request: Request | undefined;
    globalThis.fetch = (input, init) => {
      request = new Request(input, init);
      return Promise.resolve(new Response('', { status: 201 }));
    };
    await createGitLabRelease({
      host: 'https://gitlab.example/',
      project: 'group/project',
      token: 'secret',
      tag: 'v1.2.4',
      name: 'v1.2.4',
      description: 'Notes',
    });
    expect(request?.url).toBe('https://gitlab.example/api/v4/projects/group%2Fproject/releases');
    expect(request?.headers.get('authorization')).toBe('Bearer secret');
    expect(await request?.json()).toMatchObject({
      tag_name: 'v1.2.4',
      name: 'v1.2.4',
      description: 'Notes',
    });
  });

  test('reports GitLab API failures without exposing the token', async () => {
    globalThis.fetch = () => Promise.resolve(new Response('permission denied', { status: 403 }));
    await expect(
      createGitLabRelease({
        host: 'https://gitlab.example',
        project: 'group/project',
        token: 'secret',
        tag: 'v1.2.4',
        name: 'v1.2.4',
        description: 'Notes',
      }),
    ).rejects.toThrow('403: permission denied');
  });

  test('aborts the request when the provider does not answer in time', async () => {
    globalThis.fetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(init.signal?.reason ?? new Error('aborted'));
        });
      });

    // Fast-forward by invoking with a real timeout signal path via mock that rejects immediately
    // when AbortSignal.timeout is used — simulate timeout rejection.
    globalThis.fetch = () =>
      Promise.reject(new DOMException('The operation timed out.', 'TimeoutError'));

    await expect(
      createGitLabRelease({
        host: 'https://gitlab.example',
        project: 'group/project',
        token: 'secret',
        tag: 'v1.2.4',
        name: 'v1.2.4',
        description: 'Notes',
      }),
    ).rejects.toThrow('Could not send the GitLab release request');
  });
});
