'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os'), http = require('node:http');
const C = require('../public/simulatte/system-diagram/private-crypto.js');
const password = 'synthetic-local-password';
const value = {schema: 'synthetic-private-fixture', title: 'Sensitive local fixture'};

test('only local same-origin capability requests can open the collection; disabled servers keep it locked', async t => {
  const {createLocalCollectionHandler, LOCAL_COLLECTION_PATH} = await import('../tools/simulatte/lucyd-local-collection.mjs');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'lucyd-local-'));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  await fs.mkdir(path.join(root, 'data/system-diagram'), {recursive: true});
  const envelope = await C.encrypt(value, password);
  await fs.writeFile(path.join(root, 'data/system-diagram/private-collection.enc.json'), JSON.stringify(envelope));
  const handler = await createLocalCollectionHandler({publicRoot: root, password});
  const disabled = await createLocalCollectionHandler({publicRoot: root});
  let enabled = true;
  const server = http.createServer((req, res) => {
    if (!(enabled ? handler : disabled)(req, res)) {res.writeHead(404); res.end();}
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = {'X-Lucyd-Local': '1'};
  const response = await fetch(base + LOCAL_COLLECTION_PATH, {headers});
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('access-control-allow-origin'), null);
  const payload = await response.json();
  assert.equal(JSON.stringify(payload).includes(value.title), false);
  assert.equal(JSON.stringify(payload).includes(password), false);
  const session = await C.unlockWithKey(payload.envelope, payload.key);
  assert.deepEqual(session.value, value); session.lock();
  for (const extra of [{}, {Origin: 'https://other.example', ...headers}, {Host: 'attacker.example', ...headers}, {'Sec-Fetch-Site': 'cross-site', ...headers}]) {
    const status = await new Promise((resolve, reject) => {
      http.get(base + LOCAL_COLLECTION_PATH, {headers: extra}, res => {res.resume(); resolve(res.statusCode);}).on('error', reject);
    });
    assert.equal(status, 403, JSON.stringify(Object.keys(extra)));
  }
  assert.equal((await fetch(base + LOCAL_COLLECTION_PATH, {method: 'POST', headers})).status, 405);
  enabled = false;
  assert.equal((await fetch(base + LOCAL_COLLECTION_PATH, {headers})).status, 404);
  await assert.rejects(createLocalCollectionHandler({publicRoot: root, password: 'incorrect'}), /Incorrect password/);

  // A reverse proxy or LAN connection must not gain access through a localhost Host header.
  for (const address of ['192.168.1.20', '100.65.1.2']) {
    let status;
    handler({url: LOCAL_COLLECTION_PATH, method: 'GET', headers: {host: `localhost:${server.address().port}`, 'x-lucyd-local': '1'},
      socket: {remoteAddress: address, localAddress: '127.0.0.1', localPort: server.address().port}},
    {writeHead(code) {status = code;}, end() {}});
    assert.equal(status, 403);
  }
});
