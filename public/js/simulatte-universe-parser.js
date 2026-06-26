(function attachSimulatteUniverseParser(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.SimulatteUniverseParser = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createUniverseParserApi() {
  const PROMPT_PARSE_SCHEMA = 'simulatte.promptParse.v1';

  const ENTITY_PHRASES = [
    ['castle wall', 'entity'], ['black hole', 'entity'], ['solar panel', 'entity'],
    ['blade array', 'entity'], ['dry pine', 'entity'], ['traffic queue', 'entity'],
    ['glass tower', 'entity'], ['bridge cables', 'entity'], ['bridge cable', 'entity'],
    ['feedback shock', 'entity'], ['basalt delta', 'environment'], ['quartz wetland', 'environment'],
    ['lava', 'material'], ['magma', 'material'], ['turbine', 'entity'],
    ['rotor', 'entity'], ['shaft', 'entity'], ['castle', 'entity'],
    ['wall', 'entity'], ['ice', 'material'], ['river', 'entity'],
    ['water', 'material'], ['projectile', 'entity'], ['stone', 'material'],
    ['rocket', 'entity'], ['exhaust', 'entity'], ['fuel', 'material'],
    ['swamp', 'environment'], ['wetland', 'environment'], ['hammer', 'entity'],
    ['glass', 'material'], ['gold', 'material'], ['piano', 'entity'],
    ['volcano', 'entity'], ['submarine', 'entity'], ['algae', 'entity'],
    ['storm', 'environment'], ['cloud', 'environment'], ['wind', 'entity'],
    ['fire', 'entity'], ['flame', 'entity'], ['magnet', 'entity'],
    ['wheel', 'entity'], ['lens', 'entity'], ['prism', 'entity'],
    ['mirror', 'entity'], ['tower', 'entity'], ['bridge', 'entity'],
    ['cable', 'entity'], ['cables', 'entity'], ['wave', 'entity'], ['waves', 'entity'],
    ['city', 'environment'], ['traffic', 'entity'],
    ['queue', 'entity'], ['packet', 'entity'], ['market', 'entity'],
    ['network', 'entity'], ['feedback', 'entity'], ['shock', 'entity'],
    ['sand', 'material'], ['rock', 'material'], ['basalt', 'material'],
    ['rain', 'entity'], ['quartz', 'material'], ['cathedral', 'entity'],
    ['jellyfish', 'entity'], ['entropy', 'observable'], ['soul', 'entity'],
  ];

  const PROCESS_PHRASES = [
    'spins', 'spin', 'rotates', 'rotate', 'melts', 'melt', 'hits', 'hit',
    'impacts', 'impact', 'burns', 'burn', 'flows', 'flow', 'falls', 'fall',
    'collides', 'collide', 'fractures', 'fracture', 'cracks', 'crack',
    'pushes', 'push', 'drives', 'drive', 'heats', 'heat', 'cools', 'cool',
    'diffuses', 'diffuse', 'oscillates', 'oscillate', 'trades', 'trade',
    'eats', 'eat', 'splits', 'split', 'joins', 'join', 'carves', 'carve',
    'erodes', 'erode', 'grows', 'grow', 'flexes', 'flex', 'waves', 'wave',
  ];

  const MODIFIER_PHRASES = [
    ['hot', 'temperature'], ['cold', 'temperature'], ['molten', 'phase'],
    ['viscous', 'material'], ['brittle', 'material'], ['elastic', 'material'],
    ['fast', 'rate'], ['slow', 'rate'], ['glowing', 'emission'],
    ['magnetic', 'field'], ['electric', 'field'], ['near', 'location'],
    ['through', 'relation'], ['into', 'relation'], ['under', 'location'],
    ['over', 'location'], ['made of', 'materialRelation'],
  ];

  const OBSERVABLE_PHRASES = [
    'energy', 'temperature', 'speed', 'velocity', 'stress', 'pressure',
    'phase', 'damage', 'angular velocity', 'flow', 'torque', 'output',
  ];

  function parsePrompt(promptInput = '') {
    const prompt = String(promptInput || '');
    const lower = prompt.toLowerCase();
    const tokenRows = tokenize(prompt);
    const spans = [];
    addPhraseSpans(spans, lower, ENTITY_PHRASES, tokenRows);
    addPhraseSpans(spans, lower, PROCESS_PHRASES.map((text) => [text, 'process']), tokenRows);
    addPhraseSpans(spans, lower, MODIFIER_PHRASES.map(([text]) => [text, 'modifier']), tokenRows);
    addPhraseSpans(spans, lower, OBSERVABLE_PHRASES.map((text) => [text, 'observable']), tokenRows);
    const compact = dedupeSpans(spans)
      .sort((a, b) => a.start - b.start || b.end - a.end)
      .map((span, index) => ({ ...span, id: `span${index + 1}` }));
    const clauses = buildClauses(compact, lower);
    const modifiers = buildModifiers(compact);
    return {
      schema: PROMPT_PARSE_SCHEMA,
      prompt,
      tokens: tokenRows.map(({ text, start, end }) => ({ text, start, end })),
      spans: compact,
      clauses,
      modifiers,
    };
  }

  function tokenize(prompt) {
    const rows = [];
    const matcher = /[a-z0-9]+(?:'[a-z0-9]+)?/gi;
    let match = matcher.exec(prompt);
    while (match) {
      rows.push({ text: match[0].toLowerCase(), start: match.index, end: match.index + match[0].length });
      match = matcher.exec(prompt);
    }
    return rows;
  }

  function addPhraseSpans(spans, lower, phraseRows, tokens) {
    for (const [phrase, kind] of phraseRows) {
      const needle = phrase.toLowerCase();
      const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\ /g, '\\s+');
      const matcher = new RegExp(`\\b${escaped}\\b`, 'gi');
      let match = matcher.exec(lower);
      while (match) {
        const start = match.index;
        const end = match.index + match[0].length;
        const tokenStart = tokens.findIndex((token) => token.start >= start && token.end <= end);
        const tokenEnd = lastTokenInRange(tokens, start, end);
        spans.push({
          text: lower.slice(start, end),
          kind,
          start,
          end,
          tokenStart,
          tokenEnd,
        });
        match = matcher.exec(lower);
      }
    }
  }

  function lastTokenInRange(tokens, start, end) {
    let found = -1;
    for (let index = 0; index < tokens.length; index += 1) {
      if (tokens[index].start >= start && tokens[index].end <= end) found = index;
    }
    return found;
  }

  function dedupeSpans(spans) {
    const sorted = spans.slice().sort((a, b) => {
      const lenA = a.end - a.start;
      const lenB = b.end - b.start;
      return a.start - b.start || lenB - lenA || a.kind.localeCompare(b.kind);
    });
    const out = [];
    for (const span of sorted) {
      const same = out.some((row) => row.start === span.start && row.end === span.end && row.kind === span.kind);
      if (same) continue;
      const covered = out.some((row) => (
        row.kind !== 'process' &&
        span.kind !== 'process' &&
        row.start <= span.start &&
        row.end >= span.end &&
        row.text !== span.text
      ));
      if (!covered) out.push(span);
    }
    return out;
  }

  function buildClauses(spans, lower) {
    const entities = spans.filter((span) => span.kind === 'entity' || span.kind === 'material' || span.kind === 'environment');
    const processes = spans.filter((span) => span.kind === 'process');
    const clauses = [];
    for (const verb of processes) {
      const before = entities.filter((span) => span.end <= verb.start).sort((a, b) => b.end - a.end)[0] || null;
      const after = entities.filter((span) => span.start >= verb.end).sort((a, b) => a.start - b.start)[0] || null;
      if (!before && !after) continue;
      clauses.push({
        subjectSpanId: before ? before.id : null,
        verbSpanId: verb.id,
        objectSpanId: after ? after.id : null,
        process: normalizeProcess(verb.text),
        prepositions: nearbyPrepositions(lower, verb.end, after ? after.start : verb.end + 24),
      });
    }
    if (!clauses.length && entities.length > 1) {
      clauses.push({
        subjectSpanId: entities[0].id,
        verbSpanId: null,
        objectSpanId: entities[1].id,
        process: 'coexists',
        prepositions: nearbyPrepositions(lower, entities[0].end, entities[1].start),
      });
    }
    return clauses.map((clause, index) => ({ id: `clause${index + 1}`, ...clause }));
  }

  function nearbyPrepositions(lower, start, end) {
    const slice = lower.slice(Math.max(0, start), Math.max(start, end + 1));
    return ['near', 'into', 'through', 'onto', 'on', 'under', 'over', 'with', 'by', 'from', 'to']
      .filter((word) => new RegExp(`\\b${word}\\b`).test(slice));
  }

  function normalizeProcess(text = '') {
    const value = String(text || '').toLowerCase();
    if (/spin|rotate|drive/.test(value)) return 'rotate';
    if (/melt/.test(value)) return 'phase_transition';
    if (/hit|impact|collide|crack|fracture/.test(value)) return 'impact';
    if (/burn|heat/.test(value)) return 'heat_transfer';
    if (/cool/.test(value)) return 'cooling';
    if (/flow|fall|push|carve|erode/.test(value)) return 'flow';
    if (/diffuse/.test(value)) return 'diffusion';
    if (/oscillate|flex|wave/.test(value)) return 'oscillation';
    if (/grow/.test(value)) return 'growth';
    if (/trade/.test(value)) return 'exchange';
    if (/split/.test(value)) return 'split';
    if (/join/.test(value)) return 'join';
    if (/eat/.test(value)) return 'consume';
    return value || 'interact';
  }

  function buildModifiers(spans) {
    const targets = spans.filter((span) => span.kind === 'entity' || span.kind === 'material' || span.kind === 'environment');
    const modifiers = spans.filter((span) => span.kind === 'modifier');
    return modifiers
      .map((modifier, index) => {
        const target = nearestSpan(modifier, targets);
        if (!target) return null;
        return {
          id: `modifier${index + 1}`,
          targetSpanId: target.id,
          modifierSpanId: modifier.id,
          relation: modifierRelation(modifier.text),
        };
      })
      .filter(Boolean);
  }

  function nearestSpan(source, spans) {
    let best = null;
    let bestDistance = Infinity;
    for (const span of spans) {
      if (span.id === source.id) continue;
      const distance = Math.min(Math.abs(span.start - source.end), Math.abs(source.start - span.end));
      if (distance < bestDistance) {
        best = span;
        bestDistance = distance;
      }
    }
    return best;
  }

  function modifierRelation(text) {
    const row = MODIFIER_PHRASES.find(([phrase]) => phrase === text);
    return row ? row[1] : 'modifier';
  }

  return {
    PROMPT_PARSE_SCHEMA,
    parsePrompt,
  };
});
