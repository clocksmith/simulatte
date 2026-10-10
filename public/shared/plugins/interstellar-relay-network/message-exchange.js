(function attachMessageExchange(root, factory) {
  const api = factory();
  root.InterstellarMessageExchange = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(globalThis, function createMessageExchange() {
  const YEAR_SECONDS = 31557600;
  function breakdown(schedule) {
    const transmissionSeconds = schedule.hops.reduce(
      (sum, hop) => sum + hop.transmitDurationSeconds,
      0,
    );
    const propagationSeconds = schedule.hops.reduce(
      (sum, hop) => sum + hop.lightTime.latencySeconds,
      0,
    );
    return Object.freeze({
      transmissionSeconds,
      propagationSeconds,
      waitingSeconds: Math.max(
        0,
        schedule.totalLatencySeconds - transmissionSeconds - propagationSeconds,
      ),
    });
  }
  function compose(request, response) {
    const offset = request.schedule.totalLatencySeconds;
    const hopOffset = request.schedule.hops.length;
    const eventOffset = request.schedule.trace.length;
    const responseId = response.packet.packetId;
    const responseEventId = (id) => `response:${id}`;
    const firstResponseId = responseEventId(response.schedule.trace[0].id);
    const requestStates = request.schedule.snapshots.map((state) =>
      Object.freeze({
        ...state,
        status: state.status === "settled" ? "running" : state.status,
        messageLeg: "request",
      }),
    );
    const responseStates = response.schedule.snapshots
      .slice(1)
      .map((state) =>
        Object.freeze({
          ...state,
          messageLeg: "response",
          currentEventIndex: state.currentEventIndex + eventOffset,
          currentEventId: responseEventId(state.currentEventId),
          elapsedSeconds: state.elapsedSeconds + offset,
          activeHopIndex:
            state.activeHopIndex === null
              ? null
              : state.activeHopIndex + hopOffset,
        }),
      );
    const snapshots = [...requestStates, ...responseStates];
    const requestTrace = request.schedule.trace.map((event, index) =>
      Object.freeze({
        ...event,
        affectedEntityIds: event.affectedEntityIds.map((id) =>
          id === "packet:0" ? request.packet.packetId : id,
        ),
        beforeState: snapshots[index],
        afterState: snapshots[index + 1],
      }),
    );
    const responseTrace = response.schedule.trace.map((event, index) =>
      Object.freeze({
        ...event,
        id: responseEventId(event.id),
        timeSeconds: event.timeSeconds + offset,
        causalParentIds:
          index === 0
            ? [requestTrace.at(-1).id]
            : event.causalParentIds.map(responseEventId),
        affectedEntityIds: event.affectedEntityIds.map((id) =>
          id === "packet:0" ? responseId : id,
        ),
        beforeState: snapshots[eventOffset + index],
        afterState: snapshots[eventOffset + index + 1],
      }),
    );
    if (responseTrace[0].id !== firstResponseId)
      throw new Error("response_event_identity_invalid");
    const totalLatencySeconds = offset + response.schedule.totalLatencySeconds;
    const schedule = Object.freeze({
      ...request.schedule,
      schema: "simulatte.interstellarExchangeSchedule.v1",
      deliveryEpochIso: response.schedule.deliveryEpochIso,
      deliveryStatus: response.schedule.deliveryStatus,
      totalLatencySeconds,
      totalLatencyYears: totalLatencySeconds / YEAR_SECONDS,
      hops: Object.freeze([
        ...request.schedule.hops,
        ...response.schedule.hops.map((hop) =>
          Object.freeze({
            ...hop,
            index: hop.index + hopOffset,
            transmitOffsetSeconds: hop.transmitOffsetSeconds + offset,
            receiveOffsetSeconds: hop.receiveOffsetSeconds + offset,
          }),
        ),
      ]),
      initialState: snapshots[0],
      snapshots: Object.freeze(snapshots),
      trace: Object.freeze([...requestTrace, ...responseTrace]),
      schedulerReceipt: Object.freeze({
        ...request.schedule.schedulerReceipt,
        processedCount: requestTrace.length + responseTrace.length,
        constituentReceipts: [
          request.schedule.schedulerReceipt,
          response.schedule.schedulerReceipt,
        ],
      }),
    });
    return Object.freeze({
      ...request,
      schema: "simulatte.interstellarRelayResult.v4",
      schedule,
      linkBudgets: Object.freeze([
        ...request.linkBudgets,
        ...response.linkBudgets,
      ]),
      channelReceipts: Object.freeze([
        ...request.channelReceipts,
        ...response.channelReceipts,
      ]),
      exchange: Object.freeze({
        schema: "simulatte.messageExchange.v1",
        request,
        response,
        responsePacket: response.packet,
        responseCreatedAt: request.schedule.deliveryEpochIso,
        roundTripYears: totalLatencySeconds / YEAR_SECONDS,
        boundary:
          "Full-packet response, created immediately after request delivery, with the same terminal and reversed relay route. Operational waits remain modeled; this is not a first-bit physical lower bound.",
      }),
      metrics: Object.freeze({
        ...request.metrics,
        roundTripYears: totalLatencySeconds / YEAR_SECONDS,
      }),
    });
  }
  return Object.freeze({ breakdown, compose });
});
