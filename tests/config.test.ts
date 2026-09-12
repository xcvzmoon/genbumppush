import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vite-plus/test';
import { loadReleaseConfig } from '../src/config.ts';

const dotenvKeys = [
  'GENBUMPPUSH_GITHUB_TOKEN',
  'GENBUMPPUSH_FROM_ENV_FILE',
  'EXISTING_WINS',
] as const;

afterEach(() => {
  for (const key of dotenvKeys) Reflect.deleteProperty(process.env, key);
});

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

  test('loads .env into process.env without clobbering existing values', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'genbumppush-'));
    await writeFile(
      join(cwd, '.env'),
      [
        'GENBUMPPUSH_FROM_ENV_FILE=from-file',
        'GENBUMPPUSH_GITHUB_TOKEN=file-token',
        'EXISTING_WINS=from-file',
        '',
      ].join('\n'),
    );
    process.env.EXISTING_WINS = 'from-process';

    await loadReleaseConfig(cwd);

    expect(process.env.GENBUMPPUSH_FROM_ENV_FILE).toBe('from-file');
    expect(process.env.GENBUMPPUSH_GITHUB_TOKEN).toBe('file-token');
    expect(process.env.EXISTING_WINS).toBe('from-process');
  });
});
