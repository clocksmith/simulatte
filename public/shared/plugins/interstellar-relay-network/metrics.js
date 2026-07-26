(function attachInterstellarMetrics(root, factory) {
  const api = factory();
  root.InterstellarMetrics = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createInterstellarMetrics() {
  function summarize({
    schedule,
    linkBudgets,
    channelReceipts = null,
    operations = null,
    packet,
    evidenceReferences = [],
    omissions = [],
    reliabilityScope = { conditionalOn: [], excludes: [] },
  }) {
    const channels = channelReceipts || linkBudgets.map((row) => ({
      mode: 'classical-optical',
      effectiveDataRateGbps: row.achievableDataRateGbps,
      packetSuccessProbability: row.packetSuccessProbability,
      transmissionEnergyJ: null,
    }));
    const rates = channels.map((row) => row.effectiveDataRateGbps).filter(Number.isFinite);
    const margins = linkBudgets.map((row) => row.linkMarginDb).filter(Number.isFinite);
    const successProbabilities = channels
      .map((row) => row.packetSuccessProbability)
      .filter(Number.isFinite);
    const rateIntervals = channels.map((row, index) => (
      row.mode === 'classical-optical'
        ? linkBudgets[index].truth.uncertainty.value.achievableDataRateGbps
        : [row.effectiveDataRateGbps, row.effectiveDataRateGbps]
    ));
    const transmissionEnergyJ = channels.reduce((sum, row, index) => (
      sum + (Number.isFinite(row.transmissionEnergyJ)
        ? row.transmissionEnergyJ
        : schedule.hops[index]?.transmitDurationSeconds * linkBudgets[index].txPowerW || 0)
    ), 0);
    const physicalSuccessProbability = successProbabilities.reduce((product, value) => product * value, 1);
    return Object.freeze({
      schema: 'simulatte.interstellarRelayMetrics.v2',
      channelMode: channels[0]?.mode || 'classical-optical',
      hopCount: schedule.hops.length,
      oneWayLatencyYears: schedule.totalLatencyYears,
      deliveryEpochIso: schedule.deliveryEpochIso,
      bottleneckDataRateGbps: rates.length ? Math.min(...rates) : 0,
      bottleneckDataRateIntervalGbps: Object.freeze([
        Math.min(...rateIntervals.map((row) => row[0])),
        Math.min(...rateIntervals.map((row) => row[1])),
      ]),
      minimumLinkMarginDb: margins.length ? Math.min(...margins) : null,
      endToEndPacketSuccessProbability: operations?.deliveryProbability ?? physicalSuccessProbability,
      physicalChannelSuccessProbability: physicalSuccessProbability,
      operationalLatencySeconds: operations?.latencySeconds || null,
      meanRetryCount: operations?.meanRetryCount ?? 0,
      meanOutageCount: operations?.meanOutageCount ?? 0,
      meanMaintenanceCount: operations?.meanMaintenanceCount ?? 0,
      transmissionEnergyJ,
      packetBytes: packet.payloadBytes,
      relayForwardCount: Math.max(0, schedule.hops.length - 1),
      packetHash: packet.integrity.packetHash,
      evidenceReferences: Object.freeze(evidenceReferences.slice()),
      omissions: Object.freeze(omissions.map((row) => Object.freeze({ ...row }))),
      reliabilityScope: Object.freeze({
        statement: operations
          ? 'The delivery estimate is a seeded operational ensemble over hypothetical infrastructure.'
          : 'The packet-success estimate is conditional on hypothetical infrastructure.',
        conditionalOn: Object.freeze(reliabilityScope.conditionalOn.slice()),
        excludes: Object.freeze(reliabilityScope.excludes.slice()),
      }),
      truth: Object.freeze({
        origin: 'derived',
        temporalStatus: 'forecast',
        uncertainty: Object.freeze({
          kind: 'interval',
          value: Object.freeze({
            bottleneckDataRateGbps: Object.freeze([
              Math.min(...rateIntervals.map((row) => row[0])),
              Math.min(...rateIntervals.map((row) => row[1])),
            ]),
            reliabilityModel: operations ? 'seeded-operational-ensemble' : 'idealized-independent-hop-product',
            omissionIds: Object.freeze(omissions.map((row) => row.id)),
            continuousContactAssumed: false,
          }),
        }),
      }),
    });
  }
  return Object.freeze({ summarize });
});
