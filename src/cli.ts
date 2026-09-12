import type { CliOptions, ReleaseType } from './types.ts';
import { resolve } from 'node:path';
import { ReleaseError } from './error.ts';
import { RELEASE_TYPES } from './types.ts';

export const HELP_TEXT = `Usage: genbumppush [release] [options]\n\nGenerate a changelog, bump versions, create an annotated tag, and push atomically.\n\nArguments:\n  release             ${RELEASE_TYPES.join(' | ')}\n\nOptions:\n  --cwd <path>        Repository directory\n  --config <path>     Explicit C12 config file\n  --preid <id>        Prerelease identifier\n  --retry-gitlab <tag> Retry GitLab release creation for a pushed tag\n  --retry-github <tag> Retry GitHub release creation for a pushed tag\n  --dry-run           Preview without changes\n  --no-push           Keep commit and tag local\n  --yes, -y           Skip confirmation\n  --help, -h          Show help\n`;

function isType(value: string): value is ReleaseType {
  return RELEASE_TYPES.some((item) => item === value);
}

function next(args: string[], index: number, option: string): string {
  const value = args[index + 1];
  if (value === undefined || value.startsWith('-')) {
    throw new ReleaseError('MISSING_OPTION_VALUE', `${option} requires a value.`);
  }
  return value;
}

export function parseCliOptions(args: string[]): CliOptions {
  const result: CliOptions = {
    cwd: process.cwd(),
    dryRun: false,
    yes: false,
    help: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === undefined) continue;

    const equals = arg.indexOf('=');
    const option = equals < 0 ? arg : arg.slice(0, equals);
    const inlineValue = equals < 0 ? undefined : arg.slice(equals + 1);

    switch (option) {
      case '--dry-run':
        result.dryRun = true;
        break;

      case '--no-push':
        result.push = false;
        break;

      case '--yes':
      case '-y':
        result.yes = true;
        break;

      case '--help':
      case '-h':
        result.help = true;
        break;

      case '--cwd': {
        const value = inlineValue ?? next(args, index, '--cwd');
        result.cwd = resolve(value);
        if (inlineValue === undefined) index += 1;
        break;
      }

      case '--config':
        result.configFile = inlineValue ?? next(args, index, '--config');
        if (inlineValue === undefined) index += 1;
        break;

      case '--preid': {
        const value = inlineValue ?? next(args, index, '--preid');
        if (!/^[0-9A-Za-z-]+$/.test(value)) {
          throw new ReleaseError('INVALID_PREID', '--preid accepts letters, numbers, and hyphens.');
        }

        result.preid = value;
        if (inlineValue === undefined) index += 1;
        break;
      }

      case '--retry-gitlab':
        result.gitlabRetryTag = inlineValue ?? next(args, index, '--retry-gitlab');
        if (inlineValue === undefined) index += 1;
        break;

      case '--retry-github':
        result.githubRetryTag = inlineValue ?? next(args, index, '--retry-github');
        if (inlineValue === undefined) index += 1;
        break;

      default:
        if (isType(arg) && result.release === undefined) {
          result.release = arg;
          break;
        }

        throw new ReleaseError('UNKNOWN_ARGUMENT', `Unknown argument: ${arg}`);
    }
  }
  if (result.gitlabRetryTag !== undefined && result.release !== undefined) {
    throw new ReleaseError(
      'CONFLICTING_ARGUMENTS',
      '--retry-gitlab cannot be combined with a release type.',
    );
  }
  if (result.githubRetryTag !== undefined && result.release !== undefined) {
    throw new ReleaseError(
      'CONFLICTING_ARGUMENTS',
      '--retry-github cannot be combined with a release type.',
    );
  }
  if (result.gitlabRetryTag !== undefined && result.githubRetryTag !== undefined) {
    throw new ReleaseError(
      'CONFLICTING_ARGUMENTS',
      '--retry-gitlab and --retry-github cannot be combined.',
    );
  }
  return result;
}
