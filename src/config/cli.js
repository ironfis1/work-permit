import path from 'node:path';
import { loadConfigFile, ConfigValidationError } from './loadConfig.js';
import { resolveLocalRepo, RepoResolutionError } from './resolveLocal.js';
import { resolveGithubRepo, GithubResolutionError } from './resolveGithub.js';

/**
 * Registers the `config` command (and its `validate` subcommand) on the
 * given commander program.
 */
export function registerConfigCommand(program) {
  const configCommand = program.command('config').description('work-permit configuration commands');

  configCommand
    .command('validate')
    .description(
      'Load the work-permit config and confirm the target repo is reachable and readable (read access only).'
    )
    .option('-c, --config <path>', 'path to the config file', '.work-permit.json')
    .action(async (opts) => {
      const configPath = path.resolve(process.cwd(), opts.config);

      let config;
      try {
        config = loadConfigFile(configPath);
      } catch (err) {
        if (err instanceof ConfigValidationError) {
          console.error(`Config error${err.field ? ` (${err.field})` : ''}: ${err.message}`);
          process.exitCode = 1;
          return;
        }
        throw err;
      }

      try {
        if (config.targetRepoType === 'local-path') {
          const { resolvedPath } = resolveLocalRepo(config.targetRepo);
          console.log(`targetRepo resolved: ${resolvedPath}`);
        } else {
          const { fullName, defaultBranch } = await resolveGithubRepo(config.targetRepo);
          console.log(`targetRepo resolved: ${fullName} (default branch: ${defaultBranch})`);
        }
      } catch (err) {
        if (err instanceof RepoResolutionError || err instanceof GithubResolutionError) {
          console.error(`targetRepo error: ${err.message}`);
          process.exitCode = 1;
          return;
        }
        throw err;
      }

      console.log('Config is valid.');
    });

  return configCommand;
}
