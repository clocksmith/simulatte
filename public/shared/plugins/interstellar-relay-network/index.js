(function attachInterstellarRelayPlugin(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulattePluginInterstellarRelayNetwork = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createInterstellarRelayPluginApi(root) {
  const PLUGIN_ID = 'interstellar-relay-network';
  const PC_TO_METERS = 3.08567758149137e16;

  function dependency(globalName, path) {
    const value = typeof module === 'object' && module.exports ? require(path) : root[globalName];
    if (!value) throw new Error(`interstellar_dependency_missing: ${globalName}`);
    return value;
  }

  async function activate({ sdk, config, profile, scenario }) {
    const stellarApi = dependency('InterstellarStellarState', './stellar-state.js');
    const contactApi = dependency('InterstellarContactScheduler', './contact-scheduler.js');
    const linkApi = dependency('InterstellarOpticalLinkBudget', './optical-link-budget.js');
    const packetApi = dependency('InterstellarPacketQueue', './packet-queue.js');
    const metricsApi = dependency('InterstellarMetrics', './metrics.js');
    const presentationApi = dependency('InterstellarRelayPresentation', './presentation.js');
    const v4Api = dependency('InterstellarRelayV4', './v4-contribution.js');

    const starsData = sdk.datasets.require('gaia.dr3.nearby-stars.v2');
    const hardwareData = sdk.datasets.require('relay.hardware.archetypes.v2');
    const scenariosData = sdk.datasets.require('interstellar.scenario.network.v2');
    const modelsData = sdk.datasets.require('interstellar.relay.models.v1');
    const starsById = new Map((starsData.stars || []).map((row) => [row.sourceId, row]));
    let activeScenario = normalizeScenario(scenario, config);
    let current = await computeScenario(activeScenario);
    sdk.state.register(reduce, {
      scenarioId: current.scenarioId,
      result: current,
      progressive: current.schedule.initialState,
      comparison: null,
      lastAction: 'activated',
    });
    appendDataReceipts();
    appendScenarioReceipt(current);

    async function computeScenario(spec, controlValues = {}, branch = 'intervention') {
      const scenarioRow = resolveScenario(scenariosData, spec.id);
      const controls = resolveControls(config, scenarioRow, controlValues, hardwareData);
      const selectedPath = branch === 'baseline' ? scenarioRow.baselineRelayHops : scenarioRow.relayHops;
      const selectedTransceiverId = branch === 'baseline'
        ? scenarioRow.baselineTransceiverId
        : controls.transceiverId;
      const transceiver = hardwareData.archetypes[selectedTransceiverId];
      if (!transceiver) throw new Error(`interstellar_transceiver_missing: ${selectedTransceiverId}`);
      const stellarStates = (starsData.stars || []).map((star) => (
        stellarApi.convertEquatorialToCartesianPc(star, controls.targetEpochYear)
      ));
      const statesById = new Map(stellarStates.map((state) => [state.sourceId, state]));
      selectedPath.forEach((id) => {
        if (!statesById.has(id)) throw new Error(`interstellar_path_star_missing: ${id}`);
      });
      const packetBits = controls.packetBytes * 8;
      const linkBudgets = selectedPath.slice(0, -1).map((fromId, index) => {
        const from = statesById.get(fromId);
        const to = statesById.get(selectedPath[index + 1]);
        const distanceMeters = distance(from.positionPc, to.positionPc) * PC_TO_METERS;
        const uncertaintyMeters = endpointDistanceUncertaintyPc(from, to) * PC_TO_METERS;
        return linkApi.computeLinkBudget(distanceMeters, transceiver, {
          packetBits,
          distanceLowerMeters: Math.max(1, distanceMeters - uncertaintyMeters),
          distanceUpperMeters: distanceMeters + uncertaintyMeters,
          sourceRowIds: [...from.sourceRowIds, ...to.sourceRowIds],
        });
      });
      const schedule = contactApi.scheduleRelay({
        relayPath: selectedPath,
        statesById,
        linkBudgets,
        packetBits,
        scheduler: sdk.scheduler,
        startEpochIso: controls.startEpochIso,
        processingDelayHours: controls.processingDelayHours,
      });
      const packet = await packetApi.createPacket({
        receiptTools: sdk.receipts,
        packetId: `packet:${spec.id}:${branch}:0`,
        sequence: 0,
        payload: `interstellar-relay-payload:${spec.seed}:${branch}`,
        payloadBytes: controls.packetBytes,
        sourceId: scenarioRow.sourceId,
        destinationId: scenarioRow.targetId,
        relayPath: selectedPath,
        createdAt: schedule.startEpochIso,
        schedule,
      });
      const relayStates = selectedPath.map((id) => statesById.get(id));
      const effectiveControls = Object.freeze({ ...controls, transceiverId: selectedTransceiverId });
      const dataReceipts = createDataReceipts();
      const modelReceipts = createModelReceipts(modelsData, effectiveControls, selectedTransceiverId);
      const omissions = Object.freeze(modelsData.omissions.map((row) => Object.freeze({ ...row })));
      const reliabilityScope = Object.freeze({
        statement: 'The packet-success estimate is conditional on continuous contact and hypothetical infrastructure.',
        conditionalOn: Object.freeze(modelsData.reliabilityScope.conditionalOn.slice()),
        excludes: Object.freeze(modelsData.reliabilityScope.excludes.slice()),
      });
      const metrics = metricsApi.summarize({
        schedule,
        linkBudgets,
        packet,
        omissions,
        reliabilityScope,
        evidenceReferences: [
          ...relayStates.flatMap((state) => state.sourceRowIds),
          ...dataReceipts.map((receipt) => `${receipt.datasetId}:${receipt.sha256 || 'hash-missing'}`),
          ...modelReceipts.map((receipt) => receipt.modelId),
        ],
      });
      return Object.freeze({
        schema: 'simulatte.interstellarRelayResult.v2',
        scenarioId: spec.id,
        branch,
        datasetScenarioId: scenarioRow.id,
        seed: spec.seed,
        targetEpochYear: controls.targetEpochYear,
        scenario: Object.freeze({ ...scenarioRow, relayHops: Object.freeze(selectedPath.slice()) }),
        controls: effectiveControls,
        schedule,
        linkBudgets: Object.freeze(linkBudgets),
        packet,
        metrics,
        stellarStates: Object.freeze(stellarStates),
        relayStates: Object.freeze(relayStates),
        dataReceipts,
        modelReceipts,
        omissions,
        reliabilityScope,
        comparisonDefinition: createComparisonDefinition(scenarioRow, spec.seed, omissions, reliabilityScope),
        truth: Object.freeze({
          origin: 'simulated',
          temporalStatus: 'forecast',
          uncertainty: metrics.truth.uncertainty,
        }),
        claimBoundary: 'Measured Gaia DR3 astrometry drives a hypothetical optical store-and-forward experiment. No relay terminal, packet traffic, continuous contact, or operating interstellar network is observed.',
      });
    }

    function createDataReceipts() {
      return Object.freeze([
        dataReceipt('gaia.dr3.nearby-stars.v2', starsData, starsData.provenance, starsData.stars.map((row) => row.sourceRowId)),
        dataReceipt('relay.hardware.archetypes.v2', hardwareData, hardwareData.provenance, Object.keys(hardwareData.archetypes).map((id) => `relay.hardware.archetypes.v2:${id}`)),
        dataReceipt('interstellar.scenario.network.v2', scenariosData, scenariosData.provenance, scenariosData.scenarios.map((row) => `interstellar.scenario.network.v2:${row.id}`)),
        dataReceipt('interstellar.relay.models.v1', modelsData, { ...modelsData.provenance, truth: modeledTruth('Catalog of declared equations') }, modelsData.models.map((row) => `interstellar.relay.models.v1:${row.id}`)),
      ]);
    }

    function dataReceipt(datasetId, dataset, provenance, sourceRowIds) {
      const hostReceipt = sdk.datasets.receipt(datasetId);
      return Object.freeze({
        schema: 'simulatte.dataReceipt.v1',
        datasetId,
        contentVersion: dataset.contentVersion,
        sha256: hostReceipt?.sha256 || null,
        sourceRowIds: Object.freeze(sourceRowIds),
        retrievalAt: provenance?.retrievalAt || null,
        license: provenance?.license || null,
        coverage: provenance?.coverage || null,
        sourceArtifacts: Object.freeze([
          ...(provenance?.sourceArtifact ? [provenance.sourceArtifact] : []),
          ...(provenance?.sourceArtifacts || []),
        ].map((row) => Object.freeze({ ...row }))),
        immutableSourceHashes: Object.freeze([
          ...(hostReceipt?.sha256 ? [{ kind: 'governed-output', sha256: hostReceipt.sha256 }] : []),
          ...(provenance?.sourceArtifact?.sha256 ? [{ kind: 'source-artifact', sha256: provenance.sourceArtifact.sha256 }] : []),
          ...(provenance?.sourceArtifacts || []).filter((row) => row.sha256).map((row) => ({
            kind: `source-artifact:${row.id}`,
            sha256: row.sha256,
          })),
        ].map((row) => Object.freeze(row))),
        truth: provenance?.truth || (datasetId.startsWith('gaia.') ? observedTruth() : scenarioTruth('Scenario artifact')),
      });
    }

    function createModelReceipts(dataset, controls, transceiverId) {
      const usedIds = new Set([
        'linear-space-motion-v2',
        'finite-light-time-v2',
        'diffraction-photon-budget-v2',
        'deterministic-store-forward-v2',
      ]);
      return Object.freeze(dataset.models.filter((row) => usedIds.has(row.id)).map((row) => Object.freeze({
        schema: 'simulatte.modelReceipt.v1',
        modelId: row.id,
        equation: row.equation,
        citation: row.citation,
        parameters: Object.freeze({
          targetEpochYear: controls.targetEpochYear,
          startEpochIso: controls.startEpochIso,
          processingDelayHours: controls.processingDelayHours,
          packetBytes: controls.packetBytes,
          transceiverId,
        }),
        assumptions: Object.freeze(row.assumptions.slice()),
        omissions: Object.freeze((row.omissionIds || []).map((id) => {
          const omission = dataset.omissions.find((candidate) => candidate.id === id);
          if (!omission) throw new Error(`interstellar_model_omission_missing: ${row.id}:${id}`);
          return Object.freeze({ ...omission });
        })),
        reliabilityScope: row.id === 'diffraction-photon-budget-v2' || row.id === 'deterministic-store-forward-v2'
          ? Object.freeze({
            conditionalOn: Object.freeze(dataset.reliabilityScope.conditionalOn.slice()),
            excludes: Object.freeze(dataset.reliabilityScope.excludes.slice()),
          })
          : null,
        validation: row.validation,
        truth: row.truth,
      })));
    }

    function appendDataReceipts() {
      current.dataReceipts.forEach((receipt) => sdk.receipts.append(receipt));
    }

    function appendScenarioReceipt(result) {
      sdk.receipts.append({
        schema: 'simulatte.plugin.interstellarScenarioReceipt.v2',
        scenarioId: result.scenarioId,
        datasetScenarioId: result.datasetScenarioId,
        seed: result.seed,
        relayPath: result.scenario.relayHops,
        dataReceipts: result.dataReceipts,
        modelReceiptIds: result.modelReceipts.map((row) => row.modelId),
        eventCount: result.schedule.trace.length,
        controls: result.controls,
        omissionIds: result.omissions.map((row) => row.id),
        reliabilityScope: result.reliabilityScope,
        claimBoundary: result.claimBoundary,
      });
    }

    async function setScenario(nextScenario) {
      activeScenario = normalizeScenario(nextScenario, config);
      current = await computeScenario(activeScenario);
      appendScenarioReceipt(current);
      sdk.events.propose({
        pluginId: PLUGIN_ID,
        kind: `${PLUGIN_ID}.scenario-computed`,
        scenarioId: current.scenarioId,
        result: current,
      });
      return current;
    }

    function contributeRequest({ sourceText, mission = null }) {
      if (!/\b(?:interstellar|relay|light[- ]?time|optical\s+link|proxima|barnard|wolf\s+359|61\s+cygni|stellar\s+packet)\b/i.test(sourceText || '')) return null;
      if (!mission) return { recognized: true, obligations: [], unresolved: [] };
      return {
        recognized: true,
        obligations: [
          { id: `${PLUGIN_ID}:delivery:${activeScenario.id}`, kind: 'packet_delivery', required: true },
          { id: `${PLUGIN_ID}:causality:${activeScenario.id}`, kind: 'causal_event_order', required: true },
          { id: `${PLUGIN_ID}:evidence:${activeScenario.id}`, kind: 'rendered_evidence_trace', required: true },
        ],
        unresolved: [],
      };
    }

    async function appendRunReceipts(result) {
      result.modelReceipts.forEach((receipt) => sdk.receipts.append(receipt));
      sdk.receipts.append(result.packet);
      sdk.receipts.append({
        schema: 'simulatte.plugin.interstellarRunReceipt.v2',
        scenarioId: result.scenarioId,
        packetId: result.packet.packetId,
        eventIds: result.schedule.trace.map((event) => event.id),
        causalEdges: result.schedule.trace.flatMap((event) => (
          event.causalParentIds.map((parentId) => ({ parentId, childId: event.id }))
        )),
        scheduler: result.schedule.schedulerReceipt,
        metrics: result.metrics,
        omissions: result.omissions,
        reliabilityScope: result.reliabilityScope,
        terminalVerification: result.packet.terminalVerification,
        truth: result.truth,
        claimBoundary: result.claimBoundary,
      });
    }

    async function handleAction(actionId, context = {}) {
      if (actionId === 'counterfactual.compare') return compareCounterfactual();
      if (!['scenario.run', 'simulate.packet.transmission'].includes(actionId)) {
        return { status: 'refused', reason: 'unknown_action', actionId };
      }
      const phase = context.values?.phase;
      if (phase === 'start') {
        const controlValues = withoutPhase(context.values);
        if (Object.keys(controlValues).length) {
          current = await computeScenario(activeScenario, controlValues);
          appendScenarioReceipt(current);
          sdk.events.propose({
            pluginId: PLUGIN_ID,
            kind: `${PLUGIN_ID}.scenario-computed`,
            scenarioId: current.scenarioId,
            result: current,
          });
        }
        sdk.events.propose({ pluginId: PLUGIN_ID, kind: `${PLUGIN_ID}.run-started` });
        return progressAction(sdk.state.read());
      }
      if (phase === 'step') return advanceOneEvent();
      if (phase !== undefined) return { status: 'refused', reason: 'scenario_phase_invalid', phase };

      sdk.events.propose({ pluginId: PLUGIN_ID, kind: `${PLUGIN_ID}.run-started` });
      let progress;
      do {
        progress = await advanceOneEvent();
      } while (progress.status === 'running');
      return { ...progress, compatibilityAdapter: 'single-dispatch-drains-causal-events' };
    }

    async function advanceOneEvent() {
      const state = sdk.state.read();
      if (state.progressive.status !== 'running') return {
        status: state.progressive.status === 'settled' ? 'settled' : 'refused',
        reason: state.progressive.status === 'settled' ? undefined : 'simulation_not_running',
        ...progressAction(state),
      };
      const nextEventIndex = state.progressive.currentEventIndex + 1;
      const domainEvent = state.result.schedule.trace[nextEventIndex];
      const nextProgressive = state.result.schedule.snapshots[nextEventIndex + 1];
      if (!domainEvent || !nextProgressive) throw new Error(`interstellar_progress_event_missing: ${nextEventIndex}`);
      sdk.events.propose({
        pluginId: PLUGIN_ID,
        kind: `${PLUGIN_ID}.event-applied`,
        eventIndex: nextEventIndex,
        domainEvent,
        progressive: nextProgressive,
      });
      const nextState = sdk.state.read();
      if (nextState.progressive.status === 'settled') await appendRunReceipts(nextState.result);
      return progressAction(nextState);
    }

    async function compareCounterfactual() {
      const state = sdk.state.read();
      const baseline = await computeScenario(activeScenario, state.result.controls, 'baseline');
      const comparison = Object.freeze({
        schema: 'simulatte.interstellarComparison.v1',
        comparisonId: `${state.result.scenarioId}:direct-baseline`,
        commonSeed: state.result.seed,
        synchronizedStartEpochIso: state.result.schedule.startEpochIso,
        baseline: metricProjection(baseline),
        intervention: metricProjection(state.result),
        differences: Object.freeze({
          latencyYears: state.result.metrics.oneWayLatencyYears - baseline.metrics.oneWayLatencyYears,
          bottleneckDataRateGbps: state.result.metrics.bottleneckDataRateGbps - baseline.metrics.bottleneckDataRateGbps,
          transmissionEnergyJ: state.result.metrics.transmissionEnergyJ - baseline.metrics.transmissionEnergyJ,
          packetSuccessProbability: state.result.metrics.endToEndPacketSuccessProbability - baseline.metrics.endToEndPacketSuccessProbability,
        }),
        omissions: state.result.omissions,
        reliabilityScope: state.result.reliabilityScope,
        evidenceReferences: Object.freeze([
          ...state.result.metrics.evidenceReferences,
          ...baseline.metrics.evidenceReferences,
        ]),
        truth: state.result.truth,
      });
      sdk.receipts.append({
        ...comparison,
        schema: 'simulatte.plugin.interstellarCounterfactualReceipt.v2',
        claimBoundary: 'Both branches reuse the same astrometric epoch, packet size, and seed. Only declared path or terminal parameters differ.',
      });
      sdk.events.propose({ pluginId: PLUGIN_ID, kind: `${PLUGIN_ID}.comparison-computed`, comparison });
      return {
        status: 'settled',
        comparison,
        comparisonId: comparison.comparisonId,
        comparisonBranches: {
          baseline: comparison.baseline,
          intervention: comparison.intervention,
        },
      };
    }

    function settle() {
      const state = sdk.state.read();
      const result = state.result;
      const completed = state.progressive.status === 'settled';
      const causal = causalOrderPass(result.schedule.trace);
      const evidenceCount = presentationApi
        .createSemanticPresentation(starsData, result, state.progressive)
        .layers
        .flatMap((layer) => layer.entities)
        .filter((entity) => entity.evidenceReferences.length > 0)
        .length;
      return {
        obligationResults: [
          {
            obligationId: `${PLUGIN_ID}:delivery:${state.scenarioId}`,
            status: completed && result.packet.terminalVerification === 'verified_sha256_match' ? 'settled' : 'unmet',
            evidence: {
              currentEventId: state.progressive.currentEventId,
              deliveryEpochIso: result.schedule.deliveryEpochIso,
              packetHash: result.packet.integrity.packetHash,
              reliabilityScope: result.reliabilityScope,
              omissionIds: result.omissions.map((row) => row.id),
            },
          },
          {
            obligationId: `${PLUGIN_ID}:causality:${state.scenarioId}`,
            status: completed && causal ? 'settled' : 'unmet',
            evidence: {
              eventCount: result.schedule.trace.length,
              processedCount: result.schedule.schedulerReceipt.processedCount,
              causalOrderPass: causal,
              omissionIds: result.omissions.map((row) => row.id),
            },
          },
          {
            obligationId: `${PLUGIN_ID}:evidence:${state.scenarioId}`,
            status: evidenceCount > 0 ? 'settled' : 'unmet',
            evidence: {
              renderedEntityEvidenceCount: evidenceCount,
              spatialContractId: 'interstellar:icrs-cartesian-pc:true-3d:v1',
              omissionIds: result.omissions.map((row) => row.id),
              reliabilityScope: result.reliabilityScope,
            },
          },
        ],
        stateIdentity: `${state.scenarioId}:${state.progressive.currentEventId || 'ready'}:${result.packet.integrity.packetHash}`,
        losses: [
          ...(!completed ? [{ kind: 'simulation_incomplete', currentEventIndex: state.progressive.currentEventIndex }] : []),
          ...result.stellarStates.filter((row) => !row.hasRadialVelocity).map((row) => ({
            kind: 'missing_radial_velocity',
            sourceId: row.sourceId,
            appliedAssumption: 'zero-radial-velocity',
          })),
          ...result.omissions.map((row) => ({
            kind: row.id === 'continuous-contact-assumed' ? 'model_assumption' : 'model_omission',
            omissionId: row.id,
            detail: row.effect,
            affects: row.affects,
          })),
        ],
      };
    }

    function view() {
      const state = sdk.state.read();
      const result = state.result;
      const event = state.progressive.currentEventIndex >= 0
        ? result.schedule.trace[state.progressive.currentEventIndex]
        : null;
      const currentStar = result.stellarStates.find((row) => row.sourceId === state.progressive.packetLocationId);
      return [
        {
          slot: 'inspector',
          title: 'Interstellar Relay Network',
          rows: [
            { label: 'Experiment', value: result.scenario.name },
            { label: 'Progress', value: `${state.progressive.currentEventIndex + 1}/${result.schedule.trace.length} events · ${state.progressive.status}` },
            { label: 'Current event', value: event?.kind || 'ready' },
            { label: 'Packet location', value: currentStar?.name || state.progressive.packetLocationId },
            { label: 'Relay path', value: result.scenario.relayHops.map((id) => result.stellarStates.find((row) => row.sourceId === id)?.name || id).join(' → ') },
            { label: 'One-way latency', value: `${result.metrics.oneWayLatencyYears.toFixed(5)} years` },
            { label: 'Bottleneck rate', value: formatRate(result.metrics.bottleneckDataRateGbps) },
            { label: 'Minimum margin', value: `${result.metrics.minimumLinkMarginDb.toFixed(2)} dB` },
            { label: 'Transmission energy', value: `${(result.metrics.transmissionEnergyJ / 3.6e6).toFixed(2)} kWh` },
            { label: 'Packet success model', value: `${(result.metrics.endToEndPacketSuccessProbability * 100).toFixed(5)}%` },
            { label: 'Reliability assumes', value: 'Continuous contact; no acquisition, outage, maintenance, or retries' },
            { label: 'Reliability omits', value: 'Plasma effects and a complete detector/background-noise model' },
            { label: 'Astrometry', value: `Gaia DR3 · ${starsData.provenance.retrievalAt.slice(0, 10)} · ${starsData.stars.length - 1} source rows` },
          ],
          fields: controlFields(result.controls, hardwareData),
          actions: [
            { id: 'simulate.packet.transmission', label: 'Run controlled transmission' },
            { id: 'counterfactual.compare', label: 'Compare direct baseline' },
          ],
        },
        {
          slot: 'hud',
          title: 'Truth boundary',
          rows: [
            { label: 'Observed', value: 'Gaia DR3 astrometry only' },
            { label: 'Modeled', value: 'Space motion, light time, optical photon budget' },
            { label: 'Simulated', value: 'Causal packet and store-forward events' },
            { label: 'Scenario', value: 'All terminals, contacts, payloads, and relay policy' },
            { label: 'Continuous contact', value: 'Assumed for every hop; not observed or simulated as availability' },
            { label: 'Omissions', value: result.omissions.map((row) => row.label).join('; ') },
            { label: 'Limitation', value: result.claimBoundary },
          ],
          actions: [],
        },
      ];
    }

    function semanticPresentation() {
      const state = sdk.state.read();
      return presentationApi.createSemanticPresentation(starsData, state.result, state.progressive);
    }
    function contributeV4() {
      const state = sdk.state.read();
      return v4Api.createContribution({ result: state.result, progressive: state.progressive });
    }
    function viewIntents() {
      const state = sdk.state.read();
      return presentationApi.createViewIntents(state.result, state.progressive);
    }
    function present() {
      const state = sdk.state.read();
      return presentationApi.createV3CompatibilityPresentation(starsData, state.result, state.progressive);
    }

    const capabilities = Object.freeze({
      'field.stellar-flux.v1': () => {
        const result = sdk.state.read().result;
        const target = starsById.get(result.scenario.targetId);
        return Object.freeze({
          schema: 'field.stellar-flux.v1',
          value: target.photGMag,
          units: 'gaia_g_magnitude',
          providerId: PLUGIN_ID,
          evidenceReferences: Object.freeze([target.sourceRowId]),
          truth: target.truth,
        });
      },
      'simulation.light-delay-queue.v1': () => sdk.state.read().result.schedule,
      'simulation.interstellar-communications.v1': () => sdk.state.read().result,
      'simulation.interstellar-relay.v4': () => sdk.state.read(),
      'presentation.semantic.v4': semanticPresentation,
      'view.intents.v1': viewIntents,
      'comparison.interstellar-relay.v1': () => sdk.state.read().result.comparisonDefinition,
    });

    return Object.freeze({
      id: PLUGIN_ID,
      contributeRequest,
      setScenario,
      handleAction,
      settle,
      view,
      present,
      semanticPresentation,
      contributeV4,
      viewIntents,
      reduce,
      capabilities,
      dispose() {},
    });
  }

  function resolveScenario(dataset, id) {
    const aliases = {
      'sol-alpha-centauri-relay': 'sol-proxima-barnard-relay',
      'nearest-ten-star-store-forward': 'nearby-star-store-forward',
      'sirius-high-power-link': '61-cygni-high-power-link',
    };
    const wanted = aliases[id] || id;
    const found = dataset.scenarios?.find((row) => row.id === wanted);
    if (!found) throw new Error(`interstellar_scenario_missing: ${wanted}`);
    return found;
  }

  function normalizeScenario(value, config) {
    if (typeof value === 'string') return Object.freeze({ id: value, seed: value });
    const id = value?.scenarioId || value?.id || config?.defaultScenarioId || 'sol-proxima-direct';
    return Object.freeze({ ...value, id, seed: value?.seed || id });
  }

  function resolveControls(config, scenario, values, hardwareData) {
    const controls = Object.freeze({
      startEpochIso: String(values.startEpochIso || config.startEpochIso),
      targetEpochYear: Number(values.targetEpochYear ?? config.targetEpochYear),
      processingDelayHours: Number(values.processingDelayHours ?? config.processingDelayHours),
      packetBytes: Number(values.packetBytes ?? scenario.packetBytes),
      transceiverId: String(values.transceiverId || scenario.transceiverId || config.defaultTransceiver),
    });
    if (!Number.isFinite(Date.parse(controls.startEpochIso))) throw new Error('interstellar_start_epoch_invalid');
    if (!Number.isFinite(controls.targetEpochYear) || controls.targetEpochYear < 2016 || controls.targetEpochYear > 2200) throw new Error('interstellar_target_epoch_invalid');
    if (!Number.isFinite(controls.processingDelayHours) || controls.processingDelayHours < 0 || controls.processingDelayHours > 8760) throw new Error('interstellar_processing_delay_invalid');
    if (!Number.isInteger(controls.packetBytes) || controls.packetBytes < 64 || controls.packetBytes > 1073741824) throw new Error('interstellar_packet_bytes_invalid');
    if (!hardwareData.archetypes[controls.transceiverId]) throw new Error(`interstellar_transceiver_missing: ${controls.transceiverId}`);
    return controls;
  }

  function controlFields(controls, hardwareData) {
    return [
      { id: 'startEpochIso', label: 'Transmission epoch', type: 'date', value: controls.startEpochIso.slice(0, 10) },
      { id: 'targetEpochYear', label: 'Astrometry epoch year', type: 'number', value: controls.targetEpochYear },
      { id: 'processingDelayHours', label: 'Relay processing hours', type: 'number', value: controls.processingDelayHours },
      { id: 'packetBytes', label: 'Packet bytes', type: 'number', value: controls.packetBytes },
      {
        id: 'transceiverId',
        label: 'Scenario terminal',
        type: 'select',
        value: controls.transceiverId,
        options: Object.values(hardwareData.archetypes).map((row) => ({ value: row.id, label: row.name })),
      },
    ];
  }

  function createComparisonDefinition(scenario, seed, omissions, reliabilityScope) {
    return Object.freeze({
      schema: 'simulatte.comparisonDefinition.v1',
      id: `${scenario.id}:direct-baseline`,
      baseline: Object.freeze({
        relayPath: Object.freeze(scenario.baselineRelayHops.slice()),
        transceiverId: scenario.baselineTransceiverId,
      }),
      intervention: Object.freeze({
        relayPath: Object.freeze(scenario.relayHops.slice()),
        transceiverId: scenario.transceiverId,
      }),
      synchronizedClock: true,
      commonSeed: seed,
      metricIds: Object.freeze(['latencyYears', 'bottleneckDataRateGbps', 'transmissionEnergyJ', 'packetSuccessProbability']),
      omissionIds: Object.freeze(omissions.map((row) => row.id)),
      reliabilityScope,
      spatialComparison: Object.freeze({
        coordinateSystem: 'icrs-cartesian-pc',
        dimensions: 3,
        distanceSemantics: 'euclidean-3d-parsec',
        depthSemantics: 'signed-icrs-z-parsec-not-render-order',
      }),
    });
  }

  function metricProjection(result) {
    return Object.freeze({
      scenarioId: result.scenarioId,
      relayPath: result.scenario.relayHops,
      transceiverId: result.controls.transceiverId,
      latencyYears: result.metrics.oneWayLatencyYears,
      bottleneckDataRateGbps: result.metrics.bottleneckDataRateGbps,
      transmissionEnergyJ: result.metrics.transmissionEnergyJ,
      packetSuccessProbability: result.metrics.endToEndPacketSuccessProbability,
    });
  }

  function reduce(state, event) {
    if (event.kind === `${PLUGIN_ID}.scenario-computed`) {
      return {
        ...state,
        scenarioId: event.scenarioId,
        result: event.result,
        progressive: event.result.schedule.initialState,
        comparison: null,
        lastAction: 'scenario',
      };
    }
    if (event.kind === `${PLUGIN_ID}.run-started`) {
      return {
        ...state,
        progressive: Object.freeze({ ...state.result.schedule.initialState, status: 'running' }),
        comparison: null,
        lastAction: 'run-started',
      };
    }
    if (event.kind === `${PLUGIN_ID}.event-applied`) {
      return {
        ...state,
        progressive: event.progressive,
        lastAction: event.domainEvent.kind,
      };
    }
    if (event.kind === `${PLUGIN_ID}.comparison-computed`) {
      return { ...state, comparison: event.comparison, lastAction: 'comparison' };
    }
    return state;
  }

  function progressAction(state) {
    return {
      status: state.progressive.status,
      currentStep: state.progressive.currentEventIndex + 1,
      totalSteps: state.result.schedule.trace.length,
      currentEventId: state.progressive.currentEventId,
      simulationId: state.result.scenarioId,
      metrics: state.result.metrics,
    };
  }

  function causalOrderPass(events) {
    const indexById = new Map(events.map((event, index) => [event.id, index]));
    return events.every((event, index) => (
      event.causalParentIds.every((parentId) => indexById.has(parentId) && indexById.get(parentId) < index)
    ));
  }

  function endpointDistanceUncertaintyPc(from, to) {
    return stateDistanceSigma(from) + stateDistanceSigma(to);
  }
  function stateDistanceSigma(state) {
    const interval = state.uncertainty?.value?.distancePc;
    return Array.isArray(interval) ? Math.abs(interval[1] - interval[0]) / 2 : 0;
  }
  function distance(left, right) {
    return Math.hypot(...right.map((value, index) => value - left[index]));
  }
  function withoutPhase(values = {}) {
    return Object.fromEntries(Object.entries(values).filter(([key]) => key !== 'phase' && values[key] !== ''));
  }
  function formatRate(gbps) {
    if (gbps >= 1) return `${gbps.toFixed(3)} Gbps`;
    if (gbps >= 0.001) return `${(gbps * 1000).toFixed(3)} Mbps`;
    return `${(gbps * 1e6).toFixed(3)} kbps`;
  }
  function observedTruth() {
    return Object.freeze({
      origin: 'observed',
      temporalStatus: 'historical',
      uncertainty: Object.freeze({ kind: 'distribution', value: Object.freeze({ family: 'catalog-reported-standard-errors' }) }),
    });
  }
  function modeledTruth(reason) {
    return Object.freeze({
      origin: 'modeled',
      temporalStatus: 'forecast',
      uncertainty: Object.freeze({ kind: 'missing', value: Object.freeze({ reason }) }),
    });
  }
  function scenarioTruth(reason) {
    return Object.freeze({
      origin: 'scenario',
      temporalStatus: 'forecast',
      uncertainty: Object.freeze({ kind: 'missing', value: Object.freeze({ reason }) }),
    });
  }

  const datasetValidators = Object.freeze({
    'simulatte.gaiaDr3NearbyStars.v2': (value) => {
      if (!Array.isArray(value?.stars) || value.stars.length < 2) throw new Error('nearby star catalog incomplete');
      value.stars.filter((row) => row.sourceId !== 'gaia-sol').forEach((row) => {
        if (!/^\d+$/.test(row.catalogSourceId || '') || !row.sourceRowId) throw new Error(`gaia source row identity missing: ${row.sourceId}`);
      });
      return value;
    },
    'simulatte.relayHardwareArchetypes.v2': (value) => {
      if (!value?.archetypes || !Object.keys(value.archetypes).length) throw new Error('relay hardware missing');
      return value;
    },
    'simulatte.interstellarScenarioNetwork.v2': (value) => {
      if (!Array.isArray(value?.scenarios) || !value.scenarios.length) throw new Error('relay scenarios missing');
      return value;
    },
    'simulatte.interstellarRelayModelCatalog.v1': (value) => {
      if (!Array.isArray(value?.models) || value.models.length < 4) throw new Error('relay model catalog incomplete');
      if (!Array.isArray(value.omissions) || value.omissions.length !== 7) throw new Error('relay model omission catalog incomplete');
      const omissionIds = new Set(value.omissions.map((row) => row.id));
      value.models.forEach((model) => (model.omissionIds || []).forEach((id) => {
        if (!omissionIds.has(id)) throw new Error(`relay model omission unresolved: ${model.id}:${id}`);
      }));
      [...(value.reliabilityScope?.conditionalOn || []), ...(value.reliabilityScope?.excludes || [])].forEach((id) => {
        if (!omissionIds.has(id)) throw new Error(`relay reliability omission unresolved: ${id}`);
      });
      return value;
    },
  });

  return Object.freeze({ activate, datasetValidators });
});
