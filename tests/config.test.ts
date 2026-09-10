import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vite-plus/test';
import { loadReleaseConfig } from '../src/config.ts';

describe('loadReleaseConfig', () => {
  test('loads and overrides a TypeScript C12 config', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'genbumppush-'));
    await writeFile(
      join(cwd, 'genbumppush.config.ts'),
      'export default { recursive: true, git: { push: true } }\n',
    );
    const config = await loadReleaseConfig(cwd, undefined, { git: { push: false } });
    expect(config.recursive).toBe(true);
    expect(config.changelog).toBe('CHANGELOG.md');
    expect(config.git?.push).toBe(false);
    expect(config.git?.remote).toBe('origin');
  });

  test('returns production defaults when no config exists', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'genbumppush-'));
    const config = await loadReleaseConfig(cwd);
    expect(config).toMatchObject({
      changelog: 'CHANGELOG.md',
      recursive: false,
      git: { remote: 'origin', push: true, requireClean: true, requireUpstream: true },
    });
  });

  test('loads configuration from package.json', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'genbumppush-'));
    await writeFile(
      join(cwd, 'package.json'),
      JSON.stringify({ genbumppush: { changelog: false, git: { remote: 'upstream' } } }),
    );
    const config = await loadReleaseConfig(cwd);
    expect(config.changelog).toBe(false);
    expect(config.git?.remote).toBe('upstream');
    expect(config.git?.push).toBe(true);
  });
});
