import type { DockerCommandResult, DockerRunner } from '../src/docker.ts';
import { describe, expect, test } from 'vite-plus/test';
import {
  planDockerPublication,
  planDockerPublications,
  preflightDockerPublication,
  preflightDockerPublications,
  publishDockerImage,
  publishDockerImages,
  resolveDockerImageEntries,
} from '../src/docker.ts';

const imageId = `sha256:${'a'.repeat(64)}`;
const apiId = `sha256:${'b'.repeat(64)}`;
const webId = `sha256:${'c'.repeat(64)}`;

function result(status: number, stdout = '', stderr = ''): DockerCommandResult {
  return { status, stdout, stderr };
}

function imageInspect(id: string): DockerCommandResult {
  return result(0, JSON.stringify([{ Id: id, RepoDigests: [] }]));
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
      index: 0,
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
        return imageInspect(imageId);
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
        return imageInspect(imageId);
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

describe('Docker multi-image publication', () => {
  const multiConfig = {
    enabled: true,
    tags: ['{{version}}', '{{tag}}'],
    images: [
      {
        source: 'acme/api-build:{{version}}',
        image: 'ghcr.io/acme/api',
      },
      {
        source: 'acme/web-build:{{version}}',
        image: 'ghcr.io/acme/web',
        tags: ['{{version}}'],
        push: false,
      },
    ],
  } as const;

  test('resolves singular and multi-image config shapes', () => {
    expect(resolveDockerImageEntries(undefined)).toEqual([]);
    expect(
      resolveDockerImageEntries({
        enabled: true,
        source: 'acme/build:1',
        image: 'acme/app',
      }),
    ).toEqual([
      {
        source: 'acme/build:1',
        image: 'acme/app',
        tags: undefined,
        push: undefined,
        allowMutableTags: undefined,
      },
    ]);
    expect(resolveDockerImageEntries(multiConfig)).toHaveLength(2);
  });

  test('rejects mixing singular fields with docker.images', () => {
    expect(() =>
      resolveDockerImageEntries({
        enabled: true,
        source: 'acme/build:1',
        image: 'acme/app',
        images: [{ source: 'acme/api:1', image: 'ghcr.io/acme/api' }],
      }),
    ).toThrow('not both');
  });

  test('rejects enabled Docker with no image configuration', () => {
    expect(() => resolveDockerImageEntries({ enabled: true })).toThrow('no images are configured');
  });

  test('plans every image and applies root defaults per entry', () => {
    const plans = planDockerPublications(multiConfig, '1.2.4', 'v1.2.4');
    expect(plans).toEqual([
      {
        index: 0,
        source: 'acme/api-build:1.2.4',
        image: 'ghcr.io/acme/api',
        references: ['ghcr.io/acme/api:1.2.4', 'ghcr.io/acme/api:v1.2.4'],
        push: true,
      },
      {
        index: 1,
        source: 'acme/web-build:1.2.4',
        image: 'ghcr.io/acme/web',
        references: ['ghcr.io/acme/web:1.2.4'],
        push: false,
      },
    ]);
  });

  test('rejects overlapping destination references across images', () => {
    expect(() =>
      planDockerPublications(
        {
          enabled: true,
          images: [
            { source: 'a:1', image: 'ghcr.io/acme/app', tags: ['1.0.0'] },
            { source: 'b:1', image: 'ghcr.io/acme/app', tags: ['1.0.0'] },
          ],
        },
        '1.0.0',
        'v1.0.0',
      ),
    ).toThrow('planned by multiple images');
  });

  test('publishes every planned image', () => {
    const calls: string[][] = [];
    const run: DockerRunner = (args) => {
      calls.push([...args]);
      if (args[0] === 'image' && args[1] === 'inspect' && args.length === 3) {
        const source = args[2] ?? '';
        if (source.includes('api-build')) return imageInspect(apiId);
        return imageInspect(webId);
      }
      if (args[0] === 'image' && args[1] === 'inspect') return result(1);
      return result(0);
    };

    const plans = planDockerPublications(multiConfig, '1.2.4', 'v1.2.4');
    const sources = preflightDockerPublications(plans, run);
    const published = publishDockerImages(plans, sources, run);

    expect(published).toHaveLength(2);
    expect(published[0]?.digest).toBe(apiId);
    expect(published[1]?.digest).toBe(webId);
    expect(calls).toContainEqual(['tag', 'acme/api-build:1.2.4', 'ghcr.io/acme/api:1.2.4']);
    expect(calls).toContainEqual(['push', 'ghcr.io/acme/api:1.2.4']);
    expect(calls).toContainEqual(['tag', 'acme/web-build:1.2.4', 'ghcr.io/acme/web:1.2.4']);
    expect(calls).not.toContainEqual(['push', 'ghcr.io/acme/web:1.2.4']);
  });

  test('names the failing image when publication fails mid-list', () => {
    const pushingConfig = {
      enabled: true,
      tags: ['{{version}}'],
      images: [
        { source: 'acme/api-build:{{version}}', image: 'ghcr.io/acme/api' },
        { source: 'acme/web-build:{{version}}', image: 'ghcr.io/acme/web' },
      ],
    } as const;
    const run: DockerRunner = (args) => {
      if (args[0] === 'image' && args[1] === 'inspect' && args.length === 3) {
        const source = args[2] ?? '';
        if (source.includes('api-build')) return imageInspect(apiId);
        return imageInspect(webId);
      }
      if (args[0] === 'image' && args[1] === 'inspect') return result(1);
      if (args[0] === 'push' && (args[1] ?? '').includes('/web')) {
        return result(1, '', 'denied');
      }
      return result(0);
    };

    const plans = planDockerPublications(pushingConfig, '1.2.4', 'v1.2.4');
    const sources = preflightDockerPublications(plans, run);
    expect(() => publishDockerImages(plans, sources, run)).toThrow(
      /Docker image ghcr.io\/acme\/web/,
    );
  });

  test('preflight failures name the configured image', () => {
    const run: DockerRunner = (args) => {
      if (args[0] === 'image' && args[1] === 'inspect' && args.length === 3) {
        return (args[2] ?? '').includes('api-build') ? imageInspect(apiId) : result(1);
      }
      return result(0);
    };
    const plans = planDockerPublications(multiConfig, '1.2.4', 'v1.2.4');
    expect(() => preflightDockerPublications(plans, run)).toThrow(
      /Docker image ghcr.io\/acme\/web/,
    );
  });
});
