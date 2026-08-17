(function attachClusterTopology(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteClusterTopology = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createClusterTopology() {
  function buildClusterTopology(config = {}) {
    const totalGpus = Number(config.totalGpus || 256);
    const racksCount = Number(config.racks || 32);
    const rowsCount = 4;
    const racksPerRow = Math.ceil(racksCount / rowsCount);
    const gpusPerRack = Math.floor(totalGpus / racksCount);
    const nodesPerRack = Number(config.nodesPerRack || 8);
    const gpusPerNode = Number(config.gpusPerNode || Math.max(1, Math.floor(gpusPerRack / nodesPerRack)));

    const racks = [];
    const gpus = [];
    const links = [];

    // Grid coordinates in facility meters
    const rowSpacingM = 3.5;
    const rackSpacingM = 1.8;
    const originX = -((racksPerRow - 1) * rackSpacingM) / 2;
    const originY = -((rowsCount - 1) * rowSpacingM) / 2;

    for (let r = 0; r < rowsCount; r++) {
      const rowY = originY + r * rowSpacingM;
      for (let c = 0; c < racksPerRow; c++) {
        const rackIndex = r * racksPerRow + c;
        if (rackIndex >= racksCount) break;

        const rackId = `R${r + 1}-${c + 1}`;
        const rackX = originX + c * rackSpacingM;
        const rackZ = 0.0;

        const rackGpus = [];
        for (let g = 0; g < gpusPerRack; g++) {
          const globalGpuId = rackIndex * gpusPerRack + g;
          const nodeIndex = Math.floor(g / gpusPerNode);
          const localGpuIndex = g % gpusPerNode;
          const gpuHeightM = 0.2 + (nodeIndex * 0.22) + (localGpuIndex * 0.02);

          const gpuRecord = Object.freeze({
            id: `gpu-${globalGpuId}`,
            globalIndex: globalGpuId,
            rackId,
            nodeId: `${rackId}-N${nodeIndex + 1}`,
            rackIndex,
            nodeIndex,
            localGpuIndex,
            xM: rackX,
            yM: rowY,
            zM: gpuHeightM,
          });

          gpus.push(gpuRecord);
          rackGpus.push(gpuRecord.id);
        }

        racks.push(Object.freeze({
          id: rackId,
          rackIndex,
          row: r + 1,
          col: c + 1,
          xM: rackX,
          yM: rowY,
          zM: rackZ,
          gpuIds: Object.freeze(rackGpus),
          gpuCount: rackGpus.length,
          isColdAisle: r % 2 === 0,
        }));
      }
    }

    // Intra-Node NVLink Full Mesh Links (within each node)
    for (let i = 0; i < gpus.length; i++) {
      const g1 = gpus[i];
      for (let j = i + 1; j < gpus.length; j++) {
        const g2 = gpus[j];
        if (g1.nodeId === g2.nodeId) {
          links.push(Object.freeze({
            id: `nvlink:${g1.id}-${g2.id}`,
            type: 'nvlink-mesh',
            bandwidthGbps: Number(config.nvlinkBandwidthGbps || 900),
            sourceGpuId: g1.id,
            targetGpuId: g2.id,
            lengthMeters: 0.35,
          }));
        }
      }
    }

    // Inter-Rack InfiniBand Spine-Leaf Uplinks (AllReduce Ring Connections)
    for (let i = 0; i < totalGpus; i++) {
      const nextGpu = (i + 1) % totalGpus;
      if (gpus[i].rackId !== gpus[nextGpu].rackId) {
        links.push(Object.freeze({
          id: `infiniband-ring:${gpus[i].id}-${gpus[nextGpu].id}`,
          type: 'infiniband-rail',
          bandwidthGbps: Number(config.infinibandBandwidthGbps || 800),
          sourceGpuId: gpus[i].id,
          targetGpuId: gpus[nextGpu].id,
          lengthMeters: Math.hypot(gpus[nextGpu].xM - gpus[i].xM, gpus[nextGpu].yM - gpus[i].yM) + 4.0,
        }));
      }
    }

    return Object.freeze({
      totalGpus: gpus.length,
      racksCount: racks.length,
      rowsCount,
      racksPerRow,
      racks: Object.freeze(racks),
      gpus: Object.freeze(gpus),
      links: Object.freeze(links),
      nvlinkCount: links.filter((l) => l.type === 'nvlink-mesh').length,
      infinibandCount: links.filter((l) => l.type === 'infiniband-rail').length,
    });
  }

  return Object.freeze({ buildClusterTopology });
});
