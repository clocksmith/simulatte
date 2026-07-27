(function attachOrbitalTransferPlugin(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulattePluginOrbitalTransferPlanner = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createOrbitalTransferPluginApi(root) {
  const PLUGIN_ID = 'orbital-transfer-planner';

  function dependency(name, path) {
    if (typeof module === 'object' && module.exports) return require(path);
    const value = root[name];
    if (!value) throw new Error(`orbital_dependency_missing: ${name}`);
    return value;
  }

  async function activate({ sdk, config, profile, scenario }) {
    const ephemerisApi = dependency('OrbitalTransferEphemeris', './ephemeris.js');
    const launchWindowApi = dependency('OrbitalTransferLaunchWindow', './launch-window.js');
    const metricsApi = dependency('OrbitalTransferMetrics', './metrics.js');
    const radiationApi = dependency('OrbitalTransferRadiation', './radiation.js');
    const presentationApi = dependency('OrbitalTransferPresentation', './presentation.js');
    const hohmannApi = dependency('OrbitalTransferHohmann', './hohmann.js');
    const verifierApi = dependency('OrbitalTransferNBodyVerifier', './n-body-verifier.js');
    const v4 = dependency('OrbitalTransferV4', './v4-contribution.js');

    const ephemerisData = sdk.datasets.require('jpl.horizons.heliocentric-vectors.v1');
    const gmData = sdk.datasets.require('solar.system.gm-constants-de440.v1');
    const radData = sdk.datasets.optional('solar.radiation.snapshot.v1');
    const depotsData = sdk.datasets.optional('orbital.depots.v1');
    const spacecraftData = sdk.datasets.optional('spacecraft.archetypes.v1');
    const sunGm = gmData.bodies.sun.gmAuD2;
    let activeWeights = weightsFrom(profile?.routeObjective || {});
    const inputHashes = Object.freeze({
      ephemeris: sdk.datasets.receipt('jpl.horizons.heliocentric-vectors.v1')?.sha256 || null,
      gravitationalParameters: sdk.datasets.receipt('solar.system.gm-constants-de440.v1')?.sha256 || null,
      radiation: sdk.datasets.receipt('solar.radiation.snapshot.v1')?.sha256 || null,
      depots: sdk.datasets.receipt('orbital.depots.v1')?.sha256 || null,
      spacecraft: sdk.datasets.receipt('spacecraft.archetypes.v1')?.sha256 || null,
    });
    const ephemerisIdentity = Object.freeze({
      frame: ephemerisData.provenance?.query?.referenceSystem || 'undeclared',
      referencePlane: ephemerisData.provenance?.query?.referencePlane || 'undeclared',
      center: ephemerisData.provenance?.query?.center || 'undeclared',
      timeScale: 'TDB',
      outputUnits: ephemerisData.provenance?.query?.outputUnits || 'undeclared',
    });

    let activeScenario = normalizeScenario(scenario, config);
    let current = computeScenario(activeScenario);
    sdk.state.register(reduce, {
      scenarioId: activeScenario.id,
      result: current,
      playback: playbackState('ready', 0),
      lastAction: 'activated',
    });
    appendEphemerisReceipt();

    function appendEphemerisReceipt() {
      sdk.receipts.append({
        schema: 'simulatte.plugin.ephemerisIdentityReceipt.v2',
        datasetId: ephemerisData.id,
        datasetSha256: sdk.datasets.receipt('jpl.horizons.heliocentric-vectors.v1')?.sha256 || null,
        epochStart: ephemerisData.epochStart || ephemerisData.epoch?.start || null,
        epochCount: ephemerisData.epochCount || null,
        frame: ephemerisIdentity.frame,
        referencePlane: ephemerisIdentity.referencePlane,
        center: ephemerisIdentity.center,
        timeScale: ephemerisIdentity.timeScale,
        outputUnits: ephemerisIdentity.outputUnits,
        query: ephemerisData.provenance?.query || null,
        sourceKind: ephemerisData.provenance?.sourceKind || ephemerisData.sourceKind || 'declared_dataset',
        claimBoundary: ephemerisData.provenance?.claimBoundary || 'Pinned ephemeris state vectors; not operational navigation data.',
      });
    }

    function computeScenario(spec, weights = activeWeights) {
      const targetBodyId = targetForScenario(spec.id);
      const searchSpec = searchForTarget(targetBodyId, ephemerisData);
      const search = launchWindowApi.scanLaunchWindow({
        ephemerisDataset: ephemerisData,
        departureBodyId: 'earth',
        arrivalBodyId: targetBodyId,
        gmSunAuD2: sunGm,
        objectiveWeights: {
          deltaV: weights.deltaV,
          timeOfFlight: weights.timeOfFlight,
        },
        bodyConstants: bodyConstants(gmData),
        lambertOptions: {
          prograde: config?.solver?.prograde !== false,
          maxIterations: Number(config?.solver?.maxIterations ?? 96),
          toleranceDays: Number(config?.solver?.toleranceDays ?? 1e-8),
        },
        ...searchSpec,
      });
      let selected = search.selected;
      let fallback = null;
      if (!selected) {
        const earth = ephemerisApi.getBodyState(ephemerisData, 'earth', 0, { clamp: true });
        const target = ephemerisApi.getBodyState(ephemerisData, targetBodyId, 0, { clamp: true });
        fallback = hohmannApi.createScreeningBaseline({
          r1Au: Math.hypot(...earth.positionAu),
          r2Au: Math.hypot(...target.positionAu),
          gmSunAuD2: sunGm,
          fallbackReason: {
            code: 'no_converged_lambert_candidate',
            attempted: search.search.attempted,
            rejectionCounts: search.search.rejectionCounts,
            gridBounds: gridBounds(search.search),
          },
          trajectory: [earth.positionAu, target.positionAu],
        });
      }
      const verification = selected
        ? verifierApi.verifyCandidate({
          candidate: selected,
          ephemerisDataset: ephemerisData,
          gmData,
          departureBodyId: 'earth',
          arrivalBodyId: targetBodyId,
          stepDays: Number(config?.verification?.stepDays ?? 0.5),
          positionToleranceKm: Number(config?.verification?.positionToleranceKm ?? 1000000),
          velocityToleranceKmS: Number(config?.verification?.velocityToleranceKmS ?? 0.5),
        })
        : null;
      const tofDays = selected?.tofDays ?? fallback.timeOfFlightDays;
      const spacecraft = spacecraftData?.archetypes?.[config?.defaultArchetype || 'cargo-freighter-v1'];
      const radiation = radiationApi.computeExposure(tofDays, radData, spacecraft?.radiationShieldingGcm2 || 15);
      const baseMetrics = selected ? metricsApi.summarize(search, radiation) : Object.freeze({
        schema: 'simulatte.orbitalTransferMetrics.v1', solutionCount: 0, attemptedCount: search.search.attempted,
        departureEpoch: null, arrivalEpoch: null, timeOfFlightDays: tofDays,
        totalDeltaVKmS: fallback.totalDeltaVKmS, radiationExposureUnits: radiation.shieldedProtonUnits,
        algorithm: fallback.method, claimBoundary: search.claimBoundary,
      });
      const metrics = Object.freeze({
        ...baseMetrics,
        verificationStatus: verification?.claimGate.status || 'screening_baseline_only',
        endpointPositionErrorKm: verification?.endpoint.positionErrorKm ?? null,
        endpointVelocityErrorKmS: verification?.endpoint.velocityErrorKmS ?? null,
      });
      const solverReceipt = Object.freeze({
        schema: 'simulatte.orbitalSolverReceipt.v2',
        inputHashes,
        ephemeris: ephemerisIdentity,
        departureBodyId: 'earth',
        arrivalBodyId: targetBodyId,
        departureEpoch: selected?.departureEpoch || null,
        arrivalEpoch: selected?.arrivalEpoch || null,
        branch: selected?.transfer.branch || null,
        revolutionCount: selected?.transfer.revolutionCount ?? 0,
        gridBounds: gridBounds(search.search),
        iterations: selected?.transfer.iterations || null,
        maxIterations: selected?.transfer.maxIterations || search.search.lambertOptions.maxIterations,
        toleranceDays: selected?.transfer.toleranceDays || search.search.lambertOptions.toleranceDays,
        residualDays: selected?.transfer.residualDays ?? null,
        totalDeltaVKmS: metrics.totalDeltaVKmS,
        selectedCandidateId: selected?.id || null,
        rejectedCandidateCount: search.search.failed,
        rejectionCounts: search.search.rejectionCounts,
        rejectedCandidates: search.rejectedCandidates,
        fallbackReason: fallback?.reason || null,
      });
      const claimGate = verification?.claimGate || Object.freeze({
        status: 'screening_baseline_only',
        allowed: ['circular coplanar Hohmann screening comparison'],
        blocked: ['trajectory approximation claim', 'validated flight path', 'navigation product', 'certification evidence'],
      });
      return Object.freeze({
        schema: 'simulatte.orbitalScenarioResult.v2',
        scenarioId: spec.id, seed: spec.seed || null, targetBodyId,
        search, selected, fallback, metrics, radiation, verification, solverReceipt, claimGate,
        depots: depotsData?.depots || [],
        claimBoundary: claimGate.status === 'verified_screening_approximation'
          ? 'Deterministic mission-design screening passed the declared independent propagation tolerances. It is still not an operational trajectory, navigation product, or certification.'
          : 'Deterministic mission-design screening only. Verification did not establish a validated flight path, navigation product, or certification.',
      });
    }

    function setScenario(nextScenario) {
      activeScenario = normalizeScenario(nextScenario, config);
      current = computeScenario(activeScenario);
      sdk.events.propose({ pluginId: PLUGIN_ID, kind: `${PLUGIN_ID}.scenario-computed`, scenarioId: activeScenario.id, result: current });
      return current;
    }

    function contributeRequest({ sourceText, mission = null }) {
      if (!/\b(?:orbital|transfer|launch\s+window|delta[- ]?v|earth\s+to\s+(?:mars|moon|venus|jupiter)|lambert|hohmann)\b/i.test(sourceText || '')) return null;
      if (!mission) return { recognized: true, obligations: [], unresolved: [] };
      return {
        recognized: true,
        obligations: [
          { id: `${PLUGIN_ID}:solution:${activeScenario.id}`, kind: 'orbital_solution', required: true },
          { id: `${PLUGIN_ID}:ephemeris:${activeScenario.id}`, kind: 'ephemeris_identity', required: true },
        ],
        unresolved: [],
      };
    }

    function appendTransferReceipt(kind = 'plan') {
      sdk.receipts.append({
        schema: 'simulatte.plugin.orbitalTransferReceipt.v2',
        scenarioId: current.scenarioId,
        kind,
        targetBodyId: current.targetBodyId,
        selectedCandidateId: current.selected?.id || null,
        departureEpoch: current.metrics.departureEpoch,
        arrivalEpoch: current.metrics.arrivalEpoch,
        timeOfFlightDays: current.metrics.timeOfFlightDays,
        totalDeltaVKmS: current.metrics.totalDeltaVKmS,
        radiationExposureUnits: current.metrics.radiationExposureUnits,
        algorithm: current.metrics.algorithm,
        searchAttempted: current.metrics.attemptedCount,
        searchSolutions: current.metrics.solutionCount,
        solver: current.solverReceipt,
        verification: current.verification,
        claimGate: current.claimGate,
        claimBoundary: current.claimBoundary,
      });
    }

    function handleAction(actionId, context = {}) {
      if (actionId === 'scenario.run' || actionId === 'plan.transfer') {
        const values = context.values || {};
        if (values.phase === 'start' || actionId === 'plan.transfer') {
          activeWeights = weightsFrom({
            deltaV: values.deltaVWeight ?? activeWeights.deltaV,
            timeOfFlight: values.timeWeight ?? activeWeights.timeOfFlight,
          });
          current = computeScenario(activeScenario, activeWeights);
          sdk.events.propose({
            pluginId: PLUGIN_ID,
            kind: actionId === 'plan.transfer'
              ? `${PLUGIN_ID}.plan-recorded`
              : `${PLUGIN_ID}.playback-started`,
            scenarioId: activeScenario.id,
            actionId,
            result: current,
          });
          if (actionId === 'scenario.run') {
            return playbackResult(sdk.state.read());
          }
        }
        if (values.phase === 'step') {
          const state = sdk.state.read();
          if (state.playback.status !== 'running') return playbackResult(state);
          const cursor = Math.min(TRANSFER_TIMELINE.length - 1, state.playback.cursor + 1);
          sdk.events.propose({
            pluginId: PLUGIN_ID,
            kind: `${PLUGIN_ID}.playback-advanced`,
            cursor,
          });
          const next = sdk.state.read();
          if (next.playback.status === 'settled') appendTransferReceipt('scenario.run');
          return playbackResult(next);
        }
        appendTransferReceipt(actionId);
        return {
          status: 'settled',
          currentStep: TRANSFER_TIMELINE.length - 1,
          totalSteps: TRANSFER_TIMELINE.length - 1,
          metrics: current.metrics,
        };
      }
      if (actionId === 'counterfactual.compare') {
        const earth = ephemerisApi.getBodyState(
          ephemerisData,
          'earth',
          current.selected?.departureDay ?? 0,
          { clamp: true }
        );
        const target = ephemerisApi.getBodyState(
          ephemerisData,
          current.targetBodyId,
          current.selected?.arrivalDay ?? 0,
          { clamp: true }
        );
        const baseline = hohmannApi.computeHohmann(
          Math.hypot(...earth.positionAu),
          Math.hypot(...target.positionAu),
          sunGm,
        );
        const deltaDvKmS = current.metrics.totalDeltaVKmS - baseline.totalDvKmS;
        const deltaDays = current.metrics.timeOfFlightDays - baseline.timeOfFlightDays;
        sdk.receipts.append({
          schema: 'simulatte.plugin.orbitalCounterfactualReceipt.v2',
          baselineId: `earth-${current.targetBodyId}-circular-coplanar-hohmann-screening`,
          baselineAssumptions: ['circular endpoint orbits', 'coplanar impulsive burns', 'two-body solar gravity'],
          counterfactualScenarioId: current.scenarioId,
          deltaDvKmS, deltaDays,
          claimBoundary: `Comparison against a circular coplanar Earth–${current.targetBodyId} Hohmann baseline.`,
        });
        return {
          status: 'settled',
          deltaDvKmS,
          deltaDays,
          comparisonId: `${current.scenarioId}:selected-vs-hohmann`,
          comparisonBranches: {
            baseline: {
              totalDeltaVKmS: baseline.totalDvKmS,
              timeOfFlightDays: baseline.timeOfFlightDays,
            },
            intervention: {
              totalDeltaVKmS: current.metrics.totalDeltaVKmS,
              timeOfFlightDays: current.metrics.timeOfFlightDays,
            },
          },
        };
      }
      return { status: 'refused', reason: 'unknown_action', actionId };
    }

    function settle() {
      const state = sdk.state.read();
      const result = state.result;
      const playbackSettled = state.playback?.status === 'settled';
      const hasSolution = Boolean(result.selected || result.fallback);
      const ephemerisHash = sdk.datasets.receipt('jpl.horizons.heliocentric-vectors.v1')?.sha256 || null;
      const verified = result.verification?.accepted === true;
      const totalDeltaVKmS = result.metrics.totalDeltaVKmS;
      const screeningEnvelopeMaximumKmS = 20;
      const hasFiniteDeltaV = Number.isFinite(totalDeltaVKmS) && totalDeltaVKmS >= 0;
      return {
        obligationResults: [
          { obligationId: `${PLUGIN_ID}:solution:${state.scenarioId}`, status: hasSolution && playbackSettled ? 'settled' : 'unmet', evidence: { solutionCount: result.metrics.solutionCount, fallback: Boolean(result.fallback), playbackSettled } },
          { obligationId: `${PLUGIN_ID}:ephemeris:${state.scenarioId}`, status: ephemerisHash ? 'settled' : 'unmet', evidence: { sha256: ephemerisHash, ...ephemerisIdentity } },
          { obligationId: `${PLUGIN_ID}:independent-verification`, status: verified ? 'settled' : 'unmet', evidence: { verification: result.verification, claimGate: result.claimGate } },
          {
            obligationId: `${PLUGIN_ID}:dv-envelope`,
            status: hasFiniteDeltaV ? 'settled' : 'unmet',
            evidence: {
              totalDeltaVKmS,
              maximumKmS: screeningEnvelopeMaximumKmS,
              withinScreeningEnvelope: hasFiniteDeltaV && totalDeltaVKmS <= screeningEnvelopeMaximumKmS,
              interpretation: 'The envelope is a reported screening target, not a runtime-completion criterion.',
            },
          },
        ],
        stateIdentity: `${state.scenarioId}:${result.metrics.algorithm}:${result.metrics.departureEpoch || 'fallback'}`,
        losses: result.claimGate.status === 'verified_screening_approximation' ? [] : [{
          kind: 'trajectory_claim_gated',
          claimGate: result.claimGate,
        }],
      };
    }

    function view() {
      const state = sdk.state.read();
      const result = state.result;
      const playback = state.playback || playbackState('settled', TRANSFER_TIMELINE.length - 1);
      const selectedVisible = playback.cursor >= 3;
      const verificationVisible = playback.cursor >= 4;
      const arrivalVisible = playback.cursor >= TRANSFER_TIMELINE.length - 1;
      return [
        {
          slot: 'inspector', title: 'Orbital Transfer Planner',
          rows: [
            { label: 'Solver stage', value: playback.stage.label },
            { label: 'What changed', value: playback.stage.narrative },
            { label: 'Progress', value: `${playback.cursor} / ${playback.totalSteps}` },
            { label: 'Scenario', value: result.scenarioId },
            { label: 'Target', value: result.targetBodyId.toUpperCase() },
            ...(playback.cursor >= 1 ? [{ label: 'Search', value: `${result.metrics.solutionCount}/${result.metrics.attemptedCount} converged` }] : []),
            ...(playback.cursor >= 2 ? [{ label: 'Rejected', value: `${result.solverReceipt.rejectedCandidateCount} candidates · ${rejectionSummary(result.solverReceipt.rejectionCounts)}` }] : []),
            ...(selectedVisible ? [
              { label: 'Departure', value: result.metrics.departureEpoch || 'circular fallback' },
              { label: 'Arrival', value: result.metrics.arrivalEpoch || 'circular fallback' },
              { label: 'Time of flight', value: `${result.metrics.timeOfFlightDays.toFixed(2)} days` },
              { label: 'Total Δv', value: `${result.metrics.totalDeltaVKmS.toFixed(3)} km/s` },
              { label: 'Method', value: result.metrics.algorithm },
              { label: 'Lambert branch / revolutions', value: `${result.solverReceipt.branch || 'n/a'} / ${result.solverReceipt.revolutionCount}` },
              { label: 'Iterations / residual', value: `${result.solverReceipt.iterations ?? 'n/a'} / ${result.solverReceipt.residualDays ?? 'n/a'} days` },
            ] : []),
            ...(verificationVisible ? [
              { label: 'Independent propagation', value: result.metrics.verificationStatus },
              { label: 'Endpoint error', value: result.verification ? `${result.metrics.endpointPositionErrorKm.toFixed(3)} km · ${result.metrics.endpointVelocityErrorKmS.toFixed(6)} km/s` : 'not applicable to screening baseline' },
            ] : []),
            ...(arrivalVisible ? [{ label: 'Radiation proxy', value: `${result.metrics.radiationExposureUnits.toFixed(2)} shielded proton units` }] : []),
          ],
          actions: [],
        },
      ];
    }

    function present() {
      const state = sdk.state.read();
      const result = state.result;
      const playback = state.playback || playbackState('settled', TRANSFER_TIMELINE.length - 1);
      const fullTrajectory = result.verification?.trajectory?.map((row) => row.positionAu)
        || result.selected?.trajectory
        || result.fallback?.trajectory
        || [];
      const trajectory = playback.cursor >= 3 ? fullTrajectory : [];
      const flightFraction = flightProgress(playback.cursor);
      const ephemerisDay = displayEphemerisDay(result, flightFraction, playback.cursor >= 3);
      return presentationApi.createPresentation(ephemerisData, {
        trajectory,
        actorPosition: pointAlong(trajectory, flightFraction),
        flightFraction,
        ephemerisDay,
        selectedBodyIds: ['earth', result.targetBodyId],
      });
    }

    function contributeV4() {
      const datasetIds = [
        'jpl.horizons.heliocentric-vectors.v1',
        'solar.system.gm-constants-de440.v1',
        'solar.radiation.snapshot.v1',
        'orbital.depots.v1',
        'spacecraft.archetypes.v1',
      ];
      return v4.createContribution({
        result: sdk.state.read().result,
        playback: sdk.state.read().playback,
        ephemerisData,
        profileWeights: { deltaV: activeWeights.deltaV, timeOfFlight: activeWeights.timeOfFlight },
        datasetReceipts: datasetIds.map((id) => ({
          id,
          receipt: sdk.datasets.receipt(id),
          value: sdk.datasets.optional(id),
        })),
      });
    }

    const capabilities = Object.freeze({
      'simulation.orbital-transfer.v1': () => sdk.state.read().result,
      'simulation.orbital-kinetics.v1': () => sdk.state.read().result,
      'field.solar-radiation.v1': () => sdk.state.read().result.radiation,
    });

    return Object.freeze({ id: PLUGIN_ID, contributeRequest, contributeV4, setScenario, handleAction, settle, view, present, reduce, capabilities, dispose() {} });
  }

  function normalizeScenario(value, config) {
    if (typeof value === 'string') return { id: value, seed: value };
    const id = value?.scenarioId || value?.id || config?.defaultScenarioId || 'earth-mars-window';
    return Object.freeze({ id, seed: value?.seed || id, label: value?.label || id });
  }

  function weightsFrom(value) {
    const deltaV = Number(value.deltaV ?? 1);
    const timeOfFlight = Number(value.timeOfFlight ?? value.timeOfFlightDays ?? 0.01);
    if (!Number.isFinite(deltaV) || deltaV < 0 || deltaV > 10) {
      throw new Error('orbital_control_invalid: deltaVWeight must be from 0 to 10');
    }
    if (!Number.isFinite(timeOfFlight) || timeOfFlight < 0 || timeOfFlight > 1) {
      throw new Error('orbital_control_invalid: timeWeight must be from 0 to 1');
    }
    return Object.freeze({ deltaV, timeOfFlight });
  }
  function targetForScenario(id) {
    const text = String(id || '').toLowerCase();
    if (text.includes('moon') || text.includes('l1')) return 'moon';
    if (text.includes('venus')) return 'venus';
    if (text.includes('jupiter')) return 'jupiter';
    return 'mars';
  }
  function searchForTarget(target, dataset) {
    const maximumDay = Math.max(0, Number(dataset?.epochCount || 730) - 1);
    if (target === 'moon') return { departureStartDay: 0, departureEndDay: Math.max(0, Math.min(60, maximumDay - 20)), departureStepDays: 1, tofMinDays: 2, tofMaxDays: 18, tofStepDays: 1 };
    if (target === 'venus') return { departureStartDay: 0, departureEndDay: Math.max(0, Math.min(300, maximumDay - 250)), departureStepDays: 5, tofMinDays: 80, tofMaxDays: 240, tofStepDays: 5 };
    if (target === 'jupiter') return { departureStartDay: 0, departureEndDay: Math.max(0, Math.min(200, maximumDay - 500)), departureStepDays: 10, tofMinDays: 350, tofMaxDays: Math.min(700, maximumDay), tofStepDays: 10 };
    return { departureStartDay: 0, departureEndDay: Math.max(0, Math.min(300, maximumDay - 450)), departureStepDays: 5, tofMinDays: 120, tofMaxDays: 420, tofStepDays: 5 };
  }
  function bodyConstants(gmData) {
    const radiiKm = { earth: 6378.137, moon: 1737.4, mars: 3396.19, venus: 6051.8, jupiter: 71492 };
    return Object.fromEntries(Object.entries(gmData.bodies || {}).map(([id, row]) => [id, { ...row, radiusKm: radiiKm[id] || null }]));
  }
  function gridBounds(search) {
    return Object.freeze({
      departureDay: {
        minimum: search.departureStartDay,
        maximum: search.departureEndDay,
        step: search.departureStepDays,
      },
      timeOfFlightDays: {
        minimum: search.tofMinDays,
        maximum: search.tofMaxDays,
        step: search.tofStepDays,
      },
      attempted: search.attempted,
    });
  }
  function reduce(state, event) {
    if (event.kind === `${PLUGIN_ID}.scenario-computed`) {
      return {
        ...state,
        scenarioId: event.scenarioId,
        result: event.result,
        playback: playbackState('ready', 0),
        lastAction: 'scenario',
      };
    }
    if (event.kind === `${PLUGIN_ID}.playback-started`) {
      return {
        ...state,
        scenarioId: event.scenarioId,
        result: event.result,
        playback: playbackState('running', 0),
        lastAction: event.actionId,
      };
    }
    if (event.kind === `${PLUGIN_ID}.playback-advanced`) {
      return {
        ...state,
        playback: playbackState(
          event.cursor === TRANSFER_TIMELINE.length - 1 ? 'settled' : 'running',
          event.cursor
        ),
      };
    }
    if (event.kind === `${PLUGIN_ID}.plan-recorded`) {
      return {
        ...state,
        scenarioId: event.scenarioId || state.scenarioId,
        result: event.result,
        playback: playbackState('settled', TRANSFER_TIMELINE.length - 1),
        lastAction: event.actionId,
      };
    }
    return state;
  }

  const TRANSFER_TIMELINE = Object.freeze([
    Object.freeze({ id: 'ready', label: 'Search prepared', narrative: 'The bounded departure and flight-time grid is ready.' }),
    Object.freeze({ id: 'grid', label: 'Launch window scanned', narrative: 'Every declared candidate in the bounded grid has been attempted.' }),
    Object.freeze({ id: 'rejections', label: 'Candidates classified', narrative: 'Numerical failures and rejected candidates are preserved by reason.' }),
    Object.freeze({ id: 'selected', label: 'Transfer selected', narrative: 'The weighted objective selects a Lambert solution or named Hohmann screening fallback.' }),
    Object.freeze({ id: 'verified', label: 'Trajectory verified', narrative: 'Independent propagation measures endpoint position and velocity residuals.' }),
    Object.freeze({ id: 'flight-quarter', label: 'Modeled coast · 25%', narrative: 'The display advances along the selected screening trajectory.' }),
    Object.freeze({ id: 'flight-half', label: 'Modeled coast · 50%', narrative: 'Elapsed flight and heliocentric position advance together.' }),
    Object.freeze({ id: 'flight-three-quarter', label: 'Modeled coast · 75%', narrative: 'The spacecraft approaches the target epoch.' }),
    Object.freeze({ id: 'arrival', label: 'Screening arrival settled', narrative: 'Endpoint error, Δv, flight time, and claim gates are now final.' }),
  ]);

  function playbackState(status, cursor) {
    return Object.freeze({
      status,
      cursor,
      currentStep: cursor,
      totalSteps: TRANSFER_TIMELINE.length - 1,
      stage: TRANSFER_TIMELINE[cursor],
    });
  }

  function playbackResult(state) {
    return {
      status: state.playback.status,
      currentStep: state.playback.cursor,
      totalSteps: state.playback.totalSteps,
      stage: state.playback.stage,
      metrics: state.playback.status === 'settled' ? state.result.metrics : null,
    };
  }

  function flightProgress(cursor) {
    if (cursor < 5) return null;
    return [0.25, 0.5, 0.75, 1][Math.min(3, cursor - 5)];
  }

  function pointAlong(points, fraction) {
    if (!Number.isFinite(fraction) || !Array.isArray(points) || points.length < 2) return null;
    const scaled = Math.min(points.length - 1, Math.max(0, (points.length - 1) * fraction));
    const lowerIndex = Math.floor(scaled);
    const upperIndex = Math.min(points.length - 1, lowerIndex + 1);
    const ratio = scaled - lowerIndex;
    return points[lowerIndex].map((value, index) => (
      value + (points[upperIndex][index] - value) * ratio
    ));
  }

  function displayEphemerisDay(result, flightFraction, selectionVisible) {
    if (!result.selected || !selectionVisible) return 0;
    if (!Number.isFinite(flightFraction)) return result.selected.departureDay;
    return result.selected.departureDay + result.selected.tofDays * flightFraction;
  }

  function rejectionSummary(counts) {
    const entries = Object.entries(counts || {}).filter(([, value]) => value > 0);
    return entries.length ? entries.map(([key, value]) => `${key} ${value}`).join(', ') : 'none';
  }

  const datasetValidators = Object.freeze({
    'simulatte.jplHorizonsHeliocentricVectors.v1': (value) => { if (!value?.bodies?.earth || !value?.bodies?.mars) throw new Error('ephemeris missing Earth or Mars'); return value; },
    'simulatte.solarSystemGmConstants.v1': (value) => { if (!(value?.bodies?.sun?.gmAuD2 > 0)) throw new Error('solar GM missing'); return value; },
    'simulatte.solarRadiationSnapshot.v1': (value) => { if (!Number.isFinite(value?.baselineFluxPfu)) throw new Error('radiation baseline missing'); return value; },
    'simulatte.orbitalDepots.v1': (value) => { if (!Array.isArray(value?.depots)) throw new Error('depots missing'); return value; },
    'simulatte.spacecraftArchetypes.v1': (value) => { if (!value?.archetypes || typeof value.archetypes !== 'object') throw new Error('spacecraft archetypes missing'); return value; },
  });

  return Object.freeze({ activate, datasetValidators });
});
