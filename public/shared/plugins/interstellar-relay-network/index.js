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
    const lightTimeApi = dependency('InterstellarLightTime', './light-time.js');
    const routerApi = dependency('InterstellarNetworkRouter', './network-router.js');
    const operationsApi = dependency('InterstellarOperationsModel', './operations-model.js');
    const advancedApi = dependency('InterstellarAdvancedChannels', './advanced-channels.js');
    const controlsApi = dependency('InterstellarRelayControls', './relay-controls.js');
    const receiptApi = dependency('InterstellarReceiptFactory', './receipt-factory.js');
    const catalogApi = dependency('InterstellarStellarCatalog', './stellar-catalog.js');

    const starsData = sdk.datasets.require('gaia.dr3.nearby-stars.v2');
    const hardwareData = sdk.datasets.require('relay.hardware.archetypes.v2');
    const scenariosData = sdk.datasets.require('interstellar.scenario.network.v2');
    const modelsData = sdk.datasets.require('interstellar.relay.models.v1');
    const operationsData = sdk.datasets.require('interstellar.operations.models.v1');
    const advancedData = sdk.datasets.require('interstellar.advanced.channels.v1');
    const hygData = sdk.datasets.require('hyg.visible-stars.v1');
    const stellarCatalog = catalogApi.createCatalog(starsData, hygData);
    const starsById = new Map(stellarCatalog.stars.map((row) => [row.sourceId, row]));
    let activeScenario = controlsApi.normalizeScenario(scenario, config);
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
      const scenarioRow = controlsApi.resolveScenario(scenariosData, spec.id);
      const branchValues = branch === 'baseline' ? {
        ...controlValues,
        routingMode: 'direct',
        channelMode: 'classical-optical',
        transceiverId: scenarioRow.baselineTransceiverId,
      } : controlValues;
      const controls = controlsApi.resolveControls({
        config,
        scenario: scenarioRow,
        values: branchValues,
        hardwareData,
        starsData: stellarCatalog,
        operationsData,
        advancedData,
      });
      const selectedTransceiverId = controls.transceiverId;
      const transceiver = hardwareData.archetypes[selectedTransceiverId];
      if (!transceiver) throw new Error(`interstellar_transceiver_missing: ${selectedTransceiverId}`);
      const activeStarIds = new Set([
        controls.sourceId,
        controls.targetId,
        ...controls.requiredRelayIds,
        ...controls.eligibleRelayIds,
      ]);
      activeStarIds.delete('none');
      const stellarStates = [...activeStarIds].map((id) => {
        const star = starsById.get(id);
        if (!star) throw new Error(`interstellar_active_star_missing: ${id}`);
        return stellarApi.convertEquatorialToCartesianPc(star, controls.targetEpochYear);
      });
      const statesById = new Map(stellarStates.map((state) => [state.sourceId, state]));
      const packetBits = controls.packetBytes * 8;
      const edgeCache = new Map();
      const evaluateEdge = (from, to, distancePc) => {
        const id = `${from.sourceId}->${to.sourceId}`;
        if (edgeCache.has(id)) return edgeCache.get(id);
        const distanceMeters = distance(from.positionPc, to.positionPc) * PC_TO_METERS;
        const uncertaintyMeters = endpointDistanceUncertaintyPc(from, to) * PC_TO_METERS;
        const attenuationDb = distancePc * (
          controls.dustExtinctionMagPerPc * 4
          + controls.plasmaLossDbPerPc
        );
        const linkBudget = linkApi.computeLinkBudget(distanceMeters, transceiver, {
          packetBits,
          distanceLowerMeters: Math.max(1, distanceMeters - uncertaintyMeters),
          distanceUpperMeters: distanceMeters + uncertaintyMeters,
          attenuationFactor: 10 ** (-attenuationDb / 10),
          backgroundPhotonRateHz: transceiver.backgroundPhotonRateHz * controls.detectorNoiseScale,
          sourceRowIds: [...from.sourceRowIds, ...to.sourceRowIds],
        });
        const lightTime = lightTimeApi.computeMovingTargetLightTime(
          from,
          to,
          0,
          controls.startEpochIso,
        );
        const channelReceipt = advancedApi.evaluateChannel({
          mode: controls.channelMode,
          distancePc,
          packetBits,
          classicalLinkBudget: linkBudget,
          classicalLightTime: lightTime,
          controls,
          catalog: advancedData,
        });
        const value = Object.freeze({
          latencySeconds: channelReceipt.latencySeconds,
          effectiveDataRateGbps: channelReceipt.effectiveDataRateGbps,
          packetSuccessProbability: channelReceipt.packetSuccessProbability,
          transmissionEnergyJ: channelReceipt.transmissionEnergyJ,
          linkBudget,
          channelReceipt,
        });
        edgeCache.set(id, value);
        return value;
      };
      const routeSelection = routerApi.selectRoute({
        stellarStates,
        sourceId: controls.sourceId,
        targetId: controls.targetId,
        routingMode: controls.routingMode,
        requiredRelayIds: controls.requiredRelayIds,
        eligibleRelayIds: controls.eligibleRelayIds,
        maxHops: controls.maxHops,
        maxHopDistancePc: controls.maxHopDistancePc,
        objective: controls.routeObjective,
        processingDelayHours: controls.processingDelayHours,
        evaluateEdge,
      });
      const selectedPath = routeSelection.selectedPath;
      const selectedEdges = selectedPath.slice(0, -1).map((fromId, index) => {
        const from = statesById.get(fromId);
        const to = statesById.get(selectedPath[index + 1]);
        return evaluateEdge(from, to, distance(from.positionPc, to.positionPc));
      });
      const linkBudgets = selectedEdges.map((row) => row.linkBudget);
      const channelReceipts = selectedEdges.map((row) => row.channelReceipt);
      const operations = operationsApi.simulateEnsemble({
        seed: spec.seed,
        channelReceipts,
        packetBits,
        processingDelayHours: controls.processingDelayHours,
        controls,
      });
      const schedule = contactApi.scheduleRelay({
        relayPath: selectedPath,
        statesById,
        linkBudgets,
        channelReceipts,
        operationalPlan: operations.representative,
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
        sourceId: controls.sourceId,
        destinationId: controls.targetId,
        relayPath: selectedPath,
        createdAt: schedule.startEpochIso,
        schedule,
      });
      const relayStates = selectedPath.map((id) => statesById.get(id));
      const effectiveControls = Object.freeze({ ...controls, transceiverId: selectedTransceiverId });
      const dataReceipts = receiptApi.createDataReceipts({
        sdk,
        starsData,
        hardwareData,
        scenariosData,
        modelsData,
        operationsData,
        advancedData,
        hygData: Object.freeze({
          ...hygData,
          id: stellarCatalog.hygDatasetId,
          contentVersion: stellarCatalog.hygContentVersion,
          provenance: stellarCatalog.provenance,
        }),
        stellarStates,
      });
      const modelReceipts = Object.freeze([
        ...receiptApi.createModelReceipts(modelsData, effectiveControls, selectedTransceiverId),
        receiptApi.operationsModelReceipt(effectiveControls, operations),
        receiptApi.advancedChannelModelReceipt(effectiveControls, channelReceipts),
      ]);
      const omissions = Object.freeze(operations.remainingLimitations.map((row) => Object.freeze({ ...row })));
      const reliabilityScope = Object.freeze({
        statement: 'Delivery probability is a seeded operational ensemble over declared profiles and hypothetical infrastructure.',
        conditionalOn: Object.freeze(['declared-operational-profile', 'infrastructure-not-observed']),
        excludes: Object.freeze([]),
      });
      const metrics = metricsApi.summarize({
        schedule,
        linkBudgets,
        channelReceipts,
        operations,
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
        schema: 'simulatte.interstellarRelayResult.v3',
        scenarioId: spec.id,
        branch,
        datasetScenarioId: scenarioRow.id,
        seed: spec.seed,
        targetEpochYear: controls.targetEpochYear,
        scenario: Object.freeze({
          ...scenarioRow,
          sourceId: controls.sourceId,
          targetId: controls.targetId,
          relayHops: Object.freeze(selectedPath.slice()),
        }),
        controls: effectiveControls,
        controlOptions: controlsApi.controlOptions({
          starsData: stellarCatalog,
          hardwareData,
          operationsData,
          advancedData,
        }),
        routeSelection,
        schedule,
        linkBudgets: Object.freeze(linkBudgets),
        channelReceipts: Object.freeze(channelReceipts),
        operations,
        packet,
        metrics,
        stellarStates: Object.freeze(stellarStates),
        relayStates: Object.freeze(relayStates),
        dataReceipts,
        modelReceipts,
        omissions,
        reliabilityScope,
        comparisonDefinition: createComparisonDefinition({
          scenario: scenarioRow,
          controls: effectiveControls,
          routeSelection,
          seed: spec.seed,
          omissions,
          reliabilityScope,
        }),
        truth: Object.freeze({
          origin: 'simulated',
          temporalStatus: 'forecast',
          uncertainty: metrics.truth.uncertainty,
        }),
        claimBoundary: catalogApi.claimBoundary({
          usesHygSnapshot: selectedPath.some((id) => id.startsWith('hyg:')),
          speculative: channelReceipts.some((row) => row.constructibilityStatus.startsWith('unsupported')),
        }),
      });
    }

    function appendDataReceipts() {
      current.dataReceipts.forEach((receipt) => sdk.receipts.append(receipt));
    }

    function appendScenarioReceipt(result) {
      sdk.receipts.append(receiptApi.scenarioReceipt(result));
    }

    async function setScenario(nextScenario) {
      activeScenario = controlsApi.normalizeScenario(nextScenario, config);
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
      if (!/\b(?:interstellar|relay|light[- ]?time|optical\s+link|quantum|entanglement|wormhole|warp|proxima|barnard|wolf\s+359|61\s+cygni|stellar\s+packet)\b/i.test(sourceText || '')) return null;
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
      sdk.receipts.append(receiptApi.runReceipt(result));
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
      if (['settled', 'failed'].includes(nextState.progressive.status)) {
        await appendRunReceipts(nextState.result);
      }
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
          physicalChannelSuccessProbability: state.result.metrics.physicalChannelSuccessProbability - baseline.metrics.physicalChannelSuccessProbability,
          operationalP90LatencySeconds: nullableDifference(
            state.result.operations.latencySeconds.p90,
            baseline.operations.latencySeconds.p90,
          ),
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
        claimBoundary: 'Both branches reuse endpoints, astrometric epoch, packet size, operational profile, and seed. The baseline forces a direct classical link and its declared baseline terminal.',
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
      const delivered = state.progressive.status === 'settled';
      const terminal = ['settled', 'failed'].includes(state.progressive.status);
      const causal = causalOrderPass(result.schedule.trace);
      const evidenceCount = presentationApi
        .createSemanticPresentation(stellarCatalog, result, state.progressive)
        .layers
        .flatMap((layer) => layer.entities)
        .filter((entity) => entity.evidenceReferences.length > 0)
        .length;
      return {
        obligationResults: [
          {
            obligationId: `${PLUGIN_ID}:delivery:${state.scenarioId}`,
            status: delivered && result.packet.terminalVerification === 'verified_sha256_match' ? 'settled' : 'unmet',
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
            status: terminal && causal ? 'settled' : 'unmet',
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
          ...(!terminal ? [{ kind: 'simulation_incomplete', currentEventIndex: state.progressive.currentEventIndex }] : []),
          ...result.stellarStates.filter((row) => !row.hasRadialVelocity).map((row) => ({
            kind: 'missing_radial_velocity',
            sourceId: row.sourceId,
            appliedAssumption: 'zero-radial-velocity',
          })),
          ...result.omissions.map((row) => ({
            kind: 'model_omission',
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
      const started = state.progressive.currentEventIndex >= 0;
      const settled = state.progressive.status === 'settled';
      return [
        {
          slot: 'inspector',
          title: 'Interstellar Relay Network',
          rows: [
            { label: 'Starting preset', value: result.scenario.name },
            { label: 'Progress', value: `${state.progressive.currentEventIndex + 1}/${result.schedule.trace.length} events · ${state.progressive.status}` },
            { label: 'Modeled clock', value: formatModeledDuration(state.progressive.elapsedSeconds) },
            { label: 'Current event', value: relayEventLabel(event?.kind) },
            { label: 'Packet location', value: currentStar?.name || state.progressive.packetLocationId },
            { label: 'Relay path', value: result.scenario.relayHops.map((id) => result.stellarStates.find((row) => row.sourceId === id)?.name || id).join(' → ') },
            { label: 'Route search', value: `${result.routeSelection.candidateCount} candidates · ${result.controls.routeObjective} objective` },
            { label: 'Physics lane', value: result.channelReceipts[0]?.label || result.controls.channelMode },
            ...(started ? [
              { label: 'One-way latency', value: `${result.metrics.oneWayLatencyYears.toFixed(5)} years` },
              { label: 'Bottleneck rate', value: formatRate(result.metrics.bottleneckDataRateGbps) },
              { label: 'Minimum margin', value: `${result.metrics.minimumLinkMarginDb.toFixed(2)} dB` },
              { label: 'Transmission energy', value: `${(result.metrics.transmissionEnergyJ / 3.6e6).toFixed(2)} kWh` },
            ] : []),
            ...(settled ? [
              { label: 'Operational delivery', value: `${(result.operations.deliveryProbability * 100).toFixed(3)}% across ${result.operations.ensembleSize} samples` },
              { label: 'Successful latency p10/p50/p90', value: formatQuantiles(result.operations.latencySeconds) },
              { label: 'Operational effects', value: result.operations.modeledEffectIds.join('; ') },
            ] : []),
            { label: 'Constructibility', value: [...new Set(result.channelReceipts.map((row) => row.constructibilityStatus))].join('; ') },
            { label: 'Remaining limitation', value: result.omissions.map((row) => row.label).join('; ') },
            { label: 'Endpoint catalog', value: `${stellarCatalog.stars.length.toLocaleString()} selectable · ${starsData.stars.length - 1} Gaia DR3 astrometric rows · ${hygData.count - 1} non-Sol HYG snapshot rows` },
          ],
          fields: controlsApi.controlFields(result.controls, result.controlOptions),
          actions: [],
        },
      ];
    }

    function semanticPresentation() {
      const state = sdk.state.read();
      return presentationApi.createSemanticPresentation(stellarCatalog, state.result, state.progressive);
    }
    function contributeV4() {
      const state = sdk.state.read();
      return v4Api.createContribution({
        result: state.result,
        progressive: state.progressive,
      });
    }
    function viewIntents() {
      const state = sdk.state.read();
      return presentationApi.createViewIntents(state.result, state.progressive);
    }
    function present() {
      const state = sdk.state.read();
      return presentationApi.createV3CompatibilityPresentation(stellarCatalog, state.result, state.progressive);
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
      'simulation.interstellar-route-search.v1': () => sdk.state.read().result.routeSelection,
      'simulation.interstellar-operations-ensemble.v1': () => sdk.state.read().result.operations,
      'simulation.interstellar-advanced-channel.v1': () => sdk.state.read().result.channelReceipts,
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

  function createComparisonDefinition({
    scenario,
    controls,
    routeSelection,
    seed,
    omissions,
    reliabilityScope,
  }) {
    return Object.freeze({
      schema: 'simulatte.comparisonDefinition.v1',
      id: `${scenario.id}:direct-baseline`,
      baseline: Object.freeze({
        relayPath: Object.freeze([controls.sourceId, controls.targetId]),
        transceiverId: scenario.baselineTransceiverId,
        channelMode: 'classical-optical',
      }),
      intervention: Object.freeze({
        relayPath: routeSelection.selectedPath,
        transceiverId: controls.transceiverId,
        channelMode: controls.channelMode,
      }),
      synchronizedClock: true,
      commonSeed: seed,
      metricIds: Object.freeze([
        'latencyYears',
        'bottleneckDataRateGbps',
        'transmissionEnergyJ',
        'packetSuccessProbability',
        'physicalChannelSuccessProbability',
        'operationalP90LatencySeconds',
      ]),
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
      channelMode: result.controls.channelMode,
      routingMode: result.controls.routingMode,
      routeObjective: result.controls.routeObjective,
      latencyYears: result.metrics.oneWayLatencyYears,
      bottleneckDataRateGbps: result.metrics.bottleneckDataRateGbps,
      transmissionEnergyJ: result.metrics.transmissionEnergyJ,
      packetSuccessProbability: result.metrics.endToEndPacketSuccessProbability,
      physicalChannelSuccessProbability: result.metrics.physicalChannelSuccessProbability,
      operationalP90LatencySeconds: result.operations.latencySeconds.p90,
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
  function formatModeledDuration(seconds) {
    if (!Number.isFinite(seconds) || seconds <= 0) return 'Ready at transmission epoch';
    const years = seconds / 31557600;
    if (years >= 1) return `${years.toFixed(5)} modeled years`;
    const days = seconds / 86400;
    if (days >= 1) return `${days.toFixed(2)} modeled days`;
    return `${seconds.toFixed(2)} modeled seconds`;
  }
  function relayEventLabel(kind) {
    if (!kind) return 'Ready to create packet';
    return {
      'relay.packet-created': 'Packet created and integrity hash recorded',
      'relay.acquisition-started': 'Terminal begins target acquisition',
      'relay.acquisition-completed': 'Optical acquisition completed',
      'relay.queue-entered': 'Packet entered the transmitter queue',
      'relay.transmission-started': 'Serialization and optical transmission started',
      'relay.transmission-completed': 'Serialization completed; propagation continues',
      'relay.reception-completed': 'The next terminal received the packet',
      'relay.processing-started': 'Relay processing started',
      'relay.processing-completed': 'Relay processing completed',
      'relay.packet-delivered': 'Packet delivered and integrity verified',
    }[kind] || String(kind).replaceAll('.', ' ');
  }
  function formatQuantiles(value) {
    const format = (seconds) => seconds === null ? 'not delivered' : `${(seconds / 31557600).toFixed(5)} y`;
    return `${format(value.p10)} / ${format(value.p50)} / ${format(value.p90)}`;
  }
  function nullableDifference(left, right) {
    return left === null || right === null ? null : left - right;
  }
  const validatorApi = typeof module === 'object' && module.exports
    ? require('./dataset-validators.js')
    : root.InterstellarDatasetValidators;
  if (!validatorApi?.datasetValidators) throw new Error('interstellar_dataset_validators_missing');
  const { datasetValidators } = validatorApi;

  return Object.freeze({ activate, datasetValidators });
});
