#!/usr/bin/env node
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, realpath, rm, stat, rename, chmod } from 'node:fs/promises';
import { createHash, X509Certificate } from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { platform, arch, networkInterfaces } from 'node:os';
import { isIP } from 'node:net';
import { npmCommand } from './npm-command.js';
import { localHttpsConfig } from './local-https.js';

// SHA-256 digests from the official Cloudflare GitHub release assets API.
// https://api.github.com/repos/cloudflare/cloudflared/releases/tags/2026.10.7
const release = '2026.10.7';
const artifacts = {
  'linux-x64': ['cloudflared-linux-amd64', '1f99fb518b83dec2ba8d870a7cc991d82a77e6196295a3d2754ba17ab9f91872'],
  'linux-arm64': ['cloudflared-linux-arm64', '3df43aedc9ff291d1735b5cb576cb97e0b157488796db2e32b28aecabb445775'],
  'darwin-x64': ['cloudflared-darwin-amd64.tgz', '02f3edfd87684dd5b705607688e4eb4b323f6e777b81e7b3a85af556aa356848'],
  'darwin-arm64': ['cloudflared-darwin-arm64.tgz', '3586ccf397e98e5f437e60e7c307ca6ac463e110580503af8bb8e6f9ebf831bd'],
  'win32-x64': ['cloudflared-windows-amd64.exe', '2493dbc168923bb3e59e5e7716f71deced92992eea9acd6e9d74f84ac7751343'],
};
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream', '.woff2': 'font/woff2', '.md': 'text/markdown; charset=utf-8' };

export function parsePreviewArgs(args) {
  const options = { port: 4175, skipBuild: false, localOnly: false, tunnel: false, https: false, timeout: 60_000 };
  let explicitPort = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--skip-build') options.skipBuild = true;
    else if (args[i] === '--local-only') options.localOnly = true;
    else if (args[i] === '--tunnel') options.tunnel = true;
    else if (args[i] === '--https') options.https = true;
    else if (args[i] === '--cert' || args[i] === '--key') {
      const option = args[i].slice(2);
      if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`Missing value for --${option}`);
      options[option] = args[++i]; options.https = true;
    }
    else if (args[i] === '--port') { options.port = Number(args[++i]); explicitPort = true; }
    else if (args[i] === '--timeout') options.timeout = Number(args[++i]);
    else throw new Error(`Unknown option: ${args[i]}`);
  }
  if (options.https && !explicitPort) options.port = 8080;
  if (Boolean(options.cert) !== Boolean(options.key)) throw new Error('HTTPS requires both --cert and --key.');
  if (options.https && options.tunnel) throw new Error('Use --tunnel with the HTTP origin command (npm run mobile:tunnel), not --https.');
  if (!Number.isInteger(options.port) || options.port < 1024 || options.port > 65535) throw new Error('Port must be an integer from 1024 to 65535.');
  if (!Number.isInteger(options.timeout) || options.timeout < 1000 || options.timeout > 180_000) throw new Error('Timeout must be between 1000 and 180000 ms.');
  if (options.localOnly && options.tunnel) throw new Error('--local-only and --tunnel cannot be combined.');
  return options;
}

// Use actual local interfaces, never an example address or loopback QR code.
export function lanUrls(interfaces, port, protocol = 'http') {
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid LAN preview port.');
  if (!['http', 'https'].includes(protocol)) throw new Error('Invalid preview URL protocol.');
  const urls = new Set();
  for (const [name, addresses] of Object.entries(interfaces)) {
    // These virtual host/bridge adapters do not represent the shared Wi-Fi LAN.
    if (/^(?:lo\d*$|docker\d*$|veth|virbr|vboxnet|vmnet|br-|vEthernet)/i.test(name)) continue;
    for (const item of addresses || []) {
      if (item.internal || !['IPv4', 4].includes(item.family) || isIP(item.address) !== 4) continue;
      const octets = item.address.split('.').map(Number);
      if (octets[0] === 0 || octets[0] === 127 || octets[0] >= 224 || (octets[0] === 169 && octets[1] === 254)) continue;
      urls.add(`${protocol}://${item.address}:${port}/`);
    }
  }
  return [...urls];
}

export async function createLanPreview(port, { root = projectRoot, dist = path.join(projectRoot, 'dist'), https = false, cert, key, certDir, domains, host = '0.0.0.0' } = {}) {
  const { preview } = await import('vite');
  const ssl = https ? await localHttpsConfig({ root, cert, key, certDir, domains }) : { plugins: [], https: undefined };
  return preview({
    root, configFile: false, base: '/', logLevel: 'silent',
    plugins: ssl.plugins,
    build: { outDir: dist },
    preview: { host, port, strictPort: true, allowedHosts: ['localhost'], https: ssl.https },
  });
}

export function verifyChecksum(bytes, expected) {
  if (!/^[a-f0-9]{64}$/.test(expected)) throw new Error('Invalid expected SHA-256.');
  const actual = createHash('sha256').update(bytes).digest('hex');
  if (actual !== expected) throw new Error('Cloudflared SHA-256 verification failed. The artifact will not be executed.');
  return actual;
}

export function tunnelURL(message) {
  return message.match(/https:\/\/[a-z0-9]+(?:-[a-z0-9]+)*\.trycloudflare\.com\b/)?.[0] || null;
}

// Bind only to loopback. Cloudflared rewrites Host to this local listener.
// No application source, environment files or directory listings are exposed.
export async function createPreviewServer(dist, port) {
  const root = await realpath(dist);
  await stat(path.join(root, 'index.html'));
  const server = createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'no-cache');
    if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405, { Allow: 'GET, HEAD' }); response.end(); return; }
    const host = request.headers.host;
    if (![ `127.0.0.1:${port}`, `localhost:${port}` ].includes(host)) { response.writeHead(403); response.end('Forbidden host'); return; }
    try {
      const rawPath = decodeURIComponent((request.url || '/').split('?')[0]);
      if (rawPath.includes('\\') || rawPath.includes('\0') || rawPath.split('/').includes('..')) throw new Error('Unsafe path');
      const candidate = path.join(root, rawPath === '/' ? 'index.html' : rawPath);
      const file = await realpath(candidate);
      if (!file.startsWith(`${root}${path.sep}`)) throw new Error('Unsafe path');
      const info = await stat(file);
      if (!info.isFile()) { response.writeHead(404); response.end('Not found'); return; }
      response.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Content-Length': info.size });
      if (request.method === 'HEAD') response.end();
      else createReadStream(file).on('error', () => response.destroy()).pipe(response);
    } catch (error) { response.writeHead(error.code === 'ENOENT' ? 404 : 403); response.end('Not found'); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  return server;
}

async function runCommand(bin, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd: projectRoot, stdio: 'inherit', shell: false, ...options });
    child.once('error', reject);
    child.once('exit', (code, signal) => code === 0 ? resolve() : reject(new Error(`${bin} failed (${signal || code}).`)));
  });
}

export async function ensureCloudflared(signal) {
  const artifact = artifacts[`${platform()}-${arch()}`];
  if (!artifact) throw new Error(`No verified cloudflared artifact for ${platform()}/${arch()}.`);
  const [name, digest] = artifact;
  const dir = path.join(projectRoot, 'node_modules', '.cache', 'cloudflared', release);
  const archive = path.join(dir, name);
  await mkdir(dir, { recursive: true });
  let valid = false;
  try { verifyChecksum(await readFile(archive), digest); valid = true; } catch (error) { if (error.code !== 'ENOENT') await rm(archive, { force: true }); }
  if (!valid) {
    const temporary = `${archive}.download`;
    try {
      await runCommand(platform() === 'win32' ? 'curl.exe' : 'curl', ['--fail', '--location', '--show-error', '--silent', '--proto', '=https', '--tlsv1.2', '--max-time', '120', `https://github.com/cloudflare/cloudflared/releases/download/${release}/${name}`, '--output', temporary], { signal });
      verifyChecksum(await readFile(temporary), digest);
      await rename(temporary, archive);
    } finally { await rm(temporary, { force: true }); }
  }
  let binary = archive;
  if (name.endsWith('.tgz')) {
    // Extract exactly this member from the verified official archive.
    await rm(path.join(dir, 'cloudflared'), { force: true });
    await runCommand('tar', ['-xzf', archive, '-C', dir, 'cloudflared'], { signal });
    binary = path.join(dir, 'cloudflared');
  }
  if (platform() !== 'win32') await chmod(binary, 0o755);
  return binary;
}

export async function mobilePreview(args = process.argv.slice(2)) {
  const options = parsePreviewArgs(args);
  let server, tunnel, timer;
  let stopped = false;
  const controller = new AbortController();
  const cleanup = () => {
    if (stopped) return;
    stopped = true;
    clearTimeout(timer);
    controller.abort();
    tunnel?.kill('SIGTERM');
    server?.httpServer?.closeAllConnections?.();
    server?.close();
    process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop);
  };
  const stop = () => { cleanup(); process.exitCode = 0; };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  try {
    if (!options.skipBuild) {
      // Phone previews serve the site root, irrespective of deployment base.
      const npm = npmCommand();
      await runCommand(npm.bin, [...npm.prefix, 'run', 'build'], { env: { ...process.env, VITE_BASE_PATH: '/' }, signal: controller.signal });
    }
    const dist = path.join(projectRoot, 'dist');
    const html = await readFile(path.join(dist, 'index.html'), 'utf8');
    if (!html.includes('src="/assets/')) throw new Error('Build must use root VITE_BASE_PATH=/ for the phone preview.');
    if (options.localOnly && !options.https) {
      server = await createPreviewServer(dist, options.port);
      if (controller.signal.aborted) { server.close(); return; }
      console.log(`Loopback production preview listening on port ${options.port}. No phone URL or tunnel was created.`);
      return { server, urls: [], close: cleanup };
    }
    try {
      server = await createLanPreview(options.port, { dist, https: options.https, cert: options.cert, key: options.key, host: options.localOnly ? '127.0.0.1' : '0.0.0.0' });
    } catch (error) {
      if (/already in use|EADDRINUSE/i.test(error.message)) throw new Error(`Port ${options.port} is already in use. Keep the existing server or choose another port: npm run mobile:preview -- --port 8443`);
      throw error;
    }
    if (controller.signal.aborted) { await server.close(); return; }
    const protocol = options.https ? 'https' : 'http';
    console.log(`Vite production preview listening on ${protocol}://${options.localOnly ? '127.0.0.1' : '0.0.0.0'}:${options.port}. Existing dev servers are untouched.`);
    const urls = options.localOnly ? [] : lanUrls(networkInterfaces(), options.port, protocol);
    const qr = (await import('qrcode')).default;
    for (const address of urls) {
      console.log(`\n同 Wi-Fi 手機測試網址：${address}`);
      console.log(await qr.toString(address, { type: 'terminal', small: true }));
    }
    if (!urls.length) console.log(`本機測試網址：${protocol}://localhost:${options.port}/；沒有可供手機掃描的區網網址。`);
    if (options.https) {
      console.log('HTTPS 需手機信任憑證；僅點「繼續前往」不保證 Service Worker 或 PWA 安裝。請參閱 README 的 mkcert／手機信任步驟。');
      if (!options.cert) console.log('目前為 basic-ssl 自簽預覽憑證。區網 IP 的名稱驗證可能不符；完整 PWA 測試請用 --cert 與 --key 載入含該 IP SAN 的可信憑證。');
      const certificate = new X509Certificate(server.config.preview.https.cert);
      for (const address of urls) if (!certificate.checkIP(new URL(address).hostname)) console.log(`憑證未涵蓋此 IP：${new URL(address).hostname}；需要重新簽發含正確 IP SAN 的憑證。`);
    } else console.log('HTTP 區網網址供觸控與排版測試；PWA 安裝與離線快取需要 HTTPS。');
    console.log('容器 IP 不代表手機可連線。');
    console.log('雲端容器網路受限時，請於本機執行 npm run mobile:preview，並確保手機與電腦處於同一 Wi-Fi，或使用本機 ngrok/localtunnel 建立轉發');
    console.log('Ctrl+C 關閉此預覽。');
    if (!options.tunnel) return { server, urls, close: cleanup };
    const binary = await ensureCloudflared(controller.signal);
    if (controller.signal.aborted) return;
    console.log(`Cloudflared ${release}: official SHA-256 verified.`);
    let url, announced = false, output = '';
    const ready = new Promise((resolve, reject) => {
      const endpoint = `http://127.0.0.1:${options.port}`;
      tunnel = spawn(binary, ['tunnel', '--no-autoupdate', '--protocol', 'http2', '--url', endpoint, '--http-host-header', `127.0.0.1:${options.port}`], { cwd: projectRoot, stdio: ['ignore', 'pipe', 'pipe'], shell: false });
      tunnel.once('error', reject);
      tunnel.once('exit', (code, signal) => {
        if (!stopped && announced) { console.error(`Cloudflare tunnel disconnected (${signal || code}). Restart npm run mobile:preview to reconnect.`); process.exitCode = 1; }
        if (!stopped) reject(new Error(`Cloudflare tunnel stopped (${signal || code}). Check the API/edge error above. The host must permit Cloudflare quick-tunnel HTTPS API access and outbound TCP 7844; if unavailable in this cloud environment, run npm run mobile:preview on your local computer or deploy dist/ to an HTTPS host.`));
        cleanup();
      });
      const handle = chunk => {
        const message = chunk.toString();
        output = (output + message).slice(-12_000);
        url ||= tunnelURL(output);
        // A printed quick-tunnel URL precedes edge connectivity; wait for connection.
        if (url && output.includes('Registered tunnel connection') && !announced) {
          announced = true; clearTimeout(timer);
          console.log(`\n手機 HTTPS 實測網址：${url}\n保持此終端機開啟，手機掃描 QR Code：`);
          qr.toString(url, { type: 'terminal', small: true }).then(code => {
            console.log(code);
            console.log('首次載入後等待「離線教材已就緒」，再以 Safari 分享／Chrome 安裝選單加入主畫面。Ctrl+C 關閉預覽與隧道。');
            resolve(url);
          }, reject);
        }
        // Cloudflared diagnostics contain no app credentials; retain concise edge errors.
        if (/ERR|error|failed|timeout/i.test(message)) process.stderr.write(message);
      };
      tunnel.stdout.on('data', handle); tunnel.stderr.on('data', handle);
      timer = setTimeout(() => reject(new Error('Cloudflare edge connection timed out. This environment must permit outbound TCP 7844 for HTTP/2. Try this same command on a local computer with that access, or deploy dist/ to an HTTPS host.')), options.timeout);
    });
    await ready;
    return { url, urls, server, tunnel, close: cleanup };
  } catch (error) { const interrupted = stopped; cleanup(); if (interrupted && error.name === 'AbortError') return; throw error; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  mobilePreview().catch(error => { console.error(`Mobile preview failed: ${error.message}`); process.exitCode = 1; });
}
