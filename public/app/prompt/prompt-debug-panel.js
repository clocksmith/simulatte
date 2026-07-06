(function attachSimulatteDebugPanel(root) {
  if (typeof document === 'undefined') return;
  const enabled = new URLSearchParams(root.location && root.location.search || '').get('debug') === '1';
  if (!enabled) return;

  function createPanel() {
    const panel = document.createElement('details');
    panel.className = 'simulatte-debug-panel';
    panel.open = true;
    panel.style.cssText = [
      'position:fixed',
      'right:12px',
      'bottom:12px',
      'z-index:30',
      'width:min(520px,calc(100vw - 24px))',
      'max-height:58vh',
      'overflow:auto',
      'background:rgba(14,18,24,0.92)',
      'color:#f7fbff',
      'border:1px solid rgba(255,255,255,0.2)',
      'border-radius:8px',
      'padding:10px',
      'font:12px/1.35 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace',
    ].join(';');
    const summary = document.createElement('summary');
    summary.textContent = 'pipeline debug';
    summary.style.cursor = 'pointer';
    const body = document.createElement('pre');
    body.style.whiteSpace = 'pre-wrap';
    body.style.margin = '8px 0 0';
    panel.append(summary, body);
    document.body.appendChild(panel);
    return body;
  }

  function snapshot() {
    const lab = root.SimulattePhysicsLab && root.SimulattePhysicsLab._browserLab;
    const spec = lab && lab.getSpec ? lab.getSpec() : null;
    const state = lab && lab.getState ? lab.getState() : null;
    if (!spec) return { status: 'waiting for lab' };
    return {
      promptParse: spec.promptParse,
      universeGraph: spec.universeGraph,
      physicsIR: compactIR(spec.physicsIR),
      validationReceipt: spec.validationReceipt,
      solverGraph: compactSolver(spec.solverGraph),
      renderIR: compactRender(spec.renderIR),
      visualIR: compactVisual(spec.renderProgram && spec.renderProgram.visualIR),
      liveChannels: state && state.solverState ? state.solverState.channels : null,
    };
  }

  function compactIR(ir) {
    if (!ir) return null;
    return {
      schema: ir.schema,
      domains: ir.domains,
      fields: ir.stateFields,
      operators: ir.operators,
      couplings: ir.couplings,
      receipt: ir.receipt,
    };
  }

  function compactSolver(graph) {
    if (!graph) return null;
    return {
      schema: graph.schema,
      channels: Object.keys(graph.channels || {}),
      steps: graph.steps,
      warnings: graph.warnings,
    };
  }

  function compactRender(renderIR) {
    if (!renderIR) return null;
    return {
      schema: renderIR.schema,
      sceneHint: renderIR.sceneHint,
      objects: renderIR.objects,
      fields: renderIR.fields,
      readouts: renderIR.readouts,
    };
  }

  function compactVisual(visualIR) {
    if (!visualIR) return null;
    const graphicsAtoms = visualIR.graphicsAtoms || {};
    return {
      schema: visualIR.schema,
      sceneKind: visualIR.sceneKind,
      camera: visualIR.camera,
      operators: (visualIR.operators || []).map((operator) => operator.id),
      graphicsAtoms: {
        schema: graphicsAtoms.schema,
        compiler: graphicsAtoms.compiler,
        atlasId: graphicsAtoms.atlasId,
        mappings: (graphicsAtoms.mappings || []).map((row) => ({
          id: row.id,
          score: row.score,
          uniformSlots: row.uniformSlots,
          wgslOperators: row.wgslOperators,
        })),
        uniforms: graphicsAtoms.uniforms,
        wgslOperators: graphicsAtoms.wgslOperators,
        rejections: graphicsAtoms.rejections,
      },
      receipts: (visualIR.receipts || []).filter((receipt) => /graphics|causal/.test(receipt.id || '')),
    };
  }

  document.addEventListener('DOMContentLoaded', () => {
    const body = createPanel();
    function refresh() {
      body.textContent = JSON.stringify(snapshot(), null, 2);
      root.requestAnimationFrame(refresh);
    }
    refresh();
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
