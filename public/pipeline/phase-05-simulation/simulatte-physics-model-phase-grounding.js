(function attachSimulattePhysicsModelphasegrounding(root) {
  const scope = root.__SimulattePhysicsModelRefactorScope;
  if (!scope || scope.missingDependency) return;
  with (scope) {
    function uniqueByJson(rows = []) {
        const seen = new Set();
        return rows.filter((row) => {
          const key = JSON.stringify(row);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      }

    function runPhase4GroundedIntent(phase3Output, runtimeContext = {}) {
        assertPhaseEnvelope(phase3Output, 3, 'Phase 4 input');
        const activationCloud = phase3Output.artifact && phase3Output.artifact.activationCloud || {};
        const groundingEvidence = activationCloud.groundingEvidence || {};
        const languageEvidence = activationCloud.languageEvidence || groundingEvidence.languageEvidence || {};
        const candidateEvidence = activationCloud.candidateEvidence || [];
        const weightedActivations = activationCloud.weightedActivations || [];
        const acceptedComponents = filterRowsAgainstNegativeEvidence(
          groundingEvidence.components || [],
          activationCloud.negativeEvidence || []
        );
        const intentBrief = phase4IntentBriefFromActivationCloud(activationCloud, groundingEvidence);
        const groundedInterpretation = buildGroundedInterpretation
          ? buildGroundedInterpretation({
            languageEvidence,
            activationCloud: weightedActivations,
            structuredIntent: intentBrief,
            causalGraph: intentBrief.causalGraph || [],
            visualAffordances: visualAffordancesFromIntentBrief(intentBrief),
          })
          : {
            schema: 'simulatte.groundedInterpretation.v1',
            acceptedActivations: [],
            evidenceBindings: [],
            unresolvedSpans: [],
            coverageGaps: [],
            summary: {},
          };
    	    const acceptedGraph = groundedIntentAcceptedGraph({
    	      groundingEvidence,
    	      activationCloud,
    	      languageEvidence,
    	      candidateEvidence,
    	      intentBrief,
    	      groundedInterpretation,
    	    });
    	    const rejectedGraph = rejectedGraphFromGrounding(acceptedGraph, groundingEvidence, groundedInterpretation);
    	    const compositionLedger = advanceCompositionLedger(
    	      activationCloud.compositionLedger ||
    	      groundingEvidence.compositionLedger ||
    	      intentBrief.compositionLedger ||
    	      null,
    	      4,
    	      'phase4-grounded-intent'
    	    );
    	    const groundedSceneContract = groundedSceneContractFromPhase4({
    	      acceptedGraph,
    	      rejectedGraph,
    	      activationCloud,
    	      groundingEvidence,
    	      intentBrief,
    	      groundedInterpretation,
    	      compositionLedger,
    	    });
    	    const groundedIntent = {
    	      schema: 'simulatte.groundedIntent.v1',
    	      acceptedGraph,
    	      rejectedGraph,
    	      typedEvidenceBuckets: phaseCarryObject(
    	        activationCloud.typedEvidenceBuckets ||
    	        groundingEvidence.typedEvidenceBuckets ||
    	        intentBrief.typedEvidenceBuckets ||
    	        null
    	      ),
    		      queryPlan: phaseCarryObject(
    		        activationCloud.queryPlan ||
    		        groundingEvidence.queryPlan ||
    		        intentBrief.queryPlan ||
    		        null
    		      ),
    		      slotEvidence: phaseCarryObject(
    		        activationCloud.slotEvidence ||
    		        groundingEvidence.slotEvidence ||
    		        intentBrief.slotEvidence ||
    		        []
    		      ),
    		      acceptedCandidatesBySlot: phaseCarryObject(
    		        activationCloud.acceptedCandidatesBySlot ||
    		        groundingEvidence.acceptedCandidatesBySlot ||
    		        intentBrief.acceptedCandidatesBySlot ||
    		        {}
    		      ),
    		      missingRequiredSlots: phaseCarryObject(
    		        activationCloud.missingRequiredSlots ||
    		        groundingEvidence.missingRequiredSlots ||
    		        intentBrief.missingRequiredSlots ||
    		        []
    		      ),
    		      negativeEvidence: phaseCarryObject(activationCloud.negativeEvidence || []),
    		      compositionLedger: phaseCarryObject(compositionLedger),
    	      groundedSceneContract,
    	      assumptions: groundingEvidence.assumptions || intentBrief.assumptions || [],
    	      unsupported: groundingEvidence.unsupported || acceptedGraph && acceptedGraph.unsupported || intentBrief.unsupported || [],
          provenanceByNode: provenanceByNodeRows(acceptedGraph, {
            ...intentBrief,
            evidenceBindings: uniqueById([
              ...(intentBrief.evidenceBindings || []),
              ...(groundedInterpretation.evidenceBindings || []),
            ]),
          }),
          contract: groundingEvidence.contract || null,
          components: acceptedComponents,
          params: groundingEvidence.params || {},
          visualSource: groundingEvidence.visualSource || null,
          grounding: {
            schema: groundedInterpretation.schema || '',
            acceptedActivationCount: (groundedInterpretation.acceptedActivations || []).length,
            evidenceBindingCount: (groundedInterpretation.evidenceBindings || []).length,
            coverageGapCount: (groundedInterpretation.coverageGaps || []).length,
          },
        };
        return createPhaseEnvelope({
          phase: 4,
          inputSchema: phase3Output.schema,
          runtimeReceiptId: runtimeContext.runtimeReceiptId || phase3Output.runtimeReceiptId,
    	      artifact: {
    	        activationCloud,
    	        groundedIntent,
    	        groundedSceneContract,
    	        compositionLedger,
    	      },
    	      receipts: [
    	        {
    	          id: 'phase4-grounded-intent',
    	          schema: 'simulatte.phaseReceipt.v1',
    	          acceptedNodes: acceptedGraph && Array.isArray(acceptedGraph.nodes) ? acceptedGraph.nodes.length : 0,
    	          acceptedRelations: groundedSceneContract.acceptedRelations.length,
    	          acceptedObligations: groundedSceneContract.acceptedObligations.length,
    	          unsupported: groundedIntent.unsupported.length,
    	          assumptions: groundedIntent.assumptions.length,
    	        },
    	      ],
        });
      }

    function phase4IntentBriefFromActivationCloud(activationCloud = {}, groundingEvidence = {}) {
        const carried = groundingEvidence.intentBrief || {};
        const candidateEvidence = activationCloud.candidateEvidence || [];
        const languageEvidence = activationCloud.languageEvidence || groundingEvidence.languageEvidence || {};
        const graphIntentBrief = groundingEvidence.universeGraphCandidates &&
          groundingEvidence.universeGraphCandidates.intentBrief || {};
        const graphVisualIntent = graphIntentBrief.visualIntent || {};
        const graphAffordances = visualAffordancesFromUniverseGraphCandidates(
          groundingEvidence.universeGraphCandidates || null
        );
        const carriedVisualIntent = carried.visualIntent || {};
        const visualIntent = {
          ...graphVisualIntent,
          ...carriedVisualIntent,
          affordances: uniqueById([
            ...graphAffordances,
            ...(carriedVisualIntent.affordances || []),
          ]),
        };
        return phaseCarryObject({
          ...carried,
          schema: carried.schema || INTENT_BRIEF_SCHEMA || 'simulatte.intentBrief.v1',
          prompt: carried.prompt || languageEvidence.rawText || '',
          languageEvidence: carried.languageEvidence || languageEvidence,
          retrievedEvidence: Array.isArray(carried.retrievedEvidence) && carried.retrievedEvidence.length
            ? carried.retrievedEvidence
            : candidateEvidence,
    	      activationRows: activationCloud.weightedActivations || [],
    	      activationSummary: carried.activationSummary || activationCloud.summary || {},
    	      coverageGaps: carried.coverageGaps || activationCloud.conflicts || [],
    	      alternatives: carried.alternatives || activationCloud.rejectedMatches || [],
    	      causalVisualAffordances: uniqueById([
    	        ...(carried.causalVisualAffordances || []),
    	        ...graphAffordances,
    	      ]),
    	      visualIntent,
    		      typedEvidenceBuckets: carried.typedEvidenceBuckets || activationCloud.typedEvidenceBuckets || groundingEvidence.typedEvidenceBuckets || null,
    		      compositionLedger: carried.compositionLedger || activationCloud.compositionLedger || groundingEvidence.compositionLedger || null,
    		      queryPlan: carried.queryPlan || activationCloud.queryPlan || groundingEvidence.queryPlan || null,
    		      slotEvidence: carried.slotEvidence || activationCloud.slotEvidence || groundingEvidence.slotEvidence || [],
    		      acceptedCandidatesBySlot: carried.acceptedCandidatesBySlot || activationCloud.acceptedCandidatesBySlot || groundingEvidence.acceptedCandidatesBySlot || {},
    		      missingRequiredSlots: carried.missingRequiredSlots || activationCloud.missingRequiredSlots || groundingEvidence.missingRequiredSlots || [],
    		    });
    		  }

    function visualAffordancesFromUniverseGraphCandidates(graph = null) {
        if (!graph || typeof graph !== 'object') return [];
        const graphIntent = graph.intentBrief && graph.intentBrief.visualIntent || {};
        return uniqueById([
          ...(graph.visualAffordances || []),
          ...(graphIntent.affordances || []),
        ].map((row) => phaseCarryObject(row)));
      }

    function groundedSceneContractFromPhase4({
    	    acceptedGraph = null,
    	    rejectedGraph = null,
    	    activationCloud = {},
    	    groundingEvidence = {},
    	    intentBrief = {},
    	    groundedInterpretation = {},
    	    compositionLedger = null,
    	  } = {}) {
    	    const nodes = acceptedGraph && Array.isArray(acceptedGraph.nodes) ? acceptedGraph.nodes : [];
    	    const graphRelations = acceptedGraph && Array.isArray(acceptedGraph.edges) ? acceptedGraph.edges : [];
    	    const ledgerRelations = compositionLedger && Array.isArray(compositionLedger.relations) ? compositionLedger.relations : [];
    	    const acceptedRelations = uniqueById([
    	      ...ledgerRelations,
    	      ...graphRelations.map((edge) => ({
    	        id: edge.id || `${edge.source || 'source'}:${edge.relation || edge.type || 'relation'}:${edge.target || 'target'}`,
    	        kind: edge.kind || edge.type || edge.relation || 'graph-relation',
    	        from: edge.source || edge.from || '',
    	        to: edge.target || edge.to || '',
    	        evidenceIds: edge.evidence || [],
    	        confidence: Number(edge.confidence || 0),
    	      })),
    	    ]);
    	    return phaseCarryObject({
    	      schema: GROUNDED_SCENE_CONTRACT_SCHEMA,
    	      acceptedEntries: nodes.map((node) => ({
    	        id: node.id || node.canonicalId || '',
    	        label: node.label || node.canonicalId || '',
    	        kind: node.nodeType || node.semanticType || 'entity',
    	        provenance: node.provenance || node.source || '',
    	        confidence: Number(node.confidence || 0),
    	      })),
    	      acceptedRelations,
    	      acceptedObligations: compositionLedger && Array.isArray(compositionLedger.obligations)
    	        ? compositionLedger.obligations.filter((row) => row.status !== 'lost' && row.status !== 'failed')
    	        : [],
    	      rejectedEntries: rejectedGraph && Array.isArray(rejectedGraph.rejected) ? rejectedGraph.rejected : [],
    	      unsupported: groundingEvidence.unsupported || intentBrief.unsupported || acceptedGraph && acceptedGraph.unsupported || [],
    	      assumptions: groundingEvidence.assumptions || intentBrief.assumptions || [],
    	      provenanceByEntry: provenanceByNodeRows(acceptedGraph, {
    	        ...intentBrief,
    	        evidenceBindings: uniqueById([
    	          ...(intentBrief.evidenceBindings || []),
    	          ...(groundedInterpretation.evidenceBindings || []),
    	        ]),
    	      }),
    	      slotCoverage: activationCloud.coverageBySlot || {},
    	      compositionLedger,
    	    });
    	  }

    function groundedIntentAcceptedGraph({
        groundingEvidence = {},
        activationCloud = {},
        languageEvidence = {},
        candidateEvidence = [],
        intentBrief = {},
        groundedInterpretation = {},
      } = {}) {
        if (!groundUniverseGraph) return null;
        const promptParse = promptParseFromLanguageEvidence(languageEvidence);
        if (!promptParse) return null;
        const universeCandidateEvidence = candidateEvidenceFromUniverseGraphCandidates(
          groundingEvidence.universeGraphCandidates || null
        );
        const rejectedComponentIds = new Set([
          ...(groundingEvidence.rejectedComponentIds || []),
          ...(groundingEvidence.components || [])
            .filter((row) => row.supportOnly === true)
            .map((row) => row.id || row.primitiveId || row.canonicalId),
        ].flatMap((value) => phase3GroundingIdentityKeys(value)));
        const carriedUniverseCandidates = universeCandidateEvidence.filter((row) => ![
          row.id,
          row.canonicalId,
          ...(row.primitiveHints || []),
          ...(row.conceptIds || []),
        ].flatMap((value) => phase3GroundingIdentityKeys(value))
          .some((value) => rejectedComponentIds.has(value)));
        const negativeEvidence = activationCloud.negativeEvidence || [];
        const groundingCandidateEvidence = filterRowsAgainstNegativeEvidence(uniqueEvidenceRows([
          ...(candidateEvidence || []),
          ...carriedUniverseCandidates,
        ]), negativeEvidence);
        const graph = groundUniverseGraph({
          prompt: languageEvidence.rawText || intentBrief.prompt || '',
          promptParse,
          components: filterRowsAgainstNegativeEvidence(groundingEvidence.components || [], negativeEvidence)
            .filter((row) => row.supportOnly !== true),
          universeMatches: { candidates: groundingCandidateEvidence },
          intentBrief: {
            ...intentBrief,
            groundedInterpretation,
            retrievedEvidence: groundingCandidateEvidence.length
              ? groundingCandidateEvidence
              : intentBrief.retrievedEvidence || [],
          },
        });
        return phaseCarryObject({
    	      ...graph,
    	      typedEvidenceBuckets: activationCloud.typedEvidenceBuckets || groundingEvidence.typedEvidenceBuckets || intentBrief.typedEvidenceBuckets || null,
    	      compositionLedger: activationCloud.compositionLedger || groundingEvidence.compositionLedger || intentBrief.compositionLedger || null,
    	      queryPlan: activationCloud.queryPlan || groundingEvidence.queryPlan || intentBrief.queryPlan || null,
    	      slotEvidence: activationCloud.slotEvidence || groundingEvidence.slotEvidence || intentBrief.slotEvidence || [],
    	      acceptedCandidatesBySlot: activationCloud.acceptedCandidatesBySlot || groundingEvidence.acceptedCandidatesBySlot || intentBrief.acceptedCandidatesBySlot || {},
    	      missingRequiredSlots: activationCloud.missingRequiredSlots || groundingEvidence.missingRequiredSlots || intentBrief.missingRequiredSlots || [],
    	    });
    	  }

    function filterRowsAgainstNegativeEvidence(rows = [], negativeEvidence = []) {
        const targets = negativeEvidenceTargets(negativeEvidence);
        if (!targets.length) return rows;
        return (rows || []).filter((row) => !rowMatchesNegativeTarget(row, targets));
      }

    function phase3GroundingIdentityKeys(value = '') {
        const normalized = normalizeForEvidence(value);
        if (!normalized) return [];
        const unqualified = normalized.replace(/^(?:artifact|entity|environment|material|primitive|scene|semantic)\s+/, '');
        return unqualified && unqualified !== normalized ? [normalized, unqualified] : [normalized];
      }

    function negativeEvidenceTargets(negativeEvidence = []) {
        return uniqueById((negativeEvidence || [])
          .filter((row) => row.kind === 'negated-entry')
          .map((row) => ({
            id: row.entryId || '',
            label: row.label || row.text || '',
          })))
          .flatMap((row) => [row.id.replace(/^[a-z]+:/, ''), row.label])
          .map((value) => normalizeForEvidence(value).replace(/s$/, ''))
          .filter(Boolean);
      }

    function rowMatchesNegativeTarget(row = {}, targets = []) {
        const aliasTokens = (row.aliases || []).filter((alias) => normalizeForEvidence(alias).split(/\s+/).length <= 3);
        const tokens = normalizeForEvidence([
          row.id,
          row.label,
          row.canonicalId,
          row.conceptId,
          row.primitiveId,
          ...aliasTokens,
          ...(row.primitiveHints || []),
        ].filter(Boolean).join(' ')).split(/\s+/).map((token) => token.replace(/s$/, ''));
        const tokenSet = new Set(tokens);
        return targets.some((target) => target && tokenSet.has(target));
      }

    function candidateEvidenceFromUniverseGraphCandidates(graph = null) {
        if (!graph || typeof graph !== 'object') return [];
        const rows = [];
        for (const row of graph.nodes || []) {
          rows.push(phaseCarryObject({
            id: row.id || row.canonicalId || '',
            label: row.label || row.canonicalId || row.id || '',
            canonicalId: row.canonicalId || row.id || '',
            semanticType: row.semanticType || row.type || '',
            domains: arrayClone(row.domains),
            materialId: row.materialId || '',
            materialIds: arrayClone(row.materialIds || (row.materialId ? [row.materialId] : [])),
            operatorHints: arrayClone(row.operatorHints || row.operatorTypes),
            operatorTypes: arrayClone(row.operatorTypes || row.operatorHints),
            primitiveHints: arrayClone(row.primitiveHints),
            conceptIds: arrayClone(row.conceptIds),
            shapeHints: arrayClone(row.shapeHints),
            sceneHints: arrayClone(row.sceneHints),
            indexName: row.indexName || 'universe-candidate-graph',
            score: Number(row.confidence || row.score || 0.42),
            evidence: arrayClone(row.evidence || [row.id || row.canonicalId].filter(Boolean)),
          }));
        }
        for (const spanRow of graph.candidates || []) {
          for (const row of spanRow.candidates || []) {
            rows.push(phaseCarryObject({
              id: row.id || row.canonicalId || row.label || '',
              label: row.label || row.canonicalId || row.id || '',
              aliases: arrayClone(row.aliases),
              canonicalId: row.canonicalId || row.id || '',
              semanticType: row.semanticType || row.type || '',
              domains: arrayClone(row.domains),
              materialId: row.materialId || '',
              materialIds: arrayClone(row.materialIds || (row.materialId ? [row.materialId] : [])),
              operatorHints: arrayClone(row.operatorHints || row.operatorTypes),
              operatorTypes: arrayClone(row.operatorTypes || row.operatorHints),
              primitiveHints: arrayClone(row.primitiveHints),
              conceptIds: arrayClone(row.conceptIds),
              shapeHints: arrayClone(row.shapeHints),
              sceneHints: arrayClone(row.sceneHints),
              indexName: row.indexName || 'universe-candidate-graph',
              score: Number(row.confidence || row.score || 0.42),
              evidence: arrayClone(row.evidence || [row.id || row.canonicalId || row.label].filter(Boolean)),
            }));
          }
        }
        return uniqueEvidenceRows(rows.filter((row) => row.label));
      }

    function promptParseFromLanguageEvidence(languageEvidence = {}) {
        const prompt = String(languageEvidence.rawText || languageEvidence.normalizedText || '');
        const spans = (languageEvidence.spans || []).map((span, index) => ({
          id: span.id || `span.${index + 1}`,
          text: span.text || '',
          kind: span.kind || 'term',
          start: span.start,
          end: span.end,
          tokenStart: span.tokenStart,
          tokenEnd: span.tokenEnd,
        })).filter((span) => span.text);
        if (!prompt && !spans.length) return null;
        return {
          schema: PROMPT_PARSE_SCHEMA || 'simulatte.promptParse.v1',
          prompt,
          tokens: [],
          spans,
          clauses: languageEvidence.clauses || [],
          modifiers: [],
        };
      }

    function rejectedGraphFromGrounding(acceptedGraph = null, groundingEvidence = {}, groundedInterpretation = {}) {
        return groundingEvidence.rejectedGraph || {
          schema: 'simulatte.rejectedGroundedGraph.v1',
          rejected: acceptedGraph && acceptedGraph.rejected || [],
          unresolved: uniqueById([
            ...(acceptedGraph && acceptedGraph.unresolved || []),
            ...(groundedInterpretation.unresolvedSpans || []),
            ...(groundedInterpretation.coverageGaps || []),
          ]),
        };
      }

    function visualAffordancesFromIntentBrief(intentBrief = {}) {
        return [
          ...(intentBrief.causalVisualAffordances || []),
          ...((intentBrief.visualIntent && intentBrief.visualIntent.affordances) || []),
        ];
      }

    function provenanceByNodeRows(acceptedGraph = {}, intentBrief = {}) {
        const bindings = intentBrief.evidenceBindings || [];
        return Object.fromEntries((acceptedGraph && acceptedGraph.nodes || []).map((node) => [
          node.id,
          {
            source: node.source || node.provenance && node.provenance.source || '',
            evidenceIds: bindings
              .filter((row) => row && (row.nodeId === node.id || row.targetId === node.id))
              .map((row) => row.evidenceId || row.id || '')
              .filter(Boolean),
          },
        ]));
      }

    function uniqueById(rows = []) {
        const seen = new Set();
        return rows.filter((row) => {
          const key = row && (row.id || row.targetId || row.spanId || JSON.stringify(row));
          if (!key || seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      }

    function runPhase5SimulationCompile(phase4Output, runtimeContext = {}) {
        assertPhaseEnvelope(phase4Output, 4, 'Phase 5 input');
        const groundedIntent = phase4Output.artifact && phase4Output.artifact.groundedIntent || {};
        const acceptedGraph = groundedIntent.acceptedGraph || null;
        const components = Array.isArray(groundedIntent.components) ? groundedIntent.components : [];
        const contract = groundedIntent.contract || null;
        const params = groundedIntent.params || {};
        let physicsIR = null;
        if (buildPhysicsIR && acceptedGraph) {
          physicsIR = buildPhysicsIR({
            universeGraph: acceptedGraph,
            objects: components,
            params,
            contract,
          });
        }
        let validationReceipt = physicsIR && validatePhysicsIR ? validatePhysicsIR(physicsIR) : null;
        if (physicsIR && validationReceipt) {
          physicsIR = {
            ...physicsIR,
            receipt: {
              exact: validationReceipt.exact || [],
              approximate: validationReceipt.approximate || [],
              unresolved: validationReceipt.unresolved || [],
              unsupported: validationReceipt.unsupported || [],
            },
          };
        }
    	    const solverGraph = physicsIR && compileSolverGraph ? compileSolverGraph(physicsIR, validationReceipt) : null;
    	    const renderIR = physicsIR && solverGraph && compileRenderIR
    	      ? attachRenderIRPhaseInputs(compileRenderIR(physicsIR, solverGraph, acceptedGraph), acceptedGraph)
    	      : null;
    	    const visualSource = groundedIntent.visualSource || {};
    	    const compositionLedger = advanceCompositionLedger(
    	      physicsIR && physicsIR.compositionLedger ||
    	      groundedIntent.compositionLedger ||
    	      acceptedGraph && acceptedGraph.compositionLedger ||
    	      null,
    	      5,
    	      'phase5-simulation-compile'
    	    );
    	    const simulationCompile = {
    	      schema: SIMULATION_COMPILE_SCHEMA,
    	      physicsIR,
    	      validationReceipt,
    	      solverGraph,
    	      renderIR,
    	      loweredRelations: relationLoweringRows(physicsIR),
    	      physicsObligations: physicsObligationsFromLedger(compositionLedger, physicsIR),
    	      unsupportedPhysics: validationReceipt && Array.isArray(validationReceipt.unsupported)
    	        ? validationReceipt.unsupported
    	        : [],
    	      compositionLedger,
    	      stateChannels: stateChannelsForSolverGraph(solverGraph),
    	      controls: uniqueControlsFromComponents(components),
    	      readouts: readoutLabelsForContract(contract),
    	      visualSource: {
            ...visualSource,
            // Phase 4 has already removed negative evidence. Phase 5 carries its
            // accepted candidates and explicit solver support into Phase 6.
            objects: components,
            params: visualSource.params || params,
            contract: visualSource.contract || contract,
          },
        };
        return createPhaseEnvelope({
          phase: 5,
    	      inputSchema: phase4Output.schema,
    	      runtimeReceiptId: runtimeContext.runtimeReceiptId || phase4Output.runtimeReceiptId,
    	      artifact: { simulationCompile, compositionLedger },
    	      receipts: [
    	        {
    	          id: 'phase5-simulation-compile',
    	          schema: 'simulatte.phaseReceipt.v1',
    	          physicsIR: simulationCompile.physicsIR && simulationCompile.physicsIR.schema || '',
    	          solverGraph: simulationCompile.solverGraph && simulationCompile.solverGraph.schema || '',
    	          renderIR: simulationCompile.renderIR && simulationCompile.renderIR.schema || '',
    	          loweredRelations: simulationCompile.loweredRelations.length,
    	          physicsObligations: simulationCompile.physicsObligations.length,
	          unsupportedPhysics: simulationCompile.unsupportedPhysics.length,
	          stateChannels: simulationCompile.stateChannels.length,
    	        },
    	      ],
    	    });
    	  }

    function relationLoweringRows(physicsIR = null) {
    	    return (physicsIR && physicsIR.behaviorRelations || []).map((row) => phaseCarryObject({
    	      schema: 'simulatte.relationLoweringReceipt.v1',
    	      relationId: row.id || '',
    	      agentEntityId: row.agentEntityId || '',
    	      mediumEntityId: row.mediumEntityId || '',
    	      process: row.process || '',
    	      operators: row.operators || [],
    	      stateChannels: row.stateChannels || [],
    	      status: (row.operators || []).length ? 'lowered' : 'unsupported',
    	    }));
    	  }

    // Expectations must stay satisfiable by what the IR emits: behavior bundles in
    // simulatte-physics-ir-behaviors.js plus the coupling operators in the IR builder.
    // Processes the IR cannot lower stay unlisted so their obligations pass through.
    const PHYSICS_OBLIGATION_EXPECTED_OPERATORS = Object.freeze({
      swimming: Object.freeze(['fluid_locomotion', 'buoyancy', 'drag', 'wake_generation', 'body_water_contact', 'partial_submersion']),
      rotate: Object.freeze(['rotational_torque']),
      spins: Object.freeze(['rotational_torque']),
      twists: Object.freeze(['rotational_torque']),
      impact: Object.freeze(['rigid_collision', 'fracture_threshold']),
      jumps: Object.freeze(['rigid_collision', 'fracture_threshold']),
      calving: Object.freeze(['rigid_collision', 'fracture_threshold']),
      heat_transfer: Object.freeze(['heat_transfer']),
      'heat-transfer': Object.freeze(['heat_transfer']),
      heat: Object.freeze(['heat_transfer']),
      cooling: Object.freeze(['heat_transfer']),
      phase_transition: Object.freeze(['phase_transition']),
      'phase-transition': Object.freeze(['phase_transition']),
      freezes: Object.freeze(['phase_transition']),
      flow: Object.freeze(['pressure_flow_lite']),
      diffusion: Object.freeze(['reaction_diffusion']),
      dissolves: Object.freeze(['reaction_diffusion']),
      oscillation: Object.freeze(['wave_field']),
      waves: Object.freeze(['wave_field']),
      orbital: Object.freeze(['wave_field']),
      growth: Object.freeze(['growth_decay']),
      growing: Object.freeze(['growth_decay', 'reaction_diffusion']),
      fermentation: Object.freeze(['growth_decay', 'reaction_diffusion']),
      motion: Object.freeze(['rigid_collision']),
      network_flow: Object.freeze(['network_flow']),
      'network-flow': Object.freeze(['network_flow']),
    });

    function physicsObligationProcess(row = {}) {
    	    const explicit = String(row.action || row.process || '').trim().toLowerCase();
    	    if (explicit) return explicit;
    	    const id = String(row.id || row.obligationId || '');
    	    const parts = id.split(':');
    	    if (parts[0] === 'action' && parts[1]) return parts[1].toLowerCase();
    	    if (parts[0] === 'relation' && parts[2]) return parts[2].toLowerCase();
    	    return String(row.target || '').trim().toLowerCase();
    	  }

    function physicsObligationsFromLedger(compositionLedger = null, physicsIR = null) {
    	    const operatorTypes = new Set((physicsIR && physicsIR.operators || []).map((row) => row.type).filter(Boolean));
    	    return (compositionLedger && compositionLedger.obligations || [])
    	      .filter((row) => row.kind === 'relation' || row.kind === 'action')
    	      .map((row) => {
    	        const process = physicsObligationProcess(row);
    	        const expectedOperators = PHYSICS_OBLIGATION_EXPECTED_OPERATORS[process] || [];
    	        const satisfiedOperators = expectedOperators.filter((type) => operatorTypes.has(type));
    	        return phaseCarryObject({
    	          schema: 'simulatte.physicsObligationReceipt.v1',
    	          obligationId: row.id || '',
    	          required: row.required === true,
    	          process,
    	          expectedOperators: expectedOperators.slice(),
    	          satisfiedOperators,
    	          status: expectedOperators.length
    	            ? satisfiedOperators.length === expectedOperators.length
    	              ? 'lowered'
    	              : 'unsupported'
    	            : row.status || 'preserved',
    	        });
    	      });
    	  }

    function stateChannelsForSolverGraph(solverGraph = null) {
        return Object.keys(solverGraph && solverGraph.channels || {});
      }

    function uniqueControlsFromComponents(components = []) {
        const seen = new Set();
        const controls = [];
        for (const component of components || []) {
          for (const control of component && component.controls || []) {
            const normalized = normalizeControl(control);
            const key = normalized.id || normalized.label || JSON.stringify(normalized);
            if (seen.has(key)) continue;
            seen.add(key);
            controls.push(normalized);
          }
        }
        return controls;
      }

    function readoutLabelsForContract(contract = null) {
        const graph = contract && contract.graph || {};
        return uniqueList([
          ...(graph.observables || []).map((row) => row && (row.label || row.id || row.kind)).filter(Boolean),
          ...(graph.nodes || []).map((node) => node && node.state && (node.state.label || node.state.kind)).filter(Boolean),
        ]).slice(0, 12);
      }

    function phase6InputFromSimulationCompile(phase5Output) {
        assertPhaseEnvelope(phase5Output, 5, 'Phase 6 input');
        const simulationCompile = phase5Output.artifact && phase5Output.artifact.simulationCompile || {};
        const visualSource = simulationCompile.visualSource || {};
        return {
          schema: 'simulatte.phase6.input.v1',
          inputSchema: phase5Output.schema,
          runtimeReceiptId: phase5Output.runtimeReceiptId,
          id: visualSource.specId || 'compiled-scene',
          templateId: visualSource.templateId || 'custom-world',
          name: visualSource.name || 'Compiled Scene',
          kind: visualSource.kind || 'custom',
          modules: visualSource.modules || [],
          objects: visualSource.objects || [],
          controls: simulationCompile.controls || [],
          params: visualSource.params || {},
          contract: visualSource.contract || {},
          physicsIR: simulationCompile.physicsIR || null,
          solverGraph: simulationCompile.solverGraph || null,
          renderIR: simulationCompile.renderIR || null,
          simulationCompile,
          phaseArtifacts: { phase5: phase5Output },
        };
      }

    function compilePhase6VisualProgram(phase5Output, compositionGraph = null) {
        assertPhaseEnvelope(phase5Output, 5, 'Phase 6 input');
        const phase6Input = phase6InputFromSimulationCompile(phase5Output);
        const nextCompositionGraph = compositionGraph || (
          buildCompositionGraph ? buildCompositionGraph(phase6Input) : null
        );
        const visualProgram = nextCompositionGraph && compileCompositionToRenderProgram
          ? refineRenderProgramSceneKind(
            compileCompositionToRenderProgram(nextCompositionGraph, phase6Input),
            phase6Input
          )
          : null;
        return { phase6Input, compositionGraph: nextCompositionGraph, visualProgram };
      }

    function createVisualCompileEnvelope(phase5Output, compositionGraph = null) {
        const compiled = compilePhase6VisualProgram(phase5Output, compositionGraph);
        return createVisualCompileEnvelopeFromCompiled(phase5Output, compiled);
      }

    function createVisualCompileEnvelopeFromCompiled(phase5Output, compiled = {}) {
        assertPhaseEnvelope(phase5Output, 5, 'Phase 6 output builder');
        const visualProgram = compiled.visualProgram || null;
    	    const visualIR = visualProgram && visualProgram.visualIR || null;
    	    const sceneRenderPacket = visualProgram && visualProgram.sceneRenderPacket ||
    	      visualIR && visualIR.sceneRenderPacket ||
    	      null;
    	    const compositionLedger = visualIR && visualIR.compositionLedger || sceneRenderPacket && sceneRenderPacket.compositionLedger || null;
    	    const visualCompile = {
    	      schema: VISUAL_COMPILE_SCHEMA,
    	      visualIR,
    	      sceneRenderPacket,
    	      renderInstances: visualIR && Array.isArray(visualIR.renderInstances) ? visualIR.renderInstances : [],
    	      visualObligations: visualObligationsFromLedger(compositionLedger),
    	      identityPreservation: identityPreservationRows(sceneRenderPacket, compositionLedger),
    	      compositionLedger,
    	      camera: visualIR && visualIR.camera || visualProgram && visualProgram.camera || {},
    	      lights: sceneRenderPacket && sceneRenderPacket.lights || visualIR && visualIR.lighting && visualIR.lighting.lights || [],
    	      passes: sceneRenderPacket && sceneRenderPacket.passes || [],
    	      rendererPlan: visualProgram && visualProgram.rendererPlan || null,
          compositionGraphId: compiled.compositionGraph && compiled.compositionGraph.graphId || '',
        };
        return createPhaseEnvelope({
          phase: 6,
    	      inputSchema: phase5Output.schema,
    	      runtimeReceiptId: phase5Output.runtimeReceiptId,
    	      artifact: { visualCompile, compositionLedger },
    	      receipts: [
    	        {
    	          id: 'phase6-visual-compile',
    	          schema: 'simulatte.phaseReceipt.v1',
              visualIR: visualIR && visualIR.schema || '',
              sceneRenderPacket: sceneRenderPacket && sceneRenderPacket.schema || '',
              renderInstances: visualCompile.renderInstances.length,
    	          obligationCount: visualCompile.compositionLedger && Array.isArray(visualCompile.compositionLedger.obligations)
    	            ? visualCompile.compositionLedger.obligations.length
    	            : 0,
    	          lostObligations: visualCompile.compositionLedger && Array.isArray(visualCompile.compositionLedger.obligations)
    	            ? visualCompile.compositionLedger.obligations.filter((row) => LEDGER_FAILURE_STATUSES.has(row.status)).length
    	            : 0,
    	          identityPreservation: visualCompile.identityPreservation.length,
    	          passes: visualCompile.passes.length,
    	        },
    	      ],
    	    });
    	  }

    function visualObligationsFromLedger(compositionLedger = null) {
    	    return (compositionLedger && compositionLedger.obligations || [])
              .filter((row) => row.kind !== 'relation' && !/^action:coexists/.test(String(row.id || '')) && (row.kind === 'visual' || row.ownedByPhase === 6 || (
                row.required === true && Array.isArray(row.visualEvidence) && row.visualEvidence.length > 0
              )))
    	      .map((row) => phaseCarryObject({
    	        schema: 'simulatte.visualObligationReceipt.v1',
    	        obligationId: row.id || '',
                target: visualObligationTargetFromLedger(row),
                sourceKind: row.kind || '',
    	        status: row.status || '',
    	        evidence: row.visualEvidence || [],
    	        required: row.required === true,
    	      }));
    	  }

    function visualObligationTargetFromLedger(row = {}) {
            const explicit = String(row.target || '').trim();
            if (explicit) return explicit;
            return String(row.id || row.obligationId || '')
              .replace(/^[a-z]+:/, '')
              .replace(/[:_-]+/g, ' ')
              .trim();
          }

    function identityPreservationRows(sceneRenderPacket = null, compositionLedger = null) {
    	    const identities = new Set((sceneRenderPacket && sceneRenderPacket.entities || [])
    	      .map((row) => row.identity && row.identity.type)
    	      .filter(Boolean));
    	    return (compositionLedger && compositionLedger.obligations || [])
    	      .filter((row) => row.kind === 'entity' || /^entity:/.test(row.id || ''))
    	      .map((row) => {
    	        const expected = String(row.target || (row.id || '').replace(/^entity:/, '') || '');
    	        return phaseCarryObject({
    	          schema: 'simulatte.identityPreservationReceipt.v1',
    	          sourceEntryId: row.id || '',
    	          acceptedLabel: row.target || row.id || '',
    	          packetIdentityType: identities.has(expected) ? expected : '',
    	          status: identities.has(expected) ? 'preserved' : 'lost',
    	        });
    	      });
    	  }

    function runPhase6VisualCompile(phase5Output, compositionGraph = null) {
        return createVisualCompileEnvelope(phase5Output, compositionGraph);
      }

    function createRenderExecutionInput(source = {}, simulationState = null, canvas = null) {
    	    const phase6Output = source && source.schema === phaseOutputSchema(6)
    	      ? source
    	      : source && source.phaseArtifacts && source.phaseArtifacts.phase6 || null;
        if (!phase6Output) {
          throw new Error(`renderExecutionInput source expected ${phaseOutputSchema(6)}, received ${source && source.schema || 'missing phase6 artifact'}`);
        }
        assertPhaseEnvelope(phase6Output, 6, 'renderExecutionInput source');
        const visualCompile = phase6Output.artifact.visualCompile || null;
        if (!visualCompile || !visualCompile.sceneRenderPacket) {
          throw new Error('renderExecutionInput source missing artifact.visualCompile.sceneRenderPacket');
        }
        return {
          schema: RENDER_EXECUTION_INPUT_SCHEMA,
          inputSchema: phase6Output.schema,
          runtimeReceiptId: phase6Output.runtimeReceiptId || source && source.runtimeReceiptId || 'runtime:unknown',
    	      sceneRenderPacket: visualCompile && visualCompile.sceneRenderPacket || null,
    	      renderInstances: visualCompile && Array.isArray(visualCompile.renderInstances)
    	        ? visualCompile.renderInstances
    	        : [],
    	      visualObligations: visualCompile && Array.isArray(visualCompile.visualObligations)
    	        ? visualCompile.visualObligations
    	        : [],
    	      compositionLedger: visualCompile && visualCompile.compositionLedger || phase6Output.artifact.compositionLedger || null,
    	      simulationState,
    	      canvas,
    	    };
    	  }

    function runPhase7RenderExecution(source, simulationState = null, canvas = null, frameReceipt = {}) {
        let renderExecutionInput = null;
        let inputSchema = '';
        let runtimeReceiptId = 'runtime:unknown';
        if (source && source.schema === RENDER_EXECUTION_INPUT_SCHEMA) {
          if (source.inputSchema !== phaseOutputSchema(6)) {
            throw new Error(`Phase 7 input expected ${phaseOutputSchema(6)}, received ${source.inputSchema || 'missing inputSchema'}`);
          }
          renderExecutionInput = {
            ...source,
            simulationState: simulationState || source.simulationState || null,
            canvas: canvas || source.canvas || null,
          };
          inputSchema = source.inputSchema;
          runtimeReceiptId = source.runtimeReceiptId || runtimeReceiptId;
        } else {
          assertPhaseEnvelope(source, 6, 'Phase 7 input');
          renderExecutionInput = createRenderExecutionInput(source, simulationState, canvas);
          inputSchema = source.schema;
          runtimeReceiptId = source.runtimeReceiptId || runtimeReceiptId;
        }
        const sceneRenderPacket = renderExecutionInput.sceneRenderPacket || {};
    	    if (sceneRenderPacket.schema !== 'simulatte.sceneRenderPacket.v1') {
    	      throw new Error(`Phase 7 input expected sceneRenderPacket simulatte.sceneRenderPacket.v1, received ${sceneRenderPacket.schema || 'missing'}`);
    	    }
    	    const compositionLedger = advanceCompositionLedger(
    	      renderExecutionInput.compositionLedger || sceneRenderPacket.compositionLedger || null,
    	      7,
    	      'phase7-webgpu-render'
    	    );
    		    const visualObligationProof = renderObligationProof(
    		      sceneRenderPacket,
    		      renderExecutionInput.visualObligations || [],
    		      compositionLedger,
    		      frameReceipt
    		    );
		    const visualObligationProofSummary = summarizeRenderObligationProof(visualObligationProof);
		    const objectRealization = objectRealizationForScenePacket(sceneRenderPacket);
    		    const pixelAudit = frameReceipt.pixelAudit || renderPixelAudit(
    		      sceneRenderPacket,
    		      frameReceipt,
    		      renderExecutionInput.canvas,
    		      visualObligationProofSummary
    		    );
    		    return createPhaseEnvelope({
    	      phase: 7,
    	      inputSchema,
    	      runtimeReceiptId,
    	      artifact: {
    	        renderExecution: {
    	          schema: RENDER_EXECUTION_SCHEMA,
    	          renderExecutionInputSchema: renderExecutionInput.schema,
    	          sceneRenderPacketSchema: sceneRenderPacket.schema || '',
    		          rendered: frameReceipt.rendered === true,
		          packetIdentitySummary: scenePacketIdentitySummary(sceneRenderPacket),
		          objectRealization,
    		          visualObligationProof,
    		          visualObligationProofSummary,
    		          shaderPath: frameReceipt.shaderPath || frameReceipt.renderPath || '',
    		          pixelAudit,
    			          compositionLedger,
    		          renderCount: Number(frameReceipt.renderCount || 0),
    		          frameMs: Number(frameReceipt.frameMs || 0),
    		        },
    		        compositionLedger,
    		      },
    		      receipts: [
    	        {
    	          id: 'phase7-webgpu-render',
    	          schema: 'simulatte.phaseReceipt.v1',
    	          sceneKind: sceneRenderPacket.sceneKind || '',
    	          entityCount: Array.isArray(sceneRenderPacket.entities) ? sceneRenderPacket.entities.length : 0,
    		          fieldCount: Array.isArray(sceneRenderPacket.fields) ? sceneRenderPacket.fields.length : 0,
    		          effectCount: Array.isArray(sceneRenderPacket.effects) ? sceneRenderPacket.effects.length : 0,
    		          visualObligationProofs: visualObligationProof.length,
    		          failedObligations: visualObligationProofSummary.failCount,
    		          unprovenObligations: visualObligationProofSummary.notProvenCount,
    		          pixelAuditStatus: pixelAudit.status,
    		        },
    	      ],
    	    });
    	  }

    Object.assign(scope, {
      uniqueByJson,
      runPhase4GroundedIntent,
      phase4IntentBriefFromActivationCloud,
      visualAffordancesFromUniverseGraphCandidates,
      groundedSceneContractFromPhase4,
      groundedIntentAcceptedGraph,
      candidateEvidenceFromUniverseGraphCandidates,
      promptParseFromLanguageEvidence,
      rejectedGraphFromGrounding,
      visualAffordancesFromIntentBrief,
      provenanceByNodeRows,
      uniqueById,
      runPhase5SimulationCompile,
      relationLoweringRows,
      physicsObligationProcess,
      physicsObligationsFromLedger,
      stateChannelsForSolverGraph,
      uniqueControlsFromComponents,
      readoutLabelsForContract,
      phase6InputFromSimulationCompile,
      compilePhase6VisualProgram,
      createVisualCompileEnvelope,
      createVisualCompileEnvelopeFromCompiled,
      visualObligationsFromLedger,
      identityPreservationRows,
      runPhase6VisualCompile,
      createRenderExecutionInput,
      runPhase7RenderExecution,
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
