(function initSimulattePhysicsModelDependencies(root) {
  const moduleRegistry = typeof module === 'object' && module.exports
    ? require('../../app/runtime/phase-module-registry.js')
    : root.SimulattePhaseModuleRegistry;
  const scope = moduleRegistry.family('physicsModel');
  if (scope.initialized) return;
  const dependencyApi = typeof module === 'object' && module.exports
      ? require('../../app/runtime/require-runtime-dependency.js')
      : root.SimulatteRuntimeDependency;
  const requireRuntimeDependency = dependencyApi.requireRuntimeDependency;
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
  const deterministicValues = typeof module === 'object' && module.exports
      ? require('../../../shared/deterministic-values.js')
      : root.SimulatteDeterministicValues;
  const worldSpec = typeof module === 'object' && module.exports
      ? require('../../../shared/contracts/world-spec.js')
      : root.SimulatteWorldSpec;
  const worldProof = typeof module === 'object' && module.exports
      ? require('../../../shared/contracts/world-proof.js')
      : root.SimulatteWorldProof;
  requireRuntimeDependency({
    root,
    moduleName: 'SimulattePhysicsModel',
    dependencyName: 'SimulattePhysicsCatalog',
    value: catalog,
  });
  requireRuntimeDependency({
    root,
    moduleName: 'SimulattePhysicsModel',
    dependencyName: 'SimulatteDeterministicValues',
    value: deterministicValues,
  });
  requireRuntimeDependency({
    root,
    moduleName: 'SimulattePhysicsModel',
    dependencyName: 'SimulatteWorldSpec',
    value: worldSpec,
  });
  requireRuntimeDependency({
    root,
    moduleName: 'SimulattePhysicsModel',
    dependencyName: 'SimulatteWorldProof',
    value: worldProof,
  });
  moduleRegistry.define('physicsModel', 'simulatte-physics-model-dependencies.js', {
    root,
    catalog,
    composer,
    classifier,
    semantic,
    doppler,
    graphSynthesis,
    universeParser,
    universeGrounder,
    physicsIR,
    physicsIRValidator,
    solverCompiler,
    renderIR,
    intentForensics,
    activationModule,
    groundedModule,
    languageLexicon,
    phaseContracts,
    worldSpec,
    worldProof,
    ...deterministicValues,
    ...(renderProof || {}),
    initialized: true,
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
