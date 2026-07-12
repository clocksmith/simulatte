(function attachSimulattePhysicsModelphaseretrieval(root) {
  const scope = root.__SimulattePhysicsModelRefactorScope;
  if (!scope || scope.missingDependency) return;
  with (scope) {
    function phase1RuntimeReceipts(runtimeContext = {}, options = {}) {
        const receipt = runtimeContext.promptRuntimeReceipt || {};
        const cacheReady = receipt.cachePrefetch === true || Boolean(runtimeContext.cacheMode) || options.allowPrototypeFallback === true;
        const probeReady = receipt.embeddingProbe === true || options.allowPrototypeFallback === true;
        const modelReady = runtimeContext.providerReady === true || options.allowPrototypeFallback === true;
        const rerankerRequired = receipt.rerankerRequired === true;
        const rerankerReady = !rerankerRequired || receipt.rerankerReady === true || options.allowPrototypeFallback === true;
        return [
          {
            id: 'phase1-runtime-context',
            schema: 'simulatte.phaseReceipt.v1',
            modelId: runtimeContext.modelId,
            backend: runtimeContext.backend,
            cacheMode: runtimeContext.cacheMode,
            providerReady: runtimeContext.providerReady,
            runtimeMode: runtimeContext.runtimeMode,
          },
          {
            id: 'model-ready',
            schema: 'simulatte.phaseReceipt.v1',
            ready: modelReady,
            modelId: runtimeContext.modelId,
            backend: runtimeContext.backend,
            providerReady: runtimeContext.providerReady,
            noFallback: runtimeContext.noFallback,
          },
          {
            id: 'model-probe',
            schema: 'simulatte.phaseReceipt.v1',
            ready: probeReady,
            embeddingProbe: receipt.embeddingProbe === true,
            probeCount: Number(receipt.probeCount || 0),
            embeddingDim: Number(receipt.embeddingDim || receipt.probeEmbeddingDim || 0),
            stabilitySimilarity: Number(receipt.stabilitySimilarity || 0),
            maxDistinctProbeSimilarity: Number(receipt.maxDistinctProbeSimilarity || 0),
          },
          {
            id: 'cache-health',
            schema: 'simulatte.phaseReceipt.v1',
            ready: cacheReady,
            cachePrefetch: receipt.cachePrefetch === true,
            cacheMode: runtimeContext.cacheMode || '',
            modelBaseUrl: receipt.modelBaseUrl || '',
          },
          {
            id: 'runtime-ready',
            schema: 'simulatte.phaseReceipt.v1',
            ready: modelReady && (probeReady || options.allowPrototypeFallback === true) && rerankerReady,
            providerReady: runtimeContext.providerReady,
            rerankerRequired,
            rerankerReady,
            rerankerStatus: receipt.rerankerStatus || '',
            runtimeMode: runtimeContext.runtimeMode,
          },
        ];
      }

    function runPhase2LanguageGraph(phase1Output) {
    	    assertPhaseEnvelope(phase1Output, 1, 'Phase 2 input');
    	    const runtimeContext = runtimeContextFromPhase(phase1Output);
    	    const sourceText = phase1Output.artifact && phase1Output.artifact.promptIngress
    	      ? phase1Output.artifact.promptIngress.sourceText || ''
    	      : '';
    	    const promptParse = parsePrompt ? parsePrompt(sourceText) : emptyPromptParse(sourceText);
    	    const languageGraph = languageGraphFromPromptParse(sourceText, promptParse);
    	    const sceneLanguageGraph = sceneLanguageGraphFromLanguageGraph(languageGraph);
    	    const queryPlan = queryPlanFromSceneLanguageGraph(sceneLanguageGraph);
    	    const compositionLedger = phase2CompositionLedger(
    	      sceneLanguageGraph,
    	      queryPlan,
    	      phase1Output.artifact && phase1Output.artifact.compositionLedger || null
    	    );
    	    return createPhaseEnvelope({
    	      phase: 2,
    	      inputSchema: phase1Output.schema,
    	      runtimeReceiptId: runtimeContext.runtimeReceiptId,
    	      artifact: {
    	        languageGraph,
    	        sceneLanguageGraph,
    	        queryPlan,
    	        compositionLedger,
    	        promptParse,
    	      },
    	      receipts: [
    	        {
    	          id: 'phase2-language-graph',
              schema: 'simulatte.phaseReceipt.v1',
    	          tokens: languageGraph.tokens.length,
    	          spans: languageGraph.spans.length,
    	          clauses: languageGraph.clauses.length,
    	          relations: languageGraph.relations.length,
    	          querySlots: queryPlan.slots.length,
    	          obligationCount: compositionLedger.obligations.length,
    	        },
    	      ],
    	    });
    	  }

    function emptyPromptParse(sourceText = '') {
        return {
          schema: PROMPT_PARSE_SCHEMA || 'simulatte.promptParse.v1',
          prompt: String(sourceText || ''),
          tokens: [],
          spans: [],
          clauses: [],
          modifiers: [],
        };
      }

    function languageGraphFromPromptParse(sourceText = '', promptParse = {}) {
        const tokens = Array.isArray(promptParse.tokens) ? promptParse.tokens : [];
        const spans = languageGraphSpans(tokens, Array.isArray(promptParse.spans) ? promptParse.spans : []);
        const clauses = Array.isArray(promptParse.clauses) ? promptParse.clauses : [];
        const modifiers = Array.isArray(promptParse.modifiers) ? promptParse.modifiers : [];
        const clauseRelations = languageGraphClauseRelations(clauses);
        const modifierRelations = modifiers.map((modifier) => ({
          id: modifier.id || '',
          sourceSpanId: modifier.targetSpanId || '',
          targetSpanId: modifier.modifierSpanId || '',
          relation: modifier.relation || '',
          source: 'modifier',
        }));
        return {
          schema: 'simulatte.languageGraph.v1',
          sourceText: String(sourceText || ''),
          tokens,
          spans,
          clauses,
          predicates: clauses.map((clause) => ({
            id: clause.id || '',
            subjectSpanId: clause.subjectSpanId || '',
            verbSpanId: clause.verbSpanId || '',
            objectSpanId: clause.objectSpanId || '',
            process: clause.process || '',
            predicate: clause.predicate || '',
            subjectRole: clause.subjectRole || '',
            objectRole: clause.objectRole || '',
            spatialRelation: clause.spatialRelation || '',
            causalAffordance: clause.causalAffordance || '',
            implicitObject: clause.implicitObject || '',
          })),
          quantities: tokens.filter((token) => /^(?:\d+(?:\.\d+)?|\.\d+)$/.test(String(token.text || ''))),
          negations: spans.filter((span) => span.kind === 'negation').concat(
            tokens.filter((token) => NEGATION_RE.test(String(token.text || '').toLowerCase()))
          ),
          relations: [...clauseRelations, ...modifierRelations],
          modifiers,
        };
      }

    function languageGraphClauseRelations(clauses = []) {
        const relations = [];
        for (const clause of clauses || []) {
          const clauseId = clause.id || `clause${relations.length + 1}`;
          if (clause.subjectSpanId && clause.verbSpanId) {
            relations.push({
              id: `${clauseId}:agent-process`,
              sourceSpanId: clause.subjectSpanId,
              targetSpanId: clause.verbSpanId,
              relation: 'performs',
              process: clause.process || '',
              predicate: clause.predicate || '',
              subjectRole: clause.subjectRole || '',
              source: 'clause',
            });
          }
          if (clause.subjectSpanId && clause.objectSpanId && clause.spatialRelation) {
            relations.push({
              id: `${clauseId}:agent-location`,
              sourceSpanId: clause.subjectSpanId,
              targetSpanId: clause.objectSpanId,
              relation: clause.spatialRelation,
              process: clause.process || '',
              predicate: clause.predicate || '',
              subjectRole: clause.subjectRole || '',
              objectRole: clause.objectRole || '',
              causalAffordance: clause.causalAffordance || '',
              source: 'clause',
            });
          }
          if (clause.subjectSpanId && !clause.objectSpanId && clause.implicitObject && clause.spatialRelation) {
            relations.push({
              id: `${clauseId}:agent-implicit-location`,
              sourceSpanId: clause.subjectSpanId,
              targetSpanId: '',
              targetText: clause.implicitObject,
              relation: clause.spatialRelation,
              process: clause.process || '',
              subjectRole: clause.subjectRole || '',
              objectRole: clause.objectRole || '',
              causalAffordance: clause.causalAffordance || '',
              inferred: true,
              source: 'clause',
            });
          }
          if (clause.verbSpanId && clause.objectSpanId && clause.spatialRelation) {
            relations.push({
              id: `${clauseId}:process-location`,
              sourceSpanId: clause.verbSpanId,
              targetSpanId: clause.objectSpanId,
              relation: 'occurs_in',
              process: clause.process || '',
              objectRole: clause.objectRole || '',
              causalAffordance: clause.causalAffordance || '',
              source: 'clause',
            });
          }
          if (clause.verbSpanId && !clause.objectSpanId && clause.implicitObject && clause.spatialRelation) {
            relations.push({
              id: `${clauseId}:process-implicit-location`,
              sourceSpanId: clause.verbSpanId,
              targetSpanId: '',
              targetText: clause.implicitObject,
              relation: 'occurs_in',
              process: clause.process || '',
              objectRole: clause.objectRole || '',
              causalAffordance: clause.causalAffordance || '',
              inferred: true,
              source: 'clause',
            });
          }
        }
        return relations;
      }

    function languageGraphSpans(tokens = [], parsedSpans = []) {
        const covered = new Set(parsedSpans.flatMap((span) => {
          if (Number.isInteger(span.tokenStart) && Number.isInteger(span.tokenEnd)) {
            const indexes = [];
            for (let index = span.tokenStart; index <= span.tokenEnd; index += 1) indexes.push(index);
            return indexes;
          }
          return [];
        }));
        const parsed = parsedSpans.map((span) => ({ ...span }));
        const fallback = tokens
          .map((token, index) => ({ token, index }))
          .filter(({ token, index }) => {
            if (covered.has(index)) return false;
            const text = String(token.text || '').toLowerCase();
            if (!text || semanticStopwordHas(text)) return false;
            return /[a-z0-9]/.test(text);
          })
          .map(({ token, index }) => ({
            id: `term${index + 1}`,
            text: token.text,
            kind: 'term',
            start: token.start,
            end: token.end,
            tokenStart: index,
            tokenEnd: index,
          }));
        return [...parsed, ...fallback];
      }

    function semanticStopwordHas(text) {
        if (SEMANTIC_STOPWORDS && typeof SEMANTIC_STOPWORDS.has === 'function') return SEMANTIC_STOPWORDS.has(text);
        return Array.isArray(SEMANTIC_STOPWORDS) && SEMANTIC_STOPWORDS.includes(text);
      }

    function runPhase3Retrieval(phase2Output, runtimeContext = {}) {
    	    assertPhaseEnvelope(phase2Output, 2, 'Phase 3 input');
    	    const phase2Artifact = phase2Output.artifact || {};
    	    const languageGraph = phase2Artifact.languageGraph || {};
    	    const sceneLanguageGraph = phase2Artifact.sceneLanguageGraph || sceneLanguageGraphFromLanguageGraph(languageGraph);
    		    const queryPlan = phase2Artifact.queryPlan || queryPlanFromSceneLanguageGraph(sceneLanguageGraph);
    		    const query = String(languageGraph.sourceText || '');
    		    const retrievalEvidence = runtimeContext && runtimeContext.retrievalEvidence || {};
    		    assertPhase3RetrievalEvidencePromptHash(retrievalEvidence, sceneLanguageGraph.sourcePromptHash || stableTextHash(query));
    		    const rawRankedPrimitives = retrievalEvidence.rankedPrimitives || retrievalEvidence.primitiveMatches || [];
    	    const primitiveCuration = curatePhase3PrimitiveCandidates(rawRankedPrimitives, languageGraph);
    	    const rankedPrimitives = primitiveCuration.rankedPrimitives;
    	    const typedEvidenceBuckets = phase3TypedEvidenceBuckets(primitiveCuration, languageGraph);
    		    const rankedCards = retrievalEvidence.rankedCards || retrievalEvidence.cardMatches || [];
    		    const rankedUniverseRows = retrievalEvidence.rankedUniverseRows || retrievalEvidence.universeMatches || [];
    		    const semanticRag = retrievalEvidence.semanticRag || null;
    		    const slotRetrieval = retrievalEvidence.slotRetrieval || null;
    		    const slotEvidence = phase3SlotEvidence(queryPlan, typedEvidenceBuckets, rankedCards, rankedUniverseRows, slotRetrieval);
    	    const acceptedCandidatesBySlot = phase3AcceptedCandidatesBySlot(slotEvidence);
    	    const supportOnlyCandidates = phase3SupportOnlyCandidates(primitiveCuration, slotEvidence);
    	    const rejectedGenericCandidates = phase3RejectedGenericCandidates(primitiveCuration, typedEvidenceBuckets);
    	    const missingRequiredSlots = phase3MissingRequiredSlots(queryPlan, acceptedCandidatesBySlot);
    		    const rerankReceipt = phase3RerankReceipt(
    		      retrievalEvidence.rerankReceipt || retrievalEvidence.rerank || null,
    		      queryPlan,
    		      slotEvidence,
    		      missingRequiredSlots,
    		      slotRetrieval
    		    );
    	    const compositionLedger = phase3CompositionLedger(
    	      typedEvidenceBuckets,
    	      languageGraph,
    	      phase2Artifact.compositionLedger || null,
    	      queryPlan,
    	      acceptedCandidatesBySlot,
    	      missingRequiredSlots
    	    );
    	    const groundingEvidence = retrievalGroundingEvidence(
    	      retrievalEvidence,
    	      primitiveCuration,
    	      typedEvidenceBuckets,
    	      compositionLedger,
    	      languageGraph,
    	      queryPlan,
    	      slotEvidence,
          acceptedCandidatesBySlot,
          missingRequiredSlots
        );
        const retrievalRerankResult = {
    	          schema: RETRIEVAL_RERANK_RESULT_SCHEMA,
    	          query,
    	          queryPlanSource: sceneLanguageGraph.schema || '',
    	          queryPlan,
    	          slotEvidence,
    	          acceptedCandidatesBySlot,
    	          supportOnlyCandidates,
    	          rejectedGenericCandidates,
    	          missingRequiredSlots,
    	          rankedPrimitives,
    	          supportPrimitives: primitiveCuration.supportPrimitives,
    	          rejectedSupportPrimitives: primitiveCuration.rejectedSupportPrimitives,
    	          curation: primitiveCuration.receipt,
    		          typedEvidenceBuckets,
    		          slotRetrieval,
    	          compositionLedger,
              rankedCards,
              rankedUniverseRows,
              semanticRag,
              rerankReceipt,
              spanRetrieval: retrievalEvidence.spanRetrieval || null,
              evidenceRows: Array.isArray(retrievalEvidence.evidenceRows) ? retrievalEvidence.evidenceRows : [],
              classification: retrievalEvidence.classification || null,
              synthesis: retrievalEvidence.synthesis || null,
              dopplerIntent: retrievalEvidence.dopplerIntent || null,
              scores: {
              primitiveCount: rankedPrimitives.length,
              rawPrimitiveCount: rawRankedPrimitives.length,
              supportPrimitiveCount: primitiveCuration.supportPrimitives.length,
              typedBucketCount: Object.keys(typedEvidenceBuckets.buckets || {}).length,
              cardCount: rankedCards.length,
              universeRowCount: rankedUniverseRows.length,
                classificationConfidence: retrievalEvidence.classification && retrievalEvidence.classification.confidence || 0,
              },
              provenance: {
                modelId: runtimeContext.modelId || '',
                backend: runtimeContext.backend || '',
                retrievalPhase: runtimeContext.retrievalPhase || retrievalEvidence.retrievalPhase || '',
                synthesisSchema: retrievalEvidence.synthesis && retrievalEvidence.synthesis.schema || '',
              },
    	          groundingEvidence,
        };
        const artifact = {
          languageGraph,
          sceneLanguageGraph,
          queryPlan,
          retrievalRerankResult,
          compositionLedger,
        };
        const activationCloud = activationCloudFromPhase3Artifact(artifact);
        artifact.activationCloud = {
          ...activationCloud,
          compositionLedger,
        };
        return createPhaseEnvelope({
          phase: 3,
          inputSchema: phase2Output.schema,
          runtimeReceiptId: runtimeContext.runtimeReceiptId || phase2Output.runtimeReceiptId,
          artifact,
          receipts: [
            {
              id: 'phase3-retrieval-rerank',
    	          schema: 'simulatte.phaseReceipt.v1',
              primitiveCount: rankedPrimitives.length,
              rawPrimitiveCount: rawRankedPrimitives.length,
    	          supportPrimitiveCount: primitiveCuration.supportPrimitives.length,
    	          rejectedSupportCount: primitiveCuration.rejectedSupportPrimitives.length,
    	          typedBucketCount: Object.keys(typedEvidenceBuckets.buckets || {}).length,
    		          obligationCount: compositionLedger.obligations.length,
    		          slotCount: slotEvidence.length,
    		          modelSlotCount: slotRetrieval && Number(slotRetrieval.slotCount || 0) || 0,
    		          modelSlotRerankCallCount: slotRetrieval && Number(slotRetrieval.rerankCallCount || 0) || 0,
    		          missingRequiredSlots: missingRequiredSlots.length,
    	          curation: primitiveCuration.receipt.id,
    	          cardCount: rankedCards.length,
    	          universeRowCount: rankedUniverseRows.length,
    	        },
            {
              id: 'phase3-activation-fusion',
              schema: 'simulatte.phaseReceipt.v1',
              activationCount: activationCloud.weightedActivations.length,
              slotActivationCount: (activationCloud.slotActivations || []).length,
              relationActivationCount: (activationCloud.relationActivations || []).length,
              supportActivationCount: (activationCloud.supportActivations || []).length,
              rejectedCount: activationCloud.rejectedMatches.length,
              obligationCoverageCount: Object.keys(activationCloud.coverageByObligation || {}).length,
              coveredObligationCount: Object.values(activationCloud.coverageByObligation || {})
                .filter((row) => row && row.covered === true).length,
              obligationVerdictCount: (activationCloud.obligationVerdicts || []).length,
              stronglySupportedCount: (activationCloud.obligationVerdicts || [])
                .filter((row) => row.verdict === 'strongly-supported').length,
              negativeEvidenceCount: (activationCloud.negativeEvidence || []).length,
            },
          ],
        });
    	  }

    function assertPhase3RetrievalEvidencePromptHash(retrievalEvidence = {}, expectedHash = '') {
    	    if (!expectedHash || !retrievalEvidence || typeof retrievalEvidence !== 'object') return;
    	    const topLevel = String(retrievalEvidence.sourcePromptHash || retrievalEvidence.promptHash || '');
    	    if (topLevel && topLevel !== expectedHash) {
    	      throw new Error(`Phase 3 retrieval evidence prompt hash mismatch: expected ${expectedHash}, received ${topLevel}`);
    	    }
    	    const rows = [
    	      ['slotRetrieval', retrievalEvidence.slotRetrieval],
    	      ['spanRetrieval', retrievalEvidence.spanRetrieval],
    	      ['queryPlan', retrievalEvidence.queryPlan],
    	    ];
    	    for (const [label, row] of rows) {
    	      const actual = row && row.sourcePromptHash;
    	      if (actual && actual !== expectedHash) {
    	        throw new Error(`Phase 3 ${label}.sourcePromptHash mismatch: expected ${expectedHash}, received ${actual}`);
    	      }
    	    }
    	  }

    function curatePhase3PrimitiveCandidates(rows = [], languageGraph = {}) {
        const prompt = String(languageGraph.sourceText || '').toLowerCase();
        const spans = Array.isArray(languageGraph.spans) ? languageGraph.spans : [];
        const predicates = Array.isArray(languageGraph.predicates) ? languageGraph.predicates : [];
        const relations = Array.isArray(languageGraph.relations) ? languageGraph.relations : [];
        const hasSpecificLanguage = spans.some((span) => (
          span.kind === 'entity' ||
          span.kind === 'material' ||
          span.kind === 'environment' ||
          span.kind === 'process'
        ));
        const curated = [];
        const support = [];
        for (const row of rows || []) {
          const decision = phase3PrimitiveCandidateDecision(row, prompt, spans, predicates, relations);
          const next = phaseCarryObject({
            ...row,
            retrievalRole: decision.role,
            matchKind: decision.matchKind,
            supportOnly: decision.role === 'support',
            supportReason: decision.reason,
          });
          if (decision.role === 'candidate') curated.push(next);
          else support.push(next);
        }
        if (!hasSpecificLanguage || curated.length < Math.min(2, rows.length)) {
          const supportRows = (rows || []).map((row) => phaseCarryObject({
            ...row,
            retrievalRole: 'support',
            matchKind: hasSpecificLanguage ? 'insufficient-literal-evidence' : 'untyped-language-support',
            supportOnly: true,
            supportReason: hasSpecificLanguage
              ? 'curation produced too few literal candidates'
              : 'prompt language lacks typed scene evidence',
          })).sort(phase3PrimitiveSort);
          const rejectedSupportRows = supportRows.filter(phase3SupportRowIsGeneric);
          return {
            rankedPrimitives: curated.sort(phase3PrimitiveSort),
            supportPrimitives: supportRows,
            rejectedSupportPrimitives: rejectedSupportRows,
            receipt: {
              id: 'phase3-primitive-curation',
              schema: 'simulatte.phase3PrimitiveCuration.v1',
              mode: hasSpecificLanguage ? 'strict-insufficient-candidates' : 'strict-untyped-support-only',
              rawPrimitiveCount: rows.length,
              candidateCount: curated.length,
              supportCount: supportRows.length,
              rejectedSupportCount: rejectedSupportRows.length,
              candidateIds: curated.map((row) => row.id || row.primitiveId).filter(Boolean).slice(0, 24),
              supportIds: supportRows.map((row) => row.id || row.primitiveId).filter(Boolean).slice(0, 24),
            },
          };
        }
        const rankedPrimitives = curated.sort(phase3PrimitiveSort);
        const supportPrimitives = support.sort(phase3PrimitiveSort);
        const rejectedSupportPrimitives = supportPrimitives.filter(phase3SupportRowIsGeneric);
        return {
          rankedPrimitives,
          supportPrimitives,
          rejectedSupportPrimitives,
          receipt: {
            id: 'phase3-primitive-curation',
            schema: 'simulatte.phase3PrimitiveCuration.v1',
            mode: 'literal-candidates-support-separated',
            rawPrimitiveCount: rows.length,
            candidateCount: rankedPrimitives.length,
            supportCount: supportPrimitives.length,
            rejectedSupportCount: rejectedSupportPrimitives.length,
            candidateIds: rankedPrimitives.map((row) => row.id || row.primitiveId).filter(Boolean).slice(0, 24),
            supportIds: supportPrimitives.map((row) => row.id || row.primitiveId).filter(Boolean).slice(0, 24),
          },
        };
      }

    function phase3TypedEvidenceBuckets(curation = {}, languageGraph = {}) {
        const rankedPrimitives = curation.rankedPrimitives || [];
        const supportPrimitives = curation.supportPrimitives || [];
        const buckets = {
          literalPromptObjects: [],
          actionEvidence: [],
          environmentEvidence: [],
          materialMediumEvidence: [],
          relationEvidence: [],
          supportOnlyPhysicsEvidence: [],
          rejectedGenericEvidence: [],
        };
        for (const row of rankedPrimitives) {
          const slot = phase3EvidenceSlot(row, languageGraph);
          buckets[slot].push(phase3EvidenceBucketRow(row));
        }
        for (const row of supportPrimitives) {
          const bucketRow = phase3EvidenceBucketRow(row);
          buckets.supportOnlyPhysicsEvidence.push(bucketRow);
          if (phase3SupportRowIsGeneric(row)) buckets.rejectedGenericEvidence.push(bucketRow);
        }
    	    for (const relation of languageGraph.relations || []) {
    	      buckets.relationEvidence.push(phaseCarryObject({
    	        id: relation.id || `${relation.sourceSpanId || 'source'}:${relation.relation || 'relation'}:${relation.targetSpanId || 'target'}`,
    	        sourceSpanId: relation.sourceSpanId || '',
    	        targetSpanId: relation.targetSpanId || '',
    	        sourceText: relation.sourceText || phase3SpanTextById(languageGraph, relation.sourceSpanId),
    	        targetText: relation.targetText || phase3SpanTextById(languageGraph, relation.targetSpanId),
    	        relation: relation.relation || '',
    	        process: relation.process || '',
    	        causalAffordance: relation.causalAffordance || '',
    	      }));
    	    }
        for (const predicate of languageGraph.predicates || []) {
          if (!predicate.process) continue;
          buckets.actionEvidence.push(phaseCarryObject({
            id: `action:${predicate.process}`,
            label: predicate.process,
            source: 'language-predicate',
            retrievalRole: 'candidate',
            supportOnly: false,
            matchKind: 'predicate-process',
            subjectSpanId: predicate.subjectSpanId || '',
            objectSpanId: predicate.objectSpanId || '',
          }));
        }
        for (const predicate of languageGraph.predicates || []) {
          buckets.relationEvidence.push(phaseCarryObject({
            id: predicate.id || `${predicate.subjectSpanId || 'subject'}:${predicate.process || 'process'}:${predicate.objectSpanId || 'object'}`,
    	        subjectSpanId: predicate.subjectSpanId || '',
    	        verbSpanId: predicate.verbSpanId || '',
    	        objectSpanId: predicate.objectSpanId || '',
    	        subjectText: phase3SpanTextById(languageGraph, predicate.subjectSpanId),
    	        verbText: phase3SpanTextById(languageGraph, predicate.verbSpanId),
    	        objectText: phase3SpanTextById(languageGraph, predicate.objectSpanId),
    	        process: predicate.process || '',
    	        subjectRole: predicate.subjectRole || '',
    	        objectRole: predicate.objectRole || '',
            spatialRelation: predicate.spatialRelation || '',
            causalAffordance: predicate.causalAffordance || '',
          }));
        }
        return phaseCarryObject({
          schema: 'simulatte.phase3TypedEvidenceBuckets.v1',
          buckets,
          summary: Object.fromEntries(Object.entries(buckets).map(([key, rows]) => [key, rows.length])),
        });
      }

    function phase3EvidenceSlot(row = {}, languageGraph = {}) {
        const id = normalizeForEvidence(row.id || row.primitiveId || '');
        const text = normalizeForEvidence([
          row.id,
          row.primitiveId,
          row.label,
          row.role,
          row.phrase,
          row.material,
          ...(row.domains || []),
        ].filter(Boolean).join(' '));
        const spans = languageGraph.spans || [];
        // `phrase` may describe the trigger that selected a primitive (for example
        // water selected by "swimming"). Preserve the primitive's direct material
        // identity before using that contextual phrase as evidence.
        if (id === 'water') return 'materialMediumEvidence';
        const matchedSpans = phase3MatchingLanguageSpans(row, spans);
        if (matchedSpans.some((span) => span.kind === 'environment' || span.semanticRole === 'containing-environment')) {
          return 'environmentEvidence';
        }
        if (matchedSpans.some((span) => span.kind === 'material' || span.semanticRole === 'fluid-medium')) {
          return 'materialMediumEvidence';
        }
        if (matchedSpans.some((span) => span.kind === 'process')) return 'actionEvidence';
        if (matchedSpans.some((span) => span.kind === 'entity')) return 'literalPromptObjects';
        if (/\b(?:lake|pool|pond|river|ocean|beach|environment|container)\b/.test(text)) return 'environmentEvidence';
        if (id === 'water' || /\b(?:water|fluid|medium)\b/.test(text)) return 'materialMediumEvidence';
        if (/\b(?:swim|swims|swimming|locomotion|gait)\b/.test(text)) return 'actionEvidence';
        if (spans.some((span) => span.semanticRole === 'containing-environment' && phase3PhraseInPrompt(row.id || row.label || '', span.text))) {
          return 'environmentEvidence';
        }
        if (spans.some((span) => span.semanticRole === 'biological-agent' && phase3PhraseInPrompt(row.id || row.label || '', span.text))) {
          return 'literalPromptObjects';
        }
        return 'supportOnlyPhysicsEvidence';
      }

    function phase3MatchingLanguageSpans(row = {}, spans = []) {
        const identityValues = [row.id, row.primitiveId, row.label, row.material]
          .map((value) => normalizeForEvidence(value))
          .filter(Boolean);
        const contextualValues = [row.role, row.phrase]
          .map((value) => normalizeForEvidence(value))
          .filter(Boolean);
        const directMatches = (spans || []).filter((span) => {
          const spanText = normalizeForEvidence(span && span.text);
          return spanText && identityValues.some((value) => (
            phase3PhraseInPrompt(value, spanText) || phase3PhraseInPrompt(spanText, value)
          ));
        });
        if (directMatches.length) return directMatches;
        return (spans || []).filter((span) => {
          const spanText = normalizeForEvidence(span && span.text);
          return spanText && contextualValues.some((value) => (
            phase3PhraseInPrompt(value, spanText) || phase3PhraseInPrompt(spanText, value)
          ));
        });
      }

    function phase3EvidenceBucketRow(row = {}) {
        return phaseCarryObject({
          id: row.id || row.primitiveId || '',
          label: row.label || row.role || row.phrase || row.id || '',
          source: row.source || row.indexName || '',
          score: Number(row.score || row.confidence || 0),
          retrievalRole: row.retrievalRole || '',
          supportOnly: row.supportOnly === true,
          matchKind: row.matchKind || '',
          reason: row.supportReason || row.reason || '',
        });
      }

    function phase3SupportRowIsGeneric(row = {}) {
    	    const text = normalizeForEvidence([
    	      row.id,
    	      row.primitiveId,
    	      row.label,
          row.role,
          row.phrase,
          ...(row.domains || []),
    	    ].filter(Boolean).join(' '));
    	    return /\b(?:biomass|collision|elasticity|friction|gel|membrane|soft body|soft-body|diffusion|growth decay|growth-decay|kernel|gradient|constraint)\b/.test(text);
    	  }

    function phase3SlotEvidence(queryPlan = {}, typedEvidenceBuckets = {}, rankedCards = [], rankedUniverseRows = [], slotRetrieval = null) {
    		    const buckets = typedEvidenceBuckets.buckets || {};
    		    return (queryPlan.slots || []).map((slot) => {
    		      const candidates = phase3CandidatesForSlot(slot, buckets, rankedCards, rankedUniverseRows, slotRetrieval);
    	      const acceptedCandidates = candidates.filter((candidate) => candidate.decision === 'accept');
    	      const supportOnlyCandidates = candidates.filter((candidate) => candidate.supportOnly === true);
    	      return phaseCarryObject({
    	        schema: 'simulatte.phase3SlotEvidence.v1',
    	        id: slot.slotId || slot.entryId || '',
    	        slotId: slot.slotId || '',
    	        slotRole: slot.slotRole || '',
    	        entryId: slot.entryId || '',
    	        relationIds: slot.relationIds || [],
    	        required: slot.required !== false,
    	        status: phase3SlotEvidenceStatus(slot, acceptedCandidates, supportOnlyCandidates),
    	        queryTexts: (slot.queries || []).map((query) => query.text || '').filter(Boolean),
    	        candidates,
	        acceptedCandidates,
	        constructionCandidates: acceptedCandidates.filter((candidate) => candidate.constructionEvidence === true),
    	        supportOnlyCandidates,
    	        acceptedCount: acceptedCandidates.length,
    	        supportOnlyCount: supportOnlyCandidates.length,
    	        acceptedCandidateIds: candidates
    	          .filter((candidate) => candidate.decision === 'accept')
    	          .map((candidate) => candidate.candidateId)
    	          .filter(Boolean),
    	        rejectedCandidateIds: candidates
    	          .filter((candidate) => candidate.decision === 'reject')
    	          .map((candidate) => candidate.candidateId)
    	          .filter(Boolean),
    	        supportOnlyCandidateIds: candidates
    	          .filter((candidate) => candidate.supportOnly === true)
    	          .map((candidate) => candidate.candidateId)
    	          .filter(Boolean),
    	      });
    	    });
    	  }

    function phase3CandidatesForSlot(slot = {}, buckets = {}, rankedCards = [], rankedUniverseRows = [], slotRetrieval = null) {
		    const rows = uniquePhase3SlotRows([
		      phase3LiteralSlotCandidate(slot),
		      ...phase3ModelRowsForSlot(slot, slotRetrieval),
		      ...phase3RowsForSlot(slot, buckets, rankedCards, rankedUniverseRows),
		    ]);
    		    return rows.slice(0, phase3SlotBudget(slot)).map((row) => {
    		      const supportOnly = row.supportOnly === true || slot.slotRole === 'support';
    		      const candidateId = row.candidateId || row.id || row.cardId || row.canonicalId || row.primitiveId || '';
    		      return {
    		        id: candidateId,
    		        candidateId,
    		        candidateType: row.candidateType || phase3CandidateType(row),
		        label: row.label || row.phrase || row.role || row.id || '',
		        candidateText: row.candidateText || row.label || row.phrase || row.role || row.id || '',
		        sourceLabel: row.sourceLabel || '',
		        aliases: row.aliases || [],
		        source: row.source || row.indexName || '',
		        canonicalId: row.canonicalId || '',
		        semanticType: row.semanticType || '',
		        domains: row.domains || [],
		        materialId: row.materialId || row.material || '',
		        operatorHints: row.operatorHints || row.operatorTypes || [],
		        primitiveHints: row.primitiveHints || [],
		        shapeHints: row.shapeHints || [],
		        partHints: row.partHints || row.construction && row.construction.partHints || [],
		        materialHints: row.materialHints || row.construction && row.construction.materialHints || [],
		        behaviorHints: row.behaviorHints || row.construction && row.construction.behaviorHints || [],
		        affordanceHints: row.affordanceHints || row.construction && row.construction.affordanceHints || [],
		        relationHints: row.relationHints || row.construction && row.construction.relationHints || [],
		        scaleHints: row.scaleHints || row.construction && row.construction.scaleHints || [],
		        construction: row.construction || null,
		        constructionEvidence: row.constructionEvidence === true,
		        identityEvidence: row.identityEvidence === true,
		        modelEvaluated: row.modelEvaluated === true,
		        modelRerankEvaluated: row.modelRerankEvaluated === true,
		        modelScore: Number.isFinite(Number(row.modelScore)) ? Number(row.modelScore) : null,
		        vectorHash: row.vectorHash || '',
		        semanticClass: row.semanticClass || slot.semanticClass || '',
		        visualArchetype: row.visualArchetype || slot.visualArchetype || '',
		        sceneHints: row.sceneHints || [],
    		        slotId: slot.slotId || '',
    		        slotRole: slot.slotRole || '',
    		        modelRerankScore: row.modelRerankScore,
    		        modelRerankRank: row.modelRerankRank,
    		        lexicalScore: row.lexicalScore,
    		        decision: supportOnly ? 'support-only' : 'accept',
    		        score: Number(row.score || row.confidence || 0),
    		        supportOnly,
    	        reason: supportOnly ? row.reason || 'support evidence cannot satisfy required literal slot' : 'slot evidence matches query plan role',
    	      };
    	    });
		  }

    function phase3LiteralSlotCandidate(slot = {}) {
        const entryId = String(slot.entryId || '');
        const role = String(slot.slotRole || '');
        if (!entryId || role === 'support' || role === 'visual') return null;
        const identityLabel = normalizeForEvidence(entryId.replace(/^[a-z]+:/, '')).trim();
        const sourceLabel = String(slot.sourceLabel || identityLabel).trim();
        if (!identityLabel || !sourceLabel) return null;
        const slug = identityLabel.replace(/\s+/g, '-');
        const semanticType = {
          actor: 'body',
          object: 'body',
          environment: 'environment',
          medium: 'material',
          action: 'process',
          relation: 'relation',
        }[role] || 'entity';
        return {
          id: `prompt.${role || 'entity'}.${slug}`,
          candidateId: `prompt.${role || 'entity'}.${slug}`,
          candidateType: 'prompt-literal',
          label: identityLabel,
          candidateText: identityLabel,
          sourceLabel,
          aliases: [sourceLabel, identityLabel],
          canonicalId: `prompt.${semanticType}.${slug}`,
          semanticType,
          semanticClass: slot.semanticClass || '',
          visualArchetype: slot.visualArchetype || '',
          shapeHints: slot.shapeHints || [],
          source: 'prompt-typed-slot',
          score: 1,
          supportOnly: false,
          identityEvidence: /^(?:actor|object|environment|medium)$/.test(role),
          reason: 'typed Phase 2 slot preserves literal prompt identity',
        };
      }

    function phase3RowsForSlot(slot = {}, buckets = {}, rankedCards = [], rankedUniverseRows = []) {
    	    const role = slot.slotRole || '';
    	    const entryId = String(slot.entryId || '');
    	    if (role === 'actor' || role === 'object') return phase3FilterRowsForEntry(buckets.literalPromptObjects || [], entryId);
    	    if (role === 'action') return phase3FilterRowsForEntry(buckets.actionEvidence || [], entryId);
    	    if (role === 'environment') return phase3FilterRowsForEntry(buckets.environmentEvidence || [], entryId);
    	    if (role === 'medium') return phase3FilterRowsForEntry(buckets.materialMediumEvidence || [], entryId);
    	    if (role === 'relation') {
    	      return phase3FilterRowsForEntry([
    	        ...(buckets.relationEvidence || []),
    	        ...(buckets.actionEvidence || []),
    	        ...(buckets.materialMediumEvidence || []),
    	      ], entryId);
    	    }
    	    if (role === 'visual') {
    	      return [
    	        ...phase3VisualRowsForEntry(entryId, rankedCards),
    	        ...phase3VisualRowsForEntry(entryId, rankedUniverseRows),
    	      ];
    	    }
    		    return [];
    		  }

    function phase3ModelRowsForSlot(slot = {}, slotRetrieval = null) {
		    const slotId = String(slot.slotId || '');
		    if (!slotId || !slotRetrieval || !Array.isArray(slotRetrieval.bySlot)) return [];
		    const row = slotRetrieval.bySlot.find((entry) => entry && entry.slotId === slotId);
		    if (!row) return [];
		    const candidates = (row.candidates || []).map((candidate) => ({
		      ...candidate,
		      id: candidate.candidateId || candidate.id || candidate.primitiveId || '',
		      source: candidate.source || 'slot-embedding-retrieval',
		      slotId,
		      slotRole: slot.slotRole || candidate.slotRole || '',
		      vectorHash: row.vectorHash || '',
		    }));
		    const constructionRows = candidates.filter((candidate) => candidate.constructionEvidence === true);
		    return uniquePhase3SlotRows([
		      ...constructionRows,
		      ...phase3FilterRowsForEntry(candidates, String(slot.entryId || '')),
		    ]);
		  }

    function uniquePhase3SlotRows(rows = []) {
		    const seen = new Set();
		    return rows.filter(Boolean).filter((row) => {
    		      const key = `${row.candidateType || phase3CandidateType(row)}:${row.candidateId || row.id || row.cardId || row.canonicalId || row.primitiveId || ''}`;
    		      if (!key || seen.has(key)) return false;
    		      seen.add(key);
    		      return true;
    		    }).sort((a, b) => (
    		      Number(b.score || b.confidence || 0) - Number(a.score || a.confidence || 0) ||
    		      String(a.candidateId || a.id || a.primitiveId || '').localeCompare(String(b.candidateId || b.id || b.primitiveId || ''))
    		    ));
    		  }

    function phase3FilterRowsForEntry(rows = [], entryId = '') {
    	    const target = normalizeForEvidence(entryId.replace(/^[a-z]+:/, ''));
    	    const filtered = rows.filter((row) => {
    	      const text = normalizeForEvidence([
    	        row.id,
    	        row.label,
    	        row.candidateId,
    	        row.canonicalId,
    	        row.sourceText,
    	        row.targetText,
    	        row.subjectText,
    	        row.verbText,
    	        row.objectText,
    	        row.process,
    	        row.causalAffordance,
    	      ].filter(Boolean).join(' '));
    	      if (!target || !text) return false;
    	      return phase3PhraseInPrompt(target, text) ||
              phase3PhraseInPrompt(text, target) ||
              phase3EntryTermsCovered(target, text);
    	    });
    	    return filtered;
    	  }

    function phase3EntryTermsCovered(target = '', text = '') {
        const terms = phase3EntryTerms(target);
        if (!terms.length) return false;
        return terms.every((term) => phase3TermVariants(term).some((variant) => (
          new RegExp(`\\b${phase3EscapeRegExp(variant)}\\b`).test(text)
        )));
      }

    function phase3EntryTerms(value = '') {
        const stop = new Set(['a', 'an', 'and', 'in', 'into', 'of', 'on', 'the', 'to', 'with', 'world']);
        return normalizeForEvidence(value)
          .split(/\s+/)
          .map((term) => term.trim())
          .filter((term) => term.length > 2 && !stop.has(term));
      }

    function phase3TermVariants(term = '') {
        const value = normalizeForEvidence(term);
        const variants = [value];
        if (value.endsWith('ies') && value.length > 4) variants.push(`${value.slice(0, -3)}y`);
        if (value.endsWith('es') && value.length > 4) variants.push(value.slice(0, -2));
        if (value.endsWith('s') && value.length > 3) variants.push(value.slice(0, -1));
        if (value.endsWith('ing') && value.length > 5) {
          const stem = value.slice(0, -3);
          variants.push(stem);
          if (/([a-z])\1$/.test(stem)) variants.push(stem.slice(0, -1));
        }
        return Array.from(new Set(variants.filter(Boolean)));
      }

    function phase3EscapeRegExp(value) {
        return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      }

    function phase3VisualRowsForEntry(entryId = '', rows = []) {
    	    const target = normalizeForEvidence(entryId.replace(/^visual:/, '').replace(/-/g, ' '));
    	    return candidateList(rows).filter((row) => {
    	      const text = normalizeForEvidence([
    	        row.id,
    	        row.cardId,
    	        row.label,
    	        row.title,
    	        row.description,
    	        ...(row.visualHints || []),
    	        ...(row.shapeHints || []),
    	        ...(row.sceneHints || []),
    	      ].filter(Boolean).join(' '));
    	      return target && target.split(/\s+/).some((term) => text.includes(term));
    	    });
    	  }

    function phase3SlotBudget(slot = {}) {
    	    const budgets = slot.budgets || {};
    	    return Math.max(1, Number(budgets.primitive || 0) + Number(budgets.surfaceCard || 0) + Number(budgets.universe || 0) + Number(budgets.support || 0));
    	  }

    Object.assign(scope, {
      phase1RuntimeReceipts,
      runPhase2LanguageGraph,
      emptyPromptParse,
      languageGraphFromPromptParse,
      languageGraphClauseRelations,
      languageGraphSpans,
      semanticStopwordHas,
      runPhase3Retrieval,
      assertPhase3RetrievalEvidencePromptHash,
      curatePhase3PrimitiveCandidates,
      phase3TypedEvidenceBuckets,
      phase3EvidenceSlot,
      phase3MatchingLanguageSpans,
      phase3EvidenceBucketRow,
      phase3SupportRowIsGeneric,
      phase3SlotEvidence,
      phase3LiteralSlotCandidate,
      phase3CandidatesForSlot,
      phase3RowsForSlot,
      phase3ModelRowsForSlot,
      uniquePhase3SlotRows,
      phase3FilterRowsForEntry,
      phase3VisualRowsForEntry,
      phase3SlotBudget,
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
