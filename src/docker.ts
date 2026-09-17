import type { DockerOptions } from './types.ts';
import { spawnSync } from 'node:child_process';
import { ReleaseError } from './error.ts';

export type DockerCommandResult = {
  status: number | null;
  stdout: string;
  stderr: string;
  error?: Error;
};

export type DockerRunner = (
  args: readonly string[],
  options?: { inherit?: boolean },
) => DockerCommandResult;

export type DockerPublicationPlan = {
  source: string;
  image: string;
  references: string[];
  push: boolean;
};

export type DockerPublicationResult = DockerPublicationPlan & { digest: string };

const DOCKER_TIMEOUT_MS = 120_000;
const TAG_PATTERN = /^[\w][\w.-]{0,127}$/;

export const runDocker: DockerRunner = (args, options) => {
  const result = spawnSync('docker', [...args], {
    encoding: 'utf8',
    stdio:
      options?.inherit === true ? ['ignore', 'inherit', 'inherit'] : ['ignore', 'pipe', 'pipe'],
    timeout: DOCKER_TIMEOUT_MS,
  });
  return {
    status: result.status,
    stdout: typeof result.stdout === 'string' ? result.stdout : '',
    stderr: typeof result.stderr === 'string' ? result.stderr : '',
    ...(result.error === undefined ? {} : { error: result.error }),
  };
};

function render(value: string, version: string, tag: string): string {
  return value.replaceAll('{{version}}', version).replaceAll('{{tag}}', tag);
}

function validateRepository(image: string): void {
  if (image.length === 0 || /\s/.test(image) || image.includes('@')) {
    throw new ReleaseError('DOCKER_CONFIG_INVALID', `Invalid Docker image repository: ${image}`);
  }
  const lastSlash = image.lastIndexOf('/');
  if (image.slice(lastSlash + 1).includes(':')) {
    throw new ReleaseError(
      'DOCKER_CONFIG_INVALID',
      `docker.image must be a repository without a tag: ${image}`,
    );
  }
  const repositoryPattern =
    /^[a-z0-9]+(?:(?:[._-]|\/)[a-z0-9]+)*(?::[0-9]+(?:\/[a-z0-9]+(?:(?:[._-]|\/)[a-z0-9]+)*)?)?$/;
  if (!repositoryPattern.test(image)) {
    throw new ReleaseError('DOCKER_CONFIG_INVALID', `Invalid Docker image repository: ${image}`);
  }
}

function validateSource(source: string): void {
  if (source.length === 0 || /\s/.test(source) || source.startsWith('-')) {
    throw new ReleaseError('DOCKER_CONFIG_INVALID', `Invalid Docker source image: ${source}`);
  }
}

export function planDockerPublication(
  config: DockerOptions | undefined,
  version: string,
  gitTag: string,
): DockerPublicationPlan | undefined {
  if (config?.enabled !== true) return undefined;
  if (config.source === undefined || config.image === undefined) {
    throw new ReleaseError(
      'DOCKER_CONFIG_INVALID',
      'docker.source and docker.image are required when Docker tagging is enabled.',
    );
  }

  const source = render(config.source, version, gitTag);
  const image = render(config.image, version, gitTag);
  validateSource(source);
  validateRepository(image);

  const configuredTags = config.tags ?? ['{{version}}'];
  if (configuredTags.length === 0) {
    throw new ReleaseError('DOCKER_CONFIG_INVALID', 'docker.tags must contain at least one tag.');
  }

  const tags = configuredTags.map((value) => render(value, version, gitTag));
  for (const tag of tags) {
    if (!TAG_PATTERN.test(tag)) {
      throw new ReleaseError('DOCKER_TAG_INVALID', `Invalid Docker tag: ${tag}`);
    }
    if (tag === 'latest' && config.allowMutableTags !== true) {
      throw new ReleaseError(
        'DOCKER_TAG_INVALID',
        'The mutable Docker tag "latest" requires docker.allowMutableTags: true.',
      );
    }
  }
  if (new Set(tags).size !== tags.length) {
    throw new ReleaseError(
      'DOCKER_CONFIG_INVALID',
      'docker.tags contains duplicate values after template expansion.',
    );
  }

  return {
    source,
    image,
    references: tags.map((tag) => `${image}:${tag}`),
    push: config.push !== false,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function inspectSource(source: string, run: DockerRunner): { digest: string; id: string } {
  const result = run(['image', 'inspect', source]);
  if (result.error !== undefined) {
    throw new ReleaseError(
      'DOCKER_NOT_AVAILABLE',
      'Docker CLI could not be executed. Verify that Docker is installed and running.',
      { cause: result.error },
    );
  }
  if (result.status !== 0) {
    throw new ReleaseError(
      'DOCKER_SOURCE_NOT_FOUND',
      `Docker source image does not exist: ${source}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(result.stdout);
  } catch (error) {
    throw new ReleaseError(
      'DOCKER_SOURCE_DIGEST_UNAVAILABLE',
      'Docker returned invalid image metadata.',
      { cause: error },
    );
  }
  const values: unknown[] = Array.isArray(parsed) ? parsed : [];
  const first = values[0];
  const value = isRecord(first) ? first : undefined;
  const id = typeof value?.Id === 'string' ? value.Id : undefined;
  const repoDigests = Array.isArray(value?.RepoDigests)
    ? value.RepoDigests.filter((item): item is string => typeof item === 'string')
    : [];
  const digest = repoDigests[0]?.split('@')[1] ?? id;
  if (id === undefined || digest === undefined || !/^sha256:[a-f0-9]{64}$/i.test(digest)) {
    throw new ReleaseError(
      'DOCKER_SOURCE_DIGEST_UNAVAILABLE',
      `Could not resolve an immutable digest for Docker source image: ${source}`,
    );
  }
  return { digest, id };
}

function inspectLocalId(reference: string, run: DockerRunner): string | undefined {
  const result = run(['image', 'inspect', '--format', '{{.Id}}', reference]);
  return result.status === 0 && result.stdout.trim().length > 0 ? result.stdout.trim() : undefined;
}

export function preflightDockerPublication(
  plan: DockerPublicationPlan,
  run: DockerRunner = runDocker,
): { digest: string; id: string } {
  const source = inspectSource(plan.source, run);
  for (const reference of plan.references) {
    const existingId = inspectLocalId(reference, run);
    if (existingId !== undefined && existingId !== source.id) {
      throw new ReleaseError(
        'DOCKER_TAG_CONFLICT',
        `Docker tag ${reference} already points to a different local image.`,
      );
    }
  }
  return source;
}

export function publishDockerImage(
  plan: DockerPublicationPlan,
  source: { digest: string; id: string },
  run: DockerRunner = runDocker,
): DockerPublicationResult {
  for (const reference of plan.references) {
    const existingId = inspectLocalId(reference, run);
    if (existingId !== source.id) {
      const tagged = run(['tag', plan.source, reference]);
      if (tagged.status !== 0) {
        throw new ReleaseError('DOCKER_TAG_FAILED', `Could not create Docker tag ${reference}.`);
      }
    }
  }

  if (plan.push) {
    for (const reference of plan.references) {
      const pushed = run(['push', reference], { inherit: true });
      if (pushed.status !== 0) {
        throw new ReleaseError('DOCKER_PUSH_FAILED', `Could not push Docker image ${reference}.`);
      }
    }
  }

  return { ...plan, digest: source.digest };
}
