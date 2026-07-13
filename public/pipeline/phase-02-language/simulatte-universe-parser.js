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
  const ACTION_POSE_LEXICON = LANGUAGE_LEXICON.actionPoseLexicon || [];
  const MODIFIER_PHRASES = LANGUAGE_LEXICON.modifierPhrases || [];
  const OBSERVABLE_PHRASES = LANGUAGE_LEXICON.observablePhrases || [];
  const TERM_STOPWORDS = new Set(LANGUAGE_LEXICON.termStopwords || []);
  const NEGATION_WORDS = Object.freeze(['no', 'not', 'never', 'without', 'none', 'cannot', "can't", 'wont', "won't"]);
  const NEGATION_RE = new RegExp(`\\b(?:${NEGATION_WORDS.join('|')})\\b`);
  const SPATIAL_PREPOSITIONS = Object.freeze([
    'in front of', 'attached to', 'inside', 'outside', 'within', 'through', 'between',
    'beside', 'behind', 'around', 'above', 'below', 'under', 'over', 'onto', 'into',
    'near', 'against', 'on', 'in', 'at',
  ]);

  function parsePrompt(promptInput = '') {
    const prompt = String(promptInput || '');
    const lower = prompt.toLowerCase();
    const tokenRows = tokenize(prompt);
    const spans = [];
    addPhraseSpans(spans, lower, ENTITY_PHRASES, tokenRows);
    addPhraseSpans(spans, lower, PROCESS_PHRASES.map((text) => [text, 'process']), tokenRows);
    addPhraseSpans(spans, lower, MODIFIER_PHRASES.map(([text, relation, metadata]) => [
      text,
      'modifier',
      { modifierRelation: relation, ...(metadata || {}) },
    ]), tokenRows);
    addPhraseSpans(spans, lower, OBSERVABLE_PHRASES.map((text) => [text, 'observable']), tokenRows);
    const recognized = resolveEntityProcessCollisions(dedupeSpans(spans), lower);
    addQuantitySpans(recognized, tokenRows);
    addUnmatchedTermSpans(recognized, tokenRows);
    const compact = recognized
      .sort((a, b) => a.start - b.start || b.end - a.end)
      .map((span, index) => ({ ...span, id: `span${index + 1}` }));
    const clauses = buildClauses(compact, lower);
    const modifiers = buildModifiers(compact);
    const quantities = buildQuantities(compact);
    return {
      schema: PROMPT_PARSE_SCHEMA,
      prompt,
      tokens: tokenRows.map(({ text, start, end }) => ({ text, start, end })),
      spans: compact,
      clauses,
      modifiers,
      quantities,
    };
  }

  function addQuantitySpans(spans, tokens) {
    const covered = new Set(spans.flatMap((span) => {
      const indexes = [];
      for (let index = span.tokenStart; index <= span.tokenEnd; index += 1) indexes.push(index);
      return indexes;
    }));
    for (let index = 0; index < tokens.length; index += 1) {
      const token = tokens[index];
      if (covered.has(index) || !/^\d+$/.test(token.text)) continue;
      spans.push({
        text: token.text,
        kind: 'quantity',
        value: Number(token.text),
        start: token.start,
        end: token.end,
        tokenStart: index,
        tokenEnd: index,
      });
    }
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

  function resolveEntityProcessCollisions(spans, lower) {
    const exactCollisions = spans.filter((span) => span.kind === 'process').filter((process) => (
      spans.some((span) => span.kind === 'entity' && span.start === process.start && span.end === process.end)
    ));
    const verbalKeys = new Set(exactCollisions.filter((process) => {
      const prior = spans.filter((span) => (
        ['entity', 'environment'].includes(span.kind) && span.end <= process.start
      )).sort((a, b) => b.end - a.end)[0];
      if (!prior || lower.slice(prior.end, process.start).trim()) return false;
      return prior.semanticRole === 'biological-agent' ||
        /^(?:person|people|dog|cat|animal|mammal)$/.test(String(prior.entityClass || ''));
    }).map(spanRangeKey));
    const collisionKeys = new Set(exactCollisions.map(spanRangeKey));
    return spans.filter((span) => {
      const key = spanRangeKey(span);
      if (!collisionKeys.has(key)) return true;
      return span.kind === 'process' ? verbalKeys.has(key) : !verbalKeys.has(key);
    });
  }

  function spanRangeKey(span = {}) {
    return `${Number(span.start || 0)}:${Number(span.end || 0)}`;
  }

  function addUnmatchedTermSpans(spans, tokens) {
    const covered = new Set(spans.flatMap((span) => {
      const indexes = [];
      for (let index = span.tokenStart; index <= span.tokenEnd; index += 1) indexes.push(index);
      return indexes;
    }));
    for (let index = 0; index < tokens.length; index += 1) {
      const token = tokens[index];
      if (covered.has(index) || TERM_STOPWORDS.has(token.text)) continue;
      spans.push({
        text: token.text,
        kind: 'term',
        start: token.start,
        end: token.end,
        tokenStart: index,
        tokenEnd: index,
      });
    }
  }

  function buildClauses(spans, lower) {
    const clauseEntities = spans.filter((span) => (
      span.kind === 'entity' || span.kind === 'material' || span.kind === 'environment' || span.kind === 'term'
    ));
    const attributiveMaterials = attributiveMaterialSpanIds(clauseEntities, lower);
    const entities = clauseEntities.filter((span) => !attributiveMaterials.has(span.id));
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
          predicate: verb.text,
          subjectRole: semanticRoleForSpan(passive.agent, 'agent'),
          objectRole: semanticRoleForObject(passive.patient, prepositions),
          spatialRelation: 'by',
          causalAffordance: causalAffordanceFor(passive.agent, process, passive.patient, prepositions),
          implicitObject: '',
          prepositions,
          voice: 'passive',
          poseHint: poseHintForAction(verb.text),
        });
        continue;
      }
      const inheritedSubject = inheritedAgentiveParticipleSubject(entities, verb, lower, clauses);
      const subjects = inheritedSubject ? [inheritedSubject] : coordinatedSubjectsForVerb(entities, verb, lower);
      const after = preferredKnownSpan(
        entities.filter((span) => span.start >= verb.end).sort((a, b) => a.start - b.start)
      );
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
          predicate: verb.text,
          subjectRole: subject ? semanticRoleForSpan(subject, 'agent') : '',
          objectRole,
          spatialRelation,
          causalAffordance: causalAffordanceFor(subject, process, after, prepositions, objectRole),
          implicitObject,
          prepositions,
          poseHint: poseHintForAction(verb.text),
        });
      }
    }
    for (const spatial of spatialClausesForEntities(entities, processes, lower)) {
      const alreadyExpressed = clauses.some((clause) => (
        clause.subjectSpanId === spatial.subjectSpanId &&
        clause.objectSpanId === spatial.objectSpanId &&
        clause.spatialRelation === spatial.spatialRelation
      ));
      if (!alreadyExpressed) clauses.push(spatial);
    }
    for (const materialClause of materialClausesForEntities(clauseEntities, lower)) clauses.push(materialClause);
    for (const partClause of partClausesForEntities(entities, lower)) clauses.push(partClause);
    const seen = new Set();
    return clauses.filter((clause) => {
      const key = [clause.subjectSpanId, clause.objectSpanId, clause.spatialRelation,
        clause.verbSpanId, clause.predicate].join(':');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).map((clause, index) => ({ id: `clause${index + 1}`, ...clause }));
  }

  function attributiveMaterialSpanIds(entities = [], lower = '') {
    const ordered = entities.slice().sort((a, b) => a.start - b.start);
    const ids = new Set();
    for (let index = 0; index < ordered.length - 1; index += 1) {
      const material = ordered[index];
      const object = ordered[index + 1];
      if (material.kind !== 'material' || !['entity', 'environment', 'term'].includes(object.kind)) continue;
      const bridge = lower.slice(material.end, object.start);
      if (/^\s*(?:(?:a|an|the)\s+)?$/.test(bridge)) ids.add(material.id);
    }
    return ids;
  }

  function spatialClausesForEntities(entities = [], processes = [], lower = '') {
    const ordered = entities.slice().sort((a, b) => a.start - b.start);
    const clauses = [];
    for (let index = 1; index < ordered.length; index += 1) {
      const previous = ordered[index - 1];
      const target = ordered[index];
      const bridge = lower.slice(previous.end, target.start);
      const prepositions = spatialPrepositionsInText(bridge);
      const processBetween = processes.filter((span) => span.start >= previous.end && span.end <= target.start).pop();
      if (prepositions.length) {
        const subject = processBetween
          ? preferredSpatialSubject(ordered, processBetween) || previous
          : previous;
        clauses.push(spatialClause(subject, target, processBetween, prepositions));
        continue;
      }
      const prior = clauses[clauses.length - 1];
      if (prior && prior.objectSpanId === previous.id &&
        spatialCoordinationTargetsCompatible(previous, target) && isSpatialCoordinationBridge(bridge)) {
        const subject = ordered.find((span) => span.id === prior.subjectSpanId);
        clauses.push(spatialClause(subject, target, null, [prior.spatialRelation]));
      }
    }
    for (let index = 1; index < ordered.length; index += 1) {
      const subject = ordered[index];
      const previous = ordered[index - 1];
      const suffixEnd = ordered[index + 1] ? ordered[index + 1].start : lower.length;
      const suffix = lower.slice(subject.end, Math.min(suffixEnd, subject.end + 24));
      const postpositions = spatialPrepositionsInText(suffix).filter((word) => word === 'outside');
      if (postpositions.length) clauses.push(spatialClause(subject, previous, null, postpositions));
    }
    return clauses;
  }

  function preferredSpatialSubject(ordered = [], process = {}) {
    const candidates = ordered.filter((span) => span.end <= process.start);
    return candidates.slice().reverse().find((span) => span.kind !== 'term') || candidates.pop() || null;
  }

  function spatialCoordinationTargetsCompatible(previous = {}, target = {}) {
    return previous.kind !== 'term' && target.kind !== 'term' && previous.kind === target.kind;
  }

  function materialClausesForEntities(entities = [], lower = '') {
    const ordered = entities.slice().sort((a, b) => a.start - b.start);
    const clauses = [];
    for (let index = 0; index < ordered.length - 1; index += 1) {
      const material = ordered[index];
      const object = ordered[index + 1];
      if (material.kind !== 'material' || !['entity', 'environment', 'term'].includes(object.kind)) continue;
      const bridge = lower.slice(material.end, object.start);
      if (!/^\s*(?:(?:a|an|the)\s+)?$/.test(bridge)) continue;
      clauses.push({
        subjectSpanId: material.id,
        verbSpanId: null,
        objectSpanId: object.id,
        process: 'material_assignment',
        predicate: 'material-of',
        subjectRole: 'material',
        objectRole: 'object',
        spatialRelation: '',
        causalAffordance: '',
        implicitObject: '',
        prepositions: [],
        relationSource: 'compound-material-language',
      });
    }
    return clauses;
  }

  function partClausesForEntities(entities = [], lower = '') {
    const owners = entities.filter((span) => span.semanticRole !== 'part');
    const parts = entities.filter((span) => span.semanticRole === 'part');
    const clauses = [];
    for (const partSpan of parts) {
      const owner = owners.filter((span) => span.end <= partSpan.start).sort((a, b) => b.end - a.end)
        .find((span) => /\bwith\b/.test(lower.slice(span.end, partSpan.start)));
      if (!owner) continue;
      clauses.push({
        subjectSpanId: owner.id,
        verbSpanId: null,
        objectSpanId: partSpan.id,
        process: 'part_composition',
        predicate: 'has-part',
        subjectRole: semanticRoleForSpan(owner, 'entity'),
        objectRole: 'part',
        spatialRelation: '',
        causalAffordance: 'part-ownership',
        implicitObject: '',
        prepositions: ['with'],
        relationSource: 'explicit-part-language',
      });
    }
    return clauses;
  }

  function spatialClause(subject, object, verb, prepositions = []) {
    const spatialRelation = spatialRelationFor(prepositions, object);
    return {
      subjectSpanId: subject && subject.id || null,
      verbSpanId: verb && verb.id || null,
      objectSpanId: object && object.id || null,
      process: 'spatial_constraint',
      predicate: spatialRelation,
      subjectRole: semanticRoleForSpan(subject || {}, 'entity'),
      objectRole: semanticRoleForObject(object || {}, prepositions),
      spatialRelation,
      causalAffordance: '',
      implicitObject: '',
      prepositions,
      relationSource: 'explicit-spatial-language',
    };
  }

  function passiveClauseForVerb(entities, verb, lower) {
    if (!verb || !Number.isFinite(verb.start)) return null;
    const beforeText = lower.slice(Math.max(0, verb.start - 18), verb.start);
    if (!/\b(?:is|are|was|were|be|been|being)\s+$/.test(beforeText)) return null;
    const beforeRows = entities
      .filter((span) => span.end <= verb.start)
      .filter((span) => !spanIsNegated(lower, span))
      .sort((a, b) => b.end - a.end);
    const before = preferredKnownSpan(beforeRows);
    if (!before) return null;
    const afterRows = entities
      .filter((span) => span.start >= verb.end)
      .filter((span) => /\bby\b/.test(lower.slice(verb.end, span.start)))
      .sort((a, b) => a.start - b.start);
    const after = preferredKnownSpan(afterRows);
    if (!after) return null;
    return { patient: before, agent: after };
  }

  function coordinatedSubjectsForVerb(entities, verb, lower) {
    const beforeRows = entities
      .filter((span) => span.end <= verb.start)
      .filter((span) => !spanIsNegated(lower, span))
      .sort((a, b) => a.start - b.start);
    const known = beforeRows.filter((span) => span.kind !== 'term');
    const before = known.length ? known : beforeRows;
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

  function preferredKnownSpan(rows = []) {
    const known = rows.filter((span) => span.kind !== 'term');
    return (known.length ? known : rows)[0] || null;
  }

  function inheritedAgentiveParticipleSubject(entities, verb, lower, clauses = []) {
    if (!/ing$/.test(String(verb && verb.text || ''))) return null;
    if (!/^(measurement|consume)$/.test(normalizeProcess(verb.text))) return null;
    const nearest = entities.filter((span) => span.end <= verb.start).sort((a, b) => b.end - a.end)[0];
    if (!nearest || /agent/.test(String(nearest.semanticRole || ''))) return null;
    const prior = clauses.slice().reverse().find((clause) => clause.subjectSpanId && clause.objectSpanId);
    if (!prior) return null;
    const subject = entities.find((span) => span.id === prior.subjectSpanId);
    const object = entities.find((span) => span.id === prior.objectSpanId);
    if (!subject || !/agent/.test(String(subject.semanticRole || '')) || !object) return null;
    const bridge = lower.slice(object.end, nearest.start);
    return spatialPrepositionsInText(bridge).length ? subject : null;
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

  function isSpatialCoordinationBridge(value = '') {
    const bridge = String(value || '').toLowerCase();
    if (!/\b(?:and|or|plus)\b|,/.test(bridge)) return false;
    return /^[\s,]*(?:(?:and|or|plus|a|an|the)[\s,]*)*$/.test(bridge);
  }

  function nearbyPrepositions(lower, start, end) {
    const slice = lower.slice(Math.max(0, start), Math.max(start, end + 1));
    return [...spatialPrepositionsInText(slice), ...['with', 'by', 'from', 'to']
      .filter((word) => new RegExp(`\\b${word}\\b`).test(slice))];
  }

  function spatialPrepositionsInText(text = '') {
    return SPATIAL_PREPOSITIONS.filter((word) => (
      new RegExp(`\\b${word.replace(/\\s+/g, '\\s+')}\\b`).test(String(text || '').toLowerCase())
    ));
  }

  function normalizeProcess(text = '') {
    const value = String(text || '').toLowerCase();
    if (/swim|swam/.test(value)) return 'swimming';
    if (/spin|rotate|drive/.test(value)) return 'rotate';
    if (/melt/.test(value)) return 'phase_transition';
    if (/hit|impact|collide|crash|crack|fracture/.test(value)) return 'impact';
    if (/burn|heat/.test(value)) return 'heat_transfer';
    if (/cool/.test(value)) return 'cooling';
    if (/freez/.test(value)) return 'phase_transition';
    if (/flow|fall|push|carve|erode|pour|sink|float|buffer|settle|calv|bend|reduc/.test(value)) return 'flow';
    if (/diffuse|dissolv/.test(value)) return 'diffusion';
    if (/orbit/.test(value)) return 'oscillation';
    if (/oscillate|flex|wave/.test(value)) return 'oscillation';
    if (/grow|ferment/.test(value)) return 'growth';
    if (/trade|exchange/.test(value)) return 'exchange';
    if (/split/.test(value)) return 'split';
    if (/join/.test(value)) return 'join';
    if (/eat/.test(value)) return 'consume';
    if (/run|jump|bounce|fly|cross|sit|play/.test(value)) return 'motion';
    if (/watch|observ/.test(value)) return 'measurement';
    if (/focus/.test(value)) return 'measurement';
    if (/power/.test(value)) return 'motion';
    if (/support/.test(value)) return 'support';
    if (/leak|spill|seep|drip/.test(value)) return 'leak';
    if (/fold/.test(value)) return 'folding';
    if (/twist/.test(value)) return 'rotate';
    if (/readout/.test(value)) return 'measurement';
    if (/sort|resolv|recirculat|allocat|minimiz|sampl/.test(value)) return 'network_flow';
    return value || 'interact';
  }

  function poseHintForAction(text = '') {
    const value = String(text || '').toLowerCase();
    const row = ACTION_POSE_LEXICON.find((entry) => (entry.phrases || []).includes(value));
    return row ? row.pose : '';
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
    if (prepositions.includes('within')) return 'inside';
    if (prepositions.includes('onto')) return 'on';
    if (prepositions.includes('outside')) return 'outside';
    if (prepositions.includes('beside')) return 'beside';
    if (prepositions.includes('above')) return 'above';
    if (prepositions.includes('below')) return 'below';
    if (prepositions.includes('under')) return 'under';
    if (prepositions.includes('over')) return 'over';
    if (prepositions.includes('around')) return 'around';
    if (prepositions.includes('behind')) return 'behind';
    if (prepositions.includes('in front of')) return 'in-front-of';
    if (prepositions.includes('attached to')) return 'attached-to';
    if (prepositions.includes('against')) return 'against';
    if (prepositions.includes('between')) return 'between';
    if (prepositions.includes('at')) return 'at';
    if (prepositions.includes('with')) return 'with';
    return '';
  }

  function implicitObjectRoleFor(subject = null, process = '') {
    const subjectRole = semanticRoleForSpan(subject || {}, '');
    if (subjectRole === 'biological-agent' && process === 'swimming') return 'fluid-medium';
    return '';
  }

  function implicitSpatialRelationFor(subject = null, process = '', objectRole = '') {
    if (process === 'support') return 'supports';
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
    const targets = spans.filter((span) => (
      span.kind === 'entity' || span.kind === 'material' || span.kind === 'environment' || span.kind === 'term'
    ));
    const modifiers = spans.filter((span) => span.kind === 'modifier');
    return modifiers
      .map((modifier, index) => {
        const relation = modifier.modifierRelation || modifierRelation(modifier.text);
        const target = modifierTarget(modifier, targets, relation);
        if (!target) return null;
        return {
          id: `modifier${index + 1}`,
          targetSpanId: target.id,
          modifierSpanId: modifier.id,
          relation,
          value: modifier.propertyValue || modifier.text,
        };
      })
      .filter(Boolean);
  }

  function modifierTarget(modifier, targets, relation) {
    if (relation === 'color' || relation === 'articulation' || relation === 'material') {
      const following = targets.filter((span) => (
        span.start >= modifier.end && span.kind !== 'material'
      )).sort((a, b) => a.start - b.start)[0];
      if (following) return following;
    }
    return nearestSpan(modifier, targets);
  }

  function buildQuantities(spans) {
    const targets = spans.filter((span) => ['entity', 'environment', 'term'].includes(span.kind));
    return spans.filter((span) => span.kind === 'quantity').map((quantity, index) => {
      const target = targets.filter((span) => span.start >= quantity.end).sort((a, b) => a.start - b.start)[0];
      return {
        id: `quantity${index + 1}`,
        quantitySpanId: quantity.id,
        targetSpanId: target && target.id || '',
        value: Math.max(1, Math.floor(Number(quantity.value || quantity.text || 1))),
        unit: 'instances',
      };
    }).filter((row) => row.targetSpanId);
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
    SPATIAL_PREPOSITIONS,
    parsePrompt,
  };
});
