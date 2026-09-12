import type { GenBumpPushConfig } from './types.ts';
import { existsSync } from 'node:fs';
import { realpath, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { ReleaseError } from './error.ts';

export type FileChange = {
  path: string;
  before: string;
  after: string;
};

const IGNORED_DIRECTORIES = new Set(['.git', 'node_modules', 'dist', 'target', '.output']);

type PackageManifest = {
  version?: unknown;
};

type PackageLock = PackageManifest & {
  packages?: PackageMap;
};

type PackageMap = {
  ''?: PackageManifest;
};

type CargoSection = {
  start: number;
  end: number;
};

function isObject(value: unknown): value is object {
  return value !== null && Object(value) === value && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return Object.prototype.toString.call(value) === '[object String]';
}

function isPackageManifest(value: unknown): value is PackageManifest {
  return (
    isObject(value) &&
    (!('version' in value) || value.version === undefined || isString(value.version))
  );
}

function isPackageMap(value: unknown): value is PackageMap {
  if (!isObject(value)) return false;
  const root = '' in value ? value[''] : undefined;
  return root === undefined || isPackageManifest(root);
}

function isPackageLock(value: unknown): value is PackageLock {
  return (
    isPackageManifest(value) &&
    (!('packages' in value) || value.packages === undefined || isPackageMap(value.packages))
  );
}

function isInside(root: string, path: string): boolean {
  const fromRoot = relative(root, path);
  return fromRoot === '' || (!fromRoot.startsWith('..') && !isAbsolute(fromRoot));
}

export async function resolveRepositoryPath(cwd: string, configuredPath: string): Promise<string> {
  const root = resolve(cwd);
  const canonicalRoot = await realpath(root);
  const path = resolve(root, configuredPath);
  if (!isInside(root, path)) {
    throw new ReleaseError('PATH_OUTSIDE_REPOSITORY', `${path} is outside the repository.`);
  }

  const existingPath = existsSync(path) ? await realpath(path) : await realpath(dirname(path));
  if (!isInside(canonicalRoot, existingPath)) {
    throw new ReleaseError('PATH_OUTSIDE_REPOSITORY', `${path} resolves outside the repository.`);
  }
  return path;
}

async function findManifests(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry): Promise<string[]> => {
      if (entry.isDirectory() && !IGNORED_DIRECTORIES.has(entry.name)) {
        return findManifests(join(directory, entry.name));
      }
      return entry.name === 'package.json' ? [join(directory, entry.name)] : [];
    }),
  );

  return nested.flat();
}

function assertCurrent(path: string, actual: string, expected: string): void {
  if (actual !== expected) {
    throw new ReleaseError(
      'VERSION_MISMATCH',
      `${path} has version ${actual}; expected ${expected}.`,
    );
  }
}

type StringPropertySpan = {
  value: string;
  valueStart: number;
  valueEnd: number;
};

function parseJsonString(raw: string): string | undefined {
  try {
    const parsed: unknown = JSON.parse(raw);
    return isString(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

type JsonFrame = { kind: 'object'; introKey?: string } | { kind: 'array' };

function readJsonString(content: string, start: number): { end: number; raw: string } {
  let index = start + 1;
  let escape = false;
  while (index < content.length) {
    const char = content[index];
    if (char === undefined) break;
    if (escape) {
      escape = false;
    } else if (char === '\\') {
      escape = true;
    } else if (char === '"') {
      index += 1;
      return { end: index, raw: content.slice(start, index) };
    }
    index += 1;
  }
  return { end: content.length, raw: content.slice(start) };
}

function objectKeyPath(stack: readonly JsonFrame[], propertyKey: string): string[] {
  const path: string[] = [];
  for (const frame of stack) {
    if (frame.kind === 'object' && frame.introKey !== undefined) path.push(frame.introKey);
  }
  path.push(propertyKey);
  return path;
}

/**
 * Locate a JSON string property by object-key path without reformatting the file.
 * Nested keys with the same name are never selected.
 */
function findJsonStringProperty(
  content: string,
  keyPath: readonly string[],
): StringPropertySpan | undefined {
  if (keyPath.length === 0) return undefined;

  const stack: JsonFrame[] = [];
  let index = 0;
  let pendingKey: string | undefined;
  let afterColon = false;

  const skipWhitespace = () => {
    while (index < content.length && /\s/.test(content[index] ?? '')) index += 1;
  };

  while (index < content.length) {
    skipWhitespace();
    const char = content[index];
    if (char === undefined) break;

    if (char === '{') {
      stack.push({ kind: 'object', introKey: pendingKey });
      pendingKey = undefined;
      afterColon = false;
      index += 1;
      continue;
    }

    if (char === '}') {
      stack.pop();
      pendingKey = undefined;
      afterColon = false;
      index += 1;
      continue;
    }

    if (char === '[') {
      stack.push({ kind: 'array' });
      pendingKey = undefined;
      afterColon = false;
      index += 1;
      continue;
    }

    if (char === ']') {
      stack.pop();
      pendingKey = undefined;
      afterColon = false;
      index += 1;
      continue;
    }

    if (char === ',') {
      pendingKey = undefined;
      afterColon = false;
      index += 1;
      continue;
    }

    if (char === ':') {
      afterColon = true;
      index += 1;
      continue;
    }

    if (char === '"') {
      const { end, raw } = readJsonString(content, index);
      index = end;
      const decoded = parseJsonString(raw);
      if (decoded === undefined) continue;

      const top = stack.at(-1);
      if (top?.kind === 'object' && !afterColon) {
        pendingKey = decoded;
        continue;
      }

      if (afterColon && pendingKey !== undefined) {
        const path = objectKeyPath(stack, pendingKey);
        const matches =
          path.length === keyPath.length && path.every((segment, i) => segment === keyPath[i]);
        if (matches) {
          const valueStart = end - raw.length + 1;
          const valueEnd = end - 1;
          return {
            value: decoded,
            valueStart,
            valueEnd,
          };
        }
        pendingKey = undefined;
        afterColon = false;
      }
      continue;
    }

    // Numbers and literals after a colon complete that property.
    if (afterColon) {
      pendingKey = undefined;
      afterColon = false;
    }
    index += 1;
  }

  return undefined;
}

function replaceJsonStringProperty(
  content: string,
  span: StringPropertySpan,
  value: string,
): string {
  return `${content.slice(0, span.valueStart)}${JSON.stringify(value).slice(1, -1)}${content.slice(span.valueEnd)}`;
}

function replaceJsonVersion(
  content: string,
  path: string,
  current: string,
  version: string,
): string {
  const parsed: unknown = JSON.parse(content);
  if (!isObject(parsed) || !('version' in parsed) || !isString(parsed.version)) {
    throw new ReleaseError('MISSING_VERSION', `${path} has no top-level version string.`);
  }

  assertCurrent(path, parsed.version, current);
  const span = findJsonStringProperty(content, ['version']);
  if (span === undefined) {
    throw new ReleaseError('MISSING_VERSION', `${path} has no top-level version string.`);
  }

  const updated = replaceJsonStringProperty(content, span, version);
  if (updated === content) throw new ReleaseError('VERSION_UNCHANGED', `${path} was not updated.`);
  return updated;
}

function replacePackageLockVersion(
  content: string,
  path: string,
  current: string,
  version: string,
): string {
  const parsed: unknown = JSON.parse(content);
  if (!isPackageLock(parsed)) {
    throw new ReleaseError('INVALID_LOCKFILE', `${path} is invalid.`);
  }

  const data = parsed;
  if (!isString(data.version)) {
    throw new ReleaseError('MISSING_VERSION', `${path} has no root version.`);
  }

  assertCurrent(path, data.version, current);

  const rootVersion = data.packages?.['']?.version;
  if (rootVersion !== undefined && !isString(rootVersion)) {
    throw new ReleaseError('INVALID_LOCKFILE', `${path} has an invalid root package version.`);
  }

  if (isString(rootVersion)) {
    assertCurrent(path, rootVersion, current);
  }

  const rootSpan = findJsonStringProperty(content, ['version']);
  if (rootSpan === undefined) {
    throw new ReleaseError('MISSING_VERSION', `${path} has no root version.`);
  }

  let updated = replaceJsonStringProperty(content, rootSpan, version);

  if (isString(rootVersion)) {
    // packages[""].version — empty-string key is unique in lockfile root packages map.
    const packagesSpan = findJsonStringProperty(updated, ['packages', '', 'version']);
    if (packagesSpan === undefined) {
      throw new ReleaseError(
        'MISSING_VERSION',
        `${path} has no packages[""].version string to update.`,
      );
    }
    updated = replaceJsonStringProperty(updated, packagesSpan, version);
  }

  if (updated === content) throw new ReleaseError('VERSION_UNCHANGED', `${path} was not updated.`);
  return updated;
}

function cargoSection(content: string): CargoSection {
  const start = content.search(/^\[package\]\s*$/m);
  if (start < 0) {
    throw new ReleaseError('MISSING_CARGO_PACKAGE', 'Cargo.toml has no [package] section.');
  }

  const next = content.slice(start + 1).search(/^\[[^[]/m);
  return { start, end: next < 0 ? content.length : start + 1 + next };
}

function cargoName(content: string): string {
  const section = cargoSection(content);
  const match = /^name\s*=\s*"([^"]+)"/m.exec(content.slice(section.start, section.end));
  if (match?.[1] === undefined) {
    throw new ReleaseError('MISSING_CARGO_NAME', 'Cargo.toml has no package name.');
  }

  return match[1];
}

function replaceCargoVersion(
  content: string,
  path: string,
  current: string,
  version: string,
): string {
  const section = cargoSection(content);
  const body = content.slice(section.start, section.end);
  const match = /^version\s*=\s*"([^"]*)"/m.exec(body);
  if (match?.[1] === undefined) {
    throw new ReleaseError('MISSING_CARGO_VERSION', 'Cargo.toml has no package version.');
  }

  assertCurrent(path, match[1], current);
  const updated = body.replace(/(^version\s*=\s*")[^"]*(")/m, `$1${version}$2`);
  if (updated === body) {
    throw new ReleaseError('MISSING_CARGO_VERSION', 'Cargo.toml has no package version.');
  }

  return `${content.slice(0, section.start)}${updated}${content.slice(section.end)}`;
}

function replaceCargoLockVersion(
  content: string,
  path: string,
  name: string,
  current: string,
  version: string,
): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const blocks = content.split(/(?=^\[\[package\]\]\s*$)/m);

  let matches = 0;
  const updated = blocks
    .map((block) => {
      if (!new RegExp(`^name\\s*=\\s*"${escaped}"\\s*$`, 'm').test(block)) {
        return block;
      }
      matches += 1;
      const match = /^version\s*=\s*"([^"]*)"\s*$/m.exec(block);
      if (match?.[1] === undefined) {
        throw new ReleaseError(
          'MISSING_CARGO_LOCK_VERSION',
          `${path} package ${name} has no version.`,
        );
      }
      assertCurrent(path, match[1], current);
      return block.replace(/(^version\s*=\s*")[^"]*(")/m, `$1${version}$2`);
    })
    .join('');

  if (matches === 0) {
    throw new ReleaseError(
      'MISSING_CARGO_LOCK_PACKAGE',
      `Cargo.lock has no package named ${name}.`,
    );
  }

  if (matches > 1) {
    throw new ReleaseError(
      'AMBIGUOUS_CARGO_LOCK_PACKAGE',
      `${path} contains package ${name} more than once.`,
    );
  }

  return updated;
}

async function transform(path: string, current: string, version: string): Promise<string> {
  const content = await readFile(path, 'utf8');
  const name = basename(path);

  if (name === 'package-lock.json') {
    return replacePackageLockVersion(content, path, current, version);
  }

  if (name === 'package.json' || name === 'tauri.conf.json' || name.endsWith('.json')) {
    return replaceJsonVersion(content, path, current, version);
  }

  if (name === 'Cargo.toml') {
    return replaceCargoVersion(content, path, current, version);
  }

  if (name === 'Cargo.lock') {
    const manifestPath = join(dirname(path), 'Cargo.toml');
    if (!existsSync(manifestPath)) {
      throw new ReleaseError(
        'MISSING_CARGO_MANIFEST',
        `${relative(process.cwd(), manifestPath)} is required.`,
      );
    }

    return replaceCargoLockVersion(
      content,
      path,
      cargoName(await readFile(manifestPath, 'utf8')),
      current,
      version,
    );
  }

  const occurrences = content.split(current).length - 1;
  if (occurrences !== 1) {
    throw new ReleaseError(
      'AMBIGUOUS_VERSION',
      `${path} must contain the current version exactly once; found ${occurrences}.`,
    );
  }

  return content.replace(current, version);
}

export async function planVersionChanges(
  cwd: string,
  current: string,
  version: string,
  config: GenBumpPushConfig,
): Promise<FileChange[]> {
  const configured = await Promise.all(
    (config.files ?? ['package.json']).map((path) => resolveRepositoryPath(cwd, path)),
  );
  const paths =
    config.recursive === true ? [...configured, ...(await findManifests(cwd))] : configured;
  const unique = [...new Set(paths)];
  return Promise.all(
    unique.map(async (path) => {
      if (!existsSync(path)) {
        throw new ReleaseError('MISSING_VERSION_FILE', `${relative(cwd, path)} does not exist.`);
      }
      const before = await readFile(path, 'utf8');
      return { path, before, after: await transform(path, current, version) };
    }),
  );
}

export async function applyVersionChanges(changes: FileChange[]): Promise<void> {
  try {
    await Promise.all(changes.map((change) => writeFile(change.path, change.after)));
  } catch (error) {
    await restoreVersionChanges(changes);
    throw error;
  }
}

export async function restoreVersionChanges(changes: FileChange[]): Promise<void> {
  await Promise.all(changes.map((change) => writeFile(change.path, change.before)));
}
