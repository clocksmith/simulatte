(function attachSimulattePhysicsModelphasevisualrender(root) {
  const scope = root.__SimulattePhysicsModelRefactorScope;
  if (!scope || scope.missingDependency) return;
  with (scope) {
    function mergePhase4IntentBrief(phase4Output = null, authoritativeBrief = null) {
        if (!phase4Output || !authoritativeBrief || typeof phase4Output !== 'object') return phase4Output;
        const artifact = phase4Output.artifact || {};
        const groundedIntent = artifact.groundedIntent || {};
        const acceptedGraph = groundedIntent.acceptedGraph || null;
        if (!acceptedGraph) return phase4Output;
        const mergedAcceptedGraph = mergeUniverseGraphIntentBrief(acceptedGraph, authoritativeBrief);
        return {
          ...phase4Output,
          artifact: {
            ...artifact,
            groundedIntent: {
              ...groundedIntent,
              acceptedGraph: mergedAcceptedGraph,
              intentBrief: {
                ...(groundedIntent.intentBrief || {}),
                ...intentBriefReceipt(authoritativeBrief),
              },
            },
          },
        };
      }

    function intentBriefLedgerCounts(brief) {
        if (!brief) {
          return {
            evidenceCount: 0,
            causalEdgeCount: 0,
            causalAffordanceCount: 0,
            assumptionCount: 0,
            unsupportedCount: 0,
            degradedCount: 0,
          };
        }
        return {
          evidenceCount: (brief.retrievedEvidence || []).length || Number(brief.evidenceCount || 0),
          causalEdgeCount: (brief.causalGraph || []).length || Number(brief.causalEdgeCount || 0),
          causalAffordanceCount: brief.visualIntent &&
            Array.isArray(brief.visualIntent.affordances)
            ? brief.visualIntent.affordances.length
            : Number(brief.causalAffordanceCount || 0),
          assumptionCount: (brief.assumptions || []).length || Number(brief.assumptionCount || 0),
          unsupportedCount: (brief.unsupported || []).length || Number(brief.unsupportedCount || 0),
          degradedCount: (brief.degradedTo || []).length || Number(brief.degradedCount || 0),
        };
      }

    function intentBriefReceipt(brief) {
        if (!brief) return null;
        const counts = intentBriefLedgerCounts(brief);
        return {
          schema: brief.schema || 'simulatte.intentBrief.v1',
          modelStack: brief.modelStack || null,
          evidenceCount: counts.evidenceCount,
          causalEdgeCount: counts.causalEdgeCount,
          groundedCausalEdgeCount: (brief.causalGraph || [])
            .filter((edge) => (edge.evidence || []).length).length,
          causalAffordanceCount: counts.causalAffordanceCount,
          assumptionCount: counts.assumptionCount,
          unsupportedCount: counts.unsupportedCount,
          degradedCount: counts.degradedCount,
          evidenceIds: (brief.retrievedEvidence || []).map((item) => item.id).filter(Boolean).slice(0, 32),
          causalEdgeIds: (brief.causalGraph || []).map((edge) => edge.id || edge.ruleId).filter(Boolean).slice(0, 24)
            .concat((brief.causalEdgeIds || []).slice(0, 24))
            .slice(0, 24),
          causalAffordanceIds: brief.visualIntent && Array.isArray(brief.visualIntent.affordances)
            ? brief.visualIntent.affordances.map((row) => row.id).filter(Boolean).slice(0, 16)
            : (brief.causalAffordanceIds || []).slice(0, 16),
          acceptedActivations: intentBriefAcceptedActivations(brief),
          languageSpans: intentBriefLanguageSpans(brief),
          shaderHints: brief.visualIntent && brief.visualIntent.shaderHints || [],
          motionHints: brief.visualIntent && brief.visualIntent.motionHints || [],
          confidence: Number(brief.confidence || 0),
          validation: brief.validation ? {
            valid: brief.validation.valid,
            errors: brief.validation.errors || [],
            warnings: brief.validation.warnings || [],
          } : null,
        };
      }

    function intentBriefAcceptedActivations(brief) {
        const rows = brief && brief.groundedInterpretation &&
          Array.isArray(brief.groundedInterpretation.acceptedActivations)
          ? brief.groundedInterpretation.acceptedActivations
          : [];
        return rows.slice(0, 48).map((row) => ({
          activationId: row.activationId || row.id || '',
          spanId: row.spanId || '',
          spanKind: row.spanKind || '',
          spanText: row.spanText || '',
          candidateId: row.candidateId || '',
          candidateKind: row.candidateKind || '',
          candidateLabel: row.candidateLabel || '',
          score: Number(row.score || 0),
          source: row.source || '',
          operatorHints: row.hints && Array.isArray(row.hints.operator) ? row.hints.operator.slice(0, 8) : [],
          visualHints: row.hints && Array.isArray(row.hints.visual) ? row.hints.visual.slice(0, 8) : [],
          primitiveHints: row.hints && Array.isArray(row.hints.primitive) ? row.hints.primitive.slice(0, 8) : [],
        }));
      }

    function intentBriefLanguageSpans(brief) {
        const spans = brief && brief.languageEvidence && Array.isArray(brief.languageEvidence.spans)
          ? brief.languageEvidence.spans
          : [];
        return spans
          .filter((span) => span && span.text && ['clause', 'predicate-frame', 'verb-phrase', 'noun-phrase', 'modifier'].includes(span.kind || ''))
          .slice(0, 48)
          .map((span) => ({
            id: span.id || '',
            kind: span.kind || 'span',
            text: span.text || '',
          }));
      }

    function graphMaterialMap(nodes) {
        return Object.fromEntries((nodes || [])
          .filter((node) => node.material)
          .map((node) => [node.id, node.material]));
      }

    function solverPlanForGraph(graph) {
        const regimes = new Set((graph.nodes || []).map((node) => node.visualRegime).filter(Boolean));
        const families = [];
        if (regimes.has('fluid')) families.push('particle-advection');
        if (regimes.has('thermal')) families.push('heat-diffusion');
        if (regimes.has('optical')) families.push('ray-optics');
        if (regimes.has('magnetic')) families.push('magnetic-vector-field');
        if (regimes.has('electrical')) families.push('electric-potential-field');
        if (regimes.has('granular')) families.push('granular-settling');
        if (regimes.has('biological')) families.push('growth-diffusion');
        if (regimes.has('soft')) families.push('membrane-relaxation');
        if (regimes.has('acoustic')) families.push('wave-equation');
        if (regimes.has('phase')) families.push('phase-boundary');
        if (!families.length) families.push('scalar-coupled-state');
        return { families, state: uniqueList((graph.nodes || []).flatMap((node) => node.solverRequirements || [])) };
      }

    function renderPassesForSolverGraph(solverGraph) {
        if (!solverGraph || !Array.isArray(solverGraph.steps)) return [];
        const names = {
          heat_source: 'thermal-source-solve',
          heat_transfer: 'heat-transfer-solve',
          advection: 'advection-solve',
          diffusion: 'diffusion-solve',
          phase_transition: 'phase-boundary-solve',
          rotational_torque: 'rotational-mechanics-solve',
          rigid_collision: 'rigid-collision-solve',
          fracture_threshold: 'fracture-threshold-solve',
          pressure_flow_lite: 'pressure-flow-solve',
          wave_field: 'wave-field-solve',
          reaction_diffusion: 'reaction-diffusion-solve',
          network_flow: 'network-flow-solve',
          oscillator: 'oscillator-solve',
          growth_decay: 'growth-decay-solve',
          fluid_locomotion: 'fluid-locomotion-solve',
          buoyancy: 'buoyancy-solve',
          drag: 'drag-solve',
          wake_generation: 'wake-generation-solve',
          body_water_contact: 'body-water-contact-solve',
          partial_submersion: 'partial-submersion-solve',
        };
        return uniqueList(solverGraph.steps.map((step) => names[step.operatorType] || `${step.operatorType || 'operator'}-solve`));
      }

    function particlePlansForNodes(nodes) {
        return (nodes || [])
          .filter((node) => node.primitiveProgram)
          .map((node) => ({
            nodeId: node.id,
            visualRegime: node.visualRegime,
            material: node.primitiveProgram.material,
            parts: node.primitiveProgram.parts,
          }));
      }

    function renderPassesForSolverPlan(plan) {
        const families = plan.families || [];
        return uniqueList([
          'state-upload',
          ...families.map((family) => `${family}-solve`),
          'material-field-render',
          'particle-render',
          'composite',
          'debug-readback',
        ]);
      }

    function debugViewsForGraph(graph) {
        return uniqueList([
          'coverage',
          'physical-graph',
          ...(graph.quality && graph.quality.residualTerms && graph.quality.residualTerms.length ? ['residual-terms'] : []),
          ...(graph.validation && graph.validation.status === 'repaired' ? ['repairs'] : []),
        ]);
      }

    function dopplerReceipt(dopplerIntent) {
        if (!dopplerIntent) return null;
        return {
          schema: DOPPLER_INTENT_SCHEMA || 'simulatte.dopplerIntentHints.v1',
          source: dopplerIntent.source || 'doppler-residual-intent',
          model: dopplerIntent.model ? dopplerIntent.model.id : '',
          primitiveCount: (dopplerIntent.primitives || []).length,
          regimes: dopplerIntent.regimes || [],
          operators: dopplerIntent.operators || [],
        };
      }

    function spanRetrievalReceipt(spanRetrieval) {
        if (!spanRetrieval) return null;
        return {
          schema: spanRetrieval.schema || 'simulatte.spanEmbeddingRetrieval.v1',
          model: spanRetrieval.model || '',
          disabledReason: spanRetrieval.disabledReason || '',
          spanCount: Number(spanRetrieval.spanCount || 0),
          embeddedSpanCount: Number(spanRetrieval.embeddedSpanCount || 0),
          cachedSpanCount: Number(spanRetrieval.cachedSpanCount || 0),
          candidateCount: Number(spanRetrieval.candidateCount || 0),
          config: spanRetrieval.config || null,
        };
      }

    function contractForComponent(contract, id) {
        return {
          geometry: contract && contract.geometry ? contract.geometry[id] || null : null,
          ports: contract && contract.ports ? contract.ports[id] || null : null,
          slots: contract && contract.recipeSlots ? contract.recipeSlots[id] || [] : [],
        };
      }

    function averageMaterialProperties(materials = {}) {
        const values = Object.values(materials);
        if (!values.length) return {};
        const totals = {};
        for (const material of values) {
          for (const [key, value] of Object.entries(material)) {
            totals[key] = (totals[key] || 0) + Number(value || 0);
          }
        }
        return Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, value / values.length]));
      }

    function interactionTotals(contract) {
        const totals = {};
        for (const rule of contract && contract.interactions || []) {
          for (const [key, value] of Object.entries(rule.params || {})) {
            totals[key] = (totals[key] || 0) + Number(value || 0);
          }
        }
        return totals;
      }

    function operatorTotals(contract) {
        const totals = {};
        const operators = contract && contract.graph ? contract.graph.operators || [] : [];
        for (const operator of operators) {
          if (operator.id === 'combustion') {
            totals.heat = (totals.heat || 0) + 0.18;
            totals.matter = (totals.matter || 0) - 0.04;
          } else if (operator.id === 'advection') {
            totals.motion = (totals.motion || 0) + 0.12;
          } else if (operator.id === 'erosion') {
            totals.matter = (totals.matter || 0) + 0.14;
            totals.stability = (totals.stability || 0) - 0.04;
          } else if (operator.id === 'refraction') {
            totals.field = (totals.field || 0) + 0.08;
          } else if (operator.id === 'queueService') {
            totals.motion = (totals.motion || 0) - 0.04;
          } else if (operator.id === 'magnetism') {
            totals.field = (totals.field || 0) + 0.12;
          }
        }
        return totals;
      }

    function applyContractDefaults(params, contract) {
        if (!contract) return;
        const material = averageMaterialProperties(contract.materials);
        const interactions = interactionTotals(contract);
        const use = (key, value) => {
          if (Number.isFinite(value)) params[key] = clamp01(Number(value));
        };
        use('density', material.density);
        use('hardness', material.hardness);
        use('conductivity', material.conductivity);
        use('combustibility', material.combustibility + (interactions.fire || 0));
        use('moisture', material.moisture);
        use('opacity', material.opacity);
        if (Number.isFinite(material.refractiveIndex)) {
          params.refractiveIndex = clamp(material.refractiveIndex, 1, 2.6);
        }
        use('magnetization', material.magnetization);
        use('viscosity', material.viscosity);
        use('phaseThreshold', material.phasePoint);
        if (Number.isFinite(interactions.heat)) {
          params.heatTransfer = clamp01((params.heatTransfer || 0) + interactions.heat);
        }
        if (Number.isFinite(interactions.field)) {
          params.fieldStrength = clamp01((params.fieldStrength || 0) + interactions.field);
        }
        if (Number.isFinite(interactions.matter)) {
          params.complexity = clamp01((params.complexity || 0.5) + interactions.matter * 0.25);
        }
      }

    function applyCompiledParameterHints(hintText, params, addControl = () => {}) {
        const evidenceText = String(hintText || '').toLowerCase();
        const has = (...terms) => terms.some((term) => evidenceText.includes(term));
        const assign = (values) => {
          for (const [key, value] of Object.entries(values)) {
            params[key] = value;
            addControl(key);
          }
        };

        if ((has('sunlit', 'solar') && has('rotor', 'wheel')) || has('alternating magnets')) {
          assign({
            irradiance: 1040,
            magneticStrength: 0.9,
            sliderAmplitude: 0.68,
            sliderPhase: 0.12,
            loadTorque: 0.28,
            friction: 0.055,
            driveTiming: 0.64,
          });
        }
        if (has('dry pine', 'combustion', 'smoke lift', 'damp pockets')) {
          assign({
            combustibility: 0.88,
            moisture: 0.18,
            windSpeed: 0.52,
            flowRate: 0.38,
            heatTransfer: 0.74,
            opacity: 0.62,
            damping: 0.07,
          });
        }
        if (has('collimated', 'prismatic', 'refractive split') || has('glass lens', 'prism')) {
          assign({
            lightIntensity: 0.92,
            refractiveIndex: 1.68,
            opacity: 0.08,
            fieldStrength: 0.62,
            heatTransfer: 0.14,
            signalNoise: 0.04,
          });
        }
        if (has('rush-hour', 'demand queue', 'throughput meter', 'noisy packets')) {
          assign({
            queueBacklog: 0.78,
            serviceRate: 0.42,
            marketDemand: 0.74,
            networkLatency: 0.44,
            signalDelay: 0.32,
            signalNoise: 0.18,
          });
        }
        if (has('steep rain', 'rain channel', 'sediment fan', 'gravity slope')) {
          assign({
            flowRate: 0.82,
            erosionRate: 0.62,
            terrainSlope: 0.54,
            gravity: 0.18,
            granularFriction: 0.32,
            moisture: 0.76,
          });
        }
      }

    function parameterHintTextForIntent(intent = {}, contract = null) {
        const brief = intent.intentBrief || {};
        const contractGraph = contract && contract.graph || {};
        return [
          intent.title,
          ...(intent.domains || []),
          ...(intent.components || []).map((component) => [
            component.id,
            component.type,
            component.role,
            component.layer,
            component.material,
            component.visualRegime,
            component.assembly,
            component.phrase,
            ...(component.domains || []),
          ].filter(Boolean).join(' ')),
          ...(contractGraph.nodes || []).map((node) => [
            node.id,
            node.label,
            node.nodeType,
            node.material,
            node.role,
            ...(node.domains || []),
            ...(node.solverRequirements || []),
          ].filter(Boolean).join(' ')),
          ...(contractGraph.operators || []).map((operator) => [
            operator.id,
            operator.type,
            operator.label,
            operator.family,
          ].filter(Boolean).join(' ')),
          ...(brief.retrievedEvidence || []).map((row) => [
            row.id,
            row.label,
            row.indexName,
            ...(row.primitiveHints || []),
            ...(row.operatorHints || []),
            ...(row.visualHints || []),
          ].filter(Boolean).join(' ')),
          ...(brief.groundedInterpretation && brief.groundedInterpretation.acceptedActivations || []).map((row) => [
            row.candidateId,
            row.candidateLabel,
            row.candidateKind,
          ].filter(Boolean).join(' ')),
          ...(brief.causalGraph || []).map((edge) => [
            edge.id,
            edge.relationType,
            edge.operatorType,
            edge.sourceLabel,
            edge.targetLabel,
            edge.mechanism,
          ].filter(Boolean).join(' ')),
        ].filter(Boolean).join(' ');
      }

    function graphNodeForSpec(contract, id) {
        const nodes = contract && contract.graph ? contract.graph.nodes || [] : [];
        return nodes.find((node) => node.id === id) || null;
      }

    function createIntentFromPrompt(promptText = '', options = {}) {
        const phase1Output = runPhase1RuntimeGate(promptText, options);
        const phase2Output = runPhase2LanguageGraph(phase1Output);
        const runtimeContext = runtimeContextFromPhase(phase1Output);
        const languageGraph = phase2Output.artifact.languageGraph;
        const sourceText = languageGraph.sourceText;
        const prompt = String(sourceText || '').toLowerCase();
        const words = prompt.split(/[^a-z0-9]+/).filter(Boolean);
        const title = titleFromPrompt(words);
        const promptParse = phase2Output.artifact.promptParse || null;
        const semanticRag = options.semanticRag || (
          createSemanticRag && prompt.trim()
            ? createSemanticRag(sourceText, PHYSICAL_PRIMITIVES, { maxDocuments: 72, maxOpenComponents: 12 })
            : null
        );
        const universeMatches = options.universeMatches || null;
        const dopplerIntent = normalizeDopplerIntent
          ? normalizeDopplerIntent(options.dopplerIntent || options.dopplerHints, PHYSICAL_PRIMITIVES)
          : null;
        const hasModelBackedSelection = Array.isArray(options.embeddingPriors)
          && options.embeddingPriors.length
          && options.embeddingModel
          && options.embeddingModel.id;
        const allowPrototypeFallback = options.allowPrototypeFallback === true;
        const blankPromptIntent = options.blankPromptIntent === true;
        const shouldClassify = classifyIntentPrompt && (
          hasModelBackedSelection ||
          allowPrototypeFallback ||
          !prompt ||
          blankPromptIntent
        );
        const classification = shouldClassify
          ? classifyIntentPrompt(sourceText, {
            max: 36,
            embeddingPriors: options.embeddingPriors || [],
            embeddingModel: options.embeddingModel || null,
            embeddingBackend: options.embeddingBackend || '',
            allowPrototypeFallback,
            blankPromptIntent,
            semanticRag,
          })
          : null;
        const intent = {
          schema: 'simulatte.intent.v1',
          prompt: String(sourceText || '').trim(),
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
          phaseArtifacts: phaseArtifactSet(phase1Output, phase2Output),
          resolution: {
            mode: '2d',
            integrator: 'semi-implicit-euler',
            renderer: 'webgpu-field-with-canvas-fallback',
            ranker: classification ? classification.model.id : 'simulatte-physical-primitives-v1',
            classifier: classification ? classification.model.id : 'simulatte-physical-primitives-v1',
            embedding: classification && classification.model.runtime ? classification.model.runtime : null,
            rerank: options.intentRerank || options.rerank || null,
            doppler: dopplerIntent ? dopplerReceipt(dopplerIntent) : null,
            retrievalPhase: options.retrievalPhase || '',
            spanRetrieval: spanRetrievalReceipt(options.spanRetrieval || null),
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
            controls: uniqueList(controls),
            score: Number(score || 0),
            ...meta,
          });
        };

        if (!prompt || blankPromptIntent) {
          intent.title = 'Blank Construction Plane';
          addDomain('blank');
          intent.resolution.integrator = 'none';
          addComponent('canvas', 'plane', 'empty 2d construction surface', { guideDensity: 0.42, canvasScale: 0.62 });
          if (groundUniverseGraph && promptParse) {
            intent.universeGraph = groundUniverseGraph({
              prompt,
              promptParse,
              components: intent.components,
              semanticRag,
              universeMatches,
              synthesis: null,
            });
          }
          const phase1WithRetrieval = withPhase1RetrievalEvidence(phase1Output, {
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
          const retrievalRuntimeContext = runtimeContextFromPhase(phase1WithRetrieval);
          const phase3Output = runPhase3Retrieval(phase2Output, retrievalRuntimeContext);
          const phase4Output = runPhase4GroundedIntent(phase3Output, retrievalRuntimeContext);
          intent.phaseArtifacts = phaseArtifactSet(phase1WithRetrieval, phase2Output, phase3Output, phase4Output);
          return intent;
        }

        const synthesis = synthesizeWorldIntent
          ? synthesizeWorldIntent(sourceText, {
            cardMatches: options.cardMatches || options.surfaceCardMatches || [],
            primitivePriors: options.embeddingPriors || [],
            embeddingModel: options.embeddingModel || null,
            semanticRag,
            dopplerIntent,
          }, catalog)
          : null;
        if (synthesis) {
          intent.synthesis = synthesis;
          intent.resolution.synthesis = synthesisReceipt(synthesis);
        }

        const intentBrief = buildIntentForensics
          ? buildIntentForensics({
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
            schema: intentBrief.schema || INTENT_BRIEF_SCHEMA || 'simulatte.intentBrief.v1',
            evidenceCount: (intentBrief.retrievedEvidence || []).length,
            causalEdgeCount: (intentBrief.causalGraph || []).length,
            assumptionCount: (intentBrief.assumptions || []).length,
            unsupportedCount: (intentBrief.unsupported || []).length,
            confidence: intentBrief.confidence || 0,
          };
        }

        const baseCatalogRanked = classification && rankPrimitivesForClassification
          ? rankPrimitivesForClassification(classification, { max: 40 })
          : withPrimitiveDependencies(rankPhysicalPrimitives(sourceText), sourceText);
        const synthRows = synthesisPrimitiveRows(synthesis);
        const preferSynthGraph = shouldPreferSynthGraph(sourceText, synthesis);
        const catalogRanked = preferSynthGraph ? [] : baseCatalogRanked;
        const semanticRows = preferSynthGraph ? [] : semanticOpenPrimitives(semanticRag);
        const languageAnchorRows = lexicalSpanPrimitives(promptParse, semanticRag);
        const explicitRows = explicitPromptPrimitiveRows(classification, sourceText);
        const ranked = mergeRankedPrimitives(
          catalogRanked,
          synthRows,
          semanticRows,
          languageAnchorRows,
          dopplerHintPrimitives(dopplerIntent, sourceText),
          explicitRows
        );
        const contract = contractSummaryForPrimitives(ranked, sourceText);
        if (classification) {
          contract.layerFocus = classification.layerFocus;
          contract.classification = classificationSummary
            ? classificationSummary(classification)
            : {
              model: classification.model.id,
              confidence: classification.confidence,
              layerFocus: classification.layerFocus,
            };
        }
        if (dopplerIntent) {
          contract.doppler = {
            schema: dopplerIntent.schema,
            source: dopplerIntent.source,
            model: dopplerIntent.model,
            primitives: dopplerIntent.primitives.map((hint) => hint.primitiveId),
            regimes: dopplerIntent.regimes,
            operators: dopplerIntent.operators,
          };
        }
        if (synthesis) {
          contract.synthesis = {
            schema: synthesis.schema || SYNTHESIS_SCHEMA || '',
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
          const primitiveContract = contractForComponent(contract, primitive.id);
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
        addSynthesisComponents(synthesis, addDomain, addComponent, intent);
        if (groundUniverseGraph && promptParse) {
          intent.universeGraph = groundUniverseGraph({
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

        const phase1WithRetrieval = withPhase1RetrievalEvidence(phase1Output, {
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
        const retrievalRuntimeContext = runtimeContextFromPhase(phase1WithRetrieval);
        const phase3Output = runPhase3Retrieval(phase2Output, retrievalRuntimeContext);
        const phase4Output = runPhase4GroundedIntent(phase3Output, retrievalRuntimeContext);
        intent.phaseArtifacts = phaseArtifactSet(phase1WithRetrieval, phase2Output, phase3Output, phase4Output);
        return intent;
      }

    Object.assign(scope, {
      mergePhase4IntentBrief,
      intentBriefLedgerCounts,
      intentBriefReceipt,
      intentBriefAcceptedActivations,
      intentBriefLanguageSpans,
      graphMaterialMap,
      solverPlanForGraph,
      renderPassesForSolverGraph,
      particlePlansForNodes,
      renderPassesForSolverPlan,
      debugViewsForGraph,
      dopplerReceipt,
      spanRetrievalReceipt,
      contractForComponent,
      averageMaterialProperties,
      interactionTotals,
      operatorTotals,
      applyContractDefaults,
      applyCompiledParameterHints,
      parameterHintTextForIntent,
      graphNodeForSpec,
      createIntentFromPrompt,
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
