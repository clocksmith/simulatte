(function attachGridDispatchModel(root, factory) {
  const snapshotApi = typeof module === 'object' && module.exports
    ? require('./operating-snapshot.js') : root.SimulatteGridOperatingSnapshot;
  const restorationApi = typeof module === 'object' && module.exports
    ? require('./restoration-engine.js') : root.SimulatteGridRestoration;
  const metricsApi = typeof module === 'object' && module.exports
    ? require('./metrics.js') : root.SimulatteGridMetrics;
  const nodeCrypto = typeof module === 'object' && module.exports ? require('node:crypto') : null;
  const api = factory(snapshotApi, restorationApi, metricsApi, nodeCrypto);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteGridDispatchModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createGridDispatchModel(
  snapshotApi,
  restorationApi,
  metricsApi,
  nodeCrypto
) {
  const HOUR_MS = 3600000;

  function runScenario({ datasets, config, scenario, policyOverrides = {}, ensembleMode = false }) {
    const operating = snapshotApi.materialize({
      eiaDemand: datasets.eiaDemand,
      eiaGeneration: datasets.eiaGeneration,
      topology: datasets.topology,
      resources: datasets.resources,
      storage: datasets.storage,
    });
    const disturbance = datasets.disturbances.scenarios.find((row) => row.id === scenario.disturbanceScenarioId);
    if (!disturbance) throw gridError('grid_disturbance_unknown', scenario.disturbanceScenarioId);
    const policies = {
      dispatchPolicyId: policyOverrides.dispatchPolicyId || scenario.dispatchPolicyId || config.dispatchPolicyId,
      reservePolicyId: policyOverrides.reservePolicyId || scenario.reservePolicyId || config.reservePolicyId,
      storagePolicyId: policyOverrides.storagePolicyId || scenario.storagePolicyId || config.storagePolicyId,
      restorationPolicyId: policyOverrides.restorationPolicyId || scenario.restorationPolicyId || config.restorationPolicyId,
    };
    validatePolicies(policies);
    const restoration = restorationApi.schedule({
      disturbance,
      restoration: datasets.restoration,
      policyId: policies.restorationPolicyId,
      crewCount: scenario.restorationCrewCount || config.restorationCrewCount,
    });
    const storageState = Object.fromEntries(operating.regions.flatMap((region) => region.storage.map(
      (row) => [row.id, row.initialStateOfChargeMwh]
    )));
    const previousGeneration = {};
    const snapshots = [initialSnapshot(operating, disturbance)];
    const events = [{
      id: `grid:${scenario.seed}:initialized`,
      kind: 'grid.scenario-initialized',
      simulationTimeMs: 0,
      causationIds: [],
      payload: { disturbanceScenarioId: disturbance.id },
    }];
    for (let hour = 0; hour < operating.durationHours; hour += 1) {
      const activeFailures = failuresAtHour(disturbance, restoration, hour);
      const result = dispatchHour({
        operating,
        datasets,
        scenario,
        policies,
        disturbance,
        activeFailures,
        storageState,
        previousGeneration,
        hour,
        ensembleMode,
      });
      Object.assign(storageState, result.nextStorageState);
      Object.assign(previousGeneration, result.nextGeneration);
      const simulationTimeMs = (hour + 1) * HOUR_MS;
      const eventId = `grid:${scenario.seed}:hour-${hour + 1}`;
      events.push({
        id: eventId,
        kind: activeFailures.targetIds.length ? 'grid.disruption-dispatch' : 'grid.restored-dispatch',
        simulationTimeMs,
        causationIds: [events.at(-1).id],
        payload: {
          hour,
          activeFailureIds: activeFailures.targetIds,
          observedRowIds: result.observedRowIds,
          balanceResidualMw: result.verification.maximumBalanceResidualMw,
        },
      });
      snapshots.push(deepFreeze({
        schema: 'simulatte.gridResilienceState.v1',
        id: `${scenario.seed}:snapshot-${hour + 1}`,
        simulationTimeMs,
        status: hour === operating.durationHours - 1 ? 'settled' : activeFailures.targetIds.length ? 'disrupted' : 'restoring',
        hour,
        period: operating.regions[0].hourly[hour].period,
        regions: result.regions,
        interfaces: result.interfaces,
        activeFailureIds: activeFailures.targetIds,
        restoredTargetIds: restoration.tasks.filter((row) => row.completeHour <= hour).map((row) => row.targetId),
        eventIds: events.map((row) => row.id),
        verification: result.verification,
      }));
    }
    const metrics = metricsApi.summarize(snapshots.slice(1));
    const configurationIdentity = {
      profileId: 'grid-resilience-us-v1',
      worldModelId: 'us-food-network-v1',
      disturbanceScenarioId: disturbance.id,
      seed: scenario.seed,
      ...policies,
      demandResponseMaximumFraction: scenario.demandResponseMaximumFraction,
      emissionsPriceUsdPerTon: scenario.emissionsPriceUsdPerTon,
      sheddingPriorities: scenario.sheddingPriorities,
      restorationCrewCount: scenario.restorationCrewCount,
      ensembleSize: scenario.ensembleSize,
      datasetHashes: datasets.dataReceipts.map((row) => [row.datasetId, row.sha256]),
    };
    const scenarioIdentity = stableHash(configurationIdentity);
    const valid = snapshots.slice(1).every((row) => row.verification.valid)
      && restoration.crewOverlapValid && restoration.dependenciesValid;
    return deepFreeze({
      schema: 'simulatte.gridResilienceRun.v1',
      id: `grid:${scenarioIdentity}`,
      scenarioIdentity,
      configurationIdentity,
      scenarioId: disturbance.id,
      seed: scenario.seed,
      policies,
      events,
      snapshots,
      metrics,
      restoration,
      settlement: {
        schema: 'simulatte.gridSettlement.v1',
        status: valid ? 'settled' : 'failed',
        valid,
        terminalStateId: snapshots.at(-1).id,
        modeledUnservedEnergyMwh: metrics.modeledUnservedEnergyMwh,
        maximumBalanceResidualMw: Math.max(...snapshots.slice(1).map((row) => row.verification.maximumBalanceResidualMw)),
        truth: truth('simulated', 'forecast', 'distribution', {
          interpretation: 'Exact for declared aggregate equations; scenario variance is not forecast uncertainty.',
        }),
      },
      claimBoundary: 'Interface-constrained regional experiment; not AC power flow, protected topology, or an operational blackout forecast.',
    });
  }

  function runEnsemble({ datasets, config, scenario }) {
    const seeds = config.ensembleSeeds.slice(0, scenario.ensembleSize);
    const runs = seeds.map((seed) => runScenario({
      datasets,
      config,
      scenario: { ...scenario, seed },
      ensembleMode: true,
    }));
    return deepFreeze({
      schema: 'simulatte.plugin.gridEnsembleReceipt.v1',
      seedSet: seeds,
      classification: 'scenario variance',
      runIdentities: runs.map((row) => row.scenarioIdentity),
      summary: metricsApi.summarizeEnsemble(runs),
    });
  }

  function dispatchHour({
    operating,
    datasets,
    scenario,
    policies,
    disturbance,
    activeFailures,
    storageState,
    previousGeneration,
    hour,
    ensembleMode,
  }) {
    const priority = new Map(scenario.sheddingPriorities.map((id, index) => [id, index]));
    const regionState = operating.regions.map((region) => {
      const observed = region.hourly[hour];
      const temperature = maximumTemperature(datasets.noaaWeather.observations, region.id);
      const weatherMultiplier = disturbance.id === 'heat-demand-peak' && Number.isFinite(temperature)
        ? 1 + Math.max(0, temperature - 28) * 0.0025 : 1;
      const seedMultiplier = ensembleMode ? 0.98 + unit(`${scenario.seed}:${region.id}:${hour}`) * 0.04 : 1;
      const grossDemandMw = round(observed.demandMw
        * (disturbance.demandMultiplierByRegion[region.id] || 1) * weatherMultiplier * seedMultiplier);
      const resources = region.resources.map((resource) => materializeResource({
        resource,
        observed,
        activeFailures,
        previousGeneration,
        hour,
        emissionsPriceUsdPerTon: scenario.emissionsPriceUsdPerTon,
      }));
      const projectedAvailableMw = resources.reduce((sum, row) => sum + row.availableCapacityMw, 0);
      const projectedShortfallMw = Math.max(0, grossDemandMw - projectedAvailableMw);
      const responseAggressiveness = policies.reservePolicyId === 'adaptive-reserve' ? 1 : 0.45;
      const demandResponseMw = round(Math.min(
        grossDemandMw * scenario.demandResponseMaximumFraction,
        projectedShortfallMw * responseAggressiveness
      ));
      const netDemandMw = round(grossDemandMw - demandResponseMw);
      const generation = dispatchResources(resources, netDemandMw, policies.dispatchPolicyId);
      return {
        id: region.id,
        label: region.name,
        coordinates: region.coordinates,
        observedDemandRowId: observed.demandRowId,
        observedWeatherRowIds: datasets.noaaWeather.observations.filter(
          (row) => row.regionId === region.id && row.timestamp.startsWith(observed.period.slice(0, 10))
        ).map((row) => row.rowId),
        grossDemandMw,
        demandResponseMw,
        netDemandMw,
        generation,
        generationMw: round(sum(generation, 'generationMw')),
        importsMw: 0,
        exportsMw: 0,
        storageDischargeMw: 0,
        unservedMw: 0,
        priority: priority.get(region.id) ?? 999,
        resourceHeadroomMw: round(sum(generation, 'headroomMw')),
      };
    });
    const regionById = new Map(regionState.map((row) => [row.id, row]));
    const interfaces = operating.interfaces.map((edge) => ({
      ...edge,
      available: !activeFailures.interfaceIds.has(edge.id),
      transferMw: 0,
      utilizationRatio: 0,
    }));
    const deficits = () => new Map(regionState.map((row) => [
      row.id,
      Math.max(0, row.netDemandMw - row.generationMw - row.importsMw + row.exportsMw - row.storageDischargeMw),
    ]));
    interfaces.sort((a, b) => {
      const aPriority = Math.min(regionById.get(a.fromRegionId).priority, regionById.get(a.toRegionId).priority);
      const bPriority = Math.min(regionById.get(b.fromRegionId).priority, regionById.get(b.toRegionId).priority);
      return aPriority - bPriority || a.id.localeCompare(b.id);
    }).forEach((edge) => {
      if (!edge.available) return;
      const currentDeficits = deficits();
      const from = regionById.get(edge.fromRegionId);
      const to = regionById.get(edge.toRegionId);
      if (currentDeficits.get(to.id) > 0 && from.resourceHeadroomMw > 0) {
        transfer(edge, from, to, Math.min(edge.forwardLimitMw, currentDeficits.get(to.id), from.resourceHeadroomMw));
      } else if (currentDeficits.get(from.id) > 0 && to.resourceHeadroomMw > 0) {
        transfer(edge, to, from, -Math.min(edge.reverseLimitMw, currentDeficits.get(from.id), to.resourceHeadroomMw));
      }
      edge.utilizationRatio = round(Math.abs(edge.transferMw) / Math.max(1, edge.transferMw >= 0 ? edge.forwardLimitMw : edge.reverseLimitMw));
    });
    const nextStorageState = { ...storageState };
    regionState.forEach((region) => {
      const storage = operating.regions.find((row) => row.id === region.id).storage[0];
      const deficit = Math.max(0, region.netDemandMw - region.generationMw - region.importsMw + region.exportsMw);
      const reserveFraction = policies.storagePolicyId === 'reserve-preserving' ? 0.38 : storage.minimumStateOfChargeFraction;
      const availableEnergyMwh = Math.max(0, storageState[storage.id] - storage.energyCapacityMwh * reserveFraction);
      const dischargeMw = round(Math.min(deficit, storage.powerCapacityMw, availableEnergyMwh * storage.dischargeEfficiency));
      region.storageDischargeMw = dischargeMw;
      nextStorageState[storage.id] = round(storageState[storage.id] - dischargeMw / storage.dischargeEfficiency);
      region.unservedMw = round(Math.max(0, deficit - dischargeMw));
      region.servedMw = round(region.grossDemandMw - region.demandResponseMw - region.unservedMw);
      region.reserveMw = round(Math.max(0, region.resourceHeadroomMw));
      const requiredReserveMw = round(region.grossDemandMw * (policies.reservePolicyId === 'adaptive-reserve' ? 0.12 : 0.08));
      region.reserveShortfallMw = round(Math.max(0, requiredReserveMw - region.reserveMw));
      region.reserveMarginRatio = round((region.reserveMw - requiredReserveMw) / Math.max(1, region.grossDemandMw));
      region.storageStateOfChargeMwh = nextStorageState[storage.id];
      region.emissionsTons = round(region.generation.reduce(
        (sum, row) => sum + row.generationMw * row.emissionsTonsPerMwh, 0
      ));
      region.balanceResidualMw = round(
        region.generationMw + region.importsMw + region.storageDischargeMw
        + region.unservedMw + region.demandResponseMw - region.grossDemandMw - region.exportsMw
      );
      delete region.priority;
      delete region.resourceHeadroomMw;
    });
    const maximumBalanceResidualMw = Math.max(...regionState.map((row) => Math.abs(row.balanceResidualMw)));
    const interfaceValid = interfaces.every((row) => Math.abs(row.transferMw)
      <= (row.transferMw >= 0 ? row.forwardLimitMw : row.reverseLimitMw) + 1e-6);
    const storageValid = operating.regions.every((region) => {
      const storage = region.storage[0];
      return nextStorageState[storage.id] >= -1e-6 && nextStorageState[storage.id] <= storage.energyCapacityMwh + 1e-6;
    });
    return deepFreeze({
      regions: regionState,
      interfaces,
      nextStorageState,
      nextGeneration: Object.fromEntries(regionState.flatMap((region) => region.generation.map(
        (row) => [row.id, row.generationMw]
      ))),
      observedRowIds: regionState.flatMap((row) => [row.observedDemandRowId, ...row.observedWeatherRowIds]),
      verification: {
        valid: maximumBalanceResidualMw <= 1e-5 && interfaceValid && storageValid,
        maximumBalanceResidualMw,
        interfaceValid,
        storageValid,
      },
    });
  }

  function materializeResource({ resource, observed, activeFailures, previousGeneration, hour, emissionsPriceUsdPerTon }) {
    const unavailable = activeFailures.resourceIds.has(resource.id);
    const outageFraction = unavailable ? activeFailures.resourceFractions[resource.id] : 0;
    let availability = 1 - outageFraction;
    if (resource.kind === 'variable-renewable') {
      const observedRenewable = observed.generationRows.filter((row) => ['SUN', 'WND', 'WAT'].includes(row.fuelType))
        .reduce((sum, row) => sum + Math.max(0, row.value), 0);
      availability = Math.min(1, observedRenewable / Math.max(1, resource.capacityMw));
    }
    let availableCapacityMw = resource.capacityMw * availability;
    if (hour > 0 && Number.isFinite(previousGeneration[resource.id])) {
      availableCapacityMw = Math.min(availableCapacityMw,
        previousGeneration[resource.id] + resource.capacityMw * resource.rampUpFraction);
    }
    return {
      ...resource,
      availableCapacityMw: round(Math.max(0, availableCapacityMw)),
      effectiveCostUsdPerMwh: round(resource.variableCostUsdPerMwh + resource.emissionsTonsPerMwh * emissionsPriceUsdPerTon),
    };
  }

  function dispatchResources(resources, targetMw, policyId) {
    const ordered = [...resources].sort((a, b) => {
      const aScore = a.effectiveCostUsdPerMwh + (policyId === 'resilience-weighted' ? a.emissionsTonsPerMwh * 35 : 0);
      const bScore = b.effectiveCostUsdPerMwh + (policyId === 'resilience-weighted' ? b.emissionsTonsPerMwh * 35 : 0);
      return aScore - bScore || a.id.localeCompare(b.id);
    });
    let remaining = targetMw;
    return ordered.map((resource) => {
      const generationMw = round(Math.min(remaining, resource.availableCapacityMw));
      remaining = round(Math.max(0, remaining - generationMw));
      return {
        ...resource,
        generationMw,
        headroomMw: round(resource.availableCapacityMw - generationMw),
      };
    });
  }

  function transfer(edge, source, destination, signedAmount) {
    const amount = Math.abs(signedAmount);
    source.generationMw = round(source.generationMw + amount);
    source.resourceHeadroomMw = round(source.resourceHeadroomMw - amount);
    source.exportsMw = round(source.exportsMw + amount);
    destination.importsMw = round(destination.importsMw + amount);
    edge.transferMw = round(signedAmount);
  }

  function failuresAtHour(disturbance, restoration, hour) {
    const interfaceIds = new Set(disturbance.unavailableInterfaceIds.filter(
      (id) => (restoration.targetRestoredAtHour[id] ?? Infinity) > hour
    ));
    const resourceFractions = Object.fromEntries(Object.entries(disturbance.unavailableResourceFractions || {}).filter(
      ([id]) => (restoration.targetRestoredAtHour[id] ?? Infinity) > hour
    ));
    return {
      interfaceIds,
      resourceIds: new Set(Object.keys(resourceFractions)),
      resourceFractions,
      targetIds: [...interfaceIds, ...Object.keys(resourceFractions)].sort(),
    };
  }

  function initialSnapshot(operating, disturbance) {
    return deepFreeze({
      schema: 'simulatte.gridResilienceState.v1',
      id: 'grid:ready',
      simulationTimeMs: 0,
      status: 'ready',
      hour: -1,
      period: operating.startPeriod,
      regions: operating.regions.map((row) => ({
        id: row.id,
        label: row.name,
        coordinates: row.coordinates,
        grossDemandMw: row.hourly[0].demandMw,
        servedMw: 0,
        unservedMw: 0,
        reserveMarginRatio: 0,
        emissionsTons: 0,
      })),
      interfaces: operating.interfaces.map((row) => ({ ...row, transferMw: 0, utilizationRatio: 0 })),
      activeFailureIds: [
        ...disturbance.unavailableInterfaceIds,
        ...Object.keys(disturbance.unavailableResourceFractions || {}),
      ],
      restoredTargetIds: [],
      eventIds: [],
      verification: { valid: true, maximumBalanceResidualMw: 0, interfaceValid: true, storageValid: true },
    });
  }

  function maximumTemperature(observations, regionId) {
    const values = observations.filter((row) => row.regionId === regionId)
      .map((row) => row.airTemperatureC).filter(Number.isFinite);
    return values.length ? Math.max(...values) : null;
  }

  function validatePolicies(policies) {
    const allowed = {
      dispatchPolicyId: ['economic-order', 'resilience-weighted'],
      reservePolicyId: ['fixed-reserve', 'adaptive-reserve'],
      storagePolicyId: ['immediate-support', 'reserve-preserving'],
      restorationPolicyId: ['nearest-first', 'dependency-aware', 'service-impact-first'],
    };
    Object.entries(allowed).forEach(([key, values]) => {
      if (!values.includes(policies[key])) throw gridError('grid_policy_invalid', `${key}:${policies[key]}`);
    });
  }

  function unit(text) {
    const hash = stableHash(text);
    return Number.parseInt(hash.slice(0, 8), 16) / 0xffffffff;
  }

  function stableHash(value) {
    const input = stable(value);
    if (nodeCrypto) return nodeCrypto.createHash('sha256').update(input).digest('hex');
    let hash = 2166136261;
    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return Array.from({ length: 8 }, (_, index) => ((hash >>> ((index % 4) * 8)) & 0xff).toString(16).padStart(2, '0')).join('').repeat(4);
  }

  function stable(value) {
    if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
    if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
    return JSON.stringify(value);
  }

  function sum(rows, key) {
    return rows.reduce((total, row) => total + (Number(row[key]) || 0), 0);
  }

  function round(value) {
    return Math.round(value * 1e6) / 1e6;
  }

  function truth(origin, temporalStatus, kind, value) {
    return { origin, temporalStatus, uncertainty: { kind, value } };
  }

  function gridError(code, message) {
    const error = new Error(`${code}: ${message}`);
    error.name = 'SimulatteGridModelError';
    error.code = code;
    return error;
  }

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  }

  return Object.freeze({ runEnsemble, runScenario, stableHash });
});
