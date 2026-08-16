(function attachSimulatteUserOverrideGrounding(root) {
  const registry = typeof module === 'object' && module.exports
    ? require('../../app/runtime/phase-module-registry.js')
    : root.SimulattePhaseModuleRegistry;
  const scope = registry.family('physicsModel');

  function createUserOverridePhase4(phase4Output, worldSpec) {
    scope.assertPhaseEnvelope(phase4Output, 4, 'WorldSpec user override input');
    if (!worldSpec || worldSpec.schema !== scope.worldSpec.WORLD_SPEC_SCHEMA) {
      throw new Error(`WorldSpec user override expected ${scope.worldSpec.WORLD_SPEC_SCHEMA}`);
    }
    const current = phase4Output.artifact.groundedIntent || {};
    const patches = worldSpec.authorship && worldSpec.authorship.patches || [];
    const revision = Number(worldSpec.authorship && worldSpec.authorship.revision || 0);
    const acceptedGraph = bindGraphOverrideProvenance(
      worldSpec.universeGraph,
      patches,
      revision,
      current.acceptedGraph || null
    );
    if (!acceptedGraph) throw new Error('WorldSpec user override requires an accepted universeGraph');
    const compositionLedger = acceptedGraph.compositionLedger ||
      current.compositionLedger ||
      phase4Output.artifact.compositionLedger || null;
    const activationCloud = phase4Output.artifact.activationCloud || {};
    const groundingEvidence = activationCloud.groundingEvidence || {};
    const intentBrief = scope.phase4IntentBriefFromActivationCloud(
      activationCloud,
      groundingEvidence
    );
    const groundedSceneContract = scope.groundedSceneContractFromPhase4({
      acceptedGraph,
      rejectedGraph: current.rejectedGraph || null,
      activationCloud,
      groundingEvidence,
      intentBrief,
      groundedInterpretation: {},
      compositionLedger,
    });
    const groundedIntent = {
      ...current,
      acceptedGraph,
      components: worldSpec.objects,
      params: worldSpec.params,
      contract: worldSpec.contract,
      compositionLedger,
      groundedSceneContract,
      provenanceByNode: overrideProvenanceRows(
        acceptedGraph,
        groundedSceneContract.provenanceByEntry,
        patches,
        revision
      ),
      visualSource: {
        ...(current.visualSource || {}),
        objects: worldSpec.objects,
        params: worldSpec.params,
        contract: worldSpec.contract,
      },
      authorship: {
        schema: 'simulatte.groundedIntentAuthorship.v1',
        authority: 'userOverride',
        worldSpecId: worldSpec.id,
        worldSpecContentHash: worldSpec.contentHash,
        revision,
        patchIds: patches.filter((patch) => patch.revision === revision).map((patch) => patch.id),
      },
    };
    const intentRequirements = worldSpec.phaseArtifacts && worldSpec.phaseArtifacts.phase2 &&
      worldSpec.phaseArtifacts.phase2.artifact &&
      worldSpec.phaseArtifacts.phase2.artifact.intentRequirements;
    const semanticProvenance = scope.worldProof.createSemanticProvenanceLedger(
      intentRequirements,
      { groundedIntent, groundedSceneContract, compositionLedger },
      { patches }
    );
    return {
      ...phase4Output,
      artifact: {
        ...phase4Output.artifact,
        groundedIntent,
        groundedSceneContract,
        semanticProvenance,
        compositionLedger,
      },
      receipts: phase4Output.receipts.map((receipt) => receipt.id === 'phase4-grounded-intent'
        ? {
          ...receipt,
          authority: 'userOverride',
          worldSpecContentHash: worldSpec.contentHash,
          worldSpecRevision: revision,
          provenSemanticBindings: semanticProvenance.provenCount,
          missingSemanticBindings: semanticProvenance.missingCount,
        }
        : receipt),
    };
  }

  function bindGraphOverrideProvenance(graph, patches, revision, previousGraph = null) {
    if (!graph || typeof graph !== 'object') return null;
    const currentPatches = patches.filter((patch) => patch.revision === revision);
    const nodes = (graph.nodes || []).map((node, index) => bindRowProvenance(
      node,
      currentPatches.filter((patch) => patch.targetPath.startsWith(`/universeGraph/nodes/${index}`))
    ));
    const next = {
      ...graph,
      nodes,
      edges: (graph.edges || []).map((edge, index) => bindRowProvenance(
        edge,
        currentPatches.filter((patch) => patch.targetPath.startsWith(`/universeGraph/edges/${index}`))
      )),
      promptVisualObligations: reconcilePromptVisualObligations(
        graph.promptVisualObligations,
        nodes,
        currentPatches
      ),
    };
    next.compositionLedger = reconcileCompositionLedgerForGraphEdit(
      graph.compositionLedger,
      previousGraph,
      next
    );
    return next;
  }

  function reconcileCompositionLedgerForGraphEdit(ledger, previousGraph, nextGraph) {
    if (!ledger || !previousGraph) return ledger || null;
    const nextNodeIds = new Set((nextGraph.nodes || []).map((node) => String(node.id || '')));
    const removedNodes = (previousGraph.nodes || []).filter((node) => !nextNodeIds.has(String(node.id || '')));
    if (!removedNodes.length) return ledger;
    const removedIdentities = new Set(removedNodes.flatMap((node) => [
      node.id,
      node.label,
      node.sourceLabel,
      node.canonicalId,
    ]).map(normalizedIdentity).filter(Boolean));
    const keep = (row) => !rowReferencesRemovedIdentity(row, removedIdentities);
    const relations = (ledger.relations || []).filter(keep);
    const referencedActionIds = new Set(relations.flatMap((row) => [row.from, row.to])
      .filter((value) => /^action:/.test(String(value || ''))));
    const entries = (ledger.entries || []).filter((row) => (
      keep(row) && (row.kind !== 'action' || row.required === true || referencedActionIds.has(row.id))
    ));
    const retainedIds = new Set([
      ...entries.map((row) => row.id),
      ...relations.map((row) => row.id),
    ]);
    const obligations = (ledger.obligations || []).filter((row) => (
      keep(row) && (!row.sourceRelationId || retainedIds.has(row.sourceRelationId))
    ));
    const phaseDeltas = (ledger.phaseDeltas || []).filter((row) => (
      (!row.entryId || retainedIds.has(row.entryId)) &&
      (!row.relationId || retainedIds.has(row.relationId))
    ));
    return {
      ...ledger,
      entries,
      relations,
      obligations,
      phaseDeltas,
      losses: (ledger.losses || []).filter(keep),
      summary: {
        ...(ledger.summary || {}),
        entryCount: entries.length,
        relationCount: relations.length,
        obligationCount: obligations.length,
        requiredCount: obligations.filter((row) => row.required === true).length,
        failedCount: obligations.filter((row) => ['lost', 'failed', 'wrong-identity', 'not-proven'].includes(row.status)).length,
      },
    };
  }

  function rowReferencesRemovedIdentity(row, identities) {
    const values = [
      row && row.id,
      row && row.label,
      row && row.from,
      row && row.to,
      row && row.target,
      row && row.sourceRelationId,
      ...(row && Array.isArray(row.mustPreserveIds) ? row.mustPreserveIds : []),
    ];
    return values.some((value) => {
      const tokens = String(value || '').split(/[:/._-]+/).map(normalizedIdentity).filter(Boolean);
      const whole = normalizedIdentity(value);
      return identities.has(whole) || tokens.some((token) => identities.has(token));
    });
  }

  function reconcilePromptVisualObligations(obligations = [], nodes = [], patches = []) {
    return (obligations || []).map((obligation) => {
      const nodeIndex = nodes.findIndex((node) => node.id === obligation.targetNodeId);
      if (nodeIndex < 0) return obligation;
      const nodePatches = patches.filter((patch) => (
        patch.targetPath === '/universeGraph/nodes' ||
        patch.targetPath.startsWith(`/universeGraph/nodes/${nodeIndex}`)
      ));
      if (!nodePatches.length) return obligation;
      const expected = editedExpectation(obligation, nodes[nodeIndex]);
      if (!expected) return obligation;
      const nextId = visualObligationId(obligation.constraintKind, nodes[nodeIndex], expected);
      return {
        ...obligation,
        ...expected,
        id: nextId,
        target: nodes[nodeIndex].label || nodes[nodeIndex].id || obligation.target,
        targetIdentity: nodeTargetIdentity(nodes[nodeIndex]),
        status: 'pending',
        phase: 4,
        authorship: {
          authority: 'userOverride',
          patchIds: nodePatches.map((patch) => patch.id),
          supersedesObligationId: obligation.id,
        },
      };
    });
  }

  function editedExpectation(obligation = {}, node = {}) {
    if (obligation.constraintKind === 'property') {
      const property = (node.properties || []).find((row) => row.kind === obligation.propertyKind);
      return property ? {
        propertyKind: property.kind,
        expectedValue: property.value,
      } : null;
    }
    if (obligation.constraintKind === 'count' && Number.isFinite(Number(node.cardinality))) {
      return {
        expectedCount: Math.max(0, Math.floor(Number(node.cardinality))),
        countMode: obligation.countMode || 'exact',
        countSource: 'userOverride',
      };
    }
    if (obligation.constraintKind === 'pose' && node.poseHint && node.poseHint.pose) {
      return { expectedPose: node.poseHint.pose };
    }
    if (obligation.constraintKind === 'environment' && node.environmentProgram) {
      return {
        expectedProgram: node.environmentProgram.kind,
        expectedValue: node.environmentProgram.color,
      };
    }
    return null;
  }

  function visualObligationId(kind, node = {}, expected = {}) {
    const suffix = [kind, normalizedIdentity(node.label), ...Object.values(expected)].filter(Boolean)
      .join('-').replace(/[^a-z0-9#]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
    return `visual:user-override-${suffix}`;
  }

  function nodeTargetIdentity(node = {}) {
    const semanticClass = String(node.semanticClass || '');
    return /^(?:body|entity|environment|material|medium|object|term)$/.test(semanticClass)
      ? normalizedIdentity(node.label)
      : semanticClass || normalizedIdentity(node.label);
  }

  function normalizedIdentity(value = '') {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
      .split(/\s+/).map((token) => token.length > 3 && token.endsWith('s') && !/(?:ss|us|is)$/.test(token)
        ? token.slice(0, -1) : token).join(' ');
  }

  function bindRowProvenance(row, patches) {
    if (!patches.length) return row;
    return {
      ...row,
      authorship: {
        authority: 'userOverride',
        patchIds: patches.map((patch) => patch.id),
      },
    };
  }

  function overrideProvenanceRows(graph, existingRows, patches, revision) {
    const byNode = existingRows && typeof existingRows === 'object' && !Array.isArray(existingRows)
      ? { ...existingRows }
      : Object.fromEntries((existingRows || []).map((row) => [row.nodeId, row]));
    for (const [index, node] of (graph.nodes || []).entries()) {
      const current = byNode[node.id] || {};
      const patchIds = patches
        .filter((patch) => patch.revision === revision && patch.targetPath.startsWith(`/universeGraph/nodes/${index}`))
        .map((patch) => patch.id);
      byNode[node.id] = {
        ...current,
        nodeId: node.id,
        authority: patchIds.length ? 'userOverride' : current.authority || 'compilerInference',
        patchIds,
      };
    }
    return byNode;
  }

  registry.define('physicsModel', 'simulatte-user-override-grounding.js', {
    createUserOverridePhase4,
    reconcileCompositionLedgerForGraphEdit,
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
