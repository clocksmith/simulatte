(function attachAutonomyMissionCompiler(root, factory) {
  const contracts = typeof module === 'object' && module.exports
    ? require('../contracts/contract-validator.js')
    : root.SimulatteAutonomyContracts;
  const capabilities = typeof module === 'object' && module.exports
    ? require('./capability-matrix.js')
    : root.SimulatteAutonomyCapabilities;
  const api = factory(contracts, capabilities);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteAutonomyMission = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createAutonomyMissionCompiler(contracts, capabilities) {
  const CLAIM_BOUNDARY = 'Known delivery and registered closed-circuit tasks only. Places, routed streets, and circuits resolve against governed artifacts; constrained spelling correction cannot create a new artifact.';
  const METERS_PER_UNIT = Object.freeze({ foot: 0.3048, meter: 1, kilometer: 1000, mile: 1609.344 });
  const SECONDS_PER_UNIT = Object.freeze({ second: 1, minute: 60, hour: 3600 });
  const DELIVERY_MODES = Object.freeze([
    { kind: 'bicycle', pattern: /\b(?:bike|bicycle|cycling)\b/ },
    { kind: 'scooter', pattern: /\b(?:scooter|scooting)\b/ },
    { kind: 'car', pattern: /\b(?:car|automobile|driving)\b/ },
    { kind: 'pedestrian', pattern: /\b(?:walk|walking|on\s+foot)\b/ },
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

  function compileMission(sourceText, world, embodimentInput) {
    const text = String(sourceText || '').trim();
    if (!text) throw missionError('source_text_missing', 'Mission text must name a supported task, mode, and grounded location');
    const lower = text.toLowerCase();
    const deliveryMatch = lexicalMatch(lower, /\bdeliver(?:y|ing|ed)?\b|\bparcel\b/);
    const loopMatch = lexicalMatch(lower, /\b(?:around|circles?|laps?|loop(?:ing)?)\b/);
    const pedestrianMatch = lexicalMatch(lower, LOOP_MODES[0].pattern);
    if (loopMatch) return compileLoopMission(text, world, embodimentInput, loopMatch);
    const deliveryMode = matchMode(lower, DELIVERY_MODES);
    if (deliveryMatch || deliveryMode) return compileDeliveryMission(text, world, embodimentInput, deliveryMatch, deliveryMode);
    if (pedestrianMatch && /\bfrom\b/.test(lower) && /\bto\b/.test(lower)) {
      const matrix = capabilities.buildCapabilityMatrix(world, embodimentInput);
      capabilities.requireCapability(matrix, { embodimentKind: 'pedestrian', missionFamily: 'point_to_point', terminationKind: 'arrival' });
    }
    if (pedestrianMatch) throw missionError('loop_task_not_grounded', 'Pedestrian mission expected around, circle, lap, or loop');
    throw missionError('task_not_grounded', 'Mission expected a delivery or registered closed-circuit task');
  }

  function compileDeliveryMission(text, world, embodimentInput, deliveryMatch, deliveryMode) {
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
    const origin = matchPlaceAfter(text, world.nodes, 'from');
    const destination = matchPlaceAfter(text, world.nodes, 'to');
    if (!origin) throw missionError('origin_not_grounded', 'Mission origin must match a governed place label after "from"');
    if (!destination) throw missionError('destination_not_grounded', 'Mission destination must match a governed place label after "to"');
    if (origin.node.id === destination.node.id) throw missionError('route_has_no_extent', 'Mission origin and destination must differ');
    const protectedMatch = lexicalMatch(lower, /\bprotected\s+(?:lane|lanes|route|routes)\b/);
    const yieldMatch = lexicalMatch(lower, /\byield(?:ing)?\s+to\s+pedestrians?\b/);
    const avoidedStreet = matchAvoidedStreet(text, world);
    const evidence = [
      evidenceRow('task', text, deliveryMatch, 'exact_lexical'),
      evidenceRow('mode', text, deliveryMode, 'exact_lexical', embodiment.id, embodiment.kind),
      evidenceRow('origin', text, origin, origin.editDistance ? 'constrained_fuzzy_place' : 'exact_world_label', origin.node.id, origin.node.label),
      evidenceRow('destination', text, destination, destination.editDistance ? 'constrained_fuzzy_place' : 'exact_world_label', destination.node.id, destination.node.label),
    ];
    if (protectedMatch) evidence.push(evidenceRow('lanePreference', text, protectedMatch, 'exact_lexical'));
    if (yieldMatch) evidence.push(evidenceRow('pedestrianYield', text, yieldMatch, 'exact_lexical'));
    if (avoidedStreet) evidence.push(evidenceRow('streetAvoidance', text, avoidedStreet, avoidedStreet.editDistance ? 'constrained_fuzzy_routed_street' : 'exact_routed_street', avoidedStreet.id, avoidedStreet.canonicalName));
    const seed = hash32(text);
    return contracts.validateMission({
      schema: 'simulatte.autonomyMission.v3',
      id: `delivery-${seed.toString(16).padStart(8, '0')}`,
      sourceText: text,
      parser: parserReceipt(evidence),
      capability,
      embodimentId: embodiment.id,
      task: { type: 'delivery', payloadId: 'parcel-1' },
      originNodeId: origin.node.id,
      destinationNodeId: destination.node.id,
      grounding: null,
      constraints: {
        lanePreference: protectedMatch ? 'protected' : 'any',
        avoidStreetNames: avoidedStreet ? [avoidedStreet.canonicalName] : [],
        mustYieldToPedestrians: Boolean(yieldMatch),
        mustObeySignals: true,
        mustStayOnCircuit: false,
        maximumSpeedMps: embodiment.dynamics.maximumSpeedMps,
      },
      obligations: [
        { id: 'obligation-arrival', kind: 'arrival', required: true },
        { id: 'obligation-payload', kind: 'payload_delivery', required: true },
        { id: 'obligation-signal', kind: 'signal_compliance', required: true },
        { id: 'obligation-pedestrian', kind: 'pedestrian_yield', required: true },
        { id: 'obligation-lane-preference', kind: 'lane_preference', required: Boolean(protectedMatch) },
        { id: 'obligation-street-avoidance', kind: 'street_avoidance', required: Boolean(avoidedStreet) },
      ],
      seed,
    }, world, embodiment);
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
    const evidence = [
      evidenceRow('task', text, loopMatch, 'exact_lexical'),
      evidenceRow('mode', text, loopMode, 'exact_lexical', embodiment.id, embodiment.kind),
      evidenceRow('circuit', text, circuitMatch, circuitMatch.editDistance ? 'constrained_fuzzy_place' : 'exact_world_label', circuitMatch.circuit.id, circuitMatch.circuit.label),
      evidenceRow(terminationEvidenceField(termination.kind), text, terminationMatch, terminationEvidenceMethod(termination.kind), null, terminationCanonicalValue(termination)),
    ];
    if (boundaryMatch) evidence.push(evidenceRow('boundaryKind', text, boundaryMatch, boundaryMatch.editDistance ? 'constrained_fuzzy_keyword' : 'exact_lexical', null, 'perimeter'));
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
      constraints: {
        lanePreference: 'any',
        avoidStreetNames: [],
        mustYieldToPedestrians: true,
        mustObeySignals: true,
        mustStayOnCircuit: true,
        maximumSpeedMps,
      },
      obligations: [
        { id: `obligation-${termination.kind}-target`, kind: `${termination.kind}_target`, required: true },
        { id: 'obligation-closed-loop', kind: 'closed_loop', required: termination.kind === 'laps' || (targetDistanceM !== null && targetDistanceM >= circuitMatch.circuit.lengthM) },
        { id: 'obligation-boundary', kind: 'boundary_adherence', required: true },
        { id: 'obligation-lap-accounting', kind: 'lap_accounting', required: true },
        { id: 'obligation-pedestrian', kind: 'pedestrian_yield', required: true },
      ],
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

  function parserReceipt(evidence) {
    return { kind: 'deterministic_grounded_lexical', version: 'simulatte.autonomyMissionParser.v3', claimBoundary: CLAIM_BOUNDARY, evidence };
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
    const tokens = sourceTokens(sourceText).filter((row) => row.index >= loopMatch.end && row.index < terminationMatch.index);
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

  function matchPlaceAfter(sourceText, nodes, preposition) {
    const namedNodes = nodes.filter((node) => node.landmark || !['intersection', 'pedestrian_waypoint'].includes(node.kind));
    const tokens = sourceTokens(sourceText);
    const markers = tokens.filter((row) => row.value.toLowerCase() === preposition);
    const candidates = [];
    markers.forEach((marker) => {
      const after = tokens.filter((row) => row.index >= marker.end);
      namedNodes.forEach((node) => {
        collectTokenCandidates(after, normalizedWords(node.label), (rows, editDistance, aliasLength) => {
          if (rows[0].index !== after[0]?.index) return;
          candidates.push({ node, value: sourceText.slice(rows[0].index, rows.at(-1).end), index: rows[0].index, end: rows.at(-1).end, editDistance, aliasLength });
        }, true);
      });
    });
    return bestGrounding(candidates, `${preposition}_place_ambiguous`, (row) => row.node.id);
  }

  function matchAvoidedStreet(sourceText, world) {
    const marker = /\bavoid(?:ing)?\b/i.exec(sourceText);
    if (!marker) return null;
    const tokens = sourceTokens(sourceText).filter((row) => row.index >= marker.index + marker[0].length);
    const routedNames = [...new Set(world.segments.map((segment) => segment.source?.street).filter(Boolean))];
    const match = matchStreetCatalog(sourceText, tokens, routedNames);
    if (match) return match;
    const visualNames = [...new Set((world.renderGeometry?.streets || []).map((street) => street.name).filter(Boolean))];
    const visual = matchStreetCatalog(sourceText, tokens, visualNames);
    if (visual) {
      throw missionError('street_not_routable', `${visual.canonicalName} exists in display geometry but not in the governed routing graph`, {
        streetName: visual.canonicalName,
        displayGeometryOnly: true,
      });
    }
    throw missionError('street_avoidance_not_grounded', 'Avoidance must name a street in the governed routing graph');
  }

  function matchStreetCatalog(sourceText, tokens, names) {
    const candidates = [];
    names.forEach((name) => {
      collectTokenCandidates(tokens, normalizedStreetWords(name), (rows, editDistance, aliasLength) => {
        if (rows[0].index !== tokens[0]?.index) return;
        candidates.push({
          id: `routed-street:${normalizedStreetWords(name).join('-')}`,
          canonicalName: name,
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
    hash32,
    levenshtein,
    matchDistance,
    matchDuration,
    matchLapCount,
  };
});
