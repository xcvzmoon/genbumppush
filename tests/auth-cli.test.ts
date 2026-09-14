import { describe, expect, test } from 'vite-plus/test';
import {
  getGitHubCliToken,
  getGitLabCliToken,
  parseGitLabAuthToken,
  type CliRunner,
} from '../src/auth-cli.ts';

const silent: CliRunner = () => undefined;

function recordingRunner(stdout: string | undefined): {
  run: CliRunner;
  calls: string[];
} {
  const calls: string[] = [];
  const run: CliRunner = (bin, args) => {
    calls.push(`${bin} ${args.join(' ')}`);
    return stdout;
  };
  return { run, calls };
}

describe('auth-cli', () => {
  test('parses GitLab status tokens and rejects masked values', () => {
    expect(
      parseGitLabAuthToken(
        'gitlab.com\n  ✓ Logged in to gitlab.com user demo (keyring)\n  - Token: glpat-example\n',
      ),
    ).toBe('glpat-example');
    expect(parseGitLabAuthToken('  - Token: glpat_****\n')).toBeUndefined();
    expect(parseGitLabAuthToken('not logged in')).toBeUndefined();
  });

  test('returns undefined when the CLI is missing or fails', () => {
    expect(getGitHubCliToken(undefined, silent)).toBeUndefined();
    expect(getGitLabCliToken(undefined, silent)).toBeUndefined();
  });

  test('uses gh auth token for public GitHub without --hostname', () => {
    const { run, calls } = recordingRunner('gho_test-token');
    expect(getGitHubCliToken(undefined, run)).toBe('gho_test-token');
    expect(getGitHubCliToken('https://github.com/', run)).toBe('gho_test-token');
    expect(calls).toEqual(['gh auth token', 'gh auth token']);
  });

  test('passes --hostname for GHES', () => {
    const { run, calls } = recordingRunner('gho_enterprise');
    expect(getGitHubCliToken('github.example.com', run)).toBe('gho_enterprise');
    expect(calls).toEqual(['gh auth token --hostname github.example.com']);
  });

  test('rejects masked GitHub tokens', () => {
    expect(getGitHubCliToken(undefined, recordingRunner('gho_****').run)).toBeUndefined();
  });

  test('uses glab auth status --show-token and passes custom hosts', () => {
    const publicRun = recordingRunner('gitlab.com\n  - Token: glpat-public');
    expect(getGitLabCliToken(undefined, publicRun.run)).toBe('glpat-public');
    expect(publicRun.calls).toEqual(['glab auth status --show-token']);

    const enterpriseRun = recordingRunner('  - Token: glpat-ent');
    expect(getGitLabCliToken('https://gitlab.example.com/', enterpriseRun.run)).toBe('glpat-ent');
    expect(enterpriseRun.calls).toEqual([
      'glab auth status --show-token --hostname gitlab.example.com',
    ]);
  });
});
