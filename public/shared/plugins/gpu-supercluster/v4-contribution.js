(function attachGpuSuperclusterV4(root, factory) {
  const builder = typeof module === 'object' && module.exports
    ? require('../../core/simulation/plugin-v4-builder.js')
    : root.SimulattePluginV4Builder;
  const workloadApi = typeof module === 'object' && module.exports ? require('./workload.js') : root.SimulatteClusterWorkload;
  const api = factory(builder,workloadApi);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteGpuSuperclusterV4 = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createGpuSuperclusterV4(builder,workloadApi) {
  const PLUGIN_ID = 'gpu-supercluster';
  const MODEL_DATASET_ID = 'repository-models:gpu-supercluster-v1';
  const MODEL_HASHES = Object.freeze({
    workload: 'a3d065e7541cf4a592fc5fa98d8eed8915657d696db326d6983c3017e4e95406',
    topology: 'cd13b2f7dd6116a1cfa129f07994671ee574964f37500bd8b5d47cd401207112',
    collectives: 'fb3aa8a8c8d6c3ad295da8153fe9f00d5d704211fea20bd5aa6464f70a0c5b5f',
    thermals: 'afabd35b2bba5a587d061c2e5303920de6077419abc5a4c491e3ebe590826548',
  });
  function createContribution({ result, step = 0, workload = null }) {
    const boundedStep = workload ? step : 0;
    const { topology, collectives, thermals } = result;
    const rackTimeMs = (workload?.timeMs || 0) * topology.racks.length;
    const efficiency = rackTimeMs > 0 ? workload.computeEquivalentMs / rackTimeMs : 0;
    const throughput = collectives.totalPeakClusterTflops * efficiency * (1 - collectives.bubbleFraction) * thermals.thermalClockFraction;
    const elapsed = workload?.timeMs || 0;
    const executed = workload ? workloadApi.compareExecuted(result,workload) : null;
    const tasks = { compute:0, communication:0, waiting:0 };
    for (const rack of workload?.racks || []) tasks[rack.task === 'allreduce' ? 'communication' : rack.task === 'waiting' ? 'waiting' : 'compute']++;
    const context = `Now: ${tasks.compute} computing · ${tasks.communication} communicating · ${tasks.waiting} waiting. Cyan/green: compute · Violet: transfer · Amber: waiting.`;
    const measurement = (label, definition, timeBasis = 'accumulated') => ({label, subject:'All modeled GPU racks', definition, timeBasis,
      interval:{start:0,end:timeBasis === 'configured' ? 0 : elapsed,unit:'ms'}, validity:timeBasis !== 'configured' && !elapsed ? 'not-sampled' : 'valid', freshness:'current',context});
    const records = modelRecords(result.receipt.seed);
    const modeled = builder.provenance({
      origin: 'simulated',
      temporalStatus: 'forecast',
      uncertainty: {
        kind: 'missing',
        value: { reason: 'Analytical scenario only; no independent hardware calibration or prediction interval is available.' },
      },
      records,
    });
    const gpuById = new Map(topology.gpus.map((gpu) => [gpu.id, gpu]));
    const rackById = new Map(topology.racks.map(rack => [rack.id, rack]));
    const displayPath = (from, to) => networkPath(rackById.get(from.rackId), rackById.get(to.rackId), topology);
    const thermalByRack = new Map(thermals.racks.map((rack) => [rack.rackIndex, rack]));
    const waitingByRack = new Map((workload?.racks || []).map(rack => [rack.id, []]));
    for (const rack of workload?.racks || []) for (const dependency of rack.waitingFor) waitingByRack.get(dependency)?.push(rack.id);
    const rackLayers = topology.racks.map((rack) => {
      const thermal = thermalByRack.get(rack.rackIndex);
      const task = workload?.racks.find(row => row.id === rack.id);
      return builder.layer({
        id: `rack:${rack.id}`,
        kind: 'point',
        label: `Rack ${rack.id}`,
        geometry: builder.geometry('point', 'cluster-network-layout', [networkPosition(rack, topology)]),
        quantity: task ? builder.quantity(`workload-rack-${task.task}`,100*(task.task==='allreduce'?workload.communication:task.work),'percent',[0,100]) : builder.quantity('modeled-rack-temperature', thermal?.avgTempC || 0, 'C', [0, 150]),
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
          label: `${source.rackId} ↔ ${target.rackId}`,
          geometry: builder.geometry('polyline', 'cluster-network-layout', displayPath(source, target)),
          quantity: builder.quantity('modeled-link-bandwidth', link.bandwidthGbps, 'Gbps', [0, 3600]),
          role: workload?.activeLinkIds.includes(link.id) ? 'primary' : 'context',
          importance: workload?.activeLinkIds.includes(link.id) ? 0.9 : 0.3,
          aggregationKey: 'gpu-supercluster-links',
          provenance: modeled,
        });
      });
    const tensorLayers = (workload?.transfers || []).filter(t => topology.links.some(l => l.id === t.id && l.type === 'infiniband-rail')).map(t => {
      const from = gpuById.get(t.from), to = gpuById.get(t.to);
      return builder.layer({
        id: `transfer:${t.id}:${t.from}`, kind: 'actor',
        label: `Collective round ${workload.collectiveRound + 1} · ${Math.round(t.progress * 100)}%`,
        geometry: builder.geometry('polyline', 'cluster-network-layout', displayPath(from, to)),
        quantity: builder.quantity('actor.tensor-gradient.route-progress',t.progress,'ratio',[0,1]),
        role:'event',importance:1,aggregationKey:null,provenance:modeled,
      });
    });
    const events = workload ? [builder.event({
      id:`${PLUGIN_ID}:tick:${workload.timeMs}`,pluginId:PLUGIN_ID,sequence:boundedStep,simulationTimeMs:workload.timeMs,
      kind:`${PLUGIN_ID}.${workload.communicating?'allreduce-sync':workload.racks.some(r=>r.task==='waiting')?'synchronization-wait':'forward-pass'}`,
      causationIds:[],correlationId:`${PLUGIN_ID}:${result.receipt.seed}`,payload:{iteration:workload.iteration,waitingRacks:workload.racks.filter(r=>r.task==='waiting').length},provenance:modeled,
    })] : [];
    const physical = new Map(rackLayers.map(layer=>{const rack=rackById.get(layer.id.slice(5));return [layer.id,builder.geometry('point','datacenter-cartesian-meters',[[rack.xM,rack.yM,rack.zM]])];}));
    for(const layer of networkLayers){const link=topology.links.find(row=>'link:'+row.id===layer.id);physical.set(layer.id,physicalLink(gpuById.get(link.sourceGpuId),gpuById.get(link.targetGpuId)));}
    for(const t of workload?.transfers || [])physical.set(`transfer:${t.id}:${t.from}`,physicalLink(gpuById.get(t.from),gpuById.get(t.to)));
    const allLayers=[...rackLayers,...networkLayers,...tensorLayers];
    const presentation = builder.presentation({
      layouts:[{id:'network',label:'Network layout',coordinateSystem:'cluster-network-layout',geometries:allLayers.map(row=>({id:row.id,geometry:row.geometry}))},
        {id:'physical',label:'Physical racks',coordinateSystem:'datacenter-cartesian-meters',geometries:allLayers.map(row=>({id:row.id,geometry:physical.get(row.id)}))}],
      pluginId: PLUGIN_ID,
      coordinateSystem: 'cluster-network-layout',
      layers: [...rackLayers, ...networkLayers, ...tensorLayers],
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
      label: 'Configured scenario: nominal versus selected degradation',
      baselineScenarioId: 'gpt4-3d-parallelism',
      variantScenarioId: result.receipt.seed,
      synchronizedClock: true,
    }, ...(workload ? [{id:'executed-rack-interventions',label:'Executed run: recorded rack actions versus no live actions',
      baselineScenarioId:result.receipt.seed,variantScenarioId:result.receipt.seed,synchronizedClock:true}] : [])]);
    const state = builder.state({
      id: `${PLUGIN_ID}:state:${result.receipt.seed}:${boundedStep}`,
      pluginId: PLUGIN_ID,
      simulationTimeMs: workload ? workload.timeMs : boundedStep * 1000,
      status: workload ? (workload.timeMs>=workload.durationMs?'settled':'running') : 'ready',
      previousStateId: boundedStep ? `${PLUGIN_ID}:state:${result.receipt.seed}:${boundedStep - 1}` : null,
      eventIds: events.map((event) => event.id),
      measures: [
        ...(workload ? [builder.quantity('training-iterations',workload.iteration,'iterations'),builder.quantity('synchronization-wait-ms',workload.totalWaitMs,'rack-ms')] : []),
        builder.quantity('compute-efficiency', efficiency * 100, 'percent', [0, 100], measurement('Productive compute share', 'Sum of computing rack milliseconds weighted by (1 − slowdown), divided by rack count × elapsed simulation milliseconds since start. Communication and barrier waiting contribute zero. This is not hardware utilization.')),
        builder.quantity('executed-compute-tflops', throughput, 'TFLOP/s', null, measurement('Compute (PFLOP/s)', 'Modeled average since start: peak cluster compute × productive compute share × pipeline non-bubble fraction × thermal clock fraction.')),
        builder.quantity('facility-power-kw', thermals.totalFacilityPowerKw, 'kW', null, measurement('Power (steady-state)', 'Configured steady-state facility power estimate, including cooling. This does not measure live consumption or respond to live rack faults.', 'configured')),
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
      objects: [...rackLayers, ...networkLayers].map(layer => {
        const rack = workload?.racks.find(row => layer.id === `rack:${row.id}`);
        return { id: layer.id, label: layer.label, inSelector: layer.id.startsWith('rack:'), selectionGroup:'links', relatedIds:rack ? waitingByRack.get(rack.id).map(id=>'rack:'+id) : [], condition: rack ? `${rack.task === 'waiting' ? 'Waiting for ' + rack.waitingFor.join(', ') : rack.task === 'allreduce' ? 'Communicating' : rack.task + ' compute'} · ${rack.slowdown}% slowdown` : 'Modeled physical connection', description: rack ? `${waitingByRack.get(rack.id).length} outlined racks currently wait for this rack. Over 0–${elapsed.toFixed(2)} ms, recorded actions changed total waiting by ${executed.differences.synchronizationWaitingRackMs.toFixed(2)} rack-ms and productive compute by ${executed.differences.productiveComputeRackMs.toFixed(2)} rack-ms versus no live actions. Completed ${executed.branches.intervention.completedIterations} iterations versus ${executed.branches.baseline.completedIterations}. ${executed.lastRestorationTimeMs===null?'No restoration recorded.':`Since restoration at ${executed.lastRestorationTimeMs.toFixed(2)} ms, additional waiting across racks is ${executed.racks.reduce((sum,row)=>sum+row.afterRestorationAdditionalWaitingMs,0).toFixed(2)} rack-ms.`} Restoring speed lets racks finish compute before the barrier releases.` : 'This modeled link carries gradients between its connected racks.',
          hit: { shape: rack || layer.id.startsWith('rack:') ? 'bounds' : 'path', radiusPx: 6, priority: layer.id.startsWith('rack:') ? 90 : 20 },
          actions: rack ? [{ id: 'straggler', label: rack.slowdown ? 'Restore rack' : 'Slow rack', targetId: layer.id,
            available: state.status !== 'settled', execution: 'continue', command: 'scenario.intervene',
            values: { rackId: rack.id, slowdown: rack.slowdown ? 0 : 95 },
            proposedChange: rack.slowdown ? 'Restore this rack’s compute speed.' : 'Reduce this rack’s compute speed by 95%; dependent racks may wait.' }] : [] };
      }),
      inspections: [{
        id: `${PLUGIN_ID}:inspection:cluster`,
        label: 'Configured steady-state estimates',
        targetIds: rackLayers.map((layer) => layer.id),
        fields: [
          field('network-layout', 'Network view', 'Torus arrangement of the physical node ring; not a torus interconnect or facility floor plan.', null, modeled),
          field('scenario-seed', 'Executed scenario seed', result.receipt.seed, 'seed', modeled),
          field('gpu-count', 'Modeled GPUs', topology.totalGpus, 'GPUs', modeled),
          field('packet-drop', 'Applied packet drop rate', result.config.linkPacketDropRate * 100, 'percent', modeled),
          field('coolant-flow', 'Applied coolant flow', result.config.coolantFlowLpm, 'L/min', modeled),
          field('step-time', 'Modeled step time', collectives.stepTimeMs, 'ms', modeled),
          field('peak-temperature', 'Steady-state peak junction temperature', thermals.peakJunctionTempC, 'C', modeled),
          field('throttled-gpus', 'Modeled throttled GPUs', thermals.throttledGpuCount, 'GPUs', modeled),
          field('thermal-clock', 'Modeled thermal clock cap', thermals.thermalClockFraction * 100, 'percent', modeled),
        ],
      }, ...(executed ? [{id:'gpu-supercluster:executed-comparison',label:'Executed run: live rack interventions',targetIds:rackLayers.map(layer=>layer.id),fields:[
        field('executed-interval','Matched interval',`0–${elapsed.toFixed(2)} ms`,null,modeled),
        ...Object.entries(executed.differences).map(([id,value])=>field(`executed-${id}`,({completedIterations:'Change in completed iterations',productiveComputeRackMs:'Change in productive compute',communicationRackMs:'Change in communication time',synchronizationWaitingRackMs:'Change in synchronization waiting'})[id],value,id==='completedIterations'?'iterations':'rack-ms',modeled)),
        field('executed-boundary','Comparison scope',executed.claimBoundary,null,modeled),
      ]}] : []), ...topology.links.filter(link=>link.type==='infiniband-rail').map(link=>({
        id:`${PLUGIN_ID}:inspection:${link.id}`,label:link.id,targetIds:[`link:${link.id}`],
        fields:[field('endpoints','Connects',`${link.sourceGpuId} → ${link.targetGpuId}`,null,modeled),
          field('racks','Connected racks',`${gpuById.get(link.sourceGpuId).rackId} ↔ ${gpuById.get(link.targetGpuId).rackId}`,null,modeled),
          field('bandwidth','Modeled capacity',link.bandwidthGbps,'Gbps',modeled),
          field('work','Current transfers',(workload?.transfers||[]).filter(row=>row.id===link.id).map(row=>`${row.from} → ${row.to}: ${Math.round(row.progress*100)}%`).join('; ')||'No transfer at this simulation instant',null,modeled),
          field('dependency','Dependency',!workload ? 'Start the workload to inspect dependencies.' : workload.communicating
            ? `${workload.communicationPhase === 'tensor' ? 'Tensor' : 'Data'} collective; ${workload.activeLinkIds.includes(link.id) ? 'this link is active' : 'this link is not used in the current stage'}.`
            : `Compute barrier: ${workload.racks.filter(rack=>rack.work<1).map(rack=>rack.id).join(', ')} still computing.`,null,modeled)]
      })), ...(workload ? workload.racks.map(rack => ({
        id:`${PLUGIN_ID}:inspection:${rack.id}`, label:rack.id,targetIds:[`rack:${rack.id}`],
        fields:[field('population','GPUs in rack',topology.racks.find(row=>row.id===rack.id).gpuCount,'GPUs',modeled),
          field('task','Task',({forward:'Forward pass',backward:'Backward pass',waiting:'Waiting at compute barrier',allreduce:'Collective transfer'})[rack.task],null,modeled),
          field('work','Compute progress',Math.round(rack.work*100),'percent',modeled),
          field('waiting-for','Waiting for',rack.waitingFor.join(', ') || (rack.task==='allreduce'?'Collective transfer':'Nothing'),null,modeled),
          field('blocking','Racks waiting on this rack',waitingByRack.get(rack.id).join(', ') || 'None',null,modeled),
          field('phase','Iteration phase',workload.communicating ? `${workload.communicationPhase === 'tensor' ? 'Tensor' : 'Data'} collective, round ${workload.collectiveRound + 1}` : 'Compute; all racks must finish before transfer',null,modeled),
          field('sample-time','Simulation time',workload.timeMs,'ms',modeled),
          field('interval','Measured interval',`0–${workload.timeMs.toFixed(2)} ms since start`,null,modeled),
          field('computing-ms','Computing',rack.computingMs,'ms',modeled),
          field('communication-ms','Communicating',rack.communicationMs,'ms',modeled),
          field('productive-ms','Productive compute equivalent',rack.productiveMs,'ms',modeled),
          field('slowdown-loss-ms','Compute lost to slowdown',rack.slowdownLossMs,'ms',modeled),
          field('throughput-contribution','Contribution to cluster compute',elapsed > 0
            ? collectives.totalPeakClusterTflops / topology.racks.length * rack.productiveMs / elapsed * (1 - collectives.bubbleFraction) * thermals.thermalClockFraction : 0,'TFLOP/s',modeled),
          field('time-accounting','Time accounting','Computing + communicating + waiting = elapsed time. Productive compute excludes slowdown; throughput also applies the configured pipeline and thermal factors.',null,modeled),
          field('slowdown','Slowdown',rack.slowdown,'percent',modeled),field('wait-ms','Synchronization wait',rack.waitMs,'ms',modeled),
          field('action-consequence','Executed-run comparison',`Same 0–${elapsed.toFixed(2)} ms interval; baseline keeps the initial configuration and omits live actions.`,null,modeled),
          field('extra-wait','Additional wait versus no live actions',executed.racks.find(row=>row.id===rack.id).extraWaitingMs,'ms',modeled),
          field('post-restoration-wait','Additional wait after latest restoration',executed.racks.find(row=>row.id===rack.id).afterRestorationAdditionalWaitingMs ?? 'No restoration recorded','ms',modeled),
          field('completed-iteration-delta','Change in completed iterations',executed.differences.completedIterations,'iterations',modeled)]
      })) : [])],
      provenanceRecords: records,
    });
  }

  function physicalLink(from,to){return builder.geometry('polyline','datacenter-cartesian-meters',[[from.xM,from.yM,from.zM],[to.xM,to.yM,to.zM]]);}

  // Presentation-only embedding. Topology, link lengths, and collective solving
  // retain physical facility coordinates and the executed node-ring graph.
  function torusPoint(u, v) {
    const radius = 7 + 2.6 * Math.cos(v);
    return [radius * Math.cos(u), radius * Math.sin(u), 2.6 * Math.sin(v)];
  }
  function networkPosition(rack, topology) {
    return torusPoint((rack.col - 1) / topology.racksPerRow * Math.PI * 2,
      (rack.row - 1) / topology.rowsCount * Math.PI * 2);
  }
  function networkPath(from, to, topology) {
    const angles = rack => [(rack.col - 1) / topology.racksPerRow * Math.PI * 2, (rack.row - 1) / topology.rowsCount * Math.PI * 2];
    const a = angles(from), b = angles(to);
    const delta = b.map((angle, index) => Math.atan2(Math.sin(angle - a[index]), Math.cos(angle - a[index])));
    if (from.id === to.id) {
      const p = networkPosition(from, topology);
      return [p, [p[0], p[1], p[2] + 0.8], p];
    }
    return Array.from({length: 17}, (_, index) => torusPoint(a[0] + delta[0] * index / 16, a[1] + delta[1] * index / 16));
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

  function option(value, label) { return { value, label }; }
  function selectControl(id, label, value, options, provenance) {
    return { id, label, kind: 'select', value, options, minimum: null, maximum: null, step: null, provenance };
  }
  function numberControl(id, label, value, minimum, maximum, step, provenance) {
    return { id, label, kind: 'number', value, options: null, minimum, maximum, step, provenance };
  }
  function field(id, label, value, unit, provenance) { return { id, label, value, unit, provenance }; }

  return Object.freeze({ createContribution, networkPosition, networkPath });
});
