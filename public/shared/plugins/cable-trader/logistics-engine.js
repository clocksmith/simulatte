(function attachCableTraderLogistics(root, factory) {
  const flowSolver = typeof module === 'object' && module.exports
    ? require('./logistics-flow-solver.js')
    : root.SimulatteCableTraderFlowSolver;
  const api = factory(flowSolver);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteCableTraderLogistics = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createCableTraderLogistics(flowSolver) {
  const POLICIES = Object.freeze(['cheapest', 'fastest', 'fairness-first']);
  const PRIORITY_RANK = Object.freeze({ critical: 0, urgent: 1, standard: 2 });

  function simulateNetwork(config, transferRoutes, options = {}) {
    validateInputs(config, transferRoutes);
    const identity = options.scenarioIdentity;
    if (!identity?.configurationHash) throw new Error('Cable logistics requires a governed scenario identity');
    const policyId = normalizePolicy(options.allocationPolicy || config.simulation.allocationObjective);
    const selectedTypes = config.cableTypes.filter((row) => identity.selectedCableFamilyIds.includes(row.id));
    const exogenous = options.exogenous
      ? validateExogenous(options.exogenous, identity)
      : generateExogenous(config, selectedTypes, identity);
    const routes = new Map(transferRoutes.map((row) => [
      `${row.sourceHubId}:${row.destinationSiteId}`,
      row,
    ]));
    const state = createStartingState(config, selectedTypes, exogenous);
    const snapshots = [createSnapshot(0, config, selectedTypes, state, policyId)];
    const daily = [];
    const events = [];

    for (let day = 1; day <= config.simulation.durationDays; day += 1) {
      const storyEvents = [];
      deliverArrivals(day, state, config, storyEvents);
      applyDisruptions(day, state, config, exogenous, storyEvents);
      releaseProjects(day, state, exogenous, storyEvents);
      if (day < config.simulation.durationDays) {
        allocateDay(day, state, config, selectedTypes, routes, policyId, storyEvents);
      }
      if (day === config.simulation.durationDays && !storyEvents.length) {
        storyEvents.push(story(
          'settlement',
          `settlement:${identity.id}:${policyId}`,
          `${policyLabel(policyId)} settled with ${state.projects.filter((row) => row.status === 'complete').length} completed projects.`,
          { policyId }
        ));
      }
      updateProjectBlockers(state, selectedTypes, config);
      const datedStoryEvents = storyEvents.map((row) => ({ ...row, day }));
      state.storyEvents.push(...datedStoryEvents);
      const snapshot = createSnapshot(day, config, selectedTypes, state, policyId);
      snapshots.push(snapshot);
      const today = createDaily(day, snapshots[day - 1], snapshot, datedStoryEvents);
      daily.push(today);
      events.push(createEvent(identity, policyId, day, snapshots[day - 1], snapshot, datedStoryEvents));
    }

    const terminal = snapshots.at(-1);
    const conservation = conservationReceipt(state);
    if (!conservation.pass) throw new Error(`Cable logistics conservation failed: ${conservation.reason}`);
    const summary = terminal.summary;
    return deepFreeze({
      schema: 'simulatte.plugin.cableTraderSimulation.v2',
      id: `cable-logistics-${stableId(`${identity.id}:${policyId}:${summary.deliveredMeters}:${summary.totalCost}`)}`,
      seed: identity.seed,
      baseSeed: identity.baseSeed,
      scenarioId: identity.id,
      scenarioProfileId: identity.scenarioProfileId,
      configurationHash: identity.configurationHash,
      selectedCableFamilyIds: identity.selectedCableFamilyIds,
      allocationPolicy: policyId,
      durationDays: config.simulation.durationDays,
      summary,
      daily,
      snapshots,
      events,
      hubStats: terminal.hubStats,
      typeStats: terminal.typeStats,
      flows: terminal.flows,
      endingInventory: terminal.inventory,
      needSamples: exogenous.projects.slice(0, config.simulation.renderedRequestCount),
      projects: terminal.projectStats,
      transfers: state.transfers,
      reels: state.reels,
      exogenous,
      conservation,
      solver: {
        algorithm: 'exact_policy_scored_min_cost_maximum_flow',
        candidateGraph: 'all feasible reel-to-project edges',
        allocationUnit: 'meter',
        optimalityProven: true,
        policyId,
      },
      claimBoundary: 'Depots, projects, cable quantities, costs, demand, disruptions, vehicles, and delivery times are governed scenario inputs. The allocation is exact for the declared feasible-edge graph and policy score; it does not describe observed cable operations.',
    });
  }

  function generateExogenous(config, selectedTypes, identity) {
    const random = createRandom(identity.seed);
    const duration = config.simulation.durationDays;
    const projects = [];
    for (let index = 0; index < config.simulation.needCount; index += 1) {
      const site = config.demandSites[random.integer(config.demandSites.length)];
      const type = weighted(selectedTypes, random, (row) => row.demandWeight);
      const releaseDay = 1 + random.integer(Math.max(1, duration - 5));
      const baseMeters = [120, 180, 240, 300, 360, 480][random.integer(6)];
      const scenarioMultiplier = scenarioDemandMultiplier(config, identity.scenarioProfileId, site.id, type.id);
      const requestedMeters = Math.max(20, roundToTen(baseMeters * scenarioMultiplier));
      const priority = resolvePriority(site, index, identity.scenarioProfileId);
      projects.push({
        id: `project-${String(index + 1).padStart(3, '0')}`,
        label: `${site.label} · ${type.shortLabel || type.label} repair ${index + 1}`,
        siteId: site.id,
        requiredCableFamilyId: type.id,
        requestedMeters,
        priority,
        releaseDay,
        deadlineDay: Math.min(duration, releaseDay + (priority === 'critical' ? 2 : priority === 'urgent' ? 3 : 5)),
      });
    }
    if (config.simulation.disruptionScenario === 'surprise-demand') {
      const site = config.demandSites.at(-1);
      const type = selectedTypes[0];
      projects.push({
        id: 'project-surprise-repair',
        label: `${site.label} emergency restoration`,
        siteId: site.id,
        requiredCableFamilyId: type.id,
        requestedMeters: type.reelLengthM,
        priority: 'critical',
        releaseDay: Math.min(4, duration - 2),
        deadlineDay: Math.min(6, duration),
      });
    }
    if (config.simulation.disruptionScenario === 'fairness-conflict' && projects.length >= 2) {
      projects[0].priority = 'critical';
      projects[0].releaseDay = 2;
      projects[0].deadlineDay = 4;
      projects[1].priority = 'critical';
      projects[1].releaseDay = 2;
      projects[1].deadlineDay = 4;
    }
    return deepFreeze({
      schema: 'simulatte.plugin.cableTraderExogenousInputs.v2',
      scenarioId: identity.id,
      scenarioProfileId: identity.scenarioProfileId,
      seed: identity.seed,
      configurationHash: identity.configurationHash,
      selectedCableFamilyIds: identity.selectedCableFamilyIds,
      projects,
      disruptionScenario: config.simulation.disruptionScenario,
      interventions: (config.simulation.interventions || []).map((row) => ({ ...row })),
    });
  }

  function createStartingState(config, selectedTypes, exogenous) {
    const reels = [];
    for (const hub of config.hubs) {
      for (const type of selectedTypes) {
        for (let index = 0; index < config.simulation.initialInventoryPerHubType; index += 1) {
          reels.push({
            id: `reel:${hub.id}:${type.id}:${index + 1}`,
            hubId: hub.id,
            cableFamilyId: type.id,
            originalMeters: type.reelLengthM,
            remainingMeters: type.reelLengthM,
            damagedMeters: 0,
            wasteMeters: 0,
            status: 'available',
          });
        }
      }
    }
    return {
      reels,
      projects: exogenous.projects.map((row) => ({
        ...row,
        status: 'scheduled',
        deliveredMeters: 0,
        inFlightMeters: 0,
        blockers: [],
      })),
      transfers: [],
      storyEvents: [],
      totalCost: 0,
      totalDistanceM: 0,
    };
  }

  function releaseProjects(day, state, exogenous, storyEvents) {
    for (const project of state.projects) {
      if (project.releaseDay !== day || project.status !== 'scheduled') continue;
      project.status = 'waiting';
      storyEvents.push(story('demand', project.id, `${project.label} requests ${project.requestedMeters} m`, {
        projectId: project.id,
        siteId: project.siteId,
        cableFamilyId: project.requiredCableFamilyId,
        requestedMeters: project.requestedMeters,
        priority: project.priority,
      }));
    }
  }

  function deliverArrivals(day, state, config, storyEvents) {
    for (const transfer of state.transfers) {
      if (transfer.arrivalDay !== day || transfer.status !== 'in-transit') continue;
      const project = state.projects.find((row) => row.id === transfer.projectId);
      transfer.status = 'arrived';
      project.inFlightMeters -= transfer.quantityMeters;
      project.deliveredMeters += transfer.quantityMeters;
      project.status = project.deliveredMeters >= project.requestedMeters ? 'complete' : 'waiting';
      transfer.downstreamConsequence = project.status === 'complete'
        ? `${project.label} completed on day ${day}.`
        : `${project.label} advanced to ${percent(project.deliveredMeters, project.requestedMeters)}%.`;
      storyEvents.push(story('arrival', transfer.id, transfer.downstreamConsequence, {
        transferId: transfer.id,
        projectId: project.id,
        quantityMeters: transfer.quantityMeters,
        cableFamilyId: transfer.cableFamilyId,
      }));
    }
  }

  function applyDisruptions(day, state, config, exogenous, storyEvents) {
    const disruption = exogenous.disruptionScenario;
    for (const intervention of config.simulation.interventions || []) {
      if (intervention.day !== day) continue;
      if (intervention.kind === 'route-closure') {
        storyEvents.push(story('road-closure', intervention.id, 'The user introduced a three-day modeled route closure.', {
          interventionId: intervention.id,
          activeFromDay: day,
          activeThroughDay: Math.min(config.simulation.durationDays, day + 2),
        }));
      } else if (intervention.kind === 'release-reserve') {
        storyEvents.push(story('reserve-released', intervention.id, 'The user released depot reserves for the remaining restoration.', {
          interventionId: intervention.id,
          activeFromDay: day,
        }));
      }
    }
    if (disruption === 'damaged-stock' && day === 3) {
      const reel = state.reels.find((row) => row.status === 'available' && row.remainingMeters > 0);
      if (reel) {
        const damaged = roundToTen(reel.remainingMeters * 0.45);
        reel.remainingMeters -= damaged;
        reel.damagedMeters += damaged;
        storyEvents.push(story('damaged-stock', reel.id, `${damaged} m of ${reel.cableFamilyId} failed inspection`, {
          reelId: reel.id,
          damagedMeters: damaged,
          cableFamilyId: reel.cableFamilyId,
        }));
      }
    }
    if (disruption === 'road-closure' && day === 4) {
      storyEvents.push(story('road-closure', 'road-closure-day-4', 'A modeled road closure adds one day to affected deliveries.', {
        activeFromDay: 4,
        activeThroughDay: 7,
      }));
    }
    if (disruption === 'surprise-demand' && day === Math.min(4, config.simulation.durationDays - 2)) {
      storyEvents.push(story('surprise-demand', 'project-surprise-repair', 'An emergency restoration request entered the queue.', {
        projectId: 'project-surprise-repair',
      }));
    }
    if (disruption === 'fairness-conflict' && day === 2) {
      storyEvents.push(story('allocation-conflict', 'fairness-conflict-day-2', 'Two critical sites compete for the same constrained cable family.', {
        policyId: config.simulation.allocationObjective,
      }));
    }
  }

  function allocateDay(day, state, config, selectedTypes, routes, policyId, storyEvents) {
    const projects = state.projects.filter((row) => (
      row.status === 'waiting'
      && row.deliveredMeters + row.inFlightMeters < row.requestedMeters
    ));
    if (!projects.length) return;
    const reservePolicy = interventionActive(config, 'release-reserve', day)
      ? 'none'
      : config.simulation.reservePolicy;
    const supplies = eligibleSupplies(state.reels, selectedTypes, reservePolicy);
    if (!supplies.length) return;
    const capacity = Math.max(0, config.simulation.transferCapacityMetersPerDay);
    const graphResult = flowSolver.exactAllocation({
      supplies,
      projects,
      capacity,
      remainingDemand: (project) => (
        project.requestedMeters - project.deliveredMeters - project.inFlightMeters
      ),
      edgeCost: (supply, project) => {
        const type = selectedTypes.find((row) => row.id === supply.cableFamilyId);
        if (!compatible(type, project.requiredCableFamilyId, config.simulation.allowSubstitutes)) return null;
        const route = routes.get(`${supply.hubId}:${project.siteId}`);
        return route ? allocationCost(policyId, supply, project, route, config, day) : null;
      },
    });
    for (const allocation of graphResult.allocations) {
      const supply = supplies[allocation.supplyIndex];
      const project = projects[allocation.projectIndex];
      const reel = state.reels.find((row) => row.id === supply.reelId);
      const type = selectedTypes.find((row) => row.id === reel.cableFamilyId);
      const route = routes.get(`${reel.hubId}:${project.siteId}`);
      reel.remainingMeters -= allocation.quantityMeters;
      let wasteMeters = 0;
      if (reel.remainingMeters > 0 && reel.remainingMeters < type.minimumUsefulRemnantM) {
        wasteMeters = reel.remainingMeters;
        reel.wasteMeters += wasteMeters;
        reel.remainingMeters = 0;
      }
      reel.status = reel.remainingMeters > 0 ? 'partial' : 'depleted';
      project.inFlightMeters += allocation.quantityMeters;
      project.status = 'in-transit';
      const delayDays = deliveryDelay(day, config, route);
      const arrivalDay = Math.min(config.simulation.durationDays, day + delayDays);
      const transfer = {
        id: `transfer-${String(state.transfers.length + 1).padStart(3, '0')}`,
        projectId: project.id,
        sourceHubId: reel.hubId,
        destinationSiteId: project.siteId,
        reelId: reel.id,
        cableFamilyId: reel.cableFamilyId,
        requiredCableFamilyId: project.requiredCableFamilyId,
        quantityMeters: allocation.quantityMeters,
        dispatchDay: day,
        arrivalDay,
        routeId: route.id,
        routeSegmentIds: route.segmentIds,
        distanceM: route.distanceM,
        cost: round(
          allocation.quantityMeters
          * (type.modeledCostPerMeter + route.distanceM / 100000)
        ),
        policyScore: allocation.unitCost,
        status: 'in-transit',
        substitution: reel.cableFamilyId !== project.requiredCableFamilyId,
        reason: policyReason(policyId, project, route),
        rejectedAlternatives: rejectedAlternatives(project, supply, supplies, routes, config, selectedTypes, policyId, day),
        downstreamConsequence: `Expected to advance ${project.label} to ${percent(project.deliveredMeters + project.inFlightMeters, project.requestedMeters)}%.`,
        wasteMeters,
      };
      state.transfers.push(transfer);
      state.totalCost += transfer.cost;
      state.totalDistanceM += transfer.distanceM;
      storyEvents.push(story('dispatch', transfer.id, `${transfer.quantityMeters} m ${type.shortLabel || type.label} dispatched to ${project.label}`, {
        transferId: transfer.id,
        projectId: project.id,
        sourceHubId: reel.hubId,
        destinationSiteId: project.siteId,
        cableFamilyId: reel.cableFamilyId,
        quantityMeters: transfer.quantityMeters,
        arrivalDay,
        policyId,
      }));
    }
  }

  function eligibleSupplies(reels, selectedTypes, reservePolicy) {
    const grouped = new Map();
    for (const reel of reels) {
      if (reel.remainingMeters <= 0) continue;
      const key = `${reel.hubId}:${reel.cableFamilyId}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(reel);
    }
    const rows = [];
    for (const reelsAtHub of grouped.values()) {
      reelsAtHub.sort((left, right) => left.remainingMeters - right.remainingMeters || left.id.localeCompare(right.id));
      reelsAtHub.forEach((reel, index) => {
        let reserveMeters = 0;
        if (reservePolicy === 'one-reel' && index === reelsAtHub.length - 1) reserveMeters = reel.remainingMeters;
        if (reservePolicy === 'twenty-percent') reserveMeters = Math.ceil(reel.originalMeters * 0.2);
        const availableMeters = Math.max(0, reel.remainingMeters - reserveMeters);
        if (availableMeters > 0) rows.push({
          reelId: reel.id,
          hubId: reel.hubId,
          cableFamilyId: reel.cableFamilyId,
          availableMeters,
          materialCostPerMeter: selectedTypes.find((row) => row.id === reel.cableFamilyId).modeledCostPerMeter,
        });
      });
    }
    return rows;
  }

  function allocationCost(policyId, supply, project, route, config, day) {
    const priority = priorityPenalty(project, config.simulation.demandPriority, day);
    const late = Math.max(0, day + routeTravelDays(route) - project.deadlineDay);
    const material = supply.materialCostPerMeter * 100;
    const transport = route.distanceM / 50;
    if (policyId === 'fastest') return roundCost(priority + routeTravelDays(route) * 900 + late * 1600 + material * 0.1);
    if (policyId === 'fairness-first') {
      const servedRatio = (project.deliveredMeters + project.inFlightMeters) / project.requestedMeters;
      return roundCost(priority + servedRatio * config.simulation.fairnessWeight * 1800 + late * 600 + transport * 0.15);
    }
    return roundCost(priority + material + transport + late * 500);
  }

  function priorityPenalty(project, demandPriority, day) {
    if (demandPriority === 'deadline-first') {
      return Math.max(0, project.deadlineDay - day) * 90;
    }
    if (demandPriority === 'balanced') {
      return PRIORITY_RANK[project.priority] * 70 + Math.max(0, project.deadlineDay - day) * 35;
    }
    return PRIORITY_RANK[project.priority] * 220;
  }

  function createSnapshot(day, config, selectedTypes, state, policyId) {
    const releasedProjects = state.projects.filter((row) => row.releaseDay <= day);
    const requestedMeters = releasedProjects.reduce((sum, row) => sum + row.requestedMeters, 0);
    const deliveredMeters = releasedProjects.reduce((sum, row) => sum + row.deliveredMeters, 0);
    const inTransitMeters = releasedProjects.reduce((sum, row) => sum + row.inFlightMeters, 0);
    const startingInventory = state.reels.reduce((sum, row) => sum + row.originalMeters, 0);
    const endingInventory = state.reels.reduce((sum, row) => sum + row.remainingMeters, 0);
    const damagedMeters = state.reels.reduce((sum, row) => sum + row.damagedMeters, 0);
    const wasteMeters = state.reels.reduce((sum, row) => sum + row.wasteMeters, 0);
    const completedProjects = releasedProjects.filter((row) => row.status === 'complete').length;
    const summary = {
      needs: requestedMeters,
      fulfilledNeeds: deliveredMeters,
      fulfillmentPercent: percent(deliveredMeters, requestedMeters),
      randomEvents: releasedProjects.length + state.storyEvents.length,
      returns: 0,
      journeyEvents: state.transfers.length,
      modeledRequests: releasedProjects.length,
      startingInventory,
      endingInventory,
      totalBurden: round(state.totalCost),
      totalCost: round(state.totalCost),
      totalDistanceM: round(state.totalDistanceM),
      allocations: state.transfers.length,
      optimalAllocations: state.transfers.length,
      optimalityPercent: 100,
      optimalityProven: true,
      requestedMeters,
      deliveredMeters,
      inTransitMeters,
      shortageMeters: Math.max(0, requestedMeters - deliveredMeters - inTransitMeters),
      damagedMeters,
      wasteMeters,
      projectCount: releasedProjects.length,
      completedProjects,
      onTimeProjects: releasedProjects.filter((row) => row.status === 'complete' && completionDay(row.id, state.transfers) <= row.deadlineDay).length,
      policyId,
    };
    const inventory = Object.fromEntries(config.hubs.flatMap((hub) => selectedTypes.map((type) => [
      `${hub.id}:${type.id}`,
      state.reels.filter((row) => row.hubId === hub.id && row.cableFamilyId === type.id)
        .reduce((sum, row) => sum + row.remainingMeters, 0),
    ])));
    const hubStats = config.hubs.map((hub) => {
      const hubReels = state.reels.filter((row) => row.hubId === hub.id);
      const supplied = state.transfers.filter((row) => row.sourceHubId === hub.id).reduce((sum, row) => sum + row.quantityMeters, 0);
      return {
        id: hub.id,
        label: hub.label,
        needs: 0,
        fulfilled: 0,
        returns: 0,
        supplied,
        endingInventory: hubReels.reduce((sum, row) => sum + row.remainingMeters, 0),
        reelCount: hubReels.filter((row) => row.remainingMeters > 0).length,
      };
    });
    const typeStats = selectedTypes.map((type) => {
      const projects = releasedProjects.filter((row) => row.requiredCableFamilyId === type.id);
      return {
        id: type.id,
        label: type.label,
        needs: projects.reduce((sum, row) => sum + row.requestedMeters, 0),
        fulfilled: projects.reduce((sum, row) => sum + row.deliveredMeters, 0),
        burden: round(state.transfers.filter((row) => row.cableFamilyId === type.id).reduce((sum, row) => sum + row.cost, 0)),
      };
    });
    const visibleTransfers = state.transfers.map((row) => ({
      ...row,
      status: day < row.dispatchDay ? 'scheduled' : day >= row.arrivalDay ? 'arrived' : 'in-transit',
      progress: day < row.dispatchDay ? 0 : day >= row.arrivalDay ? 1 : (day - row.dispatchDay) / Math.max(1, row.arrivalDay - row.dispatchDay),
    }));
    return deepFreeze({
      day,
      durationDays: config.simulation.durationDays,
      summary,
      inventory,
      hubStats,
      typeStats,
      projectStats: state.projects.map((row) => ({ ...row, completionPercent: percent(row.deliveredMeters, row.requestedMeters) })),
      transfers: visibleTransfers,
      activeTransfers: visibleTransfers.filter((row) => row.status === 'in-transit'),
      flows: aggregateFlows(visibleTransfers.filter((row) => row.dispatchDay <= day)),
      reelInventory: state.reels.map((row) => ({ ...row })),
      currentStoryEvents: day ? state.storyEvents.filter((row) => row.day === day) : [],
    });
  }

  function createDaily(day, before, after, storyEvents) {
    const arriving = after.summary.deliveredMeters - before.summary.deliveredMeters;
    const requested = after.summary.requestedMeters - before.summary.requestedMeters;
    const dispatched = after.summary.inTransitMeters - before.summary.inTransitMeters + arriving;
    return deepFreeze({
      day,
      needs: requested,
      fulfilled: arriving,
      returns: 0,
      journeyEvents: storyEvents.filter((row) => row.kind === 'dispatch').length,
      burden: round(after.summary.totalCost - before.summary.totalCost),
      dispatchedMeters: Math.max(0, dispatched),
      arrivingMeters: arriving,
      shortageMeters: after.summary.shortageMeters,
      storyEvents,
      optimalityProven: true,
    });
  }

  function createEvent(identity, policyId, day, before, after, storyEvents) {
    return deepFreeze({
      schema: 'simulatte.SimulationEvent.v4-draft',
      id: `cable-trader:${identity.id}:${policyId}:event:day-${day}`,
      kind: primaryEventKind(storyEvents),
      timestamp: { value: day, units: 'simulation_day' },
      causalParentIds: day > 1 ? [`cable-trader:${identity.id}:${policyId}:event:day-${day - 1}`] : [],
      affectedEntityIds: storyEvents.map((row) => row.entityId),
      beforeState: { id: `snapshot:day-${day - 1}`, deliveredMeters: before.summary.deliveredMeters },
      afterState: { id: `snapshot:day-${day}`, deliveredMeters: after.summary.deliveredMeters },
      measures: {
        requestedMeters: after.summary.requestedMeters,
        deliveredMeters: after.summary.deliveredMeters,
        shortageMeters: after.summary.shortageMeters,
        inTransitMeters: after.summary.inTransitMeters,
        completedProjects: after.summary.completedProjects,
        policyId,
        configurationHash: identity.configurationHash,
      },
      storyEvents,
      origin: 'simulated',
      temporalStatus: 'forecast',
      uncertainty: { kind: 'distribution', value: { seed: identity.seed, ensembleSize: 1 } },
    });
  }

  function updateProjectBlockers(state, selectedTypes, config) {
    for (const project of state.projects) {
      if (!['waiting', 'in-transit'].includes(project.status)) continue;
      const compatibleMeters = state.reels.filter((reel) => {
        const type = selectedTypes.find((row) => row.id === reel.cableFamilyId);
        return type && compatible(type, project.requiredCableFamilyId, config.simulation.allowSubstitutes);
      }).reduce((sum, row) => sum + row.remainingMeters, 0);
      const incompatibleMeters = state.reels.filter((row) => row.remainingMeters > 0).reduce((sum, row) => sum + row.remainingMeters, 0) - compatibleMeters;
      const blockers = [];
      if (incompatibleMeters > 0) blockers.push(`${incompatibleMeters} m of available stock is electrically or physically incompatible`);
      if (project.inFlightMeters > 0) blockers.push(`${project.inFlightMeters} m is still in transit`);
      if (compatibleMeters > 0 && project.inFlightMeters === 0) blockers.push('reserve or daily transfer capacity prevented dispatch');
      project.blockers = blockers;
    }
  }

  function aggregateFlows(transfers) {
    const rows = new Map();
    for (const transfer of transfers) {
      const key = `${transfer.sourceHubId}:${transfer.destinationSiteId}`;
      const current = rows.get(key) || {
        sourceHubId: transfer.sourceHubId,
        destinationHubId: transfer.destinationSiteId,
        destinationSiteId: transfer.destinationSiteId,
        quantity: 0,
        burden: 0,
        byCableFamily: {},
      };
      current.quantity += transfer.quantityMeters;
      current.burden += transfer.cost;
      current.byCableFamily[transfer.cableFamilyId] = (current.byCableFamily[transfer.cableFamilyId] || 0) + transfer.quantityMeters;
      rows.set(key, current);
    }
    return [...rows.values()].sort((left, right) => right.quantity - left.quantity);
  }

  function conservationReceipt(state) {
    const starting = state.reels.reduce((sum, row) => sum + row.originalMeters, 0);
    const remaining = state.reels.reduce((sum, row) => sum + row.remainingMeters, 0);
    const damaged = state.reels.reduce((sum, row) => sum + row.damagedMeters, 0);
    const waste = state.reels.reduce((sum, row) => sum + row.wasteMeters, 0);
    const dispatched = state.transfers.reduce((sum, row) => sum + row.quantityMeters, 0);
    const pass = starting === remaining + damaged + waste + dispatched;
    return deepFreeze({
      schema: 'simulatte.plugin.cableTraderConservationReceipt.v1',
      startingMeters: starting,
      remainingMeters: remaining,
      damagedMeters: damaged,
      unusableRemnantMeters: waste,
      dispatchedMeters: dispatched,
      pass,
      reason: pass ? null : 'reel_meter_balance_mismatch',
    });
  }

  function rejectedAlternatives(project, selectedSupply, supplies, routes, config, selectedTypes, policyId, day) {
    return supplies
      .filter((row) => row.reelId !== selectedSupply.reelId)
      .map((row) => {
        const type = selectedTypes.find((candidate) => candidate.id === row.cableFamilyId);
        if (!compatible(type, project.requiredCableFamilyId, config.simulation.allowSubstitutes)) {
          return `${row.reelId}: incompatible ${row.cableFamilyId}`;
        }
        const route = routes.get(`${row.hubId}:${project.siteId}`);
        const score = route ? allocationCost(policyId, row, project, route, config, day) : Infinity;
        return `${row.reelId}: policy score ${Number.isFinite(score) ? score : 'unreachable'} was not lower`;
      })
      .slice(0, 3);
  }

  function validateExogenous(value, identity) {
    if (value?.schema !== 'simulatte.plugin.cableTraderExogenousInputs.v2'
      || value.scenarioId !== identity.id
      || value.seed !== identity.seed
      || value.configurationHash !== identity.configurationHash
      || canonical(value.selectedCableFamilyIds) !== canonical(identity.selectedCableFamilyIds)
      || !Array.isArray(value.projects)) {
      throw new Error('Cable logistics exogenous inputs do not match the selected scenario');
    }
    return deepFreeze(structuredClone(value));
  }

  function validateInputs(config, routes) {
    if (!Array.isArray(config?.demandSites) || !config.demandSites.length) throw new Error('Cable logistics requires demand sites');
    if (!Array.isArray(routes) || routes.length !== config.hubs.length * config.demandSites.length) {
      throw new Error('Cable logistics requires one directed route from every depot to every demand site');
    }
    const routeKeys = new Set(routes.map((row) => `${row.sourceHubId}:${row.destinationSiteId}`));
    for (const hub of config.hubs) for (const site of config.demandSites) {
      if (!routeKeys.has(`${hub.id}:${site.id}`)) throw new Error(`Cable logistics route missing: ${hub.id} to ${site.id}`);
    }
    if (!POLICIES.includes(normalizePolicy(config.simulation.allocationObjective))) throw new Error('Cable logistics allocation policy is invalid');
  }

  function compatible(type, requiredId, allowSubstitutes) {
    return type.id === requiredId || (allowSubstitutes && (type.substitutesFor || []).includes(requiredId));
  }
  function normalizePolicy(value) {
    if (value === 'optimized') return 'cheapest';
    if (value === 'local-only') return 'fairness-first';
    if (!POLICIES.includes(value)) throw new Error(`Cable logistics allocation policy is invalid: ${value}`);
    return value;
  }
  function policyReason(policyId, project, route) {
    if (policyId === 'fastest') return `Fastest restoration favored a ${routeTravelDays(route)}-day delivery to a ${project.priority} project.`;
    if (policyId === 'fairness-first') return `Fairness-first allocation favored an underserved ${project.priority} project.`;
    return `Cheapest allocation minimized declared material and modeled route cost while respecting ${project.priority} priority.`;
  }
  function deliveryDelay(day, config, route) {
    const stagedClosure = config.simulation.disruptionScenario === 'road-closure'
      && day >= 4
      && day <= 7;
    const userClosure = (config.simulation.interventions || []).some((row) => (
      row.kind === 'route-closure'
      && day >= row.day
      && day <= row.day + 2
    ));
    return routeTravelDays(route) + ((stagedClosure || userClosure) && route.distanceM > 1500 ? 1 : 0);
  }
  function interventionActive(config, kind, day) {
    return (config.simulation.interventions || []).some((row) => row.kind === kind && row.day <= day);
  }
  function routeTravelDays(route) { return Math.max(1, Math.ceil(route.distanceM / 1800)); }
  function scenarioDemandMultiplier(config, scenarioId, siteId, typeId) {
    const row = config.scenarioModifiers.find((item) => item.id === scenarioId) || config.scenarioModifiers[0];
    return (row.demandTypeMultipliers[typeId] || 1) * (row.demandSiteMultipliers[siteId] || 1);
  }
  function resolvePriority(site, index, scenarioId) {
    if (site.defaultPriority === 'critical' || (scenarioId === 'emergency-restoration' && index < 4)) return 'critical';
    return index % 3 === 0 ? 'urgent' : site.defaultPriority;
  }
  function completionDay(projectId, transfers) {
    const rows = transfers.filter((row) => row.projectId === projectId);
    return rows.length ? Math.max(...rows.map((row) => row.arrivalDay)) : Infinity;
  }
  function primaryEventKind(events) {
    const precedence = ['damaged-stock', 'road-closure', 'surprise-demand', 'allocation-conflict', 'reserve-released', 'arrival', 'dispatch', 'demand', 'settlement'];
    return `cable-trader.${precedence.find((kind) => events.some((row) => row.kind === kind)) || 'idle'}`;
  }
  function policyLabel(value) {
    return ({
      cheapest: 'Cheapest completion',
      fastest: 'Fastest restoration',
      'fairness-first': 'Fairness-first allocation',
    })[value] || value;
  }
  function story(kind, entityId, narrative, details) {
    return { kind, entityId, narrative, details };
  }
  function weighted(rows, random, weightFor) {
    const total = rows.reduce((sum, row) => sum + weightFor(row), 0);
    let target = random.float() * total;
    for (const row of rows) {
      target -= weightFor(row);
      if (target < 0) return row;
    }
    return rows.at(-1);
  }
  function createRandom(seed) {
    let state = parseInt(stableId(seed), 16) || 1;
    function float() {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      return (state >>> 0) / 4294967296;
    }
    return Object.freeze({ float, integer(limit) { return Math.floor(float() * limit); } });
  }
  function addEdge(graph, from, to, capacity, cost) {
    const forward = { from, to, capacity, cost, reverse: null };
    const reverse = { from: to, to: from, capacity: 0, cost: -cost, reverse: forward };
    forward.reverse = reverse;
    graph[from].push(forward);
    graph[to].push(reverse);
    return forward;
  }
  function roundCost(value) { return Math.max(0, Math.round(value)); }
  function round(value) { return Math.round(value * 100) / 100; }
  function roundToTen(value) { return Math.max(10, Math.round(value / 10) * 10); }
  function percent(numerator, denominator) { return denominator ? Math.round((numerator / denominator) * 10000) / 100 : 100; }
  function stableId(value) {
    let hash = 2166136261;
    for (const character of String(value)) {
      hash ^= character.codePointAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16);
  }
  function canonical(value) {
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    if (value && typeof value === 'object') {
      return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
  }
  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  }

  return Object.freeze({ POLICIES, simulateNetwork });
});
