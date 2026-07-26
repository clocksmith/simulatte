(function attachInterstellarOperationsModel(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.InterstellarOperationsModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createInterstellarOperationsModel() {
  function simulateEnsemble({ seed, channelReceipts, packetBits, processingDelayHours, controls }) {
    validateControls(controls);
    const samples = Array.from({ length: controls.ensembleSize }, (_, sampleIndex) => (
      simulateSample({
        random: seededRandom(`${seed}:operations:${sampleIndex}`),
        sampleIndex,
        channelReceipts,
        packetBits,
        processingDelayHours,
        controls,
      })
    ));
    const successful = samples.filter((row) => row.delivered);
    const latencyValues = successful.map((row) => row.totalLatencySeconds).sort((a, b) => a - b);
    const medianLatency = latencyValues.length ? quantile(latencyValues, 0.5) : null;
    const representativePool = successful.length ? successful : samples;
    const representative = representativePool.slice().sort((left, right) => (
      Math.abs(left.totalLatencySeconds - (medianLatency ?? left.totalLatencySeconds))
      - Math.abs(right.totalLatencySeconds - (medianLatency ?? right.totalLatencySeconds))
      || left.sampleIndex - right.sampleIndex
    ))[0];
    return deepFreeze({
      schema: 'simulatte.interstellarOperationsEnsemble.v1',
      seed,
      ensembleSize: samples.length,
      deliveredCount: successful.length,
      deliveryProbability: successful.length / samples.length,
      latencySeconds: {
        p10: latencyValues.length ? quantile(latencyValues, 0.1) : null,
        p50: medianLatency,
        p90: latencyValues.length ? quantile(latencyValues, 0.9) : null,
      },
      meanRetryCount: mean(samples.map((row) => row.retryCount)),
      meanOutageCount: mean(samples.map((row) => row.outageCount)),
      meanMaintenanceCount: mean(samples.map((row) => row.maintenanceCount)),
      meanAcquisitionDelayHours: mean(samples.map((row) => row.acquisitionDelaySeconds / 3600)),
      representative,
      modeledEffectIds: [
        'acquisition-modeled',
        'availability-and-outages-modeled',
        'maintenance-modeled',
        'hardware-failure-and-repair-modeled',
        'retries-modeled',
        'queue-delay-modeled',
        'dust-and-plasma-attenuation-modeled',
        'detector-background-noise-modeled',
      ],
      remainingLimitations: [{
        id: 'infrastructure-not-observed',
        label: 'Relay infrastructure is hypothetical',
        effect: 'Deployment, custody, and continuous operation are scenario assumptions.',
        affects: ['availability', 'reliability', 'constructibility'],
      }],
      samples,
      truth: {
        origin: 'simulated',
        temporalStatus: 'forecast',
        uncertainty: {
          kind: 'distribution',
          value: {
            family: 'seeded-operational-monte-carlo',
            sampleCount: samples.length,
            parameterSource: 'interstellar.operations.models.v1',
          },
        },
      },
    });
  }

  function simulateSample({
    random,
    sampleIndex,
    channelReceipts,
    packetBits,
    processingDelayHours,
    controls,
  }) {
    const hops = [];
    let totalLatencySeconds = 0;
    let delivered = true;
    let retryCount = 0;
    let outageCount = 0;
    let maintenanceCount = 0;
    let acquisitionDelaySeconds = 0;
    for (let hopIndex = 0; hopIndex < channelReceipts.length; hopIndex += 1) {
      const channel = channelReceipts[hopIndex];
      const acquisitionSeconds = exponential(random, controls.acquisitionMeanHours * 3600);
      const queueDelaySeconds = exponential(random, controls.queueMeanDelayHours * 3600);
      const maintenance = random() < controls.maintenanceDurationHours
        / Math.max(controls.maintenanceIntervalHours, controls.maintenanceDurationHours);
      const maintenanceSeconds = maintenance ? controls.maintenanceDurationHours * 3600 : 0;
      const outage = random() > controls.dutyCycle;
      const repairSeconds = outage ? exponential(random, controls.meanRepairHours * 3600) : 0;
      const informationRate = channel.effectiveDataRateGbps * 1e9;
      const transmitSeconds = packetBits / informationRate;
      const hardwareFailureProbability = 1 - Math.exp(
        -(transmitSeconds / 3600) / controls.meanTimeBetweenFailuresHours,
      );
      let attempts = 0;
      let succeeded = false;
      while (attempts <= controls.retryLimit && !succeeded) {
        attempts += 1;
        const channelSuccess = random() <= channel.packetSuccessProbability;
        const hardwareSuccess = random() > hardwareFailureProbability;
        succeeded = channelSuccess && hardwareSuccess;
      }
      const retries = attempts - 1;
      const retryDelaySeconds = retries * (transmitSeconds + acquisitionSeconds);
      const hopDelay = acquisitionSeconds + queueDelaySeconds + maintenanceSeconds
        + repairSeconds + retryDelaySeconds;
      totalLatencySeconds += hopDelay + transmitSeconds + channel.latencySeconds;
      if (hopIndex < channelReceipts.length - 1) totalLatencySeconds += processingDelayHours * 3600;
      retryCount += retries;
      outageCount += outage ? 1 : 0;
      maintenanceCount += maintenance ? 1 : 0;
      acquisitionDelaySeconds += acquisitionSeconds;
      hops.push({
        hopIndex,
        acquisitionSeconds,
        queueDelaySeconds,
        maintenanceSeconds,
        repairSeconds,
        retryCount: retries,
        retryDelaySeconds,
        transmitSeconds,
        success: succeeded,
      });
      if (!succeeded) {
        delivered = false;
        break;
      }
    }
    return {
      sampleIndex,
      delivered,
      totalLatencySeconds,
      retryCount,
      outageCount,
      maintenanceCount,
      acquisitionDelaySeconds,
      hops,
    };
  }

  function validateControls(value) {
    const finite = [
      ['ensembleSize', 8, 512],
      ['acquisitionMeanHours', 0, 8760],
      ['dutyCycle', 0.001, 1],
      ['meanTimeBetweenFailuresHours', 1, 1e9],
      ['meanRepairHours', 0, 87600],
      ['maintenanceIntervalHours', 1, 1e9],
      ['maintenanceDurationHours', 0, 8760],
      ['retryLimit', 0, 20],
      ['queueMeanDelayHours', 0, 8760],
    ];
    finite.forEach(([key, minimum, maximum]) => {
      if (!Number.isFinite(value[key]) || value[key] < minimum || value[key] > maximum) {
        throw operationsError('interstellar_operations_control_invalid', key);
      }
    });
    if (!Number.isInteger(value.ensembleSize) || !Number.isInteger(value.retryLimit)) {
      throw operationsError('interstellar_operations_integer_control_invalid', 'ensembleSize/retryLimit');
    }
  }

  function seededRandom(seed) {
    let state = fnv1a(seed);
    return () => {
      state += 0x6d2b79f5;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }
  function fnv1a(text) {
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }
  function exponential(random, meanValue) {
    return meanValue <= 0 ? 0 : -Math.log(Math.max(1e-12, 1 - random())) * meanValue;
  }
  function quantile(values, fraction) {
    return values[Math.min(values.length - 1, Math.floor((values.length - 1) * fraction))];
  }
  function mean(values) {
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  }
  function operationsError(code, detail) {
    const error = new Error(`${code}: ${detail}`);
    error.code = code;
    return error;
  }
  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  }

  return Object.freeze({ simulateEnsemble });
});
