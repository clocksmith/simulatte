(function initSimulattePhysicsModelDependencies(root) {
  const scope = root.__SimulattePhysicsModelRefactorScope = root.__SimulattePhysicsModelRefactorScope || {};
  if (scope.initialized) return;
  function markMissingDependency(moduleName, dependencyName) {
      const state = root.SimulatteBoot = root.SimulatteBoot || { failedScripts: [] };
      state.missingDependencies = state.missingDependencies || [];
      state.missingDependencies.push({ moduleName, dependencyName });
      console.warn(`[simulatte.boot] ${moduleName} waiting for ${dependencyName}`);
    }
  const catalog = typeof module === 'object' && module.exports
      ? require('./simulatte-physics-catalog.js')
      : root.SimulattePhysicsCatalog;
  const composer = typeof module === 'object' && module.exports
      ? require('../phase-06-visual/simulatte-composition-graph.js')
      : root.SimulatteCompositionGraph;
  const classifier = typeof module === 'object' && module.exports
      ? require('../phase-03-retrieval/simulatte-intent-classifier.js')
      : root.SimulatteIntentClassifier;
  const semantic = typeof module === 'object' && module.exports
      ? require('../phase-03-retrieval/simulatte-semantic-rag.js')
      : root.SimulatteSemanticRag;
  const doppler = typeof module === 'object' && module.exports
      ? require('../phase-01-runtime/simulatte-doppler-intent.js')
      : root.SimulatteDopplerIntent;
  const graphSynthesis = typeof module === 'object' && module.exports
      ? require('../phase-04-grounded-intent/simulatte-graph-synthesis.js')
      : root.SimulatteGraphSynthesis;
  const universeParser = typeof module === 'object' && module.exports
      ? require('../phase-02-language/simulatte-universe-parser.js')
      : root.SimulatteUniverseParser;
  const universeGrounder = typeof module === 'object' && module.exports
      ? require('../phase-04-grounded-intent/simulatte-universe-grounder.js')
      : root.SimulatteUniverseGrounder;
  const physicsIR = typeof module === 'object' && module.exports
      ? require('./simulatte-physics-ir.js')
      : root.SimulattePhysicsIR;
  const physicsIRValidator = typeof module === 'object' && module.exports
      ? require('./simulatte-physics-ir-validator.js')
      : root.SimulattePhysicsIRValidator;
  const solverCompiler = typeof module === 'object' && module.exports
      ? require('./simulatte-solver-compiler.js')
      : root.SimulatteSolverCompiler;
  const renderIR = typeof module === 'object' && module.exports
      ? require('./simulatte-render-ir.js')
      : root.SimulatteRenderIR;
  const intentForensics = typeof module === 'object' && module.exports
      ? require('../phase-04-grounded-intent/simulatte-intent-forensics.js')
      : root.SimulatteIntentForensics;
  const activationModule = typeof module === 'object' && module.exports
      ? require('../phase-03-retrieval/simulatte-activation-cloud.js')
      : root.SimulatteActivationCloud;
  const groundedModule = typeof module === 'object' && module.exports
      ? require('../phase-04-grounded-intent/simulatte-grounded-interpretation.js')
      : root.SimulatteGroundedInterpretation;
  const languageLexicon = typeof module === 'object' && module.exports
      ? require('../../../data/simulatte-language-lexicon.js')
      : root.SimulatteLanguageLexicon;
  const phaseContracts = typeof module === 'object' && module.exports
      ? require('../simulatte-phase-contracts.js')
      : root.SimulattePhaseContracts;
  const renderProof = typeof module === 'object' && module.exports
      ? require('../phase-07-render/simulatte-render-proof.js')
      : root.SimulatteRenderProof;
  if (!catalog) {
      markMissingDependency('SimulattePhysicsModel', 'SimulattePhysicsCatalog');
      scope.missingDependency = true; return;
    }
  scope.root = root;
  scope.catalog = catalog;
  scope.composer = composer;
  scope.classifier = classifier;
  scope.semantic = semantic;
  scope.doppler = doppler;
  scope.graphSynthesis = graphSynthesis;
  scope.universeParser = universeParser;
  scope.universeGrounder = universeGrounder;
  scope.physicsIR = physicsIR;
  scope.physicsIRValidator = physicsIRValidator;
  scope.solverCompiler = solverCompiler;
  scope.renderIR = renderIR;
  scope.intentForensics = intentForensics;
  scope.activationModule = activationModule;
  scope.groundedModule = groundedModule;
  scope.languageLexicon = languageLexicon;
  scope.phaseContracts = phaseContracts;
  Object.assign(scope, renderProof || {});
  scope.initialized = true;
})(typeof globalThis !== 'undefined' ? globalThis : window);
