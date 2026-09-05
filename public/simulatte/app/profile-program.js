(function attachSimulatteProfileProgram(root, factory) {
  const worldSpec = typeof module === 'object' && module.exports
    ? require('../../shared/contracts/world-spec.js')
    : root.SimulatteWorldSpec;
  const profileWorldSpec = typeof module === 'object' && module.exports
    ? require('../../shared/contracts/profile-world-spec.js')
    : root.SimulatteProfileWorldSpec;
  const profileWorldProof = typeof module === 'object' && module.exports
    ? require('../../shared/contracts/profile-world-proof.js')
    : root.SimulatteProfileWorldProof;
  const editorUi = typeof module === 'object' && module.exports
    ? require('../../shared/design/program-editor.js') : root.SimulatteProgramEditor;
  const api = factory(root, worldSpec, profileWorldSpec, profileWorldProof, editorUi);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteProfileProgram = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createProfileProgramApi(
  root,
  worldSpec,
  profileWorldSpec,
  profileWorldProof,
  editorUi
) {
  if (!editorUi) throw new Error('program_editor_dependency_missing');
  const { safeFilePart, downloadJson } = editorUi;
  const { canonicalJson, canonicalValue } = worldSpec;
  const ALLOWED_EDITOR_PATHS = new Set(['/params/scenarioId']);
  const SETTLED_STATES = new Set(['settled', 'completed']);
  const RECEIPT_WAIT_MS = 60000;

  function connect(options = {}) {
    assertDependencies();
    const documentRoot = options.documentRoot || root.document;
    const elements = collectElements(documentRoot);
    const profile = options.profile;
    if (!profile || !Array.isArray(profile.seeds)) {
      throw programError('profile_program_profile_invalid', 'World program requires a governed profile with scenarios');
    }
    for (const key of ['getRuntime', 'getScenario', 'navigateScenario', 'replay']) {
      if (typeof options[key] !== 'function') {
        throw programError('profile_program_callback_missing', `World program requires ${key}`);
      }
    }
    const getRunReceipt = typeof options.getRunReceipt === 'function'
      ? options.getRunReceipt
      : () => root.__simulatteTierRunReceipt || root.__simulattePluginRunReceipt || null;
    const getCanvas = typeof options.getCanvas === 'function'
      ? options.getCanvas
      : () => defaultRenderCanvas(documentRoot);
    const draft = editorUi.createDraft({ editor: elements.editor, apply: elements.apply, status: elements.specStatus });
    let disposed = false;
    let latestProof = null;
    let replayEvidence = emptyReplayEvidence();
    let proofGeneration = 0;
    let baselineContentHash = '';

    function currentSpec() {
      const runtime = options.getRuntime();
      if (!runtime || typeof runtime.worldSpec !== 'function') {
        throw programError('profile_program_runtime_missing', 'World program runtime is unavailable');
      }
      return runtime.worldSpec();
    }

    function sync() {
      if (disposed) return null;
      const spec = currentSpec();
      draft.setValue(worldSpec.serializeWorldSpec(spec));
      elements.reset.disabled = false;
      baselineContentHash = spec.contentHash;
      setSpecStatus(elements, `${spec.contentHash} · ${spec.params.scenarioId}`, 'ready');
      updateReplayAvailability();
      return spec;
    }

    function markDirty() {
      if (disposed) return;
      draft.markDirty('Unapplied edit');
    }

    async function applyEditor() {
      try {
        setSpecStatus(elements, 'Validating governed scenario', 'active');
        const current = currentSpec();
        const candidate = worldSpec.parseWorldSpecEditCandidate(elements.editor.value);
        const scenario = scenarioEditTarget(current, candidate, profile);
        const compiled = profileWorldSpec.compileProfileScenarioSelection({
          profile,
          scenarioId: scenario.id,
          pluginManifests: selectedPluginManifests(profile, options.registry),
        });
        profileWorldSpec.resolveProfileExecution(compiled, {
          profile,
          scenario,
          pluginManifests: selectedPluginManifests(profile, options.registry),
        });
        replayEvidence = emptyReplayEvidence();
        latestProof = null;
        await options.navigateScenario(scenario, compiled);
        const active = sync();
        if (active.params.scenarioId !== scenario.id || active.contentHash !== compiled.contentHash) {
          throw programError(
            'profile_program_navigation_mismatch',
            `World runtime selected ${active.params.scenarioId}, expected ${scenario.id}`
          );
        }
        await refreshProof();
        return active;
      } catch (error) {
        setSpecStatus(elements, error.message || String(error), 'error');
        throw error;
      }
    }

    async function replayExactSpec() {
      let beforeReceipt = getRunReceipt();
      if (!isSettledRunReceipt(beforeReceipt)) {
        throw programError('profile_program_replay_unavailable', 'Run the current WorldSpec to settlement before exact replay');
      }
      elements.replay.disabled = true;
      setProofStatus(elements, 'Replaying exact WorldSpec', 'active');
      try {
        const beforeHash = await sha256Value(replayIdentity(beforeReceipt));
        const previousReceipt = typeof WeakRef === 'function' ? new WeakRef(beforeReceipt) : beforeReceipt;
        if (typeof WeakRef === 'function') beforeReceipt = null;
        const replayReceipt = await options.replay();
        const afterReceipt = isSettledRunReceipt(replayReceipt)
          ? replayReceipt
          : await waitForNewSettledReceipt(getRunReceipt, previousReceipt, documentRoot);
        const afterHash = await sha256Value(replayIdentity(afterReceipt));
        replayEvidence = Object.freeze({
          attempted: true,
          beforeSha256: beforeHash,
          afterSha256: afterHash,
          deterministic: beforeHash === afterHash,
        });
        const proof = await refreshProof();
        return proof;
      } catch (error) {
        setProofStatus(elements, error.message || String(error), 'error');
        throw error;
      } finally {
        updateReplayAvailability();
      }
    }

    async function refreshProof() {
      const generation = ++proofGeneration;
      const spec = currentSpec();
      const scenario = options.getScenario();
      const rawRunReceipt = getRunReceipt();
      if (!scenario || !isSettledRunReceipt(rawRunReceipt)) {
        latestProof = null;
        elements.proof.textContent = '';
        elements.section.dataset.worldProofVerdict = 'not-run';
        setProofStatus(elements, 'WorldProof waits for a settled run', 'pending');
        updateReplayAvailability();
        return null;
      }
      try {
        setProofStatus(elements, 'Binding execution evidence', 'active');
        const canvas = getCanvas();
        const renderEvidence = await captureRenderEvidence(canvas);
        const runReceipt = await normalizedRunReceipt(rawRunReceipt, profile, scenario);
        const pluginManifests = selectedPluginManifests(profile, options.registry);
        const recompiledSpec = profileWorldSpec.compileProfileWorldSpec({
          profile,
          scenario,
          pluginManifests,
        });
        const proof = profileWorldProof.createProfileWorldProof({
          spec,
          run: {
            id: `world-ui:${profile.id}:${scenario.id}`,
            profileId: profile.id,
            seedId: scenario.id,
            seed: scenario.seed,
          },
          runtime: { runReceipt },
          evidence: {
            settlements: settlementsFromRunReceipt(rawRunReceipt),
            replay: replayEvidence,
            screenshot: { sha256: renderEvidence.sha256 },
            pixelReadback: { status: 'pass', sha256: renderEvidence.sha256 },
            visual: {
              schema: 'simulatte.renderedEvidence.v1',
              canvas: { width: renderEvidence.width, height: renderEvidence.height },
            },
          },
          sourceIdentity: { build: { buildId: buildIdentity(documentRoot) } },
          browser: browserIdentity(canvas),
          claims: [{
            id: `claim:${profile.id}:${scenario.id}`,
            sentence: String(scenario.description || scenario.missionText || scenario.label || scenario.id),
          }],
          nowIso: new Date().toISOString(),
          recompiledSpec,
          independentCompilerExecution: true,
        });
        if (disposed || generation !== proofGeneration) return null;
        latestProof = proof;
        elements.proof.textContent = JSON.stringify(proof, null, 2);
        elements.section.dataset.worldProofVerdict = proof.verdict;
        const classSummary = Object.entries(proof.proofClasses)
          .map(([name, row]) => `${name} ${row.status}`)
          .join(' · ');
        setProofStatus(elements, `WorldProof ${proof.verdict} · ${classSummary}`, proof.verdict);
        updateReplayAvailability();
        return proof;
      } catch (error) {
        if (disposed || generation !== proofGeneration) return null;
        latestProof = null;
        elements.proof.textContent = '';
        elements.section.dataset.worldProofVerdict = 'fail';
        setProofStatus(elements, error.message || String(error), 'error');
        updateReplayAvailability();
        return null;
      }
    }

    function updateReplayAvailability() {
      elements.replay.disabled = disposed || !isSettledRunReceipt(getRunReceipt());
    }

    function resetEditor() {
      sync();
    }

    async function exportSpec() {
      try {
        const spec = currentSpec();
        await downloadJson(documentRoot, `${safeFilePart(spec.id)}.world.json`, worldSpec.serializeWorldSpec(spec));
        setSpecStatus(elements, `Exported ${spec.contentHash}`, 'ready');
      } catch (error) {
        setSpecStatus(elements, error.message || String(error), 'error');
      }
    }

    async function importSpec() {
      const file = elements.importFile.files && elements.importFile.files[0];
      if (!file) return;
      try {
        const inputSource = root.SimulatteInputSource || (typeof module === 'object' && module.exports && require('../../shared/contracts/input-source.js'));
        if (!inputSource) throw programError('profile_program_input_reader_missing', 'Shared input reader is unavailable');
        const input = await inputSource.readFile(file);
        if (input.kind !== 'worldSpec') throw programError('profile_program_input_kind', 'Import expects a WorldSpec. Prepare raw data in the workbench.');
        const imported = input.spec;
        elements.editor.value = worldSpec.serializeWorldSpec(imported);
        markDirty();
        setSpecStatus(elements, `Verified ${file.name || 'WorldSpec file'} for governed recompile`, 'dirty');
      } catch (error) {
        setSpecStatus(elements, error.message || String(error), 'error');
      } finally {
        elements.importFile.value = '';
      }
    }

    const listeners = [
      [elements.editor, 'input', markDirty],
      [elements.apply, 'click', () => { void applyEditor().catch(() => {}); }],
      [elements.reset, 'click', resetEditor],
      [elements.export, 'click', exportSpec],
      [elements.import, 'click', () => elements.importFile.click()],
      [elements.importFile, 'change', () => { void importSpec(); }],
      [elements.replay, 'click', () => { void replayExactSpec().catch(() => {}); }],
    ];
    listeners.forEach(([target, type, handler]) => target.addEventListener(type, handler));
    const observer = new MutationObserver(() => {
      updateReplayAvailability();
      if (!draft.isDirty()) {
        try {
          if (currentSpec().contentHash !== baselineContentHash) sync();
        } catch (error) {
          setSpecStatus(elements, error.message || String(error), 'error');
        }
      }
      if (documentRoot.body.dataset.journeyPhase === 'completed') void refreshProof();
    });
    observer.observe(documentRoot.body, { attributes: true, attributeFilter: ['data-journey-phase'] });
    sync();
    if (isSettledRunReceipt(getRunReceipt())) void refreshProof();

    function dispose() {
      if (disposed) return;
      disposed = true;
      proofGeneration += 1;
      observer.disconnect();
      listeners.forEach(([target, type, handler]) => target.removeEventListener(type, handler));
      elements.apply.disabled = true;
      elements.replay.disabled = true;
    }

    return Object.freeze({
      apply: applyEditor,
      dispose,
      latestProof: () => latestProof,
      refreshProof,
      replay: replayExactSpec,
      sync,
      isDirty: draft.isDirty,
    });
  }

  function collectElements(documentRoot) {
    const ids = {
      section: 'profile-program-section',
      editor: 'profile-world-spec-editor',
      specStatus: 'profile-world-spec-status',
      apply: 'apply-profile-world-spec',
      reset: 'reset-profile-world-spec',
      export: 'export-profile-world-spec',
      import: 'import-profile-world-spec',
      importFile: 'profile-world-spec-import-file',
      replay: 'replay-profile-world-spec',
      proofStatus: 'profile-world-proof-status',
      proof: 'profile-world-proof',
    };
    const elements = Object.fromEntries(Object.entries(ids).map(([key, id]) => (
      [key, documentRoot.getElementById(id)]
    )));
    const missing = Object.entries(elements).filter(([, value]) => !value).map(([key]) => ids[key]);
    if (missing.length) {
      throw programError('profile_program_controls_missing', `World program controls are missing: ${missing.join(', ')}`);
    }
    return elements;
  }

  function scenarioEditTarget(current, candidate, profile) {
    worldSpec.validateWorldSpec(current);
    worldSpec.validateWorldSpec(candidate, { verifyHash: false });
    const currentExport = JSON.parse(worldSpec.serializeWorldSpec(current));
    const candidateExport = canonicalValue(candidate);
    delete currentExport.contentHash;
    delete candidateExport.contentHash;
    const changedPaths = diffPaths(currentExport, candidateExport);
    const unsupported = changedPaths.filter((path) => !ALLOWED_EDITOR_PATHS.has(path));
    if (unsupported.length) {
      throw programError(
        'profile_program_edit_unsupported',
        `Profile packs currently permit only /params/scenarioId; changed ${unsupported.join(', ')}`
      );
    }
    const scenarioId = String(candidateExport.params && candidateExport.params.scenarioId || '');
    const scenario = profile.seeds.find((row) => row.id === scenarioId);
    if (!scenario) {
      throw programError('profile_program_scenario_undeclared', `Scenario ${scenarioId || 'missing'} is not declared by ${profile.id}`);
    }
    if (scenario.id === current.params.scenarioId) {
      throw programError('profile_program_edit_empty', 'WorldSpec scenario selection did not change');
    }
    return scenario;
  }

  function diffPaths(left, right, path = '') {
    if (canonicalJson(left) === canonicalJson(right)) return [];
    if (Array.isArray(left) && Array.isArray(right)) {
      const count = Math.max(left.length, right.length);
      return Array.from({ length: count }, (_, index) => (
        diffPaths(left[index], right[index], `${path}/${index}`)
      )).flat();
    }
    if (isPlainObject(left) && isPlainObject(right)) {
      const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
      return keys.flatMap((key) => diffPaths(left[key], right[key], `${path}/${escapePointer(key)}`));
    }
    return [path || '/'];
  }

  function replayIdentity(receipt) {
    if (receipt && receipt.schema === 'simulatte.pluginPlaybackRunReceipt.v1') {
      return canonicalValue({
        schema: receipt.schema,
        ownerPluginId: receipt.ownerPluginId,
        scenario: receipt.scenario,
        parameterValues: receipt.parameterValues,
        interventions: receipt.interventions,
        actionResult: receipt.actionResult,
        settlements: receipt.settlements,
        comparisonExecutionReceipts: receipt.comparisonExecutionReceipts,
        clock: receipt.clock,
      });
    }
    if (receipt && receipt.schema === 'simulatte.autonomyJourneyReceipt.v2') {
      return canonicalValue({
        schema: receipt.schema,
        mission: receipt.mission,
        identities: receipt.identities,
        terminalState: receipt.terminalState,
        finalState: receipt.finalState,
        settlement: receipt.settlement,
        verification: receipt.verification,
        integrity: receipt.integrity,
        pluginSettlement: receipt.pluginSettlement,
      });
    }
    return canonicalValue({
      schema: receipt && receipt.schema,
      tier: receipt && receipt.tier,
      profileId: receipt && receipt.profileId,
      scenario: receipt && receipt.scenario,
      parameterValues: receipt && receipt.parameterValues,
      actionResult: receipt && receipt.actionResult,
      settlement: receipt && receipt.settlement,
    });
  }

  async function normalizedRunReceipt(receipt, profile, scenario) {
    return Object.freeze({
      profileId: profile.id,
      scenario: { id: scenario.id, seed: scenario.seed },
      status: runReceiptStatus(receipt),
      contentSha256: await sha256Value(replayIdentity(receipt)),
    });
  }

  function settlementsFromRunReceipt(receipt) {
    if (Array.isArray(receipt && receipt.settlements)) return canonicalValue(receipt.settlements);
    if (receipt && receipt.schema === 'simulatte.autonomyJourneyReceipt.v2') {
      const core = {
        schema: 'simulatte.profileAutonomySettlementEvidence.v1',
        status: coreJourneySettled(receipt) ? 'settled' : 'failed',
        terminalState: receipt.terminalState,
        verificationPass: receipt.verification && receipt.verification.pass === true,
        integrityPass: receipt.verification && receipt.verification.integrityPass === true,
        settlement: receipt.settlement,
      };
      return canonicalValue([core, ...(Array.isArray(receipt.pluginSettlement) ? receipt.pluginSettlement : [])]);
    }
    if (receipt && receipt.settlement) {
      return canonicalValue(Array.isArray(receipt.settlement) ? receipt.settlement.flat() : [receipt.settlement]);
    }
    return [];
  }

  async function captureRenderEvidence(canvas) {
    if (!canvas || typeof canvas.__simulatteCaptureRenderPixels !== 'function') {
      throw programError('profile_program_render_readback_missing', 'Rendered pixel readback is unavailable');
    }
    const capture = await canvas.__simulatteCaptureRenderPixels({ encoding: 'bytes' });
    const bytes = capture?.rgbaBytes instanceof Uint8Array
      ? capture.rgbaBytes
      : capture?.rgbaBase64
        ? base64Bytes(capture.rgbaBase64)
        : null;
    if (!capture || !bytes || bytes.byteLength !== capture.width * capture.height * 4
      || !(capture.width > 0) || !(capture.height > 0)) {
      throw programError('profile_program_render_readback_invalid', 'Rendered pixel readback is incomplete');
    }
    return Object.freeze({
      width: Number(capture.width),
      height: Number(capture.height),
      sha256: await sha256Bytes(bytes),
    });
  }

  async function waitForNewSettledReceipt(getRunReceipt, previous, documentRoot) {
    const started = performance.now();
    while (performance.now() - started <= RECEIPT_WAIT_MS) {
      const candidate = getRunReceipt();
      const previousReceipt = typeof previous?.deref === 'function' ? previous.deref() : previous;
      if (candidate && candidate !== previousReceipt && isSettledRunReceipt(candidate) &&
        documentRoot.body.dataset.journeyPhase === 'completed') return candidate;
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    throw programError('profile_program_replay_timeout', 'Exact replay did not produce a new settled receipt');
  }

  function isSettledRunReceipt(receipt) {
    return runReceiptStatus(receipt) === 'settled';
  }

  function runReceiptStatus(receipt) {
    if (!receipt) return '';
    if (receipt.schema === 'simulatte.autonomyJourneyReceipt.v2') {
      return coreJourneySettled(receipt) ? 'settled' : 'failed';
    }
    const status = String(receipt.actionResult && receipt.actionResult.status || receipt.status || '');
    return status === 'completed' ? 'settled' : status;
  }

  function coreJourneySettled(receipt) {
    return Boolean(
      receipt && receipt.finalState && receipt.finalState.status === 'completed' &&
      receipt.verification && receipt.verification.pass === true &&
      (!Array.isArray(receipt.pluginSettlement) || receipt.pluginSettlement.every(settlementEvidenceSettled))
    );
  }

  function settlementEvidenceSettled(value) {
    return Boolean(value && (
      value.status === 'settled' ||
      Array.isArray(value.obligationResults) && value.obligationResults.length > 0 &&
        value.obligationResults.every((row) => row && row.status === 'settled')
    ));
  }

  function selectedPluginManifests(profile, registry) {
    if (!registry || typeof registry.entry !== 'function') {
      throw programError('profile_program_registry_missing', 'World program requires the generated plugin registry');
    }
    return profile.plugins.map((selection) => {
      const manifest = registry.entry(selection.id) && registry.entry(selection.id).manifest;
      if (!manifest) {
        throw programError('profile_program_manifest_missing', `Plugin manifest ${selection.id} is unavailable`);
      }
      return manifest;
    });
  }

  function browserIdentity(canvas) {
    const receipt = typeof canvas.__simulatteRenderReceipt === 'function'
      ? canvas.__simulatteRenderReceipt()
      : null;
    const adapter = receipt && receipt.adapter || {};
    return {
      product: root.navigator && root.navigator.userAgent || 'browser',
      gpu: receipt && receipt.backend === 'webgpu'
        ? { available: true, rendererBackend: receipt.backend, ...adapter }
        : { available: false, rendererBackend: receipt && receipt.backend || 'canvas2d' },
    };
  }

  function buildIdentity(documentRoot) {
    return String(documentRoot.querySelector('meta[name="simulatte-build"]') &&
      documentRoot.querySelector('meta[name="simulatte-build"]').content || 'unidentified-build');
  }

  function defaultRenderCanvas(documentRoot) {
    const rows = ['autonomy-canvas', 'overlay-canvas']
      .map((id) => documentRoot.getElementById(id))
      .filter(Boolean);
    return rows.find((canvas) => !canvas.hidden && typeof canvas.__simulatteCaptureRenderPixels === 'function')
      || rows.find((canvas) => typeof canvas.__simulatteCaptureRenderPixels === 'function')
      || null;
  }

  function setSpecStatus(elements, message, state) {
    editorUi.setStatus(elements.specStatus, message, state);
  }

  function setProofStatus(elements, message, state) {
    editorUi.setStatus(elements.proofStatus, message, state);
  }

  function emptyReplayEvidence() {
    return Object.freeze({ attempted: false, beforeSha256: '', afterSha256: '', deterministic: false });
  }

  function base64Bytes(value) {
    const binary = atob(String(value || ''));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }

  async function sha256Value(value) {
    return sha256Bytes(new TextEncoder().encode(`${canonicalJson(value)}\n`));
  }

  async function sha256Bytes(bytes) {
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  function isPlainObject(value) {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
  }

  function escapePointer(value) {
    return String(value).replace(/~/g, '~0').replace(/\//g, '~1');
  }

  function assertDependencies() {
    if (!worldSpec || !profileWorldSpec || !profileWorldProof) {
      throw programError('profile_program_contract_missing', 'World program contracts are unavailable');
    }
  }

  function programError(code, message) {
    const error = new Error(`${code}: ${message}`);
    error.name = 'SimulatteProfileProgramError';
    error.code = code;
    return error;
  }

  function invalidateRunReceipt(target, receiptKey) {
    target[receiptKey] = null;
    target.__simulatteComparisonExecutionReceipts = Object.freeze([]);
  }

  return Object.freeze({
    ALLOWED_EDITOR_PATHS: Object.freeze([...ALLOWED_EDITOR_PATHS]),
    captureRenderEvidence,
    connect,
    diffPaths,
    invalidateRunReceipt,
    isSettledRunReceipt,
    replayIdentity,
    scenarioEditTarget,
  });
});
