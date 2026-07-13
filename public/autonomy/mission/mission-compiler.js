(function attachAutonomyMissionCompiler(root, factory) {
  const contracts = typeof module === 'object' && module.exports
    ? require('../contracts/contract-validator.js')
    : root.SimulatteAutonomyContracts;
  const api = factory(contracts);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteAutonomyMission = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createAutonomyMissionCompiler(contracts) {
  const CLAIM_BOUNDARY = 'Known-label delivery-bike parser only. Unmatched places, modes, and tasks fail instead of being inferred.';

  function compileMission(sourceText, world, embodiment) {
    const text = String(sourceText || '').trim();
    if (!text) throw missionError('source_text_missing', 'Mission text must name a delivery, mode, origin, and destination');
    const lower = text.toLowerCase();
    const taskMatch = lexicalMatch(lower, /\bdeliver(?:y|ing|ed)?\b|\bparcel\b/);
    if (!taskMatch) throw missionError('task_not_grounded', 'Mission expected an explicit delivery or parcel term');
    const modeMatch = lexicalMatch(lower, /\b(?:bike|bicycle|cycling)\b/);
    if (!modeMatch) throw missionError('mode_not_grounded', 'Mission expected bike, bicycle, or cycling for delivery-bike-v1');
    const origin = matchPlaceAfter(text, world.nodes, 'from');
    const destination = matchPlaceAfter(text, world.nodes, 'to');
    if (!origin) throw missionError('origin_not_grounded', 'Mission origin must match a world node label after "from"');
    if (!destination) throw missionError('destination_not_grounded', 'Mission destination must match a world node label after "to"');
    if (origin.node.id === destination.node.id) throw missionError('route_has_no_extent', 'Mission origin and destination must differ');

    const protectedMatch = lexicalMatch(lower, /\bprotected\s+(?:lane|lanes|route|routes)\b/);
    const yieldMatch = lexicalMatch(lower, /\byield(?:ing)?\s+to\s+pedestrians?\b/);
    const evidence = [
      evidenceRow('task', text.slice(taskMatch.index, taskMatch.end), taskMatch.index, taskMatch.end),
      evidenceRow('mode', text.slice(modeMatch.index, modeMatch.end), modeMatch.index, modeMatch.end),
      evidenceRow('origin', origin.value, origin.index, origin.end),
      evidenceRow('destination', destination.value, destination.index, destination.end),
    ];
    if (protectedMatch) evidence.push(evidenceRow('lanePreference', text.slice(protectedMatch.index, protectedMatch.end), protectedMatch.index, protectedMatch.end));
    if (yieldMatch) evidence.push(evidenceRow('pedestrianYield', text.slice(yieldMatch.index, yieldMatch.end), yieldMatch.index, yieldMatch.end));
    const seed = hash32(text);
    const mission = {
      schema: 'simulatte.autonomyMission.v1',
      id: `delivery-${seed.toString(16).padStart(8, '0')}`,
      sourceText: text,
      parser: {
        kind: 'deterministic_lexical',
        version: 'simulatte.autonomyMissionParser.v1',
        claimBoundary: CLAIM_BOUNDARY,
        evidence,
      },
      embodimentId: embodiment.id,
      task: { type: 'delivery', payloadId: 'parcel-1' },
      originNodeId: origin.node.id,
      destinationNodeId: destination.node.id,
      constraints: {
        lanePreference: protectedMatch ? 'protected' : 'any',
        mustYieldToPedestrians: Boolean(yieldMatch),
        mustObeySignals: true,
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
    };
    return contracts.validateMission(mission, world, embodiment);
  }

  function lexicalMatch(text, pattern) {
    const match = pattern.exec(text);
    if (!match) return null;
    return { value: match[0], index: match.index, end: match.index + match[0].length };
  }

  function matchPlaceAfter(sourceText, nodes, preposition) {
    const lower = sourceText.toLowerCase();
    const matches = nodes.map((node) => {
      const label = String(node.label || '').toLowerCase();
      const phrase = `${preposition} ${label}`;
      const phraseIndex = lower.indexOf(phrase);
      if (phraseIndex < 0) return null;
      const index = phraseIndex + preposition.length + 1;
      return { node, value: sourceText.slice(index, index + label.length), index, end: index + label.length };
    }).filter(Boolean);
    matches.sort((left, right) => left.index - right.index || right.value.length - left.value.length || left.node.id.localeCompare(right.node.id));
    return matches[0] || null;
  }

  function evidenceRow(field, value, start, end) {
    return { field, value, start, end };
  }

  function hash32(value) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function missionError(code, message) {
    const error = new Error(`${code}: ${message}`);
    error.name = 'AutonomyMissionError';
    error.code = code;
    return error;
  }

  return { compileMission, hash32 };
});
