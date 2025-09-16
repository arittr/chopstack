#!/usr/bin/env node

/* eslint-env node */
/* eslint-disable no-undef */

// Claude Code Slash Command: /stack
// Creates a git commit with automatic message and optionally creates a git-spice stack

const { execSync } = require('child_process');
const { join } = require('path');

// Path to the chopstack binary (assuming we're in project root/.claudeslash/)
const chopstackPath = join(__dirname, '..', 'dist', 'bin', 'chopstack.js');

try {
  // Parse command line arguments passed from Claude Code
  const args = process.argv.slice(2);

  // Build the chopstack stack command
  const chopstackCmd = ['node', chopstackPath, 'stack', ...args];

  console.log('🚀 Running chopstack stack command...');
  console.log(`💻 Command: ${chopstackCmd.join(' ')}`);
  console.log();

  // Execute the chopstack stack command
  execSync(chopstackCmd.join(' '), {
    stdio: 'inherit',
    cwd: join(__dirname, '..'), // Run from project root
  });

  console.log();
  console.log('✨ Stack command completed! You can now:');
  console.log('   • Continue making changes and use /stack again');
  console.log('   • Run `gs stack submit` to create pull requests');
  console.log('   • Or use `git log --oneline` to see your commits');
} catch (error) {
  console.error('❌ Failed to run stack command:');
  console.error(error.message);
  process.exit(1);
}
