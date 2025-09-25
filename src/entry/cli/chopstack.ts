#!/usr/bin/env node
import { run } from '@/cli';

// Slice off `node` and script path
const exitCode = await run(process.argv.slice(2));
process.exit(exitCode);
