(function attachInterstellarMetrics(root, factory) {
  const api = factory();
  root.InterstellarMetrics = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createInterstellarMetrics() {
  function summarize({
    schedule,
    linkBudgets,
    packet,
    evidenceReferences = [],
    omissions = [],
    reliabilityScope = { conditionalOn: [], excludes: [] },
  }) {
    const rates = linkBudgets.map((row) => row.achievableDataRateGbps).filter(Number.isFinite);
    const margins = linkBudgets.map((row) => row.linkMarginDb).filter(Number.isFinite);
    const successProbabilities = linkBudgets
      .map((row) => row.packetSuccessProbability)
      .filter(Number.isFinite);
    const rateIntervals = linkBudgets.map((row) => row.truth.uncertainty.value.achievableDataRateGbps);
    const transmissionEnergyJ = schedule.hops.reduce(
      (sum, hop, index) => sum + (hop.transmitDurationSeconds * linkBudgets[index].txPowerW),
      0,
    );
    return Object.freeze({
      schema: 'simulatte.interstellarRelayMetrics.v2',
      hopCount: schedule.hops.length,
      oneWayLatencyYears: schedule.totalLatencyYears,
      deliveryEpochIso: schedule.deliveryEpochIso,
      bottleneckDataRateGbps: rates.length ? Math.min(...rates) : 0,
      bottleneckDataRateIntervalGbps: Object.freeze([
        Math.min(...rateIntervals.map((row) => row[0])),
        Math.min(...rateIntervals.map((row) => row[1])),
      ]),
      minimumLinkMarginDb: margins.length ? Math.min(...margins) : null,
      endToEndPacketSuccessProbability: successProbabilities.reduce((product, value) => product * value, 1),
      transmissionEnergyJ,
      packetBytes: packet.payloadBytes,
      relayForwardCount: Math.max(0, schedule.hops.length - 1),
      packetHash: packet.integrity.packetHash,
      evidenceReferences: Object.freeze(evidenceReferences.slice()),
      omissions: Object.freeze(omissions.map((row) => Object.freeze({ ...row }))),
      reliabilityScope: Object.freeze({
        statement: 'The packet-success estimate is conditional on continuous contact and hypothetical infrastructure.',
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
            reliabilityModel: 'idealized-independent-hop-product',
            omissionIds: Object.freeze(omissions.map((row) => row.id)),
            continuousContactAssumed: reliabilityScope.conditionalOn.includes('continuous-contact-assumed'),
          }),
        }),
      }),
    });
  }
  return Object.freeze({ summarize });
});
