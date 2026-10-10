(function attachTransmissionModel(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.InterstellarTransmissionModel = api;
})(globalThis, function createTransmissionModel(root) {
  const PC_TO_METERS = 3.08567758149137e16;
  function dependency(name, path) {
    const api = typeof module === 'object' && module.exports ? require(path) : root[name];
    if (!api) throw new Error('interstellar_dependency_missing: '+name);
    return api;
  }
  function create({sdk, config, starsData, hardwareData, scenariosData, modelsData, operationsData, advancedData, hygData, stellarCatalog, starsById}) {
    const stellarApi = dependency('InterstellarStellarState', './stellar-state.js');
    const contactApi = dependency('InterstellarContactScheduler', './contact-scheduler.js');
    const linkApi = dependency('InterstellarOpticalLinkBudget', './optical-link-budget.js');
    const packetApi = dependency('InterstellarPacketQueue', './packet-queue.js');
    const metricsApi = dependency('InterstellarMetrics', './metrics.js');
    const lightTimeApi = dependency('InterstellarLightTime', './light-time.js');
    const routerApi = dependency('InterstellarNetworkRouter', './network-router.js');
    const operationsApi = dependency('InterstellarOperationsModel', './operations-model.js');
    const advancedApi = dependency('InterstellarAdvancedChannels', './advanced-channels.js');
    const controlsApi = dependency('InterstellarRelayControls', './relay-controls.js');
    const receiptApi = dependency('InterstellarReceiptFactory', './receipt-factory.js');
    const catalogApi = dependency('InterstellarStellarCatalog', './stellar-catalog.js');
    async function computeOneWay(spec, controlValues = {}, branch = 'intervention', fixedPath = null) {
      const scenarioRow = controlsApi.resolveScenario(scenariosData, spec.id);
      const branchValues = branch === 'baseline' ? {
        ...controlValues,
        routingMode: 'direct',
        channelMode: 'classical-optical',
        transceiverId: controlValues.transceiverId || scenarioRow.transceiverId || config.defaultTransceiver,
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
      const presetControls = controlsApi.resolveControls({
        config,
        scenario: scenarioRow,
        values: branch === 'baseline' ? branchValues : {},
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
        return stellarApi.convertEquatorialToCartesianPc(star, controls.astrometryEpochYear);
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
        fixedPath,
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
      const routeLinkBudgets = selectedEdges.map((row) => row.linkBudget);
      const routeChannelReceipts = selectedEdges.map((row) => row.channelReceipt);
      const operations = operationsApi.simulateEnsemble({
        seed: spec.seed,
        channelReceipts: routeChannelReceipts,
        packetBits,
        processingDelayHours: controls.processingDelayHours,
        controls,
      });
      const schedule = contactApi.scheduleRelay({
        relayPath: selectedPath,
        statesById,
        linkBudgets: routeLinkBudgets,
        channelReceipts: routeChannelReceipts,
        channelEvaluator({ from, to, classicalLightTime }) {
          const distanceMeters = classicalLightTime.distanceMeters;
          const uncertaintyMeters = endpointDistanceUncertaintyPc(from, to) * PC_TO_METERS;
          const attenuationDb = classicalLightTime.distancePc * (
            controls.dustExtinctionMagPerPc * 4
            + controls.plasmaLossDbPerPc
          );
          const scheduledLinkBudget = linkApi.computeLinkBudget(distanceMeters, transceiver, {
            packetBits,
            distanceLowerMeters: Math.max(1, distanceMeters - uncertaintyMeters),
            distanceUpperMeters: distanceMeters + uncertaintyMeters,
            attenuationFactor: 10 ** (-attenuationDb / 10),
            backgroundPhotonRateHz: transceiver.backgroundPhotonRateHz * controls.detectorNoiseScale,
            sourceRowIds: [...from.sourceRowIds, ...to.sourceRowIds],
          });
          const receipt = advancedApi.evaluateChannel({
            mode: controls.channelMode,
            distancePc: classicalLightTime.distancePc,
            packetBits,
            classicalLinkBudget: scheduledLinkBudget,
            classicalLightTime,
            controls,
            catalog: advancedData,
          });
          return Object.freeze({ channelReceipt: receipt, linkBudget: scheduledLinkBudget });
        },
        operationalPlan: operations.representative,
        packetBits,
        scheduler: sdk.scheduler,
        startEpochIso: controls.startEpochIso,
        processingDelayHours: controls.processingDelayHours,
      });
      const linkBudgets = schedule.hops.map((row) => row.linkBudget);
      const channelReceipts = schedule.hops.map((row) => row.channelReceipt);
      const transmissionIdentity = await sdk.receipts.sha256Hex({
        scenarioId: spec.id, seed: spec.seed, branch, controls, selectedPath,
      });
      const packet = await packetApi.createPacket({
        receiptTools: sdk.receipts,
        packetId: spec.packetId || `packet:${spec.id}:${branch}:${transmissionIdentity}`,
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
        astrometryEpochYear: controls.astrometryEpochYear,
        scenario: Object.freeze({
          ...scenarioRow,
          sourceId: controls.sourceId,
          targetId: controls.targetId,
          relayHops: Object.freeze(selectedPath.slice()),
        }),
        controls: effectiveControls,
        presetStatus: controlsMatch(effectiveControls, presetControls) ? 'starting preset' : 'customized',
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

    const exchangeApi = dependency('InterstellarMessageExchange', './message-exchange.js');
    return async function computeScenario(spec, values = {}, branch = 'intervention') {
      const request = await computeOneWay(spec, values, branch);
      if (request.controls.messageMode !== 'request-reply') return request;
      if (request.schedule.deliveryStatus !== 'delivered') return request;
      const response = await computeOneWay({...spec, seed: `${spec.seed}:response`, packetId: `${request.packet.packetId}:response`}, {
        ...request.controls,
        messageMode: 'one-way',
        sourceId: request.controls.targetId,
        targetId: request.controls.sourceId,
        startEpochIso: request.schedule.deliveryEpochIso,
        routingMode: 'manual',
        requiredRelayIds: request.routeSelection.selectedPath.slice(1, -1).reverse(),
      }, branch, [...request.routeSelection.selectedPath].reverse());
      return exchangeApi.compose(request, response);
    };
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
        transceiverId: controls.transceiverId,
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
  function controlsMatch(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
  }
  return Object.freeze({create});
});
