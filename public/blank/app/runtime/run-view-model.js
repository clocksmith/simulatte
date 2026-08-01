(function attachSimulatteRunViewModel(root, factory) {
  const phaseContracts = typeof module === 'object' && module.exports
    ? require('../../pipeline/simulatte-phase-contracts.js')
    : root.SimulattePhaseContracts;
  const api = factory(phaseContracts);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteRunViewModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createRunViewModelApi(phaseContracts) {
  if (!phaseContracts?.validatePhaseEnvelope) throw new Error('simulatte_run_view_model_phase_contracts_missing');
  const PHASES = Object.freeze([
    'Runtime', 'Language', 'Retrieval', 'Grounding',
    'Simulation', 'Visuals', 'Render', 'Proof',
  ]);

  function identity(value) {
    if (!value) return '—';
    if (typeof value === 'string') return value;
    return value.id || value.sha256 || value.hash || value.schema || 'receipted';
  }

  function phaseRow(step, seed = {}) {
    return Object.freeze({
      step,
      label: PHASES[step - 1],
      status: seed.status || 'pending',
      inputIdentity: identity(seed.inputIdentity),
      outputIdentity: identity(seed.outputIdentity),
      durationMs: Math.max(0, Number(seed.durationMs || 0)),
      candidateCount: Math.max(0, Number(seed.candidateCount || 0)),
      loss: Number.isFinite(Number(seed.loss)) ? Number(seed.loss) : null,
    });
  }

  function eventPhaseStep(state = {}, event = {}) {
    const explicit = Number(event.phaseStep);
    if (explicit >= 1 && explicit <= 8) return explicit;
    const stage = String(event.stage || event.phase || '').toLowerCase();
    if (/construction-proof|scene-proof|phase-?8/.test(stage)) return 8;
    if (/^render|first-frame|phase-?7/.test(stage)) return 7;
    if (/visual|phase-?6/.test(stage)) return 6;
    if (/simulation|compile|phase-?5/.test(stage)) return 5;
    if (/ground|activation|phase-?4/.test(stage)) return 4;
    if (/retriev|embed|rank|span|slot|phase-?3/.test(stage)) return 3;
    if (/language|parse|phase-?2/.test(stage)) return 2;
    if (/runtime|manifest|model|cache|start|phase-?1/.test(stage)) return 1;
    const fallback = Number(state.phase?.step || 1);
    return Math.max(1, Math.min(8, fallback));
  }

  function createViewModel(runId = '') {
    return Object.freeze({
      schema: 'simulatte.runViewModel.v1',
      runId: String(runId || ''),
      status: 'idle',
      phases: Object.freeze(PHASES.map((_label, index) => phaseRow(index + 1))),
      receipt: Object.freeze({
        schema: 'simulatte.runReceipt.v1',
        runId: String(runId || ''),
        status: 'idle',
        phases: Object.freeze([]),
      }),
    });
  }

  function finalize(runId, status, phases) {
    const frozenPhases = Object.freeze(phases.map((phase, index) => phaseRow(index + 1, phase)));
    return Object.freeze({
      schema: 'simulatte.runViewModel.v1',
      runId: String(runId || ''),
      status: String(status || 'idle'),
      phases: frozenPhases,
      receipt: Object.freeze({
        schema: 'simulatte.runReceipt.v1',
        runId: String(runId || ''),
        status: String(status || 'idle'),
        phases: frozenPhases,
      }),
    });
  }

  function project(state = {}, event = {}, previous = null) {
    const runId = String(state.runId || previous?.runId || '');
    const reset = !previous || (runId && previous.runId && runId !== previous.runId);
    const prior = reset ? createViewModel(runId).phases : previous.phases;
    const activeStep = eventPhaseStep(state, event);
    const failed = state.state === 'error' || state.state === 'failed';
    const unsupported = event.verdict === 'unsupported' || event.unsupported === true;
    const phases = prior.map((phase) => {
      if (phase.step < activeStep && phase.status !== 'failed' && phase.status !== 'unsupported') {
        return { ...phase, status: 'passed' };
      }
      if (phase.step !== activeStep) return phase;
      const status = failed
        ? 'failed'
        : unsupported
          ? 'unsupported'
          : state.state === 'active'
            ? 'running'
            : state.state === 'ready' || state.state === 'complete'
              ? 'passed'
              : phase.status;
      return {
        ...phase,
        status,
        inputIdentity: identity(event.inputIdentity || event.input || phase.inputIdentity),
        outputIdentity: identity(event.outputIdentity || event.output || event.receipt || phase.outputIdentity),
        durationMs: Number(event.durationMs || phase.durationMs || state.taskElapsedMs || 0),
        candidateCount: Number(event.candidateCount || event.candidates?.length || phase.candidateCount || 0),
        loss: Number.isFinite(Number(event.loss)) ? Number(event.loss) : phase.loss,
      };
    });
    return finalize(runId, state.state || previous?.status || 'idle', phases);
  }

  function phaseMetric(receipts, keys) {
    for (const key of keys) {
      const row = receipts.find((receipt) => Number.isFinite(Number(receipt?.[key])));
      if (row) return Number(row[key]);
    }
    return 0;
  }

  function recordSpec(viewModel, spec = {}) {
    const envelopes = spec.phaseArtifacts || {};
    const phases = viewModel.phases.map((phase) => {
      if (phase.step > 6) return phase;
      const envelope = envelopes[`phase${phase.step}`];
      if (!envelope) return phase;
      const receipts = Array.isArray(envelope.receipts) ? envelope.receipts : [];
      const valid = phaseEnvelopeValid(envelope, phase.step);
      return {
        ...phase,
        status: valid ? 'passed' : 'failed',
        inputIdentity: identity(envelope.inputSchema),
        outputIdentity: identity(envelope.schema),
        candidateCount: phaseMetric(receipts, [
          'activationCount', 'rawPrimitiveCount', 'querySlots', 'acceptedNodes',
          'physicsObligations', 'renderInstances',
        ]),
        loss: phaseMetric(receipts, [
          'missingRequiredSlots', 'unsupported', 'unsupportedPhysics',
          'lostObligations', 'failedObligations',
        ]),
      };
    });
    return finalize(viewModel.runId, viewModel.status, phases);
  }

  function recordSceneProof(viewModel, report = {}) {
    const phase7 = report.phase7Output || {};
    const renderExecution = phase7.artifact?.renderExecution || {};
    const phase7Receipt = Array.isArray(phase7.receipts) ? phase7.receipts[0] || {} : {};
    const phase8 = report.phase8Output || {};
    const sceneProof = phase8.artifact?.sceneProof || {};
    const proofSummary = sceneProof.summary || {};
    const settledObligations = Array.isArray(sceneProof.settledObligations)
      ? sceneProof.settledObligations
      : [];
    const requiredObligations = settledObligations.filter((row) => row.required === true);
    const requiredFailures = requiredObligations.filter((row) => (
      row.status === 'lost' || row.status === 'not-proven'
    ));
    const phase7Valid = phaseEnvelopeValid(phase7, 7) && phase7PixelProofPassed(renderExecution, phase7Receipt);
    const phase8Valid = phaseEnvelopeValid(phase8, 8) && sceneProof.verdict === 'pass';
    const phases = viewModel.phases.map((phase) => {
      if (phase.step === 7 && phase7.schema) {
        return {
          ...phase,
          status: phase7Valid ? 'passed' : 'failed',
          inputIdentity: identity(phase7.inputSchema),
          outputIdentity: identity(phase7.schema),
          durationMs: Number(renderExecution.frameMs || phase.durationMs || 0),
          candidateCount: Number(phase7Receipt.sceneInstanceCount || phase7Receipt.drawCount || 0),
          loss: Number(phase7Receipt.failedObligations || 0),
        };
      }
      if (phase.step === 8 && phase8.schema) {
        return {
          ...phase,
          status: phase8Valid ? 'passed' : 'failed',
          inputIdentity: identity(phase8.inputSchema || phase7.schema),
          outputIdentity: identity(phase8.schema),
          durationMs: Number(report.durationMs || phase.durationMs || 0),
          candidateCount: Number(requiredObligations.length || proofSummary.requiredCount || 0),
          loss: Number(requiredFailures.length),
        };
      }
      return phase;
    });
    return finalize(viewModel.runId, phase7Valid && phase8Valid ? 'ready' : viewModel.status, phases);
  }

  function phaseEnvelopeValid(envelope, phase) {
    try {
      phaseContracts.validatePhaseEnvelope(envelope, phase);
      return true;
    } catch (_error) {
      return false;
    }
  }

  function phase7PixelProofPassed(renderExecution, receipt) {
    return renderExecution?.rendered === true
      && Number(renderExecution.renderCount || 0) > 0
      && renderExecution.pixelAudit?.status === 'pass'
      && Number(receipt?.failedObligations || 0) === 0
      && Number(receipt?.unprovenObligations || 0) === 0;
  }

  function connect(documentRoot, runtimeProgress) {
    const rail = documentRoot?.getElementById?.('phase-rail');
    const details = documentRoot?.getElementById?.('phase-details');
    const copy = documentRoot?.getElementById?.('copy-run-receipt');
    if (!rail || !runtimeProgress?.subscribe) return null;
    let viewModel = createViewModel();
    let selectedStep = 1;
    const phaseStartedAt = new Map();
    const clock = () => documentRoot.defaultView?.performance?.now?.() || Date.now();
    const render = () => {
      rail.replaceChildren(...viewModel.phases.map((phase) => {
        const button = documentRoot.createElement('button');
        button.type = 'button';
        button.className = 'phase-rail-step';
        button.dataset.status = phase.status;
        button.dataset.step = String(phase.step);
        button.setAttribute('aria-pressed', String(phase.step === selectedStep));
        button.textContent = `${phase.step} ${phase.label}`;
        button.addEventListener('click', () => {
          selectedStep = phase.step;
          render();
        });
        return button;
      }));
      const selected = viewModel.phases[selectedStep - 1];
      if (details && selected) {
        details.textContent = [
          `${selected.label} · ${selected.status}`,
          `input ${selected.inputIdentity}`,
          `output ${selected.outputIdentity}`,
          `${selected.durationMs.toFixed(1)} ms`,
          `${selected.candidateCount} candidates`,
          selected.loss === null ? 'loss —' : `loss ${selected.loss}`,
        ].join(' · ');
      }
    };
    const unsubscribe = runtimeProgress.subscribe((state, rawEvent) => {
      const event = { ...(rawEvent || {}) };
      const step = eventPhaseStep(state, event);
      if (Number(event.taskPercent) === 0 || !phaseStartedAt.has(step)) phaseStartedAt.set(step, clock());
      if (Number(event.taskPercent) === 100 && !Number.isFinite(Number(event.durationMs))) {
        event.durationMs = Math.max(0, clock() - phaseStartedAt.get(step));
      }
      viewModel = project(state, event, viewModel);
      selectedStep = step;
      render();
    });
    copy?.addEventListener('click', async () => {
      await documentRoot.defaultView?.navigator?.clipboard?.writeText?.(
        JSON.stringify(viewModel.receipt, null, 2)
      );
      copy.textContent = 'Copied';
      documentRoot.defaultView?.setTimeout?.(() => { copy.textContent = 'Copy run receipt'; }, 1200);
    });
    render();
    return Object.freeze({
      disconnect: unsubscribe,
      snapshot: () => viewModel,
      recordSpec(spec) {
        viewModel = recordSpec(viewModel, spec);
        selectedStep = 7;
        render();
      },
      recordSceneProof(report) {
        viewModel = recordSceneProof(viewModel, report);
        selectedStep = 8;
        render();
      },
    });
  }

  return Object.freeze({
    PHASES,
    connect,
    createViewModel,
    project,
    recordSceneProof,
    recordSpec,
  });
});
