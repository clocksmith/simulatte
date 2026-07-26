(function attachQueueEngine(root, factory) {
  const api = factory();
  root.MaritimeQueueEngine = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createQueueEngineModule() {
  function simulatePortQueue({
    portId,
    arrivalCount = 20,
    serverCount = 3,
    arrivalRatePerHour = 0.4,
    serviceMeanHours = 8,
    serviceSigma = 0.5,
    disruptionMultiplier = 1,
    random = null,
  }) {
    validateInputs({ portId, arrivalCount, serverCount, arrivalRatePerHour, serviceMeanHours, serviceSigma, disruptionMultiplier });
    const rng = random || fallbackRandom(portId);
    const serverAvailable = Array(serverCount).fill(0);
    const rows = [];
    let arrivalAt = 0;
    for (let index = 0; index < arrivalCount; index += 1) {
      arrivalAt += rng.exponential(arrivalRatePerHour);
      let serverIndex = 0;
      for (let candidate = 1; candidate < serverAvailable.length; candidate += 1) {
        if (serverAvailable[candidate] < serverAvailable[serverIndex]) serverIndex = candidate;
      }
      const serviceStart = Math.max(arrivalAt, serverAvailable[serverIndex]);
      const waitHours = serviceStart - arrivalAt;
      const mu = Math.log(serviceMeanHours) - (serviceSigma * serviceSigma) / 2;
      const serviceHours = Math.max(0.25, rng.lognormal(mu, serviceSigma) * disruptionMultiplier);
      const serviceEnd = serviceStart + serviceHours;
      serverAvailable[serverIndex] = serviceEnd;
      rows.push(Object.freeze({
        id: `${portId}:queue:${index}`,
        vesselId: `vessel-${portId}-${index + 1}`,
        arrivalHour: arrivalAt,
        serviceStartHour: serviceStart,
        serviceEndHour: serviceEnd,
        waitHours,
        serviceHours,
        serverIndex,
      }));
    }
    const waits = rows.map((row) => row.waitHours).sort((left, right) => left - right);
    const finalClock = Math.max(...serverAvailable, 1);
    const occupiedHours = rows.reduce((sum, row) => sum + row.serviceHours, 0);
    return Object.freeze({
      schema: 'simulatte.maritimePortQueue.v2',
      portId,
      serverCount,
      vesselCount: rows.length,
      averageWaitHours: average(waits),
      p50WaitHours: percentile(waits, 0.5),
      p95WaitHours: percentile(waits, 0.95),
      maximumWaitHours: waits.at(-1) || 0,
      utilization: occupiedHours / Math.max(1, serverCount * finalClock),
      parameters: Object.freeze({
        arrivalDistribution: 'exponential',
        arrivalRatePerHour,
        serviceDistribution: 'lognormal',
        serviceMeanHours,
        serviceSigma,
        disruptionMultiplier,
        discipline: 'first_come_first_served',
      }),
      truth: truth('simulated', 'forecast', {
        kind: 'distribution',
        value: { family: 'single_replicate', sampleCount: arrivalCount },
      }),
      evidenceRefs: Object.freeze([
        `row:container-port-performance-v1:${portId}`,
        'model:fcfs-multi-server-queue-v2',
      ]),
      rows: Object.freeze(rows),
    });
  }

  function simulateQueueEnsemble({
    portId,
    replicates,
    randomForReplicate,
    calibration = null,
    ...parameters
  }) {
    if (!Number.isInteger(replicates) || replicates < 2 || replicates > 512) {
      throw new Error('maritime_queue_replicates_invalid');
    }
    const runs = Array.from({ length: replicates }, (_, index) => simulatePortQueue({
      portId,
      ...parameters,
      random: randomForReplicate ? randomForReplicate(index) : fallbackRandom(`${portId}:${index}`),
    }));
    const waits = runs.map((row) => row.averageWaitHours).sort((left, right) => left - right);
    const p50WaitHours = percentile(waits, 0.5);
    const selectedIndex = runs.reduce((best, row, index) => (
      Math.abs(row.averageWaitHours - p50WaitHours) < Math.abs(runs[best].averageWaitHours - p50WaitHours) ? index : best
    ), 0);
    return Object.freeze({
      schema: 'simulatte.maritimeQueueEnsemble.v1',
      portId,
      replicateCount: replicates,
      p05WaitHours: percentile(waits, 0.05),
      p50WaitHours,
      p95WaitHours: percentile(waits, 0.95),
      meanWaitHours: average(waits),
      selectedReplicate: runs[selectedIndex],
      calibration: Object.freeze({
        artifactId: calibration?.id || null,
        status: calibration?.status || 'not_declared',
        inputRowIdentity: calibration?.inputRowIdentity || null,
        limitationCount: calibration?.limitations?.length || 0,
      }),
      uncertaintyClass: 'stochastic_simulation',
      truth: truth('simulated', 'forecast', {
        kind: 'distribution',
        value: {
          family: 'empirical_seeded_ensemble',
          sampleCount: replicates,
          quantiles: Object.freeze([0.05, 0.5, 0.95]),
        },
      }),
      evidenceRefs: Object.freeze([
        `row:container-port-performance-v1:${portId}`,
        ...(calibration?.id ? [
          'dataset:maritime.calibration.artifacts.v1',
          `row:maritime.calibration.artifacts.v1:${calibration.id}`,
        ] : []),
        'model:fcfs-multi-server-queue-v2',
      ]),
      runs: Object.freeze(runs),
    });
  }

  function validateInputs(value) {
    if (!value.portId
      || !Number.isInteger(value.arrivalCount)
      || value.arrivalCount < 0
      || !Number.isInteger(value.serverCount)
      || value.serverCount < 1
      || !(value.arrivalRatePerHour > 0)
      || !(value.serviceMeanHours > 0)
      || !(value.serviceSigma >= 0)
      || !(value.disruptionMultiplier > 0)) {
      throw new Error('maritime_queue_input_invalid');
    }
  }

  function fallbackRandom(seedText) {
    let state = stableHash(seedText) || 1;
    const next = () => {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      return (state >>> 0) / 4294967296;
    };
    return {
      exponential(rate) {
        let value = 0;
        while (!value) value = next();
        return -Math.log(value) / rate;
      },
      lognormal(mu, sigma) {
        let first = 0;
        let second = 0;
        while (!first) first = next();
        while (!second) second = next();
        return Math.exp(mu + sigma * Math.sqrt(-2 * Math.log(first)) * Math.cos(2 * Math.PI * second));
      },
    };
  }

  function stableHash(value) {
    let hash = 2166136261;
    for (const character of String(value)) {
      hash ^= character.codePointAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function average(rows) {
    return rows.length ? rows.reduce((sum, row) => sum + row, 0) / rows.length : 0;
  }

  function percentile(rows, probability) {
    if (!rows.length) return 0;
    return rows[Math.min(rows.length - 1, Math.max(0, Math.ceil(probability * rows.length) - 1))];
  }

  function truth(origin, temporalStatus, uncertainty) {
    return Object.freeze({ origin, temporalStatus, uncertainty: Object.freeze(uncertainty) });
  }

  return Object.freeze({ simulatePortQueue, simulateQueueEnsemble });
});
