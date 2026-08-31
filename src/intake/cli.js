import path from 'node:path';
import { loadConfigFile, ConfigValidationError } from '../config/loadConfig.js';
import { resolveIntakeInput, IntakeInputError } from './readInput.js';
import { writeIntake, listIntakes, IntakeValidationError } from './store.js';

function loadTargetRepo(configOpt) {
  const configPath = path.resolve(process.cwd(), configOpt);
  return loadConfigFile(configPath).targetRepo;
}

function reportConfigError(err) {
  console.error(`Config error${err.field ? ` (${err.field})` : ''}: ${err.message}`);
  process.exitCode = 1;
}

/**
 * Registers the `intake` command (and its `list` subcommand) on the
 * given commander program. Story 1.3: captures a raw goal/vision
 * statement as a versioned, timestamped artifact for Epic 2's
 * decomposition engine to consume later -- no interpretation of the
 * text happens here.
 */
export function registerIntakeCommand(program) {
  const intakeCommand = program
    .command('intake')
    .description('Capture a goal/vision statement as a versioned intake artifact')
    .option('-c, --config <path>', 'path to the config file', '.work-permit.json')
    .option('-t, --text <text>', 'goal/vision text supplied directly on the command line')
    .option('-f, --file <path>', 'path to a file containing the goal/vision text')
    .action(async (opts) => {
      let targetRepo;
      try {
        targetRepo = loadTargetRepo(opts.config);
      } catch (err) {
        if (err instanceof ConfigValidationError) {
          reportConfigError(err);
          return;
        }
        throw err;
      }

      let input;
      try {
        input = await resolveIntakeInput({ text: opts.text, file: opts.file });
      } catch (err) {
        if (err instanceof IntakeInputError) {
          console.error(`Intake input error: ${err.message}`);
          process.exitCode = 1;
          return;
        }
        throw err;
      }

      try {
        const { filePath, artifact } = writeIntake({
          text: input.text,
          source: input.source,
          targetRepo,
        });
        console.log(`Intake captured: ${artifact.intakeId}`);
        console.log(`  source: ${artifact.source}`);
        console.log(`  stored: ${filePath}`);
      } catch (err) {
        if (err instanceof IntakeValidationError) {
          console.error(`Intake error: ${err.message}`);
          process.exitCode = 1;
          return;
        }
        throw err;
      }
    });

  intakeCommand
    .command('list')
    .description('List prior intakes for the current targetRepo, most recent first')
    .option('-c, --config <path>', 'path to the config file', '.work-permit.json')
    .action((opts) => {
      let targetRepo;
      try {
        targetRepo = loadTargetRepo(opts.config);
      } catch (err) {
        if (err instanceof ConfigValidationError) {
          reportConfigError(err);
          return;
        }
        throw err;
      }

      const intakes = listIntakes({ targetRepo });
      if (intakes.length === 0) {
        console.log('No intakes found.');
        return;
      }

      for (const intake of intakes) {
        const collapsed = intake.text.trim().replace(/\s+/g, ' ');
        const preview = collapsed.length > 80 ? `${collapsed.slice(0, 80)}...` : collapsed;
        console.log(`${intake.intakeId}  ${intake.timestamp}  [${intake.source}]  ${preview}`);
      }
    });

  return intakeCommand;
}
