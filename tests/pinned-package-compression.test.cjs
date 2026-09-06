const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, before } = require('node:test');
const { gzipSync } = require('node:zlib');
let restorePinnedCompression;
before(async () => { ({ restorePinnedCompression } = await import('../tools/pinned-package-compression.mjs')); });

const identity = bytes => ({ integrity: `sha512-${crypto.createHash('sha512').update(bytes).digest('base64')}`, shasum: crypto.createHash('sha1').update(bytes).digest('hex') });
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pinned-compression-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const tar = Buffer.from('identical source and tar metadata\n'.repeat(100));
  const original = gzipSync(tar, { level: 9 });
  const packed = gzipSync(tar, { level: 1 });
  assert.notDeepEqual(original, packed);
  const pin = { name: 'fixture', version: '1.0.0', ...identity(original) };
  const hex = Buffer.from(pin.integrity.slice(7), 'base64').toString('hex');
  const cacheFile = path.join(root, '_cacache/content-v2/sha512', hex.slice(0, 2), hex.slice(2, 4), hex.slice(4));
  fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
  fs.writeFileSync(cacheFile, original);
  const archive = path.join(root, 'candidate.tgz');
  fs.writeFileSync(archive, packed);
  return { root, tar, original, packed, pin, archive, cacheFile, entry: identity(packed) };
}
test('different gzip compression reuses only the authenticated pin with identical tar bytes', t => {
  const f = fixture(t);
  const result = restorePinnedCompression(f.entry, f.archive, f.pin, f.root);
  assert.equal(result.integrity, f.pin.integrity);
  assert.deepEqual(fs.readFileSync(f.archive), f.original);
});
test('matching archive needs no cache', t => {
  const f = fixture(t);
  fs.writeFileSync(f.archive, f.original);
  fs.unlinkSync(f.cacheFile);
  assert.equal(restorePinnedCompression(f.pin, f.archive, f.pin, f.root), f.pin);
});
test('changed source bytes cannot be normalized into the pin', t => {
  const f = fixture(t);
  const changed = gzipSync(Buffer.concat([f.tar, Buffer.from('tampered')]));
  fs.writeFileSync(f.archive, changed);
  assert.throws(() => restorePinnedCompression(identity(changed), f.archive, f.pin, f.root), /tar bytes differ/);
  assert.deepEqual(fs.readFileSync(f.archive), changed);
});
test('corrupt and missing cached artifacts fail closed', t => {
  const f = fixture(t);
  fs.writeFileSync(f.cacheFile, f.packed);
  assert.throws(() => restorePinnedCompression(f.entry, f.archive, f.pin, f.root), /Cached npm archive/);
  fs.unlinkSync(f.cacheFile);
  assert.throws(() => restorePinnedCompression(f.entry, f.archive, f.pin, f.root), /absent from the npm cache/);
});
test('pack metadata must identify the actual candidate bytes', t => {
  const f = fixture(t);
  assert.throws(() => restorePinnedCompression(f.pin, f.archive, f.pin, f.root), /metadata does not match/);
});
