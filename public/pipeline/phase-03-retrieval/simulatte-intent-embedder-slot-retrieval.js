(function attachSimulatteIntentEmbedderslotretrieval(root) {
  const scope = root.__SimulatteIntentEmbedderRefactorScope;
  if (!scope || scope.missingDependency) return;
  with (scope) {
    function slotRetrievalEvidenceRows(slotRetrieval = {}) {
        const rows = [];
        for (const slot of slotRetrieval && slotRetrieval.bySlot || []) {
          for (const candidate of slot.candidates || []) {
            rows.push({
              ...candidate,
              id: candidate.candidateId || candidate.id || candidate.primitiveId || '',
              slotId: slot.slotId || candidate.slotId || '',
              slotRole: slot.slotRole || candidate.slotRole || '',
              entryId: slot.entryId || candidate.entryId || '',
              source: candidate.source || 'slot-embedding-retrieval',
              retrievalKind: 'slot-retrieval',
              evidence: [slot.slotId || '', candidate.candidateId || candidate.id || candidate.primitiveId || ''].filter(Boolean),
            });
          }
        }
        return rows;
      }

    function usefulRetrievalSpans(languageEvidence, config = {}) {
        const max = Number.isFinite(config.maxSpans) ? config.maxSpans : 18;
        const includeKinds = new Set(config.includeKinds || []);
        const rows = [];
        const priority = {
          'predicate-frame': 1,
          clause: 2,
          'verb-phrase': 3,
          'noun-phrase': 4,
          modifier: 5,
          quantity: 6,
          prompt: 7,
        };
        for (const span of languageEvidence && languageEvidence.spans || []) {
          const text = String(span.text || '').trim();
          const kind = span.kind || 'span';
          if (includeKinds.size && !includeKinds.has(kind)) continue;
          if (!text || text.length < config.minChars || text.length > config.maxChars) continue;
          if (span.kind === 'prompt' && rows.some((row) => row.kind !== 'prompt')) continue;
          rows.push({
            id: span.id,
            kind,
            text,
            sourceId: span.sourceId || '',
            priority: priority[kind] || 8,
          });
        }
        const prepared = config.dedupe === false ? rows : dedupeSpanRows(rows);
        return prepared
          .sort((a, b) => a.priority - b.priority || b.text.length - a.text.length || a.id.localeCompare(b.id))
          .slice(0, max);
      }

    function dedupeSpanRows(rows) {
        const seen = new Set();
        return rows.filter((row) => {
          const key = normalizeSpanText(row.text);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      }

    function spanPrimitiveMatch(span, primitive, rawScore) {
        const lexical = symbolicPromptMatch(span.text, new Set(fallbackFeatureTokens(span.text)), primitive);
        const score = clamp01(Number(rawScore || 0) * 0.82 + lexical.score * 0.22);
        return {
          id: `span:${span.id}:${primitive.id}`,
          primitiveId: primitive.id,
          label: primitive.role || primitive.id,
          source: 'span-embedding-primitive-prior',
          indexName: 'primitive-span',
          retrievalKind: 'span-primitive',
          spanId: span.id,
          spanKind: span.kind,
          spanText: span.text,
          score: Number(score.toFixed(4)),
          modelScore: Number(clamp01(rawScore).toFixed(4)),
          lexicalScore: Number(lexical.score.toFixed(4)),
          matchedTerms: lexical.terms,
          primitiveHints: [primitive.id],
          operatorHints: primitive.operatorHints || primitive.operators || [],
          candidateText: primitive.text || primitive.role || primitive.id,
          evidence: [`span:${span.id}`, primitive.id],
        };
      }

    function annotateSpanCandidate(row, span, source) {
        const baseId = row.id || row.cardId || row.primitiveId || row.canonicalId || row.label;
        return {
          ...row,
          id: `span:${span.id}:${baseId || source}`,
          source,
          indexName: `${row.indexName || source}-span`,
          retrievalKind: source,
          spanId: span.id,
          spanKind: span.kind,
          spanText: span.text,
          evidence: uniqueStrings([...(row.evidence || []), `span:${span.id}`]),
        };
      }

    function spanUniverseCandidates(universeMatches, span, maxRows = 12) {
        return (universeMatches && universeMatches.candidates || [])
          .slice(0, Math.max(0, Number(maxRows) || 0))
          .map((row) => annotateSpanCandidate(row, span, `span-${row.indexName || 'universe-index'}`));
      }

    function fuseSpanPrimitiveScores(priors, spanRetrieval) {
        const best = new Map();
        for (const span of spanRetrieval && spanRetrieval.bySpan || []) {
          for (const candidate of span.candidates || []) {
            const primitiveIds = uniqueStrings([
              candidate.primitiveId,
              ...(candidate.primitiveHints || []),
            ]);
            for (const primitiveId of primitiveIds) {
              const current = best.get(primitiveId) || { score: 0, spans: [] };
              const score = clamp01(Number(candidate.score || 0));
              if (score > current.score) current.score = score;
              current.spans.push({
                spanId: span.spanId,
                spanKind: span.spanKind,
                spanText: span.spanText,
                candidateId: candidate.id || candidate.primitiveId || '',
                score: Number(score.toFixed(4)),
              });
              best.set(primitiveId, current);
            }
          }
        }
        return (priors || []).map((prior) => {
          const support = best.get(prior.primitiveId);
          if (!support) return prior;
          const spanScore = Number(support.score.toFixed(4));
          return {
            ...prior,
            spanScore,
            spanEvidence: support.spans.slice(0, 6),
            score: Number(clamp01(Number(prior.score || 0) + spanScore * 0.18).toFixed(4)),
          };
        }).sort((a, b) => b.score - a.score || a.primitiveId.localeCompare(b.primitiveId));
      }

    function spanEvidenceRows(spanRetrieval) {
        const rows = [];
        for (const span of spanRetrieval && spanRetrieval.bySpan || []) {
          for (const candidate of span.candidates || []) {
            rows.push({
              ...candidate,
              spanId: candidate.spanId || span.spanId,
              spanKind: candidate.spanKind || span.spanKind,
              spanText: candidate.spanText || span.spanText,
            });
          }
        }
        return rows;
      }

    function spanLanguageEvidence(promptText, options = {}) {
        if (options.languageEvidence) return options.languageEvidence;
        const api = resolveLanguageEvidenceApi();
        if (api && typeof api.extractLanguageEvidence === 'function') {
          return api.extractLanguageEvidence(promptText);
        }
        return {
          schema: 'simulatte.languageEvidence.v1',
          rawText: promptText,
          normalizedText: promptText,
          spans: [{ id: 'span.001', kind: 'prompt', text: promptText }],
          predicateFrames: [],
          summary: { spanCount: 1 },
        };
      }

    function resolveLanguageEvidenceApi() {
        if (typeof globalThis !== 'undefined' && globalThis.SimulatteLanguageEvidence) {
          return globalThis.SimulatteLanguageEvidence;
        }
        if (typeof module === 'object' && module.exports && typeof require === 'function') {
          try {
            return require('../phase-02-language/simulatte-language-evidence.js');
          } catch (_err) {}
        }
        return null;
      }

    function normalizeSpanText(value) {
        return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
      }

    function rankSurfaceCards(cardIndex, queryVector, options = {}) {
        if (!cardIndex) return [];
        const maxCards = Number.isFinite(options.maxCards) ? options.maxCards : 48;
        const minCardScore = Number.isFinite(options.minCardScore) ? options.minCardScore : 0.22;
        return cardIndex.documents
          .map((doc) => {
            const score = clamp01(dot(queryVector, doc.vector));
            return {
              cardId: doc.cardId,
              type: doc.type || '',
              labels: Array.isArray(doc.labels) ? doc.labels.slice(0, 5) : [],
              score: Number(score.toFixed(4)),
              modelScore: Number(score.toFixed(4)),
              semanticScore: Number(score.toFixed(4)),
              source: `${modelSlug(cardIndex.embedModelId)}-surface-card-index`,
              indexId: cardIndex.id,
              textHash: doc.textHash || null,
            };
          })
          .filter((match) => match.score >= minCardScore)
          .sort((a, b) => b.score - a.score || a.cardId.localeCompare(b.cardId))
          .slice(0, maxCards);
      }

    function rankUniverseIndexes(universe, promptText, queryVector, options = {}) {
        const empty = {
          schema: 'simulatte.universeMatches.v1',
          manifestId: universe && universe.id || '',
          candidates: [],
          byIndex: {},
        };
        if (!universe) return empty;
        const maxUniverse = Number.isFinite(options.maxUniverse) ? options.maxUniverse : 36;
        const minUniverseScore = Number.isFinite(options.minUniverseScore) ? options.minUniverseScore : 0.16;
        const tokens = promptTokens(promptText);
        if (!tokens.length && !queryVector) return empty;
        const featureQueries = new Map();
        const byIndex = {};
        const candidates = [];
        for (const [indexName, index] of Object.entries(universe.indexes || {})) {
          const featureQuery = featureQueryForIndex(index, promptText, featureQueries);
          const rows = (index.documents || [])
            .map((doc) => universeCandidateForDocument(doc, indexName, tokens, {
              featureQuery,
              queryVector,
            }))
            .filter((row) => row.score >= minUniverseScore || row.lexicalScore > 0)
            .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
            .slice(0, Math.max(4, Math.floor(maxUniverse / 2)));
          byIndex[indexName] = rows;
          candidates.push(...rows);
        }
        candidates.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
        return {
          ...empty,
          candidates: candidates.slice(0, maxUniverse),
          byIndex,
        };
      }

    function featureQueryForIndex(index, promptText, cache) {
        if (!index || !index.featureDim) return null;
        const dim = Number(index.featureDim);
        if (!Number.isFinite(dim) || dim <= 0) return null;
        if (!cache.has(dim)) cache.set(dim, buildUniverseFeatureVector(promptText, dim));
        return cache.get(dim);
      }

    function universeCandidateForDocument(doc, indexName, tokens, ranking = {}) {
        const labels = universeLabels(doc).map((value) => String(value).toLowerCase());
        const haystackWords = new Set(labels.join(' ').split(/[^a-z0-9]+/).filter(Boolean));
        const tokenHits = [];
        for (const token of tokens) {
          if (token.length > 2 && haystackWords.has(token)) tokenHits.push(token);
        }
        const tokenText = ` ${tokens.join(' ')} `;
        const phraseHit = labels.some((label) => {
          const phrase = label.replace(/[^a-z0-9]+/g, ' ').trim();
          return phrase.length > 2 && tokenText.includes(` ${phrase} `);
        });
        const lexicalScore = clamp01(tokenHits.length / Math.max(2, tokens.length) + (phraseHit ? 0.42 : 0));
        const modelScore = ranking.queryVector && doc.vector && ranking.queryVector.length === doc.vector.length
          ? clamp01(dot(ranking.queryVector, doc.vector))
          : 0;
        const featureScore = ranking.featureQuery && doc.featureVector && ranking.featureQuery.length === doc.featureVector.length
          ? clamp01(dot(ranking.featureQuery, doc.featureVector))
          : 0;
        const semanticScore = Math.max(modelScore, featureScore);
        const score = clamp01(Math.max(lexicalScore, semanticScore * 0.88 + lexicalScore * 0.18));
        const operatorHints = uniqueStrings([
          ...(doc.operatorHints || []),
          ...(doc.operatorTypes || []),
          ...(doc.operators || []),
          doc.operatorType,
          doc.process,
          doc.edgeType,
        ]);
        const materialIds = uniqueStrings([
          ...(doc.materialIds || []),
          doc.materialId,
        ]);
        const conceptIds = uniqueStrings([
          ...(doc.conceptIds || []),
          ...(doc.concepts || []),
          doc.canonicalId,
        ]);
        return {
          id: doc.id || `${indexName}:${doc.label || 'candidate'}`,
          indexName,
          label: doc.label || doc.id || '',
          aliases: Array.isArray(doc.aliases) ? doc.aliases.slice(0, 6) : [],
          canonicalId: doc.canonicalId || doc.id || '',
          semanticType: doc.semanticType || indexName.replace(/s$/, ''),
          domains: doc.domains || [],
          materialId: doc.materialId || '',
          materialIds,
          operatorHints,
          operatorTypes: operatorHints,
          primitiveHints: uniqueStrings(doc.primitiveHints || []),
          conceptIds,
          shapeHints: uniqueStrings([...(doc.shapeHints || []), ...(doc.shapeIds || [])]),
          sceneHints: uniqueStrings(doc.sceneHints || []),
          process: doc.process || '',
          edgeType: doc.edgeType || '',
          shapeKind: doc.shapeKind || '',
          sceneKind: doc.sceneKind || '',
          candidateText: doc.candidateText || '',
          score: Number(score.toFixed(4)),
          lexicalScore: Number(lexicalScore.toFixed(4)),
          semanticScore: Number(semanticScore.toFixed(4)),
          modelScore: Number(modelScore.toFixed(4)),
          featureScore: Number(featureScore.toFixed(4)),
          evidence: ['universe-index', indexName],
          rankSignals: {
            featureScore: Number(featureScore.toFixed(4)),
            lexicalScore: Number(lexicalScore.toFixed(4)),
            modelScore: Number(modelScore.toFixed(4)),
            phraseHit,
            tokenHits,
          },
        };
      }

    function universeLabels(doc) {
        return [
          doc.label,
          doc.id,
          doc.canonicalId,
          doc.semanticType,
          doc.materialId,
          doc.operatorType,
          doc.process,
          doc.edgeType,
          doc.shapeKind,
          doc.sceneKind,
          doc.candidateText,
          ...(doc.aliases || []),
          ...(doc.domains || []),
          ...(doc.operatorHints || []),
          ...(doc.operatorTypes || []),
          ...(doc.operators || []),
          ...(doc.primitiveHints || []),
          ...(doc.conceptIds || []),
          ...(doc.concepts || []),
          ...(doc.materialIds || []),
          ...(doc.shapeHints || []),
          ...(doc.shapeIds || []),
          ...(doc.sceneHints || []),
        ].filter(Boolean);
      }

    function uniqueStrings(values) {
        return Array.from(new Set((values || []).filter(Boolean).map((value) => String(value))));
      }

    function promptTokens(promptText) {
        return String(promptText || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
      }

    function buildUniverseFeatureVector(text, dim) {
        const ragApi = typeof globalThis !== 'undefined' ? globalThis.SimulatteSemanticRag : null;
        if (ragApi && typeof ragApi.buildSemanticFeatureVector === 'function') {
          return ragApi.buildSemanticFeatureVector(text, dim);
        }
        return fallbackSemanticFeatureVector(text, dim);
      }

    function runtimeFeatureModelId() {
        const ragApi = typeof globalThis !== 'undefined' ? globalThis.SimulatteSemanticRag : null;
        return ragApi && ragApi.FEATURE_MODEL_ID || FEATURE_MODEL_ID;
      }

    function fallbackSemanticFeatureVector(text, dim) {
        const out = new Float32Array(dim);
        const roots = fallbackFeatureTokens(text);
        if (!roots.length) return out;
        for (const token of roots) {
          addFeature(out, `w:${token}`, 1);
          addCharNgrams(out, token);
        }
        for (let i = 0; i < roots.length - 1; i += 1) {
          addFeature(out, `b:${roots[i]}_${roots[i + 1]}`, 1.35);
        }
        return normalizeEmbeddingVector(out, 'universe query feature');
      }

    function fallbackFeatureTokens(text) {
        const stops = new Set([
          'a', 'an', 'and', 'are', 'as', 'be', 'build', 'by', 'create', 'for', 'from',
          'in', 'into', 'is', 'make', 'of', 'on', 'or', 'simulate', 'simulation',
          'the', 'to', 'with', 'world', 'that', 'this', 'these', 'those',
        ]);
        const out = [];
        const lower = String(text || '').toLowerCase();
        let match;
        const tokenRe = /[a-z0-9][a-z0-9'-]*/g;
        while ((match = tokenRe.exec(lower))) {
          const token = normalizeFeatureToken(match[0]);
          if (token && !stops.has(token)) out.push(token);
        }
        return uniqueStrings(out);
      }

    function normalizeFeatureToken(token) {
        let out = String(token || '').toLowerCase().replace(/'/g, '').replace(/[^a-z0-9-]/g, '');
        if (out.endsWith('ies') && out.length > 4) out = `${out.slice(0, -3)}y`;
        else if (/(ches|shes|xes|zes|sses)$/.test(out) && out.length > 5) out = out.slice(0, -2);
        else if (out.endsWith('s') && out.length > 3 && !/(ss|us|is)$/.test(out)) out = out.slice(0, -1);
        return out;
      }

    function addFeature(out, feature, value = 1) {
        const hash = hashString(feature);
        const sign = hash & 0x80000000 ? -1 : 1;
        out[hash % out.length] += value * sign;
      }

    function addCharNgrams(out, token) {
        const padded = `^${token}$`;
        for (let n = 3; n <= 4; n += 1) {
          if (padded.length < n) continue;
          for (let i = 0; i <= padded.length - n; i += 1) {
            addFeature(out, `c${n}:${padded.slice(i, i + n)}`, 0.42);
          }
        }
      }

    function hashString(str) {
        let hash = 2166136261;
        const value = String(str || '');
        for (let i = 0; i < value.length; i += 1) {
          hash ^= value.charCodeAt(i);
          hash = Math.imul(hash, 16777619);
        }
        return hash >>> 0;
      }

    function validateQueryEmbedding(result, index) {
        const embedding = result && result.embedding instanceof Float32Array
          ? result.embedding
          : null;
        if (!embedding) throw new Error('embedProvider.embed must return { embedding: Float32Array }');
        if (embedding.length !== index.embeddingDim) {
          throw new Error(`query embedding dim mismatch (${embedding.length} !== ${index.embeddingDim})`);
        }
        for (let i = 0; i < embedding.length; i += 1) {
          if (!Number.isFinite(embedding[i])) throw new Error(`query embedding has non-finite value at ${i}`);
        }
        if (String(result.embedModelId || '') !== index.embedModelId) {
          throw new Error(`query embedModelId mismatch (${result.embedModelId || ''} !== ${index.embedModelId})`);
        }
        const queryHash = hashHex(result.embedModelHash);
        const indexHash = hashHex(index.embedModelHash);
        if (!queryHash || queryHash !== indexHash) {
          throw new Error(`query embedModelHash mismatch (${queryHash || ''} !== ${indexHash})`);
        }
        return normalizeEmbeddingVector(embedding, 'query');
      }

    function rerankFunctionForTarget(target) {
        if (!target) return null;
        if (typeof target.rerank === 'function') return (input) => target.rerank(input);
        if (typeof target.rerankIntent === 'function') return (input) => target.rerankIntent(input);
        if (typeof target.intentRerank === 'function') return (input) => target.intentRerank(input);
        if (typeof target.rankIntent === 'function') return (input) => target.rankIntent(input);
        return null;
      }

    function normalizeEmbedProvider(provider, runtime, backend) {
        if (!provider || typeof provider.embed !== 'function') {
          throw new Error('embed provider must expose embed({ text })');
        }
        const rerankCapability = rerankFunctionForTarget(provider);
        const normalized = {
          backend,
          embed: async (args) => {
            const result = await provider.embed(embeddingProviderInput(args, runtime));
            return withEmbeddingProvenance(result, runtime);
          },
          embedMany: async (rows) => {
            if (typeof provider.embedMany === 'function') {
              const results = await provider.embedMany((rows || []).map((row) => embeddingProviderInput(row, runtime)));
              return (results || []).map((result) => withEmbeddingProvenance(result, runtime));
            }
            if (typeof provider.embedBatch === 'function') {
              const results = await provider.embedBatch((rows || []).map((row) => embeddingProviderInput(row, runtime)));
              return (results || []).map((result) => withEmbeddingProvenance(result, runtime));
            }
            const results = [];
            for (const row of rows || []) {
              results.push(withEmbeddingProvenance(await provider.embed(row), runtime));
            }
            return results;
          },
        };
        if (rerankCapability) {
          normalized.rerank = (input) => rerankCapability(input);
        }
        return normalized;
      }

    function providerFromModelHandle(handle, runtime, backend, modelBaseUrl = '', reloadHandle = null) {
        if (!handle || (
          typeof handle.embedBatch !== 'function' &&
          typeof handle.embed !== 'function' &&
          !handle.advanced &&
          typeof handle.prefillWithEmbedding !== 'function'
        )) {
          throw new Error('Doppler model handle must expose embedBatch(), embed(), or prefillWithEmbedding()');
        }
        let queue = Promise.resolve();
        let activeHandle = handle;
        const reloadActiveHandle = async (reloadOptions = {}) => {
          if (typeof reloadHandle === 'function') {
            activeHandle = await reloadHandle(reloadOptions);
          }
          return activeHandle;
        };
        const run = async (args) => {
          const input = embeddingProviderInput(args, runtime);
          const prompt = String(input.text || '');
          if (!prompt) throw new Error('Doppler embed text required');
          await reloadActiveHandle();
          const result = await embedWithModelHandle(activeHandle, prompt, {
            useChatTemplate: false,
            embeddingMode: input.embeddingMode,
            __skipStateSnapshot: true,
          });
          if (!embeddingHasPositiveNorm(result && result.embedding) && typeof reloadHandle === 'function') {
            activeHandle = await reloadHandle({ force: true });
            const retryResult = await embedWithModelHandle(activeHandle, prompt, {
              useChatTemplate: false,
              embeddingMode: input.embeddingMode,
              __skipStateSnapshot: true,
            });
            return embeddingResultWithProvenance(retryResult, activeHandle, runtime, backend, modelBaseUrl);
          }
          return embeddingResultWithProvenance(result, activeHandle, runtime, backend, modelBaseUrl);
        };
        const runBatch = async (rows) => {
          const inputs = (rows || []).map((row) => embeddingProviderInput(row, runtime));
          if (!inputs.length) return [];
          if (inputs.some((input) => !String(input.text || ''))) {
            throw new Error('Doppler embed text required');
          }
          await reloadActiveHandle();
          const firstMode = inputs[0].embeddingMode;
          const canBatch = typeof activeHandle.embedBatch === 'function' &&
            inputs.every((input) => input.embeddingMode === firstMode);
          if (!canBatch) {
            const results = [];
            for (const input of inputs) {
              const result = await embedWithModelHandle(activeHandle, input.text, {
                useChatTemplate: false,
                embeddingMode: input.embeddingMode,
                __skipStateSnapshot: true,
              });
              results.push(embeddingResultWithProvenance(result, activeHandle, runtime, backend, modelBaseUrl));
            }
            return results;
          }
          const embedOptions = {
            useChatTemplate: false,
            embeddingMode: firstMode,
            __skipStateSnapshot: true,
          };
          let batch = await activeHandle.embedBatch(inputs.map((input) => input.text), embedOptions);
          if (
            typeof reloadHandle === 'function' &&
            (!Array.isArray(batch) || batch.length !== inputs.length || batch.some((result) => !embeddingHasPositiveNorm(result && result.embedding)))
          ) {
            activeHandle = await reloadActiveHandle({ force: true });
            batch = await activeHandle.embedBatch(inputs.map((input) => input.text), embedOptions);
          }
          if (!Array.isArray(batch) || batch.length !== inputs.length) {
            throw new Error('Doppler embedBatch must return one result per input');
          }
          return batch.map((result) => embeddingResultWithProvenance(result, activeHandle, runtime, backend, modelBaseUrl));
        };
        const rerankCapability = rerankFunctionForTarget(handle)
          || rerankFunctionForTarget(handle && handle.advanced);
        const provider = {
          backend,
          embed(args) {
            const next = queue.then(() => run(args), () => run(args));
            queue = next.then(() => undefined, () => undefined);
            return next;
          },
          embedMany(rows) {
            const next = queue.then(() => runBatch(rows), () => runBatch(rows));
            queue = next.then(() => undefined, () => undefined);
            return next;
          },
        };
        if (rerankCapability) {
          provider.rerank = (input) => rerankCapability(input);
        }
        return provider;
      }

    async function embedWithModelHandle(handle, prompt, embedOptions) {
        if (!handle) throw new Error('Doppler embedding model handle unavailable');
        if (typeof handle.embed === 'function') {
          return handle.embed(prompt, embedOptions);
        }
        if (typeof handle.embedBatch === 'function') {
          const batch = await handle.embedBatch([prompt], embedOptions);
          return Array.isArray(batch) ? batch[0] : null;
        }
        const prefill = handle.advanced && handle.advanced.prefillWithEmbedding || handle.prefillWithEmbedding;
        return prefill.call(handle.advanced || handle, prompt, embedOptions);
      }

    function embeddingResultWithProvenance(result, handle, runtime, backend, modelBaseUrl) {
        const provenance = modelHandleProvenance(handle, runtime, modelBaseUrl);
        return withEmbeddingProvenance({
          embedding: result && result.embedding,
          embedModelId: provenance.embedModelId,
          embedModelHash: provenance.embedModelHash,
          modelSource: {
            ...provenance.modelSource,
            sourceKind: backend,
            modelBaseUrl,
          },
        }, runtime);
      }

    function embeddingHasPositiveNorm(vector) {
        if (!vector || typeof vector.length !== 'number') return false;
        let normSq = 0;
        for (let i = 0; i < vector.length; i += 1) {
          const value = Number(vector[i]);
          if (!Number.isFinite(value)) return false;
          normSq += value * value;
        }
        return Number.isFinite(normSq) && normSq > 0;
      }

    function embeddingProviderInput(args = {}, runtime) {
        const rawText = String(args && args.text || '');
        const embeddingKind = String(args && (args.embeddingKind || args.kind) || 'query');
        return {
          ...args,
          text: formatEmbeddingText(rawText, runtime, embeddingKind),
          rawText,
          embeddingKind,
          embeddingMode: embeddingModeForRuntime(runtime),
        };
      }

    function embeddingModeForRuntime(runtime) {
        const mode = String(runtime && runtime.manifest && runtime.manifest.runtime && runtime.manifest.runtime.queryEmbeddingMode || '').trim();
        if (!mode) throw new Error('intent runtime missing queryEmbeddingMode');
        return mode;
      }

    function formatEmbeddingText(text, runtime, kind = 'query') {
        const value = String(text || '').trim();
        if (!value) return '';
        const contract = runtime && runtime.manifest && runtime.manifest.runtime && runtime.manifest.runtime.embeddingText || {};
        const prefixKey = kind === 'document' ? 'documentPrefix' : 'queryPrefix';
        const suffixKey = kind === 'document' ? 'documentSuffix' : 'querySuffix';
        return `${String(contract[prefixKey] || '')}${value}${String(contract[suffixKey] || '')}`;
      }

    function modelHandleProvenance(handle, runtime, modelBaseUrl = '') {
        const handleManifest = handle && handle.manifest || {};
        const rawModelId = handle && (handle.modelId || handleManifest.modelId) || '';
        const rawHash = handle && handle.manifestHash || handleManifest.modelHash ||
          handleManifest.manifestHash || handleManifest.hash ||
          handleManifest.meta && handleManifest.meta.hash || null;
        assertPinnedModelHandle(handle, runtime.manifest.embedModel, 'embedding', modelBaseUrl);
        return normalizeEmbeddingModelProvenance(rawModelId, rawHash, runtime, modelBaseUrl);
      }

    function normalizeEmbeddingModelProvenance(rawModelId, rawHash, runtime, modelBaseUrl = '') {
        const expectedModel = runtime.manifest.embedModel;
        const expectedHash = expectedModel.manifestHash;
        const normalizedSource = normalizeModelSource(modelBaseUrl || rawModelId);
        const expectedSource = normalizeModelSource(expectedModel.defaultModelBaseUrl);
        const rawSourceMatches = normalizedSource && expectedSource && normalizedSource === expectedSource;
        const rawIdMatches = String(rawModelId || '') === expectedModel.id;
        const rawHashMatches = hashHex(rawHash) === hashHex(expectedHash);
        if (rawHashMatches && (!rawModelId || rawSourceMatches || rawIdMatches)) {
          return {
            embedModelId: expectedModel.id,
            embedModelHash: expectedHash,
            modelSource: { rawModelId, rawEmbedModelHash: rawHash },
          };
        }
        return {
          embedModelId: rawModelId,
          embedModelHash: rawHash,
          modelSource: { rawModelId, rawEmbedModelHash: rawHash },
        };
      }

    function normalizeModelSource(value) {
        return String(value || '').trim().replace(/\/+$/, '');
      }

    function modelLabel(manifest) {
        const model = manifest && manifest.embedModel || {};
        return String(model.family || model.id || 'intent model');
      }

    function modelSlug(value) {
        const slug = String(value || 'intent-model')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '');
        return slug || 'intent-model';
      }

    function rerankerConfig(runtimeOrManifest) {
        const manifest = runtimeOrManifest && runtimeOrManifest.manifest
          ? runtimeOrManifest.manifest
          : runtimeOrManifest || {};
        const raw = manifest.reranker || manifest.retrieval && manifest.retrieval.reranker || {};
        const embedModelId = manifest.embedModel && manifest.embedModel.id
          || runtimeOrManifest && runtimeOrManifest.index && runtimeOrManifest.index.embedModelId
          || '';
        const id = String(raw.id || `simulatte.${modelSlug(embedModelId)}-reranker.v1`);
        return {
          schema: raw.schema || 'simulatte.intentRerankerConfig.v1',
          id,
          kind: raw.kind || 'doppler-reranker',
          phase: Number(raw.phase || 3),
          enabled: raw.enabled !== false,
          required: raw.required === true,
          loadInPhase1WhenRequired: raw.loadInPhase1WhenRequired !== false,
          executeInPhase: Number(raw.executeInPhase || raw.phase || 3),
          inputSchema: raw.inputSchema || 'simulatte.intentRerankInput.v1',
          outputSchema: raw.outputSchema || 'simulatte.intentRerank.v1',
          maxCandidatesPerCall: Math.max(1, Number(raw.maxCandidatesPerCall || 1)),
          maxSlotCandidatesPerCall: Math.max(1, Number(raw.maxSlotCandidatesPerCall || 1)),
          maxCandidateTermsPerDocument: Math.max(1, Number(raw.maxCandidateTermsPerDocument || 1)),
          scoreCacheMaxEntries: Math.max(1, Number(raw.scoreCacheMaxEntries || 1)),
          fallbackMode: raw.fallbackMode || 'heuristic-fusion',
          execution: raw.execution && typeof raw.execution === 'object' ? cloneJsonValue(raw.execution) : null,
          candidateScope: Array.isArray(raw.candidateScope) ? raw.candidateScope.slice() : [],
          model: raw.model && typeof raw.model === 'object' ? cloneJsonValue(raw.model) : null,
          runtimeConfig: raw.runtimeConfig && typeof raw.runtimeConfig === 'object' ? cloneJsonValue(raw.runtimeConfig) : null,
        };
      }

    function rerankerRequired(runtime) {
        const config = rerankerConfig(runtime);
        return config.enabled === true
          && config.required === true
          && config.loadInPhase1WhenRequired !== false;
      }

    function rerankerId(runtime) {
        return rerankerConfig(runtime).id;
      }

    function withEmbeddingProvenance(result, runtime) {
        const rawModelId = result && result.embedModelId || '';
        const rawHash = result && result.embedModelHash || null;
        const provenance = normalizeEmbeddingModelProvenance(rawModelId, rawHash, runtime);
        const modelSource = {
          ...(result && result.modelSource || {}),
          ...provenance.modelSource,
        };
        return {
          embedding: result && result.embedding,
          embedModelId: provenance.embedModelId,
          embedModelHash: provenance.embedModelHash,
          modelSource,
        };
      }

    function normalizeRerankProvider(provider, backend) {
        const rerank = rerankFunctionForTarget(provider);
        if (!rerank) throw new Error('rerank provider must expose rerank(input)');
        return {
          backend: provider && provider.backend || backend,
          rerank,
        };
      }

    function slotQueryText(slot = {}, promptText = '') {
        const queries = (slot.queries || []).map((query) => query && query.text || '').filter(Boolean);
        const raw = [slot.entryId, ...(slot.relationIds || []), ...queries].filter(Boolean).join(' ');
        const normalized = slotQueryTerms(raw).join(' ');
        const promptTerms = slotQueryTerms(promptText).join(' ');
        if (slot.slotRole === 'visual') return `visual evidence ${normalized} ${promptTerms}`.trim();
        if (slot.slotRole === 'relation') return `relation evidence ${normalized} ${promptTerms}`.trim();
        return normalized || String(slot.slotId || slot.entryId || '');
      }

    function slotQueryTerms(value = '') {
        const stop = new Set([
          'actor', 'object', 'action', 'environment', 'medium',
          'relation', 'visual', 'slot', 'required',
        ]);
        return uniqueStrings(fallbackFeatureTokens(String(value || '').replace(/\b[a-z]+:/gi, ' '))
          .filter((term) => !stop.has(term)));
      }

    function slotCandidateBudget(slot = {}, key = '', maximum = 0) {
        const configured = Number(slot && slot.budgets && slot.budgets[key]);
        const limit = Math.max(0, Number(maximum || 0));
        return Number.isFinite(configured) ? Math.min(limit, Math.max(0, configured)) : limit;
      }

    function slotAllowsCandidateType(slot = {}, type = '') {
        const allowed = Array.isArray(slot.allowedCandidateTypes) ? slot.allowedCandidateTypes : [];
        return !allowed.length || allowed.includes(type);
      }

    function slotFocusTerms(slot = {}) {
        const lexicalQueries = (slot.queries || []).filter((query) => query && query.kind === 'lexical')
          .flatMap((query) => fallbackFeatureTokens(query.text || ''));
        if (lexicalQueries.length) return uniqueStrings(lexicalQueries);
        if (slot.slotRole === 'relation') {
          const structured = (slot.queries || []).flatMap((query) => {
            const terms = [];
            const text = String(query && query.text || '').toLowerCase();
            const pattern = /\b(?:action|predicate):([a-z0-9-]+)/g;
            let match;
            while ((match = pattern.exec(text))) terms.push(match[1]);
            return terms;
          });
          if (structured.length) return uniqueStrings(structured.flatMap(fallbackFeatureTokens));
          const parts = String(slot.entryId || '').split(':').filter(Boolean);
          if (parts.length >= 3) return fallbackFeatureTokens(parts[2]);
        }
        return fallbackFeatureTokens(String(slot.entryId || '').replace(/^[a-z]+:/, ' '));
      }

    function slotFocusLexicalScore(slot = {}, text = '') {
        const terms = slotFocusTerms(slot);
        const tokens = new Set(fallbackFeatureTokens(text));
        if (!terms.length || !tokens.size) return 0;
        return clamp01(terms.filter((term) => tokens.has(term)).length / terms.length);
      }

    function slotCandidateRolePriority(slot = {}, row = {}) {
        const id = String(row.candidateId || row.primitiveId || row.id || '');
        const indexName = String(row.indexName || '').toLowerCase();
        const type = String(row.candidateType || '');
        if (slot.slotRole === 'relation') {
          if (indexName === 'relations' || id.startsWith('relation.')) return 0;
          if (indexName === 'operators' || id.startsWith('operator.')) return 1;
          if (type === 'primitive' || type === 'surface-card') return 2;
          return 3;
        }
        if (slot.slotRole === 'visual') return type === 'surface-card' ? 0 : 2;
        return 0;
      }

    Object.assign(scope, {
      slotRetrievalEvidenceRows,
      usefulRetrievalSpans,
      dedupeSpanRows,
      spanPrimitiveMatch,
      annotateSpanCandidate,
      spanUniverseCandidates,
      fuseSpanPrimitiveScores,
      spanEvidenceRows,
      spanLanguageEvidence,
      resolveLanguageEvidenceApi,
      normalizeSpanText,
      rankSurfaceCards,
      rankUniverseIndexes,
      featureQueryForIndex,
      universeCandidateForDocument,
      universeLabels,
      uniqueStrings,
      promptTokens,
      buildUniverseFeatureVector,
      runtimeFeatureModelId,
      fallbackSemanticFeatureVector,
      fallbackFeatureTokens,
      normalizeFeatureToken,
      addFeature,
      addCharNgrams,
      hashString,
      validateQueryEmbedding,
      rerankFunctionForTarget,
      normalizeEmbedProvider,
      providerFromModelHandle,
      embedWithModelHandle,
      embeddingResultWithProvenance,
      embeddingHasPositiveNorm,
      embeddingProviderInput,
      embeddingModeForRuntime,
      formatEmbeddingText,
      modelHandleProvenance,
      normalizeEmbeddingModelProvenance,
      normalizeModelSource,
      modelLabel,
      modelSlug,
      rerankerConfig,
      rerankerRequired,
      rerankerId,
      withEmbeddingProvenance,
      normalizeRerankProvider,
      slotQueryText,
      slotQueryTerms,
      slotCandidateBudget,
      slotAllowsCandidateType,
      slotFocusTerms,
      slotFocusLexicalScore,
      slotCandidateRolePriority,
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
