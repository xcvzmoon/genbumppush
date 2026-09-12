import type { GitCommit, ResolvedChangelogConfig } from 'changelogen';
import type {
  CliOptions,
  GenBumpPushConfig,
  GitHubOptions,
  GitLabOptions,
  ReleaseResult,
} from './types.ts';
import {
  determineSemverChange,
  generateMarkDown,
  getGitDiff,
  loadChangelogConfig,
  parseCommits,
} from 'changelogen';
import { existsSync, readFileSync } from 'node:fs';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { loadReleaseConfig } from './config.ts';
import { ReleaseError } from './error.ts';
import { git, isGitRepository, remoteTagExists, runHook, tagExists } from './git.ts';
import { createGitHubRelease, resolveGitHubRepo, resolveGitHubToken } from './github.ts';
import { createGitLabRelease, releaseNotes } from './gitlab.ts';
import {
  applyVersionChanges,
  planVersionChanges,
  resolveRepositoryPath,
  restoreVersionChanges,
} from './version-files.ts';
import { bumpVersion } from './version.ts';

const render = (value: string, version: string) => value.replaceAll('{{version}}', version);
const list = (value?: string | string[]) =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];

function isObject(value: unknown): value is object {
  return value !== null && Object(value) === value && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return Object.prototype.toString.call(value) === '[object String]';
}

type GitLabContext = {
  host: string;
  project: string;
  token: string;
  releaseName?: string;
};

function gitLabContext(config: GitLabOptions | undefined): GitLabContext {
  if (config?.enabled !== true) {
    throw new ReleaseError('GITLAB_RELEASE_FAILED', 'Enable gitlab before creating a release.');
  }

  const tokenEnv = config.tokenEnv ?? 'GITLAB_TOKEN';
  const token = process.env[tokenEnv];
  const project = config.project ?? process.env.GITLAB_PROJECT;
  if (token === undefined || token.length === 0) {
    throw new ReleaseError('GITLAB_RELEASE_FAILED', `Set ${tokenEnv} to create a GitLab release.`);
  }
  if (project === undefined || project.length === 0) {
    throw new ReleaseError(
      'GITLAB_RELEASE_FAILED',
      'Set gitlab.project or GITLAB_PROJECT to create a GitLab release.',
    );
  }

  const context: GitLabContext = {
    host: config.host ?? process.env.GITLAB_HOST ?? 'https://gitlab.com',
    project,
    token,
  };
  if (config.releaseName !== undefined) context.releaseName = config.releaseName;
  return context;
}

type GitHubContext = {
  host: string;
  repo: string;
  token: string;
  releaseName?: string;
};

function resolveGitHubContext(
  config: GitHubOptions | undefined,
  cwd: string,
): Promise<GitHubContext> {
  if (config?.enabled !== true) {
    throw new ReleaseError('GITHUB_RELEASE_FAILED', 'Enable github before creating a release.');
  }

  const token = resolveGitHubToken(config.tokenEnv);
  if (token === undefined) {
    const label = config.tokenEnv ?? 'GITHUB_TOKEN';
    throw new ReleaseError('GITHUB_RELEASE_FAILED', `Set ${label} to create a GitHub release.`);
  }

  return resolveGitHubRepo(cwd, {
    host: config.host,
    repo: config.repo,
  }).then(({ host, repo }) => {
    const context: GitHubContext = { host, repo, token };
    if (config.releaseName !== undefined) context.releaseName = config.releaseName;
    return context;
  });
}

async function changelogText(cwd: string, config: GenBumpPushConfig): Promise<string> {
  if (config.changelog === false) return '';
  const configured =
    config.changelog === true ? 'CHANGELOG.md' : (config.changelog ?? 'CHANGELOG.md');
  const path = await resolveRepositoryPath(cwd, configured);
  return existsSync(path) ? readFile(path, 'utf8') : '';
}

async function publishGitLab(
  context: GitLabContext,
  cwd: string,
  config: GenBumpPushConfig,
  tag: string,
  version: string,
): Promise<void> {
  await createGitLabRelease({
    host: context.host,
    project: context.project,
    token: context.token,
    tag,
    name: context.releaseName?.replaceAll('{{version}}', version) ?? tag,
    description: releaseNotes(await changelogText(cwd, config), tag),
  });
}

async function publishGitHub(
  context: GitHubContext,
  cwd: string,
  config: GenBumpPushConfig,
  tag: string,
  version: string,
): Promise<void> {
  await createGitHubRelease({
    host: context.host,
    repo: context.repo,
    token: context.token,
    tag,
    name: context.releaseName?.replaceAll('{{version}}', version) ?? tag,
    description: releaseNotes(await changelogText(cwd, config), tag),
  });
}

function filter(
  commits: GitCommit[],
  config: ResolvedChangelogConfig,
  exclude: boolean,
): GitCommit[] {
  return commits.filter((commit) => {
    const type = config.types[commit.type.toLowerCase()];
    return (
      type !== undefined &&
      type !== false &&
      !(exclude && commit.type === 'chore' && commit.scope === 'deps' && !commit.isBreaking)
    );
  });
}

async function collect(cwd: string, config: GenBumpPushConfig) {
  const changelog = await loadChangelogConfig(cwd);
  const commits = parseCommits(await getGitDiff(changelog.from, changelog.to, cwd), changelog);
  for (const commit of commits) {
    commit.type = commit.type.toLowerCase();
  }

  return {
    changelog,
    commits: filter(commits, changelog, config.excludeDependencyCommits !== false),
  };
}

async function confirm(message: string): Promise<boolean> {
  const input = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return /^y(es)?$/i.test((await input.question(`${message} (y/N) `)).trim());
  } finally {
    input.close();
  }
}

async function prepend(path: string, markdown: string): Promise<void> {
  const current = existsSync(path) ? await readFile(path, 'utf8') : '# Changelog\n';
  const match = current.match(/^# .+$/m);
  const offset = match?.index === undefined ? 0 : match.index + match[0].length;
  const prefix = current.slice(0, offset).trimEnd();
  const suffix = current.slice(offset).trim();
  await writeFile(
    path,
    `${prefix}${prefix ? '\n\n' : ''}${markdown.trim()}${suffix ? `\n\n${suffix}` : ''}\n`,
  );
}

function packageVersion(cwd: string): string {
  const data: unknown = JSON.parse(readFileSync(resolve(cwd, 'package.json'), 'utf8'));

  if (!isObject(data) || !('version' in data) || !isString(data.version)) {
    throw new ReleaseError('INVALID_PACKAGE', 'package.json must contain a version string.');
  }

  return data.version;
}
export async function runRelease(options: CliOptions): Promise<ReleaseResult> {
  const overrides: GenBumpPushConfig = {};

  if (options.release !== undefined) overrides.release = options.release;
  if (options.preid !== undefined) overrides.preid = options.preid;
  if (options.push !== undefined) overrides.git = { push: options.push };

  const config = await loadReleaseConfig(options.cwd, options.configFile, overrides);
  const cwd = options.cwd;

  if (!isGitRepository(cwd)) {
    throw new ReleaseError('NOT_A_REPOSITORY', `${cwd} is not a Git repository.`);
  }

  const currentVersion = packageVersion(cwd);
  if (options.gitlabRetryTag !== undefined) {
    const context = gitLabContext(config.gitlab);
    const remote = config.git?.remote ?? 'origin';
    if (!remoteTagExists(cwd, remote, options.gitlabRetryTag)) {
      throw new ReleaseError(
        'GITLAB_RELEASE_FAILED',
        `Tag ${options.gitlabRetryTag} does not exist on ${remote}.`,
      );
    }
    await publishGitLab(context, cwd, config, options.gitlabRetryTag, currentVersion);
    return {
      currentVersion,
      tag: options.gitlabRetryTag,
      pushed: true,
      dryRun: false,
      commitCount: 0,
      gitlabReleaseCreated: true,
    };
  }

  if (options.githubRetryTag !== undefined) {
    const context = await resolveGitHubContext(config.github, cwd);
    const remote = config.git?.remote ?? 'origin';
    if (!remoteTagExists(cwd, remote, options.githubRetryTag)) {
      throw new ReleaseError(
        'GITHUB_RELEASE_FAILED',
        `Tag ${options.githubRetryTag} does not exist on ${remote}.`,
      );
    }
    await publishGitHub(context, cwd, config, options.githubRetryTag, currentVersion);
    return {
      currentVersion,
      tag: options.githubRetryTag,
      pushed: true,
      dryRun: false,
      commitCount: 0,
      githubReleaseCreated: true,
    };
  }

  if (config.git?.requireClean !== false && git(['status', '--porcelain'], cwd) !== '') {
    throw new ReleaseError('DIRTY_WORKTREE', 'Commit or stash all changes before releasing.');
  }

  const branch = git(['branch', '--show-current'], cwd);
  if (branch === '') {
    throw new ReleaseError('DETACHED_HEAD', 'Releases require a checked-out branch.');
  }

  const push = config.git?.push !== false;
  if (push && config.git?.requireUpstream !== false) {
    git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'], cwd);
  }

  const { changelog, commits } = await collect(cwd, config);
  const detected = config.release ?? determineSemverChange(commits, changelog);
  if (detected === null) {
    return { currentVersion, pushed: false, dryRun: options.dryRun, commitCount: 0 };
  }

  const releaseType = detected;
  console.info(`Release: v${currentVersion} → ${releaseType} (${commits.length} commits)`);

  const plannedVersion = bumpVersion(currentVersion, releaseType, config.preid);
  const plannedTag = render(config.git?.tagName ?? 'v{{version}}', plannedVersion);

  if (options.dryRun) {
    console.info(`Dry run: v${currentVersion} → v${plannedVersion} (${plannedTag})`);
    console.info(await generateMarkDown(commits, changelog));

    return {
      currentVersion,
      newVersion: plannedVersion,
      releaseType,
      tag: plannedTag,
      pushed: false,
      dryRun: true,
      commitCount: commits.length,
    };
  }

  let gitlab: GitLabContext | undefined;
  if (config.gitlab?.enabled === true) {
    if (!push) {
      throw new ReleaseError(
        'GITLAB_RELEASE_FAILED',
        'GitLab release creation requires git.push to be enabled.',
      );
    }
    gitlab = gitLabContext(config.gitlab);
  }

  let github: GitHubContext | undefined;
  if (config.github?.enabled === true) {
    if (!push) {
      throw new ReleaseError(
        'GITHUB_RELEASE_FAILED',
        'GitHub release creation requires git.push to be enabled.',
      );
    }
    github = await resolveGitHubContext(config.github, cwd);
  }

  if (!options.yes && !(await confirm(`Create a ${releaseType} release?`))) {
    throw new ReleaseError('CANCELLED', 'Release cancelled.');
  }

  const version = plannedVersion;
  const tag = plannedTag;
  const remote = config.git?.remote ?? 'origin';

  if (tagExists(cwd, tag) || (push && remoteTagExists(cwd, remote, tag))) {
    throw new ReleaseError('TAG_EXISTS', `Tag ${tag} already exists.`);
  }

  for (const command of list(config.hooks?.before)) {
    runHook(command, cwd);
  }

  const changes = await planVersionChanges(cwd, currentVersion, version, config);
  const changed = changes.map((change) => change.path);

  let changelogSnapshot:
    | {
        path: string;
        existed: boolean;
        content?: string;
      }
    | undefined;

  if (config.changelog !== false) {
    const changelogOutput =
      config.changelog === true ? 'CHANGELOG.md' : (config.changelog ?? 'CHANGELOG.md');
    const path = await resolveRepositoryPath(cwd, changelogOutput);
    const existed = existsSync(path);

    changelogSnapshot = { path, existed };
    if (existed) changelogSnapshot.content = await readFile(path, 'utf8');

    changed.push(path);
  }
  const indexTree = git(['write-tree'], cwd);
  try {
    await applyVersionChanges(changes);

    if (changelogSnapshot !== undefined) {
      await prepend(
        changelogSnapshot.path,
        await generateMarkDown(commits, { ...changelog, newVersion: version }),
      );
    }

    git(['add', '--', ...[...new Set(changed)].map((path) => relative(cwd, path))], cwd);

    const commitArgs = ['commit'];
    if (config.git?.sign === true) commitArgs.push('-S');

    commitArgs.push(
      '-m',
      render(config.git?.commitMessage ?? 'chore(release): v{{version}}', version),
    );

    git(commitArgs, cwd);
  } catch (error) {
    await restoreVersionChanges(changes);

    if (changelogSnapshot?.content !== undefined) {
      await writeFile(changelogSnapshot.path, changelogSnapshot.content);
    } else if (changelogSnapshot !== undefined && existsSync(changelogSnapshot.path)) {
      await unlink(changelogSnapshot.path);
    }

    git(['read-tree', indexTree], cwd);

    throw error;
  }

  const tagArgs = ['tag', '-a'];
  if (config.git?.sign === true) tagArgs.push('-s');

  tagArgs.push(tag, '-m', render(config.git?.tagMessage ?? 'v{{version}}', version));
  git(tagArgs, cwd);
  if (push) git(['push', '--atomic', remote, `HEAD:${branch}`, `refs/tags/${tag}`], cwd);

  let gitlabReleaseCreated = false;
  if (gitlab !== undefined) {
    try {
      await publishGitLab(gitlab, cwd, config, tag, version);
      gitlabReleaseCreated = true;
    } catch (error) {
      throw new ReleaseError(
        'RELEASE_PUBLISHED_GITLAB_FAILED',
        `Git release ${tag} was pushed, but GitLab release creation failed. Retry with: genbumppush --retry-gitlab ${tag}`,
        { cause: error },
      );
    }
  }

  let githubReleaseCreated = false;
  if (github !== undefined) {
    try {
      await publishGitHub(github, cwd, config, tag, version);
      githubReleaseCreated = true;
    } catch (error) {
      throw new ReleaseError(
        'RELEASE_PUBLISHED_GITHUB_FAILED',
        `Git release ${tag} was pushed, but GitHub release creation failed. Retry with: genbumppush --retry-github ${tag}`,
        { cause: error },
      );
    }
  }

  for (const command of list(config.hooks?.after)) {
    runHook(command, cwd);
  }

  const result: ReleaseResult = {
    currentVersion,
    newVersion: version,
    releaseType,
    tag,
    pushed: push,
    dryRun: false,
    commitCount: commits.length,
  };
  if (gitlabReleaseCreated) result.gitlabReleaseCreated = true;
  if (githubReleaseCreated) result.githubReleaseCreated = true;
  return result;
}
