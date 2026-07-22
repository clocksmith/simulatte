(function attachQueueEngine(root, factory) {
  const api = factory();
  root.MaritimeQueueEngine = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createQueueEngineModule() {
  function simulatePortQueue(portId, arrivalCount = 20, isDisrupted = false) {
    const queue = [];
    const baseWaitHours = isDisrupted ? 72.0 : 6.5;
    for (let i = 0; i < arrivalCount; i++) {
      const waitHours = baseWaitHours + (i % 5) * 1.5;
      queue.push({
        eventSeq: i + 1,
        vesselId: `vessel-${portId}-${i + 1}`,
        arrivalTimestampIso: new Date(1784550000000 + i * 3600000).toISOString(),
        queueWaitHours: waitHours,
        status: isDisrupted ? 'anchorage-waiting' : 'berthed'
      });
    }

    const avgWaitHours = queue.reduce((acc, q) => acc + q.queueWaitHours, 0) / queue.length;
    return {
      portId,
      isDisrupted,
      vesselCount: arrivalCount,
      avgWaitHours,
      queue
    };
  }

  return Object.freeze({ simulatePortQueue });
});
