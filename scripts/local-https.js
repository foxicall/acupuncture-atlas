import basicSsl from '@vitejs/plugin-basic-ssl';
import { readFile, mkdir } from 'node:fs/promises';
import { X509Certificate, createPrivateKey } from 'node:crypto';
import path from 'node:path';
import { hostname } from 'node:os';

/** Both preview and development use the same certificate settings. */
export async function localHttpsConfig({ root, cert, key, certDir, domains = [] }) {
  if (Boolean(cert) !== Boolean(key)) throw new Error('HTTPS requires both --cert and --key.');
  if (cert && key) {
    const [certificate, privateKey] = await Promise.all([readFile(path.resolve(cert)), readFile(path.resolve(key))]);
    const x509 = new X509Certificate(certificate);
    if (!x509.checkPrivateKey(createPrivateKey(privateKey))) throw new Error('HTTPS certificate and private key do not match.');
    // basic-ssl overwrites supplied certificates in configResolved, so use only
    // the provided CA-signed certificate when this explicit option is chosen.
    return { plugins: [], https: { cert: certificate, key: privateKey }, mode: 'provided' };
  }
  const directory = path.resolve(certDir || path.join(root, '.certs', 'basic-ssl'));
  await mkdir(directory, { recursive: true, mode: 0o700 });
  return {
    plugins: [basicSsl({ name: 'Acupuncture Atlas local preview', certDir: directory, domains: [...new Set(['localhost', hostname(), `${hostname()}.local`, ...domains])] })],
    https: {}, mode: 'basic-ssl',
  };
}
