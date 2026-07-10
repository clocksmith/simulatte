(function attachSimulatteUniverseParser(root, factory) {
  const lexiconApi = typeof module === 'object' && module.exports
    ? require('../../data/simulatte-language-lexicon.js')
    : root.SimulatteLanguageLexicon;
  const api = factory(lexiconApi || {});
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.SimulatteUniverseParser = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createUniverseParserApi(lexiconApi = {}) {
  const PROMPT_PARSE_SCHEMA = 'simulatte.promptParse.v1';

  const LANGUAGE_LEXICON = lexiconApi.LANGUAGE_LEXICON || lexiconApi;
  if (!LANGUAGE_LEXICON || LANGUAGE_LEXICON.schema !== 'simulatte.languageLexicon.v1') {
    throw new Error('Phase 2 language parser requires simulatte.languageLexicon.v1');
  }
  const ENTITY_PHRASES = LANGUAGE_LEXICON.entityPhrases || [];
  const PROCESS_PHRASES = LANGUAGE_LEXICON.processPhrases || [];
  const MODIFIER_PHRASES = LANGUAGE_LEXICON.modifierPhrases || [];
  const OBSERVABLE_PHRASES = LANGUAGE_LEXICON.observablePhrases || [];
  const NEGATION_WORDS = Object.freeze(['no', 'not', 'never', 'without', 'none', 'cannot', "can't", 'wont', "won't"]);
  const NEGATION_RE = new RegExp(`\\b(?:${NEGATION_WORDS.join('|')})\\b`);

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
    for (const [phrase, kind, metadata] of phraseRows) {
      const needle = phrase.toLowerCase();
      const escaped = needle
        .trim()
        .split(/\s+/)
        .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('\\s+');
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
          ...(metadata && typeof metadata === 'object' ? metadata : {}),
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
      const passive = passiveClauseForVerb(entities, verb, lower);
      if (passive) {
        const process = normalizeProcess(verb.text);
        const prepositions = nearbyPrepositions(lower, verb.end, passive.agent.start);
        clauses.push({
          subjectSpanId: passive.agent.id,
          verbSpanId: verb.id,
          objectSpanId: passive.patient.id,
          process,
          subjectRole: semanticRoleForSpan(passive.agent, 'agent'),
          objectRole: semanticRoleForObject(passive.patient, prepositions),
          spatialRelation: 'by',
          causalAffordance: causalAffordanceFor(passive.agent, process, passive.patient, prepositions),
          implicitObject: '',
          prepositions,
          voice: 'passive',
        });
        continue;
      }
      const subjects = coordinatedSubjectsForVerb(entities, verb, lower);
      const after = entities.filter((span) => span.start >= verb.end).sort((a, b) => a.start - b.start)[0] || null;
      if (!subjects.length && !after) continue;
      const prepositions = nearbyPrepositions(lower, verb.end, after ? after.start : verb.end + 24);
      const process = normalizeProcess(verb.text);
      for (const subject of subjects.length ? subjects : [null]) {
        const objectRole = after
          ? semanticRoleForObject(after, prepositions)
          : implicitObjectRoleFor(subject, process);
        const spatialRelation = spatialRelationFor(prepositions, after) ||
          implicitSpatialRelationFor(subject, process, objectRole);
        const implicitObject = !after && objectRole === 'fluid-medium' ? 'water' : '';
        clauses.push({
          subjectSpanId: subject ? subject.id : null,
          verbSpanId: verb.id,
          objectSpanId: after ? after.id : null,
          process,
          subjectRole: subject ? semanticRoleForSpan(subject, 'agent') : '',
          objectRole,
          spatialRelation,
          causalAffordance: causalAffordanceFor(subject, process, after, prepositions, objectRole),
          implicitObject,
          prepositions,
        });
      }
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

  function passiveClauseForVerb(entities, verb, lower) {
    if (!verb || !Number.isFinite(verb.start)) return null;
    const beforeText = lower.slice(Math.max(0, verb.start - 18), verb.start);
    if (!/\b(?:is|are|was|were|be|been|being)\s+$/.test(beforeText)) return null;
    const before = entities
      .filter((span) => span.end <= verb.start)
      .filter((span) => !spanIsNegated(lower, span))
      .sort((a, b) => b.end - a.end)[0] || null;
    if (!before) return null;
    const after = entities
      .filter((span) => span.start >= verb.end)
      .filter((span) => /\bby\b/.test(lower.slice(verb.end, span.start)))
      .sort((a, b) => a.start - b.start)[0] || null;
    if (!after) return null;
    return { patient: before, agent: after };
  }

  function coordinatedSubjectsForVerb(entities, verb, lower) {
    const before = entities
      .filter((span) => span.end <= verb.start)
      .filter((span) => !spanIsNegated(lower, span))
      .sort((a, b) => a.start - b.start);
    const nearest = before[before.length - 1] || null;
    if (!nearest) return [];
    const subjects = [nearest];
    for (let index = before.length - 2; index >= 0; index -= 1) {
      const candidate = before[index];
      const bridge = lower.slice(candidate.end, subjects[0].start);
      if (!isCoordinationBridge(bridge)) break;
      subjects.unshift(candidate);
    }
    return subjects;
  }

  function spanIsNegated(lower, span) {
    if (!span || !Number.isFinite(span.start)) return false;
    const prefix = String(lower || '').slice(Math.max(0, span.start - 24), span.start);
    return new RegExp(`${NEGATION_RE.source}\\s+$`).test(prefix);
  }

  function isCoordinationBridge(value = '') {
    const bridge = String(value || '').toLowerCase();
    if (!/\b(?:and|or|plus|with)\b|,/.test(bridge)) return false;
    return /^[\s,]*(?:(?:and|or|plus|with|a|an|the)[\s,]*)*$/.test(bridge);
  }

  function nearbyPrepositions(lower, start, end) {
    const slice = lower.slice(Math.max(0, start), Math.max(start, end + 1));
    return ['near', 'in', 'inside', 'into', 'through', 'onto', 'on', 'under', 'over', 'with', 'by', 'from', 'to']
      .filter((word) => new RegExp(`\\b${word}\\b`).test(slice));
  }

  function normalizeProcess(text = '') {
    const value = String(text || '').toLowerCase();
    if (/swim|swam/.test(value)) return 'swimming';
    if (/spin|rotate|drive/.test(value)) return 'rotate';
    if (/melt/.test(value)) return 'phase_transition';
    if (/hit|impact|collide|crack|fracture/.test(value)) return 'impact';
    if (/burn|heat/.test(value)) return 'heat_transfer';
    if (/cool/.test(value)) return 'cooling';
    if (/freez/.test(value)) return 'phase_transition';
    if (/flow|fall|push|carve|erode|pour|sink|float|buffer|settle|calv/.test(value)) return 'flow';
    if (/diffuse|dissolv/.test(value)) return 'diffusion';
    if (/oscillate|flex|wave/.test(value)) return 'oscillation';
    if (/grow|ferment/.test(value)) return 'growth';
    if (/trade|exchange/.test(value)) return 'exchange';
    if (/split/.test(value)) return 'split';
    if (/join/.test(value)) return 'join';
    if (/eat/.test(value)) return 'consume';
    if (/run|jump|bounce|fly/.test(value)) return 'motion';
    if (/fold/.test(value)) return 'folding';
    if (/twist/.test(value)) return 'rotate';
    if (/sort|resolv|recirculat|allocat|minimiz|sampl/.test(value)) return 'network_flow';
    return value || 'interact';
  }

  function semanticRoleForSpan(span = {}, fallback = '') {
    if (span.semanticRole) return span.semanticRole;
    const text = String(span.text || '').toLowerCase();
    if (/\b(dog|dogs|cat|cats|animal|mammal)\b/.test(text)) return 'biological-agent';
    if (/\b(lake|pool|pond|river|beach|ocean)\b/.test(text)) return 'containing-environment';
    if (/\b(water|fluid)\b/.test(text)) return 'fluid-medium';
    return fallback;
  }

  function semanticRoleForObject(span = {}, prepositions = []) {
    const role = semanticRoleForSpan(span, 'object');
    if ((prepositions.includes('in') || prepositions.includes('inside')) &&
      (role === 'containing-environment' || role === 'fluid-medium')) {
      return 'containing-environment';
    }
    return role;
  }

  function spatialRelationFor(prepositions = [], object = null) {
    if (!object) return '';
    if (prepositions.includes('inside')) return 'inside';
    if (prepositions.includes('in')) return 'in';
    if (prepositions.includes('through')) return 'through';
    if (prepositions.includes('into')) return 'into';
    if (prepositions.includes('on')) return 'on';
    if (prepositions.includes('near')) return 'near';
    return '';
  }

  function implicitObjectRoleFor(subject = null, process = '') {
    const subjectRole = semanticRoleForSpan(subject || {}, '');
    if (subjectRole === 'biological-agent' && process === 'swimming') return 'fluid-medium';
    return '';
  }

  function implicitSpatialRelationFor(subject = null, process = '', objectRole = '') {
    const subjectRole = semanticRoleForSpan(subject || {}, '');
    if (
      subjectRole === 'biological-agent' &&
      process === 'swimming' &&
      objectRole === 'fluid-medium'
    ) {
      return 'in';
    }
    return '';
  }

  function causalAffordanceFor(subject = null, process = '', object = null, prepositions = [], fallbackObjectRole = '') {
    const subjectRole = semanticRoleForSpan(subject || {}, '');
    const objectRole = fallbackObjectRole || semanticRoleForObject(object || {}, prepositions);
    if (
      subjectRole === 'biological-agent' &&
      process === 'swimming' &&
      (objectRole === 'containing-environment' || objectRole === 'fluid-medium')
    ) {
      return 'agents-in-water';
    }
    return '';
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
    LANGUAGE_LEXICON,
    NEGATION_WORDS,
    NEGATION_RE,
    parsePrompt,
  };
});
