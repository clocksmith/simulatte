(function attachSimulattePhysicsRenderertraining(root) {
  const scope = root.__SimulattePhysicsRendererRefactorScope;
  if (!scope || scope.missingDependency) return;
  with (scope) {
    function worldModelSnapshot(spec = {}) {
        const intentBrief = spec.intent && spec.intent.intentBrief || {};
        const universeBrief = spec.universeGraph && spec.universeGraph.intentBrief || {};
        const physicalReceipt = spec.physicalSpec && spec.physicalSpec.receipt || {};
        const receiptBrief = physicalReceipt.intentBrief || {};
        const renderReceipt = spec.renderIR && spec.renderIR.intentBriefReceipt || {};
        const compactBrief = renderReceipt.schema ? renderReceipt : receiptBrief;
        const visualIR = spec.renderProgram && spec.renderProgram.visualIR || {};
        const graphicsAtoms = visualIR.graphicsAtoms || {};
        const prompt = spec.renderIR && spec.renderIR.prompt ||
          spec.universeGraph && spec.universeGraph.prompt ||
          spec.name ||
          '';
        const sceneKind = visualIR.sceneKind ||
          spec.renderProgram && spec.renderProgram.rendererPlan && spec.renderProgram.rendererPlan.sceneKind ||
          spec.renderIR && spec.renderIR.sceneHint ||
          spec.templateId ||
          'blank-world';
        const languageSpans = countRows(intentBrief.languageEvidence && intentBrief.languageEvidence.spans) ||
          countRows(universeBrief.languageEvidence && universeBrief.languageEvidence.spans) ||
          countRows(compactBrief.languageSpans);
        const acceptedActivations = countRows(intentBrief.groundedInterpretation && intentBrief.groundedInterpretation.acceptedActivations) ||
          countRows(universeBrief.groundedInterpretation && universeBrief.groundedInterpretation.acceptedActivations) ||
          countRows(compactBrief.acceptedActivations);
        const graphNodes = countRows(spec.universeGraph && spec.universeGraph.nodes);
        const graphEdges = countRows(spec.universeGraph && spec.universeGraph.edges);
        const physicsOperators = countRows(spec.physicsIR && spec.physicsIR.operators);
        const visualEntities = countRows(visualIR.entities);
        const visualProcesses = countRows(visualIR.processes);
        const graphicsAtomRows = [
          'mappings',
          'geometry',
          'fields',
          'materials',
          'processes',
          'motion',
          'camera',
          'languageSignals',
        ].reduce((sum, key) => sum + countRows(graphicsAtoms[key]), 0);
        const assumptions = countRows(intentBrief.assumptions) ||
          countRows(universeBrief.assumptions) ||
          Number(physicalReceipt.assumptionCount || 0);
        const unsupported = countRows(intentBrief.unsupported) +
          countRows(intentBrief.degradedTo) ||
          countRows(universeBrief.unsupported) +
          countRows(universeBrief.degradedTo) ||
          Number(physicalReceipt.unsupportedCount || 0) + Number(physicalReceipt.degradedCount || 0);
        return {
          schema: 'simulatte.visibleWorldModelReceipt.v1',
          template: spec.templateId || '',
          prompt,
          sceneKind,
          summary: worldModelSummary(prompt, sceneKind, {
            graphNodes,
            graphEdges,
            visualEntities,
            graphicsAtomRows,
          }),
          languageSpans,
          acceptedActivations,
          graphNodes,
          graphEdges,
          physicsOperators,
          solverSteps: countRows(spec.solverGraph && spec.solverGraph.steps),
          visualEntities,
          visualProcesses,
          graphicsAtoms: graphicsAtomRows,
          mappings: countRows(graphicsAtoms.mappings),
          wgslOperators: countRows(graphicsAtoms.wgslOperators),
          assumptions,
          unsupported,
          receipts: {
            intentBrief: intentBrief.schema || universeBrief.schema || compactBrief.schema || '',
            universeGraph: spec.universeGraph && spec.universeGraph.schema || '',
            physicsIR: spec.physicsIR && spec.physicsIR.schema || '',
            solverGraph: spec.solverGraph && spec.solverGraph.schema || '',
            visualIR: visualIR.schema || '',
            graphicsAtoms: graphicsAtoms.schema || '',
          },
        };
      }

    function worldModelSummary(prompt, sceneKind, counts) {
        const source = String(prompt || '').trim() || 'blank construction plane';
        const compact = source.length > 84 ? `${source.slice(0, 81).trim()}...` : source;
        const evidence = counts.graphNodes || counts.visualEntities || counts.graphicsAtomRows
          ? `${counts.graphNodes} nodes, ${counts.visualEntities} visual entities, ${counts.graphicsAtomRows} atoms`
          : 'awaiting compiled evidence';
        return `${compact} -> ${sceneKind || 'world'} | ${evidence}`;
      }

    function countRows(rows) {
        return Array.isArray(rows) ? rows.length : 0;
      }

    function graphDebugEnabled() {
        const view = typeof globalThis !== 'undefined' ? globalThis : null;
        return Boolean(view && view.__SIMULATTE_GRAPH_DEBUG__ === true);
      }

    function logGraphDebug(spec) {
        if (!graphDebugEnabled() || typeof console === 'undefined' || !spec || typeof spec !== 'object') return;
        if (!spec.compositionGraph && !spec.renderProgram && !spec.physicalSpec) return;
        const graph = spec.compositionGraph || null;
        const renderProgram = spec.renderProgram || null;
        const receipt = spec.physicalSpec && spec.physicalSpec.receipt || null;
        const rendererPlan = renderProgram && renderProgram.rendererPlan || null;
        const prompt = renderProgram && renderProgram.intentText || spec.renderIR && spec.renderIR.prompt || spec.name || 'simulation';
        const scene = rendererPlan && rendererPlan.sceneKind || 'unplanned';
        const graphId = spec.id || graph && graph.graphId || 'simulation';
        const label = `[simulatte.graph] ${scene} ${graphId}`;
        const group = typeof console.groupCollapsed === 'function' ? console.groupCollapsed.bind(console) : console.log.bind(console);
        const groupEnd = typeof console.groupEnd === 'function' ? console.groupEnd.bind(console) : () => {};
        group(label);
        console.log('compiledIntentText', String(prompt || '').slice(0, 1200));
        console.log('intentReceipt', spec.physicalSpec && spec.physicalSpec.receipt && spec.physicalSpec.receipt.intentBrief || null);
        console.log('semanticRetrievalReceipt', spec.universeGraph && spec.universeGraph.intentBrief || null);
        console.log('promptParse', spec.promptParse || null);
        console.log('universeGraph', spec.universeGraph || null);
        console.log('semanticGraph', spec.universeGraph && spec.universeGraph.semanticGraph || null);
        console.log('affordanceGraph', spec.universeGraph && spec.universeGraph.affordanceGraph || null);
        console.log('primitiveMapping', spec.universeGraph && spec.universeGraph.primitiveMapping || null);
        console.log('physicsIR', spec.physicsIR || null);
        console.log('validationReceipt', spec.validationReceipt || null);
        console.log('solverGraph', spec.solverGraph || null);
        console.log('renderIR', spec.renderIR || null);
        console.log('compositionGraph', graph);
        console.log('renderProgram', renderProgram);
        console.log('physicalSpec', spec.physicalSpec || null);
        console.log('receipt', receipt);
        if (graph && typeof console.table === 'function') {
          console.table((graph.nodes || []).map((node) => ({
            id: node.id,
            primitive: node.primitiveId,
            type: node.type,
            layer: node.layer,
            regime: node.visualRegime,
            material: node.material,
            source: node.source,
          })));
          console.table((graph.relations || []).map((relation) => ({
            from: relation.from,
            to: relation.to,
            type: relation.type || relation.relation || '',
            operator: relation.operator || '',
          })));
          console.table((graph.operators || []).map((operator) => ({
            id: operator.id,
            kind: operator.kind || operator.type || '',
            inputs: Array.isArray(operator.inputs) ? operator.inputs.join(', ') : '',
            outputs: Array.isArray(operator.outputs) ? operator.outputs.join(', ') : '',
          })));
        }
        if (rendererPlan) {
          console.log('rendererPlan', rendererPlan);
        }
        groupEnd();
      }

    function syncOpenSpecPreview(node, spec, frameNow, lastSync, assignLastSync) {
        if (!node) return;
        const disclosure = node.closest ? node.closest('details') : null;
        if (disclosure && !disclosure.open) return;
        if (frameNow - lastSync < 250) return;
        syncSpecPreview(node, spec);
        assignLastSync(frameNow);
      }

    function start() {
        if (typeof document === 'undefined') return null;
        return createBrowserLab(document);
      }

    Object.assign(scope, {
      worldModelSnapshot,
      worldModelSummary,
      countRows,
      graphDebugEnabled,
      logGraphDebug,
      syncOpenSpecPreview,
      start,
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
