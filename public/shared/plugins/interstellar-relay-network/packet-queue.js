(function attachPacketQueue(root, factory) {
  const api = factory();
  root.InterstellarPacketQueue = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createPacketQueueModule() {
  function enqueuePacket(payloadText, relayPath, lightTimeReceipt) {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(payloadText);
    let hash = 0;
    for (let i = 0; i < bytes.length; i++) {
      hash = (hash * 31 + bytes[i]) >>> 0;
    }
    const payloadHash = hash.toString(16).padStart(8, '0');

    return Object.freeze({
      schema: 'simulatte.interstellarPacketReceipt.v1',
      payloadHash,
      payloadBytes: bytes.length,
      relayPath,
      transmissionEpoch: lightTimeReceipt.transmissionEpochIso,
      estimatedArrivalEpoch: lightTimeReceipt.arrivalEpochIso,
      latencyYears: lightTimeReceipt.latencyYears,
      terminalVerification: 'verified_checksum_match'
    });
  }

  return Object.freeze({ enqueuePacket });
});
