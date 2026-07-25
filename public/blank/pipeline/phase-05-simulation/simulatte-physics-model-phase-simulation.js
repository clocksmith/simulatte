(function attachSimulattePhysicsModelphasesimulation(root) {
  const scope = root.SimulattePhaseModuleRegistry.family('physicsModel');

    const normalizedSimulationSpecs = new WeakSet();

    function reportCompilePhaseProgress(options = {}, stage = '', taskPercent = 0, message = '') {
        if (typeof options.onPhaseProgress !== 'function') return;
        options.onPhaseProgress({
          source: 'simulatte-pipeline-compiler',
          state: 'active',
          stage,
          taskPercent,
          progressScope: 'task',
          message,
        });
      }

    function createSpec(templateId = 'magnetic-wheel', overrides = {}) {
        const template = scope.templateById(templateId);
        const name = String(overrides.name || template.name).trim() || template.name;
        const controls = (overrides.controls || template.controls || []).map(scope.normalizeControl);
        const modules = scope.uniqueList(overrides.modules || template.modules || []);
        const objects = scope.normalizeObjects(overrides.objects, template.objects || []);
        const params = scope.normalizeParams(template, overrides.params, controls);
        const spec = {
          schema: 'simulatte.simulationSpec.v1',
          id: overrides.id || deterministicSpecId(template.id, name, modules, objects, params),
          templateId: template.id,
          name,
          kind: template.kind,
          description: String(overrides.description || template.description),
          modules,
          objects,
          controls,
          params,
          intent: overrides.intent || null,
          contract: overrides.contract || (
            overrides.intent && overrides.intent.resolution
              ? overrides.intent.resolution.contract || null
              : null
          ),
          promptParse: overrides.promptParse || null,
          universeGraph: overrides.universeGraph || null,
          physicsIR: overrides.physicsIR || null,
          validationReceipt: overrides.validationReceipt || null,
          solverGraph: overrides.solverGraph || null,
          renderIR: overrides.renderIR || null,
          phaseArtifacts: scope.mergePhaseArtifacts(
            overrides.phaseArtifacts,
            overrides.intent && overrides.intent.phaseArtifacts
          ),
          createdAt: overrides.createdAt || new Date(0).toISOString(),
          remixOf: overrides.remixOf || '',
        };
        if (spec.templateId === 'custom-world') {
          reportCompilePhaseProgress(overrides, 'simulation', 0, 'Compiling simulation');
          Object.assign(spec, compileCompilerArtifacts(spec, overrides));
        }
        if (spec.phaseArtifacts && spec.phaseArtifacts.phase4 && !spec.phaseArtifacts.phase5) {
          const phase5 = scope.runPhase5SimulationCompile(spec.phaseArtifacts.phase4, scope.runtimeContextFromPhase(spec.phaseArtifacts.phase4));
          const simulationCompile = phase5.artifact && phase5.artifact.simulationCompile || {};
          spec.phaseArtifacts = scope.mergePhaseArtifacts(spec.phaseArtifacts, scope.phaseArtifactSet(null, phase5));
          spec.physicsIR = spec.physicsIR || simulationCompile.physicsIR || null;
          spec.validationReceipt = spec.validationReceipt || simulationCompile.validationReceipt || null;
          spec.solverGraph = spec.solverGraph || simulationCompile.solverGraph || null;
          spec.renderIR = spec.renderIR || simulationCompile.renderIR || null;
        }
        if (spec.templateId === 'custom-world') {
          reportCompilePhaseProgress(overrides, 'simulation', 100, 'Simulation compiled');
        }
        if (spec.phaseArtifacts && spec.phaseArtifacts.phase5) {
          reportCompilePhaseProgress(overrides, 'visual', 0, 'Building VisualIR');
          const phase6Compiled = scope.compilePhase6VisualProgram(spec.phaseArtifacts.phase5, overrides.compositionGraph || null);
          spec.compositionGraph = phase6Compiled.compositionGraph;
          spec.renderProgram = phase6Compiled.visualProgram;
          spec.phaseArtifacts = {
            ...spec.phaseArtifacts,
            phase6: scope.createVisualCompileEnvelopeFromCompiled(spec.phaseArtifacts.phase5, phase6Compiled),
          };
          reportCompilePhaseProgress(overrides, 'visual', 100, 'VisualIR ready');
        } else {
          spec.compositionGraph = overrides.compositionGraph || (
            scope.buildCompositionGraph && spec.templateId === 'custom-world' ? scope.buildCompositionGraph(spec) : null
          );
          spec.renderProgram = overrides.renderProgram || (
            spec.compositionGraph && scope.compileCompositionToRenderProgram
              ? scope.compileCompositionToRenderProgram(spec.compositionGraph, spec)
              : null
          );
        }
        spec.physicalSpec = overrides.physicalSpec || (
          spec.contract && spec.contract.graph ? compilePhysicalSpec(spec) : null
        );
        normalizedSimulationSpecs.add(spec);
        return spec;
      }

    function deterministicSpecId(templateId, name, modules, objects, params) {
        const source = JSON.stringify({ templateId, name, modules, objects, params });
        return `${scope.slugify(name)}-${scope.fnv1a32(source).toString(36)}`;
      }

    function normalizeSpec(raw) {
        if (!raw || typeof raw !== 'object') return createSpec('magnetic-wheel');
        if (normalizedSimulationSpecs.has(raw)) return raw;
        const template = scope.templateById(raw.templateId);
        return createSpec(template.id, {
          id: raw.id || '',
          name: raw.name || template.name,
          description: raw.description || template.description,
          modules: raw.modules || template.modules || [],
          objects: raw.objects || template.objects || [],
          controls: raw.controls || template.controls || [],
          params: raw.params || {},
          intent: raw.intent || null,
          contract: raw.contract || null,
          compositionGraph: raw.compositionGraph || null,
          renderProgram: raw.renderProgram || null,
          physicalSpec: raw.physicalSpec || null,
          promptParse: raw.promptParse || null,
          universeGraph: raw.universeGraph || null,
          physicsIR: raw.physicsIR || null,
          validationReceipt: raw.validationReceipt || null,
          solverGraph: raw.solverGraph || null,
          renderIR: raw.renderIR || null,
          phaseArtifacts: raw.phaseArtifacts || null,
          createdAt: raw.createdAt || new Date(0).toISOString(),
          remixOf: raw.remixOf || '',
        });
      }

    function compileCompilerArtifacts(spec, overrides = {}) {
        const intent = spec.intent || {};
        const phaseArtifacts = scope.mergePhaseArtifacts(
          spec.phaseArtifacts,
          intent.phaseArtifacts,
          overrides.phaseArtifacts
        );
        const phase2Output = phaseArtifacts.phase2 || null;
        const phase4Output = phaseArtifacts.phase4 || null;
        const languageGraph = phase2Output && phase2Output.artifact && phase2Output.artifact.languageGraph || {};
        const groundedIntent = phase4Output && phase4Output.artifact && phase4Output.artifact.groundedIntent || {};
        const prompt = languageGraph.sourceText || spec.name || '';
        const promptParse = overrides.promptParse || spec.promptParse || intent.promptParse || (
          scope.parsePrompt ? scope.parsePrompt(prompt) : null
        );
        const selectedUniverseGraph = overrides.universeGraph ||
          spec.universeGraph ||
          groundedIntent.acceptedGraph ||
          intent.universeGraph ||
          (
          scope.groundUniverseGraph && promptParse
            ? scope.groundUniverseGraph({
              prompt,
              promptParse,
              components: spec.objects || [],
              semanticRag: intent.semanticRag,
              universeMatches: intent.universeMatches,
              synthesis: intent.synthesis,
              cardMatches: intent.cardMatches || [],
              intentBrief: intent.intentBrief || null,
            })
            : null
          );
        const universeGraph = mergeUniverseGraphIntentBrief(selectedUniverseGraph, intent.intentBrief || null);
        let nextIR = overrides.physicsIR || spec.physicsIR || null;
        if (!nextIR && scope.buildPhysicsIR && universeGraph) {
          nextIR = scope.buildPhysicsIR({
            universeGraph,
            objects: spec.objects || [],
            params: spec.params || {},
            contract: spec.contract,
          });
        }
        const validationReceipt = overrides.validationReceipt || spec.validationReceipt || (
          nextIR && scope.validatePhysicsIR ? scope.validatePhysicsIR(nextIR) : null
        );
        if (nextIR && validationReceipt) {
          nextIR = {
            ...nextIR,
            receipt: {
              exact: validationReceipt.exact || [],
              approximate: validationReceipt.approximate || [],
              unresolved: validationReceipt.unresolved || [],
              unsupported: validationReceipt.unsupported || [],
            },
          };
        }
        const solverGraph = overrides.solverGraph || spec.solverGraph || (
          nextIR && scope.compileSolverGraph ? scope.compileSolverGraph(nextIR, validationReceipt) : null
        );
        const nextRenderIR = overrides.renderIR || spec.renderIR || (
          nextIR && solverGraph && scope.compileRenderIR
            ? attachRenderIRPhaseInputs(scope.compileRenderIR(nextIR, solverGraph, universeGraph), universeGraph)
            : null
        );
        const nextIntent = intent && promptParse && universeGraph
          ? { ...intent, promptParse, universeGraph }
          : intent;
        let generatedPhaseArtifacts = {};
        let runtimeContext = phase4Output ? scope.runtimeContextFromPhase(phase4Output) : scope.runtimeContextFromOptions({});
        let nextPhase4 = phase4Output || null;
        if (!nextPhase4) {
          const compatibilityPhase1 = scope.withPhase1RetrievalEvidence(
            phaseArtifacts.phase1 || scope.runPhase1RuntimeGate(prompt, { allowPrototypeFallback: true }),
            {
              semanticRag: intent.semanticRag,
              universeMatches: intent.universeMatches || [],
              intentBrief: intent.intentBrief || null,
              universeGraph,
              contract: spec.contract,
              components: spec.objects || [],
              visualSource: {
                specId: spec.id,
                templateId: spec.templateId,
                name: spec.name,
                kind: spec.kind,
                modules: spec.modules || [],
                objects: spec.objects || [],
                params: spec.params || {},
                contract: spec.contract || null,
              },
            }
          );
          runtimeContext = scope.runtimeContextFromPhase(compatibilityPhase1);
          const compatibilityPhase2 = phaseArtifacts.phase2 || scope.runPhase2LanguageGraph(compatibilityPhase1);
          const compatibilityPhase3 = scope.runPhase3Retrieval(compatibilityPhase2, runtimeContext);
          nextPhase4 = scope.runPhase4GroundedIntent(compatibilityPhase3, runtimeContext);
          generatedPhaseArtifacts = scope.phaseArtifactSet(
            compatibilityPhase1,
            compatibilityPhase2,
            compatibilityPhase3,
            nextPhase4
          );
        }
        nextPhase4 = scope.mergePhase4IntentBrief(nextPhase4, intent.intentBrief || null);
        const nextPhase5 = phaseArtifacts.phase5 || scope.runPhase5SimulationCompile(nextPhase4, runtimeContext);
        const simulationCompile = nextPhase5.artifact && nextPhase5.artifact.simulationCompile || {};
        return {
          intent: nextIntent,
          promptParse,
          universeGraph,
          physicsIR: simulationCompile.physicsIR || nextIR,
          validationReceipt: simulationCompile.validationReceipt || validationReceipt,
          solverGraph: simulationCompile.solverGraph || solverGraph,
          renderIR: simulationCompile.renderIR || nextRenderIR,
          phaseArtifacts: scope.mergePhaseArtifacts(phaseArtifacts, generatedPhaseArtifacts, scope.phaseArtifactSet(nextPhase4, nextPhase5)),
        };
      }

    function attachRenderIRPhaseInputs(renderIR, universeGraph) {
        if (!renderIR || typeof renderIR !== 'object') return renderIR;
        return {
          ...renderIR,
          causalAffordances: Array.isArray(universeGraph && universeGraph.visualAffordances)
            ? universeGraph.visualAffordances.slice(0, 8).map((row) => ({ ...row }))
            : [],
          intentBriefReceipt: universeGraph && universeGraph.intentBrief
            ? scope.intentBriefReceipt(universeGraph.intentBrief)
            : null,
          phaseInputs: {
            ...(renderIR.phaseInputs || {}),
            source: 'universeGraph.visualAffordances',
            neighboringIO: true,
          },
        };
      }

    function compilePhysicalSpec(spec) {
        const graph = spec.contract && spec.contract.graph || {};
        const renderProgram = spec.renderProgram || {};
        const solverPlan = renderProgram.solverPlan || scope.solverPlanForGraph(graph);
        const solverGraph = spec.solverGraph || null;
        const solverChannels = solverGraph ? Object.keys(solverGraph.channels || {}) : [];
        const solverSteps = solverGraph ? solverGraph.steps || [] : [];
        const nodes = graph.nodes || [];
        // Prefer the executable solverGraph channels as the source of truth for state
        // hints; fall back to the legacy solverPlan only when no solverGraph compiled.
        // This keeps visual hints from desyncing with the authoritative execution graph.
        const visualStateHints = scope.uniqueList([
          ...(solverGraph ? solverChannels : (solverPlan.state || [])),
          ...nodes.flatMap((node) => node.solverRequirements || []),
        ]);
        const intentBrief = spec.universeGraph && spec.universeGraph.intentBrief || null;
        const intentBriefLedger = scope.intentBriefLedgerCounts(intentBrief);
        const visualPassHints = scope.renderPassesForSolverPlan(solverPlan);
        const nodeIdsByType = (type) => nodes.filter((node) => node.nodeType === type).map((node) => node.id);
        return {
          schema: 'simulatte.physicalSpec.v1',
          sourceGraph: graph.schema || '',
          prompt: spec.renderIR && spec.renderIR.prompt || spec.universeGraph && spec.universeGraph.prompt || spec.name,
          materials: scope.graphMaterialMap(nodes),
          operators: spec.physicsIR && spec.physicsIR.operators ? spec.physicsIR.operators : graph.operators || [],
          executionSource: solverGraph ? 'solverGraph' : 'solverPlan',
          executableSolverGraph: solverGraph ? {
            schema: solverGraph.schema,
            schedule: solverGraph.schedule || [],
            channelCount: solverChannels.length,
            stepCount: solverSteps.length,
            channels: solverChannels,
            steps: solverSteps.map((step) => ({
              operatorId: step.operatorId,
              operatorType: step.operatorType,
              solverId: step.solverId,
              stage: step.stage,
              reads: step.reads || [],
              writes: step.writes || [],
            })),
          } : null,
          stateChannels: solverChannels,
          stateTextures: solverGraph ? solverChannels : visualStateHints,
          visualStateHints,
          sources: nodeIdsByType('source'),
          sinks: nodeIdsByType('sink'),
          boundaries: nodeIdsByType('boundary'),
          sensors: nodeIdsByType('sensor'),
          controllers: nodeIdsByType('controller'),
          particles: scope.particlePlansForNodes(nodes),
          fields: renderProgram.fields || [],
          readouts: spec.contract && spec.contract.readouts || [],
          renderPasses: solverGraph ? scope.renderPassesForSolverGraph(solverGraph) : visualPassHints,
          visualPassHints: solverGraph ? visualPassHints : [],
          debugViews: scope.debugViewsForGraph(graph),
          quality: graph.quality || { score: 1, residualTerms: [] },
          receipt: {
            classifier: spec.intent && spec.intent.classification ? spec.intent.classification.id : '',
            classification: spec.intent && spec.intent.classification
              ? scope.classificationSummary(spec.intent.classification)
              : null,
            rerank: spec.intent && spec.intent.rerank ? spec.intent.rerank : null,
            rag: spec.intent && spec.intent.semanticRag ? spec.intent.semanticRag.model.id : '',
            doppler: scope.dopplerReceipt(spec.intent && spec.intent.dopplerIntent),
            synthesis: scope.synthesisReceipt(spec.intent && spec.intent.synthesis),
            renderer: renderProgram.rendererPlan ? renderProgram.rendererPlan.renderer : '',
            visualIdentity: renderProgram.provenance ? renderProgram.provenance.visualIdentity || null : null,
            visualGenome: renderProgram.provenance ? renderProgram.provenance.visualGenome || null : null,
            graphValidation: graph.validation ? graph.validation.status : 'unknown',
            validation: spec.validationReceipt || null,
            intentEvidenceCount: intentBriefLedger.evidenceCount,
            causalEdgeCount: intentBriefLedger.causalEdgeCount,
            causalAffordanceCount: intentBriefLedger.causalAffordanceCount,
            assumptionCount: intentBriefLedger.assumptionCount,
            unsupportedCount: intentBriefLedger.unsupportedCount,
            degradedCount: intentBriefLedger.degradedCount,
            intentBrief: scope.intentBriefReceipt(intentBrief),
            physicsIR: spec.physicsIR ? spec.physicsIR.schema : '',
            solverGraph: spec.solverGraph ? spec.solverGraph.schema : '',
            renderIR: spec.renderIR ? spec.renderIR.schema : '',
          },
        };
      }

    function mergeUniverseGraphIntentBrief(universeGraph = null, authoritativeBrief = null) {
        if (!universeGraph || typeof universeGraph !== 'object') return universeGraph;
        if (!authoritativeBrief || typeof authoritativeBrief !== 'object') return universeGraph;
        const current = universeGraph.intentBrief || null;
        const authoritativeReceipt = scope.intentBriefReceipt(authoritativeBrief);
        if (!authoritativeReceipt) return universeGraph;
        return {
          ...universeGraph,
          intentBrief: {
            ...(current || {}),
            ...authoritativeReceipt,
            activationSummary: current && current.activationSummary || authoritativeBrief.activationSummary || null,
            languageEvidence: current && current.languageEvidence || authoritativeBrief.languageEvidence || null,
            groundedInterpretation: current && current.groundedInterpretation || authoritativeBrief.groundedInterpretation || null,
            retrievedEvidence: current && current.retrievedEvidence || authoritativeBrief.retrievedEvidence || [],
            causalGraph: current && Array.isArray(current.causalGraph) && current.causalGraph.length
              ? current.causalGraph
              : authoritativeBrief.causalGraph || [],
            assumptions: current && current.assumptions || authoritativeBrief.assumptions || [],
            alternatives: current && current.alternatives || authoritativeBrief.alternatives || [],
            unsupported: current && current.unsupported || authoritativeBrief.unsupported || [],
            degradedTo: current && current.degradedTo || authoritativeBrief.degradedTo || [],
            negativeKnowledge: current && current.negativeKnowledge || authoritativeBrief.negativeKnowledge || [],
            visualIntent: current && current.visualIntent || authoritativeBrief.visualIntent || null,
          },
          visualAffordances: Array.isArray(universeGraph.visualAffordances) && universeGraph.visualAffordances.length
            ? universeGraph.visualAffordances
            : authoritativeBrief.visualIntent && Array.isArray(authoritativeBrief.visualIntent.affordances)
              ? authoritativeBrief.visualIntent.affordances.slice(0, 8).map((row) => ({ ...row }))
              : universeGraph.visualAffordances || [],
        };
      }

    root.SimulattePhaseModuleRegistry.define('physicsModel', 'simulatte-physics-model-phase-simulation.js', {
      reportCompilePhaseProgress,
      createSpec,
      normalizeSpec,
      compileCompilerArtifacts,
      attachRenderIRPhaseInputs,
      compilePhysicalSpec,
      mergeUniverseGraphIntentBrief,
    });

})(typeof globalThis !== 'undefined' ? globalThis : window);
