import { mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vite-plus/test';
import {
  applyVersionChanges,
  planVersionChanges,
  restoreVersionChanges,
} from '../src/version-files.ts';

async function fixture(): Promise<string> {
  const cwd = await mkdtemp(join(tmpdir(), 'genbumppush-files-'));
  await writeFile(join(cwd, 'package.json'), '{\n  "name": "root",\n  "version": "1.2.3"\n}\n');
  return cwd;
}

describe('version file adapters', () => {
  test('plans changes without mutating files and can apply and restore them', async () => {
    const cwd = await fixture();
    const path = join(cwd, 'package.json');
    const before = await readFile(path, 'utf8');
    const changes = await planVersionChanges(cwd, '1.2.3', '1.2.4', {});
    expect(await readFile(path, 'utf8')).toBe(before);
    await applyVersionChanges(changes);
    expect(await readFile(path, 'utf8')).toContain('"version": "1.2.4"');
    await restoreVersionChanges(changes);
    expect(await readFile(path, 'utf8')).toBe(before);
  });

  test('updates package-lock v3 root versions while preserving dependency versions', async () => {
    const cwd = await fixture();
    const lock = {
      name: 'root',
      version: '1.2.3',
      lockfileVersion: 3,
      packages: { '': { name: 'root', version: '1.2.3' }, 'node_modules/x': { version: '1.2.3' } },
    };
    await writeFile(join(cwd, 'package-lock.json'), `${JSON.stringify(lock, null, 2)}\n`);
    const changes = await planVersionChanges(cwd, '1.2.3', '1.2.4', {
      files: ['package-lock.json'],
    });
    const result = changes[0]?.after ?? '';
    expect(result).toContain('"version": "1.2.4"');
    expect(result).toContain('"node_modules/x": {\n      "version": "1.2.3"');
  });

  test('updates only the top-level JSON version when nested version keys appear first', async () => {
    const cwd = await fixture();
    await writeFile(
      join(cwd, 'app.json'),
      JSON.stringify(
        {
          config: { version: '9.9.9', nested: { version: '8.8.8' } },
          name: 'app',
          version: '1.2.3',
        },
        null,
        2,
      ) + '\n',
    );
    const changes = await planVersionChanges(cwd, '1.2.3', '1.2.4', { files: ['app.json'] });
    const parsed: unknown = JSON.parse(changes[0]?.after ?? '{}');
    expect(parsed).toMatchObject({
      version: '1.2.4',
      config: { version: '9.9.9', nested: { version: '8.8.8' } },
    });
  });

  test('updates only the top-level JSON version when nested version keys appear last', async () => {
    const cwd = await fixture();
    await writeFile(
      join(cwd, 'app.json'),
      JSON.stringify(
        {
          name: 'app',
          version: '1.2.3',
          engines: { version: '9.9.9' },
        },
        null,
        2,
      ) + '\n',
    );
    const changes = await planVersionChanges(cwd, '1.2.3', '1.2.4', { files: ['app.json'] });
    const parsed: unknown = JSON.parse(changes[0]?.after ?? '{}');
    expect(parsed).toMatchObject({
      version: '1.2.4',
      engines: { version: '9.9.9' },
    });
  });

  test('preserves lockfile formatting and dependency versions when bumping package-lock', async () => {
    const cwd = await fixture();
    const before = [
      '{',
      '  "name": "root",',
      '  "version": "1.2.3",',
      '  "lockfileVersion": 3,',
      '  "packages": {',
      '    "": {',
      '      "name": "root",',
      '      "version": "1.2.3"',
      '    },',
      '    "node_modules/x": {',
      '      "version": "1.2.3"',
      '    }',
      '  }',
      '}',
      '',
    ].join('\n');
    await writeFile(join(cwd, 'package-lock.json'), before);
    const changes = await planVersionChanges(cwd, '1.2.3', '1.2.4', {
      files: ['package-lock.json'],
    });
    const after = changes[0]?.after ?? '';
    expect(after).toBe(
      before
        .replace(
          '"version": "1.2.3",\n  "lockfileVersion"',
          '"version": "1.2.4",\n  "lockfileVersion"',
        )
        .replace(
          '"name": "root",\n      "version": "1.2.3"',
          '"name": "root",\n      "version": "1.2.4"',
        ),
    );
    expect(after).toContain('"node_modules/x": {\n      "version": "1.2.3"\n    }');
    expect(JSON.parse(after)).toMatchObject({
      version: '1.2.4',
      packages: { '': { version: '1.2.4' }, 'node_modules/x': { version: '1.2.3' } },
    });
  });

  test('bumps minified package-lock without pretty-printing the whole file', async () => {
    const cwd = await fixture();
    const minified = JSON.stringify({
      name: 'root',
      version: '1.2.3',
      packages: { '': { version: '1.2.3' }, 'node_modules/x': { version: '1.2.3' } },
    });
    await writeFile(join(cwd, 'package-lock.json'), minified);
    const changes = await planVersionChanges(cwd, '1.2.3', '1.2.4', {
      files: ['package-lock.json'],
    });
    const after = changes[0]?.after ?? '';
    expect(after.includes('\n')).toBe(false);
    expect(JSON.parse(after)).toMatchObject({
      version: '1.2.4',
      packages: { '': { version: '1.2.4' }, 'node_modules/x': { version: '1.2.3' } },
    });
  });

  test('updates package-lock root version when packages[""] has no version field', async () => {
    const cwd = await fixture();
    const lock = {
      name: 'root',
      version: '1.2.3',
      packages: { '': { name: 'root' }, 'node_modules/x': { version: '1.2.3' } },
    };
    await writeFile(join(cwd, 'package-lock.json'), `${JSON.stringify(lock, null, 2)}\n`);
    const changes = await planVersionChanges(cwd, '1.2.3', '1.2.4', {
      files: ['package-lock.json'],
    });
    expect(JSON.parse(changes[0]?.after ?? '{}')).toMatchObject({
      version: '1.2.4',
      packages: { '': { name: 'root' }, 'node_modules/x': { version: '1.2.3' } },
    });
  });

  test('rejects package-lock without packages[""] when a version field is present but mismatched', async () => {
    const cwd = await fixture();
    const lock = {
      name: 'root',
      version: '1.2.3',
      packages: { '': { version: '9.9.9' } },
    };
    await writeFile(join(cwd, 'package-lock.json'), `${JSON.stringify(lock, null, 2)}\n`);
    await expect(
      planVersionChanges(cwd, '1.2.3', '1.2.4', { files: ['package-lock.json'] }),
    ).rejects.toThrow('expected 1.2.3');
  });

  test('preserves four-space indentation in package-lock updates', async () => {
    const cwd = await fixture();
    const before = `${JSON.stringify(
      {
        name: 'root',
        version: '1.2.3',
        packages: { '': { version: '1.2.3' } },
      },
      null,
      4,
    )}\n`;
    await writeFile(join(cwd, 'package-lock.json'), before);
    const changes = await planVersionChanges(cwd, '1.2.3', '1.2.4', {
      files: ['package-lock.json'],
    });
    const after = changes[0]?.after ?? '';
    expect(after).toContain('    "version": "1.2.4"');
    expect(after.startsWith('{\n    "name"')).toBe(true);
  });

  test('rejects a malformed package-lock structure', async () => {
    const cwd = await fixture();
    await writeFile(join(cwd, 'package-lock.json'), '{"version":"1.2.3","packages":{"":42}}\n');
    await expect(
      planVersionChanges(cwd, '1.2.3', '1.2.4', { files: ['package-lock.json'] }),
    ).rejects.toThrow('invalid');
  });

  test('updates only the Cargo package and matching lock block', async () => {
    const cwd = await fixture();
    await writeFile(
      join(cwd, 'Cargo.toml'),
      '[package]\nname = "app"\nversion = "1.2.3"\n\n[dependencies]\nx = "1.2.3"\n',
    );
    await writeFile(
      join(cwd, 'Cargo.lock'),
      '[[package]]\nname = "dependency"\nversion = "1.2.3"\n\n[[package]]\nname = "app"\nsource = "local"\nversion = "1.2.3"\n',
    );
    const changes = await planVersionChanges(cwd, '1.2.3', '1.2.4', {
      files: ['Cargo.toml', 'Cargo.lock'],
    });
    expect(changes[0]?.after).toContain('x = "1.2.3"');
    expect(changes[1]?.after).toContain('name = "dependency"\nversion = "1.2.3"');
    expect(changes[1]?.after).toContain('name = "app"\nsource = "local"\nversion = "1.2.4"');
  });

  test.each([
    ['missing version', '{"name":"root"}', 'no top-level version'],
    ['mismatched version', '{"version":"9.9.9"}', 'expected 1.2.3'],
    ['malformed JSON', '{', 'JSON'],
  ])('rejects %s before writing anything', async (_name, content, message) => {
    const cwd = await fixture();
    await writeFile(join(cwd, 'other.json'), content);
    const rootBefore = await readFile(join(cwd, 'package.json'), 'utf8');
    await expect(
      planVersionChanges(cwd, '1.2.3', '1.2.4', { files: ['package.json', 'other.json'] }),
    ).rejects.toThrow(message);
    expect(await readFile(join(cwd, 'package.json'), 'utf8')).toBe(rootBefore);
  });

  test.each([
    ['none', 'no version here', 'found 0'],
    ['multiple', '1.2.3 and 1.2.3', 'found 2'],
  ])('rejects a custom file containing %s current versions', async (_name, content, message) => {
    const cwd = await fixture();
    await writeFile(join(cwd, 'VERSION.txt'), content);
    await expect(
      planVersionChanges(cwd, '1.2.3', '1.2.4', { files: ['VERSION.txt'] }),
    ).rejects.toThrow(message);
  });

  test('rejects missing files and paths outside the repository', async () => {
    const cwd = await fixture();
    await expect(
      planVersionChanges(cwd, '1.2.3', '1.2.4', { files: ['missing.json'] }),
    ).rejects.toThrow('does not exist');
    await expect(
      planVersionChanges(cwd, '1.2.3', '1.2.4', { files: ['../outside.json'] }),
    ).rejects.toThrow('outside the repository');
  });

  test('rejects a symlink that resolves outside the repository', async () => {
    const cwd = await fixture();
    const outside = await mkdtemp(join(tmpdir(), 'genbumppush-outside-'));
    const target = join(outside, 'VERSION.txt');
    await writeFile(target, '1.2.3\n');
    await symlink(target, join(cwd, 'VERSION.txt'));
    await expect(
      planVersionChanges(cwd, '1.2.3', '1.2.4', { files: ['VERSION.txt'] }),
    ).rejects.toThrow('resolves outside');
    expect(await readFile(target, 'utf8')).toBe('1.2.3\n');
  });

  test('discovers nested manifests recursively and ignores build directories', async () => {
    const cwd = await fixture();
    await mkdir(join(cwd, 'packages', 'a'), { recursive: true });
    await mkdir(join(cwd, 'node_modules', 'ignored'), { recursive: true });
    await writeFile(join(cwd, 'packages', 'a', 'package.json'), '{"version":"1.2.3"}\n');
    await writeFile(join(cwd, 'node_modules', 'ignored', 'package.json'), '{"version":"1.2.3"}\n');
    const changes = await planVersionChanges(cwd, '1.2.3', '1.2.4', { recursive: true });
    expect(changes.map((change) => change.path).toSorted()).toEqual([
      join(cwd, 'package.json'),
      join(cwd, 'packages', 'a', 'package.json'),
    ]);
  });
});
