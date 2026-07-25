(function attachInterstellarContactScheduler(root, factory) {
  const api = factory(root);
  root.InterstellarContactScheduler = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createInterstellarContactScheduler(root) {
  function dep(globalName, path) { return typeof module === 'object' && module.exports ? require(path) : root[globalName]; }
  function scheduleRelay({
    relayPath,
    statesById,
    linkBudgets,
    packetBits,
    scheduler,
    startEpochIso = '2026-07-25T00:00:00Z',
    processingDelayHours = 8,
  }) {
    const lightTimeApi = dep('InterstellarLightTime', './light-time.js');
    if (!Array.isArray(relayPath) || relayPath.length < 2) throw new Error('relay_path_invalid');
    if (!Array.isArray(linkBudgets) || linkBudgets.length !== relayPath.length - 1) throw new Error('relay_link_budget_count_invalid');
    if (!(packetBits > 0)) throw new Error('relay_packet_bits_invalid');
    const queue = scheduler.create({ maxEvents: relayPath.length * 8 + 20 });
    let cursorSeconds = 0;
    const hops = [];
    let causalParentIds = [];
    const createdId = queue.schedule({
      time: 0,
      priority: 0,
      kind: 'relay.packet-created',
      payload: eventPayload({
        causalParentIds: [],
        affectedEntityIds: ['packet:0', relayPath[0]],
        evidenceReferences: ['interstellar.scenario.network.v2', 'interstellar.relay.models.v1:deterministic-store-forward-v2'],
        hopIndex: null,
        fromId: relayPath[0],
        toId: relayPath.at(-1),
      }),
    });
    causalParentIds = [createdId];
    for (let index = 0; index < relayPath.length - 1; index += 1) {
      const fromId = relayPath[index];
      const toId = relayPath[index + 1];
      const from = statesById.get(fromId);
      const to = statesById.get(toId);
      if (!from || !to) throw new Error(`relay_state_missing: ${fromId}->${toId}`);
      const transmissionEpochIso = new Date(Date.parse(startEpochIso) + cursorSeconds * 1000).toISOString();
      const lightTime = lightTimeApi.computeMovingTargetLightTime(from, to, cursorSeconds, transmissionEpochIso);
      const budget = linkBudgets[index];
      const informationBitRate = budget.achievableDataRateGbps * 1e9;
      if (!(informationBitRate > 0)) throw new Error(`relay_link_rate_unusable: ${fromId}->${toId}`);
      const transmitDurationSeconds = packetBits / informationBitRate;
      const transmitCompleteSeconds = cursorSeconds + transmitDurationSeconds;
      const receiveSeconds = transmitCompleteSeconds + lightTime.latencySeconds;
      const evidenceReferences = [
        ...from.sourceRowIds,
        ...to.sourceRowIds,
        budget.modelReceipt.modelId,
      ];
      const startId = queue.schedule({
        time: cursorSeconds,
        priority: index * 20 + 1,
        kind: 'relay.transmission-started',
        payload: eventPayload({
          causalParentIds,
          affectedEntityIds: ['packet:0', fromId, toId],
          evidenceReferences,
          hopIndex: index,
          fromId,
          toId,
        }),
      });
      const transmittedId = queue.schedule({
        time: transmitCompleteSeconds,
        priority: index * 20 + 2,
        kind: 'relay.transmission-completed',
        payload: eventPayload({
          causalParentIds: [startId],
          affectedEntityIds: ['packet:0', fromId, toId],
          evidenceReferences,
          hopIndex: index,
          fromId,
          toId,
        }),
      });
      const receiveKind = index === relayPath.length - 2 ? 'relay.packet-delivered' : 'relay.packet-received';
      const receivedId = queue.schedule({
        time: receiveSeconds,
        priority: index * 20 + 3,
        kind: receiveKind,
        payload: eventPayload({
          causalParentIds: [transmittedId],
          affectedEntityIds: ['packet:0', toId],
          evidenceReferences,
          hopIndex: index,
          fromId,
          toId,
        }),
      });
      hops.push(Object.freeze({
        index,
        fromId,
        toId,
        lightTime,
        linkBudgetId: `link-budget:${index}`,
        transmitOffsetSeconds: cursorSeconds,
        transmitDurationSeconds,
        receiveOffsetSeconds: receiveSeconds,
      }));
      cursorSeconds = receiveSeconds;
      causalParentIds = [receivedId];
      if (index < relayPath.length - 2) {
        const processingCompleteSeconds = cursorSeconds + processingDelayHours * 3600;
        const processingId = queue.schedule({
          time: processingCompleteSeconds,
          priority: index * 20 + 4,
          kind: 'relay.processing-completed',
          payload: eventPayload({
            causalParentIds: [receivedId],
            affectedEntityIds: ['packet:0', toId],
            evidenceReferences: ['interstellar.relay.models.v1:deterministic-store-forward-v2'],
            hopIndex: index,
            fromId: toId,
            toId: relayPath[index + 2],
          }),
        });
        cursorSeconds = processingCompleteSeconds;
        causalParentIds = [processingId];
      }
    }
    const scheduledTrace = [];
    queue.drain((event) => scheduledTrace.push(event));
    const initialState = createInitialProgressiveState(relayPath, startEpochIso);
    const snapshots = [initialState];
    const trace = scheduledTrace.map((event) => {
      const beforeState = snapshots.at(-1);
      const timestamp = new Date(Date.parse(startEpochIso) + event.time * 1000).toISOString();
      const afterState = applyDomainEvent(beforeState, event, timestamp);
      snapshots.push(afterState);
      return Object.freeze({
        schema: 'simulatte.simulationEvent.v4',
        id: event.id,
        timestamp,
        timeSeconds: event.time,
        kind: event.kind,
        causalParentIds: event.payload.causalParentIds,
        affectedEntityIds: event.payload.affectedEntityIds,
        beforeState,
        afterState,
        evidenceReferences: event.payload.evidenceReferences,
        truth: Object.freeze({
          origin: 'simulated',
          temporalStatus: 'forecast',
          uncertainty: Object.freeze({
            kind: 'interval',
            value: Object.freeze({
              achievableDataRateGbps: event.payload.hopIndex === null
                ? null
                : linkBudgets[event.payload.hopIndex].truth.uncertainty.value.achievableDataRateGbps,
              note: 'Event order is deterministic; modeled link quantities retain their declared intervals.',
            }),
          }),
        }),
      });
    });
    return Object.freeze({
      schema: 'simulatte.interstellarContactSchedule.v2',
      relayPath: Object.freeze(relayPath.slice()),
      startEpochIso,
      deliveryEpochIso: new Date(Date.parse(startEpochIso) + cursorSeconds * 1000).toISOString(),
      totalLatencySeconds: cursorSeconds, totalLatencyYears: cursorSeconds / (365.25 * 86400),
      packetBits,
      processingDelayHours,
      hops: Object.freeze(hops),
      initialState,
      snapshots: Object.freeze(snapshots),
      trace: Object.freeze(trace),
      schedulerReceipt: queue.receipt(),
      deterministicOrder: 'time_then_priority_then_sequence',
      modelReceipt: Object.freeze({
        modelId: 'deterministic-store-forward-v2',
        parameters: Object.freeze({ packetBits, processingDelayHours }),
        validationIds: Object.freeze(['causal-event-order-and-conservation-v1']),
      }),
    });
  }

  function eventPayload({
    causalParentIds, affectedEntityIds, evidenceReferences, hopIndex, fromId, toId,
  }) {
    return Object.freeze({
      causalParentIds: Object.freeze(causalParentIds.slice()),
      affectedEntityIds: Object.freeze(affectedEntityIds.slice()),
      evidenceReferences: Object.freeze(evidenceReferences.slice()),
      hopIndex,
      fromId,
      toId,
    });
  }

  function createInitialProgressiveState(relayPath, startEpochIso) {
    return Object.freeze({
      schema: 'simulatte.interstellarProgressiveState.v1',
      status: 'ready',
      currentEventIndex: -1,
      currentEventId: null,
      timestamp: startEpochIso,
      elapsedSeconds: 0,
      packetLocationId: relayPath[0],
      activeHopIndex: null,
      deliveredHopCount: 0,
      relayPath: Object.freeze(relayPath.slice()),
      evidenceReferences: Object.freeze([
        'interstellar.scenario.network.v2',
        'interstellar.relay.models.v1:deterministic-store-forward-v2',
      ]),
    });
  }

  function applyDomainEvent(state, event, timestamp) {
    const isStarted = event.kind === 'relay.transmission-started';
    const isReceived = event.kind === 'relay.packet-received';
    const isDelivered = event.kind === 'relay.packet-delivered';
    return Object.freeze({
      ...state,
      status: isDelivered ? 'settled' : 'running',
      currentEventIndex: state.currentEventIndex + 1,
      currentEventId: event.id,
      timestamp,
      elapsedSeconds: event.time,
      packetLocationId: isReceived || isDelivered ? event.payload.toId : state.packetLocationId,
      activeHopIndex: isStarted ? event.payload.hopIndex : (isReceived || isDelivered ? null : state.activeHopIndex),
      deliveredHopCount: isReceived || isDelivered ? event.payload.hopIndex + 1 : state.deliveredHopCount,
      evidenceReferences: event.payload.evidenceReferences,
    });
  }
  return Object.freeze({ scheduleRelay });
});
