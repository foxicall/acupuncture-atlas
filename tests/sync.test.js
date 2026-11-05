import test from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs, syncRepository } from '../scripts/git-sync.js';

function fixture({ dirty = true, failBuild = false, detached = false, upstream = true, upstreamRemote = 'origin', upstreamBranch = 'main' } = {}) {
  const calls = [];
  return {
    calls,
    run(bin, args, options) {
      calls.push({ bin, args, options });
      assert.equal(options.shell, false);
      if (args[0] === 'symbolic-ref') return { status: detached ? 1 : 0, stdout: detached ? '' : 'main\n' };
      if (args[0] === 'status') return { status: 0, stdout: dirty ? '?? src/main.js\n' : '' };
      if (args[0] === 'for-each-ref') return { status: 0, stdout: upstream ? `${upstreamRemote}\0refs/heads/${upstreamBranch}\n` : '\0\n' };
      if (args.at(-2) === 'run' && args.at(-1) === 'build' && failBuild) return { status: 1, stdout: '' };
      return { status: 0, stdout: '' };
    },
    log() {},
  };
}

test('validates Conventional Commits and options before running commands', () => {
  for (const args of [['hello'], ['feat: x\nmalicious'], ['feat: x', '--remote', '-exec'], ['feat: x', '--branch', '../bad']]) {
    assert.throws(() => parseArgs(args));
  }
  assert.equal(parseArgs(['fix(viewer): handle touch']).message, 'fix(viewer): handle touch');
});

test('passes shell metacharacters literally in a single commit argument', () => {
  const fixtureRun = fixture();
  const message = 'feat: keep $(touch /tmp/unsafe) `echo command` "literal"';
  syncRepository([message], fixtureRun);
  const commit = fixtureRun.calls.find(({ args }) => args[0] === 'commit');
  assert.deepEqual(commit.args, ['commit', '-m', message]);
  assert.deepEqual(fixtureRun.calls.filter(({ args }) => args.at(-2) === 'run').map(({ args }) => args.slice(-2)), [['run', 'check'], ['run', 'build']]);
});

test('failed build prevents all staging, commits and pushes', () => {
  const fixtureRun = fixture({ failBuild: true });
  assert.throws(() => syncRepository(['feat: x'], fixtureRun), /failed/);
  assert.equal(fixtureRun.calls.some(({ args }) => ['add', 'commit', 'push'].includes(args[0])), false);
});

test('clean checkout still pushes pending local commits without creating an empty commit', () => {
  const fixtureRun = fixture({ dirty: false });
  syncRepository(['feat: x'], fixtureRun);
  assert.equal(fixtureRun.calls.some(({ args }) => ['add', 'commit'].includes(args[0])), false);
  assert.deepEqual(fixtureRun.calls.at(-1).args, ['push', 'origin', 'HEAD:refs/heads/main']);
});

test('missing upstream is established with a normal non-force push', () => {
  const fixtureRun = fixture({ upstream: false });
  syncRepository(['feat: x'], fixtureRun);
  assert.deepEqual(fixtureRun.calls.at(-1).args, ['push', '--set-upstream', 'origin', 'HEAD:refs/heads/main']);
});

test('dry run and status never build, stage, commit, or push', () => {
  for (const flag of ['--dry-run', '--status']) {
    const fixtureRun = fixture();
    syncRepository(['feat: x', flag], fixtureRun);
    assert.equal(fixtureRun.calls.some(({ bin, args }) => args.at(-2) === 'run' || ['add', 'commit', 'push'].includes(args[0])), false);
  }
});

test('detached HEAD fails before checks or changes', () => {
  const fixtureRun = fixture({ detached: true });
  assert.throws(() => syncRepository(['feat: x'], fixtureRun), /Detached HEAD/);
  assert.equal(fixtureRun.calls.some(({ args }) => args.at(-2) === 'run'), false);
});


test('default target follows actual upstream remote and branch instead of origin/local name', () => {
  const fixtureRun = fixture({ upstreamRemote: 'team', upstreamBranch: 'release/mobile' });
  syncRepository(['feat: x'], fixtureRun);
  assert.deepEqual(fixtureRun.calls.at(-1).args, ['push', 'team', 'HEAD:refs/heads/release/mobile']);
});

test('explicit target overrides upstream without forcing', () => {
  const fixtureRun = fixture({ upstreamRemote: 'team', upstreamBranch: 'release/mobile' });
  syncRepository(['feat: x', '--remote', 'origin', '--branch', 'review'], fixtureRun);
  assert.deepEqual(fixtureRun.calls.at(-1).args, ['push', '--set-upstream', 'origin', 'HEAD:refs/heads/review']);
});

test('a local-only upstream needs an explicit remote', () => {
  const fixtureRun = fixture({ upstreamRemote: '.' });
  assert.throws(() => syncRepository(['feat: x'], fixtureRun), /local-only/);
  assert.equal(fixtureRun.calls.some(({ args }) => args[0] === 'push'), false);
});

test('legacy module keeps the same exported API', async () => {
  const legacy = await import('../scripts/git-push.js');
  assert.equal(legacy.syncRepository, syncRepository);
  assert.equal(legacy.parseArgs, parseArgs);
});
