(function attachInterstellarPresentation(root, factory) {
  const api = factory();
  root.InterstellarRelayPresentation = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createInterstellarPresentationModule() {
  function createSemanticPresentation(starsData, result, progressiveState) {
    const selectedIds = new Set(result.scenario.relayHops);
    const stateById = new Map(result.stellarStates.map((state) => [state.sourceId, state]));
    const starEntities = (starsData.stars || []).map((star) => {
      const state = stateById.get(star.sourceId);
      return Object.freeze({
        id: star.sourceId,
        semanticType: 'stellar-system',
        label: state.name,
        coordinates: state.positionPc,
        quantities: Object.freeze({
          apparentMagnitudeG: star.photGMag,
          distancePc: state.distancePc,
          isRelayPathMember: selectedIds.has(star.sourceId),
          astrometricQualityRuwe: star.ruwe,
        }),
        evidenceReferences: Object.freeze([
          ...(state.sourceRowIds || []),
          state.modelReceipt.modelId,
        ]),
        truth: state.truth,
      });
    });
    const linkEntities = result.schedule.hops.map((hop, index) => Object.freeze({
        id: `relay-link:${index}`,
        semanticType: 'optical-link',
        label: `${stateById.get(hop.fromId).name} to ${stateById.get(hop.toId).name}`,
      coordinates: Object.freeze([
        stateById.get(hop.fromId).positionPc,
        stateById.get(hop.toId).positionPc,
      ]),
      quantities: Object.freeze({
        distancePc: hop.lightTime.distancePc,
        lightTimeYears: hop.lightTime.latencyYears,
        achievableDataRateGbps: result.linkBudgets[index].achievableDataRateGbps,
        linkMarginDb: result.linkBudgets[index].linkMarginDb,
        estimatedPacketSuccessProbability: result.linkBudgets[index].packetSuccessProbability,
        transmissionEnergyJ: hop.transmitDurationSeconds * result.linkBudgets[index].txPowerW,
        status: linkStatus(progressiveState, index),
      }),
      evidenceReferences: Object.freeze([
        ...stateById.get(hop.fromId).sourceRowIds,
        ...stateById.get(hop.toId).sourceRowIds,
        result.linkBudgets[index].modelReceipt.modelId,
        result.schedule.modelReceipt.modelId,
      ]),
      truth: result.linkBudgets[index].truth,
    }));
    const packetPosition = locatePacket(result, progressiveState, stateById);
    return Object.freeze({
      schema: 'simulatte.semanticPresentation.v4-draft',
      coordinateSystem: 'icrs-cartesian-pc',
      epoch: `J${result.targetEpochYear}`,
      layers: Object.freeze([
        Object.freeze({
          id: 'stellar-neighborhood',
          semanticLayerType: 'point-observations',
          entities: Object.freeze(starEntities),
          aggregationPolicy: Object.freeze({ kind: 'core-managed', semanticQuantity: 'apparentMagnitudeG' }),
          lodPolicy: Object.freeze({ kind: 'core-managed', priorityEntityIds: Object.freeze(result.scenario.relayHops.slice()) }),
          pickBehavior: 'inspect-provenance',
          temporalVisibility: 'entire-run',
        }),
        Object.freeze({
          id: 'relay-links',
          semanticLayerType: 'directed-flow',
          entities: Object.freeze(linkEntities),
          aggregationPolicy: Object.freeze({ kind: 'core-managed', semanticQuantity: 'achievableDataRateGbps' }),
          lodPolicy: Object.freeze({ kind: 'core-managed', priorityEntityIds: Object.freeze(linkEntities.map((row) => row.id)) }),
          pickBehavior: 'inspect-link-budget',
          temporalVisibility: 'event-state',
        }),
        Object.freeze({
          id: 'packet-state',
          semanticLayerType: 'temporal-packet',
          entities: Object.freeze([Object.freeze({
            id: result.packet.packetId,
            semanticType: 'information-packet',
            label: `Packet to ${stateById.get(result.scenario.targetId).name}`,
            coordinates: packetPosition,
            quantities: Object.freeze({
              bytes: result.packet.payloadBytes,
              status: progressiveState.status,
              elapsedSeconds: progressiveState.elapsedSeconds,
              activeHopIndex: progressiveState.activeHopIndex,
            }),
            evidenceReferences: Object.freeze([
              result.packet.integrity.packetHash,
              progressiveState.currentEventId || result.schedule.trace[0].id,
            ]),
            truth: Object.freeze({
              origin: 'simulated',
              temporalStatus: 'forecast',
              uncertainty: Object.freeze({
                kind: 'missing',
                value: Object.freeze({ reason: 'Packet and relay infrastructure are scenario entities.' }),
              }),
            }),
          })]),
          aggregationPolicy: Object.freeze({ kind: 'none' }),
          lodPolicy: Object.freeze({ kind: 'core-managed', priorityEntityIds: Object.freeze([result.packet.packetId]) }),
          pickBehavior: 'inspect-event',
          temporalVisibility: 'event-state',
        }),
      ]),
      renderedEvidenceContract: Object.freeze({
        objectEvidenceField: 'evidenceReferences',
        semanticQuantityField: 'quantities',
        finalStyleAuthority: 'core',
      }),
    });
  }

  function createViewIntents(result, progressiveState) {
    const activeHop = progressiveState.activeHopIndex === null
      ? null
      : result.schedule.hops[progressiveState.activeHopIndex];
    const targetIds = activeHop
      ? [activeHop.fromId, activeHop.toId]
      : result.scenario.relayHops;
    const mode = activeHop ? 'follow' : 'overview';
    return Object.freeze([Object.freeze({
      schema: 'simulatte.viewIntent.v1',
      id: `interstellar:${progressiveState.currentEventId || 'ready'}`,
      mode,
      targetIds: Object.freeze(targetIds.slice()),
      transitionReason: progressiveState.currentEventId
        ? `simulation-event:${progressiveState.currentEventId}`
        : 'scenario-ready',
      priority: activeHop ? 'domain-event' : 'context',
      expiresAtEventId: activeHop
        ? result.schedule.trace.find((event) => (
          event.kind === 'relay.packet-received'
          || event.kind === 'relay.packet-delivered'
        ) && event.affectedEntityIds.includes(activeHop.toId))?.id || null
        : null,
      allowsUserOverride: true,
    })]);
  }

  function createV3CompatibilityPresentation(starsData, result, progressiveState) {
    const semantic = createSemanticPresentation(starsData, result, progressiveState);
    const starLayer = semantic.layers.find((layer) => layer.id === 'stellar-neighborhood');
    const linkLayer = semantic.layers.find((layer) => layer.id === 'relay-links');
    const packetLayer = semantic.layers.find((layer) => layer.id === 'packet-state');
    return Object.freeze({
      schema: 'simulatte.pluginPresentation.v3',
      coordinateSystem: semantic.coordinateSystem,
      epoch: semantic.epoch,
      markers: starLayer.entities.map((entity) => ({
        id: entity.id,
        position: entity.coordinates,
        label: labelForStar(entity),
        tone: entity.quantities.isRelayPathMember ? 'cyan' : 'muted',
        radius: entity.quantities.isRelayPathMember ? 0.075 : 0.025,
      })),
      paths: linkLayer.entities.map((entity) => ({
        id: entity.id,
        coordinates: entity.coordinates,
        label: labelForLink(entity),
        tone: entity.quantities.status === 'completed' ? 'green' : entity.quantities.status === 'active' ? 'amber' : 'muted',
        width: 1,
      })),
      actors: packetLayer.entities.map((entity) => ({
        id: entity.id,
        position: entity.coordinates,
        label: `${entity.quantities.status} packet`,
        tone: entity.quantities.status === 'settled' ? 'green' : 'amber',
        radius: 0.045,
      })),
      areas: [],
      cameraTargets: [
        {
          id: 'stellar-neighborhood',
          label: 'Complete relay path',
          center: centroid(result.relayStates.map((row) => row.positionPc)),
          distance: extent(result.relayStates.map((row) => row.positionPc)) * 2.4,
        },
        ...result.scenario.relayHops.map((id) => ({
          id,
          label: result.stellarStates.find((row) => row.sourceId === id)?.name || id,
          center: result.stellarStates.find((row) => row.sourceId === id).positionPc,
          distance: 1.2,
        })),
      ],
    });
  }

  function locatePacket(result, state, stateById) {
    if (state.activeHopIndex === null) return stateById.get(state.packetLocationId)?.positionPc || [0, 0, 0];
    const hop = result.schedule.hops[state.activeHopIndex];
    const source = stateById.get(hop.fromId).positionPc;
    const target = stateById.get(hop.toId).positionPc;
    const span = Math.max(1, hop.receiveOffsetSeconds - hop.transmitOffsetSeconds);
    const progress = Math.max(0, Math.min(1, (state.elapsedSeconds - hop.transmitOffsetSeconds) / span));
    return source.map((value, index) => value + ((target[index] - value) * progress));
  }
  function linkStatus(state, index) {
    if (state.deliveredHopCount > index) return 'completed';
    if (state.activeHopIndex === index) return 'active';
    return 'pending';
  }
  function labelForStar(entity) {
    const distance = Number(entity.quantities.distancePc || 0).toFixed(3);
    return `${entity.label} · ${distance} pc`;
  }
  function labelForLink(entity) {
    const rateKbps = entity.quantities.achievableDataRateGbps * 1e6;
    return `${entity.quantities.lightTimeYears.toFixed(3)} y · ${rateKbps.toFixed(2)} kbps · ${entity.quantities.linkMarginDb.toFixed(1)} dB`;
  }
  function centroid(points) {
    if (!points.length) return [0, 0, 0];
    return [0, 1, 2].map((axis) => points.reduce((sum, point) => sum + point[axis], 0) / points.length);
  }
  function extent(points) {
    const center = centroid(points);
    return Math.max(0.5, ...points.map((point) => Math.hypot(...point.map((value, index) => value - center[index]))));
  }

  return Object.freeze({
    createSemanticPresentation,
    createViewIntents,
    createV3CompatibilityPresentation,
  });
});
