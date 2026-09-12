import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vite-plus/test';
import { createGitHubRelease, resolveGitHubRepo, resolveGitHubToken } from '../src/github.ts';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('GitHub provider', () => {
  test('creates a release on github.com with encoded repo path', async () => {
    const requests: Request[] = [];
    globalThis.fetch = (input, init) => {
      const request = new Request(input, init);
      requests.push(request);
      if (request.method === 'GET') {
        return Promise.resolve(new Response('Not Found', { status: 404 }));
      }
      return Promise.resolve(new Response(JSON.stringify({ id: 1 }), { status: 201 }));
    };

    await createGitHubRelease({
      host: 'github.com',
      repo: 'group/project',
      token: 'secret',
      tag: 'release-1.2.4',
      name: 'Release 1.2.4',
      description: 'Notes',
    });

    expect(requests[0]?.url).toBe(
      'https://api.github.com/repos/group/project/releases/tags/release-1.2.4',
    );
    expect(requests[1]?.url).toBe('https://api.github.com/repos/group/project/releases');
    expect(requests[1]?.method).toBe('POST');
    expect(requests[1]?.headers.get('authorization')).toBe('Bearer secret');
    expect(await requests[1]?.json()).toMatchObject({
      tag_name: 'release-1.2.4',
      name: 'Release 1.2.4',
      body: 'Notes',
    });
  });

  test('updates an existing release for the same tag', async () => {
    const requests: Request[] = [];
    globalThis.fetch = (input, init) => {
      const request = new Request(input, init);
      requests.push(request);
      if (request.method === 'GET') {
        return Promise.resolve(new Response(JSON.stringify({ id: 42 }), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify({ id: 42 }), { status: 200 }));
    };

    await createGitHubRelease({
      host: 'https://github.com/',
      repo: 'group/project',
      token: 'secret',
      tag: 'v1.2.4',
      name: 'v1.2.4',
      description: 'Updated',
    });

    expect(requests).toHaveLength(2);
    expect(requests[1]?.url).toBe('https://api.github.com/repos/group/project/releases/42');
    expect(requests[1]?.method).toBe('PATCH');
  });

  test('uses GHES api base for custom hosts', async () => {
    let url = '';
    globalThis.fetch = (input, init) => {
      const request = new Request(input, init);
      url = request.url;
      if (request.method === 'GET') {
        return Promise.resolve(new Response('Not Found', { status: 404 }));
      }
      return Promise.resolve(new Response('', { status: 201 }));
    };

    await createGitHubRelease({
      host: 'github.example.com',
      repo: 'group/project',
      token: 'secret',
      tag: 'v1.2.4',
      name: 'v1.2.4',
      description: 'Notes',
    });

    expect(url.startsWith('https://github.example.com/api/v3/repos/group/project/releases')).toBe(
      true,
    );
  });

  test('reports API failures without exposing the token', async () => {
    globalThis.fetch = () => Promise.resolve(new Response('permission denied', { status: 403 }));
    await expect(
      createGitHubRelease({
        host: 'github.com',
        repo: 'group/project',
        token: 'secret',
        tag: 'v1.2.4',
        name: 'v1.2.4',
        description: 'Notes',
      }),
    ).rejects.toThrow('403: permission denied');
  });

  test('aborts the request when the provider does not answer in time', async () => {
    globalThis.fetch = () =>
      Promise.reject(new DOMException('The operation timed out.', 'TimeoutError'));

    await expect(
      createGitHubRelease({
        host: 'github.com',
        repo: 'group/project',
        token: 'secret',
        tag: 'v1.2.4',
        name: 'v1.2.4',
        description: 'Notes',
      }),
    ).rejects.toThrow('Could not send the GitHub release request');
  });

  test('resolves token from explicit env or GitHub defaults', () => {
    const originalGithub = process.env.GITHUB_TOKEN;
    const originalGh = process.env.GH_TOKEN;
    const originalChangelogen = process.env.CHANGELOGEN_TOKENS_GITHUB;
    const originalCustom = process.env.CUSTOM_GITHUB_TOKEN;
    try {
      delete process.env.GITHUB_TOKEN;
      delete process.env.GH_TOKEN;
      delete process.env.CHANGELOGEN_TOKENS_GITHUB;
      delete process.env.CUSTOM_GITHUB_TOKEN;
      expect(resolveGitHubToken()).toBeUndefined();

      process.env.GH_TOKEN = 'from-gh';
      expect(resolveGitHubToken()).toBe('from-gh');

      process.env.GITHUB_TOKEN = 'from-github';
      expect(resolveGitHubToken()).toBe('from-github');

      process.env.CUSTOM_GITHUB_TOKEN = 'custom';
      expect(resolveGitHubToken('CUSTOM_GITHUB_TOKEN')).toBe('custom');
      expect(resolveGitHubToken('MISSING_ENV')).toBeUndefined();
    } finally {
      if (originalGithub === undefined) delete process.env.GITHUB_TOKEN;
      else process.env.GITHUB_TOKEN = originalGithub;
      if (originalGh === undefined) delete process.env.GH_TOKEN;
      else process.env.GH_TOKEN = originalGh;
      if (originalChangelogen === undefined) delete process.env.CHANGELOGEN_TOKENS_GITHUB;
      else process.env.CHANGELOGEN_TOKENS_GITHUB = originalChangelogen;
      if (originalCustom === undefined) delete process.env.CUSTOM_GITHUB_TOKEN;
      else process.env.CUSTOM_GITHUB_TOKEN = originalCustom;
    }
  });

  test('requires an explicit repo when it cannot be resolved from the remote', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'genbumppush-github-'));
    const original = process.env.GITHUB_REPOSITORY;
    try {
      delete process.env.GITHUB_REPOSITORY;
      await expect(resolveGitHubRepo(empty, { host: 'github.com' })).rejects.toThrow(
        'github.repo or GITHUB_REPOSITORY',
      );
    } finally {
      if (original === undefined) delete process.env.GITHUB_REPOSITORY;
      else process.env.GITHUB_REPOSITORY = original;
    }
  });

  test('prefers explicit repo and host over defaults', async () => {
    const resolved = await resolveGitHubRepo(process.cwd(), {
      host: 'https://github.example.com/',
      repo: 'acme/app',
    });
    expect(resolved).toEqual({ host: 'github.example.com', repo: 'acme/app' });
  });
});
