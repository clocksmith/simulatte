(function attachPresentation(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteClusterPresentation = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createPresentation() {
  function createSemanticPresentation({
    config = {},
    topology = {},
    collectives = {},
    thermals = {},
    progressiveState = {},
  } = {}) {
    const rackThermalsByIndex = new Map(
      (thermals.racks || []).map((r) => [r.rackIndex, r])
    );

    // 1. Rack Entities
    const rackEntities = (topology.racks || []).map((rack) => {
      const thermal = rackThermalsByIndex.get(rack.rackIndex) || { avgTempC: 52, isThrottled: false, powerDrawKw: 5.6 };
      return Object.freeze({
        id: `rack:${rack.id}`,
        semanticType: 'server-rack-42u',
        label: `Rack ${rack.id}`,
        coordinates: Object.freeze([rack.xM, rack.yM, rack.zM]),
        quantities: Object.freeze({
          gpuCount: rack.gpuCount,
          avgTempC: thermal.avgTempC,
          powerDrawKw: thermal.powerDrawKw,
          isThrottled: thermal.isThrottled,
          isColdAisle: rack.isColdAisle,
        }),
      });
    });

    // 2. Interconnect Link Entities
    const linkEntities = (topology.links || []).slice(0, 128).map((link) => {
      return Object.freeze({
        id: `link:${link.id}`,
        semanticType: link.type === 'nvlink-mesh' ? 'nvlink-interconnect' : 'infiniband-rail',
        label: `${link.type}: ${link.sourceGpuId} to ${link.targetGpuId}`,
        quantities: Object.freeze({
          bandwidthGbps: link.bandwidthGbps,
          lengthMeters: link.lengthMeters,
          activeUtilizationPercent: collectives.commOverheadPercent || 35.0,
        }),
      });
    });

    // 3. Collective Tensor Packet Flow
    const progress = Number(progressiveState.progress || 0);
    const activeRingHop = Math.floor(progress * (topology.totalGpus || 256));
    const activeGpu = topology.gpus ? topology.gpus[activeRingHop % topology.gpus.length] : null;

    const packetEntities = activeGpu ? [
      Object.freeze({
        id: 'active-allreduce-tensor-pulse',
        semanticType: 'tensor-gradient-pulse',
        label: `Gradient Bucket #4 [AllReduce Hop ${activeRingHop}]`,
        coordinates: Object.freeze([activeGpu.xM, activeGpu.yM, activeGpu.zM]),
        quantities: Object.freeze({
          tensorSizeGb: config.tensorSizeGb || 14.2,
          currentGpuId: activeGpu.id,
          currentRackId: activeGpu.rackId,
          stepTimeMs: collectives.stepTimeMs,
        }),
      }),
    ] : [];

    return Object.freeze({
      schema: 'simulatte.semanticPresentation.v4-draft',
      coordinateSystem: 'datacenter-cartesian-meters',
      epoch: new Date().toISOString(),
      layers: Object.freeze([
        Object.freeze({
          id: 'datacenter-racks',
          semanticLayerType: 'point-observations',
          entities: Object.freeze(rackEntities),
          aggregationPolicy: Object.freeze({ kind: 'core-managed', semanticQuantity: 'avgTempC' }),
          lodPolicy: Object.freeze({ kind: 'core-managed', priorityEntityIds: Object.freeze(rackEntities.map((r) => r.id)) }),
          pickBehavior: 'inspect-rack-telemetry',
          temporalVisibility: 'entire-run',
        }),
        Object.freeze({
          id: 'interconnect-links',
          semanticLayerType: 'directed-flow',
          entities: Object.freeze(linkEntities),
          aggregationPolicy: Object.freeze({ kind: 'core-managed', semanticQuantity: 'bandwidthGbps' }),
          lodPolicy: Object.freeze({ kind: 'core-managed', priorityEntityIds: Object.freeze(linkEntities.map((l) => l.id)) }),
          pickBehavior: 'inspect-link-bandwidth',
          temporalVisibility: 'event-state',
        }),
        Object.freeze({
          id: 'allreduce-gradient-flow',
          semanticLayerType: 'moving-actors',
          entities: Object.freeze(packetEntities),
          aggregationPolicy: Object.freeze({ kind: 'core-managed', semanticQuantity: 'tensorSizeGb' }),
          lodPolicy: Object.freeze({ kind: 'core-managed', priorityEntityIds: Object.freeze(packetEntities.map((p) => p.id)) }),
          pickBehavior: 'inspect-tensor-gradient',
          temporalVisibility: 'event-state',
        }),
      ]),
    });
  }

  return Object.freeze({ createSemanticPresentation });
});
