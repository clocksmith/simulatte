(function attachSimulatteIntentEmbedderspanretrieval(root) {
  const scope = root.__SimulatteIntentEmbedderRefactorScope;
  if (!scope || scope.missingDependency) return;
  with (scope) {
    function spanReceiptConfig(config = {}) {
        return {
          enabled: Boolean(config.enabled),
          mode: config.mode || '',
          fullPromptFirst: config.fullPromptFirst !== false,
          batchEmbedding: config.batchEmbedding !== false,
          cache: config.cache !== false,
          dedupe: config.dedupe !== false,
          maxSpans: Number(config.maxSpans || 0),
          minChars: Number(config.minChars || 0),
          maxChars: Number(config.maxChars || 0),
          includeKinds: normalizeStringList(config.includeKinds),
          perSpanPrimitiveMax: Number(config.perSpanPrimitiveMax || 0),
          perSpanCardMax: Number(config.perSpanCardMax || 0),
          perSpanUniverseMax: Number(config.perSpanUniverseMax || 0),
          perSpanCandidateMax: Number(config.perSpanCandidateMax || 0),
          primitiveScoreFloor: Number(config.primitiveScoreFloor || 0),
          surfaceScoreFloor: Number(config.surfaceScoreFloor || 0),
          universeScoreFloor: Number(config.universeScoreFloor || 0),
          primitiveRankBackend: config.primitiveRankBackend || 'cpu',
        };
      }

    function normalizeStringList(value) {
        if (!Array.isArray(value)) return [];
        return uniqueStrings(value.map((item) => String(item || '').trim()).filter(Boolean));
      }

    function boundedInteger(value, min, max, fallback) {
        const parsed = Math.floor(Number(value));
        if (!Number.isFinite(parsed)) return fallback;
        return Math.max(min, Math.min(max, parsed));
      }

    function boundedNumber(value, min, max, fallback) {
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) return fallback;
        return Math.max(min, Math.min(max, parsed));
      }

    async function embedSpanQueries(payload = {}) {
        const provider = payload.provider;
        const spans = payload.spans || [];
        const config = payload.config || {};
        const cache = config.cache && payload.cache && typeof payload.cache.get === 'function' ? payload.cache : null;
        const nowIso = payload.options && payload.options.nowIso || new Date().toISOString();
        const progress = payload.progress || null;
        const trace = Boolean(payload.traceEnabled);
        const traceId = payload.traceId || '';
        const rankId = payload.rankId || 0;
        const started = nowMs();
        const cacheKeyFor = (span) => [
          payload.runtime && payload.runtime.index && payload.runtime.index.embedModelHash || '',
          payload.runtime && payload.runtime.index && payload.runtime.index.embeddingDim || '',
          normalizeSpanText(span.text),
        ].join(':');
        const pending = [];
        const rows = spans.map((span) => {
          const cacheKey = cacheKeyFor(span);
          const cached = cache && cache.get(cacheKey);
          if (cached) return { span, query: cached, cacheHit: true };
          const row = { span, query: null, cacheHit: false, cacheKey };
          pending.push(row);
          return row;
        });
        const cacheHitCount = rows.length - pending.length;
        emitRuntimeProgress(progress, trace, {
          source: 'simulatte-intent-embedder',
          stage: 'span-cache',
          percent: 89,
          message: `Span embedding cache ${cacheHitCount}/${rows.length}`,
          traceId,
          rankId,
          spanCount: rows.length,
          cacheHitCount,
          cacheMissCount: pending.length,
          cacheEnabled: Boolean(cache),
          durationMs: elapsedMsSince(started),
        });
        if (!pending.length) return rows;
        const requestRows = pending.map((row) => ({
          text: row.span.text,
          nowIso,
          spanId: row.span.id,
          spanKind: row.span.kind,
        }));
        const embedStarted = nowMs();
        emitRuntimeProgress(progress, trace, {
          source: 'simulatte-intent-embedder',
          stage: 'span-embed',
          percent: 90,
          message: config.batchEmbedding
            ? `Embedding ${pending.length} uncached spans as a batch`
            : `Embedding ${pending.length} uncached spans`,
          timing: 'start',
          traceId,
          rankId,
          spanCount: rows.length,
          cacheMissCount: pending.length,
          batchEmbedding: Boolean(config.batchEmbedding),
        });
        const batchResult = config.batchEmbedding ? await embedSpanBatch(provider, requestRows) : null;
        if (batchResult && batchResult.length === pending.length) {
          pending.forEach((row, index) => {
            row.query = batchResult[index];
            if (cache) cache.set(row.cacheKey, row.query);
          });
          emitRuntimeProgress(progress, trace, {
            source: 'simulatte-intent-embedder',
            stage: 'span-embed',
            percent: 92,
            message: 'Span batch embeddings ready',
            timing: 'end',
            traceId,
            rankId,
            spanCount: rows.length,
            embeddedSpanCount: pending.length,
            cacheHitCount,
            cacheMissCount: pending.length,
            batchEmbedding: true,
            durationMs: elapsedMsSince(embedStarted),
          });
          return rows;
        }
        for (const row of pending) {
          row.query = await provider.embed({
            text: row.span.text,
            nowIso,
            spanId: row.span.id,
            spanKind: row.span.kind,
          });
          if (cache) cache.set(row.cacheKey, row.query);
        }
        emitRuntimeProgress(progress, trace, {
          source: 'simulatte-intent-embedder',
          stage: 'span-embed',
          percent: 92,
          message: 'Span embeddings ready',
          timing: 'end',
          traceId,
          rankId,
          spanCount: rows.length,
          embeddedSpanCount: pending.length,
          cacheHitCount,
          cacheMissCount: pending.length,
          batchEmbedding: false,
          durationMs: elapsedMsSince(embedStarted),
        });
        return rows;
      }

    async function embedSpanBatch(provider, requestRows) {
        if (!provider || !requestRows.length) return null;
        if (typeof provider.embedBatch === 'function') {
          return provider.embedBatch(requestRows);
        }
        if (typeof provider.embedMany === 'function') {
          return provider.embedMany(requestRows);
        }
        return null;
      }

    async function safeSpanGpuRank(rankGpu, vector) {
        if (typeof rankGpu !== 'function') return null;
        try {
          return await rankGpu(vector);
        } catch (_err) {
          return null;
        }
      }

    function emitIntentPreview(options, result) {
        if (!options || typeof options.onPreview !== 'function') return;
        try {
          options.onPreview(result);
        } catch (_err) {}
      }

    async function rankPromptSpans(payload = {}) {
        const runtime = payload.runtime;
        const provider = payload.provider;
        const candidates = payload.candidates || [];
        const candidateVectors = payload.candidateVectors || [];
        const config = spanConfigFor(runtime, payload.options || {}, payload.instanceConfig);
        const spans = usefulRetrievalSpans(payload.languageEvidence, config);
        const bySpan = [];
        if (!config.enabled || !spans.length || !runtime || !provider || typeof provider.embed !== 'function') {
          return emptySpanRetrieval(spans, config, config.enabled ? 'empty' : 'disabled');
        }
        const started = nowMs();
        emitRuntimeProgress(payload.progress, payload.traceEnabled, {
          source: 'simulatte-intent-embedder',
          stage: 'span-retrieval',
          percent: 88,
          message: `Embedding ${spans.length} language spans`,
          spanCount: spans.length,
          traceId: payload.traceId || '',
          rankId: payload.rankId || 0,
        });
        const queries = await embedSpanQueries({
          provider,
          runtime,
          spans,
          config,
          options: payload.options || {},
          cache: payload.embedCache,
          progress: payload.progress,
          traceEnabled: payload.traceEnabled,
          traceId: payload.traceId || '',
          rankId: payload.rankId || 0,
        });
        const rankStarted = nowMs();
        for (const item of queries) {
          if (!item || !item.span || !item.query) continue;
          const span = item.span;
          const vector = validateQueryEmbedding(item.query, runtime.index);
          const gpuScores = config.primitiveRankBackend === 'webgpu' || config.primitiveRankBackend === 'auto'
            ? await safeSpanGpuRank(payload.rankGpu, vector)
            : null;
          const scores = gpuScores || rankCpu(vector, candidateVectors);
          const primitiveMatches = candidates
            .map((primitive, index) => spanPrimitiveMatch(span, primitive, scores[index]))
            .filter((row) => row.score >= config.primitiveScoreFloor)
            .sort((a, b) => b.score - a.score || a.primitiveId.localeCompare(b.primitiveId))
            .slice(0, config.perSpanPrimitiveMax);
          const cardMatches = rankSurfaceCards(runtime.cardIndex, vector, {
            ...payload.options,
            maxCards: config.perSpanCardMax,
            minCardScore: config.surfaceScoreFloor,
          }).slice(0, config.perSpanCardMax).map((row) => annotateSpanCandidate(row, span, 'span-surface-card'));
          const universeMatches = rankUniverseIndexes(runtime.universe, span.text, vector, {
            ...payload.options,
            maxUniverse: config.perSpanUniverseMax,
            minUniverseScore: config.universeScoreFloor,
          });
          bySpan.push({
            spanId: span.id,
            spanKind: span.kind,
            spanText: span.text,
            vectorHash: embeddingVectorHash(vector),
            cacheHit: Boolean(item.cacheHit),
            primitiveRankBackend: gpuScores ? 'webgpu' : 'cpu',
            candidates: [
              ...primitiveMatches,
              ...cardMatches,
              ...spanUniverseCandidates(universeMatches, span, config.perSpanUniverseMax),
            ].slice(0, config.perSpanCandidateMax),
          });
        }
        emitRuntimeProgress(payload.progress, payload.traceEnabled, {
          source: 'simulatte-intent-embedder',
          stage: 'span-rank',
          percent: 94,
          message: 'Span retrieval ranked',
          traceId: payload.traceId || '',
          rankId: payload.rankId || 0,
          durationMs: elapsedMsSince(rankStarted),
          spanCount: spans.length,
          embeddedSpanCount: bySpan.length,
          cachedSpanCount: bySpan.filter((row) => row.cacheHit).length,
        });
        const evidenceRows = spanEvidenceRows({ bySpan });
        return {
          schema: 'simulatte.spanEmbeddingRetrieval.v1',
          model: runtime.manifest && runtime.manifest.embedModel && runtime.manifest.embedModel.id || '',
          config: spanReceiptConfig(config),
          spanCount: spans.length,
          embeddedSpanCount: bySpan.length,
          cachedSpanCount: bySpan.filter((row) => row.cacheHit).length,
          durationMs: elapsedMsSince(started),
          bySpan,
          evidenceRows,
          candidateCount: bySpan.reduce((sum, row) => sum + row.candidates.length, 0),
        };
      }

    function emptySpanRetrieval(spans, config = null, reason = 'empty') {
        return {
          schema: 'simulatte.spanEmbeddingRetrieval.v1',
          model: '',
          disabledReason: reason,
          config: spanReceiptConfig(config || {}),
          spanCount: spans.length,
          embeddedSpanCount: 0,
          cachedSpanCount: 0,
          bySpan: [],
          evidenceRows: [],
          candidateCount: 0,
        };
      }

    async function rankQueryPlanSlots(payload = {}) {
        const runtime = payload.runtime;
        const provider = payload.provider;
        const candidates = payload.candidates || [];
        const candidateVectors = payload.candidateVectors || [];
        const config = slotRetrievalConfig(runtime, payload.options || {});
        const slots = usefulQueryPlanSlots(payload.queryPlan, config);
        if (!config.enabled || !slots.length || !runtime || !provider || typeof provider.embed !== 'function') {
          return emptySlotRetrieval(slots, config, config.enabled ? 'empty' : 'disabled', payload.queryPlan);
        }
        const started = nowMs();
        const bySlot = [];
        let rerankCallCount = 0;
        emitRuntimeProgress(payload.progress, payload.traceEnabled, {
          source: 'simulatte-intent-embedder',
          stage: 'slot-retrieval',
          percent: 94.1,
          message: `Embedding ${slots.length} scene retrieval slots`,
          slotCount: slots.length,
          traceId: payload.traceId || '',
          rankId: payload.rankId || 0,
        });
        const nowIso = payload.options && payload.options.nowIso || new Date().toISOString();
        const slotRequests = slots.map((slot) => ({
          text: slotQueryText(slot),
          nowIso,
          slotId: slot.slotId || '',
          slotRole: slot.slotRole || '',
        }));
        const batchedSlotQueries = typeof provider.embedMany === 'function'
          ? await provider.embedMany(slotRequests)
          : null;
        const useBatchedSlotQueries = Array.isArray(batchedSlotQueries) && batchedSlotQueries.length === slots.length;
        for (let i = 0; i < slots.length; i += 1) {
          const slot = slots[i];
          const queryText = slotRequests[i].text;
          const query = useBatchedSlotQueries
            ? batchedSlotQueries[i]
            : await provider.embed(slotRequests[i]);
          const vector = validateQueryEmbedding(query, runtime.index);
          const gpuScores = config.primitiveRankBackend === 'webgpu' || config.primitiveRankBackend === 'auto'
            ? await safeSpanGpuRank(payload.rankGpu, vector)
            : null;
          const scores = gpuScores || rankCpu(vector, candidateVectors);
          const primitiveMatches = candidates
            .map((primitive, index) => slotPrimitiveMatch(slot, primitive, scores[index], config))
            .filter((row) => row.score >= config.primitiveScoreFloor || row.lexicalScore > 0)
            .sort(slotCandidateSort)
            .slice(0, config.perSlotPrimitiveMax);
          const cardMatches = rankSurfaceCardsForSlot(runtime.cardIndex, slot, vector, config, payload.options);
          const universeMatches = rankUniverseIndexes(runtime.universe, queryText, vector, {
            ...payload.options,
            maxUniverse: config.perSlotUniverseMax,
            minUniverseScore: config.universeScoreFloor,
          });
          const universeRows = slotUniverseCandidates(slot, universeMatches, config.perSlotUniverseMax);
          const ranked = uniqueSlotCandidates([
            ...primitiveMatches,
            ...cardMatches,
            ...universeRows,
          ]).sort(slotCandidateSort).slice(0, config.perSlotCandidateMax);
          const reranked = await rerankSlotCandidates({
            candidates: ranked,
            provider,
            rerankProvider: payload.rerankProvider,
            runtime,
            promptText: payload.promptText,
            slot,
          });
          if (reranked.rerankCall) rerankCallCount += 1;
          bySlot.push({
            schema: 'simulatte.phase3ModelSlotRetrievalRow.v1',
            slotId: slot.slotId || '',
            slotRole: slot.slotRole || '',
            entryId: slot.entryId || '',
            required: slot.required !== false,
            queryText,
            vectorHash: embeddingVectorHash(vector),
            primitiveRankBackend: gpuScores ? 'webgpu' : 'cpu',
            rerankerMode: reranked.receipt.rerankerMode,
            rerankerModelReady: reranked.receipt.modelReady,
            candidates: reranked.candidates,
            acceptedCandidates: reranked.candidates.filter((row) => row.supportOnly !== true).slice(0, config.perSlotAcceptedMax),
            supportOnlyCandidates: reranked.candidates.filter((row) => row.supportOnly === true),
            receipt: reranked.receipt,
          });
          emitRuntimeProgress(payload.progress, payload.traceEnabled, {
            source: 'simulatte-intent-embedder',
            stage: 'slot-rank',
            percent: 94.1 + (i + 1) / Math.max(1, slots.length) * 1.3,
            message: `Scene slot ${i + 1}/${slots.length} ranked`,
            traceId: payload.traceId || '',
            rankId: payload.rankId || 0,
            slotId: slot.slotId || '',
            slotRole: slot.slotRole || '',
            candidateCount: reranked.candidates.length,
          });
        }
        return {
          schema: 'simulatte.phase3SlotRetrieval.v1',
          queryPlanSchema: payload.queryPlan && payload.queryPlan.schema || '',
          sourcePromptHash: payload.queryPlan && payload.queryPlan.sourcePromptHash || '',
          model: runtime.manifest && runtime.manifest.embedModel && runtime.manifest.embedModel.id || '',
          config: slotRetrievalReceiptConfig(config),
          slotCount: slots.length,
          embeddedSlotCount: bySlot.length,
          rerankCallCount,
          durationMs: elapsedMsSince(started),
          bySlot,
          evidenceRows: slotRetrievalEvidenceRows({ bySlot }),
          candidateCount: bySlot.reduce((sum, row) => sum + row.candidates.length, 0),
          acceptedCandidateCount: bySlot.reduce((sum, row) => sum + row.acceptedCandidates.length, 0),
        };
      }

    function emptySlotRetrieval(slots, config = null, reason = 'empty', queryPlan = null) {
        return {
          schema: 'simulatte.phase3SlotRetrieval.v1',
          queryPlanSchema: queryPlan && queryPlan.schema || '',
          sourcePromptHash: queryPlan && queryPlan.sourcePromptHash || '',
          model: '',
          disabledReason: reason,
          config: slotRetrievalReceiptConfig(config || {}),
          slotCount: slots.length,
          embeddedSlotCount: 0,
          rerankCallCount: 0,
          bySlot: [],
          evidenceRows: [],
          candidateCount: 0,
          acceptedCandidateCount: 0,
        };
      }

    function slotRetrievalConfig(runtime, options = {}) {
        const manifestConfig = runtime && runtime.manifest && runtime.manifest.retrieval && runtime.manifest.retrieval.slotLevel || {};
        const optionConfig = typeof options.slotLevelRetrieval === 'object' && options.slotLevelRetrieval
          ? options.slotLevelRetrieval
          : {};
        return {
          enabled: options.slotLevelRetrieval !== false,
          mode: 'typed-scene-slot-embedding-rerank',
          maxSlots: 32,
          perSlotPrimitiveMax: 10,
          perSlotCardMax: 8,
          perSlotUniverseMax: 10,
          perSlotCandidateMax: 24,
          perSlotAcceptedMax: 8,
          primitiveScoreFloor: 0.14,
          surfaceScoreFloor: 0.18,
          universeScoreFloor: 0.12,
          primitiveRankBackend: 'cpu',
          ...manifestConfig,
          ...optionConfig,
        };
      }

    function slotRetrievalReceiptConfig(config = {}) {
        return {
          enabled: config.enabled !== false,
          mode: config.mode || 'typed-scene-slot-embedding-rerank',
          maxSlots: Number(config.maxSlots || 0),
          perSlotPrimitiveMax: Number(config.perSlotPrimitiveMax || 0),
          perSlotCardMax: Number(config.perSlotCardMax || 0),
          perSlotUniverseMax: Number(config.perSlotUniverseMax || 0),
          perSlotCandidateMax: Number(config.perSlotCandidateMax || 0),
          perSlotAcceptedMax: Number(config.perSlotAcceptedMax || 0),
          primitiveRankBackend: config.primitiveRankBackend || 'cpu',
        };
      }

    function usefulQueryPlanSlots(queryPlan, config = {}) {
        const max = Number.isFinite(config.maxSlots) ? config.maxSlots : 32;
        return (queryPlan && Array.isArray(queryPlan.slots) ? queryPlan.slots : [])
          .filter((slot) => slot && (slot.slotId || slot.entryId))
          .slice(0, max);
      }

    function slotQueryText(slot = {}) {
        const queries = (slot.queries || []).map((query) => query && query.text || '').filter(Boolean);
        const raw = [
          slot.entryId,
          ...(slot.relationIds || []),
          ...queries,
        ].filter(Boolean).join(' ');
        const normalized = slotQueryTerms(raw).join(' ');
        if (slot.slotRole === 'visual') return `visual evidence ${normalized}`;
        if (slot.slotRole === 'relation') return `relation evidence ${normalized}`;
        return normalized || String(slot.slotId || slot.entryId || '');
      }

    function slotQueryTerms(value = '') {
        const stop = new Set([
          'actor',
          'object',
          'action',
          'environment',
          'medium',
          'relation',
          'visual',
          'slot',
          'required',
        ]);
        return uniqueStrings(fallbackFeatureTokens(String(value || '').replace(/\b[a-z]+:/gi, ' '))
          .filter((term) => !stop.has(term)));
      }

    function slotPrimitiveMatch(slot = {}, primitive = {}, rawScore = 0, config = {}) {
        const candidateText = [
          primitive.id,
          primitive.label,
          primitive.role,
          primitive.type,
          primitive.layer,
          primitive.text,
          ...(primitive.domains || []),
        ].filter(Boolean).join(' ');
        const lexicalScore = slotLexicalScore(slot, candidateText);
        const modelScore = clamp01(Number(rawScore || 0));
        const literalSlotBoost = lexicalScore > 0 && slot.slotRole !== 'support' ? 0.35 : 0;
        const score = clamp01(modelScore * 0.45 + lexicalScore * 0.35 + literalSlotBoost);
        const supportOnly = slot.slotRole !== 'support' && phase3SupportLikePrimitiveId(primitive.id);
        return {
          id: primitive.id,
          candidateId: primitive.id,
          primitiveId: primitive.id,
          candidateType: 'primitive',
          slotId: slot.slotId || '',
          slotRole: slot.slotRole || '',
          entryId: slot.entryId || '',
          label: primitive.label || primitive.role || primitive.id,
          candidateText: primitive.text || primitive.role || primitive.id,
          layer: primitive.layer || '',
          type: primitive.type || '',
          domains: primitive.domains || [],
          source: 'slot-primitive-embedding',
          score: Number(score.toFixed(4)),
          modelScore: Number(modelScore.toFixed(4)),
          lexicalScore: Number(lexicalScore.toFixed(4)),
          supportOnly,
          reason: supportOnly ? 'generic support physics cannot satisfy literal scene slot' : 'embedding candidate ranked for typed scene slot',
          retrievalKind: 'slot-retrieval',
        };
      }

    function slotSurfaceCandidate(slot = {}, row = {}) {
        return {
          ...row,
          id: row.cardId || row.id || '',
          candidateId: row.cardId || row.id || '',
          candidateType: 'surface-card',
          slotId: slot.slotId || '',
          slotRole: slot.slotRole || '',
          entryId: slot.entryId || '',
          source: row.source || 'slot-surface-card-index',
          lexicalScore: row.lexicalScore,
          supportOnly: false,
          reason: 'surface card ranked for typed scene slot',
          retrievalKind: 'slot-retrieval',
        };
      }

    function rankSurfaceCardsForSlot(cardIndex, slot = {}, vector = null, config = {}, options = {}) {
        if (!cardIndex) return [];
        const modelRows = rankSurfaceCards(cardIndex, vector, {
          ...options,
          maxCards: Math.max(config.perSlotCardMax || 0, 12),
          minCardScore: config.surfaceScoreFloor,
        }).map((row) => slotSurfaceCandidate(slot, row));
        const lexicalRows = (cardIndex.documents || []).map((doc) => {
          const modelScore = vector && doc.vector ? clamp01(dot(vector, doc.vector)) : 0;
          const lexicalScore = slotLexicalScore(slot, [
            doc.cardId,
            doc.type,
            doc.candidateText,
            ...(doc.labels || []),
          ].filter(Boolean).join(' '));
          const literalSlotBoost = lexicalScore > 0 && slot.slotRole !== 'support' ? 0.35 : 0;
          const score = clamp01(modelScore * 0.45 + lexicalScore * 0.35 + literalSlotBoost);
          const candidate = slotSurfaceCandidate(slot, {
            cardId: doc.cardId,
            type: doc.type || '',
            labels: Array.isArray(doc.labels) ? doc.labels.slice(0, 5) : [],
            score: Number(score.toFixed(4)),
            modelScore: Number(modelScore.toFixed(4)),
            lexicalScore: Number(lexicalScore.toFixed(4)),
            semanticScore: Number(modelScore.toFixed(4)),
            source: `${modelSlug(cardIndex.embedModelId)}-surface-card-slot-index`,
            indexId: cardIndex.id,
            textHash: doc.textHash || null,
            candidateText: doc.candidateText || '',
          });
          if (slotCandidateLiteralMatch(slot, candidate)) {
            candidate.literalSlotMatch = true;
            candidate.score = Math.max(Number(candidate.score || 0), 0.99);
          }
          return candidate;
        }).filter((row) => row.score >= config.surfaceScoreFloor || Number(row.lexicalScore || 0) > 0);
        const exactRows = lexicalRows.filter((row) => slotCandidateLiteralMatch(slot, row));
        return uniqueSlotCandidates([
          ...exactRows.sort(slotCandidateSort),
          ...lexicalRows.sort(slotCandidateSort),
          ...modelRows.sort(slotCandidateSort),
        ])
          .slice(0, config.perSlotCardMax);
      }

    function slotCandidateLiteralMatch(slot = {}, row = {}) {
        const target = normalizeSpanText(String(slot.entryId || '').replace(/^[a-z]+:/, ''));
        if (!target) return false;
        const tokens = fallbackFeatureTokens([
          row.candidateId,
          row.cardId,
          row.id,
          row.label,
          row.candidateText,
          ...(row.labels || []),
        ].filter(Boolean).join(' '));
        return tokens.includes(target);
      }

    function slotUniverseCandidates(slot = {}, universeMatches = {}, max = 10) {
        return (universeMatches && universeMatches.candidates || []).slice(0, max).map((row) => ({
          ...row,
          id: row.id || row.canonicalId || '',
          candidateId: row.id || row.canonicalId || '',
          candidateType: 'universe-row',
          slotId: slot.slotId || '',
          slotRole: slot.slotRole || '',
          entryId: slot.entryId || '',
          source: row.indexName || row.source || 'slot-universe-index',
          supportOnly: false,
          reason: 'universe row ranked for typed scene slot',
          retrievalKind: 'slot-retrieval',
        }));
      }

    async function rerankSlotCandidates(payload = {}) {
        const rows = payload.candidates || [];
        const config = rerankerConfig(payload.runtime);
        const capability = resolveRerankerCapability(payload.provider, {
          rerankProvider: payload.rerankProvider,
          dopplerModelHandle: null,
        });
        const required = rerankerRequired(payload.runtime);
        if (!rows.length || !config.enabled || !capability) {
          if (required && config.enabled && !capability) {
            throw new Error(`intent manifest requires Doppler reranker ${config.id}, but no slot rerank capability is available`);
          }
          return {
            candidates: rows,
            rerankCall: false,
            receipt: {
              schema: 'simulatte.phase3SlotRerankReceipt.v1',
              rerankerMode: config.enabled ? 'heuristic-slot-ranking' : 'disabled',
              modelReady: false,
              modelRequired: required,
              modelStatus: config.enabled ? 'not-available' : 'disabled',
              candidateInputCount: rows.length,
              candidateOutputCount: rows.length,
            },
          };
        }
        try {
          const input = buildSlotRerankInput({
            promptText: payload.promptText,
            slot: payload.slot,
            candidates: rows,
            runtime: payload.runtime,
          });
          const result = await capability.rerank(input);
          const modelRows = normalizeRerankerRows(result);
          if (!modelRows.length) throw new Error(`Doppler reranker ${config.id} returned no slot candidates`);
          return {
            candidates: applySlotModelRerank(rows, modelRows),
            rerankCall: true,
            receipt: {
              schema: 'simulatte.phase3SlotRerankReceipt.v1',
              rerankerMode: 'doppler-reranker',
              model: config.id,
              rerankerKind: config.kind,
              modelReady: true,
              modelRequired: required,
              modelStatus: 'ready',
              modelBackend: capability.backend,
              candidateInputCount: input.candidates.length,
              candidateOutputCount: modelRows.length,
            },
          };
        } catch (err) {
          if (required) throw err;
          return {
            candidates: rows,
            rerankCall: false,
            receipt: {
              schema: 'simulatte.phase3SlotRerankReceipt.v1',
              rerankerMode: 'heuristic-slot-ranking',
              modelReady: false,
              modelRequired: false,
              modelStatus: 'fallback',
              modelBackend: capability.backend,
              fallbackReason: err && err.message ? err.message : String(err),
              candidateInputCount: rows.length,
              candidateOutputCount: rows.length,
            },
          };
        }
      }

    function buildSlotRerankInput({ promptText, slot, candidates, runtime }) {
        return {
          schema: 'simulatte.intentSlotRerankInput.v1',
          phase: 3,
          phaseId: 'retrieval',
          stage: 'typed-slot-retrieval',
          reranker: rerankerId(runtime),
          prompt: String(promptText || ''),
          slot: {
            slotId: slot && slot.slotId || '',
            slotRole: slot && slot.slotRole || '',
            entryId: slot && slot.entryId || '',
            required: !slot || slot.required !== false,
            queries: slot && slot.queries || [],
            relationIds: slot && slot.relationIds || [],
          },
          candidates: (candidates || []).map((candidate, order) => ({
            primitiveId: candidate.candidateId || candidate.primitiveId || candidate.id,
            candidateId: candidate.candidateId || candidate.primitiveId || candidate.id,
            order,
            candidateType: candidate.candidateType || '',
            slotRole: candidate.slotRole || '',
            label: candidate.label || '',
            score: Number(candidate.score || 0),
            modelScore: Number(candidate.modelScore || 0),
            lexicalScore: Number(candidate.lexicalScore || 0),
            supportOnly: candidate.supportOnly === true,
            candidateText: candidate.candidateText || '',
          })),
          max: Math.min(48, Math.max(1, (candidates || []).length)),
        };
      }

    function applySlotModelRerank(localRows, modelRows) {
        const byId = new Map((localRows || []).map((row) => [row.candidateId || row.primitiveId || row.id, { ...row }]));
        const modelIds = new Set();
        for (const modelRow of modelRows || []) {
          const existing = byId.get(modelRow.primitiveId);
          if (!existing) continue;
          modelIds.add(modelRow.primitiveId);
          const modelScore = clamp01(Number(modelRow.score || 0));
          existing.modelRerankScore = Number(modelScore.toFixed(4));
          existing.modelRerankRank = Number(modelRow.rank || 0);
          existing.modelRerankReason = modelRow.reason || '';
          existing.score = Number(Math.min(
            1,
            existing.score * SLOT_RERANK_MODEL_BLEND.localWeight + modelScore * SLOT_RERANK_MODEL_BLEND.modelWeight
          ).toFixed(4));
          byId.set(modelRow.primitiveId, existing);
        }
        if (modelIds.size) {
          for (const [candidateId, existing] of byId) {
            if (modelIds.has(candidateId)) continue;
            existing.modelRerankScore = 0;
            existing.modelRerankRank = Number.MAX_SAFE_INTEGER;
            existing.modelRerankReason = 'not returned by reranker';
            existing.score = Number(clamp01(Number(existing.score || 0) * SLOT_RERANK_MODEL_BLEND.localWeight).toFixed(4));
            byId.set(candidateId, existing);
          }
        }
        return Array.from(byId.values()).sort(slotCandidateSort);
      }

    function uniqueSlotCandidates(rows = []) {
        const seen = new Set();
        return rows.filter((row) => {
          const key = `${row.candidateType || ''}:${row.candidateId || row.primitiveId || row.id || ''}`;
          if (!key || seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      }

    function slotCandidateSort(a = {}, b = {}) {
        return (
          Number(b.score || 0) - Number(a.score || 0) ||
          String(a.candidateId || a.primitiveId || a.id || '').localeCompare(String(b.candidateId || b.primitiveId || b.id || ''))
        );
      }

    function slotLexicalScore(slot = {}, text = '') {
        const haystack = normalizeSpanText(text);
        const terms = fallbackFeatureTokens([
          slot.entryId,
          slot.slotRole,
          ...(slot.relationIds || []),
          ...((slot.queries || []).map((query) => query && query.text || '')),
        ].filter(Boolean).join(' '));
        if (!terms.length || !haystack) return 0;
        const matched = terms.filter((term) => haystack.includes(term) || haystack.includes(term.replace(/s$/, '')));
        return clamp01(matched.length / Math.max(1, Math.min(4, terms.length)));
      }

    function phase3SupportLikePrimitiveId(id = '') {
        return /\b(biomass|collision|elasticity|friction|gel|membrane|soft-body|diffusion|growth-decay|kernel|gradient|constraint)\b/.test(String(id || ''));
      }

    Object.assign(scope, {
      spanReceiptConfig,
      normalizeStringList,
      boundedInteger,
      boundedNumber,
      embedSpanQueries,
      embedSpanBatch,
      safeSpanGpuRank,
      emitIntentPreview,
      rankPromptSpans,
      emptySpanRetrieval,
      rankQueryPlanSlots,
      emptySlotRetrieval,
      slotRetrievalConfig,
      slotRetrievalReceiptConfig,
      usefulQueryPlanSlots,
      slotQueryText,
      slotQueryTerms,
      slotPrimitiveMatch,
      slotSurfaceCandidate,
      rankSurfaceCardsForSlot,
      slotCandidateLiteralMatch,
      slotUniverseCandidates,
      rerankSlotCandidates,
      buildSlotRerankInput,
      applySlotModelRerank,
      uniqueSlotCandidates,
      slotCandidateSort,
      slotLexicalScore,
      phase3SupportLikePrimitiveId,
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
