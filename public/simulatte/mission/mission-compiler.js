(function attachAutonomyMissionCompiler(root, factory) {
  const contracts = typeof module === 'object' && module.exports
    ? require('../../shared/contracts/contract-validator.js')
    : root.SimulatteAutonomyContracts;
  const capabilities = typeof module === 'object' && module.exports
    ? require('./capability-matrix.js')
    : root.SimulatteAutonomyCapabilities;
  const placeResolution = typeof module === 'object' && module.exports
    ? require('../runtime/neural-place-resolution-core.js')
    : root.SimulatteNeuralPlaceResolutionCore;
  const api = factory(contracts, capabilities, placeResolution);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteAutonomyMission = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createAutonomyMissionCompiler(contracts, capabilities, placeResolution) {
  const CLAIM_BOUNDARY = 'Known point-to-point and registered closed-circuit tasks only. Places, routed streets, and circuits resolve against governed artifacts. Optional model-backed place resolution can select only an existing governed node and cannot create a place, route, or capability.';
  const METERS_PER_UNIT = Object.freeze({ foot: 0.3048, meter: 1, kilometer: 1000, mile: 1609.344 });
  const SECONDS_PER_UNIT = Object.freeze({ second: 1, minute: 60, hour: 3600 });
  const DELIVERY_MODES = Object.freeze([
    { kind: 'bicycle', pattern: /\b(?:bike|bicycle|cycling)\b/ },
    { kind: 'scooter', pattern: /\b(?:scooter|scooting)\b/ },
    { kind: 'car', pattern: /\b(?:car|automobile|drive|driving)\b/ },
    { kind: 'pedestrian', pattern: /\b(?:walk|walking|on\s+foot|wheelchair|wheel\s+chair|roll|rolling|accessible|step[- ]free)\b/ },
  ]);
  const LOOP_MODES = Object.freeze([
    { kind: 'pedestrian', pattern: /\b(?:run|running|ran|jog|jogging|walk|walking)\b/ },
    { kind: 'bicycle', pattern: /\b(?:bike|bicycle|cycling|ride|riding)\b/ },
    { kind: 'scooter', pattern: /\b(?:scooter|scooting)\b/ },
    { kind: 'car', pattern: /\b(?:car|automobile|drive|driving)\b/ },
  ]);
  const STREET_WORDS = Object.freeze({
    avenue: 'av', ave: 'av', av: 'av', street: 'st', str: 'st', st: 'st', boulevard: 'blvd', blvd: 'blvd',
    road: 'rd', rd: 'rd', lane: 'ln', ln: 'ln', place: 'pl', pl: 'pl', square: 'sq', sq: 'sq',
  });
  const modeNodeCache = new WeakMap();

  function compileMission(sourceText, world, embodimentInput, options = {}) {
    const text = String(sourceText || '').trim();
    if (!text) throw missionError('source_text_missing', 'Mission text must name a supported task, mode, and grounded location');
    const lower = text.toLowerCase();
    const deliveryMatch = lexicalMatch(lower, /\bdeliver(?:y|ing|ed)?\b|\bparcel\b/);
    const loopMatch = lexicalMatch(lower, /\b(?:around|circles?|laps?|loop(?:ing)?)\b/);
    const pedestrianMatch = lexicalMatch(lower, LOOP_MODES[0].pattern);
    const deliveryMode = matchMode(lower, DELIVERY_MODES);
    if (deliveryMatch) return compileDeliveryMission(text, world, embodimentInput, deliveryMatch, deliveryMode, options);
    if (loopMatch) return compileLoopMission(text, world, embodimentInput, loopMatch);
    if ((deliveryMode || pedestrianMatch) && /\bfrom\b/.test(lower) && /\bto\b/.test(lower)) {
      return compilePointToPointMission(text, world, embodimentInput, deliveryMode || pedestrianMatch, options);
    }
    if (pedestrianMatch) throw missionError('loop_task_not_grounded', 'Pedestrian mission expected around, circle, lap, or loop');
    throw missionError('task_not_grounded', 'Mission expected a delivery or registered closed-circuit task');
  }

  async function compileMissionWithResolver(sourceText, world, embodimentInput, resolver) {
    try {
      return compileMission(sourceText, world, embodimentInput);
    } catch (error) {
      const expected = new Set(['origin_not_grounded', 'destination_not_grounded', 'from_place_ambiguous', 'to_place_ambiguous']);
      if (!resolver || !expected.has(error?.code)) throw error;
      const text = String(sourceText || '').trim();
      const namedNodes = world.nodes.filter((node) => node.landmark || !['intersection', 'pedestrian_waypoint'].includes(node.kind));
      const lexical = {
        origin: matchPlaceAfter(text, namedNodes, 'from'),
        destination: matchPlaceAfter(text, namedNodes, 'to'),
      };
      const missingRoles = ['origin', 'destination'].filter((role) => !lexical[role]);
      const modeMatch = matchMode(text.toLowerCase(), DELIVERY_MODES) || matchMode(text.toLowerCase(), LOOP_MODES);
      const eligibleNodeIds = eligiblePlaceNodeIds(world, modeMatch?.kind || null);
      const results = await resolver.resolveMany(missingRoles.map((role) => ({
        sourceText: text, role, embodimentKind: modeMatch?.kind || null, eligibleNodeIds,
      })));
      const placeResolutions = {};
      missingRoles.forEach((role, index) => {
        const result = results[index];
        if (!result || result.outcome !== 'resolve' || !result.nodeId) {
          throw missionError('neural_place_not_grounded', `Model-backed resolver refused mission ${role}`, {
            role,
            resolverId: resolver.id || 'unnamed-resolver',
            result: result || null,
            originalError: { code: error.code, message: error.message },
          });
        }
        placeResolutions[role] = result;
      });
      return compileMission(text, world, embodimentInput, {
        placeResolutions,
        placeResolutionReceipt: {
          schema: 'simulatte.missionPlaceResolution.v1',
          resolverId: resolver.id || 'unnamed-resolver',
          lane: 'hybrid_lexical_extended_typo_qwen_embedding',
          modelExecution: results.some((row) => row?.evidence?.lane === 'qwen_embedding_cosine'),
          roles: missingRoles.map((role, index) => ({ role, ...structuredClone(results[index]) })),
        },
      });
    }
  }

  function compileDeliveryMission(text, world, embodimentInput, deliveryMatch, deliveryMode, options = {}) {
    const lower = text.toLowerCase();
    if (!deliveryMatch) throw missionError('task_not_grounded', 'Delivery mission expected an explicit delivery or parcel term');
    if (!deliveryMode) throw missionError('mode_not_grounded', 'Delivery mission expected bicycle, scooter, car, or on-foot mode');
    const matrix = capabilities.buildCapabilityMatrix(world, embodimentInput);
    const capability = capabilities.requireCapability(matrix, {
      embodimentKind: deliveryMode.kind,
      missionFamily: 'delivery',
      terminationKind: 'arrival',
    });
    const embodiment = requireEmbodiment(embodimentInput, capability.embodimentId);
    const eligibleNodes = nodesForMode(world, embodiment.mode);
    const allowExtendedTypo = options.deterministicPlaceResolution !== 'legacy_constrained';
    const origin = resolvedPlaceOverride(text, world, 'origin', options, embodiment.mode) || matchPlaceAfter(text, eligibleNodes, 'from', allowExtendedTypo);
    const destination = resolvedPlaceOverride(text, world, 'destination', options, embodiment.mode) || matchPlaceAfter(text, eligibleNodes, 'to', allowExtendedTypo);
    if (!origin) throw missionError('origin_not_grounded', 'Mission origin must match a governed place label after "from"');
    if (!destination) throw missionError('destination_not_grounded', 'Mission destination must match a governed place label after "to"');
    const orderedStops = compileOrderedStops(text, eligibleNodes, destination);
    const finalDestination = orderedStops.at(-1);
    validateStopExtent(origin, orderedStops);
    const routeTerms = compileRouteTerms(text, world);
    const { protectedMatch, yieldMatch, avoidedStreet, deadline, compensation, temporal } = routeTerms;
    const evidence = [
      evidenceRow('task', text, deliveryMatch, 'exact_lexical'),
      evidenceRow('mode', text, deliveryMode, 'exact_lexical', embodiment.id, embodiment.kind),
      evidenceRow('origin', text, origin, placeEvidenceMethod(origin), origin.node.id, origin.node.label),
      ...orderedStopEvidence(text, orderedStops),
    ];
    appendRouteEvidence(evidence, text, routeTerms);
    const seed = hash32(text);
    return contracts.validateMission({
      schema: 'simulatte.autonomyMission.v3',
      id: `delivery-${seed.toString(16).padStart(8, '0')}`,
      sourceText: text,
      parser: parserReceipt(evidence, Boolean(options.placeResolutionReceipt)),
      capability,
      embodimentId: embodiment.id,
      task: { type: 'delivery', payloadId: 'parcel-1', stopNodeIds: orderedStops.map((row) => row.node.id) },
      originNodeId: origin.node.id,
      destinationNodeId: finalDestination.node.id,
      grounding: null,
      placeResolution: options.placeResolutionReceipt || null,
      constraints: {
        lanePreference: protectedMatch ? 'protected' : 'any',
        avoidStreetNames: avoidedStreet ? [avoidedStreet.canonicalName] : [],
        mustYieldToPedestrians: Boolean(yieldMatch),
        mustObeySignals: true,
        mustStayOnCircuit: false,
        maximumSpeedMps: embodiment.dynamics.maximumSpeedMps,
        maximumDurationSeconds: minimumNullable(deadline?.targetDurationSeconds, temporal.maximumDurationSeconds),
        departureLocalMinutes: temporal.departureLocalMinutes,
        arrivalDeadlineLocalMinutes: temporal.arrivalDeadlineLocalMinutes,
        daylightOnly: Boolean(temporal.daylightMatch),
        daylightWindowLocalMinutes: [...temporal.daylightWindowLocalMinutes],
      },
      obligations: [
        { id: 'obligation-arrival', kind: 'arrival', required: true },
        { id: 'obligation-payload', kind: 'payload_delivery', required: true },
        { id: 'obligation-ordered-stops', kind: 'ordered_stops', required: orderedStops.length > 1 },
        { id: 'obligation-signal', kind: 'signal_compliance', required: true },
        { id: 'obligation-pedestrian', kind: 'pedestrian_yield', required: true },
        { id: 'obligation-lane-preference', kind: 'lane_preference', required: Boolean(protectedMatch) },
        { id: 'obligation-street-avoidance', kind: 'street_avoidance', required: Boolean(avoidedStreet) },
        { id: 'obligation-arrival-deadline', kind: 'arrival_deadline', required: Boolean(deadline || temporal.arrivalMatch) },
        { id: 'obligation-daylight-window', kind: 'daylight_window', required: Boolean(temporal.daylightMatch) },
      ],
      economics: compensation,
      seed,
    }, world, embodiment);
  }

  function compilePointToPointMission(text, world, embodimentInput, modeMatch, options = {}) {
    const matrix = capabilities.buildCapabilityMatrix(world, embodimentInput);
    const capability = capabilities.requireCapability(matrix, {
      embodimentKind: modeMatch.kind,
      missionFamily: 'point_to_point',
      terminationKind: 'arrival',
    });
    const embodiment = requireEmbodiment(embodimentInput, capability.embodimentId);
    const eligibleNodes = nodesForMode(world, embodiment.mode);
    const allowExtendedTypo = options.deterministicPlaceResolution !== 'legacy_constrained';
    const origin = resolvedPlaceOverride(text, world, 'origin', options, embodiment.mode) || matchPlaceAfter(text, eligibleNodes, 'from', allowExtendedTypo);
    const destination = resolvedPlaceOverride(text, world, 'destination', options, embodiment.mode) || matchPlaceAfter(text, eligibleNodes, 'to', allowExtendedTypo);
    if (!origin) throw missionError('origin_not_grounded', 'Mission origin must match a governed place label after "from"');
    if (!destination) throw missionError('destination_not_grounded', 'Mission destination must match a governed place label after "to"');
    const orderedStops = compileOrderedStops(text, eligibleNodes, destination);
    const finalDestination = orderedStops.at(-1);
    validateStopExtent(origin, orderedStops);
    const routeTerms = compileRouteTerms(text, world);
    const { protectedMatch, yieldMatch, avoidedStreet, deadline, temporal } = routeTerms;
    const evidence = [
      evidenceRow('task', text, modeMatch, 'exact_lexical', null, 'point_to_point'),
      evidenceRow('mode', text, modeMatch, 'exact_lexical', embodiment.id, embodiment.kind),
      evidenceRow('origin', text, origin, placeEvidenceMethod(origin), origin.node.id, origin.node.label),
      ...orderedStopEvidence(text, orderedStops),
    ];
    appendRouteEvidence(evidence, text, routeTerms);
    const seed = hash32(text);
    return contracts.validateMission({
      schema: 'simulatte.autonomyMission.v3',
      id: `journey-${seed.toString(16).padStart(8, '0')}`,
      sourceText: text,
      parser: parserReceipt(evidence, Boolean(options.placeResolutionReceipt)),
      capability,
      embodimentId: embodiment.id,
      task: { type: 'point_to_point', stopNodeIds: orderedStops.map((row) => row.node.id) },
      originNodeId: origin.node.id,
      destinationNodeId: finalDestination.node.id,
      grounding: null,
      placeResolution: options.placeResolutionReceipt || null,
      constraints: {
        lanePreference: protectedMatch ? 'protected' : 'any',
        avoidStreetNames: avoidedStreet ? [avoidedStreet.canonicalName] : [],
        mustYieldToPedestrians: Boolean(yieldMatch) || embodiment.kind !== 'car',
        mustObeySignals: true,
        mustStayOnCircuit: false,
        maximumSpeedMps: embodiment.dynamics.maximumSpeedMps,
        maximumDurationSeconds: minimumNullable(deadline?.targetDurationSeconds, temporal.maximumDurationSeconds),
        departureLocalMinutes: temporal.departureLocalMinutes,
        arrivalDeadlineLocalMinutes: temporal.arrivalDeadlineLocalMinutes,
        daylightOnly: Boolean(temporal.daylightMatch),
        daylightWindowLocalMinutes: [...temporal.daylightWindowLocalMinutes],
      },
      obligations: [
        { id: 'obligation-arrival', kind: 'arrival', required: true },
        { id: 'obligation-ordered-stops', kind: 'ordered_stops', required: orderedStops.length > 1 },
        { id: 'obligation-signal', kind: 'signal_compliance', required: true },
        { id: 'obligation-pedestrian', kind: 'pedestrian_yield', required: true },
        { id: 'obligation-lane-preference', kind: 'lane_preference', required: Boolean(protectedMatch) },
        { id: 'obligation-street-avoidance', kind: 'street_avoidance', required: Boolean(avoidedStreet) },
        { id: 'obligation-arrival-deadline', kind: 'arrival_deadline', required: Boolean(deadline || temporal.arrivalMatch) },
        { id: 'obligation-daylight-window', kind: 'daylight_window', required: Boolean(temporal.daylightMatch) },
      ],
      economics: null,
      seed,
    }, world, embodiment);
  }

  function compileRouteTerms(text, world) {
    const lower = text.toLowerCase();
    return {
      protectedMatch: lexicalMatch(lower, /\bprotected\s+(?:lane|lanes|route|routes)\b/),
      yieldMatch: lexicalMatch(lower, /\byield(?:ing)?\s+to\s+pedestrians?\b/),
      avoidedStreet: matchAvoidedStreet(text, world),
      deadline: matchArrivalDeadline(text),
      compensation: matchCompensation(text),
      temporal: compileTemporalTerms(text, world),
    };
  }

  function appendRouteEvidence(evidence, text, terms) {
    if (terms.protectedMatch) evidence.push(evidenceRow('lanePreference', text, terms.protectedMatch, 'exact_lexical'));
    if (terms.yieldMatch) evidence.push(evidenceRow('pedestrianYield', text, terms.yieldMatch, 'exact_lexical'));
    if (terms.avoidedStreet) {
      const method = terms.avoidedStreet.sourceKind === 'routed_graph'
        ? terms.avoidedStreet.editDistance ? 'constrained_fuzzy_routed_street' : 'exact_routed_street'
        : terms.avoidedStreet.editDistance ? 'constrained_fuzzy_world_street' : 'exact_world_street';
      evidence.push(evidenceRow('streetAvoidance', text, terms.avoidedStreet, method, terms.avoidedStreet.id, terms.avoidedStreet.canonicalName));
    }
    if (terms.deadline) evidence.push(evidenceRow('maximumDuration', text, terms.deadline, 'unit_conversion', null, `${terms.deadline.targetDurationSeconds} s`));
    if (terms.compensation) evidence.push(evidenceRow('compensation', text, terms.compensation.match, 'currency_conversion', null, `${terms.compensation.amountCents} cents`));
    appendTemporalEvidence(evidence, text, terms.temporal);
  }

  function compileLoopMission(text, world, embodimentInput, loopMatch) {
    const lower = text.toLowerCase();
    const loopMode = matchMode(lower, LOOP_MODES);
    if (!loopMode) throw missionError('mode_not_grounded', 'Closed-circuit mission expected run, walk, bike, scooter, or car');
    const terminationMatch = matchLoopTermination(text);
    if (!terminationMatch) throw missionError('termination_not_grounded', 'Closed-circuit mission expected a distance, lap count, or elapsed-time target');
    const circuitMatch = matchCircuit(text, world.circuits || [], loopMatch, terminationMatch);
    if (!circuitMatch) throw missionError('circuit_not_grounded', 'Closed-circuit mission expected a declared circuit near the loop relation');
    const matrix = capabilities.buildCapabilityMatrix(world, embodimentInput);
    const capability = capabilities.requireCapability(matrix, {
      embodimentKind: loopMode.kind,
      missionFamily: 'closed_circuit',
      terminationKind: terminationMatch.kind,
      circuitId: circuitMatch.circuit.id,
    });
    const embodiment = requireEmbodiment(embodimentInput, capability.embodimentId);
    const boundaryMatch = fuzzyKeywordMatch(text, 'perimeter', 2);
    const gait = loopMode.kind === 'pedestrian' ? /walk/.test(loopMode.value) ? 'walk' : 'run' : 'ride';
    const maximumSpeedMps = Math.min(embodiment.dynamics.maximumSpeedMps, gait === 'walk' ? 1.8 : embodiment.dynamics.maximumSpeedMps);
    const termination = buildTermination(terminationMatch, circuitMatch.circuit);
    const temporal = compileTemporalTerms(text, world);
    const evidence = [
      evidenceRow('task', text, loopMatch, 'exact_lexical'),
      evidenceRow('mode', text, loopMode, 'exact_lexical', embodiment.id, embodiment.kind),
      evidenceRow('circuit', text, circuitMatch, circuitMatch.editDistance ? 'constrained_fuzzy_place' : 'exact_world_label', circuitMatch.circuit.id, circuitMatch.circuit.label),
      evidenceRow(terminationEvidenceField(termination.kind), text, terminationMatch, terminationEvidenceMethod(termination.kind), null, terminationCanonicalValue(termination)),
    ];
    if (boundaryMatch) evidence.push(evidenceRow('boundaryKind', text, boundaryMatch, boundaryMatch.editDistance ? 'constrained_fuzzy_keyword' : 'exact_lexical', null, 'perimeter'));
    appendTemporalEvidence(evidence, text, temporal);
    const seed = hash32(text);
    const targetDistanceM = termination.targetDistanceM ?? null;
    return contracts.validateMission({
      schema: 'simulatte.autonomyMission.v3',
      id: `loop-${seed.toString(16).padStart(8, '0')}`,
      sourceText: text,
      parser: parserReceipt(evidence),
      capability,
      embodimentId: embodiment.id,
      task: { type: 'loop', circuitId: circuitMatch.circuit.id, gait, termination },
      originNodeId: circuitMatch.circuit.nodeIds[0],
      destinationNodeId: null,
      grounding: {
        circuitId: circuitMatch.circuit.id,
        label: circuitMatch.circuit.label,
        nodeIds: [...circuitMatch.circuit.nodeIds],
        segmentIds: [...circuitMatch.circuit.segmentIds],
        circuitLengthM: circuitMatch.circuit.lengthM,
        fullLapsBeforeFinalPartial: targetDistanceM === null ? null : Math.floor(targetDistanceM / circuitMatch.circuit.lengthM),
        finalPartialDistanceM: targetDistanceM === null ? null : round(targetDistanceM % circuitMatch.circuit.lengthM),
        source: structuredClone(circuitMatch.circuit.source),
      },
      placeResolution: null,
      constraints: {
        lanePreference: 'any',
        avoidStreetNames: [],
        mustYieldToPedestrians: true,
        mustObeySignals: true,
        mustStayOnCircuit: true,
        maximumSpeedMps,
        maximumDurationSeconds: temporal.maximumDurationSeconds,
        departureLocalMinutes: temporal.departureLocalMinutes,
        arrivalDeadlineLocalMinutes: temporal.arrivalDeadlineLocalMinutes,
        daylightOnly: Boolean(temporal.daylightMatch),
        daylightWindowLocalMinutes: [...temporal.daylightWindowLocalMinutes],
      },
      obligations: [
        { id: `obligation-${termination.kind}-target`, kind: `${termination.kind}_target`, required: true },
        { id: 'obligation-closed-loop', kind: 'closed_loop', required: termination.kind === 'laps' || (targetDistanceM !== null && targetDistanceM >= circuitMatch.circuit.lengthM) },
        { id: 'obligation-boundary', kind: 'boundary_adherence', required: true },
        { id: 'obligation-lap-accounting', kind: 'lap_accounting', required: true },
        { id: 'obligation-pedestrian', kind: 'pedestrian_yield', required: true },
        { id: 'obligation-arrival-deadline', kind: 'arrival_deadline', required: temporal.arrivalDeadlineLocalMinutes !== null },
        { id: 'obligation-daylight-window', kind: 'daylight_window', required: Boolean(temporal.daylightMatch) },
      ],
      economics: null,
      seed,
    }, world, embodiment);
  }

  function buildTermination(match, circuit) {
    if (match.kind === 'distance') {
      const targetDistanceM = round(match.value * METERS_PER_UNIT[match.unit]);
      if (!(targetDistanceM > 0)) throw missionError('distance_not_positive', 'Distance target must be greater than zero');
      return {
        kind: 'distance',
        targetDistanceM,
        requestedDistance: { value: match.value, unit: match.unit, metersPerUnit: METERS_PER_UNIT[match.unit], convertedMeters: targetDistanceM },
      };
    }
    if (match.kind === 'laps') {
      if (!(match.value > 0)) throw missionError('lap_count_not_positive', 'Lap target must be greater than zero');
      return { kind: 'laps', targetLaps: match.value, targetDistanceM: round(match.value * circuit.lengthM) };
    }
    const targetDurationSeconds = round(match.value * SECONDS_PER_UNIT[match.unit]);
    if (!(targetDurationSeconds > 0)) throw missionError('duration_not_positive', 'Elapsed-time target must be greater than zero');
    return {
      kind: 'duration',
      targetDurationSeconds,
      requestedDuration: { value: match.value, unit: match.unit, secondsPerUnit: SECONDS_PER_UNIT[match.unit], convertedSeconds: targetDurationSeconds },
    };
  }

  function parserReceipt(evidence, hasExternalResolution = false) {
    const modelBacked = hasExternalResolution || evidence.some((row) => row.method === 'qwen_embedding_cosine');
    return {
      kind: modelBacked ? 'governed_hybrid_place_resolution' : 'deterministic_grounded_lexical',
      version: modelBacked ? 'simulatte.autonomyMissionParser.v4' : 'simulatte.autonomyMissionParser.v3',
      claimBoundary: CLAIM_BOUNDARY,
      evidence,
    };
  }

  function resolvedPlaceOverride(sourceText, world, role, options, mode = null) {
    const resolution = options.placeResolutions?.[role];
    if (!resolution) return null;
    const selected = world.nodes.find((row) => row.id === resolution.nodeId);
    const eligible = nodesForMode(world, mode);
    const eligibleIds = new Set(eligible.map((row) => row.id));
    const node = selected && eligibleIds.has(selected.id)
      ? selected
      : selected ? eligible.find((row) => row.label === selected.label) : null;
    if (!node) throw missionError('resolved_place_not_in_world', `${role} resolver selected unknown node ${resolution.nodeId}`);
    const queryText = String(resolution.evidence?.queryText || '').trim();
    const index = queryText ? sourceText.toLowerCase().indexOf(queryText.toLowerCase()) : -1;
    if (index < 0) throw missionError('resolved_place_span_missing', `${role} resolver query is not an exact source span`, { role, queryText });
    return {
      node,
      value: sourceText.slice(index, index + queryText.length),
      index,
      end: index + queryText.length,
      editDistance: resolution.evidence?.lane === 'extended_typo' ? resolution.evidence.ranking?.[0]?.distance || 0 : 0,
      resolution: structuredClone(resolution.evidence || {}),
    };
  }

  function nodesForMode(world, mode) {
    if (!mode) return world.nodes;
    let rowsByMode = modeNodeCache.get(world);
    if (!rowsByMode) {
      rowsByMode = new Map();
      modeNodeCache.set(world, rowsByMode);
    }
    if (rowsByMode.has(mode)) return rowsByMode.get(mode);
    const nodeIds = new Set();
    world.segments.forEach((segment) => {
      if (!segment.allowedModes.includes(mode)) return;
      nodeIds.add(segment.fromNodeId);
      nodeIds.add(segment.toNodeId);
    });
    const rows = world.nodes.filter((row) => nodeIds.has(row.id) && (!row.landmark?.modes || row.landmark.modes.includes(mode)));
    rowsByMode.set(mode, rows);
    return rows;
  }

  function placeEvidenceMethod(match) {
    if (match.resolution?.lane === 'qwen_embedding_cosine') return 'qwen_embedding_cosine';
    if (match.resolution?.lane === 'extended_typo') return 'extended_damerau_place';
    return match.editDistance ? 'constrained_fuzzy_place' : 'exact_world_label';
  }

  function requireEmbodiment(input, embodimentId) {
    const rows = Array.isArray(input) ? input : input ? [input] : [];
    const embodiment = rows.find((row) => row.id === embodimentId);
    if (!embodiment) throw missionError('embodiment_not_available', `Mission expected loaded embodiment ${embodimentId}`);
    return embodiment;
  }

  function matchMode(lower, definitions) {
    const rows = definitions.map((definition) => {
      const match = lexicalMatch(lower, definition.pattern);
      return match ? { ...match, kind: definition.kind } : null;
    }).filter(Boolean).sort((left, right) => left.index - right.index || left.kind.localeCompare(right.kind));
    if (rows.length > 1 && rows[0].index === rows[1].index) throw missionError('mode_ambiguous', `Mode matched both ${rows[0].kind} and ${rows[1].kind}`);
    return rows[0] || null;
  }

  function matchLoopTermination(sourceText) {
    const matches = [matchDistance(sourceText), matchLapCount(sourceText), matchDuration(sourceText)].filter(Boolean);
    if (matches.length > 1) throw missionError('termination_ambiguous', `Closed-circuit target matched ${matches.map((row) => row.kind).join(', ')}`);
    return matches[0] || null;
  }

  function matchDistance(sourceText) {
    const pattern = /\b(\d[\d,]*(?:\.\d+)?)\s*(feet|foot|ft|meters?|metres?|m|kilometers?|kilometres?|km|miles?|mi)\b/i;
    const match = pattern.exec(sourceText);
    if (!match) return null;
    const value = Number(match[1].replaceAll(',', ''));
    return Number.isFinite(value) ? sourceMatch(match, { kind: 'distance', value, unit: canonicalDistanceUnit(match[2]) }) : null;
  }

  function matchLapCount(sourceText) {
    const match = /\b(\d[\d,]*)\s*(?:full\s+)?laps?\b/i.exec(sourceText);
    if (!match) return null;
    const value = Number(match[1].replaceAll(',', ''));
    return Number.isSafeInteger(value) ? sourceMatch(match, { kind: 'laps', value, unit: 'lap' }) : null;
  }

  function matchDuration(sourceText) {
    const match = /\b(\d[\d,]*(?:\.\d+)?)\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?)\b/i.exec(sourceText);
    if (!match) return null;
    const value = Number(match[1].replaceAll(',', ''));
    return Number.isFinite(value) ? sourceMatch(match, { kind: 'duration', value, unit: canonicalDurationUnit(match[2]) }) : null;
  }

  function matchArrivalDeadline(sourceText) {
    const match = /\b(?:within|under|less\s+than|in)\s+(\d[\d,]*(?:\.\d+)?)\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?)\b/i.exec(sourceText);
    if (!match) return null;
    const value = Number(match[1].replaceAll(',', ''));
    const unit = canonicalDurationUnit(match[2]);
    if (!(value > 0)) return null;
    return sourceMatch(match, {
      kind: 'arrival_deadline',
      value,
      unit,
      targetDurationSeconds: round(value * SECONDS_PER_UNIT[unit]),
    });
  }

  function matchCompensation(sourceText) {
    const match = /(?:\$\s*(\d[\d,]*(?:\.\d{1,2})?)|\bfor\s+(\d[\d,]*(?:\.\d{1,2})?)\s+dollars?\b)/i.exec(sourceText);
    if (!match) return null;
    const value = Number((match[1] || match[2]).replaceAll(',', ''));
    if (!(value > 0)) return null;
    return {
      schema: 'simulatte.missionEconomics.v1',
      currency: 'USD',
      amountCents: Math.round(value * 100),
      basis: 'declared_gross_compensation',
      match: sourceMatch(match, {}),
      claimBoundary: 'Gross declared compensation divided by simulated journey time. This excludes waiting, expenses, taxes, platform deductions, and unpaid work unless a later batch contract includes them.',
    };
  }

  function compileTemporalTerms(sourceText, world) {
    const departureMatch = matchClockTime(sourceText, /\b(?:start(?:ing)?|depart(?:ing)?|leave|leaving)\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i, 'departure_time');
    const arrivalMatch = matchClockTime(sourceText, /\b(?:arrive|finish|arrival)\s+by\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i, 'arrival_deadline_time');
    const daylightMatch = lexicalMatch(sourceText.toLowerCase(), /\b(?:only\s+(?:in\s+)?daylight|daylight\s+only|before\s+dark|before\s+sunset)\b/);
    const departureLocalMinutes = departureMatch?.localMinutes ?? world.scenario?.defaultStartLocalMinutes ?? 720;
    const arrivalDeadlineLocalMinutes = arrivalMatch?.localMinutes ?? null;
    let maximumDurationSeconds = null;
    if (arrivalDeadlineLocalMinutes !== null) {
      const availableMinutes = arrivalDeadlineLocalMinutes - departureLocalMinutes;
      if (availableMinutes <= 0) throw missionError('arrival_deadline_precedes_departure', 'Arrival deadline must be later than the declared same-day departure time');
      maximumDurationSeconds = availableMinutes * 60;
    }
    return {
      departureMatch,
      arrivalMatch,
      daylightMatch,
      departureLocalMinutes,
      arrivalDeadlineLocalMinutes,
      maximumDurationSeconds,
      timeZone: world.scenario?.timeZone || 'America/New_York',
      daylightWindowLocalMinutes: world.scenario?.daylightWindowLocalMinutes || [360, 1200],
      daylightMethod: world.scenario?.daylightMethod || 'declared_default_daylight_window_v1',
    };
  }

  function matchClockTime(sourceText, pattern, kind) {
    const match = pattern.exec(sourceText);
    if (!match) return null;
    const hour = Number(match[1]);
    const minute = Number(match[2] || 0);
    if (hour < 1 || hour > 12 || minute < 0 || minute > 59) throw missionError('clock_time_invalid', `Clock time ${match[0]} is outside a 12-hour day`);
    const localMinutes = (hour % 12 + (match[3].toLowerCase() === 'pm' ? 12 : 0)) * 60 + minute;
    return sourceMatch(match, { kind, localMinutes });
  }

  function appendTemporalEvidence(evidence, text, temporal) {
    if (temporal.departureMatch) evidence.push(evidenceRow('departureTime', text, temporal.departureMatch, 'clock_time_conversion', null, `${temporal.departureLocalMinutes} local minutes`));
    if (temporal.arrivalMatch) evidence.push(evidenceRow('arrivalDeadlineTime', text, temporal.arrivalMatch, 'clock_time_conversion', null, `${temporal.arrivalDeadlineLocalMinutes} local minutes`));
    if (temporal.daylightMatch) evidence.push(evidenceRow('daylightOnly', text, temporal.daylightMatch, 'exact_lexical', null, temporal.daylightMethod));
  }

  function minimumNullable(...values) {
    const rows = values.filter(Number.isFinite);
    return rows.length ? Math.min(...rows) : null;
  }

  function sourceMatch(match, extension) {
    return { ...extension, index: match.index, end: match.index + match[0].length, editDistance: 0 };
  }

  function canonicalDistanceUnit(value) {
    const unit = value.toLowerCase();
    if (['feet', 'foot', 'ft'].includes(unit)) return 'foot';
    if (['m', 'meter', 'meters', 'metre', 'metres'].includes(unit)) return 'meter';
    if (['km', 'kilometer', 'kilometers', 'kilometre', 'kilometres'].includes(unit)) return 'kilometer';
    return 'mile';
  }

  function canonicalDurationUnit(value) {
    const unit = value.toLowerCase();
    if (/^sec/.test(unit)) return 'second';
    if (/^min/.test(unit)) return 'minute';
    return 'hour';
  }

  function matchCircuit(sourceText, circuits, loopMatch, terminationMatch) {
    const tokens = sourceTokens(sourceText);
    const candidates = [];
    circuits.forEach((circuit) => {
      [...new Set([circuit.label, ...(circuit.aliases || [])])].forEach((alias) => {
        collectTokenCandidates(tokens, normalizedWords(alias), (rows, editDistance, aliasLength) => {
          candidates.push({ circuit, index: rows[0].index, end: rows.at(-1).end, editDistance, aliasLength });
        });
      });
    });
    return bestGrounding(candidates, 'circuit_ambiguous', (row) => row.circuit.id);
  }

  function matchPlaceAfter(sourceText, nodes, preposition, allowExtendedTypo = true) {
    const namedNodes = nodes.filter((node) => node.landmark || !['intersection', 'pedestrian_waypoint'].includes(node.kind));
    const tokens = sourceTokens(sourceText);
    const markers = tokens.filter((row) => row.value.toLowerCase() === preposition);
    for (const marker of markers) {
      const after = tokens.filter((row) => row.index >= marker.end);
      const candidates = [];
      namedNodes.forEach((node) => {
        collectTokenCandidates(after, normalizedWords(node.label), (rows, editDistance, aliasLength) => {
          if (rows[0].index !== after[0]?.index) return;
          candidates.push({ node, value: sourceText.slice(rows[0].index, rows.at(-1).end), index: rows[0].index, end: rows.at(-1).end, editDistance, aliasLength });
        }, true);
      });
      if (candidates.length) return bestGrounding(candidates, `${preposition}_place_ambiguous`, (row) => row.node.id);
      if (!allowExtendedTypo) continue;
      const role = preposition === 'from' ? 'origin' : 'destination';
      const queryText = placeResolution.extractPlaceQuery(sourceText, role);
      const queryTokenCount = sourceTokens(queryText).length;
      const matchedRows = after.slice(0, queryTokenCount);
      const extended = placeResolution.resolveExtendedTypo(queryText, namedNodes.map((node) => ({
        placeId: `place-${node.id}`,
        nodeId: node.id,
        label: node.label,
      })));
      if (extended.outcome === 'resolve' && matchedRows.length === queryTokenCount) {
        const node = namedNodes.find((row) => row.id === extended.nodeId);
        if (!node) throw missionError('place_resolution_invalid', `Extended typo resolution selected missing node ${extended.nodeId}`);
        return {
          node,
          value: sourceText.slice(matchedRows[0].index, matchedRows.at(-1).end),
          index: matchedRows[0].index,
          end: matchedRows.at(-1).end,
          editDistance: extended.ranking[0].distance,
          aliasLength: extended.ranking[0].labelLength,
          resolution: {
            lane: 'extended_typo',
            policy: placeResolution.TYPO_POLICY,
            maximumDistance: extended.maximumDistance,
            distanceMargin: extended.distanceMargin,
            ranking: extended.ranking,
          },
        };
      }
    }
    return null;
  }

  function compileOrderedStops(sourceText, nodes, firstDestination) {
    const tokens = sourceTokens(sourceText);
    const markers = tokens
      .filter((row) => row.index >= firstDestination.end && ['then', 'return'].includes(row.value.toLowerCase()))
      .filter((marker) => {
        if (marker.value.toLowerCase() !== 'then') return true;
        const next = tokens.find((row) => row.index >= marker.end);
        return next?.value.toLowerCase() !== 'return';
      });
    const rows = [firstDestination];
    markers.forEach((marker) => {
      let after = tokens.filter((row) => row.index >= marker.end);
      while (after[0] && ['to', 'go', 'continue', 'visit', 'stop', 'return'].includes(after[0].value.toLowerCase())) after = after.slice(1);
      const candidates = [];
      nodes.forEach((node) => collectTokenCandidates(after, normalizedWords(node.label), (matched, editDistance, aliasLength) => {
        if (matched[0].index !== after[0]?.index) return;
        candidates.push({
          node,
          value: sourceText.slice(matched[0].index, matched.at(-1).end),
          index: matched[0].index,
          end: matched.at(-1).end,
          editDistance,
          aliasLength,
        });
      }, true));
      const selected = bestGrounding(candidates, 'ordered_stop_ambiguous', (row) => row.node.id);
      if (!selected) throw missionError('ordered_stop_not_grounded', 'Every ordered or return stop must begin with a governed place label');
      rows.push(selected);
    });
    return rows;
  }

  function validateStopExtent(origin, orderedStops) {
    const ids = [origin.node.id, ...orderedStops.map((row) => row.node.id)];
    if (ids.length < 2 || ids.slice(1).every((id) => id === ids[0])) throw missionError('route_has_no_extent', 'Mission must leave its origin');
    if (ids.some((id, index) => index > 0 && id === ids[index - 1])) throw missionError('ordered_stop_repeated', 'Consecutive ordered stops must differ');
  }

  function orderedStopEvidence(sourceText, orderedStops) {
    return orderedStops.map((row, index) => evidenceRow(
      index === orderedStops.length - 1 ? 'destination' : 'waypoint',
      sourceText,
      row,
      placeEvidenceMethod(row),
      row.node.id,
      row.node.label
    ));
  }

  function matchAvoidedStreet(sourceText, world) {
    const marker = /\bavoid(?:ing)?\b/i.exec(sourceText);
    if (!marker) return null;
    const tokens = sourceTokens(sourceText).filter((row) => row.index >= marker.index + marker[0].length);
    const routedNames = [...new Set(world.segments.map((segment) => segment.source?.street).filter(Boolean))];
    const match = matchStreetCatalog(sourceText, tokens, routedNames, 'routed_graph');
    if (match) return match;
    const visualNames = [...new Set((world.renderGeometry?.streets || []).map((street) => street.name).filter(Boolean))];
    const visual = matchStreetCatalog(sourceText, tokens, visualNames, 'display_geometry');
    if (visual) return visual;
    throw missionError('street_avoidance_not_grounded', 'Avoidance must name a street in governed route or display geometry');
  }

  function eligiblePlaceNodeIds(world, embodimentKind) {
    const mode = embodimentKind === 'bicycle' ? 'delivery_bike' : embodimentKind;
    if (!mode) return [];
    const connected = new Set();
    world.segments.forEach((segment) => {
      if (!segment.allowedModes.includes(mode)) return;
      connected.add(segment.fromNodeId);
      connected.add(segment.toNodeId);
    });
    return world.nodes.filter((node) => connected.has(node.id)
      && (node.landmark || !['intersection', 'pedestrian_waypoint'].includes(node.kind)))
      .map((node) => node.id).sort();
  }

  function matchStreetCatalog(sourceText, tokens, names, sourceKind) {
    const candidates = [];
    const canonicalByKey = new Map();
    names.forEach((name) => {
      const key = normalizedStreetWords(name).join(' ');
      if (!canonicalByKey.has(key)) canonicalByKey.set(key, name);
    });
    canonicalByKey.forEach((name) => {
      collectTokenCandidates(tokens, normalizedStreetWords(name), (rows, editDistance, aliasLength) => {
        if (rows[0].index !== tokens[0]?.index) return;
        candidates.push({
          id: `${sourceKind === 'routed_graph' ? 'routed' : 'display'}-street:${normalizedStreetWords(name).join('-')}`,
          canonicalName: name,
          sourceKind,
          value: sourceText.slice(rows[0].index, rows.at(-1).end),
          index: rows[0].index,
          end: rows.at(-1).end,
          editDistance,
          aliasLength,
        });
      }, true, normalizedStreetWords);
    });
    return bestGrounding(candidates, 'street_avoidance_ambiguous', (row) => row.canonicalName);
  }

  function collectTokenCandidates(tokens, targetTokens, collect, firstOnly = false, normalizer = normalizedWords) {
    if (!targetTokens.length || tokens.length < targetTokens.length) return;
    const maximumStart = firstOnly ? 0 : tokens.length - targetTokens.length;
    for (let index = 0; index <= maximumStart; index += 1) {
      const rows = tokens.slice(index, index + targetTokens.length);
      const candidate = normalizer(rows.map((row) => row.value).join(' ')).join(' ');
      const target = targetTokens.join(' ');
      const editDistance = levenshtein(candidate, target);
      const maximum = Math.max(1, Math.floor(target.length * 0.12));
      if (editDistance <= maximum) collect(rows, editDistance, target.length);
    }
  }

  function bestGrounding(candidates, ambiguityCode, identity) {
    candidates.sort((left, right) => left.editDistance - right.editDistance || right.aliasLength - left.aliasLength || left.index - right.index || identity(left).localeCompare(identity(right)));
    const best = candidates[0] || null;
    if (best && candidates[1] && best.editDistance === candidates[1].editDistance && best.aliasLength === candidates[1].aliasLength && identity(best) !== identity(candidates[1])) {
      throw missionError(ambiguityCode, `Grounding matched both ${identity(best)} and ${identity(candidates[1])}`);
    }
    return best;
  }

  function fuzzyKeywordMatch(sourceText, keyword, maximumDistance) {
    return sourceTokens(sourceText).map((row) => ({ ...row, editDistance: levenshtein(row.value.toLowerCase(), keyword) }))
      .filter((row) => row.editDistance <= maximumDistance)
      .sort((left, right) => left.editDistance - right.editDistance || left.index - right.index)[0] || null;
  }

  function sourceTokens(sourceText) {
    return [...sourceText.matchAll(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g)].map((match) => ({ value: match[0], index: match.index, end: match.index + match[0].length }));
  }

  function normalizedWords(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter((row) => row && row !== 'the');
  }

  function normalizedStreetWords(value) {
    return normalizedWords(value).map((word) => STREET_WORDS[word] || word);
  }

  function lexicalMatch(text, pattern) {
    const match = pattern.exec(text);
    return match ? { value: match[0], index: match.index, end: match.index + match[0].length, editDistance: 0 } : null;
  }

  function evidenceRow(field, sourceText, match, method, groundedId = null, canonicalValue = null) {
    return {
      field,
      value: sourceText.slice(match.index, match.end),
      start: match.index,
      end: match.end,
      method,
      groundedId,
      canonicalValue,
      editDistance: match.editDistance || 0,
    };
  }

  function terminationEvidenceField(kind) {
    return kind === 'distance' ? 'targetDistance' : kind === 'laps' ? 'targetLaps' : 'targetDuration';
  }

  function terminationEvidenceMethod(kind) {
    return kind === 'laps' ? 'lap_count_conversion' : 'unit_conversion';
  }

  function terminationCanonicalValue(termination) {
    if (termination.kind === 'distance') return `${termination.targetDistanceM} m`;
    if (termination.kind === 'laps') return `${termination.targetLaps} laps / ${termination.targetDistanceM} m`;
    return `${termination.targetDurationSeconds} s`;
  }

  function levenshtein(left, right) {
    const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
    for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
      const current = [leftIndex];
      for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
        current[rightIndex] = Math.min(current[rightIndex - 1] + 1, previous[rightIndex] + 1, previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1));
      }
      previous.splice(0, previous.length, ...current);
    }
    return previous[right.length];
  }

  function hash32(value) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function round(value) {
    return Number(value.toFixed(9));
  }

  function missionError(code, message, evidence = null) {
    const error = new Error(`${code}: ${message}`);
    error.name = 'AutonomyMissionError';
    error.code = code;
    error.evidence = evidence;
    return error;
  }

  return {
    CLAIM_BOUNDARY,
    METERS_PER_UNIT,
    SECONDS_PER_UNIT,
    compileMission,
    compileMissionWithResolver,
    eligiblePlaceNodeIds,
    hash32,
    levenshtein,
    matchDistance,
    matchDuration,
    matchLapCount,
    matchArrivalDeadline,
    matchCompensation,
  };
});
