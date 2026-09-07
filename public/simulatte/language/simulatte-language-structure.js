(function attachLanguageStructure(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteLanguageStructure = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createLanguageStructure() {
  const SPATIAL_PHRASES = Object.freeze({
    'to the left of': 'left-of', 'to the right of': 'right-of',
    'on the left of': 'left-of', 'on the right of': 'right-of',
    'left of': 'left-of', 'right of': 'right-of',
    'in front of': 'in-front-of', 'attached to': 'attached-to',
    underneath: 'under', beneath: 'under', inside: 'inside', outside: 'outside',
    within: 'inside', through: 'through', between: 'between', beside: 'beside',
    behind: 'behind', around: 'around', above: 'above', below: 'below',
    under: 'under', over: 'over', onto: 'on', into: 'into', near: 'near',
    against: 'against', with: 'with', on: 'on', in: 'in', at: 'at',
  });
  const PART_ADJECTIVES = Object.freeze({
    legged: 'leg', armed: 'arm', eyed: 'eye', winged: 'wing', wheeled: 'wheel',
    headed: 'head', tailed: 'tail', bladed: 'blade', fingered: 'finger',
  });
  const ARGUMENT_KINDS = new Set(['entity', 'environment', 'material', 'term']);

  function spatialMatches(source = '') {
    const matches = [];
    const text = String(source).toLowerCase();
    for (const [phrase, relation] of Object.entries(SPATIAL_PHRASES)) {
      const pattern = phrase.split(' ').join('\\s+');
      for (const match of text.matchAll(new RegExp(`\\b${pattern}\\b`, 'g'))) {
        const start = match.index;
        const end = start + match[0].length;
        if (matches.some((row) => row.start <= start && row.end >= end)) continue;
        matches.push({ start, end, phrase, relation });
      }
    }
    return matches.sort((a, b) => a.start - b.start || b.end - a.end);
  }

  function extractStructure(spans, tokens, source, lexicon) {
    const relations = spatialMatches(source);
    const rows = spans.filter((span) => span.kind !== 'term' || !relations.some((row) =>
      row.start <= span.start && row.end >= span.end)).map((span) => ({ ...span }));
    const materials = lexicon.materialVisualValues || {};
    for (let index = 0; index < rows.length; index += 1) {
      const span = rows[index];
      const next = rows[index + 1];
      if (span.kind === 'term' && materials[span.text] && next &&
          ARGUMENT_KINDS.has(next.kind) && !source.slice(span.end, next.start).trim()) {
        Object.assign(span, { kind: 'modifier', modifierRelation: 'material', propertyValue: span.text });
      }
      const part = PART_ADJECTIVES[span.text];
      const quantity = rows[index - 1];
      if (!part || span.kind !== 'term' || quantity?.kind !== 'quantity' ||
          !/^[-\s]+$/.test(source.slice(quantity.end, span.start))) continue;
      const owner = rows.slice(index + 1).find((row) => ARGUMENT_KINDS.has(row.kind) && !materials[row.text]);
      if (!owner || /[.;,]|\b(?:and|or|with|of)\b/.test(source.slice(span.end, owner.start))) continue;
      Object.assign(span, {
        kind: 'entity', entityClass: part, semanticRole: 'part', visualArchetype: part,
        partOwnerTokenStart: owner.tokenStart, syntacticPromotion: 'counted-part-adjective',
      });
    }
    preserveExplicitParts(rows, source);
    promoteVerbs(rows, source, lexicon);
    preserveNounPhrases(rows, source);
    return rows;
  }

  function preserveExplicitParts(rows, source) {
    const names = new Set(Object.values(PART_ADJECTIVES));
    for (let index = 0; index < rows.length; index += 1) {
      const part = rows[index];
      const name = part.text.replace(/s$/, '');
      if (!names.has(name) || !['term', 'entity'].includes(part.kind) || part.semanticRole === 'part') continue;
      const owner = rows.slice(0, index).reverse().find((row) =>
        ['entity', 'environment', 'term'].includes(row.kind) && row.semanticRole !== 'part' &&
        !/^(?:has|have|having)$/.test(row.text));
      if (!owner) continue;
      const bridge = source.slice(owner.end, part.start);
      if (!/^\s+(?:with|has|have|having)\s+/.test(bridge) || /[.;,]/.test(bridge)) continue;
      const intervening = rows.filter((row) => row.start >= owner.end && row.end <= part.start);
      if (intervening.some((row) => !['quantity', 'modifier'].includes(row.kind) && !/^(?:has|have|having)$/.test(row.text))) continue;
      Object.assign(part, { kind: 'entity', entityClass: name, semanticRole: 'part', visualArchetype: name,
        partOwnerTokenStart: owner.tokenStart, syntacticPromotion: 'explicit-part-ownership' });
      for (const row of intervening) if (/^(?:has|have|having)$/.test(row.text)) row.kind = 'directive';
    }
  }

  function promoteVerbs(rows, source, lexicon) {
    const entityForms = new Set((lexicon.entityPhrases || []).map(([text]) => text));
    for (let index = 0; index < rows.length; index += 1) {
      const span = rows[index];
      if (span.kind !== 'term') continue;
      const token = span.text;
      if (!/(?:ing|ed|en|ize|ise|ify|ates?|s)$/.test(token) ||
          /(?:ss|ous|ness|ics)$/.test(token) || entityForms.has(token.replace(/s$/, ''))) continue;
      const before = rows.slice(0, index).reverse().find((row) => row.kind !== 'modifier');
      if (!before || !ARGUMENT_KINDS.has(before.kind) || before.semanticRole === 'part') continue;
      const bridge = source.slice(before.end, span.start);
      if (!/^\s*(?:(?:is|are|was|were|be|been|being|can|will|does|do)\s+)*$/.test(bridge)) continue;
      const after = rows.slice(index + 1).find((row) => row.kind !== 'modifier' && !row.processQualifier);
      const tail = !after && /(?:ing|ed)$/.test(token);
      if (!tail && (!after || !ARGUMENT_KINDS.has(after.kind) ||
          /[.;,]/.test(source.slice(span.end, after.start)))) continue;
      Object.assign(span, {
        kind: 'process', syntacticPromotion: tail ? 'subject-process' : 'subject-process-object',
      });
    }
  }

  function preserveNounPhrases(rows, source) {
    for (let index = 0; index < rows.length; index += 1) {
      const span = rows[index];
      if (span.kind !== 'term') continue;
      const next = rows[index + 1];
      const previous = rows[index - 1];
      const followingHead = next && ['term', 'entity', 'environment'].includes(next.kind) &&
        /^\s+$/.test(source.slice(span.end, next.start));
      const precedingHead = previous && ['entity', 'environment'].includes(previous.kind) &&
        previous.syntacticPromotion !== 'open-noun-phrase' &&
        /^\s+$/.test(source.slice(previous.end, span.start));
      if (followingHead || precedingHead) {
        Object.assign(span, {
          kind: 'modifier', modifierRelation: 'descriptor', propertyValue: span.text,
          syntacticPromotion: 'open-noun-phrase-modifier',
        });
      } else if (/^(?:renderer|render|show|visualize|please)$/.test(span.text) &&
          !/\b(?:a|an|the)\s+$/.test(source.slice(0, span.start))) {
        span.kind = 'directive';
      } else {
        Object.assign(span, { kind: 'entity', syntacticPromotion: 'open-noun-phrase' });
      }
    }
  }

  return Object.freeze({ SPATIAL_PHRASES, spatialMatches, extractStructure });
});
