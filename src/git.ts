import { execFileSync, spawnSync } from 'node:child_process';
import { ReleaseError } from './error.ts';

export function git(args: string[], cwd: string): string {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (error) {
    throw new ReleaseError('GIT_COMMAND_FAILED', `git ${args.join(' ')} failed.`, {
      cause: error,
    });
  }
}

export function tagExists(cwd: string, tag: string): boolean {
  return (
    spawnSync('git', ['rev-parse', '--verify', '--quiet', `refs/tags/${tag}`], {
      cwd,
      stdio: 'ignore',
    }).status === 0
  );
}

export function isGitRepository(cwd: string): boolean {
  return (
    spawnSync('git', ['rev-parse', '--is-inside-work-tree'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).stdout.trim() === 'true'
  );
}

export function remoteTagExists(cwd: string, remote: string, tag: string): boolean {
  return git(['ls-remote', '--tags', remote, `refs/tags/${tag}`], cwd).length > 0;
}

export function runHook(command: string, cwd: string): void {
  const result = spawnSync(command, { cwd, shell: true, stdio: 'inherit' });
  if (result.status !== 0) throw new ReleaseError('HOOK_FAILED', `Hook failed: ${command}`);
}
