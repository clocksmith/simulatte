(function attachSimulattePromptControllerTraining(root) {
  const support = typeof module === 'object' && module.exports
    ? require('./prompt-controller-dependencies.js')
    : root.SimulattePromptControllerSupport;
  if (!support) throw new Error('SimulattePromptControllerTraining requires controller support');
  const { worldModelSnapshot } = support;

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

    function syncWorldModelReceipt(elements, spec) {
        if (!elements || !elements.node) return;
        const worldModel = worldModelSnapshot(spec);
        elements.node.dataset.sceneKind = worldModel.sceneKind || '';
        elements.node.dataset.templateId = worldModel.template || '';
        if (elements.status) elements.status.textContent = worldModel.sceneKind || worldModel.template || 'blank';
        if (elements.summary) elements.summary.textContent = worldModel.summary;
        if (elements.chips) {
          elements.chips.innerHTML = '';
          [
            ['spans', worldModel.languageSpans],
            ['accepted', worldModel.acceptedActivations],
            ['graph', `${worldModel.graphNodes}/${worldModel.graphEdges}`],
            ['physics', worldModel.physicsOperators],
            ['visual', `${worldModel.visualEntities}/${worldModel.visualProcesses}`],
            ['atoms', worldModel.graphicsAtoms],
            ['assumed', worldModel.assumptions],
            ['unsupported', worldModel.unsupported],
            ['wgsl', worldModel.wgslOperators],
          ].forEach(([label, value]) => {
            const chip = elements.node.ownerDocument.createElement('span');
            chip.className = 'world-model-chip';
            const labelNode = elements.node.ownerDocument.createElement('span');
            labelNode.textContent = label;
            const valueNode = elements.node.ownerDocument.createElement('strong');
            valueNode.textContent = String(value);
            chip.append(labelNode, valueNode);
            elements.chips.appendChild(chip);
          });
        }
      }

    const api = Object.freeze({
      logGraphDebug,
      syncWorldModelReceipt,
    });

  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulattePromptControllerTraining = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
