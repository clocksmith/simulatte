(function attachSimulatteScenarioEngine(root) {
  if (typeof module === 'object' && module.exports) {
    require('./simulation-scenario-engine-dependencies.js');
    require('./simulation-scenario-engine-templates.js');
    require('./simulation-scenario-engine-scenario-build.js');
    require('./simulation-scenario-engine-world-compile.js');
  }
  const scope = root.__SimulatteScenarioEngineRefactorScope = root.__SimulatteScenarioEngineRefactorScope || {};
  if (scope.missingDependency) return;
  let api;
  with (scope) {
    api = {
    AXIS_LABELS,
    TEMPLATE_LIBRARY: TEMPLATE_LIBRARY.map((template) => ({
      id: template.id,
      title: template.title,
      domain: template.domain,
      prompt: template.match.slice(0, 3).join(' '),
    })),
    applyScenarioEdits,
    buildScenarioFromPrompt,
    compileWorldSpec,
    createCompletionRoom,
    createRunState,
    interpolateRunStates,
    normalizeScenario,
    runSteps,
    scenarioToEditable,
    stepRun,
    summarizeRun,
  };
  }
  if (typeof module === 'object' && module.exports) {
      module.exports = api;
    }
  root.SimulatteScenarioEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
