(function attachInterstellarIntegrity(root, factory) {
  const api = factory();
  root.InterstellarIntegrity = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createInterstellarIntegrityModule() {
  async function createPacketIdentity(receiptTools, packet) {
    if (!receiptTools || typeof receiptTools.sha256Hex !== 'function') throw new Error('interstellar_integrity_sha256_missing');
    const canonical = {
      packetId: packet.packetId, sequence: packet.sequence, payload: packet.payload,
      sourceId: packet.sourceId, destinationId: packet.destinationId, relayPath: packet.relayPath,
      createdAt: packet.createdAt,
    };
    const payloadHash = await receiptTools.sha256Hex(packet.payload);
    const packetHash = await receiptTools.sha256Hex(canonical);
    return Object.freeze({ schema: 'simulatte.interstellarPacketIntegrity.v1', algorithm: 'sha256-canonical-json-v1', payloadHash, packetHash, canonical });
  }
  async function verifyPacketIdentity(receiptTools, packet, identity) {
    const recomputed = await createPacketIdentity(receiptTools, packet);
    return Object.freeze({ schema: 'simulatte.interstellarIntegrityVerification.v1', pass: recomputed.payloadHash === identity.payloadHash && recomputed.packetHash === identity.packetHash, expectedPacketHash: identity.packetHash, actualPacketHash: recomputed.packetHash });
  }
  return Object.freeze({ createPacketIdentity, verifyPacketIdentity });
});
