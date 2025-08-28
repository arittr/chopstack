export type CliOptions = {
  help: boolean;
  version: boolean;
};

export function parseArgs(argv: readonly string[]): CliOptions {
  const flags = new Set(argv);
  return {
    help: flags.has('--help') || flags.has('-h'),
    version: flags.has('--version') || flags.has('-v'),
  };
}

export function run(argv: readonly string[]): number {
  const options = parseArgs(argv);

  if (options.help) {
    // Keep usage concise for now; expand as commands grow
    console.warn(
      [
        'chopstack — Chop massive AI changes into clean, reviewable PR stacks',
        '',
        'Usage:',
        '  chopstack [options]',
        '',
        'Options:',
        '  -h, --help       Show help',
        '  -v, --version    Show version',
        '',
      ].join('\n'),
    );
    return 0;
  }

  if (options.version) {
    // Keep in sync with package.json version until we wire JSON import
    console.warn('chopstack v0.1.0');
    return 0;
  }

  console.warn('chopstack CLI ready. Use --help to get started.');
  return 0;
}



