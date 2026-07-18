const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

test('generated autonomy evidence cannot overwrite an existing identity', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'simulatte-autonomy-artifact-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'evidence-v1.json');
  const { writeImmutableGeneratedArtifact } = await import('../tools/autonomy/immutable-generated-artifact.mjs');

  assert.equal(writeImmutableGeneratedArtifact(file, '{"value":1}\n', 'evidence-v1'), 'created');
  assert.equal(writeImmutableGeneratedArtifact(file, '{"value":1}\n', 'evidence-v1'), 'unchanged');
  assert.throws(
    () => writeImmutableGeneratedArtifact(file, '{"value":2}\n', 'evidence-v1'),
    /bump its ID, content version, and output path/,
  );
  assert.equal(fs.readFileSync(file, 'utf8'), '{"value":1}\n');
});
