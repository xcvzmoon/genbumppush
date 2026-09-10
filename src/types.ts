import type { SemverBumpType } from 'changelogen';

export const RELEASE_TYPES = [
  'major',
  'premajor',
  'minor',
  'preminor',
  'patch',
  'prepatch',
  'prerelease',
] as const satisfies readonly SemverBumpType[];
export type ReleaseType = (typeof RELEASE_TYPES)[number];
export type GitOptions = {
  remote?: string;
  push?: boolean;
  sign?: boolean;
  requireClean?: boolean;
  requireUpstream?: boolean;
  commitMessage?: string;
  tagName?: string;
  tagMessage?: string;
};

export type HookOptions = {
  before?: string | string[];
  after?: string | string[];
};

export type GitLabOptions = {
  enabled?: boolean;
  host?: string;
  project?: string;
  tokenEnv?: string;
  releaseName?: string;
};

export type GenBumpPushConfig = {
  release?: ReleaseType;
  preid?: string;
  files?: string[];
  recursive?: boolean;
  changelog?: boolean | string;
  excludeDependencyCommits?: boolean;
  git?: GitOptions;
  gitlab?: GitLabOptions;
  hooks?: HookOptions;
};

export type CliOptions = {
  cwd: string;
  configFile?: string;
  gitlabRetryTag?: string;
  release?: ReleaseType;
  preid?: string;
  dryRun: boolean;
  push?: boolean;
  yes: boolean;
  help: boolean;
};

export type ReleaseResult = {
  currentVersion: string;
  newVersion?: string;
  releaseType?: ReleaseType;
  tag?: string;
  pushed: boolean;
  dryRun: boolean;
  commitCount: number;
  gitlabReleaseCreated?: boolean;
};
