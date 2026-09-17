import type { DockerCommandResult, DockerRunner } from '../src/docker.ts';
import { describe, expect, test } from 'vite-plus/test';
import {
  planDockerPublication,
  preflightDockerPublication,
  publishDockerImage,
} from '../src/docker.ts';

const imageId = `sha256:${'a'.repeat(64)}`;

function result(status: number, stdout = ''): DockerCommandResult {
  return { status, stdout, stderr: '' };
}

const missingDocker: DockerRunner = () => ({
  status: null,
  stdout: '',
  stderr: 'sensitive registry response',
  error: new Error('spawn docker ENOENT'),
});

describe('Docker publication', () => {
  test('expands deterministic version and Git tag templates', () => {
    expect(
      planDockerPublication(
        {
          enabled: true,
          source: 'acme/app-build:{{version}}',
          image: 'ghcr.io/acme/app',
          tags: ['{{version}}', '{{tag}}', 'latest'],
          allowMutableTags: true,
        },
        '1.2.4',
        'v1.2.4',
      ),
    ).toEqual({
      source: 'acme/app-build:1.2.4',
      image: 'ghcr.io/acme/app',
      references: ['ghcr.io/acme/app:1.2.4', 'ghcr.io/acme/app:v1.2.4', 'ghcr.io/acme/app:latest'],
      push: true,
    });
  });

  test('rejects mutable, duplicate, and malformed destination tags', () => {
    const base = { enabled: true, source: 'acme/build:1', image: 'acme/app' } as const;
    expect(() => planDockerPublication({ ...base, tags: ['latest'] }, '1.0.0', 'v1.0.0')).toThrow(
      'allowMutableTags',
    );
    expect(() =>
      planDockerPublication({ ...base, tags: ['{{version}}', '1.0.0'] }, '1.0.0', 'v1.0.0'),
    ).toThrow('duplicate');
    expect(() => planDockerPublication({ ...base, tags: ['bad/tag'] }, '1.0.0', 'v1.0.0')).toThrow(
      'Invalid Docker tag',
    );
  });

  test('preflights the source digest and publishes each planned tag', () => {
    const calls: string[][] = [];
    const run: DockerRunner = (args) => {
      calls.push([...args]);
      if (args[0] === 'image' && args[1] === 'inspect' && args.length === 3) {
        return result(0, JSON.stringify([{ Id: imageId, RepoDigests: [] }]));
      }
      if (args[0] === 'image' && args[1] === 'inspect') return result(1);
      return result(0);
    };
    const plan = planDockerPublication(
      { enabled: true, source: 'acme/build:1.0.0', image: 'acme/app', tags: ['1.0.0'] },
      '1.0.0',
      'v1.0.0',
    );
    expect(plan).toBeDefined();
    if (plan === undefined) return;

    const source = preflightDockerPublication(plan, run);
    const published = publishDockerImage(plan, source, run);

    expect(published.digest).toBe(imageId);
    expect(calls).toContainEqual(['tag', 'acme/build:1.0.0', 'acme/app:1.0.0']);
    expect(calls).toContainEqual(['push', 'acme/app:1.0.0']);
  });

  test('rejects a local destination tag that points to another image', () => {
    const run: DockerRunner = (args) => {
      if (args.length === 3) {
        return result(0, JSON.stringify([{ Id: imageId, RepoDigests: [] }]));
      }
      return result(0, `sha256:${'b'.repeat(64)}\n`);
    };
    const plan = planDockerPublication(
      { enabled: true, source: 'acme/build:1', image: 'acme/app' },
      '1.0.0',
      'v1.0.0',
    );
    if (plan === undefined) return;
    expect(() => preflightDockerPublication(plan, run)).toThrow('different local image');
  });

  test('reports a missing Docker executable without leaking command output', () => {
    const plan = planDockerPublication(
      { enabled: true, source: 'acme/build:1', image: 'acme/app' },
      '1.0.0',
      'v1.0.0',
    );
    if (plan === undefined) return;
    expect(() => preflightDockerPublication(plan, missingDocker)).toThrow('installed and running');
  });
});
