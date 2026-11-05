import test from 'node:test';
import assert from 'node:assert/strict';
import { npmCommand } from '../scripts/npm-command.js';

test('Windows npm run uses Node and npm_execpath with spaces kept as one argument', () => {
  const command = npmCommand({ platform: 'win32', execPath: 'C:\\Program Files\\nodejs\\node.exe', npmExecPath: 'C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js' });
  assert.deepEqual(command, { bin: 'C:\\Program Files\\nodejs\\node.exe', prefix: ['C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js'] });
  assert.deepEqual([...command.prefix, 'run', 'build'], ['C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js', 'run', 'build']);
});

test('direct Windows node entry resolves npm-cli.js beside Node rather than spawning npm.cmd', () => {
  assert.deepEqual(npmCommand({ platform: 'win32', execPath: 'C:\\node\\node.exe', npmExecPath: null }), { bin: 'C:\\node\\node.exe', prefix: ['C:\\node\\node_modules\\npm\\bin\\npm-cli.js'] });
});

test('POSIX npm run respects the npm CLI injected by the current toolchain', () => {
  assert.deepEqual(npmCommand({ platform: 'linux', execPath: '/opt/node/bin/node', npmExecPath: '/opt/node/lib/node_modules/npm/bin/npm-cli.js' }), { bin: '/opt/node/bin/node', prefix: ['/opt/node/lib/node_modules/npm/bin/npm-cli.js'] });
});

test('direct POSIX node entry preserves npm from PATH', () => {
  assert.deepEqual(npmCommand({ platform: 'linux', execPath: '/usr/bin/node', npmExecPath: null }), { bin: 'npm', prefix: [] });
});
