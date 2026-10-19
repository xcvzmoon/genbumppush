import type { RawGitCommit } from './types.ts';
import { git } from '../git.ts';

export function getLastGitTag(cwd: string): string | undefined {
  try {
    return git(['describe', '--tags', '--abbrev=0'], cwd).split('\n').at(-1);
  } catch {
    return undefined;
  }
}

export function getCurrentGitRef(cwd: string): string {
  return (
    git(['tag', '--points-at', 'HEAD'], cwd) || git(['rev-parse', '--abbrev-ref', 'HEAD'], cwd)
  );
}

/** Preserve symmetric-difference ranges and name-status bodies from the original collector. */
export function getGitDiff(from: string | undefined, to = 'HEAD', cwd: string): RawGitCommit[] {
  const result = git(
    [
      '--no-pager',
      'log',
      `${from ? `${from}...` : ''}${to}`,
      '--pretty=%x00%s%x00%h%x00%an%x00%ae%x00%b',
      '--name-status',
    ],
    cwd,
  );
  const fields = result.split('\0');
  const commits: RawGitCommit[] = [];
  for (let index = 1; index + 4 < fields.length; index += 5) {
    const [message = '', shortHash = '', name = '', email = '', body = ''] = fields.slice(
      index,
      index + 5,
    );
    commits.push({ message, shortHash, author: { name, email }, body });
  }
  return commits;
}
