#!/usr/bin/env node
import { run } from '../index';

// Slice off `node` and script path
const exitCode = run(process.argv.slice(2));
process.exit(exitCode);
