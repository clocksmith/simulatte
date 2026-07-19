(function attachSunWalkerPlugin(root, factory) {
  const exposure = typeof module === 'object' && module.exports
    ? require('./sun-exposure.js')
    : root.SimulatteSunExposure;
  const api = factory(exposure);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulattePluginSunWalker = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createSunWalkerPlugin(exposure) {
  async function activate({ sdk, config }) {
    sdk.state.register(reduce, { selection: null });

    function contributeRequest({ sourceText, mission }) {
      if (!mission) return null;
      if (!/\b(?:shade|shaded|shadier|less\s+direct\s+sun|avoid(?:ing)?\s+(?:the\s+)?sun|hot\s+day)\b/i.test(sourceText || '')) {
        sdk.events.propose({ pluginId: 'sun-walker', kind: 'sun-walker.cleared' });
        return null;
      }
      const world = sdk.worldQuery.snapshot();
      const worldModel = sdk.worldQuery.model();
      const selection = exposure.selectShadeAwareRoute({
        world,
        worldModel,
        originNodeId: mission.originNodeId,
        destinationNodeId: mission.destinationNodeId,
        mode: sdk.routing.modeFor(mission.embodimentId),
        mission,
        policy: sdk.routing.policy(),
        utcInstant: sdk.clock.instantForMission(mission),
        routes: sdk.routing.alternatives(mission, config.maximumAlternatives),
        directSunWeight: config.directSunWeight,
        unknownWeight: config.unknownWeight,
        maximumAddedTimeSeconds: config.maximumAddedTimeSeconds,
        maximumAddedRatio: config.maximumAddedRatio,
        sampleSpacingM: config.sampleSpacingM,
      });
      sdk.events.propose({ pluginId: 'sun-walker', kind: 'sun-walker.route-selected', selection });
      sdk.receipts.append({
        schema: 'simulatte.plugin.sunWalkerSelectionReceipt.v1',
        fieldId: selection.field.id,
        selectedSegmentIds: selection.selected.route.segmentIds,
        comparison: selection.comparison,
      });
      return {
        recognized: true,
        obligations: [{ id: 'sun-walker:direct-sun-exposure', kind: 'direct_sun_exposure', required: true }],
        unresolved: [],
        missionPatch: {
          routeOverride: {
            segmentIds: [...selection.selected.route.segmentIds],
            environmentFieldId: selection.field.id,
            selectionId: `${selection.field.id}:selected`,
            objective: selection.selected.objective,
            algorithm: 'sun_walker_arrival_time_route_v1',
          },
        },
      };
    }

    function settle({ journey }) {
      const selection = sdk.state.read().selection;
      if (!selection) return null;
      return {
        obligationResults: [{ obligationId: 'sun-walker:direct-sun-exposure', status: journey?.finalState?.status === 'completed' ? 'settled' : 'not_settled' }],
        stateIdentity: selection.field.id,
        losses: [],
      };
    }

    function view(context = {}) {
      const selection = sdk.state.read().selection;
      if (!selection) return { slot: context.compositionSize === 1 ? 'map' : 'inspector', title: 'Sun Walker', rows: [{ label: 'Activation', value: 'Ask for shade or less direct sun' }, { label: 'Method', value: 'Building geometry + sun position' }], actions: [] };
      const rows = [
          { label: 'Selected route', value: `${Math.round(selection.comparison.selectedModeledBuildingShadePercent)}% modeled shade` },
          { label: 'Fastest route', value: `${Math.round(selection.comparison.fastestModeledBuildingShadePercent)}% modeled shade` },
          { label: 'Added travel', value: `${Math.round(selection.comparison.addedTravelSeconds)} s` },
      ];
      return [
        { slot: 'inspector', title: 'Sun exposure', rows, actions: [] },
        { slot: 'hud', title: 'Shade route', rows: rows.slice(0, 2), actions: [{ id: 'focus-shade', label: 'View shade route', command: { kind: 'camera.focus', targetId: 'shade-route' } }] },
      ];
    }

    function present() {
      const selection = sdk.state.read().selection;
      if (!selection) return null;
      const selectedIds = selection.selected.route.segmentIds;
      const fastestIds = selection.fastest.route.segmentIds;
      const paths = [{ id: 'shade-route', label: 'Shade-selected route', segmentIds: selectedIds, tone: 'green', widthM: 8, intensity: 1.35 }];
      if (fastestIds.join('|') !== selectedIds.join('|')) paths.unshift({ id: 'fastest-route', label: 'Fastest route', segmentIds: fastestIds, tone: 'amber', widthM: 4, intensity: 0.8 });
      return { schema: 'simulatte.pluginPresentation.v1', markers: [], paths, actors: [], cameraTargets: [{ id: 'shade-route', label: 'Shade-selected route', nodeIds: [], segmentIds: selectedIds, distanceM: 1100 }] };
    }

    return Object.freeze({ id: 'sun-walker', contributeRequest, settle, view, present, dispose() {} });
  }

  function reduce(state, event) {
    if (event.kind === 'sun-walker.cleared') return { ...state, selection: null };
    if (event.kind !== 'sun-walker.route-selected') return state;
    return { ...state, selection: event.selection };
  }

  return Object.freeze({ activate });
});
