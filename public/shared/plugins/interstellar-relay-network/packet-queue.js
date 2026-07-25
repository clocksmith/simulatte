(function attachPacketQueue(root, factory) {
  const api = factory(root);
  root.InterstellarPacketQueue = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createPacketQueueModule(root) {
  function dep(globalName, path) { return typeof module === 'object' && module.exports ? require(path) : root[globalName]; }
  async function createPacket({
    receiptTools,
    packetId,
    sequence = 0,
    payload,
    payloadBytes = null,
    sourceId,
    destinationId,
    relayPath,
    createdAt,
    schedule,
  }) {
    const integrityApi = dep('InterstellarIntegrity', './integrity.js');
    const packet = { packetId, sequence, payload, sourceId, destinationId, relayPath: relayPath.slice(), createdAt };
    const integrity = await integrityApi.createPacketIdentity(receiptTools, packet);
    const verification = await integrityApi.verifyPacketIdentity(receiptTools, packet, integrity);
    const encodedBytes = new TextEncoder().encode(payload).length;
    const declaredBytes = payloadBytes === null ? encodedBytes : Number(payloadBytes);
    if (!Number.isInteger(declaredBytes) || declaredBytes < encodedBytes) throw new Error('interstellar_packet_size_invalid');
    return Object.freeze({
      schema: 'simulatte.interstellarPacketReceipt.v2', packetId, sequence,
      payloadDescriptor: payload, payloadBytes: declaredBytes, sourceId, destinationId,
      relayPath: Object.freeze(relayPath.slice()), createdAt, estimatedArrivalEpoch: schedule.deliveryEpochIso,
      latencyYears: schedule.totalLatencyYears, integrity, terminalVerification: verification.pass ? 'verified_sha256_match' : 'failed',
      truth: Object.freeze({
        origin: 'scenario',
        temporalStatus: 'forecast',
        uncertainty: Object.freeze({
          kind: 'missing',
          value: Object.freeze({ reason: 'Packet payload and relay infrastructure are scenario inputs.' }),
        }),
      }),
    });
  }
  // Compatibility wrapper for callers that only need a non-cryptographic draft. New code
  // should call createPacket so the host SHA-256 receipt tools are used.
  function enqueuePacket(payloadText, relayPath, lightTimeReceipt) {
    return Object.freeze({ schema: 'simulatte.interstellarPacketDraft.v1', payload: payloadText, relayPath: relayPath.slice(), transmissionEpoch: lightTimeReceipt.transmissionEpochIso, estimatedArrivalEpoch: lightTimeReceipt.arrivalEpochIso, latencyYears: lightTimeReceipt.latencyYears });
  }
  return Object.freeze({ createPacket, enqueuePacket });
});
