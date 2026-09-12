export const ENV = {
  GITHUB_TOKEN: 'GENBUMPPUSH_GITHUB_TOKEN',
  GITHUB_HOST: 'GENBUMPPUSH_GITHUB_HOST',
  GITHUB_REPOSITORY: 'GENBUMPPUSH_GITHUB_REPOSITORY',
  GITLAB_TOKEN: 'GENBUMPPUSH_GITLAB_TOKEN',
  GITLAB_HOST: 'GENBUMPPUSH_GITLAB_HOST',
  GITLAB_PROJECT: 'GENBUMPPUSH_GITLAB_PROJECT',
} as const;

export function readEnv(name: string): string | undefined {
  const value = process.env[name];
  return value !== undefined && value.length > 0 ? value : undefined;
}

export function readEnvFirst(...names: readonly string[]): string | undefined {
  for (const name of names) {
    const value = readEnv(name);
    if (value !== undefined) return value;
  }
  return undefined;
}
