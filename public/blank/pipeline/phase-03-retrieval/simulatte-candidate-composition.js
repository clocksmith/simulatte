(function attachCandidateComposition(root) {
  const scope = root.SimulattePhaseModuleRegistry.family('physicsModel');

    function retrieveIntentCandidates(phase2Output, runtimeContext = {}, options = {}) {
        scope.assertPhaseEnvelope(phase2Output, 2, 'Phase 3 candidate input');
        const languageGraph = phase2Output.artifact.languageGraph;
        const sourceText = languageGraph.sourceText;
        scope.assertPhase3RetrievalEvidencePromptHash(scope.retrievalEvidenceFromOptions(options), scope.stableTextHash(sourceText));
        const prompt = String(sourceText || '').toLowerCase();
        const words = prompt.split(/[^a-z0-9]+/).filter(Boolean);
        const title = scope.titleFromPrompt(words);
        const promptParse = phase2Output.artifact.promptParse || null;
        const semanticRag = options.semanticRag || (
          scope.createSemanticRag && prompt.trim()
            ? scope.createSemanticRag(sourceText, scope.PHYSICAL_PRIMITIVES, {
              maxDocuments: 72,
              maxOpenComponents: 12,
              typedSpans: promptParse && promptParse.spans || [],
              suppressObservableOpenComponents: (languageGraph.predicates || [])
                .some((row) => row.process === 'measurement'),
            })
            : null
        );
        const universeMatches = options.universeMatches || null;
        const dopplerIntent = scope.normalizeDopplerIntent
          ? scope.normalizeDopplerIntent(options.dopplerIntent || options.dopplerHints, scope.PHYSICAL_PRIMITIVES)
          : null;
        const hasModelBackedSelection = Array.isArray(options.embeddingPriors)
          && options.embeddingPriors.length
          && options.embeddingModel
          && options.embeddingModel.id;
        const allowPrototypeFallback = options.allowPrototypeFallback === true;
        const deterministicRuntime = options.deterministicRuntime === true;
        const blankPromptIntent = options.blankPromptIntent === true;
        const shouldClassify = scope.classifyIntentPrompt && (
          hasModelBackedSelection ||
          deterministicRuntime ||
          allowPrototypeFallback ||
          !prompt ||
          blankPromptIntent
        );
        const classification = shouldClassify
          ? scope.classifyIntentPrompt(sourceText, {
            max: 36,
            embeddingPriors: options.embeddingPriors || [],
            embeddingModel: options.embeddingModel || null,
            embeddingBackend: options.embeddingBackend || '',
            allowPrototypeFallback,
            deterministicRuntime,
            blankPromptIntent,
            semanticRag,
            languageGraph,
            sceneLanguageGraph: phase2Output.artifact.sceneLanguageGraph || null,
            classificationTierPolicy: options.classificationTierPolicy
              || options.promptRuntimeReceipt && options.promptRuntimeReceipt.classificationTierPolicy
              || null,
            classificationTierId: options.classificationTierId || null,
            classificationCalibration: options.classificationCalibration
              || options.promptRuntimeReceipt && options.promptRuntimeReceipt.classificationCalibration
              || null,
            boundedClassification: options.boundedClassification || null,
          })
          : null;
        const intent = {
          schema: 'simulatte.intent.v1',
          prompt: String(sourceText || ''),
          title: title || 'Custom Physics World',
          domains: [],
          components: [],
          conceptGraph: [],
          classification,
          promptParse,
          universeGraph: null,
          rerank: options.intentRerank || options.rerank || null,
          semanticRag,
          universeMatches,
          dopplerIntent,
          spanRetrieval: options.spanRetrieval || null,
          intentBrief: null,
          phaseArtifacts: {},
          resolution: {
            mode: '2d',
            integrator: 'semi-implicit-euler',
            renderer: 'webgpu-field-with-canvas-fallback',
            ranker: classification ? classification.id : 'simulatte-physical-primitives-v1',
            classifier: classification ? classification.id : 'simulatte-physical-primitives-v1',
            embedding: classification && classification.runtime ? classification.runtime : null,
            classification: classification ? scope.classificationSummary(classification) : null,
            rerank: options.intentRerank || options.rerank || null,
            doppler: dopplerIntent ? scope.dopplerReceipt(dopplerIntent) : null,
            retrievalPhase: options.retrievalPhase || '',
            spanRetrieval: scope.spanRetrievalReceipt(options.spanRetrieval || null),
          },
        };
        const addDomain = (...domains) => {
          for (const domain of domains) {
            if (!intent.domains.includes(domain)) intent.domains.push(domain);
          }
        };
        const addComponent = (id, type, role, params = {}, controls = [], score = 0, meta = {}) => {
          if (intent.components.some((component) => component.id === id)) return;
          intent.components.push({
            id,
            type,
            role,
            params,
            controls: scope.uniqueList(controls),
            score: Number(score || 0),
            ...meta,
          });
        };

        if (!prompt || blankPromptIntent) {
          intent.title = 'Blank Construction Plane';
          addDomain('blank');
          intent.resolution.integrator = 'none';
          addComponent('canvas', 'plane', 'empty 2d construction surface', { guideDensity: 0.42, canvasScale: 0.62 });
          if (scope.groundUniverseGraph && promptParse) {
            intent.universeGraph = scope.groundUniverseGraph({
              prompt,
              promptParse,
              components: intent.components,
              semanticRag,
              universeMatches,
              synthesis: null,
            });
          }
          const retrievalRuntimeContext = scope.createPhase3Resources(phase2Output, runtimeContext, {
            ...scope.retrievalEvidenceFromOptions(options),
          sourcePromptHash: scope.stableTextHash(sourceText),
            rankedPrimitives: [],
            rankedCards: options.cardMatches || options.surfaceCardMatches || [],
            rankedUniverseRows: Array.isArray(universeMatches) ? universeMatches : [],
            semanticRag,
            rerank: intent.rerank,
            retrievalPhase: options.retrievalPhase || '',
            intentBrief: intent.intentBrief || null,
            universeGraph: intent.universeGraph || null,
            contract: intent.resolution.contract || null,
            components: intent.components || [],
            visualSource: {
              templateId: 'custom-world',
              name: intent.title,
              kind: 'custom',
              modules: intent.domains || [],
              objects: intent.components || [],
              params: {},
              contract: intent.resolution.contract || null,
            },
          });
          const phase3Output = scope.runPhase3Retrieval(phase2Output, retrievalRuntimeContext);
          return finishCandidate(intent, phase3Output, options);
        }

        const synthesis = scope.synthesizeWorldIntent
          ? scope.synthesizeWorldIntent(sourceText, {
            cardMatches: options.cardMatches || options.surfaceCardMatches || [],
            primitivePriors: options.embeddingPriors || [],
            embeddingModel: options.embeddingModel || null,
            semanticRag,
            dopplerIntent,
          }, scope.catalog)
          : null;
        if (synthesis) {
          intent.synthesis = synthesis;
          intent.resolution.synthesis = scope.synthesisReceipt(synthesis);
        }

        const intentBrief = scope.buildIntentForensics
          ? scope.buildIntentForensics({
            prompt: sourceText,
            promptParse,
            semanticRag,
            universeMatches,
            dopplerIntent,
            synthesis,
            cardMatches: options.cardMatches || options.surfaceCardMatches || [],
            embeddingPriors: options.embeddingPriors || [],
            embeddingModel: options.embeddingModel || null,
            intentRerank: options.intentRerank || options.rerank || null,
            promptRuntimeReceipt: options.promptRuntimeReceipt || null,
            spanRetrieval: options.spanRetrieval || null,
            evidenceRows: options.evidenceRows || [],
          })
          : null;
        if (intentBrief) {
          intent.intentBrief = intentBrief;
          intent.resolution.intentBrief = {
            schema: intentBrief.schema || scope.INTENT_BRIEF_SCHEMA || 'simulatte.intentBrief.v1',
            evidenceCount: (intentBrief.retrievedEvidence || []).length,
            causalEdgeCount: (intentBrief.causalGraph || []).length,
            assumptionCount: (intentBrief.assumptions || []).length,
            unsupportedCount: (intentBrief.unsupported || []).length,
            confidence: intentBrief.confidence || 0,
          };
        }

        const baseCatalogRanked = classification && scope.rankPrimitivesForClassification
          ? scope.rankPrimitivesForClassification(classification, { max: 40 })
          : scope.withPrimitiveDependencies(scope.rankPhysicalPrimitives(sourceText), sourceText);
        const synthRows = scope.synthesisPrimitiveRows(synthesis);
        const preferSynthGraph = scope.shouldPreferSynthGraph(sourceText, synthesis);
        const catalogRanked = preferSynthGraph ? [] : baseCatalogRanked;
        const semanticRows = preferSynthGraph ? [] : scope.semanticOpenPrimitives(semanticRag);
        const languageAnchorRows = scope.lexicalSpanPrimitives(promptParse, semanticRag);
        const explicitRows = scope.explicitPromptPrimitiveRows(classification, sourceText);
        const ranked = scope.mergeRankedPrimitives(
          catalogRanked,
          synthRows,
          semanticRows,
          languageAnchorRows,
          scope.dopplerHintPrimitives(dopplerIntent, sourceText),
          explicitRows
        );
        const contract = scope.contractSummaryForPrimitives(ranked, sourceText);
        if (classification) {
          contract.layerFocus = classification.layerFocus;
          contract.classification = scope.classificationSummary
            ? scope.classificationSummary(classification)
            : {
              id: classification.id,
              kind: classification.kind,
              model: classification.model,
              modelId: classification.modelId,
              rankingPolicy: classification.rankingPolicy,
              candidateCounts: classification.candidateCounts,
              confidence: classification.confidence,
              layerFocus: classification.layerFocus,
            };
        }
        if (dopplerIntent) {
          contract.doppler = {
            schema: dopplerIntent.schema,
            source: dopplerIntent.source,
            model: dopplerIntent.model || null,
            primitives: dopplerIntent.primitives.map((hint) => hint.primitiveId),
            regimes: dopplerIntent.regimes,
            operators: dopplerIntent.operators,
          };
        }
        if (synthesis) {
          contract.synthesis = {
            schema: synthesis.schema || scope.SYNTHESIS_SCHEMA || '',
            model: synthesis.model,
            valid: synthesis.validation ? synthesis.validation.valid : false,
            nodes: synthesis.synthGraph ? synthesis.synthGraph.nodes.length : 0,
            relations: synthesis.synthGraph ? synthesis.synthGraph.relations.length : 0,
            events: synthesis.synthGraph ? synthesis.synthGraph.events.length : 0,
            groundedPrimitives: synthesis.groundedGraph ? synthesis.groundedGraph.primitiveIds.length : 0,
          };
        }
        intent.resolution.layerFocus = contract.layerFocus;
        intent.resolution.topLevel = contract.topLevel;
        intent.resolution.contract = contract;
        if (/\b(perpetual|magnetic wheel|solar magnetic|generator)\b/.test(prompt)) {
          intent.title = 'Solar Magnetic Perpetual Motion Machine';
        } else if (ranked.some((primitive) => primitive.domains.includes('optics'))) {
          intent.title = title || 'Prismatic Optics World';
        } else if (ranked.some((primitive) => primitive.domains.includes('fluid'))) {
          intent.title = title || 'Fluid Physics World';
        } else if (ranked.some((primitive) => primitive.domains.includes('chemistry'))) {
          intent.title = title || 'Reaction Field';
        } else if (ranked.some((primitive) => primitive.domains.includes('acoustics'))) {
          intent.title = title || 'Acoustic Wave World';
        } else {
          intent.title = title || 'Generated Physics World';
        }

        for (const primitive of ranked) {
          const primitiveContract = scope.contractForComponent(contract, primitive.id);
          addDomain(...primitive.domains);
          addComponent(
            primitive.id,
            primitive.type,
            primitive.role,
            primitive.params,
            primitive.controls,
            primitive.score,
            {
              layer: primitive.layer || '',
              domains: primitive.domains || [],
              material: primitive.material || '',
              visualRegime: primitive.visualRegime || '',
              assembly: primitive.assembly || '',
              phrase: primitive.phrase || '',
              source: primitive.source || 'catalog',
              pinned: Boolean(primitive.pinned),
              primitiveProgram: primitive.primitiveProgram || null,
              geometry: primitiveContract.geometry,
              ports: primitiveContract.ports,
              slots: primitiveContract.slots,
            }
          );
          intent.conceptGraph.push({
            id: primitive.id,
            score: primitive.score,
            domains: primitive.domains,
            prior: classification && classification.priors
              ? classification.priors.find((prior) => prior.primitiveId === primitive.id) || null
              : null,
            phrase: primitive.phrase || '',
            source: primitive.source || 'catalog',
          });
        }
        scope.addSynthesisComponents(synthesis, addDomain, addComponent, intent);
        if (scope.groundUniverseGraph && promptParse) {
          intent.universeGraph = scope.groundUniverseGraph({
            prompt,
            promptParse,
            components: intent.components,
            semanticRag,
            universeMatches,
            synthesis,
            cardMatches: options.cardMatches || options.surfaceCardMatches || [],
            intentBrief: intent.intentBrief || null,
          });
        }

        const retrievalRuntimeContext = scope.createPhase3Resources(phase2Output, runtimeContext, {
            ...scope.retrievalEvidenceFromOptions(options),
          sourcePromptHash: scope.stableTextHash(sourceText),
          rankedPrimitives: ranked,
          rankedCards: options.cardMatches || options.surfaceCardMatches || [],
          rankedUniverseRows: Array.isArray(universeMatches) ? universeMatches : [],
          classification,
          semanticRag,
          rerank: intent.rerank,
          synthesis,
          retrievalPhase: options.retrievalPhase || '',
          intentBrief: intent.intentBrief || null,
          universeGraph: intent.universeGraph || null,
          contract,
          components: intent.components || [],
          visualSource: {
            templateId: 'custom-world',
            name: intent.title,
            kind: 'custom',
            modules: intent.domains || [],
            objects: intent.components || [],
            params: {},
            contract,
          },
        });
        const phase3Output = scope.runPhase3Retrieval(phase2Output, retrievalRuntimeContext);
        return finishCandidate(intent, phase3Output, options);
      }

  function finishCandidate(intent, phase3Output, options) {
    phase3Output.artifact.retrievalRerankResult.worldSpecCandidate = {
      schema: 'simulatte.worldSpecCandidate.v1',
      intent: scope.phaseContracts.immutableArtifact(intent),
      compilerConfig: scope.worldSpecCompilerConfig(options),
    };
    return { intent, phase3Output };
  }

  root.SimulattePhaseModuleRegistry.define('physicsModel', 'simulatte-candidate-composition.js', { retrieveIntentCandidates });
})(typeof globalThis !== 'undefined' ? globalThis : window);
