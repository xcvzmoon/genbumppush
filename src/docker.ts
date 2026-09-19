import type { DockerImageOptions, DockerOptions } from './types.ts';
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
  /** Zero-based index of the configured image this plan came from. */
  index: number;
  source: string;
  image: string;
  references: string[];
  push: boolean;
};

export type DockerPublicationResult = DockerPublicationPlan & { digest: string };

export type DockerSourceIdentity = { digest: string; id: string };

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

/**
 * Normalize Docker config into a concrete list of image entries.
 *
 * Supports the singular form (`source`/`image`) and the multi-image form
 * (`images: [...]`). The two forms are mutually exclusive. Root-level
 * `tags` / `push` / `allowMutableTags` default into `images[]` entries.
 *
 * @returns Empty array when Docker is disabled.
 * @throws `DOCKER_CONFIG_INVALID` when enabled but nothing usable is configured,
 *   or when both config forms are mixed.
 */
export function resolveDockerImageEntries(config: DockerOptions | undefined): DockerImageOptions[] {
  if (config?.enabled !== true) return [];

  const imageList: readonly DockerImageOptions[] = Array.isArray(config.images)
    ? config.images
    : [];
  const hasImages = imageList.length > 0;
  const hasSingular = config.source !== undefined || config.image !== undefined;

  if (hasImages && hasSingular) {
    throw new ReleaseError(
      'DOCKER_CONFIG_INVALID',
      'Use either docker.images or the singular docker.source/docker.image form, not both.',
    );
  }

  if (hasImages) {
    return imageList.map((entry: DockerImageOptions) => ({
      source: entry.source,
      image: entry.image,
      tags: entry.tags ?? config.tags,
      push: entry.push ?? config.push,
      allowMutableTags: entry.allowMutableTags ?? config.allowMutableTags,
    }));
  }

  if (hasSingular) {
    return [
      {
        source: config.source,
        image: config.image,
        tags: config.tags,
        push: config.push,
        allowMutableTags: config.allowMutableTags,
      },
    ];
  }

  throw new ReleaseError(
    'DOCKER_CONFIG_INVALID',
    'docker is enabled but no images are configured. Set docker.images, or docker.source and docker.image.',
  );
}

function planDockerImageEntry(
  entry: DockerImageOptions,
  version: string,
  gitTag: string,
  index: number,
): DockerPublicationPlan {
  if (entry.source === undefined || entry.image === undefined) {
    throw new ReleaseError(
      'DOCKER_CONFIG_INVALID',
      entry.source === undefined && entry.image === undefined
        ? 'Each docker.images entry requires source and image.'
        : 'docker.source and docker.image are required when Docker tagging is enabled.',
    );
  }

  const source = render(entry.source, version, gitTag);
  const image = render(entry.image, version, gitTag);
  validateSource(source);
  validateRepository(image);

  const configuredTags = entry.tags ?? ['{{version}}'];
  if (configuredTags.length === 0) {
    throw new ReleaseError('DOCKER_CONFIG_INVALID', 'docker.tags must contain at least one tag.');
  }

  const tags = configuredTags.map((value) => render(value, version, gitTag));
  for (const tag of tags) {
    if (!TAG_PATTERN.test(tag)) {
      throw new ReleaseError('DOCKER_TAG_INVALID', `Invalid Docker tag: ${tag}`);
    }
    if (tag === 'latest' && entry.allowMutableTags !== true) {
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
    index,
    source,
    image,
    references: tags.map((tag) => `${image}:${tag}`),
    push: entry.push !== false,
  };
}

function validateNoOverlappingReferences(plans: readonly DockerPublicationPlan[]): void {
  const owner = new Map<string, string>();
  for (const plan of plans) {
    for (const reference of plan.references) {
      const existing = owner.get(reference);
      if (existing !== undefined) {
        throw new ReleaseError(
          'DOCKER_CONFIG_INVALID',
          `Docker reference ${reference} is planned by multiple images (${existing} and ${plan.source}).`,
        );
      }
      owner.set(reference, plan.source);
    }
  }
}

/**
 * Plan every configured Docker image for a release.
 *
 * @returns Empty array when Docker is disabled.
 */
export function planDockerPublications(
  config: DockerOptions | undefined,
  version: string,
  gitTag: string,
): DockerPublicationPlan[] {
  const entries = resolveDockerImageEntries(config);
  const plans = entries.map((entry, index) => planDockerImageEntry(entry, version, gitTag, index));
  validateNoOverlappingReferences(plans);
  return plans;
}

/**
 * Plan a single Docker image publication.
 *
 * Prefer {@link planDockerPublications}. This helper returns the first plan
 * when Docker is enabled, and `undefined` when it is not — kept for callers
 * that only handle one image.
 */
export function planDockerPublication(
  config: DockerOptions | undefined,
  version: string,
  gitTag: string,
): DockerPublicationPlan | undefined {
  return planDockerPublications(config, version, gitTag)[0];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function inspectSource(source: string, run: DockerRunner): DockerSourceIdentity {
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
): DockerSourceIdentity {
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

/**
 * Preflight every planned image before any release mutation.
 *
 * Fail-fast on the first image that cannot be published, naming that image.
 */
export function preflightDockerPublications(
  plans: readonly DockerPublicationPlan[],
  run: DockerRunner = runDocker,
): DockerSourceIdentity[] {
  return plans.map((plan) => {
    try {
      return preflightDockerPublication(plan, run);
    } catch (error) {
      throw wrapDockerImageError(plan, error);
    }
  });
}

export function publishDockerImage(
  plan: DockerPublicationPlan,
  source: DockerSourceIdentity,
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

/**
 * Publish every planned image in order.
 *
 * On failure, the error names the image that failed. Earlier images in the
 * list may already have been tagged/pushed; retry with `--retry-docker <tag>`
 * re-publishes all configured images.
 */
export function publishDockerImages(
  plans: readonly DockerPublicationPlan[],
  sources: readonly DockerSourceIdentity[],
  run: DockerRunner = runDocker,
): DockerPublicationResult[] {
  if (plans.length !== sources.length) {
    throw new ReleaseError(
      'DOCKER_CONFIG_INVALID',
      'Docker publication received mismatched plan and preflight source counts.',
    );
  }
  return plans.map((plan, index) => {
    const source = sources[index];
    if (source === undefined) {
      throw new ReleaseError(
        'DOCKER_CONFIG_INVALID',
        `Missing preflight source for Docker image ${plan.image}.`,
      );
    }
    try {
      return publishDockerImage(plan, source, run);
    } catch (error) {
      throw wrapDockerImageError(plan, error);
    }
  });
}

function wrapDockerImageError(plan: DockerPublicationPlan, error: unknown): ReleaseError {
  if (!(error instanceof ReleaseError)) {
    return new ReleaseError(
      'DOCKER_PUBLISH_FAILED',
      `Docker image ${plan.image} failed: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
  if (error.message.includes(plan.image)) {
    return error;
  }
  return new ReleaseError(error.code, `Docker image ${plan.image}: ${error.message}`, {
    cause: error,
  });
}

/** Shape of one image reported on {@link import('./types.ts').ReleaseResult}. */
export type DockerResultImage = {
  image: string;
  references: string[];
  digest?: string;
};

export function toDockerResultImages(
  published: readonly DockerPublicationResult[],
): DockerResultImage[] {
  return published.map(({ image, references, digest }) => ({ image, references, digest }));
}

export function applyDockerResultFields(
  result: {
    dockerImagePublished?: boolean;
    dockerImages?: DockerResultImage[];
    dockerImage?: string;
    dockerTags?: string[];
    dockerDigest?: string;
  },
  published: readonly DockerPublicationResult[],
): void {
  const images = toDockerResultImages(published);
  result.dockerImagePublished = true;
  result.dockerImages = images;
  if (images.length === 1 && images[0] !== undefined) {
    result.dockerImage = images[0].image;
    result.dockerTags = images[0].references;
    if (images[0].digest !== undefined) result.dockerDigest = images[0].digest;
  }
}
