(function attachSimulatteScenarioEngineworldcompile(root) {
  const scope = root.__SimulatteScenarioEngineRefactorScope;
  if (!scope || scope.missingDependency) return;
  with (scope) {
    function interpolateRunStates(fromRunState, toRunState, amount) {
        if (!fromRunState || !toRunState) return toRunState || fromRunState || null;
        const t = clamp01(Number(amount || 0));
        if (t <= 0) return fromRunState;
        if (t >= 1) return toRunState;

        const scenario = toRunState.scenario || fromRunState.scenario;
        const worldSpec = toRunState.worldSpec || fromRunState.worldSpec || compileWorldSpec(scenario);
        const metrics = interpolateMetrics(fromRunState.metrics, toRunState.metrics, t);
        const actors = interpolateActors(fromRunState.actors, toRunState.actors, t);
        const resources = interpolateResources(fromRunState.resources, toRunState.resources, t);
        const stocks = interpolateStocks(fromRunState.stocks, toRunState.stocks, t);
        const tick = lerp(Number(fromRunState.tick || 0), Number(toRunState.tick || 0), t);
        const firedRules = t > 0.42 && toRunState.map ? toRunState.map.firedRules || [] : [];
        const map = buildMapSignals(metrics, { ...scenario, actors, resources }, tick, worldSpec, stocks, firedRules);

        return {
          ...toRunState,
          scenario,
          worldSpec,
          tick,
          complete: false,
          metrics,
          actors,
          resources,
          stocks,
          activeShocks: scenario.shocks.filter((shock) => tick >= shock.step),
          map,
          transition: {
            fromTick: fromRunState.tick,
            toTick: toRunState.tick,
            amount: t,
          },
        };
      }

    function createCompletionRoom(runState, status, completedAt) {
        const run = runState || createRunState();
        const summary = summarizeRun(run);
        return {
          schema: 'simulatte.completionRoom.v1',
          room: {
            id: `room-${run.scenario.id}`,
            status: status || (run.complete ? 'complete' : 'draft'),
            completedAt: completedAt || '',
            objectModel: ['scenario', 'worldSpec', 'run', 'replay', 'summary'],
          },
          scenario: run.scenario,
          worldSpec: run.worldSpec || compileWorldSpec(run.scenario),
          run,
          replay: run.replay,
          summary,
        };
      }

    function toEditableText(items, key) {
        return (items || []).map((item) => item[key] || item.name || item.text || '').filter(Boolean).join('\n');
      }

    function scenarioToEditable(scenario) {
        const normalized = normalizeScenario(scenario);
        return {
          title: normalized.title,
          prompt: normalized.prompt,
          actorsText: toEditableText(normalized.actors, 'name'),
          resourcesText: toEditableText(normalized.resources, 'name'),
          rulesText: toEditableText(normalized.rules, 'text'),
          shocksText: toEditableText(normalized.shocks, 'name'),
          goalsText: toEditableText(normalized.goals, 'text'),
        };
      }

    Object.assign(scope, {
      interpolateRunStates,
      createCompletionRoom,
      toEditableText,
      scenarioToEditable,
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
