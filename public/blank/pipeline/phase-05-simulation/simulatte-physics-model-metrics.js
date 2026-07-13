(function attachSimulattePhysicsModelmetrics(root) {
  const scope = root.__SimulattePhysicsModelRefactorScope;
  if (!scope || scope.missingDependency) return;
  with (scope) {
    function stateLabel(state, spec) {
        if (spec.templateId === 'blank-world') {
          return 'blank construction plane';
        }
        if (spec.templateId === 'custom-world') {
          const sceneKind = spec.renderProgram && spec.renderProgram.rendererPlan
            ? spec.renderProgram.rendererPlan.sceneKind
            : '';
          if (sceneKind === 'magnetic-machine') return 'composed magnetic machine';
          if (sceneKind === 'fire') return 'elemental reaction world';
          if (sceneKind === 'optics' || sceneKind === 'thin-film') return 'composed optics world';
          if (sceneKind === 'city') return 'composed operations network';
          if (sceneKind === 'watershed') return 'terrain flow world';
          if (sceneKind === 'biology') return 'composed control biology';
          if (sceneKind === 'acoustic') return 'composed wave world';
          if (sceneKind === 'granular') return 'granular physics world';
          if (sceneKind === 'ferrofluid') return 'magnetic fluid world';
    	      if (sceneKind === 'thermal-plume') return 'thermal plume world';
    	      if (sceneKind === 'mechanical') return 'mechanical constraint world';
    	      if (sceneKind === 'weather-atmosphere') return 'weather atmosphere volume';
    	      if (sceneKind === 'ocean-cryosphere') return 'ocean cryosphere system';
    	      if (sceneKind === 'grid-energy') return 'energy grid stability field';
    	      if (sceneKind === 'robotics-control') return 'robotics control workspace';
    	      if (sceneKind === 'manufacturing-line') return 'manufacturing line field';
    	      if (sceneKind === 'quantum-instrument') return 'quantum instrument field';
    	      if (sceneKind === 'chemistry-lab') return 'oscillating chemistry lab';
          if (sceneKind === 'cultural-material') return 'cultural material conservation';
          if (sceneKind === 'venue-crowd') return 'crowd venue field';
          if (sceneKind === 'sport-motion') return 'sport trajectory world';
          if (sceneKind === 'space-instrument') return 'deep space instrument field';
          if (sceneKind === 'planetary-space') return 'planetary space environment';
          if (sceneKind === 'evolution-ecology') return 'evolution ecology landscape';
          if (sceneKind === 'agro-waste-loop') return 'agro waste loop';
          if (sceneKind === 'hazard-atmosphere') return 'hazard atmosphere world';
          if (sceneKind === 'civic-market') return 'civic market network';
          if (sceneKind === 'digital-network') return 'digital network system';
          if (sceneKind === 'clinical-control') return 'clinical control field';
          if (sceneKind === 'restoration-water') return 'restoration water system';
          if (sceneKind === 'advanced-energy') return 'advanced energy chemistry';
          if (hasModule(spec, 'terrain') && hasModule(spec, 'logistics')) return 'composed terrain market';
          if (hasModule(spec, 'phase-change') && hasModule(spec, 'network')) return 'composed phase network';
          if (hasModule(spec, 'biology') && hasModule(spec, 'control')) return 'composed control biology';
          if (hasModule(spec, 'atomic') && hasModule(spec, 'metal')) return 'atomic material world';
          if (hasModule(spec, 'fire') && hasModule(spec, 'water')) return 'elemental reaction world';
          if (hasModule(spec, 'glass') && hasModule(spec, 'magnetic')) return 'raw material optics';
          if (hasModule(spec, 'rock') || hasModule(spec, 'wood') || hasModule(spec, 'metal')) return 'raw material world';
          if (hasModule(spec, 'chemistry') && hasModule(spec, 'fluid')) return 'composed fluid chemistry';
          if (hasModule(spec, 'electromagnetism') && hasModule(spec, 'solar')) return 'composed magnetic machine';
          if (hasModule(spec, 'queue') || hasModule(spec, 'network')) return 'composed operations network';
          if (hasModule(spec, 'optics') && hasModule(spec, 'plasma')) return 'prismatic plasma world';
          if (hasModule(spec, 'optics')) return 'composed optics world';
          if (hasModule(spec, 'plasma') || hasModule(spec, 'electricity')) return 'charged plasma world';
          if (hasModule(spec, 'acoustics') || hasModule(spec, 'wave')) return 'composed wave world';
          if (hasModule(spec, 'granular')) return 'granular physics world';
          if (hasModule(spec, 'elasticity') || hasModule(spec, 'collision')) return 'mechanical constraint world';
          if (hasModule(spec, 'fluid')) return 'composed flow world';
          if (hasModule(spec, 'chemistry')) return 'composed reaction world';
          return 'composed physics world';
        }
        if (spec.templateId === 'fluid-vortex') {
          return state.vorticity > 0.35 ? 'turbulent wake' : 'laminar drift';
        }
        if (spec.templateId === 'reaction-diffusion') {
          return state.front > 0.0004 ? 'reaction front active' : 'diffusing';
        }
        const ledger = energyLedger(state);
        return Math.abs(state.omega) < 0.05 && state.t > 2
          ? 'stalled'
          : ledger.loadPowerW > 0.2
            ? 'spinning under load'
            : 'seeking torque';
      }

    Object.assign(scope, {
      stateLabel,
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
