import test from 'node:test';
import assert from 'node:assert/strict';
import { androidBuildSteps, buildAndroid } from '../scripts/build-android.js';

test('native assets always build from root even when the caller deploys Web to a Pages subpath', () => {
  const steps = androidBuildSteps({ syncOnly: true });
  assert.equal(steps[0].env.VITE_BASE_PATH, '/');
  assert.equal(steps.length, 3);
  assert.deepEqual(steps[1].args.slice(-2), ['sync', 'android']);
  assert.match(steps[2].args[0], /verify-native-assets\.js$/);
});
test('Windows and POSIX use the checked-in Gradle wrapper without npx installation or shell interpolation', () => {
  assert.deepEqual(androidBuildSteps({ platform: 'win32' }).at(-1).args, ['/d', '/s', '/c', 'gradlew.bat assembleDebug --no-daemon --max-workers=2 --stacktrace']);
  assert.equal(androidBuildSteps({ platform: 'linux' }).at(-1).bin, 'sh');
  assert.match(androidBuildSteps({ platform: 'linux' }).at(-1).cwd, /android$/);
});
test('failed Web build or sync stops before Gradle can package stale assets', () => {
  for (const failAt of [1, 2, 3]) {
    const calls = [];
    assert.throws(() => buildAndroid([], { run: (bin, args, options) => { calls.push({ bin, args, options }); return { status: calls.length === failAt ? 1 : 0 }; }, log() {} }), /build step failed/);
    assert.equal(calls.length, failAt);
    assert.ok(calls.every(call => call.options.shell === false));
  }
});
test('invalid build flags are rejected before mutation', () => {
  assert.throws(() => buildAndroid(['--force'], { run() { throw new Error('must not run'); } }), /Usage/);
});
