(function initSimulattePhysicsIRDependencies(root) {
  const scope = root.__SimulattePhysicsIRRefactorScope = root.__SimulattePhysicsIRRefactorScope || {};
  if (scope.initialized) return;
  const catalog = typeof module === 'object' && module.exports
      ? require('./simulatte-physics-catalog.js')
      : root.SimulattePhysicsCatalog;
  const languageLexicon = typeof module === 'object' && module.exports
      ? require('../../data/simulatte-language-lexicon.js')
      : root.SimulatteLanguageLexicon;
  scope.root = root;
  scope.catalog = catalog || {};
  scope.languageLexicon = languageLexicon || {};
  scope.initialized = true;
})(typeof globalThis !== 'undefined' ? globalThis : window);
