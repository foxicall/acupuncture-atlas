import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { npmCommand } from './npm-command.js';

const root = fileURLToPath(new URL('../', import.meta.url));
export function androidBuildSteps({ syncOnly = false, platform = process.platform, projectRoot = root } = {}) {
  const npm = npmCommand({ platform });
  const android = path.join(projectRoot, 'android');
  const gradleArgs = ['assembleDebug', '--no-daemon', '--max-workers=2', '--stacktrace'];
  return [
    { bin: npm.bin, args: [...npm.prefix, 'run', 'build'], cwd: projectRoot, env: { VITE_BASE_PATH: '/' } },
    { bin: process.execPath, args: [path.join(projectRoot, 'node_modules/@capacitor/cli/bin/capacitor'), 'sync', 'android'], cwd: projectRoot },
    { bin: process.execPath, args: [path.join(projectRoot, 'scripts/verify-native-assets.js')], cwd: projectRoot },
    ...(!syncOnly ? [platform === 'win32'
      ? { bin: 'cmd.exe', args: ['/d', '/s', '/c', `gradlew.bat ${gradleArgs.join(' ')}`], cwd: android }
      : { bin: 'sh', args: ['./gradlew', ...gradleArgs], cwd: android }] : []),
  ];
}

export function buildAndroid(args = [], { run = spawnSync, log = console.log } = {}) {
  if (args.some(arg => arg !== '--sync-only') || args.length > 1) throw new Error('Usage: node scripts/build-android.js [--sync-only]');
  for (const step of androidBuildSteps({ syncOnly: args.includes('--sync-only') })) {
    const result = run(step.bin, step.args, { cwd: step.cwd, env: { ...process.env, ...step.env }, stdio: 'inherit', shell: false });
    if (result.error || result.status !== 0) throw new Error(`Android build step failed: ${path.basename(step.bin)} ${step.args.slice(-3).join(' ')} (${result.error?.message || result.status}). Check JDK 21 and Android SDK 36 / Build Tools 35.0.0.`);
  }
  if (args.includes('--sync-only')) log('Android web assets built, synced and verified.');
  else log('APK: android/app/build/outputs/apk/debug/app-debug.apk');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { buildAndroid(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
