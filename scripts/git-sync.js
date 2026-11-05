#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { npmCommand } from './npm-command.js';

const conventional = /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([a-zA-Z0-9._/-]+\))?!?: \S[^\r\n]*$/u;

export function parseArgs(args) {
  const options = { message: null, remote: null, branch: null, dryRun: false, status: false };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--status') options.status = true;
    else if (arg === '--remote' || arg === '--branch') {
      if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`Missing value for ${arg}`);
      options[arg.slice(2)] = args[++i];
    } else if (arg.startsWith('--')) throw new Error(`Unknown option: ${arg}`);
    else if (options.message === null) options.message = arg;
    else throw new Error('Pass the commit message as one quoted argument.');
  }
  options.message ??= `feat: update acupuncture atlas ${new Date().toISOString().slice(0, 10)}`;
  if (!conventional.test(options.message)) throw new Error('Use a Conventional Commit message, e.g. "feat: add acupoint focus".');
  if (options.remote && !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(options.remote)) throw new Error('Remote must be a configured Git remote name.');
  if (options.branch && (!/^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(options.branch) || options.branch.includes('..'))) {
    throw new Error('Invalid target branch name.');
  }
  return options;
}

// An argument array is used for every process. Commit text never enters a shell.
export function syncRepository(args, { cwd = process.cwd(), run = spawnSync, log = console.log } = {}) {
  const options = parseArgs(args);
  const command = (bin, argv, { quiet = false, optional = false } = {}) => {
    const result = run(bin, argv, { cwd, stdio: quiet ? 'pipe' : 'inherit', encoding: 'utf8', shell: false });
    if (result.error) throw new Error(`Could not run ${bin}: ${result.error.message}`);
    if (result.status !== 0 && !optional) throw new Error(`${bin} ${argv[0]} failed (exit ${result.status ?? 'signal'}).`);
    return result;
  };
  command('git', ['rev-parse', '--show-toplevel'], { quiet: true });
  const current = command('git', ['symbolic-ref', '--quiet', '--short', 'HEAD'], { quiet: true, optional: true });
  if (current.status !== 0 || !current.stdout?.trim()) throw new Error('Detached HEAD: check out a branch before syncing.');
  const currentBranch = current.stdout.trim();
  const upstream = command('git', ['for-each-ref', '--format=%(upstream:remotename)%00%(upstream:remoteref)', `refs/heads/${currentBranch}`], { quiet: true });
  const [upstreamRemote, upstreamRef] = (upstream.stdout || '').trim().split('\0');
  if (!options.remote && upstreamRemote === '.') throw new Error('The upstream is local-only. Specify --remote for a GitHub remote.');
  const remoteName = options.remote || upstreamRemote || 'origin';
  const branch = options.branch || (!options.remote && upstreamRef?.startsWith('refs/heads/') ? upstreamRef.slice('refs/heads/'.length) : currentBranch);
  command('git', ['check-ref-format', '--branch', branch], { quiet: true });
  const remote = command('git', ['remote', 'get-url', remoteName], { quiet: true, optional: true });
  if (remote.status !== 0) throw new Error(`Configure the Git remote "${remoteName}" before syncing.`);
  const status = command('git', ['status', '--porcelain=v1'], { quiet: true }).stdout || '';
  const setUpstream = !upstreamRemote || Boolean(options.branch || options.remote);
  const pushArgs = ['push'];
  if (setUpstream) pushArgs.push('--set-upstream');
  pushArgs.push(remoteName, `HEAD:refs/heads/${branch}`);
  if (options.status) {
    log(status.trim() || 'Working tree clean.');
    log(`Target: ${remoteName}/${branch}${setUpstream ? ' (upstream will be set on push)' : ''}`);
    return { mode: 'status', changed: Boolean(status.trim()) };
  }
  const npm = npmCommand();
  const checkArgs = [...npm.prefix, 'run', 'check'];
  const buildArgs = [...npm.prefix, 'run', 'build'];
  const plan = [
    [npm.bin, checkArgs], [npm.bin, buildArgs],
    ...(status.trim() ? [['git', ['add', '-A']], ['git', ['commit', '-m', options.message]]] : []),
    ['git', pushArgs],
  ];
  if (options.dryRun) {
    for (const [bin, argv] of plan) log(JSON.stringify([bin, ...argv]));
    return { mode: 'dry-run', changed: Boolean(status.trim()), plan };
  }
  log('Validating before staging and pushing…');
  command(npm.bin, checkArgs);
  command(npm.bin, buildArgs);
  // Validation may generate files: stage only after both checks have succeeded.
  const finalStatus = command('git', ['status', '--porcelain=v1'], { quiet: true }).stdout || '';
  if (finalStatus.trim()) {
    command('git', ['add', '-A']);
    command('git', ['commit', '-m', options.message]);
  } else log('No changes to commit; pushing any existing local commits.');
  command('git', pushArgs);
  log(`Synced to ${remoteName}/${branch}.`);
  return { mode: 'sync', changed: Boolean(finalStatus.trim()) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { syncRepository(process.argv.slice(2)); }
  catch (error) { console.error(`Sync failed: ${error.message}`); process.exitCode = 1; }
}
