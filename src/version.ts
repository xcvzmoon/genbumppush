import type { ReleaseType } from './types.ts';
import { ReleaseError } from './error.ts';

type Version = {
  major: number;
  minor: number;
  patch: number;
  prerelease?: string[];
};

const VERSION_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

function parseVersion(value: string): Version {
  const match = VERSION_PATTERN.exec(value);
  if (match?.[1] === undefined || match[2] === undefined || match[3] === undefined) {
    throw new ReleaseError('INVALID_VERSION', `Invalid semantic version: ${value}`);
  }
  const identifiers = match[4]?.split('.');
  if (
    identifiers?.some(
      (identifier) =>
        /^\d+$/.test(identifier) && identifier.length > 1 && identifier.startsWith('0'),
    )
  ) {
    throw new ReleaseError('INVALID_VERSION', `Invalid semantic version: ${value}`);
  }
  const version: Version = {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
  if (identifiers !== undefined) version.prerelease = identifiers;
  return version;
}

function format(version: Version): string {
  const base = `${version.major}.${version.minor}.${version.patch}`;
  return version.prerelease === undefined ? base : `${base}-${version.prerelease.join('.')}`;
}

function applyPrerelease(version: Version, preid: string): Version {
  if (version.prerelease?.[0] === preid) {
    const identifiers = [...version.prerelease];
    const last = identifiers.at(-1);
    if (last !== undefined && /^\d+$/.test(last)) {
      identifiers[identifiers.length - 1] = String(Number(last) + 1);
    } else {
      identifiers.push('0');
    }
    return { ...version, prerelease: identifiers };
  }

  return { ...version, prerelease: [preid, '0'] };
}

export function bumpVersion(current: string, release: ReleaseType, preid = 'beta'): string {
  const version = parseVersion(current);
  if (!/^[0-9A-Za-z-]+$/.test(preid)) {
    throw new ReleaseError('INVALID_PREID', `Invalid prerelease identifier: ${preid}`);
  }

  const stable = version.prerelease === undefined ? version : { ...version, prerelease: undefined };
  switch (release) {
    case 'major':
      return format(
        version.prerelease !== undefined && version.minor === 0 && version.patch === 0
          ? stable
          : { major: version.major + 1, minor: 0, patch: 0 },
      );

    case 'minor':
      return format(
        version.prerelease !== undefined && version.patch === 0
          ? stable
          : { major: version.major, minor: version.minor + 1, patch: 0 },
      );

    case 'patch':
      return format(
        version.prerelease === undefined
          ? { major: version.major, minor: version.minor, patch: version.patch + 1 }
          : stable,
      );

    case 'premajor':
      return format(applyPrerelease({ major: version.major + 1, minor: 0, patch: 0 }, preid));

    case 'preminor':
      return format(
        applyPrerelease({ major: version.major, minor: version.minor + 1, patch: 0 }, preid),
      );

    case 'prepatch':
      return format(
        applyPrerelease(
          { major: version.major, minor: version.minor, patch: version.patch + 1 },
          preid,
        ),
      );

    case 'prerelease':
      return format(
        applyPrerelease(
          version.prerelease === undefined ? { ...version, patch: version.patch + 1 } : version,
          preid,
        ),
      );
  }

  throw new ReleaseError('INVALID_RELEASE_TYPE', 'Unsupported release type.');
}
