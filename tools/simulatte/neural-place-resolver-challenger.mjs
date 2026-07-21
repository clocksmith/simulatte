import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { doppler } from '../../public/vendor/doppler/src/index.js';
import { bootstrapNodeWebGPU } from '../../public/vendor/doppler/src/tooling/node-webgpu.js';
import { lockedEmbeddingModel, modelRuntimeLockHash, readModelRuntimeLock } from '../model-runtime-lock-utils.mjs';

const require = createRequire(import.meta.url);
const core = require('../../public/simulatte/runtime/neural-place-resolution-core.js');
const missionApi = require('../../public/simulatte/mission/mission-compiler.js');
const TOOL_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(TOOL_DIR, '../..');
const INDEX_PATH = path.join(ROOT, 'public/data/simulatte/place-embedding-index-v1.json');
const DOPPLER_ENTRY_PATH = path.join(ROOT, 'public/vendor/doppler/src/index.js');

export async function createResolver({ world, embodiment }) {
  const lock = readModelRuntimeLock();
  const modelLock = lockedEmbeddingModel();
  const indexBytes = await fs.readFile(INDEX_PATH);
  const index = JSON.parse(indexBytes.toString('utf8'));
  const decodedIndex = core.decodeIndex(index);
  const eligibleNodeIds = missionApi.eligiblePlaceNodeIds(world, embodiment.kind);
  const eligibleNodeIdSet = new Set(eligibleNodeIds);
  const eligibleDocuments = decodedIndex.documents.filter((row) => eligibleNodeIdSet.has(row.nodeId));
  if (decodedIndex.model.id !== modelLock.id || decodedIndex.model.manifestSha256 !== modelLock.manifestHash.hex) {
    throw new Error('Place embedding index model identity differs from the runtime lock');
  }
  const gpu = await bootstrapNodeWebGPU();
  if (!gpu.ok) throw new Error(`Node WebGPU unavailable: ${gpu.detail || gpu.provider || 'unknown'}`);
  const model = await doppler.load({ url: modelLock.defaultModelBaseUrl }, {});
  const lexical = createLexicalResolver(world, embodiment);
  let policy = { ...core.POLICY };

  async function resolveMany(probes) {
    const results = new Array(probes.length);
    const neuralRows = [];
    probes.forEach((probe, indexInProbes) => {
      const lexicalResult = lexical(probe);
      if (lexicalResult.outcome === 'resolve') results[indexInProbes] = lexicalResult;
      else {
        const queryText = core.extractPlaceQuery(probe.sourceText, probe.role);
        const typoResult = core.resolveExtendedTypo(queryText, eligibleDocuments);
        if (typoResult.outcome === 'resolve') {
          results[indexInProbes] = {
            outcome: 'resolve',
            nodeId: typoResult.nodeId,
            evidence: {
              lane: 'extended_typo',
              queryText,
              policy: core.TYPO_POLICY,
              maximumDistance: typoResult.maximumDistance,
              distanceMargin: typoResult.distanceMargin,
              ranking: typoResult.ranking,
            },
          };
        } else if (!queryText) results[indexInProbes] = { outcome: 'refuse', evidence: { lane: 'neural', refusalReason: 'query_not_extracted' } };
        else neuralRows.push({ probe, indexInProbes, queryText, typoResult });
      }
    });
    if (neuralRows.length) {
      const prefix = lock.runtime?.embeddingText?.queryPrefix || '';
      const suffix = lock.runtime?.embeddingText?.querySuffix || '';
      const outputs = await model.embedBatch(neuralRows.map((row) => `${prefix}${row.queryText}${suffix}`), {
        useChatTemplate: false,
        embeddingMode: lock.runtime?.queryEmbeddingMode || modelLock.indexEmbeddingMode,
        __skipStateSnapshot: true,
      });
      neuralRows.forEach((row, outputIndex) => {
        const ranking = core.rankVector(outputs[outputIndex].embedding, decodedIndex, core.POLICY.maximumCandidates, eligibleNodeIds);
        const decision = core.decideRanking(ranking, policy);
        results[row.indexInProbes] = {
          outcome: decision.outcome,
          nodeId: decision.nodeId,
          evidence: {
            lane: 'qwen_embedding_cosine',
            queryText: row.queryText,
            modelId: modelLock.id,
            indexId: decodedIndex.id,
            topSimilarity: decision.topSimilarity,
            margin: decision.margin,
            refusalReason: decision.refusalReason,
            ranking: decision.ranking,
            policy,
            extendedTypo: row.typoResult,
          },
        };
      });
    }
    return results;
  }

  return {
    id: 'hybrid-lexical-qwen-embedding-v1',
    identities: {
      placeEmbeddingIndex: {
        path: 'public/data/simulatte/place-embedding-index-v1.json',
        id: index.id,
        sha256: crypto.createHash('sha256').update(indexBytes).digest('hex'),
        indexSha256: index.indexSha256,
      },
      modelRuntimeLock: {
        path: 'public/data/simulatte-embedder/model-runtime-lock.json',
        id: lock.id,
        number: lock.number,
        sha256: modelRuntimeLockHash(),
      },
      dopplerRuntime: {
        path: 'public/vendor/doppler/src/index.js',
        gitSha: lock.doppler.development.gitSha,
        sha256: crypto.createHash('sha256').update(await fs.readFile(DOPPLER_ENTRY_PATH)).digest('hex'),
      },
      model: {
        id: modelLock.id,
        manifestSha256: modelLock.manifestHash.hex,
        sourceRevision: modelLock.source.revision,
      },
      semanticSnapshot: structuredClone(index.identities.placeSemanticSnapshot),
    },
    resolveMany,
    setPolicy(nextPolicy) { policy = { ...policy, ...nextPolicy }; },
    async dispose() { await model.unload(); },
  };
}

function createLexicalResolver(world, embodiment) {
  return (probe) => {
    try {
      const mission = missionApi.compileMission(probe.sourceText, world, embodiment);
      return {
        outcome: 'resolve',
        nodeId: probe.role === 'origin' ? mission.originNodeId : mission.destinationNodeId,
        evidence: { lane: 'lexical_control' },
      };
    } catch {
      return { outcome: 'refuse', evidence: { lane: 'lexical_control' } };
    }
  };
}
