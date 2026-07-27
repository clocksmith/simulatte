(function attachSimulattePhysicsModelphasegrounding(root) {
  const scope = root.SimulattePhaseModuleRegistry.family('physicsModel');

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
        scope.assertPhaseEnvelope(phase3Output, 3, 'Phase 4 input');
        const activationCloud = phase3Output.artifact && phase3Output.artifact.activationCloud || {};
        const languageGraph = phase3Output.artifact && phase3Output.artifact.languageGraph || {};
        const groundingEvidence = activationCloud.groundingEvidence || {};
        const languageEvidence = activationCloud.languageEvidence || groundingEvidence.languageEvidence || {};
        const candidateEvidence = activationCloud.candidateEvidence || [];
        const weightedActivations = activationCloud.weightedActivations || [];
        const acceptedComponents = filterRowsAgainstNegativeEvidence(
          groundingEvidence.components || [],
          activationCloud.negativeEvidence || []
        );
        const intentBrief = phase4IntentBriefFromActivationCloud(activationCloud, groundingEvidence);
        const groundedInterpretation = scope.buildGroundedInterpretation
          ? scope.buildGroundedInterpretation({
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
              languageGraph,
            });
          const rejectedGraph = rejectedGraphFromGrounding(acceptedGraph, groundingEvidence, groundedInterpretation);
          const compositionLedger = scope.advanceCompositionLedger(
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
            typedEvidenceBuckets: scope.phaseCarryObject(
              activationCloud.typedEvidenceBuckets ||
              groundingEvidence.typedEvidenceBuckets ||
              intentBrief.typedEvidenceBuckets ||
              null
            ),
              queryPlan: scope.phaseCarryObject(
                activationCloud.queryPlan ||
                groundingEvidence.queryPlan ||
                intentBrief.queryPlan ||
                null
              ),
              slotEvidence: scope.phaseCarryObject(
                activationCloud.slotEvidence ||
                groundingEvidence.slotEvidence ||
                intentBrief.slotEvidence ||
                []
              ),
              acceptedCandidatesBySlot: scope.phaseCarryObject(
                activationCloud.acceptedCandidatesBySlot ||
                groundingEvidence.acceptedCandidatesBySlot ||
                intentBrief.acceptedCandidatesBySlot ||
                {}
              ),
              missingRequiredSlots: scope.phaseCarryObject(
                activationCloud.missingRequiredSlots ||
                groundingEvidence.missingRequiredSlots ||
                intentBrief.missingRequiredSlots ||
                []
              ),
              negativeEvidence: scope.phaseCarryObject(activationCloud.negativeEvidence || []),
              compositionLedger: scope.phaseCarryObject(compositionLedger),
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
        return scope.createPhaseEnvelope({
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
        return scope.phaseCarryObject({
          ...carried,
          schema: carried.schema || scope.INTENT_BRIEF_SCHEMA || 'simulatte.intentBrief.v1',
          prompt: carried.prompt || languageEvidence.rawText || '',
          languageEvidence: carried.languageEvidence || languageEvidence,
          retrievedEvidence: Array.isArray(carried.retrievedEvidence) && carried.retrievedEvidence.length
            ? carried.retrievedEvidence
            : candidateEvidence,
          causalGraph: carried.causalGraph && carried.causalGraph.length ? carried.causalGraph : graphIntentBrief.causalGraph || [],
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
        ].map((row) => scope.phaseCarryObject(row)));
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
          return scope.phaseCarryObject({
            schema: scope.GROUNDED_SCENE_CONTRACT_SCHEMA,
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
        languageGraph = {},
      } = {}) {
        if (!scope.groundUniverseGraph) return null;
        if (!groundingEvidence || !Object.keys(groundingEvidence).length) return null;
        const promptParse = promptParseFromLanguageGraph(languageGraph) || promptParseFromLanguageEvidence(languageEvidence);
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
        const groundingCandidateEvidence = filterRowsAgainstNegativeEvidence(scope.uniqueEvidenceRows([
          ...(candidateEvidence || []),
          ...carriedUniverseCandidates,
        ]), negativeEvidence);
        const graph = scope.groundUniverseGraph({
          prompt: languageEvidence.rawText || intentBrief.prompt || '',
          promptParse,
          components: filterRowsAgainstNegativeEvidence(groundingEvidence.components || [], negativeEvidence)
            .filter((row) => row.supportOnly !== true),
          universeMatches: { candidates: groundingCandidateEvidence },
          queryPlan: activationCloud.queryPlan || groundingEvidence.queryPlan || intentBrief.queryPlan || null,
          slotEvidence: activationCloud.slotEvidence || groundingEvidence.slotEvidence || intentBrief.slotEvidence || [],
          intentBrief: {
            ...intentBrief,
            groundedInterpretation,
            retrievedEvidence: groundingCandidateEvidence.length
              ? groundingCandidateEvidence
              : intentBrief.retrievedEvidence || [],
          },
        });
        return scope.phaseCarryObject({
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
        const normalized = scope.normalizeForEvidence(value);
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
          .map((value) => scope.normalizeForEvidence(value).replace(/s$/, ''))
          .filter(Boolean);
      }

    function rowMatchesNegativeTarget(row = {}, targets = []) {
        const aliasTokens = (row.aliases || []).filter((alias) => scope.normalizeForEvidence(alias).split(/\s+/).length <= 3);
        const tokens = scope.normalizeForEvidence([
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
          rows.push(scope.phaseCarryObject({
            id: row.id || row.canonicalId || '',
            label: row.label || row.canonicalId || row.id || '',
            canonicalId: row.canonicalId || row.id || '',
            semanticType: row.semanticType || row.type || '',
            domains: scope.arrayClone(row.domains),
            materialId: row.materialId || '',
            materialIds: scope.arrayClone(row.materialIds || (row.materialId ? [row.materialId] : [])),
            operatorHints: scope.arrayClone(row.operatorHints || row.operatorTypes),
            operatorTypes: scope.arrayClone(row.operatorTypes || row.operatorHints),
            primitiveHints: scope.arrayClone(row.primitiveHints),
            conceptIds: scope.arrayClone(row.conceptIds),
            shapeHints: scope.arrayClone(row.shapeHints),
            sceneHints: scope.arrayClone(row.sceneHints),
            identityEvidence: row.identityEvidence === true,
            supportOnly: row.supportOnly === true,
            indexName: row.indexName || 'universe-candidate-graph',
            score: Number(row.confidence || row.score || 0.42),
            evidence: scope.arrayClone(row.evidence || [row.id || row.canonicalId].filter(Boolean)),
          }));
        }
        for (const spanRow of graph.candidates || []) {
          for (const row of spanRow.candidates || []) {
            rows.push(scope.phaseCarryObject({
              id: row.id || row.canonicalId || row.label || '',
              label: row.label || row.canonicalId || row.id || '',
              aliases: scope.arrayClone(row.aliases),
              canonicalId: row.canonicalId || row.id || '',
              semanticType: row.semanticType || row.type || '',
              domains: scope.arrayClone(row.domains),
              materialId: row.materialId || '',
              materialIds: scope.arrayClone(row.materialIds || (row.materialId ? [row.materialId] : [])),
              operatorHints: scope.arrayClone(row.operatorHints || row.operatorTypes),
              operatorTypes: scope.arrayClone(row.operatorTypes || row.operatorHints),
              primitiveHints: scope.arrayClone(row.primitiveHints),
              conceptIds: scope.arrayClone(row.conceptIds),
              shapeHints: scope.arrayClone(row.shapeHints),
              sceneHints: scope.arrayClone(row.sceneHints),
              identityEvidence: row.identityEvidence === true,
              supportOnly: row.supportOnly === true,
              indexName: row.indexName || 'universe-candidate-graph',
              score: Number(row.confidence || row.score || 0.42),
              evidence: scope.arrayClone(row.evidence || [row.id || row.canonicalId || row.label].filter(Boolean)),
            }));
          }
        }
        return scope.uniqueEvidenceRows(rows.filter((row) => row.label));
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
          entityClass: span.entityClass || '',
          semanticRole: span.semanticRole || '',
          visualArchetype: span.visualArchetype || '',
          materialHint: span.materialHint || '',
          shapeHints: scope.arrayClone(span.shapeHints || []),
        })).filter((span) => span.text);
        if (!prompt && !spans.length) return null;
        return {
          schema: scope.PROMPT_PARSE_SCHEMA || 'simulatte.promptParse.v1',
          prompt,
          tokens: [],
          spans,
          clauses: languageEvidence.clauses || [],
          modifiers: [],
        };
      }

    function promptParseFromLanguageGraph(languageGraph = {}) {
        if (!languageGraph || languageGraph.schema !== 'simulatte.languageGraph.v1') return null;
        const prompt = String(languageGraph.sourceText || '');
        const spans = Array.isArray(languageGraph.spans) ? languageGraph.spans.map((row) => ({ ...row })) : [];
        if (!prompt && !spans.length) return null;
        return {
          schema: scope.PROMPT_PARSE_SCHEMA || 'simulatte.promptParse.v1',
          prompt,
          tokens: Array.isArray(languageGraph.tokens) ? languageGraph.tokens.map((row) => ({ ...row })) : [],
          spans,
          clauses: Array.isArray(languageGraph.clauses) ? languageGraph.clauses.map((row) => ({ ...row })) : [],
          modifiers: Array.isArray(languageGraph.modifiers) ? languageGraph.modifiers.map((row) => ({ ...row })) : [],
          quantities: Array.isArray(languageGraph.quantities) ? languageGraph.quantities.map((row) => ({ ...row })) : [],
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
        scope.assertPhaseEnvelope(phase4Output, 4, 'Phase 5 input');
        const groundedIntent = phase4Output.artifact && phase4Output.artifact.groundedIntent || {};
        const acceptedGraph = groundedIntent.acceptedGraph || null;
        const components = Array.isArray(groundedIntent.components) ? groundedIntent.components : [];
        const contract = groundedIntent.contract || null;
        const params = groundedIntent.params || {};
        let physicsIR = null;
        if (scope.buildPhysicsIR && acceptedGraph) {
          physicsIR = scope.buildPhysicsIR({
            universeGraph: acceptedGraph,
            objects: components,
            params,
            contract,
          });
        }
        let validationReceipt = physicsIR && scope.validatePhysicsIR ? scope.validatePhysicsIR(physicsIR) : null;
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
          const solverGraph = physicsIR && scope.compileSolverGraph ? scope.compileSolverGraph(physicsIR, validationReceipt) : null;
          const renderIR = physicsIR && solverGraph && scope.compileRenderIR
            ? scope.attachRenderIRPhaseInputs(scope.compileRenderIR(physicsIR, solverGraph, acceptedGraph), acceptedGraph)
            : null;
          const interactionIR = physicsIR && solverGraph && scope.compileInteractionIR
            ? scope.compileInteractionIR({
              acceptedGraph,
              physicsIR,
              solverGraph,
              renderIR,
              controls: uniqueControlsFromComponents(components),
            })
            : null;
          const visualSource = groundedIntent.visualSource || {};
          const compositionLedger = scope.advanceCompositionLedger(
            physicsIR && physicsIR.compositionLedger ||
            groundedIntent.compositionLedger ||
            acceptedGraph && acceptedGraph.compositionLedger ||
            null,
            5,
            'phase5-simulation-compile'
          );
          const simulationCompile = {
            schema: scope.SIMULATION_COMPILE_SCHEMA,
            physicsIR,
            validationReceipt,
            solverGraph,
            renderIR,
            interactionIR,
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
        return scope.createPhaseEnvelope({
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
                interactionIR: simulationCompile.interactionIR && simulationCompile.interactionIR.schema || '',
                interactionTargetCount: simulationCompile.interactionIR &&
                  simulationCompile.interactionIR.targets.length || 0,
                loweredRelations: simulationCompile.loweredRelations.length,
                physicsObligations: simulationCompile.physicsObligations.length,
            unsupportedPhysics: simulationCompile.unsupportedPhysics.length,
            stateChannels: simulationCompile.stateChannels.length,
              },
            ],
          });
        }

    function relationLoweringRows(physicsIR = null) {
          return (physicsIR && physicsIR.behaviorRelations || []).map((row) => scope.phaseCarryObject({
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
      exchanging: Object.freeze(['reaction_diffusion']),
      dissolves: Object.freeze(['reaction_diffusion']),
      deposition: Object.freeze(['particle_deposition']),
      layers: Object.freeze(['particle_deposition']),
      oscillation: Object.freeze(['wave_field']),
      waves: Object.freeze(['wave_field']),
      orbital: Object.freeze(['wave_field']),
      growth: Object.freeze(['growth_decay']),
      growing: Object.freeze(['growth_decay', 'reaction_diffusion']),
      fermentation: Object.freeze(['growth_decay', 'reaction_diffusion']),
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
              return scope.phaseCarryObject({
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
            const normalized = scope.normalizeControl(control);
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
        return scope.uniqueList([
          ...(graph.observables || []).map((row) => row && (row.label || row.id || row.kind)).filter(Boolean),
          ...(graph.nodes || []).map((node) => node && node.state && (node.state.label || node.state.kind)).filter(Boolean),
        ]).slice(0, 12);
      }

    root.SimulattePhaseModuleRegistry.define('physicsModel', 'simulatte-physics-model-phase-grounding.js', {
      uniqueByJson,
      runPhase4GroundedIntent,
      phase4IntentBriefFromActivationCloud,
      visualAffordancesFromUniverseGraphCandidates,
      groundedSceneContractFromPhase4,
      groundedIntentAcceptedGraph,
      candidateEvidenceFromUniverseGraphCandidates,
      promptParseFromLanguageEvidence,
      promptParseFromLanguageGraph,
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
    });

})(typeof globalThis !== 'undefined' ? globalThis : window);
