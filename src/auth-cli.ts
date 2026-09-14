import { spawnSync } from 'node:child_process';

/**
 * Spawns a host CLI and returns stdout, or `undefined` when the binary is
 * missing, exits non-zero, or prints nothing. Never log the return value —
 * it may be a live credential.
 */
export type CliRunner = (bin: string, args: readonly string[]) => string | undefined;

const CLI_TIMEOUT_MS = 5_000;

function spawnCapture(bin: string, args: readonly string[]): string | undefined {
  const result = spawnSync(bin, [...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: CLI_TIMEOUT_MS,
  });
  if (result.error || result.status !== 0) return undefined;
  const stdout = result.stdout;
  if (typeof stdout !== 'string' || stdout.trim().length === 0) return undefined;
  return stdout;
}

/** First non-empty stdout line — what `gh auth token` prints. */
export const runCli: CliRunner = (bin, args) => {
  const stdout = spawnCapture(bin, args);
  if (stdout === undefined) return undefined;
  return (
    stdout
      .split('\n')
      .map((value) => value.trim())
      .find((value) => value.length > 0) ?? undefined
  );
};

/** Full stdout — required for multi-line `glab auth status` output. */
export const runCliFullOutput: CliRunner = spawnCapture;

/** Strip protocol/path so CLIs receive a bare hostname. */
export function hostnameFromHost(host: string): string {
  return (
    host
      .replace(/^https?:\/\//, '')
      .replace(/\/$/, '')
      .split('/')[0] ?? host
  );
}

function isPublicGitHubHost(host: string | undefined): boolean {
  if (host === undefined) return true;
  const hostname = hostnameFromHost(host).toLowerCase();
  return hostname === '' || hostname === 'github.com' || hostname === 'api.github.com';
}

function isUsableToken(token: string | undefined): token is string {
  // Masked status output (`****`) is not a credential.
  return token !== undefined && token.length > 0 && !token.includes('*');
}

/**
 * `gh auth token` prints the active account token for github.com, or for
 * a GHES host when `--hostname` is set.
 *
 * Early-return so the enterprise path is narrowed to `string` without `!`.
 */
export function getGitHubCliToken(host?: string, run: CliRunner = runCli): string | undefined {
  if (host === undefined || isPublicGitHubHost(host)) {
    const token = run('gh', ['auth', 'token']);
    return isUsableToken(token) ? token : undefined;
  }

  const token = run('gh', ['auth', 'token', '--hostname', hostnameFromHost(host)]);
  return isUsableToken(token) ? token : undefined;
}

/**
 * Extract a token from `glab auth status --show-token` human-readable output.
 * Prefers the first non-masked `Token:` value.
 */
export function parseGitLabAuthToken(status: string): string | undefined {
  for (const match of status.matchAll(/Token:\s*(\S+)/gi)) {
    const token = match[1];
    if (isUsableToken(token)) return token;
  }
  return undefined;
}

/**
 * `glab` has no `gh auth token` equivalent. `--show-token` embeds the
 * credential in status text; parse it and treat anything unusable as missing.
 */
export function getGitLabCliToken(
  host?: string,
  run: CliRunner = runCliFullOutput,
): string | undefined {
  const args: string[] = ['auth', 'status', '--show-token'];
  if (host !== undefined) {
    const hostname = hostnameFromHost(host);
    if (hostname.length > 0) args.push('--hostname', hostname);
  }
  const status = run('glab', args);
  if (status === undefined) return undefined;
  return parseGitLabAuthToken(status);
}
