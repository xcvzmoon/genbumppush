import { beforeEach, describe, expect, test, vi } from 'vite-plus/test';
import { getGitHubCliToken, getGitLabCliToken } from '../src/auth-cli.ts';

const { spawnSync } = vi.hoisted(() => ({ spawnSync: vi.fn() }));
vi.mock('node:child_process', () => ({ spawnSync }));

beforeEach(() => {
  spawnSync.mockReset();
});

describe('authentication subprocess capture', () => {
  test.each([
    { label: 'legacy stdout', stdout: '  - Token: synthetic-token', stderr: '' },
    { label: 'legacy stderr', stdout: '', stderr: '  - Token: synthetic-token' },
    {
      label: 'keyring stdout',
      stdout: '  ✓ Token found in operating system keyring: synthetic-token',
      stderr: '',
    },
    {
      label: 'keyring stderr',
      stdout: '',
      stderr: '  ✓ Token found in operating system keyring: synthetic-token',
    },
  ])('reads $label through the default runner', ({ stdout, stderr }) => {
    spawnSync.mockReturnValue({ status: 0, stdout, stderr });
    expect(getGitLabCliToken('https://gitlab.example.com/')).toBe('synthetic-token');
    expect(spawnSync).toHaveBeenCalledWith(
      'glab',
      ['auth', 'status', '--show-token', '--hostname', 'gitlab.example.com'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 5_000 },
    );
  });

  test.each([
    { label: 'nonzero exit', status: 1, error: undefined },
    { label: 'missing binary', status: null, error: new Error('ENOENT') },
    { label: 'timeout', status: null, error: new Error('ETIMEDOUT') },
    { label: 'process error despite zero status', status: 0, error: new Error('spawn failed') },
  ])('rejects token-bearing output on $label', ({ status, error }) => {
    spawnSync.mockReturnValue({
      status,
      error,
      stdout: '  - Token: synthetic-token',
      stderr: '  ✓ Token found in operating system keyring: synthetic-token',
    });
    expect(getGitLabCliToken()).toBeUndefined();
    expect(getGitHubCliToken()).toBeUndefined();
  });

  test('keeps a line boundary between streams', () => {
    spawnSync.mockReturnValue({ status: 0, stdout: '  - Token:', stderr: 'diagnostic' });
    expect(getGitLabCliToken()).toBeUndefined();
  });

  test('ignores successful output without a usable GitLab token', () => {
    for (const stderr of ['', 'not logged in', '  - Token: glpat_****']) {
      spawnSync.mockReturnValue({ status: 0, stdout: '', stderr });
      expect(getGitLabCliToken()).toBeUndefined();
    }
  });

  test('GitHub consumes only stdout', () => {
    spawnSync.mockReturnValue({ status: 0, stdout: '', stderr: 'diagnostic' });
    expect(getGitHubCliToken()).toBeUndefined();
    spawnSync.mockReturnValue({ status: 0, stdout: '\n synthetic-token\n', stderr: 'diagnostic' });
    expect(getGitHubCliToken()).toBe('synthetic-token');
  });
});
