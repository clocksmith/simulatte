(function bootRecursiveReference(root) {
  const portIds = Object.freeze({
    capacity: 'subsea.mid-atlantic.delivered-gbps',
    wan: 'virginia-wan.available-gbps',
    throughput: 'datacenter-scheduler.throughput-steps-per-hour',
    power: 'gpu-cluster.it-power-kw',
    temperature: 'gpu-cluster.peak-junction-temperature-c',
  });
  const ready = start();
  root.__SIMULATTE_RECURSIVE_REFERENCE__ = Object.freeze({ ready });

  async function start() {
    const status = document.getElementById('runtime-status');
    const statusMark = document.getElementById('status-mark');
    try {
      const inputs = await loadInputs();
      const hardware = await acquireWebGpuDevice();
      const reference = root.SimulatteEarthVirginiaDatacenterReference.createReferenceWorld(inputs);
      const scene = root.SimulatteRecursiveWorldScene.compileScene(reference.worldSpec);
      const identity = runtimeIdentity(hardware.adapterInfo);
      const renderer = await root.SimulatteRecursiveWorldWebGpuRenderer.createRenderer({
        canvas: document.getElementById('recursive-world-canvas'),
        scene,
        device: hardware.device,
        buildId: identity.buildId,
        runtimeId: identity.runtimeId,
        deviceClass: identity.deviceClass,
        pixelRatio: Math.min(root.devicePixelRatio || 1, 2),
        initialTargetId: 'earth',
      });
      bindScaleControls(renderer);
      await reference.coordinator.runUntil(3540);
      const baselineObservation = reference.coordinator.observePorts();
      let observation = baselineObservation;
      let frameReceipt = null;
      let finalProofBundle = null;
      let advancing = false;
      let nextAdvanceAt = performance.now() + 800;
      const frameTimes = [];
      let priorFrameAt = null;
      status.textContent = 'Governed world active';
      statusMark.classList.add('ready');

      async function frame(nowMs) {
        if (priorFrameAt !== null) {
          frameTimes.push(nowMs - priorFrameAt);
          if (frameTimes.length > 360) frameTimes.shift();
        }
        priorFrameAt = nowMs;
        frameReceipt = renderer.render({ observation, nowMs });
        updateMetrics(observation);
        updateFrameMeasurement(frameTimes);
        if (!advancing && observation.logicalTime < 3900 && nowMs >= nextAdvanceAt) {
          advancing = true;
          nextAdvanceAt = nowMs + 800;
          const target = Math.min(3900, observation.logicalTime + 60);
          reference.coordinator.runUntil(target).then(() => {
            observation = reference.coordinator.observePorts();
            advancing = false;
          }).catch(fail);
        }
        if (observation.logicalTime === 3900 && !finalProofBundle && frameReceipt) {
          finalProofBundle = await sealProof({ reference, scene, renderer, frameReceipt, baselineObservation, terminalObservation: observation, identity, inputs });
          document.getElementById('proof-verdict').textContent = `WorldProof ${finalProofBundle.proof.verdict}`;
          document.getElementById('evidence-identity').textContent = `${identity.buildId} / ${finalProofBundle.proof.contentHash}`;
        }
        root.requestAnimationFrame(frame);
      }
      root.requestAnimationFrame(frame);
      return Object.freeze({
        reference,
        scene,
        renderer,
        identity,
        snapshot: () => Object.freeze({ observation, frameReceipt, proof: finalProofBundle?.proof || null, evidence: finalProofBundle?.evidence || null }),
      });
    } catch (error) {
      fail(error);
      throw error;
    }

    function fail(error) {
      status.textContent = error?.message || String(error);
      statusMark.classList.add('failed');
      console.error(error);
    }
  }

  async function sealProof({ reference, scene, renderer, frameReceipt, baselineObservation, terminalObservation, identity, inputs }) {
    const visualReceipt = await renderer.captureVisualEvidence(frameReceipt);
    const residencyReceipt = await runResidencyEvidence(inputs, identity);
    const workerParityReceipt = await runWorkerParityEvidence(inputs, identity);
    const performanceReceipt = await runPerformanceEvidence({ reference, scene, renderer, terminalObservation, identity });
    const replayResult = await reference.coordinator.replay();
    const proof = root.SimulatteRecursiveWorldProof.createProof({
      worldSpec: reference.worldSpec,
      scene,
      coordinatorSnapshot: reference.coordinator.snapshot(),
      ledger: reference.coordinator.getLedger(),
      baselineObservation,
      terminalObservation,
      replayResult,
      frameReceipts: [visualReceipt],
      residencyReceipts: [residencyReceipt],
      workerParityReceipt,
      performanceReceipt,
      buildId: identity.buildId,
      runtimeId: identity.runtimeId,
      deviceClass: identity.deviceClass,
      qualificationLaneId: identity.qualificationLaneId,
      browserMode: identity.browserMode,
    });
    return Object.freeze({
      proof,
      evidence: Object.freeze({
        baselineObservation,
        terminalObservation,
        visualReceipt,
        residencyReceipt,
        workerParityReceipt,
        performanceReceipt,
        replayResult,
      }),
    });
  }

  async function runPerformanceEvidence({ reference, scene, renderer, terminalObservation, identity }) {
    const warmupCount = 30;
    const sampleCount = 240;
    let previousFrameAt = null;
    const compositor = [];
    const cpu = [];
    const gpuCompletion = [];
    for (let index = 0; index < warmupCount + sampleCount; index += 1) {
      const nowMs = await new Promise((resolve) => root.requestAnimationFrame(resolve));
      const started = performance.now();
      const receipt = renderer.render({ observation: terminalObservation, nowMs });
      await renderer.waitForSubmittedWork();
      const completedMilliseconds = performance.now() - started;
      if (index >= warmupCount) {
        if (previousFrameAt !== null) compositor.push(nowMs - previousFrameAt);
        cpu.push(receipt.cpuFrameMilliseconds);
        gpuCompletion.push(completedMilliseconds);
      }
      previousFrameAt = nowMs;
    }
    return createPerformanceReceipt({ reference, scene, identity, compositor, cpu, gpuCompletion });
  }

  function createPerformanceReceipt({ reference, scene, identity, compositor, cpu, gpuCompletion }) {
    const compositorStats = distribution(compositor);
    const cpuStats = distribution(cpu);
    const gpuCompletionStats = distribution(gpuCompletion);
    const frameBudgetMilliseconds = 1000 / 120;
    const refreshEstimateHz = compositorStats.median ? 1000 / compositorStats.median : null;
    const supportsTargetRefresh = Number.isFinite(refreshEstimateHz) && refreshEstimateHz >= 110;
    const worstP95 = Math.max(compositorStats.p95 ?? Infinity, cpuStats.p95 ?? Infinity, gpuCompletionStats.p95 ?? Infinity);
    const laneDeclared = identity.qualificationLaneId !== 'unqualified-interactive';
    const admittedSampleCount = Math.min(compositorStats.count, cpuStats.count, gpuCompletionStats.count);
    const receipt = {
      schema: 'simulatte.recursive-render-performance-receipt/v2',
      status: !laneDeclared || admittedSampleCount < 120 ? 'not-proven' : !supportsTargetRefresh ? 'unsupported' : worstP95 <= frameBudgetMilliseconds ? 'pass' : 'fail',
      worldSpecContentHash: reference.worldSpec.contentHash,
      sceneContentHash: scene.contentHash,
      buildId: identity.buildId,
      runtimeId: identity.runtimeId,
      deviceClass: identity.deviceClass,
      qualificationLaneId: identity.qualificationLaneId,
      browserMode: identity.browserMode,
      targetFramesPerSecond: 120,
      frameBudgetMilliseconds,
      sampleCount: admittedSampleCount,
      compositorSampleCount: compositorStats.count,
      cpuSampleCount: cpuStats.count,
      gpuCompletionSampleCount: gpuCompletionStats.count,
      medianFrameMilliseconds: Math.max(compositorStats.median ?? Infinity, cpuStats.median ?? Infinity, gpuCompletionStats.median ?? Infinity),
      p95FrameMilliseconds: worstP95,
      compositorMedianFrameMilliseconds: compositorStats.median,
      compositorP95FrameMilliseconds: compositorStats.p95,
      cpuMedianFrameMilliseconds: cpuStats.median,
      cpuP95FrameMilliseconds: cpuStats.p95,
      gpuCompletionMedianMilliseconds: gpuCompletionStats.median,
      gpuCompletionP95Milliseconds: gpuCompletionStats.p95,
      gpuCompletionMethod: 'GPUQueue.onSubmittedWorkDone',
      refreshEstimateHz,
      population: '240 consecutive governed frames after 30 warmup frames; each sample waits for submitted GPU work before requesting the next frame.',
      claimBoundary: 'This named browser lane proves completed visible-loop frame work for the bound world and device only; it does not qualify other browsers, displays, worlds, or devices.',
    };
    receipt.contentHash = root.SimulatteRecursiveWorldScene.contentHash(receipt);
    return Object.freeze(receipt);
  }

  function distribution(values) {
    const rows = values.filter((value) => Number.isFinite(value) && value >= 0).sort((left, right) => left - right);
    const percentile = (fraction) => rows[Math.min(rows.length - 1, Math.floor(rows.length * fraction))] ?? null;
    return Object.freeze({ count: rows.length, median: percentile(0.5), p95: percentile(0.95) });
  }

  async function runWorkerParityEvidence(inputs, identity) {
    const pool = root.SimulatteWorkerTaskPool.createWorkerTaskPool({
      workerUrl: '/simulatte/world/simulation-task-worker.js',
      size: 2,
      taskTimeoutMs: 30000,
    });
    try {
      const serial = root.SimulatteEarthVirginiaDatacenterReference.createReferenceWorld(inputs);
      const worker = root.SimulatteEarthVirginiaDatacenterReference.createReferenceWorld({ ...inputs, executionAdapter: pool });
      await serial.coordinator.runUntil(3900);
      await worker.coordinator.runUntil(3900);
      const serialLedger = serial.coordinator.getLedger();
      const workerLedger = worker.coordinator.getLedger();
      const workerReplay = await worker.coordinator.replay();
      const receipt = {
        schema: 'simulatte.recursive-worker-parity-receipt/v1',
        status: JSON.stringify(workerLedger) === JSON.stringify(serialLedger) && workerReplay.status === 'match' ? 'pass' : 'fail',
        worldSpecContentHash: serial.worldSpec.contentHash,
        buildId: identity.buildId,
        runtimeId: identity.runtimeId,
        deviceClass: identity.deviceClass,
        serialLedgerHashes: serialLedger.map((row) => row.contentHash),
        workerLedgerHashes: workerLedger.map((row) => row.contentHash),
        workerReplay,
        workerPoolEvents: pool.snapshot().events,
      };
      receipt.contentHash = root.SimulatteRecursiveWorldScene.contentHash(receipt);
      return Object.freeze(receipt);
    } finally {
      await pool.dispose();
    }
  }

  async function runResidencyEvidence(inputs, identity) {
    const candidate = root.SimulatteEarthVirginiaDatacenterReference.createReferenceWorld(inputs);
    const control = root.SimulatteEarthVirginiaDatacenterReference.createReferenceWorld(inputs);
    const rows = await renderPayloads(candidate.worldSpec);
    const bytesByUrl = new Map(rows.map((row) => [row.url, row.body]));
    const spatial = candidate.createSpatialResidency({
      representations: rows.map(({ body, ...row }) => row),
      tileOptions: {
        fetchBytes: async (url) => bytesByUrl.get(url),
        hashBytes: sha256Hex,
        upload: async (decoded, entry) => ({ resource: decoded, gpuBytes: rows.find((row) => row.id === entry.id).gpuBytesEstimate }),
        maximumCpuBytes: 1024 * 1024,
        maximumGpuBytes: 1024 * 1024,
      },
    });
    await candidate.simulationResidency.runUntil(3540);
    await control.simulationResidency.runUntil(3540);
    candidate.simulationResidency.setInterest({ scopeId: 'virginia-datacenter', visible: false, authority: 'recursive-reference-camera' });
    await spatial.requestRepresentations(['earth-subsea-network-aggregate']);
    await spatial.requestRepresentations(['virginia-datacenter-aggregate'], { replaceIds: ['earth-subsea-network-aggregate'], reason: 'camera-enter-facility' });
    await spatial.requestRepresentations(['virginia-rack-01-detail'], { replaceIds: ['virginia-datacenter-aggregate'], reason: 'camera-enter-rack' });
    await spatial.requestRepresentations(['virginia-node-0001-detail'], { replaceIds: ['virginia-rack-01-detail'], reason: 'camera-enter-node' });
    await spatial.requestRepresentations(['virginia-gpu-0001-detail'], { replaceIds: ['virginia-node-0001-detail'], reason: 'camera-enter-gpu' });
    await candidate.simulationResidency.runUntil(3900);
    await control.simulationResidency.runUntil(3900);
    const candidateLedgerHashes = candidate.coordinator.getLedger().map((row) => row.contentHash);
    const controlLedgerHashes = control.coordinator.getLedger().map((row) => row.contentHash);
    const causalExecutionMatches = JSON.stringify(candidateLedgerHashes) === JSON.stringify(controlLedgerHashes);
    candidate.simulationResidency.setCausalRequirement({
      scopeId: 'virginia-datacenter',
      required: false,
      authority: 'recursive-reference-operator',
      horizon: 'after-causal-settlement@3900',
    });
    const checkpoint = await candidate.simulationResidency.checkpointScope({
      scopeId: 'virginia-datacenter',
      checkpointId: 'browser-residency-datacenter',
      authority: 'recursive-reference-operator',
    });
    const transition = await candidate.simulationResidency.restoreScope({
      scopeId: 'virginia-datacenter',
      checkpointId: 'browser-residency-datacenter',
      authority: 'recursive-reference-operator',
    });
    const spatialSnapshot = spatial.snapshot();
    const receipt = {
      schema: 'simulatte.recursive-residency-proof-receipt/v1',
      status: causalExecutionMatches && transition.continuityClaim === 'exact' ? 'pass' : 'fail',
      worldSpecContentHash: candidate.worldSpec.contentHash,
      buildId: identity.buildId,
      runtimeId: identity.runtimeId,
      deviceClass: identity.deviceClass,
      candidateLedgerHashes,
      controlLedgerHashes,
      simulationResidencyEventHashes: candidate.simulationResidency.getLedger().map((row) => row.contentHash),
      checkpointContentHash: checkpoint.contentHash,
      fidelityTransition: transition,
      finalRepresentationStates: spatialSnapshot.representationStates,
      spatialLogicalTime: spatialSnapshot.simulationResidencyObservation.coordinator.logicalTime,
    };
    receipt.contentHash = root.SimulatteRecursiveWorldScene.contentHash(receipt);
    return Object.freeze(receipt);
  }

  async function renderPayloads(worldSpec) {
    const parentById = {
      'earth-subsea-network-aggregate': null,
      'virginia-datacenter-aggregate': 'earth-subsea-network-aggregate',
      'virginia-rack-01-detail': 'virginia-datacenter-aggregate',
      'virginia-node-0001-detail': 'virginia-rack-01-detail',
      'virginia-gpu-0001-detail': 'virginia-node-0001-detail',
    };
    const rankById = {
      'earth-subsea-network-aggregate': 0,
      'virginia-datacenter-aggregate': 1,
      'virginia-rack-01-detail': 2,
      'virginia-node-0001-detail': 3,
      'virginia-gpu-0001-detail': 4,
    };
    return Promise.all(worldSpec.renderProgram.representations.map(async (representation) => {
      const body = new TextEncoder().encode(JSON.stringify(representation));
      return {
        schema: 'simulatte.recursiveRenderPayload/v1',
        id: representation.id,
        scopeId: representation.scopeId,
        parentRepresentationId: parentById[representation.id],
        fidelityLevelId: representation.fidelityLevelId,
        fidelityRank: rankById[representation.id],
        url: `memory://${representation.id}`,
        sha256: await sha256Hex(body),
        cpuBytesEstimate: body.byteLength,
        gpuBytesEstimate: body.byteLength,
        body,
      };
    }));
  }

  async function sha256Hex(value) {
    const digest = await crypto.subtle.digest('SHA-256', value);
    return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  function bindScaleControls(renderer) {
    document.querySelectorAll('[data-target]').forEach((button) => button.addEventListener('click', () => {
      document.querySelectorAll('[data-target]').forEach((row) => row.classList.toggle('selected', row === button));
      renderer.focus(button.dataset.target, { startedAtMs: performance.now(), durationMs: 720 });
    }));
  }

  function updateMetrics(observation) {
    const value = (id) => observation.records[id]?.value;
    setText('logical-time', `${observation.logicalTime.toLocaleString()} s`);
    setText('metric-capacity', format(value(portIds.capacity), 'Gbps'));
    setText('metric-wan', format(value(portIds.wan), 'Gbps'));
    setText('metric-throughput', format(value(portIds.throughput), 'steps/h'));
    setText('metric-power', format(value(portIds.power), 'kW'));
    setText('metric-temperature', format(value(portIds.temperature), 'C'));
  }

  function updateFrameMeasurement(frameTimes) {
    if (frameTimes.length < 30) return;
    const sorted = [...frameTimes].sort((left, right) => left - right);
    const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
    const median = sorted[Math.floor(sorted.length / 2)];
    setText('frame-measurement', `Visible loop median ${median.toFixed(2)} ms / p95 ${p95.toFixed(2)} ms. Measurement only, no qualification.`);
  }

  async function acquireWebGpuDevice() {
    const adapter = await navigator.gpu?.requestAdapter();
    if (!adapter) throw new Error('recursive_reference_webgpu_unavailable: WebGPU adapter unavailable');
    const adapterInfo = adapter.info || await adapter.requestAdapterInfo?.() || {};
    return Object.freeze({ adapterInfo, device: await adapter.requestDevice() });
  }

  function runtimeIdentity(adapterInfo) {
    const query = new URLSearchParams(root.location.search);
    const hardware = [adapterInfo.vendor, adapterInfo.architecture, adapterInfo.device, adapterInfo.description].filter(Boolean).join(':') || 'unreported-adapter';
    return Object.freeze({
      buildId: query.get('build') || 'local-uncommitted',
      runtimeId: 'simulatte.recursive-world-webgpu/v1',
      deviceClass: `webgpu:${hardware}:${navigator.platform || 'unreported'}:${navigator.userAgent}`,
      qualificationLaneId: query.get('qualificationLane') || 'unqualified-interactive',
      browserMode: query.get('browserMode') || 'interactive',
    });
  }

  async function loadInputs() {
    const names = ['fcc-cable-license-register-2025-v1', 'landing-points-governed-v1', 'cable-corridors-modeled-v1', 'capacity-scenarios-v1', 'demand-scenarios-v1', 'repair-resources-v1', 'model-governance-v1', 'provenance-registry-v1'];
    const rows = await Promise.all(names.map((name) => fetchJson(`/data/subsea-network-global/${name}.json`)));
    return {
      datasets: Object.fromEntries(['fcc', 'landings', 'topology', 'capacities', 'demands', 'repairs', 'governance', 'provenance'].map((key, index) => [key, rows[index]])),
      subseaConfig: await fetchJson('/shared/plugins/subsea-network-global/default-config.json'),
      gpuConfig: await fetchJson('/shared/plugins/gpu-supercluster/default-config.json'),
    };
  }

  async function fetchJson(url) {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`recursive_reference_asset_failed: ${url} returned ${response.status}`);
    return response.json();
  }

  function format(value, unit) { return Number.isFinite(value) ? `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${unit}` : 'Waiting'; }
  function setText(id, value) { document.getElementById(id).textContent = value; }
})(typeof globalThis !== 'undefined' ? globalThis : window);
