import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStaticSiteServer } from './simulatte/static-site-server.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, '..');
const publicRoot = path.join(appRoot, 'public');
const workspaceRoot = path.resolve(appRoot, '..');
const dopplerRoot = path.join(workspaceRoot, 'doppler');

const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 4173);

const server = createStaticSiteServer({
  publicRoot,
  mounts: [{ prefix: '/doppler/', root: dopplerRoot }],
});

server.listen(port, host, () => {
  console.log(`Simulatte local server listening on http://${host}:${port}/`);
});
