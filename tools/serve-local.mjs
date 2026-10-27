import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {createServer} from 'node:http';
import {readFile, stat} from 'node:fs/promises';
import {homedir} from 'node:os';
import { createStaticSiteHandler } from './simulatte/static-site-server.mjs';
import {createLocalCollectionHandler} from './simulatte/lucyd-local-collection.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, '..');
const publicRoot = path.join(appRoot, 'public');
const workspaceRoot = path.resolve(appRoot, '..');
const dopplerRoot = path.join(workspaceRoot, 'doppler');

const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 4173);

const passwordFile = process.env.LUCYD_PASSWORD_FILE || path.join(homedir(), '.local/state/deco/lucyd-local/password');
let password = process.env.LUCYD_PASSWORD;
if (!password) {
  try {
    const info = await stat(passwordFile);
    if (info.mode & 0o077) throw Error('Lucyd local password file must be accessible only to its owner (chmod 600).');
    password = (await readFile(passwordFile, 'utf8')).trimEnd();
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
if (password && !['127.0.0.1', 'localhost', '::1'].includes(host)) throw Error('Lucyd local study access requires a loopback-only HOST.');
const localCollection = await createLocalCollectionHandler({publicRoot, password});
password = undefined;
const staticSite = createStaticSiteHandler({
  publicRoot,
  mounts: [{ prefix: '/doppler/', root: dopplerRoot }],
});
const server = createServer((request, response) => {
  if (!localCollection(request, response)) staticSite(request, response);
});

server.listen(port, host, () => {
  console.log(`Simulatte local server listening on http://${host}:${port}/`);
});
