(function attachCooperativeLanguageCompiler(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteCooperativeLanguage = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createCooperativeLanguageCompiler() {
  let universeParser = null;
  function configure({ parser }) {
    if (!parser || typeof parser.parsePrompt !== 'function') throw new Error('P2P Delivery language compilation requires the SDK language parser');
    universeParser = parser;
  }
  const NUMBER_WORDS = Object.freeze({
    a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5,
    six: 6, seven: 7, eight: 8, nine: 9, ten: 10, dozen: 12,
  });
  const MODE_PATTERNS = Object.freeze([
    ['delivery_bike', /\b(?:bike|biking|bicycle|cycling|ride|riding)\b/i],
    ['pedestrian', /\b(?:walk|walking|run|running|on foot)\b/i],
    ['scooter', /\b(?:scooter|scooting)\b/i],
    ['car', /\b(?:drive|driving|car)\b/i],
  ]);
  const KIND_PATTERNS = Object.freeze([
    ['need', /\b(?:need|want|looking for|bring me|deliver to me|drop off)\b/i],
    ['offer', /\b(?:i have|i carry|i am carrying|i can bring|available to bring|spare)\b/i],
    ['journey', /\b(?:i am going|i'm going|i am (?:walking|biking|cycling|riding|driving|scooting) to|i'm (?:walking|biking|cycling|riding|driving|scooting) to|headed to|on my way|travelling|traveling)\b/i],
  ]);

  function recognizesCooperativeIntent(sourceText) {
    const text = String(sourceText || '');
    return KIND_PATTERNS.some(([, pattern]) => pattern.test(text));
  }

  function compileCooperativeLanguage({ sourceText, taxonomy, destinations = [], world = null, defaults = {} }) {
    if (!universeParser) throw new Error('P2P Delivery language compiler is not configured');
    const text = String(sourceText || '').trim();
    const languageGraph = universeParser.parsePrompt(text);
    const evidence = [];
    const unresolved = [];
    const kinds = intentKindsForLanguageGraph(languageGraph, text, evidence);
    if (!kinds.length) unresolved.push(clarification('intent-kind', 'Say whether you need, offer, or are carrying something along a journey.'));
    const itemMatch = itemForText(text, taxonomy?.items || [], evidence);
    const item = itemMatch?.item || null;
    const quantity = quantityForItem(text, languageGraph, itemMatch, evidence);
    if (quantity === null && kinds.some((kind) => kind === 'need' || kind === 'offer')) {
      unresolved.push(clarification('quantity', 'State the required or available quantity.'));
    }
    if (!item && kinds.some((kind) => kind === 'need' || kind === 'offer')) {
      unresolved.push(clarification('item', 'Name an item present in the governed item taxonomy.'));
    }
    const destination = destinationForText(text, destinations, world, evidence);
    if (!destination && kinds.some((kind) => kind === 'need' || kind === 'journey')) {
      unresolved.push(clarification('destination', 'Name a governed destination or building handoff zone.'));
    }
    const mode = firstPatternValue(text, MODE_PATTERNS, 'mode', evidence) || defaults.mode || null;
    const maximumDetourSeconds = durationAfter(text, /\b(?:detour|extra|add(?:ed)?)\s+(?:of\s+)?/i, evidence);
    const deadline = deadlineForText(text, defaults.anchorInstant || null, evidence);
    const primaryKind = kinds.includes('need') ? 'need' : kinds.includes('offer') ? 'offer' : kinds[0] || 'unknown';
    const obligations = {
      itemId: item?.id || null,
      itemLabel: item?.label || null,
      quantity,
      destinationNodeId: destination?.nodeId || null,
      destinationLabel: destination?.label || null,
      buildingHandoffGraphId: destination?.buildingHandoffGraphId || defaults.buildingHandoffGraphId || null,
      mode,
      maximumDetourSeconds,
      deadline,
    };
    return {
      schema: 'simulatte.cooperativeLanguageCompilation.v1',
      id: `cooperative-language-${stableId(text.toLowerCase())}`,
      sourceText: text,
      languageGraph,
      primaryKind,
      intentKinds: [...new Set(kinds)],
      obligations,
      evidence: evidence.sort((left, right) => left.start - right.start || left.field.localeCompare(right.field)),
      unresolved,
      executable: unresolved.length === 0,
      claimBoundary: 'Language compilation preserves grounded cooperative obligations and surfaces unknown item or place meaning for clarification. It does not create inventory, geography, consent, or a match.',
    };
  }

  function needFromCompilation(compilation, baseNeed, taxonomy) {
    if (compilation.primaryKind !== 'need' || !compilation.executable) return null;
    const item = (taxonomy?.items || []).find((row) => row.id === compilation.obligations.itemId);
    if (!item) return null;
    return {
      ...baseNeed,
      id: `need-${stableId(`${compilation.id}:${baseNeed.requesterId}`)}`,
      itemId: item.id,
      quantity: compilation.obligations.quantity,
      acceptableSubstitutionGroupIds: item.substitutionGroupId ? [item.substitutionGroupId] : [],
      destinationNodeId: compilation.obligations.destinationNodeId,
      buildingHandoffGraphId: compilation.obligations.buildingHandoffGraphId,
      latestAt: compilation.obligations.deadline || baseNeed.latestAt,
      expiresAt: compilation.obligations.deadline || baseNeed.expiresAt,
      riskTier: item.riskTier,
    };
  }

  function itemForText(text, items, evidence) {
    const rows = items.flatMap((item) => [item.label, ...(item.aliases || [])].map((label) => ({ item, label })))
      .sort((left, right) => right.label.length - left.label.length || left.item.id.localeCompare(right.item.id));
    for (const row of rows) {
      const pattern = new RegExp(`\\b${escapeRegex(row.label).replace(/\\s+/g, '\\s+')}s?\\b`, 'i');
      const match = pattern.exec(text);
      if (!match) continue;
      evidence.push(evidenceRow('item', match[0], match.index, match.index + match[0].length, 'governed_item_taxonomy', row.item.id));
      return { item: row.item, label: row.label, start: match.index, end: match.index + match[0].length };
    }
    return null;
  }

  function destinationForText(text, destinations, world, evidence) {
    const rows = [...destinations];
    if (world?.nodes) {
      world.nodes.forEach((node) => rows.push({ label: node.label, aliases: [], nodeId: node.id, buildingHandoffGraphId: null }));
    }
    const candidates = rows.flatMap((row) => [row.label, ...(row.aliases || [])].map((label) => ({ row, label })))
      .filter((row) => row.label && row.label.length > 2)
      .sort((left, right) => right.label.length - left.label.length || left.row.nodeId.localeCompare(right.row.nodeId));
    for (const candidate of candidates) {
      const pattern = new RegExp(`\\b${escapeRegex(candidate.label).replace(/\\s+/g, '\\s+')}\\b`, 'i');
      const match = pattern.exec(text);
      if (!match) continue;
      evidence.push(evidenceRow('destination', match[0], match.index, match.index + match[0].length, 'governed_place_label', candidate.row.nodeId));
      return candidate.row;
    }
    return null;
  }

  function quantityForItem(text, languageGraph, itemMatch, evidence) {
    if (!itemMatch) return null;
    const spans = new Map((languageGraph.spans || []).map((span) => [span.id, span]));
    const graphQuantity = (languageGraph.quantities || []).find((row) => {
      const target = spans.get(row.targetSpanId);
      return target && target.start >= itemMatch.start && target.end <= itemMatch.end;
    });
    if (graphQuantity && Number.isInteger(graphQuantity.value) && graphQuantity.value > 0) {
      const quantitySpan = spans.get(graphQuantity.quantitySpanId);
      evidence.push(evidenceRow('quantity', quantitySpan?.text || String(graphQuantity.value),
        quantitySpan?.start ?? itemMatch.start, quantitySpan?.end ?? itemMatch.start,
        'shared_phase2_quantity_binding', graphQuantity.value));
      return graphQuantity.value;
    }
    const prefixStart = Math.max(0, itemMatch.start - 24);
    const prefix = text.slice(prefixStart, itemMatch.start);
    const match = /\b(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|dozen)\s*$/i.exec(prefix);
    if (!match) return null;
    const value = /^\d+$/.test(match[1]) ? Number(match[1]) : NUMBER_WORDS[match[1].toLowerCase()];
    if (!Number.isInteger(value) || value < 1) return null;
    const start = prefixStart + match.index;
    evidence.push(evidenceRow('quantity', match[1], start, start + match[1].length, 'shared_phase2_adjacent_quantity', value));
    return value;
  }

  function intentKindsForLanguageGraph(languageGraph, text, evidence) {
    const kinds = [];
    const processKinds = {
      need: 'need', want: 'need', request: 'need', bring: 'need', deliver: 'need', delivered: 'need',
      have: 'offer', carry: 'offer', carrying: 'offer', offer: 'offer', provide: 'offer',
      walk: 'journey', walking: 'journey', run: 'journey', running: 'journey', bike: 'journey', biking: 'journey',
      cycle: 'journey', cycling: 'journey', ride: 'journey', riding: 'journey', drive: 'journey', driving: 'journey',
      scoot: 'journey', scooting: 'journey', travel: 'journey', traveling: 'journey', travelling: 'journey',
    };
    const spans = new Map((languageGraph.spans || []).map((span) => [span.id, span]));
    for (const clause of languageGraph.clauses || []) {
      const process = String(clause.process || clause.predicate || '').toLowerCase();
      const kind = processKinds[process];
      if (!kind) continue;
      const span = spans.get(clause.verbSpanId);
      evidence.push(evidenceRow('intentKind', span?.text || process, span?.start ?? 0, span?.end ?? 0,
        'shared_phase2_clause', kind));
      kinds.push(kind);
    }
    for (const [kind, pattern] of KIND_PATTERNS) {
      if (kinds.includes(kind)) continue;
      if (capture(pattern, text, 'intentKind', evidence, kind)) kinds.push(kind);
    }
    const uniqueKinds = new Set(kinds);
    return KIND_PATTERNS.map(([kind]) => kind).filter((kind) => uniqueKinds.has(kind));
  }

  function durationAfter(text, prefixPattern, evidence) {
    const prefix = prefixPattern.exec(text);
    if (!prefix) return null;
    const rest = text.slice(prefix.index + prefix[0].length);
    const match = /^(\d+(?:\.\d+)?)\s*(minutes?|mins?|hours?|hrs?)/i.exec(rest.trim());
    if (!match) return null;
    const seconds = Number(match[1]) * (/^h/i.test(match[2]) ? 3600 : 60);
    const start = text.indexOf(match[0], prefix.index + prefix[0].length);
    evidence.push(evidenceRow('maximumDetourSeconds', match[0], start, start + match[0].length, 'duration_conversion', seconds));
    return seconds;
  }

  function deadlineForText(text, anchorInstant, evidence) {
    const match = /\bby\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i.exec(text);
    if (!match || !anchorInstant) return null;
    const anchor = new Date(anchorInstant);
    if (!Number.isFinite(anchor.getTime())) return null;
    let hour = Number(match[1]) % 12;
    if (match[3].toLowerCase() === 'pm') hour += 12;
    anchor.setHours(hour, Number(match[2] || 0), 0, 0);
    evidence.push(evidenceRow('deadline', match[0], match.index, match.index + match[0].length, 'clock_time_conversion', anchor.toISOString()));
    return anchor.toISOString();
  }

  function firstPatternValue(text, rows, field, evidence) {
    for (const [value, pattern] of rows) if (capture(pattern, text, field, evidence, value)) return value;
    return null;
  }

  function capture(pattern, text, field, evidence, groundedId = null) {
    const match = pattern.exec(text);
    if (!match) return null;
    evidence.push(evidenceRow(field, match[0], match.index, match.index + match[0].length, 'deterministic_language_graph', groundedId || match[0].toLowerCase()));
    return match;
  }

  function evidenceRow(field, value, start, end, method, groundedValue) {
    return { field, value, start, end, method, groundedValue };
  }

  function clarification(field, prompt) {
    return { field, status: 'clarification_required', prompt };
  }

  function stableId(value) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }

  function escapeRegex(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  return { compileCooperativeLanguage, configure, needFromCompilation, recognizesCooperativeIntent };
});
