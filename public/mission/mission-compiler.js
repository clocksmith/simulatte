(function attachAutonomyMissionCompiler(root, factory) {
  const contracts = typeof module === 'object' && module.exports
    ? require('../contracts/contract-validator.js')
    : root.SimulatteAutonomyContracts;
  const api = factory(contracts);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteAutonomyMission = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createAutonomyMissionCompiler(contracts) {
  const CLAIM_BOUNDARY = 'Known delivery and closed-circuit distance tasks only. Places resolve against declared world nodes or circuits; constrained spelling correction cannot create a new place.';
  const METERS_PER_UNIT = Object.freeze({
    foot: 0.3048,
    meter: 1,
    kilometer: 1000,
    mile: 1609.344,
  });
  const DELIVERY_MODES = Object.freeze([
    { kind: 'bicycle', pattern: /\b(?:bike|bicycle|cycling)\b/ },
    { kind: 'scooter', pattern: /\b(?:scooter|scooting)\b/ },
    { kind: 'car', pattern: /\b(?:car|automobile|driving)\b/ },
    { kind: 'pedestrian', pattern: /\b(?:walk|walking|on\s+foot)\b/ },
  ]);

  function compileMission(sourceText, world, embodimentInput) {
    const text = String(sourceText || '').trim();
    if (!text) throw missionError('source_text_missing', 'Mission text must name a supported task, mode, and grounded location');
    const lower = text.toLowerCase();
    const deliveryMatch = lexicalMatch(lower, /\bdeliver(?:y|ing|ed)?\b|\bparcel\b/);
    const pedestrianMatch = lexicalMatch(lower, /\b(?:run|running|ran|jog|jogging|walk|walking)\b/);
    const loopMatch = lexicalMatch(lower, /\b(?:around|circles?|laps?|loop(?:ing)?)\b/);
    const deliveryMode = matchDeliveryMode(lower);
    if (loopMatch) return compileLoopMission(text, world, embodimentInput, pedestrianMatch, loopMatch);
    if (deliveryMatch || deliveryMode) return compileDeliveryMission(text, world, embodimentInput, deliveryMatch, deliveryMode);
    if (pedestrianMatch) throw missionError('loop_task_not_grounded', 'Pedestrian mission expected around, circle, lap, or loop');
    throw missionError('task_not_grounded', 'Mission expected a delivery or a pedestrian loop-distance task');
  }

  function compileDeliveryMission(text, world, embodimentInput, deliveryMatch, deliveryMode) {
    const lower = text.toLowerCase();
    if (!deliveryMatch) throw missionError('task_not_grounded', 'Delivery mission expected an explicit delivery or parcel term');
    if (!deliveryMode) throw missionError('mode_not_grounded', 'Delivery mission expected bicycle, scooter, car, or on-foot mode');
    const embodiment = requireEmbodiment(embodimentInput, { taskType: 'delivery', kind: deliveryMode.kind });
    const origin = matchPlaceAfter(text, world.nodes, 'from');
    const destination = matchPlaceAfter(text, world.nodes, 'to');
    if (!origin) throw missionError('origin_not_grounded', 'Mission origin must match a world node label after "from"');
    if (!destination) throw missionError('destination_not_grounded', 'Mission destination must match a world node label after "to"');
    if (origin.node.id === destination.node.id) throw missionError('route_has_no_extent', 'Mission origin and destination must differ');
    const protectedMatch = lexicalMatch(lower, /\bprotected\s+(?:lane|lanes|route|routes)\b/);
    const yieldMatch = lexicalMatch(lower, /\byield(?:ing)?\s+to\s+pedestrians?\b/);
    const evidence = [
      evidenceRow('task', text, deliveryMatch, 'exact_lexical'),
      evidenceRow('mode', text, deliveryMode, 'exact_lexical', embodiment.id, embodiment.kind),
      evidenceRow('origin', text, origin, 'exact_world_label', origin.node.id),
      evidenceRow('destination', text, destination, 'exact_world_label', destination.node.id),
    ];
    if (protectedMatch) evidence.push(evidenceRow('lanePreference', text, protectedMatch, 'exact_lexical'));
    if (yieldMatch) evidence.push(evidenceRow('pedestrianYield', text, yieldMatch, 'exact_lexical'));
    const seed = hash32(text);
    return contracts.validateMission({
      schema: 'simulatte.autonomyMission.v2',
      id: `delivery-${seed.toString(16).padStart(8, '0')}`,
      sourceText: text,
      parser: parserReceipt(evidence),
      embodimentId: embodiment.id,
      task: { type: 'delivery', payloadId: 'parcel-1' },
      originNodeId: origin.node.id,
      destinationNodeId: destination.node.id,
      grounding: null,
      constraints: {
        lanePreference: protectedMatch ? 'protected' : 'any',
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
      ],
      seed,
    }, world, embodiment);
  }

  function matchDeliveryMode(lower) {
    const rows = DELIVERY_MODES.map((definition) => {
      const match = lexicalMatch(lower, definition.pattern);
      return match ? { ...match, kind: definition.kind } : null;
    }).filter(Boolean).sort((left, right) => left.index - right.index || left.kind.localeCompare(right.kind));
    if (rows.length > 1 && rows[0].index === rows[1].index) throw missionError('mode_ambiguous', `Delivery mode matched both ${rows[0].kind} and ${rows[1].kind}`);
    return rows[0] || null;
  }

  function compileLoopMission(text, world, embodimentInput, pedestrianMatch, loopMatch) {
    if (!pedestrianMatch) throw missionError('mode_not_grounded', 'Loop-distance mission expected run, jog, or walk');
    if (!loopMatch) throw missionError('loop_task_not_grounded', 'Pedestrian mission expected around, circle, lap, or loop');
    const embodiment = requireEmbodiment(embodimentInput, { taskType: 'loop_distance', kind: 'pedestrian' });
    const distanceMatch = matchDistance(text);
    if (!distanceMatch) throw missionError('distance_not_grounded', 'Loop-distance mission expected a number followed by feet, meters, kilometers, or miles');
    const circuit = matchCircuit(text, world.circuits || [], loopMatch, distanceMatch);
    if (!circuit) throw missionError('circuit_not_grounded', 'Loop-distance mission expected a declared circuit near the loop relation');
    const boundaryMatch = fuzzyKeywordMatch(text, 'perimeter', 2);
    const targetDistanceM = round(distanceMatch.value * METERS_PER_UNIT[distanceMatch.unit]);
    if (!(targetDistanceM > 0)) throw missionError('distance_not_positive', 'Loop-distance target must be greater than zero');
    const gait = /walk/.test(pedestrianMatch.value) ? 'walk' : 'run';
    const maximumSpeedMps = Math.min(embodiment.dynamics.maximumSpeedMps, gait === 'walk' ? 1.8 : 4.5);
    const evidence = [
      evidenceRow('task', text, loopMatch, 'exact_lexical'),
      evidenceRow('mode', text, pedestrianMatch, 'exact_lexical', embodiment.id),
      evidenceRow('circuit', text, circuit, circuit.editDistance ? 'constrained_fuzzy_place' : 'exact_world_label', circuit.circuit.id, circuit.circuit.label),
      evidenceRow('targetDistance', text, distanceMatch, 'unit_conversion', null, `${targetDistanceM} m`),
    ];
    if (boundaryMatch) evidence.push(evidenceRow('boundaryKind', text, boundaryMatch, boundaryMatch.editDistance ? 'constrained_fuzzy_keyword' : 'exact_lexical', null, 'perimeter'));
    const seed = hash32(text);
    const source = structuredClone(circuit.circuit.source);
    return contracts.validateMission({
      schema: 'simulatte.autonomyMission.v2',
      id: `loop-distance-${seed.toString(16).padStart(8, '0')}`,
      sourceText: text,
      parser: parserReceipt(evidence),
      embodimentId: embodiment.id,
      task: {
        type: 'loop_distance',
        circuitId: circuit.circuit.id,
        gait,
        targetDistanceM,
        requestedDistance: {
          value: distanceMatch.value,
          unit: distanceMatch.unit,
          metersPerUnit: METERS_PER_UNIT[distanceMatch.unit],
          convertedMeters: targetDistanceM,
        },
      },
      originNodeId: circuit.circuit.nodeIds[0],
      destinationNodeId: null,
      grounding: {
        circuitId: circuit.circuit.id,
        label: circuit.circuit.label,
        nodeIds: [...circuit.circuit.nodeIds],
        segmentIds: [...circuit.circuit.segmentIds],
        circuitLengthM: circuit.circuit.lengthM,
        fullLapsBeforeFinalPartial: Math.floor(targetDistanceM / circuit.circuit.lengthM),
        finalPartialDistanceM: round(targetDistanceM % circuit.circuit.lengthM),
        source,
      },
      constraints: {
        lanePreference: 'any',
        mustYieldToPedestrians: true,
        mustObeySignals: true,
        mustStayOnCircuit: true,
        maximumSpeedMps,
      },
      obligations: [
        { id: 'obligation-distance-target', kind: 'distance_target', required: true },
        { id: 'obligation-closed-loop', kind: 'closed_loop', required: true },
        { id: 'obligation-boundary', kind: 'boundary_adherence', required: true },
        { id: 'obligation-lap-accounting', kind: 'lap_accounting', required: true },
        { id: 'obligation-pedestrian', kind: 'pedestrian_yield', required: true },
      ],
      seed,
    }, world, embodiment);
  }

  function parserReceipt(evidence) {
    return {
      kind: 'deterministic_grounded_lexical',
      version: 'simulatte.autonomyMissionParser.v2',
      claimBoundary: CLAIM_BOUNDARY,
      evidence,
    };
  }

  function requireEmbodiment(input, { taskType, kind }) {
    const rows = Array.isArray(input) ? input : input ? [input] : [];
    const embodiment = rows.find((row) => row.kind === kind && row.supportedTaskTypes.includes(taskType));
    if (!embodiment) throw missionError('embodiment_not_available', `Mission expected a loaded ${kind} embodiment supporting ${taskType}`);
    return embodiment;
  }

  function matchDistance(sourceText) {
    const pattern = /\b(\d[\d,]*(?:\.\d+)?)\s*(feet|foot|ft|meters?|metres?|m|kilometers?|kilometres?|km|miles?|mi)\b/i;
    const match = pattern.exec(sourceText);
    if (!match) return null;
    const unit = canonicalDistanceUnit(match[2]);
    const value = Number(match[1].replaceAll(',', ''));
    if (!Number.isFinite(value)) return null;
    return { value, unit, index: match.index, end: match.index + match[0].length, editDistance: 0 };
  }

  function canonicalDistanceUnit(value) {
    const unit = value.toLowerCase();
    if (['feet', 'foot', 'ft'].includes(unit)) return 'foot';
    if (['m', 'meter', 'meters', 'metre', 'metres'].includes(unit)) return 'meter';
    if (['km', 'kilometer', 'kilometers', 'kilometre', 'kilometres'].includes(unit)) return 'kilometer';
    return 'mile';
  }

  function matchCircuit(sourceText, circuits, loopMatch, distanceMatch) {
    const tokens = sourceTokens(sourceText).filter((row) => row.index >= loopMatch.end && row.index < distanceMatch.index);
    const candidates = [];
    circuits.forEach((circuit) => {
      const aliases = [...new Set([circuit.label, ...(circuit.aliases || [])])];
      aliases.forEach((alias) => {
        const aliasTokens = normalizedWords(alias);
        for (let index = 0; index <= tokens.length - aliasTokens.length; index += 1) {
          const rows = tokens.slice(index, index + aliasTokens.length);
          const candidate = normalizedWords(rows.map((row) => row.value).join(' ')).join(' ');
          const target = aliasTokens.join(' ');
          const editDistance = levenshtein(candidate, target);
          const maximum = Math.max(1, Math.floor(target.length * 0.12));
          if (editDistance <= maximum) {
            candidates.push({ circuit, index: rows[0].index, end: rows.at(-1).end, editDistance, aliasLength: target.length });
          }
        }
      });
    });
    candidates.sort((left, right) => left.editDistance - right.editDistance || right.aliasLength - left.aliasLength || left.index - right.index || left.circuit.id.localeCompare(right.circuit.id));
    const best = candidates[0] || null;
    if (best && candidates[1] && best.editDistance === candidates[1].editDistance && best.aliasLength === candidates[1].aliasLength && best.circuit.id !== candidates[1].circuit.id) {
      throw missionError('circuit_ambiguous', `Loop place matched both ${best.circuit.id} and ${candidates[1].circuit.id}`);
    }
    return best;
  }

  function fuzzyKeywordMatch(sourceText, keyword, maximumDistance) {
    const rows = sourceTokens(sourceText).map((row) => ({ ...row, editDistance: levenshtein(row.value.toLowerCase(), keyword) }))
      .filter((row) => row.editDistance <= maximumDistance)
      .sort((left, right) => left.editDistance - right.editDistance || left.index - right.index);
    return rows[0] || null;
  }

  function sourceTokens(sourceText) {
    return [...sourceText.matchAll(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g)].map((match) => ({
      value: match[0],
      index: match.index,
      end: match.index + match[0].length,
    }));
  }

  function normalizedWords(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter((row) => row && row !== 'the');
  }

  function lexicalMatch(text, pattern) {
    const match = pattern.exec(text);
    if (!match) return null;
    return { value: match[0], index: match.index, end: match.index + match[0].length, editDistance: 0 };
  }

  function matchPlaceAfter(sourceText, nodes, preposition) {
    const lower = sourceText.toLowerCase();
    const matches = nodes.map((node) => {
      const label = String(node.label || '').toLowerCase();
      const phrase = `${preposition} ${label}`;
      const phraseIndex = lower.indexOf(phrase);
      if (phraseIndex < 0) return null;
      const index = phraseIndex + preposition.length + 1;
      return { node, value: sourceText.slice(index, index + label.length), index, end: index + label.length, editDistance: 0 };
    }).filter(Boolean);
    matches.sort((left, right) => left.index - right.index || right.value.length - left.value.length || left.node.id.localeCompare(right.node.id));
    return matches[0] || null;
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

  function levenshtein(left, right) {
    const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
    for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
      const current = [leftIndex];
      for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
        current[rightIndex] = Math.min(
          current[rightIndex - 1] + 1,
          previous[rightIndex] + 1,
          previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1)
        );
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

  function missionError(code, message) {
    const error = new Error(`${code}: ${message}`);
    error.name = 'AutonomyMissionError';
    error.code = code;
    return error;
  }

  return { CLAIM_BOUNDARY, METERS_PER_UNIT, compileMission, hash32, levenshtein, matchDistance };
});
