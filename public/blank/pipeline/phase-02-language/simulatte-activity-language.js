(function registerActivityLanguage(root) {
  const registry = typeof module === 'object' && module.exports
    ? require('../../app/runtime/phase-module-registry.js') : root.SimulattePhaseModuleRegistry;
  const VERBS = { stand:'stand', stands:'stand', standing:'stand', walk: 'walk', walks: 'walk', walking: 'walk', sit: 'sit', sits: 'sit', sitting: 'sit',
    hold: 'hold', holds: 'hold', holding: 'hold', carry: 'hold', carries: 'hold', carrying: 'hold',
    drink: 'drink', drinks: 'drink', drinking: 'drink', place: 'place', places: 'place', placing: 'place' };
  function extractActivityLanguage(graph, capabilities) {
    const text = graph.sourceText;
    const spans = graph.spans.map(row=>VERBS[row.text.toLowerCase()]&&/^stand/.test(row.text.toLowerCase()) ? {...row,kind:'process',semanticRole:null} : row);
    const actors = spans.filter(row => row.semanticRole === 'agent' && row.visualArchetype === 'person');
    const verbs = spans.filter(row => row.kind === 'process' && VERBS[row.text.toLowerCase()]);
    if (!actors.length || !verbs.length) return graph;
    const handSpans = new Set();
    const requests = [];
    let actor = null, previous = null;
    for (let i = 0; i < verbs.length; i++) {
      const verb = verbs[i], end = verbs[i + 1]?.start ?? text.length;
      const explicit = actors.filter(row => row.end <= verb.start && (!previous || row.start > previous.end)).at(-1);
      actor = explicit || actor;
      if (!actor) continue;
      const tail = text.slice(verb.end, end);
      const hand = /\b(left|right)\s+hand\b/i.exec(tail);
      const durationSpan=/\bfor\s+\d+(?:\.\d+)?\s+seconds?\b/i.exec(tail);
      if(durationSpan){const start=verb.end+durationSpan.index,stop=start+durationSpan[0].length;for(const span of spans)if(span.start>=start&&span.end<=stop&&/^seconds?$/i.test(span.text))handSpans.add(span.id);}
      if (hand) {
        const start = verb.end + hand.index, stop = start + hand[0].length;
        for (const span of spans) if (span.start >= start && span.end <= stop) handSpans.add(span.id);
      }
      const action = VERBS[verb.text.toLowerCase()];
      const object = ['walk','stand'].includes(action) ? null : spans.find(row => row.start >= verb.end && row.end <= end &&
        ['entity', 'term'].includes(row.kind) && !handSpans.has(row.id));
      const support = action==='place' ? spans.find(row=>row.start>=(object?.end??end)&&row.end<=end&&['entity','term'].includes(row.kind)&&!handSpans.has(row.id)&&/table|shelf|surface|bench/i.test(row.text)) : null;
      const definiteReference = object && /\bthe\s+$/i.test(text.slice(verb.end,object.start));
      const between = previous ? text.slice(previous.end, verb.start) : '';
      const sequential = /\b(?:then|afterward|afterwards|after that)\b/i.test(between);
      const duration = /\bfor\s+(\d+(?:\.\d+)?)\s+seconds?\b/i.exec(tail);
      requests.push({ id: `activity:${verb.id}`, action, actorSpanId: actor.id, objectSpanId: object?.id || null,
        supportSpanId:support?.id||null, definiteReference:Boolean(definiteReference),
        hand: hand ? hand[1].toLowerCase() : null, negated: verb.negated === true,
        handEvidence: hand ? { start: verb.end + hand.index, end: verb.end + hand.index + hand[0].length } : null,
        timing: { after: sequential ? requests.at(-1)?.id || null : null,
          simultaneous: !sequential && requests.length > 0, durationSeconds: duration ? Number(duration[1]) : null },
        evidence: { source: 'phase2-language', verbSpanId: verb.id, sourceSpanIds: [actor.id, verb.id, object?.id, support?.id].filter(Boolean),
          start: verb.start, end, text: text.slice(verb.start, end) } });
      previous = verb;
    }
    // A hand qualifier addresses an actor part; it is not an additional scene object.
    for (const span of spans) if (/^(then|afterward|afterwards|while|simultaneously)$/i.test(span.text)) handSpans.add(span.id);
    const remaining = spans.filter(row => !handSpans.has(row.id));
    const actionByVerb = new Map(requests.map(row => [row.evidence.verbSpanId, row]));
    const clauses = graph.clauses.filter(row => !handSpans.has(row.subjectSpanId) && !handSpans.has(row.objectSpanId))
      .map(row => {
        const request = actionByVerb.get(row.verbSpanId);
        return request ? { ...row, subjectSpanId: request.actorSpanId, objectSpanId: request.objectSpanId,
          process: request.action, activityRequestId: request.id } : row;
      });
    return { ...graph, spans: remaining, clauses,
      predicates: clauses.map(row => ({ ...row })),
      relations: graph.relations.filter(row => !handSpans.has(row.sourceSpanId) && !handSpans.has(row.targetSpanId))
        .map(row => actionByVerb.has(row.targetSpanId) ? { ...row, sourceSpanId: actionByVerb.get(row.targetSpanId).actorSpanId } : row),
      modifiers: graph.modifiers.filter(row => !handSpans.has(row.targetSpanId) && !handSpans.has(row.modifierSpanId)),
      activityRequests: requests, activityCapabilities: capabilities };
  }
  registry.define('physicsModel', 'simulatte-activity-language.js', { extractActivityLanguage });
})(typeof globalThis !== 'undefined' ? globalThis : window);
