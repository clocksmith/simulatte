(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const api = factory(node ? require('./architecture-adapters.js') : root.SimulatteArchitectureAdapters);
  if (node) module.exports = api; else root.SimulatteLucydStudyApproaches = api;
})(globalThis, function (X) {
  'use strict';
  // Adds the Excalidraw study approaches for a problem to the Lucyd editor as design approaches.
  // Each stage passes through the shared architecture model and opens as unbound responsibilities,
  // which refuse to simulate until the learner refines them into simulator classes.
  const PREFIX = 'design-';

  function approaches(doc, problemId, library, config) {
    const study = X.fromStudyDocument(doc, problemId);
    X.verifyStudy(study);
    return study.solutions.map(s => ({
      id: PREFIX + s.id, title: s.meta.title + ' (design)', boundary: s.meta.chooseWhen, origin: 'study',
      stages: s.stages.map(st => ({
        id: st.id, title: st.meta.title, kind: 'design', explanation: st.meta.explanation || st.meta.reason, challenge: st.meta.question, observe: [],
        diagram: X.toDesignDiagram(st.model, study.definitions, library, config, { outcome: st.meta.question }).diagram,
      })),
    }));
  }

  function create({ config, library, fetchJson }) {
    const cache = new Map();
    const manifest = config.studyManifestPath ? fetchJson(config.studyManifestPath).catch(() => null) : Promise.resolve(null);
    // Resolves to [] when the problem has no study document; a broken document rejects so the editor can report it.
    function approachesFor(problem) {
      if (!cache.has(problem.id)) cache.set(problem.id, manifest.then(m => {
        const entry = m?.problems.find(e => e.problemId === problem.id || (problem.referenceId && e.referenceId === problem.referenceId));
        if (!entry) return [];
        return fetchJson(new URL(entry.path, new URL(config.studyManifestPath, globalThis.location?.href || 'http://localhost/')).pathname)
          .then(doc => approaches(doc, problem.id, library, config));
      }));
      return cache.get(problem.id);
    }
    return Object.freeze({ approachesFor, PREFIX });
  }

  return Object.freeze({ create, approaches, PREFIX });
});
