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
    const world = sdk.worldQuery.snapshot();
    const worldModel = sdk.worldQuery.model();
    let presentationCache = null;

    function contributeRequest({ sourceText, mission }) {
      if (!mission) return null;
      if (!/\b(?:shade|shaded|shadier|less\s+direct\s+sun|avoid(?:ing)?\s+(?:the\s+)?sun|hot\s+day)\b/i.test(sourceText || '')) {
        sdk.events.propose({ pluginId: 'sun-walker', kind: 'sun-walker.cleared' });
        return null;
      }
      const policy = sdk.routing.policy() || {};
      const routeObjective = policy.routeObjective || {};
      if (routeObjective.sunExposureSeconds > 0) {
        return {
          recognized: true,
          obligations: [{ id: 'sun-walker:direct-sun-exposure', kind: 'direct_sun_exposure', required: true }],
          unresolved: [],
        };
      }
      const selection = exposure.selectShadeAwareRoute({
        world,
        worldModel,
        originNodeId: mission.originNodeId,
        destinationNodeId: mission.destinationNodeId,
        mode: sdk.routing.modeFor(mission.embodimentId),
        mission,
        policy,
        utcInstant: sdk.clock.instantForMission(mission),
        routes: sdk.routing.alternatives(mission, config.maximumAlternatives),
        directSunWeight: config.directSunWeight,
        unknownWeight: config.unknownWeight,
        maximumAddedTimeSeconds: config.maximumAddedTimeSeconds,
        maximumAddedRatio: config.maximumAddedRatio,
        sampleSpacingM: config.sampleSpacingM,
      });
      presentationCache = buildPresentation(selection, world, worldModel);
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

    function createRouteContributor({ mission }) {
      const origin = exposure.worldOrigin(world);
      const buildings = exposure.compiledBuildings(world);
      return {
        id: 'sun-walker:sun-exposure',
        evaluateSegment({ segment }) {
          const utcInstant = sdk.clock.instantForMission(mission);
          const sun = exposure.solarPosition(utcInstant, origin.lat, origin.lon);
          const row = exposure.segmentExposureRow({
            segment,
            buildings,
            sun,
            sampleSpacingM: config.sampleSpacingM || 18,
            minimumSolarElevationDegrees: 2,
          });
          return {
            eligible: true,
            costDimensions: {
              sunExposureSeconds: row.output.directSunSeconds,
            },
            rejectionReasons: [],
            receipt: row.output,
          };
        },
        evaluateRoute({ route }) {
          const utcInstant = sdk.clock.instantForMission(mission);
          const sun = exposure.solarPosition(utcInstant, origin.lat, origin.lon);
          const evaluation = exposure.evaluateRoute({
            model: exposure.createShadeCostModel({
              world,
              buildings,
              latitudeDegrees: origin.lat,
              longitudeDegrees: origin.lon,
              sampleSpacingM: config.sampleSpacingM || 18,
              directSunWeight: config.directSunWeight || 1,
              unknownWeight: config.unknownWeight || 2,
            }),
            segmentIds: route.segmentIds,
            worldModel,
            departureAt: utcInstant,
            routeCandidateId: 'sun-walker-selected',
          });
          const totalShadeSeconds = evaluation.edgeRows.reduce((sum, row) => sum + row.components.shadeSeconds, 0);
          const totalLitSeconds = evaluation.edgeRows.reduce((sum, row) => sum + row.components.directSunSeconds, 0) + totalShadeSeconds;
          const selection = {
            schema: 'simulatte.shadeRouteSelection.v1',
            selected: {
              route,
              exposure: evaluation.edgeRows.reduce((sum, row) => {
                Object.entries(row.components).forEach(([key, value]) => { sum[key] = (sum[key] || 0) + value; });
                return sum;
              }, {}),
              objective: evaluation.generalizedCost,
              addedTimeSeconds: 0,
              detourRatio: 0,
              withinDetourBound: true,
            },
            fastest: null,
            candidates: [],
            field: {
              id: `sun-field-${utcInstant.replace(/[:.-]/g, '')}`,
              azimuthDegrees: sun.azimuthDegrees,
              elevationDegrees: sun.elevationDegrees,
              claimBoundary: 'clear-sky direct sun',
            },
            comparison: {
              schema: 'simulatte.comparativeShadeReceipt.v1',
              selectedRouteId: route.segmentIds.join('|'),
              fastestRouteId: route.segmentIds.join('|'),
              selectedModeledBuildingShadePercent: totalLitSeconds ? Math.round(totalShadeSeconds / totalLitSeconds * 100) : 0,
              fastestModeledBuildingShadePercent: totalLitSeconds ? Math.round(totalShadeSeconds / totalLitSeconds * 100) : 0,
              selectedDirectSunSeconds: evaluation.edgeRows.reduce((sum, row) => sum + row.components.directSunSeconds, 0),
              fastestDirectSunSeconds: evaluation.edgeRows.reduce((sum, row) => sum + row.components.directSunSeconds, 0),
              selectedShadeSeconds: totalShadeSeconds,
              fastestShadeSeconds: totalShadeSeconds,
              addedTravelSeconds: 0,
              detourPercent: 0,
              withinDetourBound: true,
            },
            weights: { travelSeconds: 1, directSunSeconds: config.directSunWeight || 1, unknownSeconds: config.unknownWeight || 2 },
            detourPolicy: {
              maximumAddedTimeSeconds: config.maximumAddedTimeSeconds || 600,
              maximumAddedRatio: config.maximumAddedRatio || 0.25,
              effectiveMaximumAddedTimeSeconds: config.maximumAddedTimeSeconds || 600,
            },
            traversalCostModel: null,
            selectionAuthority: 'inspectable_javascript',
            modelExecution: false,
            searchComplete: true,
            claimBoundary: 'clear-sky direct sun',
          };
          selection.fastest = selection.selected;
          presentationCache = buildPresentation(selection, world, worldModel);
          sdk.events.propose({ pluginId: 'sun-walker', kind: 'sun-walker.route-selected', selection });
          sdk.receipts.append({
            schema: 'simulatte.plugin.sunWalkerSelectionReceipt.v1',
            fieldId: selection.field.id,
            selectedSegmentIds: route.segmentIds,
            comparison: selection.comparison,
          });
          return evaluation;
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
          { label: 'Sun', value: `${Math.round(selection.field.azimuthDegrees)}° azimuth · ${Math.round(selection.field.elevationDegrees)}° elevation` },
          { label: 'Shadows', value: `${presentationCache?.areas.length || 0} building projections` },
          { label: 'Added travel', value: `${Math.round(selection.comparison.addedTravelSeconds)} s` },
      ];
      return [
        { slot: 'inspector', title: 'Sun exposure', rows, actions: [] },
        { slot: 'hud', title: 'Sun + shade', rows: [rows[0], rows[2], rows[3]], actions: [{ id: 'focus-shade', label: 'View sun and shade', command: { kind: 'camera.focus', targetId: 'shade-route' } }] },
      ];
    }

    function present() {
      const selection = sdk.state.read().selection;
      if (!selection) return null;
      if (!presentationCache || presentationCache.fieldId !== selection.field.id) presentationCache = buildPresentation(selection, world, worldModel);
      return presentationCache.value;
    }

    // v2 (§17): separate direct-sun routing from thermal comfort. This neutral field
    // combines the pinned environment sample (air temperature + solar elevation) into a
    // clear-sky mean-radiant-temperature proxy and a thermal dose from the selected
    // route's direct-sun seconds, rather than silently relabelling sun exposure as heat.
    const capabilities = {
      'field.thermal-comfort.v1': (input) => {
        if (!sdk.environment) return { enabled: false, reason: 'environment_unavailable' };
        if (!input || !Number.isFinite(input.longitude) || !Number.isFinite(input.latitude)) return { value: null, reason: 'coordinate_required' };
        const instant = input.instant || '2026-07-01T17:00:00Z';
        const sample = sdk.environment.sample({ instant, longitude: input.longitude, latitude: input.latitude, fields: ['airTemperatureC', 'solarElevationDegrees'] });
        const solarRad = Math.max(0, Math.sin((sample.values.solarElevationDegrees * Math.PI) / 180));
        // Clear-sky MRT proxy: air temperature plus a bounded radiant load from the sun.
        const meanRadiantTemperatureC = Number((sample.values.airTemperatureC + 18 * solarRad).toFixed(2));
        const selection = sdk.state.read().selection;
        const directSunSeconds = selection?.summary?.selectedDirectSunSeconds ?? 0;
        return {
          schema: 'field.thermal-comfort.v1',
          value: meanRadiantTemperatureC, units: 'mean_radiant_temperature_c_proxy',
          airTemperatureC: sample.values.airTemperatureC,
          thermalDoseSunSeconds: directSunSeconds,
          providerId: 'sun-walker', sourceSnapshotIds: sample.sourceSnapshotIds,
          claimBoundary: 'Clear-sky mean-radiant-temperature proxy from a pinned environment snapshot and modeled direct-sun exposure; not a measured thermal-comfort observation.',
        };
      },
    };
    return Object.freeze({ id: 'sun-walker', contributeRequest, createRouteContributor, settle, view, present, capabilities, dispose() {} });
  }

  function reduce(state, event) {
    if (event.kind === 'sun-walker.cleared') return { ...state, selection: null };
    if (event.kind !== 'sun-walker.route-selected') return state;
    return { ...state, selection: event.selection };
  }

  function buildPresentation(selection, world, worldModel) {
    const selectedIds = selection.selected.route.segmentIds;
    const fastestIds = selection.fastest.route.segmentIds;
    const paths = [{ id: 'shade-route', label: 'Shade-selected route', segmentIds: selectedIds, tone: 'green', widthM: 8, intensity: 1.35 }];
    if (fastestIds.join('|') !== selectedIds.join('|')) paths.unshift({ id: 'fastest-route', label: 'Fastest route', segmentIds: fastestIds, tone: 'amber', widthM: 4, intensity: 0.8 });
    const areas = projectedBuildingShadows(world, worldModel, selectedIds, selection.field);
    return {
      fieldId: selection.field.id,
      areas,
      value: {
        schema: 'simulatte.pluginPresentation.v2',
        markers: [],
        paths,
        actors: [],
        areas,
        sun: {
          id: 'modeled-sun',
          label: `Modeled sun at ${Math.round(selection.field.elevationDegrees)}° elevation`,
          azimuthDegrees: selection.field.azimuthDegrees,
          elevationDegrees: selection.field.elevationDegrees,
          anchorSegmentIds: selectedIds,
          distanceM: 260,
          radiusM: 18,
          intensity: 2,
        },
        cameraTargets: [{ id: 'shade-route', label: 'Sun and shade route', nodeIds: [], segmentIds: selectedIds, distanceM: 740 }],
      },
    };
  }

  function projectedBuildingShadows(world, worldModel, segmentIds, field) {
    if (field.elevationDegrees <= 2) return [];
    const routePoints = segmentIds.flatMap((id) => worldModel.segment(id).geometry);
    const bounds = pointBounds(routePoints, 180);
    const center = { x: (bounds.minimumX + bounds.maximumX) / 2, y: (bounds.minimumY + bounds.maximumY) / 2 };
    const azimuth = field.azimuthDegrees * Math.PI / 180;
    const elevation = field.elevationDegrees * Math.PI / 180;
    return world.renderGeometry.buildings
      .filter((building) => Number.isFinite(building.heightM) && building.heightM > 0 && intersectsBounds(building.footprint, bounds))
      .sort((left, right) => distanceSquared(left.centroid, center) - distanceSquared(right.centroid, center) || left.id.localeCompare(right.id))
      .slice(0, 320)
      .map((building) => {
        const length = Math.min(400, building.heightM / Math.tan(elevation));
        const delta = { x: -Math.sin(azimuth) * length, y: -Math.cos(azimuth) * length };
        const footprint = openRing(building.footprint);
        const points = convexHull([...footprint, ...footprint.map((point) => ({ x: point.x + delta.x, y: point.y + delta.y }))]);
        return { id: `shadow-${building.id}`, label: `${building.id} modeled shadow`, points, tone: 'shade', heightM: 0.72, intensity: 0.18 };
      });
  }

  function pointBounds(points, padding = 0) {
    return {
      minimumX: Math.min(...points.map((row) => row.x)) - padding,
      maximumX: Math.max(...points.map((row) => row.x)) + padding,
      minimumY: Math.min(...points.map((row) => row.y)) - padding,
      maximumY: Math.max(...points.map((row) => row.y)) + padding,
    };
  }

  function intersectsBounds(points, bounds) {
    const row = pointBounds(points);
    return row.maximumX >= bounds.minimumX && row.minimumX <= bounds.maximumX && row.maximumY >= bounds.minimumY && row.minimumY <= bounds.maximumY;
  }

  function convexHull(points) {
    const sorted = [...points].sort((left, right) => left.x - right.x || left.y - right.y);
    const turn = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    const half = (rows) => rows.reduce((hull, point) => {
      while (hull.length >= 2 && turn(hull.at(-2), hull.at(-1), point) <= 0) hull.pop();
      hull.push(point);
      return hull;
    }, []);
    return [...half(sorted).slice(0, -1), ...half(sorted.reverse()).slice(0, -1)];
  }

  function openRing(points) {
    return points.length > 1 && points[0].x === points.at(-1).x && points[0].y === points.at(-1).y ? points.slice(0, -1) : [...points];
  }

  function distanceSquared(left, right) {
    return (left.x - right.x) ** 2 + (left.y - right.y) ** 2;
  }

  return Object.freeze({ activate });
});
