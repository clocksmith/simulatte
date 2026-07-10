import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const MODEL_RUNTIME_LOCK_PATH = path.join(
  ROOT,
  'public',
  'data',
  'simulatte-embedder',
  'model-runtime-lock.json'
);

export function readModelRuntimeLock() {
  return JSON.parse(fs.readFileSync(MODEL_RUNTIME_LOCK_PATH, 'utf8'));
}

export function modelRuntimeLockHash() {
  return crypto.createHash('sha256').update(fs.readFileSync(MODEL_RUNTIME_LOCK_PATH)).digest('hex');
}

export function modelRuntimeLockReference(artifact) {
  const lock = readModelRuntimeLock();
  const number = Number(lock.number);
  if (!lock.id || !Number.isInteger(number) || number < 1) {
    throw new Error('model runtime lock requires an id and positive number');
  }
  return {
    id: lock.id,
    number,
    artifact: String(artifact || ''),
    artifactHash: {
      alg: 'sha256',
      hex: modelRuntimeLockHash(),
    },
  };
}

export function lockedEmbeddingModel() {
  const embedding = readModelRuntimeLock().embedding || {};
  if (!embedding.id || !embedding.defaultModelBaseUrl || !embedding.manifestHash?.hex) {
    throw new Error('model runtime lock embedding pin is incomplete');
  }
  return embedding;
}
