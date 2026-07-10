const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');
test('Doppler execution-v1 config keeps Qwen reranker KV dtype aligned when f16 is not proven', async () => {
  const [{ compileExecutionV1 }, { EXECUTION_V1_SCHEMA_ID }] = await Promise.all([
    import(pathToFileURL(path.join(
      root,
      'public/vendor/doppler/src/inference/pipelines/text/execution-v1.js'
    )).href),
    import(pathToFileURL(path.join(
      root,
      'public/vendor/doppler/src/config/schema/index.js'
    )).href),
  ]);
  const conversion = JSON.parse(fs.readFileSync(
    path.join(
      root,
      'public/vendor/doppler/src/config/conversion/qwen3/qwen-3-reranker-0-6b-q4k-ehf16-af32.json'
    ),
    'utf8'
  ));
  const compiled = compileExecutionV1({
    manifestInference: {
      schema: EXECUTION_V1_SCHEMA_ID,
      session: conversion.session,
      execution: conversion.execution,
      attention: conversion.inference.attention,
      layerPattern: conversion.inference.layerPattern,
    },
    modelId: 'qwen-3-reranker-0-6b-q4k-ehf16-af32',
    numLayers: 28,
    headDim: 128,
    useGPU: true,
    kernelPathPolicy: {
      mode: 'capability-aware',
      onIncompatible: 'remap',
      sourceScope: ['manifest'],
    },
  });
  const kernelPath = compiled.runtimeInferencePatch.kernelPath;
  const attentionSteps = [
    ...(kernelPath.decode.steps || []),
    ...(kernelPath.prefill.steps || []),
  ].filter((step) => String(step.kernel || '').startsWith('attention'));

  assert.equal(compiled.session.kvcache.kvDtype, 'f32');
  assert.equal(compiled.runtimeInferencePatch.session.kvcache.kvDtype, 'f32');
  assert.equal(kernelPath.kvDtype, 'f32');
  assert.ok(compiled.appliedTransforms.includes('widenToF32Activations'));
  assert.ok(attentionSteps.length > 0);
  for (const step of attentionSteps) {
    assert.doesNotMatch(step.kernel, /_f16/);
    assert.equal(step.precision.activationDtype, 'f32');
    assert.equal(step.precision.kvDtype, 'f32');
  }
});
