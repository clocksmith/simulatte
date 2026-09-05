function pluginFeatureExpression({ expectsP2pDelivery, expectsSunWalker, expectsCableTrader = false }) {
  return `(async () => {
    const waitFor = async (predicate, label, limit = 10000) => {
      const started = performance.now();
      while (!predicate()) {
        const status = document.getElementById('runtime-status');
        if (status?.dataset.kind === 'error') {
          const failure = (window.__simulatteAutonomyRuntimeEvents || []).filter((row) => row.level === 'error').at(-1);
          throw new Error(label + ': ' + status.textContent + (failure ? ' · ' + JSON.stringify(failure.details) : ''));
        }
        if (performance.now() - started > limit) {
          const proof = document.getElementById('alternative-proof');
          const state = document.getElementById('metric-state');
          throw new Error('timeout at ' + label
            + '; runtime=' + (status?.dataset.kind || 'missing') + ':' + (status?.textContent || '')
            + '; state=' + (state?.textContent || 'missing')
            + '; proof=' + (proof?.textContent || 'missing')
            + '; sunPlugin=' + Boolean(document.querySelector('#plugin-inspector [data-plugin-id="sun-walker"]'))
            + '; routeAlgorithm=' + (proof?.dataset.routeAlgorithm || 'missing'));
        }
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    };
    const input = document.getElementById('mission-input');
    const step = document.getElementById('step-button');
    const pluginSections = (pluginId) => [...document.querySelectorAll('#plugin-inspector [data-plugin-id="' + pluginId + '"]')];
    const evidenceSection = (pluginId) => pluginSections(pluginId).find((section) => section.querySelector('dd'));
    let cooperation = { visible: Boolean(document.querySelector('#plugin-inspector [data-plugin-id="p2p-delivery"]')) };
    let gpuParity = null;
    if (${expectsP2pDelivery}) {
      input.value = 'I need two AA batteries delivered to my East Village office. Match someone already passing nearby.';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      step.click();
      await waitFor(() => evidenceSection('p2p-delivery'), 'cooperative-plugin');
      const cooperationSection = evidenceSection('p2p-delivery');
      const cooperationRows = Object.fromEntries([...cooperationSection.querySelectorAll('div')].map((row) => [row.querySelector('dt')?.textContent.trim(), row.querySelector('dd')?.textContent.trim()]));
      cooperation = {
        visible: true,
        title: cooperationSection.querySelector('summary').textContent.trim(),
        match: cooperationRows.Match || '',
        compensation: cooperationRows.Compensation || '',
        settlement: cooperationRows.Settlement || '',
      };
      const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
      if (!adapter) throw new Error('cooperative GPU parity adapter unavailable');
      const parityDevice = await adapter.requestDevice();
      gpuParity = await SimulatteCooperativeGpuCompute.verifyGpuParity(parityDevice, [
        [120, 45, 0.05, 1, 0, 0.1, 200, 20],
        [30, 18, 0.01, 0.5, 0, 0.02, 100, 5],
        [240, 90, 0.2, 2, 0.5, 0.3, 400, 45],
      ]);
      parityDevice.destroy();
    }
    let shade = { visible: Boolean(document.querySelector('#plugin-inspector [data-plugin-id="sun-walker"]')) };
    if (${expectsSunWalker}) {
      await waitFor(() => {
        const contribution = globalThis.__simulattePluginPlatformV4?.contributions
          ?.find((row) => row.pluginId === 'sun-walker');
        return contribution?.state?.status === 'settled';
      }, 'shade-route');
      const platform = globalThis.__simulattePluginPlatformV4;
      const contribution = platform.contributions.find((row) => row.pluginId === 'sun-walker');
      const model = contribution.provenanceRecords.find((row) => row.kind === 'model');
      const measures = Object.fromEntries(contribution.state.measures.map((row) => [row.kind, Number(row.value)]));
      shade = {
        visible: true,
        routeAlgorithms: model?.metadata?.algorithms || [],
        selected: contribution.presentation.layers.find((row) => row.id === 'shade-selected-route')?.label || '',
        areaCount: contribution.presentation.layers.filter((row) => row.kind === 'area').length,
        actorCount: contribution.presentation.layers.filter((row) => row.kind === 'actor').length,
        exposureSeconds: (measures['direct-sun'] || 0) + (measures.shade || 0) + (measures.unknown || 0),
        viewMode: platform.view?.state?.decision?.mode || null,
      };
    }
    let cableTrader = { visible: Boolean(document.querySelector('#plugin-inspector [data-plugin-id="cable-trader"]')) };
    if (${expectsCableTrader}) {
      input.value = 'Run the 365-day community cable exchange and show live hub supply, demand, pickups, and drop-offs.';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      step.click();
      await waitFor(() => {
        const section = evidenceSection('cable-trader');
        return [...(section?.querySelectorAll('dt') || [])]
          .some((row) => row.textContent.trim() === 'Global supply today')
          && [...(section?.querySelectorAll('dd') || [])]
            .some((row) => /cables offered/.test(row.textContent));
      }, 'cable-trader-network');
      const section = evidenceSection('cable-trader');
      const rows = Object.fromEntries([...section.querySelectorAll('div')].map((row) => [row.querySelector('dt')?.textContent.trim(), row.querySelector('dd')?.textContent.trim()]));
      const canvas = document.getElementById('autonomy-canvas');
      const contribution = globalThis.__simulattePluginPlatformV4?.contributions
        ?.find((row) => row.pluginId === 'cable-trader');
      const layers = contribution?.presentation?.layers || [];
      const residences = layers.find((row) => row.id === 'residences');
      cableTrader = {
        visible: true,
        peopleResidences: rows['People / residences'] || '',
        globalSupply: rows['Global supply today'] || '',
        globalDemand: rows['Global demand today'] || '',
        pseudoYearTotal: rows['Pseudo-year total'] || '',
        residencePointCount: residences?.geometry?.coordinates?.length || 0,
        hubLayerCount: layers.filter((row) => row.id.startsWith('hub:')).length,
        travelerLayerCount: layers.filter((row) => row.kind === 'actor').length,
        markerCount: Number(canvas.dataset.pluginMarkersCount || 0),
        pathCount: Number(canvas.dataset.pluginPathsCount || 0),
        labelCount: Number(canvas.dataset.pluginLabelCount || 0),
      };
    }
    return { cooperation, gpuParity, shade, cableTrader };
  })()`;
}

function profileProgramRoundTripExpression(scenarios) {
  return `(async () => {
    const scenarios = ${JSON.stringify(scenarios.map((row) => ({
      id: row.id,
      seed: row.seed,
      prompt: row.missionText || row.description || row.label || row.id,
    })))};
    const phaseHistory = [{ atMs: performance.now(), phase: document.body.dataset.journeyPhase || 'missing', status: document.getElementById('runtime-status')?.textContent || '', href: location.href }];
    new MutationObserver(() => phaseHistory.push({
      atMs: performance.now(),
      phase: document.body.dataset.journeyPhase || 'missing',
      status: document.getElementById('runtime-status')?.textContent || '',
      href: location.href,
    })).observe(document.body, { attributes: true, attributeFilter: ['data-journey-phase'] });
    const waitFor = async (predicate, label, limit = 60000) => {
      const started = performance.now();
      while (!predicate()) {
        const programStatus = document.getElementById('profile-world-spec-status');
        const proofStatus = document.getElementById('profile-world-proof-status');
        if (programStatus?.dataset.state === 'error' || proofStatus?.dataset.state === 'error') {
          throw new Error('profile program failed at ' + label + ': '
            + (programStatus?.textContent || '') + ' · ' + (proofStatus?.textContent || ''));
        }
        if (performance.now() - started > limit) {
          throw new Error('profile program timeout at ' + label
            + '; phase=' + (document.body.dataset.journeyPhase || 'missing')
            + '; runtime=' + (document.getElementById('runtime-status')?.textContent || 'missing')
            + '; program=' + (programStatus?.textContent || 'missing')
            + '; proof=' + (proofStatus?.textContent || 'missing')
            + '; profileChecks=' + JSON.stringify(window.__simulatteProfileProgramChecks || null)
            + '; phases=' + JSON.stringify(phaseHistory.slice(-16)));
        }
        await new Promise((resolve) => setTimeout(resolve, 40));
      }
    };
    const editor = document.getElementById('profile-world-spec-editor');
    const section = document.getElementById('profile-program-section');
    const drawer = document.getElementById('decisions-drawer');
    const controlsButton = document.getElementById('decisions-button');
    if (!editor || !section || !drawer || !controlsButton || scenarios.length < 2) throw new Error('profile program requires visible controls, an editor, and two governed scenarios');
    if (!drawer.classList.contains('is-open')) controlsButton.click();
    await waitFor(() => drawer.classList.contains('is-open') && drawer.getAttribute('aria-hidden') === 'false', 'program-drawer-open', 5000);
    await new Promise((resolve) => setTimeout(resolve, 320));
    section.open = true;
    section.scrollIntoView({ block: 'start', behavior: 'instant' });
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const actionIds = [
      'apply-profile-world-spec', 'reset-profile-world-spec', 'replay-profile-world-spec',
      'export-profile-world-spec', 'import-profile-world-spec',
    ];
    const layoutRows = [editor, ...actionIds.map((id) => document.getElementById(id))].map((element) => {
      const rect = element.getBoundingClientRect();
      return { id: element.id, left: rect.left, right: rect.right, width: rect.width, height: rect.height };
    });
    const layout = {
      rows: layoutRows,
      pass: layoutRows.every((row) => row.width >= 44 && row.height >= 44 && row.left >= -0.5 && row.right <= innerWidth + 0.5)
        && section.scrollWidth <= section.clientWidth + 1
        && document.documentElement.scrollWidth <= innerWidth,
    };
    await waitFor(() => editor.value && document.getElementById('profile-world-spec-status').dataset.state === 'ready', 'editor-ready', 5000);
    const initial = JSON.parse(editor.value);
    const target = scenarios.find((row) => row.id !== initial.params.scenarioId);
    if (!target) throw new Error('profile program could not select a different governed scenario');
    const candidate = structuredClone(initial);
    candidate.params.scenarioId = target.id;
    editor.value = JSON.stringify(candidate, null, 2);
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    await waitFor(() => !document.getElementById('apply-profile-world-spec').disabled, 'edit-dirty', 5000);
    document.getElementById('apply-profile-world-spec').click();
    await waitFor(() => {
      try {
        const active = JSON.parse(editor.value);
        const checks = {
          scenario: active.params.scenarioId === target.id,
          changed: active.contentHash !== initial.contentHash,
          promptScenario: active.source.prompt.includes('Scenario ' + target.id + '.'),
          promptMission: active.source.prompt.endsWith('Mission ' + target.prompt),
          seed: active.params.scenarioSeed === target.seed,
          contract: Boolean(active.contract.scenarioContentHash),
          route: new URL(location.href).searchParams.get('scenario') === target.id,
          runtime: document.getElementById('runtime-status').dataset.kind === 'ready',
        };
        window.__simulatteProfileProgramChecks = checks;
        return Object.values(checks).every(Boolean);
      } catch { return false; }
    }, 'governed-recompile');
    const applied = JSON.parse(editor.value);
    const start = document.getElementById('start-button');
    start.click();
    const timeline = document.getElementById('playback-timeline');
    const pause = document.getElementById('pause-button');
    const resume = document.getElementById('resume-button');
    if (document.body.dataset.interactionMode === 'playback') {
      await waitFor(() => Number(timeline.max || 0) > 0 && !pause.hidden, 'edited-run-ready');
      pause.click();
      timeline.value = timeline.max;
      timeline.dispatchEvent(new Event('change', { bubbles: true }));
      await waitFor(() => document.body.dataset.journeyPhase === 'paused'
        && Number(timeline.value) === Number(timeline.max)
        && document.getElementById('runtime-status').textContent.startsWith('End preview')
        && !resume.hidden && !resume.disabled, 'edited-run-terminal-preview');
      resume.click();
    }
    await waitFor(() => document.body.dataset.journeyPhase === 'completed', 'edited-run-settled');
    await waitFor(() => {
      try {
        const proof = JSON.parse(document.getElementById('profile-world-proof').textContent);
        return proof.worldSpec.contentHash === applied.contentHash
          && proof.proofClasses.intent.status === 'pass'
          && proof.proofClasses.semantic.status === 'pass'
          && proof.proofClasses.compilation.status === 'pass'
          && proof.proofClasses.simulation.status === 'pass';
      } catch { return false; }
    }, 'edited-run-proof');
    const beforeReplay = JSON.parse(document.getElementById('profile-world-proof').textContent);
    const replay = document.getElementById('replay-profile-world-spec');
    await waitFor(() => !replay.disabled, 'exact-replay-ready');
    replay.click();
    await waitFor(() => {
      try {
        const proof = JSON.parse(document.getElementById('profile-world-proof').textContent);
        return !replay.disabled
          && proof.createdAt !== beforeReplay.createdAt
          && proof.proofClasses.replay.status === 'pass';
      } catch { return false; }
    }, 'exact-replay-proof');
    const proof = JSON.parse(document.getElementById('profile-world-proof').textContent);
    const pass = layout.pass
      && proof.verdict === 'not-proven'
      && proof.worldSpec.contentHash === applied.contentHash
      && proof.proofClasses.compilation.status === 'pass'
      && proof.proofClasses.simulation.status === 'pass'
      && proof.proofClasses.replay.status === 'pass'
      && proof.proofClasses.intent.status === 'pass'
      && proof.proofClasses.semantic.status === 'pass'
      && proof.proofClasses.visual.status === 'not-proven';
    return {
      pass,
      initialContentHash: initial.contentHash,
      appliedContentHash: applied.contentHash,
      scenarioId: applied.params.scenarioId,
      scenarioSeed: applied.params.scenarioSeed,
      routeScenarioId: new URL(location.href).searchParams.get('scenario'),
      verdict: proof.verdict,
      proofClasses: Object.fromEntries(Object.entries(proof.proofClasses).map(([id, row]) => [id, row.status])),
      pixelReadbackStatus: proof.evidence.sceneProof.pixelReadbackStatus,
      editorAuthority: 'params.scenarioId',
      layout,
      phaseHistory,
    };
  })()`;
}

function actorViewExpression() {
  return `(async () => {
    const canvas = document.getElementById('autonomy-canvas');
    const minimap = document.getElementById('follow-minimap');
    canvas.scrollIntoView({ block: 'center', behavior: 'instant' });
    document.getElementById('camera-follow').click();
    const started = performance.now();
    while (canvas.dataset.cameraTransition !== 'settled') {
      if (performance.now() - started > 5000) throw new Error('actor follow camera did not settle');
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    canvas.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -3000 }));
    await new Promise((resolve) => setTimeout(resolve, 320));
    return {
      mode: canvas.dataset.cameraMode,
      transition: canvas.dataset.cameraTransition,
      followDistance: Number(canvas.dataset.cameraFollowDistance),
      dynamicVertexCount: Number(canvas.dataset.dynamicVertexCount),
      actorMeshSchema: canvas.dataset.actorMeshSchema,
      ambientActorCount: Number(canvas.dataset.ambientActorCount),
      ambientActorKinds: canvas.dataset.ambientActorKinds,
      minimapVisible: !minimap.hidden && canvas.dataset.followMinimap === 'visible',
      minimapFrameCount: Number(minimap.dataset.frameCount || 0),
    };
  })()`;
}


export { pluginFeatureExpression, profileProgramRoundTripExpression, actorViewExpression };
