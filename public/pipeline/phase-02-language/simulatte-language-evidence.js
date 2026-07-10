(function languageEvidenceModule(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SimulatteLanguageEvidence = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function languageEvidenceFactory() {
  'use strict';

  const CONNECTIVES = [
    'and', 'or', 'but', 'while', 'where', 'when', 'as', 'because', 'since',
    'after', 'before', 'then', 'so', 'therefore', 'through', 'with', 'without',
    'under', 'over', 'around', 'between', 'inside', 'outside', 'across', 'into',
    'from', 'to', 'by', 'near', 'against', 'during'
  ];

  const PREPOSITIONS = [
    'above', 'across', 'against', 'along', 'around', 'at', 'before', 'behind',
    'below', 'beneath', 'beside', 'between', 'by', 'during', 'from', 'in',
    'inside', 'into', 'near', 'of', 'off', 'on', 'onto', 'outside', 'over',
    'through', 'to', 'under', 'with', 'within', 'without'
  ];

  const NEGATIONS = [
    'no', 'not', 'never', 'none', 'without', 'cannot', "can't", 'wont', "won't",
    'avoid', 'exclude', 'except'
  ];

  const COMPARISONS = [
    'more', 'less', 'greater', 'smaller', 'larger', 'faster', 'slower', 'hotter',
    'colder', 'higher', 'lower', 'stronger', 'weaker', 'brighter', 'darker',
    'than', 'versus', 'vs', 'compared'
  ];

  const CAUSAL_CONNECTIVES = [
    'because', 'causes', 'cause', 'caused', 'causing', 'drives', 'driven',
    'forces', 'forced', 'makes', 'made', 'creates', 'forms', 'produces',
    'triggers', 'leads', 'results', 'therefore', 'so', 'due', 'from', 'by'
  ];

  const RESULT_CONNECTIVES = [
    'into', 'to', 'becomes', 'become', 'forming', 'forms', 'producing',
    'produces', 'creating', 'creates', 'resulting', 'results', 'yielding',
    'yields'
  ];

  const TEMPORAL_CONNECTIVES = [
    'after', 'before', 'during', 'while', 'when', 'then', 'until', 'as',
    'first', 'next', 'finally', 'simultaneously'
  ];

  const AMBIGUITY_MARKERS = [
    'maybe', 'possibly', 'probably', 'roughly', 'about', 'like', 'similar',
    'unknown', 'ambiguous', 'could', 'might', 'may', 'some kind', 'sort of'
  ];

  const PREDICATE_WORDS = [
    'absorbs', 'accelerates', 'bends', 'blocks', 'breaks', 'burns', 'carries',
    'channels', 'circulates', 'collides', 'compresses', 'condenses', 'conducts',
    'confines', 'connects', 'contracts', 'cools', 'corrodes', 'cracks', 'cuts',
    'deforms', 'deflects', 'diffuses', 'disperses', 'dissolves', 'drags',
    'drives', 'erodes', 'evaporates', 'expands', 'feeds', 'flows', 'fractures',
    'freezes', 'glows', 'grows', 'heats', 'holds', 'ignites', 'impacts',
    'mixes', 'orbits', 'oscillates', 'overloads', 'pressurizes', 'pulls',
    'pushes', 'radiates', 'reflects', 'refracts', 'rotates', 'routes',
    'scatters', 'shears', 'shields', 'splits', 'spreads', 'stabilizes',
    'stretches', 'supports', 'throttles', 'transfers', 'transforms', 'traps',
    'vaporizes', 'warms'
  ];

  const STOP_WORDS = new Set([
    'a', 'an', 'the', 'this', 'that', 'these', 'those', 'show', 'render',
    'simulate', 'make', 'create', 'build', 'scene', 'system', 'view', 'visualize',
    'please', 'and', 'or', 'but', 'while', 'where', 'when', 'as', 'because',
    'with', 'without', 'through', 'under', 'over', 'into', 'from', 'to', 'of',
    'in', 'on', 'by', 'for', 'at'
  ]);

  function extractLanguageEvidence(prompt) {
    const rawText = String(prompt || '');
    const normalizedText = rawText.replace(/\s+/g, ' ').trim();
    const tokens = tokenize(normalizedText);
    const clauses = extractClauses(normalizedText);
    const predicateFrames = extractPredicateFrames(clauses);
    const nounPhrases = extractNounPhrases(tokens, predicateFrames);
    const verbPhrases = extractVerbPhrases(tokens);
    const modifiers = extractModifierPhrases(normalizedText);
    const prepositions = extractKeywordRows(tokens, PREPOSITIONS, 'preposition');
    const negations = extractKeywordRows(tokens, NEGATIONS, 'negation');
    const comparisons = extractKeywordRows(tokens, COMPARISONS, 'comparison');
    const quantities = extractQuantities(normalizedText);
    const temporalOrdering = extractKeywordRows(tokens, TEMPORAL_CONNECTIVES, 'temporal');
    const causalConnectives = extractKeywordRows(tokens, CAUSAL_CONNECTIVES, 'causal');
    const resultClauses = extractResultClauses(clauses);
    const ambiguityMarkers = extractAmbiguityMarkers(normalizedText);
    const spans = buildSpanRows({
      normalizedText,
      clauses,
      nounPhrases,
      verbPhrases,
      modifiers,
      quantities,
      predicateFrames
    });

    return {
      schema: 'simulatte.languageEvidence.v1',
      rawText,
      normalizedText,
      tokens,
      spans,
      clauses,
      nounPhrases,
      verbPhrases,
      predicateFrames,
      modifiers,
      prepositions,
      negations,
      comparisons,
      quantities,
      temporalOrdering,
      causalConnectives,
      resultClauses,
      ambiguityMarkers,
      summary: {
        tokenCount: tokens.length,
        spanCount: spans.length,
        clauseCount: clauses.length,
        predicateFrameCount: predicateFrames.length,
        hasCausalLanguage: causalConnectives.length > 0 || predicateFrames.some((row) => row.result),
        hasTemporalLanguage: temporalOrdering.length > 0,
        hasUncertaintyLanguage: ambiguityMarkers.length > 0
      }
    };
  }

  function tokenize(text) {
    const rows = [];
    const re = /[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)*/g;
    let match;
    while ((match = re.exec(text))) {
      rows.push({
        id: idFor('token', rows.length),
        text: match[0],
        normalized: normalizeTerm(match[0]),
        start: match.index,
        end: match.index + match[0].length
      });
    }
    return rows;
  }

  function extractClauses(text) {
    if (!text) return [];
    const parts = text
      .split(/([,.;:]|\bwhile\b|\bwhere\b|\bwhen\b|\bbecause\b|\bafter\b|\bbefore\b|\bthen\b|\bso\b|\band\b|\bbut\b)/i)
      .reduce((rows, part) => {
        const value = String(part || '').trim();
        if (!value) return rows;
        if (/^(,|\.|;|:|while|where|when|because|after|before|then|so|and|but)$/i.test(value)) {
          rows.pendingConnector = value.toLowerCase();
          return rows;
        }
        rows.push({
          id: idFor('clause', rows.length),
          text: value,
          connector: rows.pendingConnector || null
        });
        rows.pendingConnector = null;
        return rows;
      }, []);
    delete parts.pendingConnector;
    return parts;
  }

  function extractPredicateFrames(clauses) {
    const frames = [];
    clauses.forEach((clause) => {
      const tokens = tokenize(clause.text);
      const predicateIndex = tokens.findIndex((token) => PREDICATE_WORDS.includes(token.normalized));
      if (predicateIndex < 0) return;
      const before = cleanPhrase(tokens.slice(0, predicateIndex).map((row) => row.text).join(' '));
      const predicate = tokens[predicateIndex].text;
      const afterTokens = tokens.slice(predicateIndex + 1);
      const resultIndex = afterTokens.findIndex((token) => RESULT_CONNECTIVES.includes(token.normalized));
      const objectTokens = resultIndex >= 0 ? afterTokens.slice(0, resultIndex) : afterTokens;
      const resultTokens = resultIndex >= 0 ? afterTokens.slice(resultIndex + 1) : [];
      const object = cleanPhrase(objectTokens.map((row) => row.text).join(' '));
      const result = cleanPhrase(resultTokens.map((row) => row.text).join(' '));
      frames.push({
        id: idFor('frame', frames.length),
        clauseId: clause.id,
        clauseText: clause.text,
        connector: clause.connector,
        subject: before,
        predicate,
        object,
        result: result || null,
        text: [before, predicate, object, result].filter(Boolean).join(' '),
        confidence: before && object ? 0.72 : 0.46
      });
    });
    return frames;
  }

  function extractNounPhrases(tokens, predicateFrames) {
    const rows = [];
    predicateFrames.forEach((frame) => {
      [frame.subject, frame.object, frame.result].filter(Boolean).forEach((text) => {
        addUniquePhrase(rows, text, 'predicate-frame');
      });
    });

    let current = [];
    tokens.forEach((token) => {
      if (STOP_WORDS.has(token.normalized) || PREDICATE_WORDS.includes(token.normalized)) {
        if (current.length) addUniquePhrase(rows, current.map((row) => row.text).join(' '), 'token-window');
        current = [];
        return;
      }
      current.push(token);
      if (current.length >= 4) {
        addUniquePhrase(rows, current.map((row) => row.text).join(' '), 'token-window');
        current = current.slice(1);
      }
    });
    if (current.length) addUniquePhrase(rows, current.map((row) => row.text).join(' '), 'token-window');

    return rows.map((row, index) => ({ ...row, id: idFor('noun-phrase', index) }));
  }

  function extractVerbPhrases(tokens) {
    const rows = [];
    tokens.forEach((token, index) => {
      if (!PREDICATE_WORDS.includes(token.normalized)) return;
      const object = cleanPhrase(tokens.slice(index + 1, index + 5).map((row) => row.text).join(' '));
      rows.push({
        id: idFor('verb-phrase', rows.length),
        text: object ? `${token.text} ${object}` : token.text,
        predicate: token.text,
        object,
        source: 'predicate-lexeme'
      });
    });
    return rows;
  }

  function extractModifierPhrases(text) {
    const rows = [];
    const re = /\b(with|without|under|over|through|inside|outside|near|around|between|against|across|during)\s+([^,.;]+)/gi;
    let match;
    while ((match = re.exec(text))) {
      rows.push({
        id: idFor('modifier', rows.length),
        preposition: match[1],
        text: cleanPhrase(match[2]),
        phrase: `${match[1]} ${cleanPhrase(match[2])}`,
        start: match.index,
        end: match.index + match[0].length
      });
    }
    return rows;
  }

  function extractKeywordRows(tokens, keywords, prefix) {
    const set = new Set(keywords.map(normalizeTerm));
    return tokens
      .filter((token) => set.has(token.normalized))
      .map((token, index) => ({
        id: idFor(prefix, index),
        text: token.text,
        normalized: token.normalized,
        tokenId: token.id
      }));
  }

  function extractQuantities(text) {
    const rows = [];
    const re = /\b(?:\d+(?:\.\d+)?|\bone\b|\btwo\b|\bthree\b|\bfour\b|\bfive\b|\bmany\b|\bseveral\b|\bfew\b|\bmultiple\b)\s*(?:[A-Za-z%/]+)?/gi;
    let match;
    while ((match = re.exec(text))) {
      rows.push({
        id: idFor('quantity', rows.length),
        text: match[0].trim(),
        start: match.index,
        end: match.index + match[0].length
      });
    }
    return rows;
  }

  function extractResultClauses(clauses) {
    const rows = [];
    clauses.forEach((clause) => {
      const tokens = tokenize(clause.text);
      const index = tokens.findIndex((token) => RESULT_CONNECTIVES.includes(token.normalized));
      if (index < 0) return;
      const text = cleanPhrase(tokens.slice(index + 1).map((row) => row.text).join(' '));
      if (!text) return;
      rows.push({
        id: idFor('result', rows.length),
        clauseId: clause.id,
        connective: tokens[index].text,
        text
      });
    });
    return rows;
  }

  function extractAmbiguityMarkers(text) {
    const normalized = ` ${text.toLowerCase()} `;
    return AMBIGUITY_MARKERS
      .filter((marker) => normalized.includes(` ${marker} `))
      .map((marker, index) => ({
        id: idFor('ambiguity', index),
        text: marker
      }));
  }

  function buildSpanRows(parts) {
    const rows = [];
    addSpan(rows, parts.normalizedText, 'prompt');
    parts.clauses.forEach((row) => addSpan(rows, row.text, 'clause', row.id));
    parts.nounPhrases.forEach((row) => addSpan(rows, row.text, 'noun-phrase', row.id));
    parts.verbPhrases.forEach((row) => addSpan(rows, row.text, 'verb-phrase', row.id));
    parts.modifiers.forEach((row) => addSpan(rows, row.phrase || row.text, 'modifier', row.id));
    parts.quantities.forEach((row) => addSpan(rows, row.text, 'quantity', row.id));
    parts.predicateFrames.forEach((row) => addSpan(rows, row.text, 'predicate-frame', row.id));
    return rows.map((row, index) => ({ ...row, id: idFor('span', index) }));
  }

  function addSpan(rows, text, kind, sourceId) {
    const clean = cleanPhrase(text);
    if (!clean) return;
    const key = `${kind}:${clean.toLowerCase()}`;
    if (rows.some((row) => row.key === key)) return;
    rows.push({ key, kind, text: clean, sourceId: sourceId || null });
  }

  function addUniquePhrase(rows, text, source) {
    const clean = cleanPhrase(text);
    if (!clean) return;
    const normalized = clean.toLowerCase();
    if (normalized.length < 2 || rows.some((row) => row.normalized === normalized)) return;
    rows.push({ text: clean, normalized, source });
  }

  function cleanPhrase(value) {
    return String(value || '')
      .replace(/\b(show|render|simulate|visualize|make|create|build)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .replace(/^[,.;:\s]+|[,.;:\s]+$/g, '')
      .trim();
  }

  function normalizeTerm(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9'-]+/g, '');
  }

  function idFor(prefix, index) {
    return `${prefix}.${String(index + 1).padStart(3, '0')}`;
  }

  return {
    extractLanguageEvidence,
    tokenize,
    extractPredicateFrames,
    NEGATIONS
  };
});
