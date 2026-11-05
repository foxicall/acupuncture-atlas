import path from 'node:path';

// Running npm's JS entry with Node avoids Windows .cmd shell handling while
// retaining argument arrays. npm run already provides its own npm_execpath.
export function npmCommand({
  platform = process.platform,
  execPath = process.execPath,
  npmExecPath = process.env.npm_execpath,
} = {}) {
  if (npmExecPath) return { bin: execPath, prefix: [npmExecPath] };
  if (platform === 'win32') {
    const cli = path.win32.join(path.win32.dirname(execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
    return { bin: execPath, prefix: [cli] };
  }
  return { bin: 'npm', prefix: [] };
}
