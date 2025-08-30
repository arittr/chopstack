import { match } from 'ts-pattern';

import type { AgentType, DecomposeOptions } from './types/decomposer';

import { decomposeCommand } from './commands/decompose';
import { isNonEmptyString } from './utils/guards';

export type CliOptions = {
  command?: string;
  help: boolean;
  version: boolean;
};

export type ParsedCommand =
  | { type: 'help' }
  | { type: 'version' }
  | { options: DecomposeOptions; type: 'decompose' }
  | { type: 'unknown' };

export function parseArgs(argv: readonly string[]): ParsedCommand {
  const args = [...argv];

  // Handle global flags first
  if (args.includes('--help') || args.includes('-h')) {
    return { type: 'help' };
  }

  if (args.includes('--version') || args.includes('-v')) {
    return { type: 'version' };
  }

  // Handle commands
  const command = args[0];

  return match(command)
    .with('decompose', () => parseDecomposeCommand(args.slice(1)))
    .with(undefined, () => ({ type: 'help' as const }))
    .otherwise(() => ({ type: 'unknown' as const }));
}

function parseDecomposeCommand(args: readonly string[]): ParsedCommand {
  let spec = '';
  let agent: AgentType = 'claude';
  let output: string | undefined;
  let verbose = false;

  for (let index = 0; index < args.length; index++) {
    const argument = args[index];

    switch (argument) {
      case '--spec': {
        spec = args[index + 1] ?? '';
        index++; // Skip next argument
        break;
      }
      case '--agent': {
        const agentValue = args[index + 1];
        if (agentValue === 'claude' || agentValue === 'aider' || agentValue === 'mock') {
          agent = agentValue as AgentType;
        }
        index++; // Skip next argument
        break;
      }
      case '--output': {
        output = args[index + 1];
        index++; // Skip next argument
        break;
      }
      case '--verbose':
      case '-v': {
        verbose = true;
        break;
      }
      case undefined: {
        // Handle undefined case explicitly
        break;
      }
    }
  }

  if (spec.length === 0) {
    throw new Error('--spec option is required for decompose command');
  }

  const options: DecomposeOptions = {
    agent,
    spec,
    verbose,
  };

  if (isNonEmptyString(output)) {
    options.output = output;
  }

  return {
    type: 'decompose' as const,
    options,
  };
}

export async function run(argv: readonly string[]): Promise<number> {
  try {
    const command = parseArgs(argv);

    return await match(command)
      .with({ type: 'help' }, () => {
        console.log(
          [
            'chopstack — Chop massive AI changes into clean, reviewable PR stacks',
            '',
            'Usage:',
            '  chopstack <command> [options]',
            '',
            'Commands:',
            '  decompose    Decompose a spec into parallelizable tasks',
            '',
            'Decompose Options:',
            '  --spec <file>        Path to specification file (required)',
            '  --agent <type>       Agent to use: claude|aider (default: claude)',
            '  --output <file>      Output file for plan (optional, defaults to stdout)',
            '  --verbose, -v        Verbose output',
            '',
            'Global Options:',
            '  -h, --help          Show help',
            '  -v, --version       Show version',
            '',
            'Examples:',
            '  chopstack decompose --spec spec.md --agent claude',
            '  chopstack decompose --spec feature.md --agent aider --output plan.yaml',
            '',
          ].join('\n'),
        );
        return 0;
      })
      .with({ type: 'version' }, () => {
        console.log('chopstack v0.1.0');
        return 0;
      })
      .with({ type: 'decompose' }, async (cmd) => decomposeCommand(cmd.options))
      .with({ type: 'unknown' }, () => {
        console.error('Unknown command. Use --help for usage information.');
        return 1;
      })
      .exhaustive();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Error: ${message}`);
    return 1;
  }
}
