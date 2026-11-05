#!/usr/bin/env node
// Backward-compatible entry point. New integrations should use git-sync.js.
import { pathToFileURL } from 'node:url';
import { syncRepository } from './git-sync.js';
export { parseArgs, syncRepository } from './git-sync.js';

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { syncRepository(process.argv.slice(2)); }
  catch (error) { console.error(`Sync failed: ${error.message}`); process.exitCode = 1; }
}
