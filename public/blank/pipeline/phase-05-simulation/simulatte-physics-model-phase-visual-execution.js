(function attachSimulattePhysicsModelPhaseVisualExecution(root) {
  const scope = root.SimulattePhaseModuleRegistry.family('physicsModel');

  function phase6InputFromSimulationCompile(phase5Output) {
    scope.assertPhaseEnvelope(phase5Output, 5, 'Phase 6 input');
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
      interactionIR: simulationCompile.interactionIR || null,
      simulationCompile,
      phaseArtifacts: { phase5: phase5Output },
    };
  }

  function compilePhase6VisualProgram(phase5Output, compositionGraph = null) {
    scope.assertPhaseEnvelope(phase5Output, 5, 'Phase 6 input');
    const phase6Input = phase6InputFromSimulationCompile(phase5Output);
    const nextCompositionGraph = compositionGraph || (
      scope.buildCompositionGraph ? scope.buildCompositionGraph(phase6Input) : null
    );
    const visualProgram = nextCompositionGraph && scope.compileCompositionToRenderProgram
      ? scope.compileCompositionToRenderProgram(nextCompositionGraph, phase6Input)
      : null;
    return { phase6Input, compositionGraph: nextCompositionGraph, visualProgram };
  }

  function createVisualCompileEnvelope(phase5Output, compositionGraph = null) {
    const compiled = compilePhase6VisualProgram(phase5Output, compositionGraph);
    return createVisualCompileEnvelopeFromCompiled(phase5Output, compiled);
  }

  function createVisualCompileEnvelopeFromCompiled(phase5Output, compiled = {}) {
    scope.assertPhaseEnvelope(phase5Output, 5, 'Phase 6 output builder');
    const visualProgram = compiled.visualProgram || null;
    const visualIR = visualProgram && visualProgram.visualIR || null;
    const sceneRenderPacket = visualProgram && visualProgram.sceneRenderPacket ||
      visualIR && visualIR.sceneRenderPacket ||
      null;
    const compositionLedger = visualIR && visualIR.compositionLedger ||
      sceneRenderPacket && sceneRenderPacket.compositionLedger ||
      null;
    const visualCompile = {
      schema: scope.VISUAL_COMPILE_SCHEMA,
      visualIR,
      sceneRenderPacket,
      interactionProgram: sceneRenderPacket && sceneRenderPacket.interactionProgram || null,
      renderInstances: visualIR && Array.isArray(visualIR.renderInstances) ? visualIR.renderInstances : [],
      visualObligations: visualObligationsFromLedger(compositionLedger),
      identityPreservation: identityPreservationRows(sceneRenderPacket, compositionLedger),
      compositionLedger,
      camera: visualIR && visualIR.camera || visualProgram && visualProgram.camera || {},
      lights: sceneRenderPacket && sceneRenderPacket.lights ||
        visualIR && visualIR.lighting && visualIR.lighting.lights ||
        [],
      passes: sceneRenderPacket && sceneRenderPacket.passes || [],
      rendererPlan: visualProgram && visualProgram.rendererPlan || null,
      visualAcceptance: visualProgram && visualProgram.visualAcceptance || [],
      compositionGraphId: compiled.compositionGraph && compiled.compositionGraph.graphId || '',
    };
    return scope.createPhaseEnvelope({
      phase: 6,
      inputSchema: phase5Output.schema,
      runtimeReceiptId: phase5Output.runtimeReceiptId,
      artifact: { visualCompile, compositionLedger },
      receipts: [{
        id: 'phase6-visual-compile',
        schema: 'simulatte.phaseReceipt.v1',
        visualIR: visualIR && visualIR.schema || '',
        sceneRenderPacket: sceneRenderPacket && sceneRenderPacket.schema || '',
        renderInstances: visualCompile.renderInstances.length,
        obligationCount: visualCompile.compositionLedger &&
          Array.isArray(visualCompile.compositionLedger.obligations)
          ? visualCompile.compositionLedger.obligations.length
          : 0,
        lostObligations: visualCompile.compositionLedger &&
          Array.isArray(visualCompile.compositionLedger.obligations)
          ? visualCompile.compositionLedger.obligations
            .filter((row) => scope.LEDGER_FAILURE_STATUSES.has(row.status)).length
          : 0,
        identityPreservation: visualCompile.identityPreservation.length,
        passes: visualCompile.passes.length,
        interactionTargetCount: visualCompile.interactionProgram &&
          visualCompile.interactionProgram.targetCount || 0,
      }],
    });
  }

  function visualObligationsFromLedger(compositionLedger = null) {
    return (compositionLedger && compositionLedger.obligations || [])
      .filter((row) => row.kind !== 'relation' &&
        !/^action:coexists/.test(String(row.id || '')) &&
        (row.kind === 'visual' || row.ownedByPhase === 6 || (
          row.required === true &&
          Array.isArray(row.visualEvidence) &&
          row.visualEvidence.length > 0
        )))
      .map((row) => scope.phaseCarryObject({
        ...row,
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
        return scope.phaseCarryObject({
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
    const phase6Output = source && source.schema === scope.phaseOutputSchema(6)
      ? source
      : source && source.phaseArtifacts && source.phaseArtifacts.phase6 || null;
    if (!phase6Output) {
      throw new Error(
        `renderExecutionInput source expected ${scope.phaseOutputSchema(6)}, received ${source && source.schema || 'missing phase6 artifact'}`
      );
    }
    scope.assertPhaseEnvelope(phase6Output, 6, 'renderExecutionInput source');
    const visualCompile = phase6Output.artifact.visualCompile || null;
    if (!visualCompile || !visualCompile.sceneRenderPacket) {
      throw new Error('renderExecutionInput source missing artifact.visualCompile.sceneRenderPacket');
    }
    return {
      schema: scope.RENDER_EXECUTION_INPUT_SCHEMA,
      inputSchema: phase6Output.schema,
      runtimeReceiptId: phase6Output.runtimeReceiptId || source && source.runtimeReceiptId || 'runtime:unknown',
      sceneRenderPacket: visualCompile.sceneRenderPacket,
      renderInstances: Array.isArray(visualCompile.renderInstances) ? visualCompile.renderInstances : [],
      visualObligations: Array.isArray(visualCompile.visualObligations) ? visualCompile.visualObligations : [],
      compositionLedger: visualCompile.compositionLedger || phase6Output.artifact.compositionLedger || null,
      simulationState,
      canvas,
    };
  }

  function runPhase7RenderExecution(source, simulationState = null, canvas = null, frameReceipt = {}) {
    let renderExecutionInput = null;
    let inputSchema = '';
    let runtimeReceiptId = 'runtime:unknown';
    if (source && source.schema === scope.RENDER_EXECUTION_INPUT_SCHEMA) {
      if (source.inputSchema !== scope.phaseOutputSchema(6)) {
        throw new Error(
          `Phase 7 input expected ${scope.phaseOutputSchema(6)}, received ${source.inputSchema || 'missing inputSchema'}`
        );
      }
      renderExecutionInput = {
        ...source,
        simulationState: simulationState || source.simulationState || null,
        canvas: canvas || source.canvas || null,
      };
      inputSchema = source.inputSchema;
      runtimeReceiptId = source.runtimeReceiptId || runtimeReceiptId;
    } else {
      scope.assertPhaseEnvelope(source, 6, 'Phase 7 input');
      renderExecutionInput = createRenderExecutionInput(source, simulationState, canvas);
      inputSchema = source.schema;
      runtimeReceiptId = source.runtimeReceiptId || runtimeReceiptId;
    }
    const sceneRenderPacket = renderExecutionInput.sceneRenderPacket || {};
    if (sceneRenderPacket.schema !== 'simulatte.sceneRenderPacket.v1') {
      throw new Error(
        `Phase 7 input expected sceneRenderPacket simulatte.sceneRenderPacket.v1, received ${sceneRenderPacket.schema || 'missing'}`
      );
    }
    const compositionLedger = scope.advanceCompositionLedger(
      renderExecutionInput.compositionLedger || sceneRenderPacket.compositionLedger || null,
      7,
      'phase7-webgpu-render'
    );
    const visualObligationProof = scope.renderObligationProof(
      sceneRenderPacket,
      renderExecutionInput.visualObligations || [],
      compositionLedger,
      frameReceipt
    );
    const visualObligationProofSummary = scope.summarizeRenderObligationProof(visualObligationProof);
    const objectRealization = scope.objectRealizationForScenePacket(sceneRenderPacket);
    const pixelAudit = frameReceipt.pixelAudit || scope.renderPixelAudit(
      sceneRenderPacket,
      frameReceipt,
      renderExecutionInput.canvas,
      visualObligationProofSummary
    );
    return scope.createPhaseEnvelope({
      phase: 7,
      inputSchema,
      runtimeReceiptId,
      artifact: {
        renderExecution: {
          schema: scope.RENDER_EXECUTION_SCHEMA,
          renderExecutionInputSchema: renderExecutionInput.schema,
          sceneRenderPacketSchema: sceneRenderPacket.schema || '',
          rendered: frameReceipt.rendered === true,
          packetIdentitySummary: scope.scenePacketIdentitySummary(sceneRenderPacket),
          environmentProgram: sceneRenderPacket.environmentProgram || null,
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
      receipts: [{
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
      }],
    });
  }

  root.SimulattePhaseModuleRegistry.define(
    'physicsModel',
    'simulatte-physics-model-phase-visual-execution.js',
    {
      phase6InputFromSimulationCompile,
      compilePhase6VisualProgram,
      createVisualCompileEnvelope,
      createVisualCompileEnvelopeFromCompiled,
      visualObligationsFromLedger,
      identityPreservationRows,
      runPhase6VisualCompile,
      createRenderExecutionInput,
      runPhase7RenderExecution,
    }
  );
})(typeof globalThis !== 'undefined' ? globalThis : window);
