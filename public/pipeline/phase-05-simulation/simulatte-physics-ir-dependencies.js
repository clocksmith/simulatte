(function initSimulattePhysicsIRDependencies(root) {
  const scope = root.__SimulattePhysicsIRRefactorScope = root.__SimulattePhysicsIRRefactorScope || {};
  if (scope.initialized) return;
  const catalog = typeof module === 'object' && module.exports
      ? require('./simulatte-physics-catalog.js')
      : root.SimulattePhysicsCatalog;
  const languageLexicon = typeof module === 'object' && module.exports
      ? require('../../data/simulatte-language-lexicon.js')
      : root.SimulatteLanguageLexicon;
  const operatorStage = typeof module === 'object' && module.exports
      ? require('./simulatte-operator-stage.js')
      : root.SimulatteOperatorStage;
  scope.root = root;
  scope.catalog = catalog || {};
  scope.languageLexicon = languageLexicon || {};
  Object.assign(scope, operatorStage || {});
  scope.initialized = true;
})(typeof globalThis !== 'undefined' ? globalThis : window);
