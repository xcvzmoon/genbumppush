/** Internal compatibility types for the changelogen 0.6.2 pipeline. */
export type StableBump = 'major' | 'minor' | 'patch';
export type CommitAuthor = { name: string; email: string };
export type RawGitCommit = {
  message: string;
  shortHash: string;
  author: CommitAuthor;
  body: string;
};
export type Reference = { type: 'hash' | 'issue' | 'pull-request'; value: string };
export type GitCommit = RawGitCommit & {
  authors: CommitAuthor[];
  description: string;
  type: string;
  scope: string;
  references: Reference[];
  isBreaking: boolean;
};
export type RepoConfig = { domain?: string; repo?: string; provider?: string };
export type TypeConfig = { title: string; semver?: string };
export type ChangelogConfig = {
  cwd: string;
  types: Record<string, TypeConfig | boolean | undefined>;
  scopeMap: Record<string, string | undefined>;
  repo?: RepoConfig | string;
  from?: string;
  to: string;
  newVersion?: string;
  output: string | boolean;
  templates: { commitMessage?: string; tagMessage?: string; tagBody: string };
  noAuthors: boolean;
  excludeAuthors: string[];
  hideAuthorEmail?: boolean;
};
export type ResolvedChangelogConfig = Omit<ChangelogConfig, 'repo'> & { repo?: RepoConfig };
