(function attachInterstellarPresentation(root, factory) {
  const api = factory();
  root.InterstellarRelayPresentation = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createInterstellarPresentationModule() {
  function createSemanticPresentation(starsData, result, progressiveState) {
    const selectedIds = new Set(result.scenario.relayHops);
    const stateById = new Map(result.stellarStates.map((state) => [state.sourceId, state]));
    const displayPositionById = new Map(result.stellarStates.map((state) => [
      state.sourceId,
      positionAtEpoch(state, progressiveState.timestamp),
    ]));
    const catalogById = new Map((starsData.stars || []).map((star) => [star.sourceId, star]));
    const spatialContract = createSpatialContract(result, progressiveState);
    const channelModelId = result.modelReceipts.find((row) => row.modelId.startsWith('interstellar-channel:'))?.modelId;
    const starEntities = result.stellarStates.map((state) => {
      const star = catalogById.get(state.sourceId);
      if (!star) throw new Error(`interstellar_presentation_star_missing: ${state.sourceId}`);
      const evidenceReferences = Object.freeze([
        ...(state.sourceRowIds || []),
        state.modelReceipt.modelId,
      ]);
      return Object.freeze({
        id: state.sourceId,
        semanticType: 'stellar-system',
        label: state.name,
        coordinates: displayPositionById.get(state.sourceId),
        quantities: Object.freeze({
          apparentMagnitudeG: star.photGMag,
          distancePc: state.distancePc,
          isRelayPathMember: selectedIds.has(state.sourceId),
          astrometricQualityRuwe: star.ruwe,
        }),
        spatialEvidence: spatialEvidence(displayPositionById.get(state.sourceId), evidenceReferences),
        evidenceReferences,
        omissions: Object.freeze([]),
        truth: state.truth,
      });
    });
    const linkEntities = result.schedule.hops.map((hop, index) => {
      const coordinates = Object.freeze([
        hop.lightTime.sourcePositionAtTransmissionPc,
        hop.lightTime.targetPositionAtArrivalPc,
      ]);
      const evidenceReferences = Object.freeze([
        ...stateById.get(hop.fromId).sourceRowIds,
        ...stateById.get(hop.toId).sourceRowIds,
        result.linkBudgets[index].modelReceipt.modelId,
        channelModelId,
        result.schedule.modelReceipt.modelId,
      ].filter(Boolean));
      return Object.freeze({
        id: `relay-link:${index}`,
        semanticType: result.controls.channelMode === 'classical-optical'
          ? 'optical-link'
          : 'advanced-information-channel',
        label: `${result.channelReceipts[index].label}: ${stateById.get(hop.fromId).name} to ${stateById.get(hop.toId).name}`,
        coordinates,
        spatialEvidence: pathSpatialEvidence(coordinates, evidenceReferences),
        quantities: Object.freeze({
          distancePc: hop.lightTime.distancePc,
          lightTimeYears: hop.lightTime.latencyYears,
          achievableDataRateGbps: result.channelReceipts[index].effectiveDataRateGbps,
          linkMarginDb: result.linkBudgets[index].linkMarginDb,
          physicalPacketSuccessProbability: result.channelReceipts[index].packetSuccessProbability,
          operationalDeliveryProbability: result.operations.deliveryProbability,
          channelMode: result.channelReceipts[index].mode,
          causalityStatus: result.channelReceipts[index].causalityStatus,
          constructibilityStatus: result.channelReceipts[index].constructibilityStatus,
          transmissionEnergyJ: result.channelReceipts[index].transmissionEnergyJ,
          status: linkStatus(progressiveState, index),
        }),
        reliabilityScope: result.reliabilityScope,
        omissions: result.omissions,
        evidenceReferences,
        truth: result.channelReceipts[index].truth,
      });
    });
    const alternativeEntities = routeAlternativeEntities(result, stateById, displayPositionById);
    const packetPosition = locatePacket(result, progressiveState, stateById);
    const packetEvidenceReferences = Object.freeze([
      result.packet.integrity.packetHash,
      progressiveState.currentEventId || result.schedule.trace[0].id,
      ...result.metrics.evidenceReferences,
    ]);
    return Object.freeze({
      schema: 'simulatte.semanticPresentation.v4-draft',
      coordinateSystem: 'icrs-cartesian-pc',
      epoch: progressiveState.timestamp || result.schedule.startEpochIso,
      spatialContract,
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
          id: 'route-alternatives',
          semanticLayerType: 'route-comparison',
          entities: Object.freeze(alternativeEntities),
          aggregationPolicy: Object.freeze({ kind: 'core-managed', semanticQuantity: 'score' }),
          lodPolicy: Object.freeze({ kind: 'core-managed', priorityEntityIds: Object.freeze(alternativeEntities.map((row) => row.id)) }),
          pickBehavior: 'inspect-route-candidate',
          temporalVisibility: 'entire-run',
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
              radialDistancePc: Math.hypot(...packetPosition),
              lineOfSightDepthPc: packetPosition[2],
              operationalDeliveryProbability: result.operations.deliveryProbability,
              channelMode: result.controls.channelMode,
            }),
            spatialEvidence: spatialEvidence(packetPosition, packetEvidenceReferences),
            reliabilityScope: result.reliabilityScope,
            omissions: result.omissions,
            evidenceReferences: packetEvidenceReferences,
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
        spatialEvidenceField: 'spatialEvidence',
        spatialContractId: spatialContract.id,
        finalStyleAuthority: 'core',
      }),
    });
  }

  function createViewIntents(result, progressiveState) {
    const activeHop = progressiveState.activeHopIndex === null
      ? null
      : result.schedule.hops[progressiveState.activeHopIndex];
    const targetIds = activeHop
      ? [result.packet.packetId]
      : result.scenario.relayHops;
    const mode = activeHop ? 'follow' : 'overview';
    const targetStates = activeHop
      ? [activeHop.fromId, activeHop.toId]
        .map((id) => result.stellarStates.find((row) => row.sourceId === id)).filter(Boolean)
      : targetIds.map((id) => result.stellarStates.find((row) => row.sourceId === id)).filter(Boolean);
    const framing = activeHop
      ? spatialFraming([
        locatePacket(result, progressiveState, new Map(result.stellarStates.map((row) => [row.sourceId, row]))),
        activeHop.lightTime.targetPositionAtArrivalPc,
      ])
      : spatialFraming(targetStates.map((row) => row.positionPc));
    return Object.freeze([Object.freeze({
      schema: 'simulatte.viewIntent.v1',
      id: `interstellar:${progressiveState.currentEventId || 'ready'}`,
      mode,
      targetIds: Object.freeze(targetIds.slice()),
      targetEvidenceReferences: Object.freeze(targetStates.flatMap((row) => row.sourceRowIds)),
      spatialContractId: 'interstellar:icrs-cartesian-pc:true-3d:v1',
      framing,
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
    const alternativeLayer = semantic.layers.find((layer) => layer.id === 'route-alternatives');
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
      paths: [
        ...linkLayer.entities.map((entity) => ({
          id: entity.id,
          coordinates: entity.coordinates,
          label: labelForLink(entity),
          tone: entity.quantities.status === 'completed' ? 'green' : entity.quantities.status === 'active' ? 'amber' : 'muted',
          width: 1,
        })),
        ...alternativeLayer.entities.map((entity) => ({
          id: entity.id,
          coordinates: entity.coordinates,
          label: `Candidate · score ${entity.quantities.score.toFixed(3)}`,
          tone: 'muted',
          width: 0.5,
        })),
      ],
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

  function routeAlternativeEntities(result, stateById, displayPositionById) {
    return result.routeSelection.alternatives
      .filter((row) => row.path.join(':') !== result.routeSelection.selectedPath.join(':'))
      .map((alternative, index) => {
        const coordinates = Object.freeze(alternative.path.map((id) => displayPositionById.get(id)));
        const references = Object.freeze([
          ...alternative.path.flatMap((id) => stateById.get(id).sourceRowIds),
          'interstellar-route-search-v1',
        ]);
        return Object.freeze({
          id: `route-alternative:${index}`,
          semanticType: 'route-alternative',
          label: alternative.path.map((id) => stateById.get(id).name).join(' → '),
          coordinates,
          spatialEvidence: pathSpatialEvidence(coordinates, references),
          quantities: Object.freeze({
            score: alternative.score,
            hopCount: alternative.metrics.hopCount,
            latencySeconds: alternative.metrics.latencySeconds,
            bottleneckDataRateGbps: alternative.metrics.bottleneckDataRateGbps,
            packetSuccessProbability: alternative.metrics.packetSuccessProbability,
          }),
          evidenceReferences: references,
          omissions: result.omissions,
          truth: Object.freeze({
            origin: 'modeled',
            temporalStatus: 'forecast',
            uncertainty: result.metrics.truth.uncertainty,
          }),
        });
      });
  }

  function locatePacket(result, state, stateById) {
    if (state.activeHopIndex === null) return stateById.get(state.packetLocationId)?.positionPc || [0, 0, 0];
    const hop = result.schedule.hops[state.activeHopIndex];
    const source = hop.lightTime.sourcePositionAtTransmissionPc || stateById.get(hop.fromId).positionPc;
    const target = hop.lightTime.targetPositionAtArrivalPc || stateById.get(hop.toId).positionPc;
    const span = Math.max(1, hop.receiveOffsetSeconds - hop.transmitOffsetSeconds);
    const progress = Math.max(0, Math.min(1, (state.elapsedSeconds - hop.transmitOffsetSeconds) / span));
    return source.map((value, index) => value + ((target[index] - value) * progress));
  }
  function positionAtEpoch(state, epochIso) {
    const epochYear = decimalYear(epochIso);
    const deltaYears = epochYear - Number(state.epochYear ?? epochYear);
    return state.positionPc.map((value, index) => value + (state.velocityPcYr?.[index] || 0) * deltaYears);
  }
  function decimalYear(epochIso) {
    const milliseconds = Date.parse(epochIso || '');
    if (!Number.isFinite(milliseconds)) return 0;
    const year = new Date(milliseconds).getUTCFullYear();
    const start = Date.UTC(year, 0, 1);
    return year + (milliseconds - start) / (Date.UTC(year + 1, 0, 1) - start);
  }
  function createSpatialContract(result, progressiveState) {
    return Object.freeze({
      schema: 'simulatte.interstellarSpatialContract.v1',
      id: 'interstellar:icrs-cartesian-pc:true-3d:v1',
      coordinateSystem: 'icrs-cartesian-pc',
      dimensions: 3,
      axisOrder: Object.freeze(['icrs-x', 'icrs-y', 'icrs-z']),
      units: 'parsec',
      origin: 'solar-system-barycentric-scenario-origin',
      epoch: progressiveState.timestamp || result.schedule.startEpochIso,
      scaleSemantics: 'true-distance',
      distanceSemantics: 'euclidean-3d-parsec',
      depthSemantics: 'signed-icrs-z-parsec-not-render-order',
      projectionPolicy: 'Core may project for display but must retain source 3D coordinates and evidence.',
      evidenceReferences: Object.freeze([
        ...result.relayStates.flatMap((row) => row.sourceRowIds),
        'linear-space-motion-v2',
      ]),
    });
  }
  function spatialEvidence(position, evidenceReferences) {
    return Object.freeze({
      spatialContractId: 'interstellar:icrs-cartesian-pc:true-3d:v1',
      positionPc: Object.freeze(position.slice()),
      radialDistancePc: Math.hypot(...position),
      lineOfSightDepthPc: position[2],
      evidenceReferences,
    });
  }
  function pathSpatialEvidence(coordinates, evidenceReferences) {
    const midpoint = centroid(coordinates);
    const euclideanLengthPc = coordinates.slice(1).reduce((total, point, index) => (
      total + Math.hypot(...point.map((value, axis) => value - coordinates[index][axis]))
    ), 0);
    return Object.freeze({
      spatialContractId: 'interstellar:icrs-cartesian-pc:true-3d:v1',
      endpointPositionsPc: Object.freeze(coordinates.map((row) => Object.freeze(row.slice()))),
      midpointPc: Object.freeze(midpoint),
      radialDistancePc: Math.hypot(...midpoint),
      lineOfSightDepthPc: midpoint[2],
      euclideanLengthPc,
      evidenceReferences,
    });
  }
  function spatialFraming(points) {
    const center = centroid(points);
    return Object.freeze({
      kind: 'evidence-bounding-sphere-3d',
      centerPc: Object.freeze(center),
      radiusPc: extent(points),
      preserveDepth: true,
      preserveTrueDistance: true,
      allowsUserOverride: true,
    });
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
