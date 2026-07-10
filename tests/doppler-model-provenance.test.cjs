const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');

test('Doppler computes and preserves manifest SHA-256 provenance on model handles', async () => {
  const modelSourceUrl = pathToFileURL(path.join(
    root,
    'public/vendor/doppler/src/client/runtime/model-source.js'
  )).href;
  const modelSessionUrl = pathToFileURL(path.join(
    root,
    'public/vendor/doppler/src/client/runtime/model-session.js'
  )).href;
  const [{ sha256ManifestText }, { createModelHandle }] = await Promise.all([
    import(modelSourceUrl),
    import(modelSessionUrl),
  ]);
  const manifestText = '{"modelId":"pinned-model","modelType":"embedding"}\n';
  const expectedHash = crypto.createHash('sha256').update(manifestText).digest('hex');
  assert.equal(await sha256ManifestText(manifestText), expectedHash);

  const manifest = { modelId: 'pinned-model', modelType: 'embedding' };
  const pipeline = { manifest, isLoaded: true };
  const handle = createModelHandle(pipeline, {
    modelId: manifest.modelId,
    manifestHash: expectedHash,
  });
  assert.equal(handle.modelId, 'pinned-model');
  assert.equal(handle.manifestHash, expectedHash);
  assert.deepEqual(handle.manifest, manifest);

  const loaderSource = fs.readFileSync(path.join(
    root,
    'public/vendor/doppler/src/client/runtime/index.js'
  ), 'utf8');
  const modelSource = fs.readFileSync(path.join(
    root,
    'public/vendor/doppler/src/client/runtime/model-source.js'
  ), 'utf8');
  const generatorSource = fs.readFileSync(path.join(
    root,
    'public/vendor/doppler/src/inference/pipelines/text/generator.js'
  ), 'utf8');
  assert.match(loaderSource, /manifestHash:\s*manifestPayload\.manifestHash/);
  assert.match(modelSource, /manifestHash:\s*await sha256ManifestText\(text\)/);
  assert.match(generatorSource, /if \(options\.__skipStateSnapshot\)/);
});

test('Doppler single embeddings reset sequence state before and after every call', async () => {
  const pipelineUrl = pathToFileURL(path.join(
    root,
    'public/vendor/doppler/src/inference/pipelines/text.js'
  )).href;
  const { InferencePipeline } = await import(pipelineUrl);
  let sequenceLength = 9;
  let resetCount = 0;
  const target = {
    resetForBatch() {
      sequenceLength = 0;
      resetCount += 1;
    },
    async prefillWithEmbedding(prompt, options) {
      assert.equal(prompt, 'stable prompt');
      assert.equal(sequenceLength, 0);
      assert.equal(options.__skipStateSnapshot, true);
      sequenceLength = 4;
      return {
        embedding: Float32Array.from([1, 0]),
        tokens: [1, 2, 3, 4],
        seqLen: sequenceLength,
        embeddingMode: 'last',
      };
    },
  };

  const result = await InferencePipeline.prototype.embed.call(target, 'stable prompt');
  assert.deepEqual(Array.from(result.embedding), [1, 0]);
  assert.equal(result.seqLen, 4);
  assert.equal(resetCount, 2);
  assert.equal(sequenceLength, 0);
});
