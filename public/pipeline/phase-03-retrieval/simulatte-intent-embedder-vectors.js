(function attachSimulatteIntentEmbeddervectors(root) {
  const scope = root.__SimulatteIntentEmbedderRefactorScope;
  if (!scope || scope.missingDependency) return;
  with (scope) {
    function normalizeRerankerRows(result) {
        const rows = Array.isArray(result)
          ? result
          : result && (
            result.priors
            || result.rows
            || result.results
            || result.candidates
            || result.rankings
            || result.top
          ) || [];
        const count = Math.max(1, rows.length);
        return rows.map((row, index) => {
          if (typeof row === 'string') {
            return {
              primitiveId: row,
              score: Number((1 - index / count).toFixed(4)),
              rank: index,
            };
          }
          const primitiveId = String(row && (
            row.primitiveId
            || row.id
            || row.candidateId
            || row.itemId
          ) || '');
          const rawScore = Number(row && (
            row.score
            ?? row.rerankScore
            ?? row.modelRerankScore
            ?? row.relevance
            ?? row.probability
          ));
          return {
            primitiveId,
            score: clamp01(Number.isFinite(rawScore) ? rawScore : 1 - index / count),
            rank: Number(row && row.rank != null ? row.rank : index),
            reason: row && row.reason || '',
          };
        }).filter((row) => row.primitiveId);
      }

    function applyModelRerank(localRows, modelRows, evaluatedRows = modelRows) {
        const byId = new Map((localRows || []).map((row) => [row.primitiveId, { ...row }]));
        const modelIds = new Set();
        const evaluatedIds = new Set((evaluatedRows || []).map((row) => String(
          row && (row.primitiveId || row.candidateId || row.id) || ''
        )).filter(Boolean));
        for (const modelRow of modelRows || []) {
          const existing = byId.get(modelRow.primitiveId);
          if (!existing) continue;
          modelIds.add(modelRow.primitiveId);
          const modelScore = clamp01(Number(modelRow.score || 0));
          existing.modelRerankScore = Number(modelScore.toFixed(4));
          existing.modelRerankRank = Number(modelRow.rank || 0);
          existing.modelRerankReason = modelRow.reason || '';
          existing.modelRerankEvaluated = true;
          existing.score = Number(Math.min(
            1,
            existing.score * RERANK_MODEL_BLEND.localWeight + modelScore * RERANK_MODEL_BLEND.modelWeight
          ).toFixed(4));
          byId.set(modelRow.primitiveId, existing);
        }
        if (evaluatedIds.size) {
          for (const [primitiveId, existing] of byId) {
            if (modelIds.has(primitiveId)) continue;
            existing.modelRerankScore = 0;
            existing.modelRerankRank = Number.MAX_SAFE_INTEGER;
            existing.modelRerankEvaluated = evaluatedIds.has(primitiveId);
            if (existing.modelRerankEvaluated) {
              existing.modelRerankReason = 'evaluated but not returned by reranker';
              existing.score = Number(clamp01(
                Number(existing.score || 0) * RERANK_MODEL_BLEND.localWeight
              ).toFixed(4));
            } else {
              existing.modelRerankReason = 'outside model top-k; local score retained';
            }
            byId.set(primitiveId, existing);
          }
        }
        return Array.from(byId.values()).sort((a, b) => (
          b.score - a.score ||
          Number(b.modelRerankScore || 0) - Number(a.modelRerankScore || 0) ||
          b.modelScore - a.modelScore ||
          a.primitiveId.localeCompare(b.primitiveId)
        ));
      }

    function rerankPriors(priors, semanticRag, dopplerIntent, runtime = null, universeMatches = null) {
        const config = rerankerConfig(runtime || {});
        const byId = new Map((priors || []).map((prior) => [prior.primitiveId, {
          ...prior,
          modelScore: Number(prior.modelScore ?? prior.score ?? 0),
          ragScore: 0,
          dopplerScore: 0,
          universeScore: 0,
          universeEvidence: [],
          matchedTerms: [],
        }]));
        for (const doc of semanticRag && semanticRag.retrieved || []) {
          const existing = byId.get(doc.primitiveId);
          if (!existing) continue;
          const ragScore = Number(doc.score || 0);
          existing.ragScore = Number(ragScore.toFixed(4));
          existing.matchedTerms = uniqueStrings([...(existing.matchedTerms || []), ...(doc.matchedTerms || [])]);
          byId.set(doc.primitiveId, existing);
        }
        for (const hint of dopplerIntent && dopplerIntent.primitives || []) {
          const existing = byId.get(hint.primitiveId);
          if (!existing) continue;
          existing.dopplerScore = Number(Math.max(existing.dopplerScore || 0, hint.score || 0).toFixed(4));
          existing.dopplerReason = hint.reason || '';
          byId.set(hint.primitiveId, existing);
        }
        let universePrimitiveHintCount = 0;
        for (const candidate of universeMatches && universeMatches.candidates || []) {
          const hints = uniqueStrings(candidate.primitiveHints || []);
          for (const primitiveId of hints) {
            const existing = byId.get(primitiveId);
            if (!existing) continue;
            const universeScore = clamp01(Number(candidate.score || 0));
            existing.universeScore = Number(Math.max(existing.universeScore || 0, universeScore).toFixed(4));
            existing.universeEvidence = (existing.universeEvidence || []).concat([{
              id: candidate.id,
              indexName: candidate.indexName,
              label: candidate.label,
              score: Number(universeScore.toFixed(4)),
            }]).slice(0, 5);
            universePrimitiveHintCount += 1;
            byId.set(primitiveId, existing);
          }
        }
        const rows = Array.from(byId.values()).map((prior) => {
          const lexical = Math.min(1, (prior.matchedTerms || []).length / 5);
          const score = prior.modelScore * HEURISTIC_FUSION_WEIGHTS.modelScore
            + prior.ragScore * HEURISTIC_FUSION_WEIGHTS.ragScore
            + lexical * HEURISTIC_FUSION_WEIGHTS.lexicalScore
            + prior.symbolicBoost * HEURISTIC_FUSION_WEIGHTS.symbolicBoost
            + prior.dopplerScore * HEURISTIC_FUSION_WEIGHTS.dopplerScore
            + prior.universeScore * HEURISTIC_FUSION_WEIGHTS.universeScore;
          return {
            ...prior,
            lexicalScore: Number(lexical.toFixed(4)),
            score: Number(Math.min(1, score).toFixed(4)),
          };
        }).sort((a, b) => (
          b.score - a.score ||
          b.modelScore - a.modelScore ||
          b.ragScore - a.ragScore ||
          a.primitiveId.localeCompare(b.primitiveId)
        ));
        return {
          priors: rows,
          receipt: {
            schema: 'simulatte.intentRerank.v1',
            phase: 3,
            phaseId: 'retrieval',
            stage: 'span-refined',
            required: true,
            model: runtime ? rerankerId(runtime) : config.id,
            rerankerKind: config.kind,
            rerankerPhase: 3,
            rerankerMode: 'heuristic-fusion',
            modelRequired: rerankerRequired(runtime),
            modelReady: false,
            modelStatus: 'not-available',
            modelBackend: '',
            fallbackMode: config.fallbackMode,
            scoreFields: [
              'modelScore',
              'ragScore',
              'lexicalScore',
              'symbolicBoost',
              'dopplerScore',
              'universeScore',
            ],
            candidateInputCount: (priors || []).length,
            candidateOutputCount: rows.length,
            modelPriorCount: (priors || []).length,
            ragDocumentCount: semanticRag && semanticRag.retrieved ? semanticRag.retrieved.length : 0,
            dopplerPrimitiveCount: dopplerIntent && dopplerIntent.primitives ? dopplerIntent.primitives.length : 0,
            universeCandidateCount: universeMatches && universeMatches.candidates ? universeMatches.candidates.length : 0,
            universePrimitiveHintCount,
            top: rows.slice(0, 12).map((row) => row.primitiveId),
          },
        };
      }

    function symbolicPromptMatch(promptText, promptTerms, primitive) {
        const prompt = ` ${String(promptText || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ')} `;
        const idPhrase = String(primitive.id || '').toLowerCase().replace(/[-_]+/g, ' ').trim();
        const idTerms = fallbackFeatureTokens(String(primitive.id || '').replace(/[-_]+/g, ' '));
        const domainTerms = fallbackFeatureTokens((primitive.domains || []).join(' '));
        const textTerms = fallbackFeatureTokens([
          primitive.role || '',
          primitive.text || '',
          (primitive.recipe || []).join(' '),
        ].join(' '));
        const matched = [];
        let score = 0;
        if (idPhrase && idPhrase.length > 2 && prompt.includes(` ${idPhrase} `)) {
          score += 0.44;
          matched.push(idPhrase);
        }
        let idHits = 0;
        for (const term of idTerms) {
          if (promptTerms.has(term)) {
            idHits += 1;
            matched.push(term);
          }
        }
        score += Math.min(0.42, idHits * 0.22);
        let domainHits = 0;
        for (const term of domainTerms) {
          if (promptTerms.has(term)) {
            domainHits += 1;
            matched.push(term);
          }
        }
        score += Math.min(0.18, domainHits * 0.08);
        let textHits = 0;
        for (const term of textTerms) {
          if (promptTerms.has(term)) {
            textHits += 1;
            matched.push(term);
          }
        }
        score += Math.min(0.18, textHits * 0.035);
        return {
          score: Number(Math.min(0.76, score).toFixed(4)),
          terms: uniqueStrings(matched).slice(0, 10),
        };
      }

    function mergeRagScores(priors, semanticRag) {
        return rerankPriors(priors, semanticRag, null).priors
          .sort((a, b) => b.score - a.score || a.primitiveId.localeCompare(b.primitiveId));
      }

    function rankCpu(queryVector, candidateVectors) {
        return candidateVectors.map((candidate) => dot(queryVector, candidate));
      }

    async function rankWebGpu(device, dimensions, queryVector, candidateVectors) {
        const count = candidateVectors.length;
        const queryData = new Float32Array(queryVector);
        const candidateData = new Float32Array(count * dimensions);
        candidateVectors.forEach((vector, index) => {
          candidateData.set(vector, index * dimensions);
        });
        const queryBuffer = gpuBuffer(device, queryData, GPUBufferUsage.STORAGE);
        const candidateBuffer = gpuBuffer(device, candidateData, GPUBufferUsage.STORAGE);
        const scoreBuffer = device.createBuffer({
          size: count * 4,
          usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
        });
        const readBuffer = device.createBuffer({
          size: count * 4,
          usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        });
        const uniformData = new Uint32Array([dimensions, count]);
        const uniformBuffer = gpuBuffer(device, uniformData, GPUBufferUsage.UNIFORM);
        const shader = device.createShaderModule({ code: rankShader() });
        const pipeline = device.createComputePipeline({
          layout: 'auto',
          compute: { module: shader, entryPoint: 'main' },
        });
        const bindGroup = device.createBindGroup({
          layout: pipeline.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: { buffer: queryBuffer } },
            { binding: 1, resource: { buffer: candidateBuffer } },
            { binding: 2, resource: { buffer: scoreBuffer } },
            { binding: 3, resource: { buffer: uniformBuffer } },
          ],
        });
        const encoder = device.createCommandEncoder();
        const pass = encoder.beginComputePass();
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, bindGroup);
        pass.dispatchWorkgroups(Math.ceil(count / 64));
        pass.end();
        encoder.copyBufferToBuffer(scoreBuffer, 0, readBuffer, 0, count * 4);
        device.queue.submit([encoder.finish()]);
        await readBuffer.mapAsync(GPUMapMode.READ);
        const scores = new Float32Array(readBuffer.getMappedRange().slice(0));
        readBuffer.unmap();
        return Array.from(scores);
      }

    function gpuBuffer(device, data, usage) {
        const buffer = device.createBuffer({
          size: Math.max(4, Math.ceil(data.byteLength / 4) * 4),
          usage: usage | GPUBufferUsage.COPY_DST,
        });
        device.queue.writeBuffer(buffer, 0, data);
        return buffer;
      }

    function rankShader() {
        return `
          struct Sizes {
            dimensions: u32,
            count: u32,
          };
          @group(0) @binding(0) var<storage, read> query: array<f32>;
          @group(0) @binding(1) var<storage, read> candidates: array<f32>;
          @group(0) @binding(2) var<storage, read_write> scores: array<f32>;
          @group(0) @binding(3) var<uniform> sizes: Sizes;
          @compute @workgroup_size(64)
          fn main(@builtin(global_invocation_id) id: vec3<u32>) {
            let row = id.x;
            if (row >= sizes.count) { return; }
            var sum = 0.0;
            for (var i = 0u; i < sizes.dimensions; i = i + 1u) {
              sum = sum + query[i] * candidates[row * sizes.dimensions + i];
            }
            scores[row] = max(sum, 0.0);
          }
        `;
      }

    function dot(a, b) {
        let score = 0;
        for (let i = 0; i < Math.min(a.length, b.length); i += 1) score += a[i] * b[i];
        return Math.max(0, score);
      }

    function canonicalLayer(layer) {
        const value = String(layer || 'component');
        if (['math', 'physics', 'material', 'component', 'composition', 'scene'].includes(value)) {
          return value;
        }
        if (['field', 'constraint'].includes(value)) return 'physics';
        if (['ledger', 'source-sink'].includes(value)) return 'math';
        return 'component';
      }

    function clamp01(value) {
        if (!Number.isFinite(value)) return 0;
        return Math.max(0, Math.min(1, value));
      }

    function hashHex(value) {
        if (!value) return '';
        if (typeof value === 'string') return value.replace(/^sha256:/, '').toLowerCase();
        if (typeof value === 'object' && typeof value.hex === 'string') return value.hex.toLowerCase();
        return '';
      }

    function resolveUrl(path, base) {
        try {
          return new URL(path, new URL(base, location.href)).toString();
        } catch (_err) {
          return path;
        }
      }

    function normalizeAssetVersionQuery(value) {
        return String(value || '').trim().replace(/^\?/, '');
      }

    function defaultAssetVersionQuery() {
        if (typeof importScripts === 'function') {
          try {
            return String(globalThis.location && globalThis.location.search || '');
          } catch (_err) {
            return '';
          }
        }
        if (typeof document !== 'undefined' && typeof document.querySelector === 'function') {
          const meta = document.querySelector('meta[name="simulatte-build"]');
          const build = meta && meta.getAttribute('content') || '';
          if (build && build !== 'dev') return `v=${encodeURIComponent(build)}`;
        }
        return '';
      }

    function versionedAssetUrl(url, versionQuery) {
        const query = normalizeAssetVersionQuery(versionQuery);
        const text = String(url || '');
        if (!query || !text || text.includes('?')) return text;
        return `${text}?${query}`;
      }

    function urlValue(name) {
        try {
          return new URLSearchParams(globalThis.location && globalThis.location.search || '').get(name) || '';
        } catch (_err) {
          return '';
        }
      }

    Object.assign(scope, {
      normalizeRerankerRows,
      applyModelRerank,
      rerankPriors,
      symbolicPromptMatch,
      mergeRagScores,
      rankCpu,
      rankWebGpu,
      gpuBuffer,
      rankShader,
      dot,
      canonicalLayer,
      clamp01,
      hashHex,
      resolveUrl,
      normalizeAssetVersionQuery,
      defaultAssetVersionQuery,
      versionedAssetUrl,
      urlValue,
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
