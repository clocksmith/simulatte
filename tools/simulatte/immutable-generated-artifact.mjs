import fs from 'node:fs';
import path from 'node:path';

function writeImmutableGeneratedArtifact(file, bytes, label) {
  const nextBytes = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  if (fs.existsSync(file)) {
    const existingBytes = fs.readFileSync(file);
    if (!existingBytes.equals(nextBytes)) {
      throw new Error(`Immutable artifact ${label} already exists with different bytes; bump its ID, content version, and output path`);
    }
    return 'unchanged';
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, nextBytes);
  return 'created';
}

export { writeImmutableGeneratedArtifact };
