(function attachCableTraderPresentation(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteCableTraderPresentation = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createCableTraderPresentation() {
  const FAMILY_TONES = Object.freeze({
    'cat6-copper': 'cyan',
    'cat6a-copper': 'blue',
    'os2-single-mode': 'magenta',
    'om4-multimode': 'violet',
    'rg6-coax': 'amber',
  });

  function createViews({ config, simulation, playback, ensembleRun, comparisonRuns = [] }) {
    const visible = simulation.snapshots[playback.day];
    const current = simulation.daily[Math.max(0, playback.day - 1)] || null;
    const headline = headlineFor(visible, current, playback);
    const mostShort = [...visible.projectStats]
      .filter((row) => row.releaseDay <= visible.day)
      .sort((left, right) => shortage(right) - shortage(left) || left.id.localeCompare(right.id))[0];
    return [{
      slot: 'inspector',
      title: 'Cable restoration desk',
      rows: [
        { label: 'Now', value: headline },
        { label: 'Policy', value: policyLabel(simulation.allocationPolicy) },
        { label: 'Projects complete', value: `${visible.summary.completedProjects} / ${visible.summary.projectCount}` },
        { label: 'Cable delivered', value: `${format(visible.summary.deliveredMeters)} / ${format(visible.summary.requestedMeters)} m` },
        { label: 'Still short', value: `${format(visible.summary.shortageMeters)} m` },
        { label: 'On the road', value: `${format(visible.summary.inTransitMeters)} m in ${visible.activeTransfers.length} transfers` },
        ...(mostShort && shortage(mostShort) > 0 ? [{
          label: 'Largest shortage',
          value: `${mostShort.label} · ${format(shortage(mostShort))} m ${mostShort.requiredCableFamilyId}`,
        }] : []),
        { label: 'Usable depot stock', value: `${format(visible.summary.endingInventory)} m` },
        { label: 'Damaged / remnant', value: `${format(visible.summary.damagedMeters)} / ${format(visible.summary.wasteMeters)} m` },
        { label: 'Modeled cost', value: formatDecimal(visible.summary.totalCost) },
        ...(playback.status === 'settled' && ensembleRun?.distributions?.branches?.intervention ? [{
          label: 'Scenario variance',
          value: distributionRange(ensembleRun.distributions.branches.intervention.fulfillmentPercent, '% delivered'),
        }] : []),
      ],
      actions: [],
    }, {
      slot: 'map',
      title: `Day ${visible.day} of ${visible.durationDays}`,
      rows: [
        { label: 'Staged disruption', value: disruptionLabel(config.simulation.disruptionScenario) },
        { label: 'Daily capacity', value: `${format(config.simulation.transferCapacityMetersPerDay)} m` },
        { label: 'Reserve', value: reserveLabel(config.simulation.reservePolicy) },
        { label: 'Substitutes', value: config.simulation.allowSubstitutes ? 'Allowed when compatible' : 'Exact family only' },
        { label: 'User interventions', value: String((config.simulation.interventions || []).length) },
        { label: 'Reel conservation', value: simulation.conservation.pass ? 'Balanced' : 'Failed' },
        ...(playback.status === 'settled'
          ? comparisonRows(comparisonRuns)
          : []),
      ],
      actions: [
        { id: 'focus-network', label: 'Whole network', command: { kind: 'camera.focus', targetId: 'cable-network-overview' } },
        ...visible.activeTransfers.slice(0, 3).map((row) => ({
          id: `follow-${row.id}`,
          label: `Follow ${row.id}`,
          command: { kind: 'camera.focus', targetId: `transfer:${row.id}` },
        })),
        ...(playback.status === 'running'
          && playback.day >= 1
          && playback.day < simulation.durationDays
          && !(config.simulation.interventions || []).some((row) => row.kind === 'route-closure')
          ? [{ id: 'cable-trader.intervene.route-closure', label: 'Close a route now' }]
          : []),
        ...(playback.status === 'running'
          && playback.day >= 1
          && playback.day < simulation.durationDays
          && config.simulation.reservePolicy !== 'none'
          && !(config.simulation.interventions || []).some((row) => row.kind === 'release-reserve')
          ? [{ id: 'cable-trader.intervene.release-reserve', label: 'Release depot reserves' }]
          : []),
      ],
    }];
  }

  function createPresentation({ config, simulation, playback, transferRoutes }) {
    const visible = simulation.snapshots[playback.day];
    const routeById = new Map(transferRoutes.map((row) => [row.id, row]));
    const maximumInventory = Math.max(...visible.hubStats.map((row) => row.endingInventory), 1);
    const maximumDemand = Math.max(...visible.projectStats.map((row) => row.requestedMeters), 1);
    const markers = [
      ...config.hubs.map((hub) => {
        const stats = visible.hubStats.find((row) => row.id === hub.id);
        return {
          id: `depot:${hub.id}`,
          label: `${hub.label} · ${stats.reelCount} reels · ${format(stats.endingInventory)} m`,
          nodeId: hub.nodeId,
          tone: 'green',
          heightM: 12 + Math.sqrt(stats.endingInventory / maximumInventory) * 18,
          radiusM: 4 + Math.sqrt(stats.endingInventory / maximumInventory) * 3,
          intensity: 0.75 + stats.endingInventory / maximumInventory,
        };
      }),
      ...config.demandSites.map((site) => {
        const projects = visible.projectStats.filter((row) => row.siteId === site.id && row.releaseDay <= visible.day);
        const requested = sum(projects, 'requestedMeters');
        const delivered = sum(projects, 'deliveredMeters');
        const siteShortage = Math.max(0, requested - delivered - sum(projects, 'inFlightMeters'));
        return {
          id: `project-site:${site.id}`,
          label: requested
            ? `${site.label} · ${format(delivered)}/${format(requested)} m${siteShortage ? ` · ${format(siteShortage)} m short` : ''}`
            : `${site.label} · waiting`,
          nodeId: site.nodeId,
          tone: siteShortage ? 'magenta' : delivered ? 'cyan' : 'amber',
          heightM: 10 + Math.sqrt(requested / maximumDemand) * 20,
          radiusM: 3.5 + Math.sqrt(requested / maximumDemand) * 3,
          intensity: siteShortage ? 1.5 : 0.8,
        };
      }),
    ];
    const visibleTransfers = visible.transfers.filter((row) => row.dispatchDay <= visible.day);
    const paths = visibleTransfers.map((transfer) => {
      const route = routeById.get(transfer.routeId);
      if (!route) return null;
      return {
        id: `transfer:${transfer.id}`,
        label: transferLabel(config, visible, transfer),
        segmentIds: route.segmentIds,
        tone: FAMILY_TONES[transfer.cableFamilyId] || 'cyan',
        widthM: 1.4 + Math.sqrt(transfer.quantityMeters / 500) * 2.2,
        intensity: transfer.status === 'in-transit' ? 1.55 : 0.48,
      };
    }).filter(Boolean);
    const actors = visible.activeTransfers.map((transfer) => {
      const route = routeById.get(transfer.routeId);
      if (!route) return null;
      return {
        id: `transfer-actor:${transfer.id}`,
        label: transferLabel(config, visible, transfer),
        kind: 'car',
        segmentIds: route.segmentIds,
        tone: FAMILY_TONES[transfer.cableFamilyId] || 'cyan',
        speedMps: 0.1,
        phaseOffsetM: Math.max(0, transfer.progress * route.distanceM),
        isSelected: false,
      };
    }).filter(Boolean);
    const allSegments = [...new Set(transferRoutes.flatMap((row) => row.segmentIds))];
    return {
      schema: 'simulatte.pluginPresentation.v1',
      markers,
      paths,
      actors,
      cameraTargets: [
        {
          id: 'cable-network-overview',
          label: 'Cable restoration network',
          nodeIds: [...config.hubs, ...config.demandSites].map((row) => row.nodeId),
          segmentIds: allSegments,
          distanceM: 3600,
        },
        ...visible.activeTransfers.map((transfer) => ({
          id: `transfer:${transfer.id}`,
          label: `Follow ${transfer.id}`,
          nodeIds: [],
          segmentIds: routeById.get(transfer.routeId)?.segmentIds || [],
          distanceM: 520,
        })),
      ],
    };
  }

  function headlineFor(visible, current, playback) {
    if (!visible.day) return 'Choose the crisis and policy, then start.';
    const disruption = current?.storyEvents?.find((row) => (
      ['damaged-stock', 'road-closure', 'surprise-demand', 'allocation-conflict'].includes(row.kind)
    ));
    if (disruption) return disruption.narrative;
    const arrival = current?.storyEvents?.find((row) => row.kind === 'arrival');
    if (arrival) return arrival.narrative;
    const dispatch = current?.storyEvents?.find((row) => row.kind === 'dispatch');
    if (dispatch) return dispatch.narrative;
    return playback.status === 'settled' ? 'The restoration plan settled.' : 'Depots are waiting for the next demand event.';
  }
  function transferLabel(config, visible, transfer) {
    const type = config.cableTypes.find((row) => row.id === transfer.cableFamilyId);
    const project = visible.projectStats.find((row) => row.id === transfer.projectId);
    return `${transfer.quantityMeters} m ${type?.shortLabel || transfer.cableFamilyId} → ${project?.label || transfer.projectId}`;
  }
  function shortage(project) {
    return Math.max(0, project.requestedMeters - project.deliveredMeters - project.inFlightMeters);
  }
  function sum(rows, key) { return rows.reduce((total, row) => total + row[key], 0); }
  function policyLabel(value) {
    return ({ cheapest: 'Cheapest completion', fastest: 'Fastest restoration', 'fairness-first': 'Fairness first' })[value] || value;
  }
  function disruptionLabel(value) {
    return ({ none: 'None', 'road-closure': 'Road closure', 'damaged-stock': 'Damaged stock', 'surprise-demand': 'Surprise repair', 'fairness-conflict': 'Fairness conflict' })[value] || value;
  }
  function reserveLabel(value) {
    return ({ none: 'Release all stock', 'one-reel': 'One reel per depot/family', 'twenty-percent': '20% per reel' })[value] || value;
  }
  function distributionRange(distribution, unit) {
    return `${distribution.minimum.toFixed(2)}–${distribution.maximum.toFixed(2)} ${unit}`;
  }
  function comparisonRows(runs) {
    const summaries = new Map();
    runs.forEach((run) => Object.values(run.branchSummaries || {}).forEach((summary) => {
      if (summary?.policyId && !summaries.has(summary.policyId)) summaries.set(summary.policyId, summary);
    }));
    return [...summaries.values()].map((summary) => ({
      label: `${policyLabel(summary.policyId)} trace`,
      value: `${format(summary.deliveredMeters)} m delivered · ${format(summary.shortageMeters)} m short`,
    }));
  }
  function format(value) { return Number(value || 0).toLocaleString('en-US'); }
  function formatDecimal(value) { return Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 2 }); }

  return Object.freeze({ createPresentation, createViews });
});
