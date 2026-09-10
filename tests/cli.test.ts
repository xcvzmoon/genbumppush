import { describe, expect, test } from 'vite-plus/test';
import { parseCliOptions } from '../src/cli.ts';

describe('parseCliOptions', () => {
  test('accepts release and automation flags', () => {
    expect(
      parseCliOptions(['minor', '--preid=beta', '--dry-run', '--no-push', '--yes']),
    ).toMatchObject({
      release: 'minor',
      preid: 'beta',
      dryRun: true,
      push: false,
      yes: true,
    });
  });

  test('rejects unknown arguments', () => {
    expect(() => parseCliOptions(['--wat'])).toThrow('Unknown argument');
  });

  test('rejects unsafe prerelease identifiers', () => {
    expect(() => parseCliOptions(['--preid', 'beta.1'])).toThrow('letters, numbers');
  });

  test.each(['--cwd', '--config', '--preid'])('rejects a missing value for %s', (option) => {
    expect(() => parseCliOptions([option])).toThrow('requires a value');
  });

  test('parses GitLab retries and rejects a release type alongside them', () => {
    expect(parseCliOptions(['--retry-gitlab', 'v1.2.4'])).toMatchObject({
      gitlabRetryTag: 'v1.2.4',
    });
    expect(() => parseCliOptions(['patch', '--retry-gitlab', 'v1.2.4'])).toThrow(
      'cannot be combined',
    );
  });

  test('rejects duplicate positional release types', () => {
    expect(() => parseCliOptions(['minor', 'patch'])).toThrow('Unknown argument');
  });

  test('supports aliases and equals-form options', () => {
    expect(parseCliOptions(['-y', '-h', '--cwd=.', '--config=custom.ts'])).toMatchObject({
      yes: true,
      help: true,
      configFile: 'custom.ts',
    });
  });
});
