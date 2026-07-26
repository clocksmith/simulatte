(function attachFoodRecallEngine(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteFoodRecallEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createFoodRecallEngine() {
  // Deterministic discrete-event food-recall engine (TODO_PLUGINS §7, §8).
  //
  // Everything stochastic is driven by named RNG streams from sdk.random, and the
  // surveillance/recall timeline is ordered by sdk.scheduler, so the same seed + same
  // datasets always produce the same terminal state and receipts. Counterfactual
  // (baseline vs intervention) runs share the same underlying draws — common random
  // numbers — so cases-averted is measured against matched contamination and demand.
  const ENGINE_VERSION = 'food-recall-engine-2.1.0';
  const HOURS_PER_DAY = 24;
  const CHAIN = ['grower', 'initial_packer', 'processor', 'distributor', 'retailer'];

  // ---- Model compilation ----------------------------------------------------------
  function compileModel({ facilities, corridors, products, hazards, consumerZones }) {
    const facilityById = new Map(facilities.map((row) => [row.id, row]));
    const facilitiesByKind = new Map(CHAIN.concat(['restaurant']).map((kind) => [kind, facilities.filter((row) => row.facilityKind === kind)]));
    const outgoing = new Map(facilities.map((row) => [row.id, []]));
    corridors.forEach((corridor) => { if (outgoing.has(corridor.fromFacilityId)) outgoing.get(corridor.fromFacilityId).push(corridor); });
    outgoing.forEach((rows) => rows.sort((left, right) => left.toFacilityId.localeCompare(right.toFacilityId)));
    const productById = new Map(products.map((row) => [row.id, row]));
    const hazardById = new Map(hazards.hazards.map((row) => [row.id, row]));
    return Object.freeze({ facilityById, facilitiesByKind, outgoing, productById, hazardById, surveillance: hazards.surveillanceStages, consumerZones: consumerZones.zones });
  }

  // ---- Predictive microbiology ----------------------------------------------------
  // Ratkowsky square-root maximum growth rate, integrated over a constant-T interval.
  function growLoad(load, mass, hazard, tempC, hours) {
    if (!hazard.growth || load <= 0 || mass <= 0) return load;
    const { tMinC, bPerSqrtC, nMaxLog10CfuPerG } = hazard.growth;
    const rootRate = Math.max(0, bPerSqrtC * (tempC - tMinC));
    const muMax = rootRate * rootRate; // per hour
    if (muMax <= 0) return load;
    const nMax = Math.pow(10, nMaxLog10CfuPerG) * mass;
    const grown = Math.min(nMax, load * Math.exp(muMax * hours));
    return grown;
  }

  // Thermal inactivation: D(T) = Dref * 10^((Tref - T)/z); R = dt/D; N_out = N_in * 10^-R.
  function thermalReduction(load, hazard, tempC, minutes) {
    if (!hazard.thermal || load <= 0) return load;
    const { dRefMin, tRefC, zC } = hazard.thermal;
    const dAtT = dRefMin * Math.pow(10, (tRefC - tempC) / zC);
    if (!(dAtT > 0)) return 0;
    const logReduction = minutes / dAtT;
    return load * Math.pow(10, -logReduction);
  }

  // ---- Cold chain: first-order cargo temperature response + reefer failure ---------
  function transitTempProfile(corridor, rng, coldChainFailure, inputs) {
    const setpoint = Number(inputs.refrigerationSetpointC ?? 3.5);
    const tau = Number(inputs.refrigerationTimeConstantHours ?? 6);
    const serviceDelay = Math.max(0, Number(inputs.logisticsDelayHours ?? 0));
    const totalHours = Math.max(1, corridor.meanTransitHours + serviceDelay);
    let temp = setpoint;
    let failed = false;
    let repairHours = 0;
    // Hazard-rate reefer failure over the transit.
    const failureMultiplier = Math.max(0, Number(inputs.refrigerationFailureRateMultiplier ?? 1));
    const failureProbability = 1 - Math.exp(-corridor.reeferFailureRatePerHour * failureMultiplier * totalHours);
    if (coldChainFailure && coldChainFailure.corridorStage === corridor.toStage) {
      failed = true;
      repairHours = coldChainFailure.repairHours;
    } else if (rng.next() < failureProbability) {
      failed = true;
      repairHours = 4 + rng.next() * 20;
    }
    // Integrate growth over 1-hour steps; target is setpoint, or ambient during failure.
    return {
      totalHours,
      serviceDelay,
      tau,
      setpoint,
      ambient: Number(coldChainFailure?.ambientTempC ?? inputs.ambientTemperatureC ?? corridor.ambientTempC),
      failed,
      repairHours,
      temp,
    };
  }

  function integrateTransit(lot, corridor, hazard, rng, coldChainFailure, inputs) {
    const profile = transitTempProfile(corridor, rng, coldChainFailure, inputs);
    let temp = profile.setpoint;
    let load = lot.totalLoadCfu;
    const failureStart = profile.failed ? profile.totalHours * 0.4 : Infinity;
    const failureEnd = failureStart + profile.repairHours;
    let peakTempC = temp;
    for (let hour = 0; hour < profile.totalHours; hour += 1) {
      const target = (hour >= failureStart && hour < failureEnd) ? profile.ambient : profile.setpoint;
      temp = target + (temp - target) * Math.exp(-1 / profile.tau);
      peakTempC = Math.max(peakTempC, temp);
      load = growLoad(load, lot.massKg * 1000, hazard, temp, 1);
    }
    return {
      load,
      totalHours: profile.totalHours,
      serviceDelayHours: profile.serviceDelay,
      ambientTempC: profile.ambient,
      peakTempC,
      failed: profile.failed,
      repairHours: profile.repairHours,
    };
  }

  // ---- Lot ledger: transformation with strict mass + load balance ------------------
  function transform(inputLots, yieldFraction, envTransferCfu, logReduction, outputTlcId, productId, hazardId) {
    const massIn = inputLots.reduce((sum, lot) => sum + lot.massKg, 0);
    const loadIn = inputLots.reduce((sum, lot) => sum + lot.totalLoadCfu, 0);
    const massOut = yieldFraction * massIn;
    const massWaste = massIn - massOut;
    const loadPrekill = loadIn + envTransferCfu;
    const loadOut = loadPrekill * Math.pow(10, -logReduction);
    return {
      tlcId: outputTlcId, productId, hazardId,
      massKg: massOut, totalLoadCfu: loadOut,
      parentTlcIds: inputLots.map((lot) => lot.tlcId),
      balance: { massIn, massOut, massWaste, loadIn, envTransferCfu, logReduction, loadOut },
    };
  }

  // Split a lot into child lots by mass fractions; organism load partitioned
  // stochastically (multinomial) at low counts, proportionally at high counts.
  function splitLot(lot, fractions, childIds, rng) {
    const totalLoad = Math.round(lot.totalLoadCfu);
    const useStochastic = totalLoad > 0 && totalLoad < 100000;
    const loads = useStochastic
      ? rng.multinomial(totalLoad, fractions)
      : fractions.map((fraction) => lot.totalLoadCfu * fraction);
    return fractions.map((fraction, index) => ({
      tlcId: childIds[index], productId: lot.productId, hazardId: lot.hazardId,
      massKg: lot.massKg * fraction, totalLoadCfu: loads[index],
      parentTlcIds: [lot.tlcId],
    }));
  }

  // ---- Dose-response --------------------------------------------------------------
  function doseResponse(hazard, foodCategory, stratum, doseCfu) {
    if (doseCfu <= 0) return 0;
    const models = hazard.doseResponse || [];
    const model = models.find((row) => row.foodCategory === foodCategory && row.populationStratum === stratum)
      || models.find((row) => row.foodCategory === foodCategory)
      || models[0];
    if (!model) return 0;
    if (model.modelFamily === 'exponential') return 1 - Math.exp(-model.parameters.r * doseCfu);
    if (model.modelFamily === 'beta_poisson') return 1 - Math.pow(1 + doseCfu / model.parameters.beta, -model.parameters.alpha);
    return 0;
  }

  // ---- Full scenario run ----------------------------------------------------------
  // intervention: null (baseline) or { dayOffset, depth, scope }.
  function runScenario({ model, scenario, random, scheduler, intervention, inputContext = null }) {
    const contaminationRng = random.stream(`${scenario.seed}:contamination`);
    const shipmentRng = random.stream(`${scenario.seed}:shipment`);
    const reeferRng = random.stream(`${scenario.seed}:reefer`);
    const consumerRng = random.stream(`${scenario.seed}:consumer`);
    const surveillanceRng = random.stream(`${scenario.seed}:surveillance`);
    const recallRng = random.stream(`${scenario.seed}:recall`);

    const product = model.productById.get(scenario.commodityId);
    const hazard = model.hazardById.get(scenario.hazardId);
    if (!product || !hazard) throw engineError('food_scenario_unresolved', `Scenario ${scenario.id} references unknown product/hazard`, { product: scenario.commodityId, hazard: scenario.hazardId });
    const isAllergen = hazard.family === 'undeclared_allergen';

    const inputs = normalizeInputs(inputContext);
    const lots = new Map();
    const lineage = [];
    let eventOrdinal = 0;
    const record = (event) => lineage.push({ ...event, eventOrdinal: (eventOrdinal += 1) });
    let lotCounter = 0;
    const newTlc = (facility, tag) => `tlc:${facility.id}:${scenario.seed}:${tag}:${(lotCounter += 1)}`;

    // 1. Seed origin lots at the scenario's origin facility kind.
    const origins = model.facilitiesByKind.get(scenario.originFacilityKind) || [];
    const originLots = [];
    origins.forEach((facility, facilityIndex) => {
      const massKg = 12000 + shipmentRng.next() * 8000;
      const isSeeded = facilityIndex < scenario.contamination.seededLots;
      let totalLoadCfu = 0;
      if (isSeeded && !isAllergen) {
        const gramMass = massKg * 1000;
        const concentration = Math.pow(10, scenario.contamination.initialLog10CfuPerG);
        totalLoadCfu = concentration * gramMass * scenario.contamination.prevalence;
      }
      const lot = {
        tlcId: newTlc(facility, 'origin'), productId: product.id, hazardId: hazard.id,
        massKg, totalLoadCfu, parentTlcIds: [], facilityId: facility.id, stage: scenario.originFacilityKind,
        contaminatedAtOrigin: totalLoadCfu > 0 || (isAllergen && isSeeded),
        allergenPresenceMg: isAllergen && isSeeded ? scenario.contamination.presenceMg : 0,
        cumulativeTransitHours: 0,
      };
      lots.set(lot.tlcId, lot);
      originLots.push(lot);
      record({ cte: 'harvesting', timeHours: 0, facilityId: facility.id, tlcId: lot.tlcId, parents: [] });
    });

    // 2. Propagate along the chain, transforming at the processor and shipping onward.
    const distributed = [];
    const startStageIndex = CHAIN.indexOf(scenario.originFacilityKind);
    function ship(lot, corridor) {
      const toStage = model.facilityById.get(corridor.toFacilityId).facilityKind;
      const annotated = { ...corridor, toStage };
      const forcedFailure = inputs.forcedColdChainFailure;
      const transit = isAllergen
        ? {
          load: lot.totalLoadCfu,
          totalHours: Math.max(1, corridor.meanTransitHours + inputs.logisticsDelayHours),
          serviceDelayHours: inputs.logisticsDelayHours,
          ambientTempC: inputs.ambientTemperatureC,
          peakTempC: inputs.refrigerationSetpointC,
          failed: false,
          repairHours: 0,
        }
        : integrateTransit(lot, annotated, hazard, reeferRng, forcedFailure, inputs);
      const departureHour = lot.cumulativeTransitHours || 0;
      const arrivalHour = departureHour + transit.totalHours;
      record({
        cte: 'shipping',
        timeHours: arrivalHour,
        departureHour,
        arrivalHour,
        facilityId: corridor.fromFacilityId,
        toFacilityId: corridor.toFacilityId,
        corridorId: corridor.id,
        tlcId: lot.tlcId,
        peakTempC: Number(transit.peakTempC.toFixed(2)),
        ambientTempC: transit.ambientTempC,
        transitHours: Number(transit.totalHours.toFixed(3)),
        serviceDelayHours: Number(transit.serviceDelayHours.toFixed(3)),
        reeferFailed: transit.failed,
        inputFieldIds: inputs.fieldIdentities,
      });
      return {
        ...lot,
        totalLoadCfu: transit.load,
        facilityId: corridor.toFacilityId,
        stage: toStage,
        cumulativeTransitHours: arrivalHour,
        transit,
      };
    }

    let frontier = originLots.map((lot) => ({ lot, stageIndex: startStageIndex }));
    const guardMax = 5000;
    let processedCount = 0;
    while (frontier.length) {
      const next = [];
      for (const { lot, stageIndex } of frontier) {
        if ((processedCount += 1) > guardMax) throw engineError('food_propagation_budget', 'Lot propagation exceeded bound', { processedCount });
        const facility = model.facilityById.get(lot.facilityId);
        const corridors = model.outgoing.get(lot.facilityId) || [];
        if (!corridors.length || stageIndex >= CHAIN.length - 1) {
          distributed.push(lot); // retailer / terminal node
          continue;
        }
        // At the processor, transform (merge to a new traceability lot with a small kill step for eggs/RTE, none for raw).
        let shippableLots = [lot];
        if (facility.facilityKind === 'processor') {
          const outId = newTlc(facility, 'xform');
          const logReduction = product.preparationProfiles.some((p) => p.logReduction > 0) ? 0 : 0; // process kill handled at consumer prep
          const envTransfer = lot.totalLoadCfu > 0 ? 0 : (contaminationRng.next() < 0.05 ? Math.pow(10, 2) * lot.massKg * 100 : 0);
          const xform = transform([lot], 0.85, envTransfer, logReduction, outId, product.id, hazard.id);
          const merged = {
            ...xform,
            facilityId: lot.facilityId,
            stage: 'processor',
            contaminatedAtOrigin: lot.contaminatedAtOrigin,
            allergenPresenceMg: lot.allergenPresenceMg,
            cumulativeTransitHours: lot.cumulativeTransitHours || 0,
          };
          lots.set(merged.tlcId, merged);
          record({
            cte: 'transformation',
            timeHours: lot.cumulativeTransitHours || 0,
            facilityId: facility.id,
            tlcId: merged.tlcId,
            parents: xform.parentTlcIds,
            balance: xform.balance,
          });
          // Split into shipment child lots.
          const childCount = Math.max(1, (model.outgoing.get(lot.facilityId) || []).length);
          const fractions = Array.from({ length: childCount }, () => 1 / childCount);
          const childIds = fractions.map(() => newTlc(facility, 'ship'));
          shippableLots = splitLot(merged, fractions, childIds, contaminationRng).map((child) => {
            const stored = {
              ...child,
              facilityId: lot.facilityId,
              stage: 'processor',
              contaminatedAtOrigin: merged.contaminatedAtOrigin,
              allergenPresenceMg: merged.allergenPresenceMg,
              cumulativeTransitHours: merged.cumulativeTransitHours,
            };
            lots.set(stored.tlcId, stored);
            // Record the split so lot lineage stays connected: the recall descendant
            // closure and traceback both walk lineage parents, so an unrecorded split
            // would orphan every downstream lot from its contaminated ancestor.
            record({
              cte: 'lot_split',
              timeHours: lot.cumulativeTransitHours || 0,
              facilityId: facility.id,
              tlcId: stored.tlcId,
              parents: [merged.tlcId],
            });
            return stored;
          });
        }
        shippableLots.forEach((shippable, index) => {
          const corridor = corridors[index % corridors.length];
          const shipped = ship(shippable, corridor);
          lots.set(shipped.tlcId, { ...lots.get(shippable.tlcId), ...shipped });
          next.push({ lot: shipped, stageIndex: CHAIN.indexOf(shipped.stage) });
        });
      }
      frontier = next;
    }

    // 3. Consumer exposure at terminal (retail/restaurant) lots.
    const zoneCount = model.consumerZones.length;
    let trueIllnesses = 0;
    const exposedLots = [];
    distributed.forEach((lot) => {
      const units = Math.max(1, Math.round((lot.massKg) / product.defaultUnitMassKg));
      const availableServings = Math.floor(Math.min(units, 500) * inputs.logisticsAvailability);
      const servings = Math.max(0, availableServings);
      const concentrationPerG = lot.totalLoadCfu / Math.max(1, lot.massKg * 1000);
      const prep = product.preparationProfiles;
      let lotIllness = 0;
      for (let s = 0; s < servings; s += 1) {
        const profile = prep[consumerRng.weightedIndex(prep.map((p) => p.probability))];
        if (isAllergen) {
          if (lot.allergenPresenceMg > 0 && consumerRng.next() < 0.011) { // susceptible fraction
            if (lot.allergenPresenceMg >= 1.5) lotIllness += 1;
          }
          continue;
        }
        const servingMassG = product.defaultUnitMassKg * 1000 * (0.4 + consumerRng.next() * 0.5);
        const dose = concentrationPerG * servingMassG * Math.pow(10, -profile.logReduction);
        const stratum = scenario.contamination.hazardStratum;
        const probIll = doseResponse(hazard, scenario.contamination.foodCategory, stratum, dose);
        if (consumerRng.next() < probIll) lotIllness += 1;
      }
      if (lotIllness > 0) exposedLots.push({ tlcId: lot.tlcId, illnesses: lotIllness, contaminated: lot.contaminatedAtOrigin });
      trueIllnesses += lotIllness;
    });

    // 4. Surveillance: observed cases are a binomial subset; scheduled detection stages.
    const stages = model.surveillance;
    const observed = surveillanceRng.binomial(trueIllnesses, stages.observationProbabilities.care * stages.observationProbabilities.sample * stages.observationProbabilities.report);
    const sampleLog = (dist) => Math.exp(dist.parameters.mu + surveillanceRng.normal(0, dist.parameters.sigma));
    let detectionHours = 0;
    if (observed >= 2 && !isAllergen) {
      detectionHours = ['incubationHours', 'onsetToCareHours', 'careToSpecimenHours', 'specimenToSequenceHours', 'sequenceToClusterHours', 'clusterToTracebackHours']
        .reduce((sum, key) => sum + sampleLog(stages[key]), 0);
    } else if (isAllergen && observed >= 1) {
      detectionHours = sampleLog(stages.onsetToCareHours) + sampleLog(stages.clusterToTracebackHours);
    }
    const surveillanceMultiplier = scenario.detectionProfile === 'accelerated'
      ? 0.75
      : scenario.detectionProfile === 'delayed' ? 1.5 : 1;
    const exposureDelayHours = distributed.length
      ? distributed.reduce((sum, lot) => sum + (lot.cumulativeTransitHours || 0), 0) / distributed.length
      : 0;
    const detectionDay = detectionHours > 0
      ? (exposureDelayHours + detectionHours * surveillanceMultiplier) / HOURS_PER_DAY
      : 0;

    // 5. Traceback: score candidate origin lots by reachability to observed exposures.
    const trueSourceIds = originLots.filter((lot) => lot.contaminatedAtOrigin).map((lot) => lot.tlcId);
    const traceback = scoreTraceback(originLots, exposedLots, lineage, model, surveillanceRng);
    const trueSourceRank = traceback.findIndex((row) => trueSourceIds.includes(row.candidateId)) + 1;

    // 6. Recall intervention (descendant closure + notification + removal), if requested.
    let recall = null;
    if (intervention && observed >= 1) {
      recall = runRecall({ intervention, originLots, lots, lineage, distributed, exposedLots, product, model, recallRng, detectionDay, trueIllnesses, isAllergen });
    }

    const chronologicalLineage = lineage
      .slice()
      .sort((left, right) => (left.timeHours || 0) - (right.timeHours || 0) || left.eventOrdinal - right.eventOrdinal)
      .map((event, sequence) => Object.freeze({ ...event, sequence }));
    const transitEvents = chronologicalLineage.filter((event) => event.cte === 'shipping');
    const refrigerationFailures = transitEvents.filter((event) => event.reeferFailed).length;
    return Object.freeze({
      schema: 'simulatte.foodRecallRun.v1', engineVersion: ENGINE_VERSION,
      scenarioId: scenario.id, scenarioKind: scenario.kind, seed: scenario.seed,
      lotCount: lots.size, eventCount: chronologicalLineage.length,
      trueIllnesses, observedCases: observed, detectionDay: Number(detectionDay.toFixed(2)),
      exposureDelayDays: Number((exposureDelayHours / HOURS_PER_DAY).toFixed(3)),
      shipmentDurationHours: Number((transitEvents.reduce((sum, event) => sum + event.transitHours, 0)).toFixed(3)),
      refrigerationFailures,
      inputContext: Object.freeze({
        schema: 'simulatte.foodRecallAppliedInputs.v1',
        ambientTemperatureC: inputs.ambientTemperatureC,
        logisticsDelayHours: inputs.logisticsDelayHours,
        logisticsAvailability: inputs.logisticsAvailability,
        refrigerationSetpointC: inputs.refrigerationSetpointC,
        refrigerationTimeConstantHours: inputs.refrigerationTimeConstantHours,
        refrigerationFailureRateMultiplier: inputs.refrigerationFailureRateMultiplier,
        fieldIdentities: Object.freeze(inputs.fieldIdentities.slice()),
      }),
      distributedLots: distributed.length,
      contaminatedOriginLots: trueSourceIds.length,
      traceback: Object.freeze(traceback.slice(0, 5)),
      trueSourceRank: trueSourceRank || null,
      recall,
      lineage: Object.freeze(chronologicalLineage),
      lots: Object.freeze([...lots.values()].map((lot) => Object.freeze({
        tlcId: lot.tlcId,
        stage: lot.stage,
        massKg: Number(lot.massKg.toFixed(2)),
        totalLoadCfu: Math.round(lot.totalLoadCfu),
        parentTlcIds: lot.parentTlcIds,
        contaminated: !!lot.contaminatedAtOrigin,
        cumulativeTransitHours: Number((lot.cumulativeTransitHours || 0).toFixed(3)),
      }))),
      randomStreams: Object.freeze([contaminationRng, shipmentRng, reeferRng, consumerRng, surveillanceRng, recallRng].map((s) => s.receipt())),
    });
  }

  function normalizeInputs(inputContext) {
    const engineInputs = inputContext?.engineInputs || inputContext || {};
    return Object.freeze({
      ambientTemperatureC: Number(engineInputs.ambientTemperatureC ?? 20),
      logisticsDelayHours: Math.max(0, Number(engineInputs.logisticsDelayHours ?? 0)),
      logisticsAvailability: Math.max(0, Math.min(1, Number(engineInputs.logisticsAvailability ?? 1))),
      refrigerationSetpointC: Number(engineInputs.refrigerationSetpointC ?? 3.5),
      refrigerationTimeConstantHours: Math.max(0.1, Number(engineInputs.refrigerationTimeConstantHours ?? 6)),
      refrigerationFailureRateMultiplier: Math.max(0, Number(engineInputs.refrigerationFailureRateMultiplier ?? 1)),
      forcedColdChainFailure: inputContext?.refrigeration?.forcedFailure || null,
      fieldIdentities: [
        inputContext?.weather?.fieldIdentity,
        inputContext?.logistics?.fieldIdentity,
        inputContext?.refrigeration?.fieldIdentity,
      ].filter(Boolean),
    });
  }

  function scoreTraceback(originLots, exposedLots, lineage, model, rng) {
    const descendantsOf = buildDescendantIndex(lineage);
    const exposedSet = new Set(exposedLots.map((row) => row.tlcId));
    return originLots.map((lot) => {
      const reach = descendantsOf.get(lot.tlcId) || new Set();
      let score = 0;
      exposedLots.forEach((row) => { if (reach.has(row.tlcId) || row.tlcId === lot.tlcId) score += row.illnesses; });
      const facility = model.facilityById.get(lot.facilityId);
      const missingness = 1 - (facility?.traceability?.recordCompletenessPrior ?? 0.9);
      return { candidateId: lot.tlcId, facilityId: lot.facilityId, score: Number((score * (1 - 0.5 * missingness)).toFixed(2)), recordCompleteness: facility?.traceability?.recordCompletenessPrior ?? null };
    }).sort((left, right) => right.score - left.score || left.candidateId.localeCompare(right.candidateId));
  }

  function buildDescendantIndex(lineage) {
    const children = new Map();
    lineage.forEach((event) => {
      (event.parents || []).forEach((parent) => {
        if (!children.has(parent)) children.set(parent, new Set());
        children.get(parent).add(event.tlcId);
      });
    });
    const memo = new Map();
    function descendants(id) {
      if (memo.has(id)) return memo.get(id);
      const out = new Set();
      memo.set(id, out);
      (children.get(id) || new Set()).forEach((child) => { out.add(child); descendants(child).forEach((row) => out.add(row)); });
      return out;
    }
    const index = new Map();
    lineage.forEach((event) => index.set(event.tlcId, descendants(event.tlcId)));
    return index;
  }

  function runRecall({ intervention, originLots, lots, lineage, distributed, exposedLots, product, model, recallRng, detectionDay, trueIllnesses, isAllergen }) {
    const descendantsOf = buildDescendantIndex(lineage);
    const targets = originLots.filter((lot) => lot.contaminatedAtOrigin).map((lot) => lot.tlcId);
    const recalledLotIds = new Set(targets);
    targets.forEach((target) => (descendantsOf.get(target) || new Set()).forEach((id) => recalledLotIds.add(id)));

    const distributedById = new Map(distributed.map((lot) => [lot.tlcId, lot]));
    const contaminatedDistributed = distributed.filter((lot) => lot.contaminatedAtOrigin);
    let contaminatedUnitsDistributed = 0;
    let contaminatedUnitsRemoved = 0;
    let cleanUnitsRemoved = 0;
    // Notification success falls with recall depth and consignee response probability.
    const responseProbability = intervention.depth === 'consumer' ? 0.62 : 0.82;
    // Fraction of product still in inventory (not yet consumed) at recall time.
    const inInventoryFraction = Math.max(0, Math.min(1, 1 - detectionDay / (intervention.dayOffset + detectionDay + 6)));

    distributed.forEach((lot) => {
      const units = Math.max(1, Math.round(lot.massKg / product.defaultUnitMassKg));
      const isContaminated = lot.contaminatedAtOrigin;
      if (isContaminated) contaminatedUnitsDistributed += units;
      if (!recalledLotIds.has(lot.tlcId)) return; // out of recall scope
      const recoverable = units * inInventoryFraction;
      const recovered = Math.round(recoverable * (recallRng.next() < responseProbability ? responseProbability : responseProbability * 0.5));
      if (isContaminated) contaminatedUnitsRemoved += Math.min(units, recovered);
      else cleanUnitsRemoved += recovered;
    });

    const sensitivity = contaminatedUnitsDistributed ? contaminatedUnitsRemoved / contaminatedUnitsDistributed : null;
    const precision = (contaminatedUnitsRemoved + cleanUnitsRemoved) ? contaminatedUnitsRemoved / (contaminatedUnitsRemoved + cleanUnitsRemoved) : null;
    // Cases averted: illnesses prevented ∝ contaminated units removed before consumption.
    const casesAverted = Math.round(trueIllnesses * (sensitivity || 0) * inInventoryFraction);

    return Object.freeze({
      schema: 'simulatte.foodRecallIntervention.v1',
      targetTlcIds: Object.freeze(targets),
      recalledLotCount: recalledLotIds.size,
      depth: intervention.depth, scope: intervention.scope, dayOffset: intervention.dayOffset,
      contaminatedUnitsDistributed, contaminatedUnitsRemoved, cleanUnitsRemoved,
      recallSensitivity: sensitivity === null ? null : Number(sensitivity.toFixed(3)),
      recallPrecision: precision === null ? null : Number(precision.toFixed(3)),
      safeFoodWasteUnits: cleanUnitsRemoved,
      casesAverted,
      inInventoryFraction: Number(inInventoryFraction.toFixed(3)),
    });
  }

  function engineError(code, message, evidence) {
    const error = new Error(`${code}: ${message}`);
    error.name = 'SimulatteFoodRecallEngineError';
    error.code = code;
    error.evidence = evidence;
    return error;
  }

  return { ENGINE_VERSION, compileModel, runScenario, transform, splitLot, doseResponse, growLoad, thermalReduction };
});
