import { describe, expect, test } from 'vite-plus/test';
import { bumpVersion } from '../src/version.ts';

describe('bumpVersion', () => {
  test.each([
    ['1.2.3', 'major', undefined, '2.0.0'],
    ['1.2.3', 'minor', undefined, '1.3.0'],
    ['1.2.3', 'patch', undefined, '1.2.4'],
    ['1.2.3', 'premajor', 'rc', '2.0.0-rc.0'],
    ['1.2.3', 'preminor', 'beta', '1.3.0-beta.0'],
    ['1.2.3', 'prepatch', 'alpha', '1.2.4-alpha.0'],
    ['1.2.3', 'prerelease', 'beta', '1.2.4-beta.0'],
    ['1.2.4-beta.0', 'prerelease', 'beta', '1.2.4-beta.1'],
    ['1.2.4-alpha.2', 'prerelease', 'beta', '1.2.4-beta.0'],
    ['2.0.0-rc.3', 'major', undefined, '2.0.0'],
    ['1.3.0-beta.2', 'minor', undefined, '1.3.0'],
    ['1.2.4-beta.2', 'patch', undefined, '1.2.4'],
    ['0.1.0', 'major', undefined, '1.0.0'],
  ] as const)('%s + %s produces %s', (current, type, preid, expected) => {
    expect(bumpVersion(current, type, preid)).toBe(expected);
  });

  test('rejects invalid semantic versions', () => {
    expect(() => bumpVersion('v1.2.3', 'patch')).toThrow('Invalid semantic version');
    expect(() => bumpVersion('1.2.3-01', 'patch')).toThrow('Invalid semantic version');
    expect(() => bumpVersion('1.2', 'patch')).toThrow('Invalid semantic version');
  });

  test('rejects invalid prerelease identifiers from configuration', () => {
    expect(() => bumpVersion('1.2.3', 'prepatch', 'beta.1')).toThrow(
      'Invalid prerelease identifier',
    );
  });
});
