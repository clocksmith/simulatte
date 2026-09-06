import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';

const digest = (bytes, algorithm, encoding) => crypto.createHash(algorithm).update(bytes).digest(encoding);

// zlib releases can encode the same npm tar archive differently. Keep the
// original compressed pin authoritative: only reuse its authenticated bytes
// after proving that the newly packed, pinned source has the identical tar.
export function restorePinnedCompression(entry, archivePath, pin, cacheRoot) {
  const packed = fs.readFileSync(archivePath);
  const integrity = `sha512-${digest(packed, 'sha512', 'base64')}`;
  const shasum = digest(packed, 'sha1', 'hex');
  if (entry.integrity !== integrity || entry.shasum !== shasum) {
    throw new Error('npm pack metadata does not match the generated archive bytes');
  }
  if (integrity === pin.integrity && shasum === pin.shasum) return entry;
  if (!/^sha512-[A-Za-z0-9+/]{86}==$/.test(pin.integrity || '')) {
    throw new Error('Pinned npm archive requires a SHA-512 integrity');
  }
  const hex = Buffer.from(pin.integrity.slice(7), 'base64').toString('hex');
  const cachedPath = path.join(cacheRoot, '_cacache', 'content-v2', 'sha512', hex.slice(0, 2), hex.slice(2, 4), hex.slice(4));
  if (!fs.existsSync(cachedPath)) {
    throw new Error(`Package compression differs and the authenticated pinned archive is absent from the npm cache: ${pin.name}@${pin.version} (${pin.integrity})`);
  }
  const original = fs.readFileSync(cachedPath);
  if (`sha512-${digest(original, 'sha512', 'base64')}` !== pin.integrity
      || digest(original, 'sha1', 'hex') !== pin.shasum) {
    throw new Error('Cached npm archive does not match the pinned integrity and shasum');
  }
  if (!gunzipSync(original).equals(gunzipSync(packed))) {
    throw new Error('Packed source tar bytes differ from the authenticated pinned npm archive');
  }
  fs.writeFileSync(archivePath, original);
  return { ...entry, integrity: pin.integrity, shasum: pin.shasum, size: original.length };
}
