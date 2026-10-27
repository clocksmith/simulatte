import {pbkdf2} from 'node:crypto';
import {promisify} from 'node:util';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import privateCrypto from '../../public/simulatte/system-diagram/private-crypto.js';

export const LOCAL_COLLECTION_PATH = '/__lucyd-local__/session';
const derive = promisify(pbkdf2);
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

// This handler exists only in the developer server, never in the hosting bundle.
export async function createLocalCollectionHandler({publicRoot, password}) {
  let body = null;
  if (password) {
    const envelope = JSON.parse(await readFile(path.join(publicRoot, 'data/system-diagram/private-collection.enc.json'), 'utf8'));
    const {salt} = privateCrypto.validate(envelope);
    const bytes = await derive(password, salt, envelope.kdf.iterations, 32, 'sha256');
    const key = bytes.toString('base64'); bytes.fill(0);
    const session = await privateCrypto.unlockWithKey(envelope, key);
    session.lock(); // Authenticate before making the local capability available.
    body = JSON.stringify({envelope, key});
  }
  return function handleLocalCollection(request, response) {
    try { if (new URL(request.url, 'http://localhost').pathname !== LOCAL_COLLECTION_PATH) return false; }
    catch { return false; }
    const headers = {'Content-Type': 'application/json', 'Cache-Control': 'no-store',
      'Cross-Origin-Resource-Policy': 'same-origin', 'X-Content-Type-Options': 'nosniff'};
    let allowed = false;
    try {
      const origin = new URL('http://' + request.headers.host);
      allowed = LOOPBACK.has(request.socket.remoteAddress) && LOOPBACK.has(request.socket.localAddress) &&
        HOSTS.has(origin.hostname) && Number(origin.port || 80) === request.socket.localPort &&
        (!request.headers.origin || request.headers.origin === origin.origin) &&
        (!request.headers['sec-fetch-site'] || request.headers['sec-fetch-site'] === 'same-origin') &&
        request.headers['x-lucyd-local'] === '1';
    } catch { /* Malformed host headers never receive the local capability. */ }
    const status = !allowed ? 403 : request.method !== 'GET' ? 405 : !body ? 404 : 200;
    response.writeHead(status, headers);
    response.end(status === 200 ? body : JSON.stringify({error: status === 404 ? 'Local collection is not configured.' : 'Local collection request refused.'}));
    return true;
  };
}
