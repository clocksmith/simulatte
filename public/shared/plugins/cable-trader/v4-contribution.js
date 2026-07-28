(function attachCableTraderV4Contribution(root, factory) {
  const builder = typeof module === 'object' && module.exports
    ? require('../../core/simulation/plugin-v4-builder.js')
    : root.SimulattePluginV4Builder;
  const api = factory(builder);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteCableTraderV4Contribution = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createCableTraderV4Contribution(builder) {
  const PLUGIN_ID = 'cable-trader';
  const DAY_MS = 86400000;
  const DATASET_REFERENCE = Object.freeze({
    id: 'cable-logistics-catalog-v1',
    path: '../../../data/cable-trader/cable-logistics-catalog-v1.json',
    sha256: '8d41a7ff73a7073b6d8de7f3703c29726fbfe3586f13b94bc891f426d4fac3ee',
    schemaId: 'simulatte.cableLogisticsCatalog.v1',
  });
  const MODEL_IDENTITIES = Object.freeze({
    eventModelHash: 'fb05035a907c962dfed5ca7bc652e332673aaa5933e8156ecce0eeed1e10e61e',
    flowModelHash: '95e65a979b8284b9039c2319a8599edd1f75d05789200d81c2622e130f0c1c64',
  });

  function createContribution({ config, simulation, state, transferRoutes, comparisonRuns = [] }) {
    const visible = simulation.snapshots[state.playback.day];
    const scenarioRecord = builder.datasetRecord(config.id, { sha256: simulation.configurationHash }, {
      kind: 'authored synthetic cable logistics crisis',
      seed: simulation.seed,
      policyId: simulation.allocationPolicy,
      selectedCableFamilyIds: simulation.selectedCableFamilyIds,
      interventions: config.simulation.interventions || [],
    });
    const standardsRecord = builder.datasetRecord(DATASET_REFERENCE.id, { sha256: DATASET_REFERENCE.sha256 }, {
      schemaId: DATASET_REFERENCE.schemaId,
      coverage: 'standards-family identities only',
    });
    const modelRecord = builder.modelRecord({
      id: `${PLUGIN_ID}:model:policy-scored-flow`,
      datasetId: scenarioRecord.id,
      contentHash: MODEL_IDENTITIES.flowModelHash,
      parentIds: [scenarioRecord.id, standardsRecord.id],
      metadata: {
        algorithm: simulation.solver.algorithm,
        policyId: simulation.allocationPolicy,
        optimalityProven: simulation.solver.optimalityProven,
      },
    });
    const simulated = builder.provenance({
      origin: 'simulated',
      temporalStatus: 'forecast',
      uncertainty: { kind: 'distribution', value: { seed: simulation.seed, ensembleSize: 1 } },
      records: [scenarioRecord, modelRecord],
    });
    const scenario = builder.provenance({
      origin: 'scenario',
      temporalStatus: 'forecast',
      uncertainty: { kind: 'missing', value: { observedOperationsCalibration: true } },
      records: [scenarioRecord],
    });
    const routeById = new Map(transferRoutes.map((row) => [row.id, row]));
    const layers = [
      ...depotLayers(config, visible, scenario),
      ...projectLayers(config, visible, simulated),
      ...transferLayers(config, visible, routeById, simulated),
      ...disruptionLayers(config, visible, scenario),
      ...(state.playback.status === 'settled'
        ? comparisonLayers(config, comparisonRuns, routeById, simulated)
        : []),
    ];
    const events = simulation.events.map((row, sequence) => builder.event({
      id: row.id,
      pluginId: PLUGIN_ID,
      sequence,
      simulationTimeMs: (sequence + 1) * DAY_MS,
      kind: row.kind,
      causationIds: row.causalParentIds,
      correlationId: simulation.id,
      payload: { measures: row.measures, storyEvents: row.storyEvents },
      provenance: simulated,
    }));
    const leadingTransfer = visible.activeTransfers[0];
    const presentation = builder.presentation({
      pluginId: PLUGIN_ID,
      coordinateSystem: 'city-node-segment-id',
      layers,
      viewIntents: [
        builder.viewIntent({
          id: 'cable-network-overview',
          mode: 'overview',
          targetIds: [
            ...config.hubs.map((row) => `depot:${row.id}`),
            ...config.demandSites.map((row) => `project-site:${row.id}`),
          ],
          reasonEventId: events[Math.max(0, state.playback.day - 1)]?.id || null,
          priority: 45,
        }),
        builder.viewIntent({
          id: 'cable-policy-comparison',
          mode: 'compare',
          targetIds: [
            ...config.hubs.map((row) => `depot:${row.id}`),
            ...config.demandSites.map((row) => `project-site:${row.id}`),
          ],
          reasonEventId: events[Math.max(0, state.playback.day - 1)]?.id || null,
          priority: 40,
        }),
        ...(leadingTransfer ? [builder.viewIntent({
          id: `follow:${leadingTransfer.id}`,
          mode: 'follow',
          targetIds: [`actor:${leadingTransfer.id}`],
          reasonEventId: events[Math.max(0, state.playback.day - 1)]?.id || null,
          priority: 65,
        })] : []),
      ],
    });
    const controls = builder.controls([
      multiSelect('selectedCableFamilyIds', 'Cable families', simulation.selectedCableFamilyIds, config.cableTypes, scenario),
      select('demandPriority', 'Demand priority', config.simulation.demandPriority, [
        option('critical-first', 'Critical first'),
        option('deadline-first', 'Earliest deadline'),
        option('balanced', 'Balanced'),
      ], scenario),
      toggle('allowSubstitutes', 'Accept compatible substitutes', config.simulation.allowSubstitutes, scenario),
      select('reservePolicy', 'Depot reserve', config.simulation.reservePolicy, [
        option('none', 'Release all stock'),
        option('one-reel', 'Hold one reel'),
        option('twenty-percent', 'Hold 20% per reel'),
      ], scenario),
      numeric('transferCapacityMetersPerDay', 'Daily transfer capacity', config.simulation.transferCapacityMetersPerDay, 50, 10000, 50, scenario),
      select('allocationObjective', 'Allocation objective', config.simulation.allocationObjective, [
        option('cheapest', 'Cheapest completion'),
        option('fastest', 'Fastest restoration'),
        option('fairness-first', 'Fairness first'),
      ], scenario),
      numeric('fairnessWeight', 'Fairness weighting', config.simulation.fairnessWeight, 0, 5, 0.25, scenario),
      select('disruptionScenario', 'Staged disruption', config.simulation.disruptionScenario, [
        option('none', 'No disruption'),
        option('road-closure', 'Road closure'),
        option('damaged-stock', 'Damaged stock'),
        option('surprise-demand', 'Surprise repair'),
        option('fairness-conflict', 'Fairness conflict'),
      ], scenario),
      numeric('initialInventoryPerHubType', 'Starting reels per family', config.simulation.initialInventoryPerHubType, 1, 12, 1, scenario),
    ], [
      {
        id: 'cheapest-vs-fastest',
        label: 'Cheapest vs fastest restoration',
        baselineScenarioId: `${simulation.scenarioId}:cheapest`,
        variantScenarioId: `${simulation.scenarioId}:fastest`,
        synchronizedClock: true,
      },
      {
        id: 'cheapest-vs-fairness',
        label: 'Cheapest vs fairness first',
        baselineScenarioId: `${simulation.scenarioId}:cheapest`,
        variantScenarioId: `${simulation.scenarioId}:fairness-first`,
        synchronizedClock: true,
      },
    ]);
    const progressiveState = builder.state({
      id: `${simulation.id}:day-${visible.day}`,
      pluginId: PLUGIN_ID,
      simulationTimeMs: visible.day * DAY_MS,
      status: state.playback.status,
      previousStateId: visible.day ? `${simulation.id}:day-${visible.day - 1}` : null,
      eventIds: events.slice(0, visible.day).map((row) => row.id),
      measures: [
        builder.quantity('requested-cable', visible.summary.requestedMeters, 'm'),
        builder.quantity('delivered-cable', visible.summary.deliveredMeters, 'm'),
        builder.quantity('unserved-cable', visible.summary.shortageMeters, 'm'),
        builder.quantity('in-transit-cable', visible.summary.inTransitMeters, 'm'),
        builder.quantity('completed-projects', visible.summary.completedProjects, 'projects'),
        builder.quantity('transport-cost', visible.summary.totalCost, 'modeled cost units'),
        builder.quantity('unusable-remnant', visible.summary.wasteMeters, 'm'),
        builder.quantity('user-interventions', (config.simulation.interventions || []).length, 'actions'),
      ],
      provenance: simulated,
    });
    return builder.contribution({
      pluginId: PLUGIN_ID,
      presentation,
      events,
      controls,
      state: progressiveState,
      inspections: createInspections(config, visible, simulated),
      provenanceRecords: [standardsRecord, scenarioRecord, modelRecord],
    });
  }

  function depotLayers(config, visible, provenance) {
    return config.hubs.map((hub) => {
      const stats = visible.hubStats.find((row) => row.id === hub.id);
      return builder.layer({
        id: `depot:${hub.id}`,
        kind: 'point',
        label: `${hub.label} · ${stats.reelCount} usable reels · ${stats.endingInventory} m`,
        geometry: builder.geometry('node', 'city-node-id', [hub.nodeId]),
        quantity: builder.quantity('cable-inventory', stats.endingInventory, 'm'),
        role: 'primary',
        importance: 0.92,
        aggregationKey: 'cable-depots',
        provenance,
      });
    });
  }

  function projectLayers(config, visible, provenance) {
    return config.demandSites.map((site) => {
      const projects = visible.projectStats.filter((row) => row.siteId === site.id && row.releaseDay <= visible.day);
      const requested = sum(projects, 'requestedMeters');
      const delivered = sum(projects, 'deliveredMeters');
      const shortage = Math.max(0, requested - delivered - sum(projects, 'inFlightMeters'));
      const critical = projects.some((row) => row.priority === 'critical' && row.status !== 'complete');
      return builder.layer({
        id: `project-site:${site.id}`,
        kind: 'point',
        label: requested
          ? `${site.label} · ${delivered}/${requested} m delivered${shortage ? ` · ${shortage} m short` : ''}`
          : `${site.label} · no released project`,
        geometry: builder.geometry('node', 'city-node-id', [site.nodeId]),
        quantity: builder.quantity(shortage ? 'unserved-cable' : 'delivered-cable', shortage || delivered, 'm'),
        role: shortage ? 'event' : 'primary',
        importance: critical ? 1 : requested ? 0.82 : 0.4,
        aggregationKey: 'cable-project-sites',
        provenance,
      });
    });
  }

  function transferLayers(config, visible, routeById, provenance) {
    return visible.transfers
      .filter((row) => row.dispatchDay <= visible.day && row.status !== 'scheduled')
      .flatMap((transfer) => {
        const route = routeById.get(transfer.routeId);
        if (!route?.segmentIds?.length) return [];
        const type = config.cableTypes.find((row) => row.id === transfer.cableFamilyId);
        const project = visible.projectStats.find((row) => row.id === transfer.projectId);
        const label = `${transfer.quantityMeters} m ${type.shortLabel} · ${project.label} · ${transfer.status}`;
        const path = builder.layer({
          id: `path:${transfer.id}`,
          kind: 'path',
          label,
          geometry: builder.geometry('segments', 'city-segment-id', route.segmentIds),
          quantity: builder.quantity(`cable-family.${transfer.cableFamilyId}.transferred`, transfer.quantityMeters, 'm'),
          role: transfer.status === 'in-transit' ? 'event' : 'primary',
          importance: transfer.status === 'in-transit' ? 0.9 : 0.65,
          aggregationKey: `cable-transfer:${transfer.cableFamilyId}`,
          provenance,
        });
        if (transfer.status !== 'in-transit') return [path];
        return [path, builder.layer({
          id: `actor:${transfer.id}`,
          kind: 'actor',
          label,
          geometry: builder.geometry('segments', 'city-segment-id', route.segmentIds),
          quantity: builder.quantity(`cable-family.${transfer.cableFamilyId}.in-transit`, transfer.progress, 'ratio', [0, 1]),
          role: 'event',
          importance: 1,
          aggregationKey: `cable-vehicle:${transfer.cableFamilyId}`,
          provenance,
        })];
      });
  }

  function disruptionLayers(config, visible, provenance) {
    return visible.currentStoryEvents
      .filter((row) => ['damaged-stock', 'road-closure', 'surprise-demand', 'allocation-conflict', 'reserve-released'].includes(row.kind))
      .map((row, index) => {
        const site = config.demandSites.find((candidate) => candidate.id === row.details?.siteId)
          || config.demandSites[index % config.demandSites.length];
        return builder.layer({
          id: `disruption:${visible.day}:${index}`,
          kind: 'point',
          label: row.narrative,
          geometry: builder.geometry('node', 'city-node-id', [site.nodeId]),
          quantity: builder.quantity('logistics-disruption', 1, 'event'),
          role: 'event',
          importance: 1,
          aggregationKey: null,
          provenance,
        });
      });
  }

  function comparisonLayers(config, comparisonRuns, routeById, provenance) {
    const policies = new Map();
    comparisonRuns.forEach((run) => {
      Object.values(run.branchEvidence || {}).forEach((branch) => {
        if (branch?.policyId && !policies.has(branch.policyId)) policies.set(branch.policyId, branch);
      });
    });
    return [...policies.values()].flatMap((branch) => {
      const routeTotals = new Map();
      branch.transfers.forEach((transfer) => {
        const key = `${transfer.routeId}:${transfer.cableFamilyId}`;
        routeTotals.set(key, (routeTotals.get(key) || 0) + transfer.quantityMeters);
      });
      return [...routeTotals].flatMap(([key, quantityMeters]) => {
        const split = key.lastIndexOf(':');
        const routeId = key.slice(0, split);
        const cableFamilyId = key.slice(split + 1);
        const route = routeById.get(routeId);
        if (!route?.segmentIds?.length) return [];
        const type = config.cableTypes.find((row) => row.id === cableFamilyId);
        return [builder.layer({
          id: `comparison:${branch.policyId}:${routeId}:${cableFamilyId}`,
          kind: 'path',
          label: `${policyLabel(branch.policyId)} · ${quantityMeters} m ${type?.shortLabel || cableFamilyId}`,
          geometry: builder.geometry('segments', 'city-segment-id', route.segmentIds),
          quantity: builder.quantity(`allocation-policy.${branch.policyId}`, quantityMeters, 'm'),
          role: 'comparison',
          importance: 0.78,
          aggregationKey: `cable-policy:${branch.policyId}`,
          provenance,
        })];
      });
    });
  }

  function createInspections(config, visible, provenance) {
    return [
      ...visible.transfers.map((transfer) => ({
        id: `inspection:${transfer.id}`,
        label: `${transfer.id} allocation explanation`,
        targetIds: [`path:${transfer.id}`, `actor:${transfer.id}`],
        fields: [
          field('origin', 'Origin', config.hubs.find((row) => row.id === transfer.sourceHubId)?.label, provenance),
          field('destination', 'Destination', config.demandSites.find((row) => row.id === transfer.destinationSiteId)?.label, provenance),
          field('quantity', 'Quantity', transfer.quantityMeters, provenance, 'm'),
          field('family', 'Cable family', config.cableTypes.find((row) => row.id === transfer.cableFamilyId)?.label, provenance),
          field('reason', 'Why selected', transfer.reason, provenance),
          field('rejected', 'Alternatives rejected', transfer.rejectedAlternatives.join(' · ') || 'No feasible alternative', provenance),
          field('consequence', 'Downstream consequence', transfer.downstreamConsequence, provenance),
        ],
      })),
      ...visible.projectStats.filter((row) => row.releaseDay <= visible.day).map((project) => ({
        id: `inspection:${project.id}`,
        label: project.label,
        targetIds: [`project-site:${project.siteId}`],
        fields: [
          field('priority', 'Priority', project.priority, provenance),
          field('progress', 'Completion', project.completionPercent, provenance, '%'),
          field('shortage', 'Uncommitted shortage', Math.max(0, project.requestedMeters - project.deliveredMeters - project.inFlightMeters), provenance, 'm'),
          field('blockers', 'Current blockers', project.blockers.join(' · ') || 'None', provenance),
        ],
      })),
    ];
  }

  function field(id, label, value, provenance, unit = null) {
    return { id, label, value: value ?? 'unknown', unit, provenance };
  }
  function option(value, label) { return { value, label }; }
  function numeric(id, label, value, minimum, maximum, step, provenance) {
    return { id, label, kind: 'number', value, options: null, minimum, maximum, step, provenance };
  }
  function select(id, label, value, options, provenance) {
    return { id, label, kind: 'select', value, options, minimum: null, maximum: null, step: null, provenance };
  }
  function toggle(id, label, value, provenance) {
    return { id, label, kind: 'toggle', value, options: null, minimum: null, maximum: null, step: null, provenance };
  }
  function multiSelect(id, label, value, rows, provenance) {
    return {
      id,
      label,
      kind: 'multiselect',
      value,
      options: rows.map((row) => option(row.id, row.shortLabel || row.label)),
      minimum: null,
      maximum: null,
      step: null,
      provenance,
    };
  }
  function sum(rows, key) { return rows.reduce((total, row) => total + row[key], 0); }
  function policyLabel(value) {
    return ({ cheapest: 'Cheapest', fastest: 'Fastest', 'fairness-first': 'Fairness first' })[value] || value;
  }

  return Object.freeze({ DATASET_REFERENCE, MODEL_IDENTITIES, createContribution });
});
