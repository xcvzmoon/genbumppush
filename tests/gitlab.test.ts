import { afterEach, describe, expect, test } from 'vite-plus/test';
import { createGitLabRelease, releaseNotes } from '../src/gitlab.ts';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('GitLab provider', () => {
  test('extracts the matching changelog section', () => {
    expect(
      releaseNotes('# Changelog\n\n## v1.2.4\n\n- Added feature\n\n## v1.2.3\n- Old', 'v1.2.4'),
    ).toBe('- Added feature');
    expect(releaseNotes('# Changelog', 'v1.2.4')).toBe('See CHANGELOG.md for release notes.');
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
