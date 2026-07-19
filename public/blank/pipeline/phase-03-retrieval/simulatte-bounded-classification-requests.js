(function attachSimulatteBoundedClassificationRequests(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteBoundedClassificationRequests = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createBoundedClassificationRequestsApi() {
  const REQUEST_SCHEMA = 'simulatte.boundedClassificationRequest.v1';
  const LIMITS = Object.freeze({
    languageSpans: 32,
    materialEntities: 24,
    actions: 16,
    relations: 24,
    obligations: 24,
  });

  function buildRequests(prompt, languageGraph = {}, sceneLanguageGraph = {}) {
    const requests = [];
    const identities = new Set();
    const add = (headId, sourceId, text) => {
      const value = String(text || '').trim();
      if (!value) return;
      const identity = `${headId}\u0000${value.toLowerCase()}`;
      if (identities.has(identity)) return;
      identities.add(identity);
      requests.push(Object.freeze({
        schema: REQUEST_SCHEMA,
        id: `${headId}:${sourceId || requests.length}`,
        headId,
        sourceId: String(sourceId || ''),
        text: value,
      }));
    };

    add('scene-domain', 'prompt', prompt);
    for (const span of (languageGraph.spans || []).slice(0, LIMITS.languageSpans)) {
      add('span-entity-role', span.id, span.text || span.normalized);
    }
    for (const entity of [
      ...(sceneLanguageGraph.entities || []),
      ...(sceneLanguageGraph.parts || []),
      ...(sceneLanguageGraph.mediums || []),
    ].slice(0, LIMITS.materialEntities)) {
      add('material', entity.id, entryText(entity, prompt));
    }
    for (const action of (sceneLanguageGraph.actions || []).slice(0, LIMITS.actions)) {
      add('pose', action.id, entryText(action, prompt));
    }
    for (const relation of (sceneLanguageGraph.relations || []).slice(0, LIMITS.relations)) {
      add('relation', relation.id, entryText(relation, prompt));
    }
    for (const obligation of (sceneLanguageGraph.obligations || []).slice(0, LIMITS.obligations)) {
      add('obligation-support', obligation.id, entryText(obligation, prompt));
    }
    return Object.freeze(requests);
  }

  function entryText(entry, fallback) {
    return entry && (
      entry.text
      || entry.sourceText
      || entry.label
      || entry.term
      || entry.predicate
      || entry.relation
      || entry.type
    ) || fallback;
  }

  return Object.freeze({ REQUEST_SCHEMA, LIMITS, buildRequests });
});
