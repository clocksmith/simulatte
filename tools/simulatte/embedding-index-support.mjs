import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export function stableStringify(value) {
  return JSON.stringify(sortStable(value), null, 2);
}

export function sha256HexText(text) {
  return crypto.createHash('sha256').update(Buffer.from(String(text), 'utf8')).digest('hex');
}

export function indexHash(index) {
  const stable = { ...index };
  delete stable.indexHash;
  return { alg: 'sha256', hex: sha256HexText(stableStringify(stable)) };
}

export async function loadModelManifest({ modelBaseUrl, modelDir }) {
  if (modelBaseUrl) {
    const response = await fetch(`${modelBaseUrl}/manifest.json`);
    if (!response.ok) throw new Error(`Failed to fetch model manifest: ${response.status}`);
    const manifestText = await response.text();
    return { manifestText, manifest: JSON.parse(manifestText) };
  }
  const manifestPath = path.join(modelDir, 'manifest.json');
  const manifestText = await fs.readFile(manifestPath, 'utf8');
  return { manifestText, manifest: JSON.parse(manifestText) };
}

export function dopplerLoadSource(manifest, { modelBaseUrl, modelDir }) {
  if (modelBaseUrl) return { url: modelBaseUrl };
  return { manifest, baseUrl: modelDir };
}

export function finiteFloat32Array(value, label) {
  const vector = value instanceof Float32Array ? value : null;
  if (!vector) throw new Error(`${label}: expected Float32Array`);
  for (let index = 0; index < vector.length; index += 1) {
    if (!Number.isFinite(vector[index])) {
      throw new Error(`${label}: non-finite value at dim ${index}`);
    }
  }
  return vector;
}

export function expectedEmbeddingDim(manifest) {
  return Number(
    manifest?.inference?.output?.embeddingPostprocessor?.outputSize ||
    manifest?.architecture?.hiddenSize ||
    0
  );
}

function sortStable(value) {
  if (Array.isArray(value)) return value.map(sortStable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, sortStable(value[key])])
  );
}
