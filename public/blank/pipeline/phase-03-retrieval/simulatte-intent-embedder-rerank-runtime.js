(function attachSimulatteIntentEmbedderRerankRuntime(root) {
  const scope = root.__SimulatteIntentEmbedderRefactorScope;
  if (!scope || scope.missingDependency) return;
  with (scope) {
    function rerankProviderFromModelHandle(handle, runtime, config, backend, modelBaseUrl = '') {
      const direct = rerankFunctionForTarget(handle)
        || rerankFunctionForTarget(handle && handle.advanced);
      if (direct) {
        return {
          backend,
          rerank: (input) => direct(input),
        };
      }
      const selectedRuntime = selectedTokenRuntimeForHandle(handle);
      const execution = config && config.execution || {};
      if (execution.selectedTokenLogits === 'required' && !selectedRuntime) {
        throw new Error(`Doppler reranker ${config.id} requires selected-token logits`);
      }
      if (selectedRuntime) {
        assertPrefixRuntime(selectedRuntime, execution, config);
        return selectedTokenRerankProvider(
          handle,
          selectedRuntime,
          runtime,
          config,
          backend,
          modelBaseUrl
        );
      }
      return fullLogitRerankProvider(handle, runtime, config, backend, modelBaseUrl);
    }

    function selectedTokenRuntimeForHandle(handle) {
      const targets = [handle && handle.advanced, handle].filter(Boolean);
      const target = targets.find((row) => typeof row.prefillWithTokenLogits === 'function');
      if (!target) return null;
      return {
        target,
        tokenizeText: target.tokenizeText,
        prefillKV: target.prefillKV || target.prefillKVOnly,
        resetToSeqLen: target.resetToSeqLen,
        prefillWithTokenLogits: target.prefillWithTokenLogits,
        prefillWithTokenLogitsFromKV: target.prefillWithTokenLogitsFromKV,
      };
    }

    function assertPrefixRuntime(runtime, execution, config) {
      if (execution.prefixKvReuse !== 'required') return;
      const missing = [
        ['tokenizeText', runtime.tokenizeText],
        ['prefillKV', runtime.prefillKV],
        ['resetToSeqLen', runtime.resetToSeqLen],
      ].filter((row) => typeof row[1] !== 'function').map((row) => row[0]);
      if (missing.length) {
        throw new Error(`Doppler reranker ${config.id} requires prefix-KV capabilities: ${missing.join(', ')}`);
      }
    }

    function selectedTokenRerankProvider(handle, selectedRuntime, runtime, config, backend, modelBaseUrl) {
      const scoringConfig = rerankScoringConfig(handle, config);
      let activePrefix = null;
      const scoreCache = new Map();
      return {
        backend,
        async rerank(input) {
          const rerankStarted = nowMs();
          const rows = rerankRequestRows(input, runtime, config, scoringConfig);
          const scored = [];
          let prefixPreparationDurationMs = 0;
          try {
            const prefixStarted = nowMs();
            const prefix = await prepareRerankPrefix(
              rows,
              handle,
              selectedRuntime,
              config,
              scoringConfig,
              activePrefix
            );
            prefixPreparationDurationMs = elapsedMsSince(prefixStarted);
            activePrefix = prefix;
            for (let i = 0; i < rows.length; i += 1) {
              const row = rows[i];
              const executionStarted = nowMs();
              const cachedScore = readRerankScoreCache(scoreCache, row.prompt);
              if (cachedScore) {
                scored.push({
                  ...cachedScore,
                  primitiveId: row.primitiveId,
                  documentIndex: row.documentIndex,
                  scoreCacheHit: true,
                  executionDurationMs: 0,
                  prefixPreparationDurationMs,
                });
                emitRerankProgress(input, row, i + 1, rows.length, {
                  ...rerankProgressDetails(cachedScore, elapsedMsSince(executionStarted)),
                  scoreCacheHit: true,
                });
                continue;
              }
              let result;
              if (prefix) {
                try {
                  result = await selectedRuntime.prefillWithTokenLogits.call(
                    selectedRuntime.target,
                    '',
                    prefix.tokenIds,
                    { useChatTemplate: false, inputIds: row.tokenIds.slice(prefix.length) }
                  );
                } finally {
                  selectedRuntime.resetToSeqLen.call(selectedRuntime.target, prefix.length);
                }
              } else {
                await resetRerankerHandle(handle, selectedRuntime.target, config);
                try {
                  result = await selectedRuntime.prefillWithTokenLogits.call(
                    selectedRuntime.target,
                    row.prompt,
                    [scoringConfig.trueTokenId, scoringConfig.falseTokenId],
                    { useChatTemplate: false }
                  );
                } finally {
                  await resetRerankerHandle(handle, selectedRuntime.target, config);
                }
              }
              const scoredRow = rerankScoreRow(row, result, scoringConfig, {
                backend,
                modelBaseUrl,
                scoringPath: prefix ? 'prefix-selected-token-logits' : 'selected-token-logits',
                promptTokenCount: prefix ? row.tokenIds.length : Number(result && result.tokens && result.tokens.length || 0),
                prefixTokenCount: prefix ? prefix.length : 0,
                prefixStateReused: prefix ? prefix.cacheHit : false,
              });
              scoredRow.executionDurationMs = elapsedMsSince(executionStarted);
              scoredRow.prefixPreparationDurationMs = prefixPreparationDurationMs;
              scoredRow.scoreCacheHit = false;
              writeRerankScoreCache(scoreCache, row.prompt, scoredRow, config.scoreCacheMaxEntries);
              scored.push(scoredRow);
              emitRerankProgress(input, row, i + 1, rows.length, {
                ...rerankProgressDetails(scoredRow, scoredRow.executionDurationMs),
                scoreCacheHit: false,
              });
            }
          } catch (error) {
            activePrefix = null;
            await resetRerankerHandle(handle, selectedRuntime.target, config);
            throw error;
          }
          const rerankCallDurationMs = elapsedMsSince(rerankStarted);
          return rankedRerankRows(scored).map((row) => ({
            ...row,
            prefixPreparationDurationMs,
            rerankCallDurationMs,
          }));
        },
      };
    }

    async function prepareRerankPrefix(rows, handle, runtime, config, scoringConfig, activePrefix = null) {
      if (rows.length < 2 || typeof runtime.tokenizeText !== 'function') return null;
      const tokenRows = rows.map((row) => {
        const tokens = runtime.tokenizeText.call(runtime.target, row.prompt);
        if (!Array.isArray(tokens) || !tokens.length) {
          throw new Error(`Doppler reranker ${config.id} tokenizeText() returned no token IDs`);
        }
        row.tokenIds = tokens;
        return tokens;
      });
      const structuralPrefix = formatRerankPromptPrefix(rows[0].query, scoringConfig);
      const structuralTokens = structuralPrefix
        ? runtime.tokenizeText.call(runtime.target, structuralPrefix)
        : [];
      const maxPrefix = Math.min(...tokenRows.map((tokens) => tokens.length - 1));
      const length = Math.min(
        longestCommonTokenPrefix(structuralTokens.length ? [structuralTokens, ...tokenRows] : tokenRows),
        maxPrefix
      );
      if (length < 1) return null;
      const tokenIds = [scoringConfig.trueTokenId, scoringConfig.falseTokenId];
      const prefixTokens = tokenRows[0].slice(0, length);
      const key = prefixTokens.join(',');
      if (activePrefix && activePrefix.key === key && activePrefix.length === length) {
        return { ...activePrefix, tokenIds, cacheHit: true };
      }
      await resetRerankerHandle(handle, runtime.target, config);
      const snapshot = await runtime.prefillKV.call(runtime.target, '', {
        useChatTemplate: false,
        inputIds: prefixTokens,
      });
      if (!snapshot || !snapshot.cache || Number(snapshot.seqLen) !== length) {
        throw new Error(`Doppler reranker ${config.id} prefix-KV snapshot is invalid`);
      }
      if (typeof snapshot.cache.destroy === 'function') snapshot.cache.destroy();
      return { key, length, tokenIds, cacheHit: false };
    }

    function longestCommonTokenPrefix(rows) {
      if (!rows.length) return 0;
      let length = rows[0].length;
      for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
        length = Math.min(length, rows[rowIndex].length);
        for (let tokenIndex = 0; tokenIndex < length; tokenIndex += 1) {
          if (rows[rowIndex][tokenIndex] !== rows[0][tokenIndex]) {
            length = tokenIndex;
            break;
          }
        }
      }
      return length;
    }

    function fullLogitRerankProvider(handle, runtime, config, backend, modelBaseUrl) {
      const prefill = handle && (
        handle.prefillWithLogits
        || handle.advanced && handle.advanced.prefillWithLogits
      );
      if (typeof prefill !== 'function') {
        throw new Error(`Doppler reranker ${config.id} must expose rerank() or a logits prefill capability`);
      }
      const scoringConfig = rerankScoringConfig(handle, config);
      const target = handle.advanced && handle.advanced.prefillWithLogits ? handle.advanced : handle;
      return {
        backend,
        async rerank(input) {
          const rerankStarted = nowMs();
          const rows = rerankRequestRows(input, runtime, config, scoringConfig);
          const scored = [];
          for (let i = 0; i < rows.length; i += 1) {
            const row = rows[i];
            const executionStarted = nowMs();
            await resetRerankerHandle(handle, target, config);
            let result;
            try {
              result = await prefill.call(target, row.prompt, {
                useChatTemplate: false,
                __skipStateSnapshot: true,
              });
            } finally {
              await resetRerankerHandle(handle, target, config);
            }
            const scoredRow = rerankScoreRow(row, result, scoringConfig, {
              backend,
              modelBaseUrl,
              scoringPath: 'full-logits',
            });
            scoredRow.executionDurationMs = elapsedMsSince(executionStarted);
            scored.push(scoredRow);
            emitRerankProgress(input, row, i + 1, rows.length, {
              ...rerankProgressDetails(scoredRow, scoredRow.executionDurationMs),
              scoreCacheHit: false,
            });
          }
          const rerankCallDurationMs = elapsedMsSince(rerankStarted);
          return rankedRerankRows(scored).map((row) => ({
            ...row,
            prefixPreparationDurationMs: 0,
            rerankCallDurationMs,
          }));
        },
      };
    }

    function rerankRequestRows(input, runtime, config, scoringConfig) {
      const query = String(input && input.prompt || input && input.query || '').trim();
      if (!query) throw new Error(`Doppler reranker ${config.id} requires a query`);
      const limit = rerankerInputCandidateLimit(input, config);
      const maxTerms = Number(config.maxCandidateTermsPerDocument);
      if (!Number.isInteger(maxTerms) || maxTerms < 1) {
        throw new Error(`Doppler reranker ${config.id} requires maxCandidateTermsPerDocument`);
      }
      return (input && input.candidates || []).slice(0, limit).map((candidate, index) => {
        const document = rerankCandidateText(candidate, runtime, maxTerms);
        if (!document) return null;
        return {
          candidate,
          query,
          documentIndex: index,
          primitiveId: String(candidate && (candidate.primitiveId || candidate.candidateId || candidate.id) || ''),
          prompt: formatRerankPrompt(query, document, scoringConfig),
          tokenIds: null,
        };
      }).filter(Boolean);
    }

    function rerankScoreRow(row, result, config, receipt) {
      const logits = selectedRerankLogits(result, config, receipt.scoringPath);
      const rawScore = config.score === 'logit_difference'
        ? logits.trueLogit - logits.falseLogit
        : logits.trueLogit;
      const score = sigmoid(rawScore);
      return {
        primitiveId: row.primitiveId,
        score,
        rerankScore: score,
        rawScore,
        trueLogit: logits.trueLogit,
        falseLogit: logits.falseLogit,
        documentIndex: row.documentIndex,
        sourceKind: receipt.backend,
        modelBaseUrl: receipt.modelBaseUrl,
        scoringPath: receipt.scoringPath,
        promptTokenCount: receipt.promptTokenCount || 0,
        prefixTokenCount: receipt.prefixTokenCount || 0,
        prefixStateReused: receipt.prefixStateReused === true,
        phase: result && result.phase || null,
      };
    }

    function selectedRerankLogits(result, config, scoringPath) {
      const logits = result && result.logits;
      if (!ArrayBuffer.isView(logits) && !Array.isArray(logits)) {
        throw new Error(`Doppler reranker ${scoringPath} did not return logits`);
      }
      const byId = result && result.logitsByTokenId;
      const resultTokenIds = Array.isArray(result && result.tokenIds) ? result.tokenIds : [];
      const trueIndex = resultTokenIds.indexOf(config.trueTokenId);
      const falseIndex = resultTokenIds.indexOf(config.falseTokenId);
      const trueLogit = Number(
        (byId && byId[config.trueTokenId]) ?? logits[trueIndex >= 0 ? trueIndex : config.trueTokenId]
      );
      const falseLogit = Number(
        (byId && byId[config.falseTokenId]) ?? logits[falseIndex >= 0 ? falseIndex : config.falseTokenId]
      );
      if (!Number.isFinite(trueLogit) || !Number.isFinite(falseLogit)) {
        throw new Error('Doppler reranker returned non-finite yes/no logits');
      }
      return { trueLogit, falseLogit };
    }

    function rankedRerankRows(rows) {
      return rows.filter((row) => row.primitiveId)
        .sort((a, b) => b.rawScore - a.rawScore || a.primitiveId.localeCompare(b.primitiveId))
        .map((row, rank) => ({ ...row, rank, score: Number(row.score.toFixed(6)) }));
    }

    function rerankExecutionSummary(rows = []) {
      const scoringPaths = [...new Set(rows.map((row) => String(row && row.scoringPath || '')).filter(Boolean))].sort();
      const selectedTokenLogitCount = rows.filter((row) => (
        row && ['selected-token-logits', 'prefix-selected-token-logits'].includes(row.scoringPath)
      )).length;
      const prefixRows = rows.filter((row) => (
        row && row.scoringPath === 'prefix-selected-token-logits' && Number(row.prefixTokenCount || 0) > 0
      ));
      const prefixTokenCounts = prefixRows.map((row) => Number(row.prefixTokenCount));
      const scoreCacheHitCount = rows.filter((row) => row && row.scoreCacheHit === true).length;
      const executionDurations = rows.filter((row) => row && row.scoreCacheHit !== true)
        .map((row) => Number(row.executionDurationMs || 0))
        .filter((value) => Number.isFinite(value) && value >= 0);
      const totalExecutionDurationMs = executionDurations.reduce((sum, value) => sum + value, 0);
      const prefixPreparationDurationMs = maximumSharedDuration(rows, 'prefixPreparationDurationMs');
      const rerankCallDurationMs = maximumSharedDuration(rows, 'rerankCallDurationMs');
      return {
        scoringPaths,
        selectedTokenLogitCount,
        selectedTokenExecutionCount: Math.max(0, selectedTokenLogitCount - scoreCacheHitCount),
        prefixKvReuseCount: prefixRows.length,
        prefixStateReuseCount: prefixRows.filter((row) => row.prefixStateReused === true).length,
        scoreCacheHitCount,
        prefixPreparationDurationMs,
        rerankCallDurationMs,
        unattributedRerankDurationMs: Number(Math.max(
          0,
          rerankCallDurationMs - prefixPreparationDurationMs - totalExecutionDurationMs
        ).toFixed(3)),
        totalExecutionDurationMs: Number(totalExecutionDurationMs.toFixed(3)),
        meanExecutionDurationMs: executionDurations.length
          ? Number((totalExecutionDurationMs / executionDurations.length).toFixed(3))
          : 0,
        maximumExecutionDurationMs: executionDurations.length
          ? Number(Math.max(...executionDurations).toFixed(3))
          : 0,
        minimumPrefixTokenCount: prefixTokenCounts.length ? Math.min(...prefixTokenCounts) : 0,
        maximumPrefixTokenCount: prefixTokenCounts.length ? Math.max(...prefixTokenCounts) : 0,
      };
    }

    function maximumSharedDuration(rows, field) {
      const values = rows.map((row) => Number(row && row[field] || 0))
        .filter((value) => Number.isFinite(value) && value >= 0);
      return values.length ? Number(Math.max(...values).toFixed(3)) : 0;
    }

    function emitRerankProgress(input, row, completed, total, details = {}) {
      if (typeof input.onProgress !== 'function') return;
      input.onProgress({ completed, total, candidateId: row.primitiveId, ...details });
    }

    function rerankProgressDetails(row = {}, executionDurationMs = 0) {
      return {
        promptTokenCount: Number(row.promptTokenCount || 0),
        prefixTokenCount: Number(row.prefixTokenCount || 0),
        prefixStateReused: row.prefixStateReused === true,
        prefixPreparationDurationMs: Number(Number(row.prefixPreparationDurationMs || 0).toFixed(3)),
        executionDurationMs: Number(Number(executionDurationMs || 0).toFixed(3)),
      };
    }

    function rerankerInputCandidateLimit(input, config) {
      const configured = input && input.schema === 'simulatte.intentSlotRerankInput.v1'
        ? config.maxSlotCandidatesPerCall
        : config.maxCandidatesPerCall;
      const requested = Number(input && input.max || configured);
      return Math.max(1, Math.min(configured, Number.isFinite(requested) ? Math.floor(requested) : configured));
    }

    async function resetRerankerHandle(handle, target, config) {
      const rows = [handle, target].filter(Boolean);
      const owner = rows.find((row) => typeof row.resetGenerationState === 'function')
        || rows.find((row) => typeof row.reset === 'function');
      if (!owner) throw new Error(`Doppler reranker ${config.id} requires a state-reset capability`);
      const reset = owner.resetGenerationState || owner.reset;
      await reset.call(owner);
    }

    function rerankScoringConfig(handle, config) {
      const raw = config && config.scoring
        || handle && handle.manifest && handle.manifest.inference && handle.manifest.inference.rerank
        || {};
      const trueTokenId = Number(raw.trueTokenId);
      const falseTokenId = Number(raw.falseTokenId);
      if (!Number.isFinite(trueTokenId) || !Number.isFinite(falseTokenId)) {
        throw new Error(`Doppler reranker ${config.id} missing trueTokenId/falseTokenId scoring config`);
      }
      return {
        instruction: String(raw.instruction || 'Given a web search query, retrieve relevant passages that answer the query'),
        inputTemplate: String(raw.inputTemplate || '<Instruct>: {instruction}\n<Query>: {query}\n<Document>: {document}'),
        prefix: String(raw.prefix || ''),
        suffix: String(raw.suffix || ''),
        score: String(raw.score || 'true_logit'),
        trueTokenId,
        falseTokenId,
      };
    }

    function formatRerankPrompt(query, document, config) {
      const input = String(config.inputTemplate || '')
        .replace(/\{instruction\}/g, config.instruction)
        .replace(/\{query\}/g, query)
        .replace(/\{document\}/g, document);
      return `${config.prefix}${input}${config.suffix}`;
    }

    function formatRerankPromptPrefix(query, config) {
      const template = String(config.inputTemplate || '');
      const documentOffset = template.indexOf('{document}');
      if (documentOffset < 0) return '';
      const input = template.slice(0, documentOffset)
        .replace(/\{instruction\}/g, config.instruction)
        .replace(/\{query\}/g, query);
      return `${config.prefix}${input}`;
    }

    function rerankCandidateText(candidate, runtime, maxTerms) {
      const direct = candidate && (candidate.candidateText || candidate.text || candidate.description);
      const primitiveId = String(candidate && candidate.primitiveId || '');
      const doc = primitiveId && runtime && runtime.index && runtime.index.byId
        ? runtime.index.byId.get(primitiveId)
        : null;
      const source = direct || doc && doc.candidateText || [
        primitiveId,
        candidate && candidate.layer,
        candidate && candidate.type,
        ...(candidate && candidate.domains || []),
        ...(candidate && candidate.matchedTerms || []),
      ].filter(Boolean).join(' ');
      return compactRerankCandidateText(source, maxTerms);
    }

    function compactRerankCandidateText(value, maxTerms) {
      const limit = Number(maxTerms);
      if (!Number.isInteger(limit) || limit < 1) {
        throw new Error('reranker maxCandidateTermsPerDocument must be a positive integer');
      }
      const metadataTerms = new Set([
        'simulatte', 'surface', 'card', 'type', 'label', 'class', 'part', 'shape',
        'material', 'behavior', 'constraint', 'port', 'primitive', 'description',
      ]);
      const terms = fallbackFeatureTokens(value).filter((term) => !metadataTerms.has(term));
      return terms.slice(0, limit).join(' ');
    }

    function readRerankScoreCache(cache, key) {
      const value = cache.get(key);
      if (!value) return null;
      cache.delete(key);
      cache.set(key, value);
      return value;
    }

    function writeRerankScoreCache(cache, key, value, maxEntries) {
      const limit = Number(maxEntries);
      if (!Number.isInteger(limit) || limit < 1) {
        throw new Error('reranker scoreCacheMaxEntries must be a positive integer');
      }
      cache.delete(key);
      cache.set(key, value);
      while (cache.size > limit) cache.delete(cache.keys().next().value);
    }

    function sigmoid(value) {
      return 1 / (1 + Math.exp(-Number(value || 0)));
    }

    Object.assign(scope, {
      rerankProviderFromModelHandle,
      selectedTokenRuntimeForHandle,
      prepareRerankPrefix,
      longestCommonTokenPrefix,
      rerankerInputCandidateLimit,
      resetRerankerHandle,
      rerankScoringConfig,
      formatRerankPrompt,
      formatRerankPromptPrefix,
      rerankCandidateText,
      compactRerankCandidateText,
      readRerankScoreCache,
      writeRerankScoreCache,
      rerankExecutionSummary,
      rerankProgressDetails,
      sigmoid,
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
