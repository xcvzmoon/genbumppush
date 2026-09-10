#!/usr/bin/env node
import { HELP_TEXT, parseCliOptions } from './cli.ts';
import { ReleaseError } from './error.ts';
import { runRelease } from './release.ts';

try {
  const options = parseCliOptions(process.argv.slice(2));
  if (options.help) {
    console.info(HELP_TEXT);
  } else {
    const result = await runRelease(options);
    if (result.gitlabReleaseCreated) {
      console.info(`GitLab release ${result.tag ?? ''} created.`);
    } else if (result.releaseType === undefined) {
      console.info('No releasable commits found.');
    } else if (!result.dryRun) {
      console.info(
        `${result.tag ?? result.releaseType} created${result.pushed ? ' and pushed' : ''}.`,
      );
    }
  }
} catch (error) {
  if (error instanceof ReleaseError) console.error(`[${error.code}] ${error.message}`);
  else console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
