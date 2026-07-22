(function attachInterstellarContactScheduler(root, factory) {
  const api = factory(root);
  root.InterstellarContactScheduler = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createInterstellarContactScheduler(root) {
  function dep(globalName, path) { return typeof module === 'object' && module.exports ? require(path) : root[globalName]; }
  function scheduleRelay({ relayPath, statesById, scheduler, startEpochIso = '2026-07-21T00:00:00Z', processingDelayHours = 8 }) {
    const lightTimeApi = dep('InterstellarLightTime', './light-time.js');
    if (!Array.isArray(relayPath) || relayPath.length < 2) throw new Error('relay_path_invalid');
    const queue = scheduler.create({ maxEvents: relayPath.length * 6 + 20 });
    let cursorSeconds = 0;
    const hops = [];
    for (let index = 0; index < relayPath.length - 1; index += 1) {
      const fromId = relayPath[index];
      const toId = relayPath[index + 1];
      const from = statesById.get(fromId);
      const to = statesById.get(toId);
      if (!from || !to) throw new Error(`relay_state_missing: ${fromId}->${toId}`);
      const transmissionEpochIso = new Date(Date.parse(startEpochIso) + cursorSeconds * 1000).toISOString();
      const lightTime = lightTimeApi.computeOneWayLightTime(from.positionPc, to.positionPc, transmissionEpochIso);
      const receiveSeconds = cursorSeconds + lightTime.latencySeconds;
      queue.schedule({ time: cursorSeconds, priority: index * 10, kind: 'relay.transmission-started', payload: { index, fromId, toId } });
      queue.schedule({ time: receiveSeconds, priority: index * 10 + 1, kind: 'relay.packet-received', payload: { index, fromId, toId } });
      hops.push(Object.freeze({ index, fromId, toId, lightTime, transmitOffsetSeconds: cursorSeconds, receiveOffsetSeconds: receiveSeconds }));
      cursorSeconds = receiveSeconds + (index < relayPath.length - 2 ? processingDelayHours * 3600 : 0);
      if (index < relayPath.length - 2) queue.schedule({ time: cursorSeconds, priority: index * 10 + 2, kind: 'relay.retransmission-ready', payload: { index, relayId: toId } });
    }
    const trace = [];
    queue.drain((event) => trace.push(Object.freeze({ id: event.id, timeSeconds: event.time, kind: event.kind, payload: event.payload })));
    return Object.freeze({
      schema: 'simulatte.interstellarContactSchedule.v1', relayPath: Object.freeze(relayPath.slice()), startEpochIso,
      deliveryEpochIso: new Date(Date.parse(startEpochIso) + cursorSeconds * 1000).toISOString(),
      totalLatencySeconds: cursorSeconds, totalLatencyYears: cursorSeconds / (365.25 * 86400),
      hops: Object.freeze(hops), trace: Object.freeze(trace), schedulerReceipt: queue.receipt(),
      deterministicOrder: 'time_then_priority_then_sequence',
    });
  }
  return Object.freeze({ scheduleRelay });
});
