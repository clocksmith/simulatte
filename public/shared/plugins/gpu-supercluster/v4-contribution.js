(function attachGpuSuperclusterV4(root, factory) {
  const builder = typeof module === 'object' && module.exports
    ? require('../../core/simulation/plugin-v4-builder.js')
    : root.SimulattePluginV4Builder;
  const api = factory(builder);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteGpuSuperclusterV4 = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createGpuSuperclusterV4(builder) {
  const PLUGIN_ID = 'gpu-supercluster';
  const MODEL_DATASET_ID = 'repository-models:gpu-supercluster-v1';
  const MODEL_HASHES = Object.freeze({
    topology: '5f78aa4c2521d92c926e5a6c038949424cd8d665121bc9dad72a918caf1034f7',
    collectives: '2ae62813d8249f7972ba7c7d0aa3decd47d9c901c22f74572a1a787ba0cecef5',
    thermals: 'afabd35b2bba5a587d061c2e5303920de6077419abc5a4c491e3ebe590826548',
  });
  const STAGES = Object.freeze([
    'forward-pass',
    'backward-gradients',
    'allreduce-sync',
    'thermal-settlement',
  ]);

  function createContribution({ result, step = 0 }) {
    const boundedStep = Math.max(0, Math.min(STAGES.length, Number(step) || 0));
    const { topology, collectives, thermals } = result;
    const records = modelRecords(result.receipt.seed);
    const modeled = builder.provenance({
      origin: 'simulated',
      temporalStatus: 'forecast',
      uncertainty: {
        kind: 'interval',
        value: {
          interpretation: 'Deterministic scenario-model interval; not observed facility telemetry.',
          stepTimeMs: [collectives.stepTimeMs * 0.95, collectives.stepTimeMs * 1.05],
          peakJunctionTempC: [thermals.peakJunctionTempC - 2, thermals.peakJunctionTempC + 2],
        },
      },
      records,
    });
    const gpuById = new Map(topology.gpus.map((gpu) => [gpu.id, gpu]));
    const thermalByRack = new Map(thermals.racks.map((rack) => [rack.rackIndex, rack]));
    const rackLayers = topology.racks.map((rack) => {
      const thermal = thermalByRack.get(rack.rackIndex);
      return builder.layer({
        id: `rack:${rack.id}`,
        kind: 'point',
        label: `${rack.id} · ${thermal?.avgTempC ?? 0}°C`,
        geometry: builder.geometry('point', 'datacenter-cartesian-meters', [[rack.xM, rack.yM, rack.zM]]),
        quantity: builder.quantity('modeled-rack-temperature', thermal?.avgTempC || 0, 'C', [0, 150]),
        role: thermal?.isThrottled ? 'event' : 'primary',
        importance: thermal?.isThrottled ? 1 : 0.72,
        aggregationKey: null,
        provenance: modeled,
      });
    });
    const networkLayers = topology.links
      .filter((link) => link.type === 'infiniband-rail')
      .map((link) => {
        const source = gpuById.get(link.sourceGpuId);
        const target = gpuById.get(link.targetGpuId);
        return builder.layer({
          id: `link:${link.id}`,
          kind: 'path',
          label: `${link.type}: ${link.bandwidthGbps} Gbps modeled bandwidth`,
          geometry: builder.geometry('polyline', 'datacenter-cartesian-meters', [
            [source.xM, source.yM, source.zM],
            [target.xM, target.yM, target.zM],
          ]),
          quantity: builder.quantity('modeled-link-bandwidth', link.bandwidthGbps, 'Gbps', [0, 3600]),
          role: 'context',
          importance: 0.42,
          aggregationKey: 'gpu-supercluster-links',
          provenance: modeled,
        });
      });
    const eventIds = STAGES.map((stage) => `${PLUGIN_ID}:${stage}`);
    const events = STAGES.slice(0, boundedStep).map((stage, sequence) => builder.event({
      id: eventIds[sequence],
      pluginId: PLUGIN_ID,
      sequence,
      simulationTimeMs: (sequence + 1) * 1000,
      kind: `${PLUGIN_ID}.${stage}`,
      causationIds: sequence ? [eventIds[sequence - 1]] : [],
      correlationId: `${PLUGIN_ID}:${result.receipt.seed}`,
      payload: stagePayload(stage, collectives, thermals),
      provenance: modeled,
    }));
    const presentation = builder.presentation({
      pluginId: PLUGIN_ID,
      coordinateSystem: 'datacenter-cartesian-meters',
      layers: [...rackLayers, ...networkLayers],
      viewIntents: [builder.viewIntent({
        id: `${PLUGIN_ID}:overview`,
        mode: 'overview',
        targetIds: rackLayers.map((layer) => layer.id),
        reasonEventId: events.at(-1)?.id || null,
        priority: 75,
      })],
    });
    const controls = builder.controls([
      selectControl('collectiveAlgorithm', 'Collective algorithm', result.config.collectiveAlgorithm, [
        option('ring-allreduce', 'Ring AllReduce'),
        option('tree-allreduce', 'Tree AllReduce'),
        option('2d-torus-all-to-all', '2D torus all-to-all'),
      ], modeled),
      numberControl('tensorSizeGb', 'Tensor size (GB)', result.config.tensorSizeGb, 0.1, 1000, 0.1, modeled),
      numberControl('stragglerThrottlePercent', 'Slowest GPU slowdown (%)', result.config.stragglerThrottlePercent, 0, 95, 1, modeled),
      numberControl('coolantFlowLpm', 'Coolant flow (L/min)', result.config.coolantFlowLpm, 10, 1000, 1, modeled),
      numberControl('linkPacketDropRate', 'Link packet drop rate (fraction)', result.config.linkPacketDropRate, 0, 0.5, 0.001, modeled),
      numberControl('cduFlowDegradationPercent', 'Cooling flow loss (%)', result.config.cduFlowDegradationPercent, 0, 90, 1, modeled),
    ], [{
      id: 'nominal-vs-degraded-cluster',
      label: 'Nominal cluster versus selected degradation scenario',
      baselineScenarioId: 'gpt4-3d-parallelism',
      variantScenarioId: result.receipt.seed,
      synchronizedClock: true,
    }]);
    const state = builder.state({
      id: `${PLUGIN_ID}:state:${result.receipt.seed}:${boundedStep}`,
      pluginId: PLUGIN_ID,
      simulationTimeMs: boundedStep * 1000,
      status: boundedStep === 0 ? 'ready' : boundedStep === STAGES.length ? 'settled' : 'running',
      previousStateId: boundedStep ? `${PLUGIN_ID}:state:${result.receipt.seed}:${boundedStep - 1}` : null,
      eventIds: events.map((event) => event.id),
      measures: [
        builder.quantity('cluster-tflops', collectives.effectiveClusterTflops, 'TFLOP/s'),
        builder.quantity('model-flops-utilization', collectives.modelFlopsUtilization, 'percent', [0, 100]),
        builder.quantity('allreduce-latency-ms', collectives.commTimeMs, 'ms'),
        builder.quantity('peak-gpu-temp-c', thermals.peakJunctionTempC, 'C', [0, 150]),
        builder.quantity('cooling-pue', thermals.pue, 'multiple', [1, 3]),
      ],
      provenance: modeled,
    });
    return builder.contribution({
      pluginId: PLUGIN_ID,
      presentation,
      events,
      controls,
      state,
      inspections: [{
        id: `${PLUGIN_ID}:inspection:cluster`,
        label: 'Modeled cluster result',
        targetIds: rackLayers.map((layer) => layer.id),
        fields: [
          field('scenario-seed', 'Executed scenario seed', result.receipt.seed, 'seed', modeled),
          field('gpu-count', 'Modeled GPUs', topology.totalGpus, 'GPUs', modeled),
          field('packet-drop', 'Applied packet drop rate', result.config.linkPacketDropRate * 100, 'percent', modeled),
          field('coolant-flow', 'Applied coolant flow', result.config.coolantFlowLpm, 'L/min', modeled),
          field('step-time', 'Modeled step time', collectives.stepTimeMs, 'ms', modeled),
          field('peak-temperature', 'Modeled peak junction temperature', thermals.peakJunctionTempC, 'C', modeled),
          field('throttled-gpus', 'Modeled throttled GPUs', thermals.throttledGpuCount, 'GPUs', modeled),
          field('thermal-clock', 'Modeled thermal clock cap', thermals.thermalClockFraction * 100, 'percent', modeled),
        ],
      }],
      provenanceRecords: records,
    });
  }

  function modelRecords(seed) {
    return Object.entries(MODEL_HASHES).map(([name, contentHash]) => builder.modelRecord({
      id: `${PLUGIN_ID}:model:${name}-v1`,
      datasetId: MODEL_DATASET_ID,
      contentHash,
      metadata: {
        name,
        version: '1.0.0',
        claimBoundary: 'Repository-authored deterministic model; not physical GPU or facility evidence.',
      },
      lineage: {
        axes: {
          origin: 'modeled',
          temporalStatus: 'forecast',
          uncertainty: { kind: 'missing', value: { reason: 'No empirical facility calibration is attached.' } },
        },
        contentVersion: '1.0.0',
        scenarioEpoch: `seed:${seed}`,
        license: { required: false, identifier: null },
      },
    }));
  }

  function stagePayload(stage, collectives, thermals) {
    if (stage === 'allreduce-sync') return { commTimeMs: collectives.commTimeMs, algorithm: collectives.algorithm };
    if (stage === 'thermal-settlement') return { peakJunctionTempC: thermals.peakJunctionTempC, throttledGpuCount: thermals.throttledGpuCount };
    return { computeTimeMs: collectives.computeTimeMs, stage };
  }

  function option(value, label) { return { value, label }; }
  function selectControl(id, label, value, options, provenance) {
    return { id, label, kind: 'select', value, options, minimum: null, maximum: null, step: null, provenance };
  }
  function numberControl(id, label, value, minimum, maximum, step, provenance) {
    return { id, label, kind: 'number', value, options: null, minimum, maximum, step, provenance };
  }
  function field(id, label, value, unit, provenance) { return { id, label, value, unit, provenance }; }

  return Object.freeze({ createContribution });
});
