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
    channelReceipts = null,
    channelEvaluator = null,
    operationalPlan = null,
    packetBits,
    scheduler,
    startEpochIso = '2026-07-25T00:00:00Z',
    processingDelayHours = 8,
  }) {
    const lightTimeApi = dep('InterstellarLightTime', './light-time.js');
    if (!Array.isArray(relayPath) || relayPath.length < 2) throw new Error('relay_path_invalid');
    if (!Array.isArray(linkBudgets) || linkBudgets.length !== relayPath.length - 1) throw new Error('relay_link_budget_count_invalid');
    if (!(packetBits > 0)) throw new Error('relay_packet_bits_invalid');
    const channels = channelReceipts || linkBudgets.map((budget) => ({
      mode: 'classical-optical',
      latencySeconds: null,
      effectiveDataRateGbps: budget.achievableDataRateGbps,
      packetSuccessProbability: budget.packetSuccessProbability,
      transmissionEnergyJ: null,
    }));
    if (!Array.isArray(channels) || channels.length !== relayPath.length - 1) {
      throw new Error('relay_channel_receipt_count_invalid');
    }
    const queue = scheduler.create({ maxEvents: relayPath.length * 32 + 40 });
    let cursorSeconds = 0;
    const hops = [];
    let causalParentIds = [];
    let deliveryStatus = 'delivered';
    const createdId = queue.schedule({
      time: 0,
      priority: 0,
      kind: 'relay.packet-created',
      payload: eventPayload({
        causalParentIds: [],
        affectedEntityIds: ['packet:0', relayPath[0]],
        evidenceReferences: [
          'interstellar.scenario.network.v2',
          'interstellar.relay.models.v1:deterministic-store-forward-v2',
          'interstellar.operations.models.v1',
        ],
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
      const operationalHop = operationalPlan?.hops?.[index] || {
        acquisitionSeconds: 0,
        queueDelaySeconds: 0,
        maintenanceSeconds: 0,
        repairSeconds: 0,
        retryCount: 0,
        retryDelaySeconds: 0,
        success: true,
      };
      const stageEvidence = [
        ...from.sourceRowIds,
        ...to.sourceRowIds,
        'interstellar.operations.models.v1',
      ];
      ({ cursorSeconds, causalParentIds } = scheduleOperationalStages({
        queue,
        cursorSeconds,
        causalParentIds,
        operationalHop,
        hopIndex: index,
        fromId,
        toId,
        evidenceReferences: stageEvidence,
      }));
      if (!operationalHop.success) {
        const failedId = queue.schedule({
          time: cursorSeconds,
          priority: index * 40 + 19,
          kind: 'relay.packet-failed',
          payload: eventPayload({
            causalParentIds,
            affectedEntityIds: ['packet:0', fromId, toId],
            evidenceReferences: stageEvidence,
            hopIndex: index,
            fromId,
            toId,
          }),
        });
        causalParentIds = [failedId];
        deliveryStatus = 'failed';
        break;
      }
      const transmissionEpochIso = new Date(Date.parse(startEpochIso) + cursorSeconds * 1000).toISOString();
      const classicalLightTime = lightTimeApi.computeMovingTargetLightTime(
        from,
        to,
        cursorSeconds,
        transmissionEpochIso,
      );
      const scheduledEvaluation = channelEvaluator
        ? channelEvaluator({
          from,
          to,
          hopIndex: index,
          transmitOffsetSeconds: cursorSeconds,
          transmissionEpochIso,
          classicalLightTime,
          linkBudget: linkBudgets[index],
        })
        : null;
      const channel = scheduledEvaluation?.channelReceipt || scheduledEvaluation || channels[index];
      const lightTime = Object.freeze({
        ...classicalLightTime,
        classicalLatencySeconds: classicalLightTime.latencySeconds,
        latencySeconds: channel.latencySeconds ?? classicalLightTime.latencySeconds,
        latencyYears: (channel.latencySeconds ?? classicalLightTime.latencySeconds) / (365.25 * 86400),
        channelMode: channel.mode,
        causalityStatus: channel.causalityStatus || 'light-speed-limited',
      });
      const budget = scheduledEvaluation?.linkBudget || linkBudgets[index];
      const informationBitRate = channel.effectiveDataRateGbps * 1e9;
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
        priority: index * 40 + 20,
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
        priority: index * 40 + 21,
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
      let receiveParentId = transmittedId;
      for (const progressFraction of [0.25, 0.5, 0.75]) {
        const progressedId = queue.schedule({
          time: transmitCompleteSeconds + lightTime.latencySeconds * progressFraction,
          priority: index * 40 + 21,
          kind: 'relay.signal-progressed',
          payload: eventPayload({
            causalParentIds: [receiveParentId],
            affectedEntityIds: ['packet:0', fromId, toId],
            evidenceReferences,
            hopIndex: index,
            fromId,
            toId,
            progressFraction,
          }),
        });
        receiveParentId = progressedId;
      }
      const receiveKind = index === relayPath.length - 2 ? 'relay.packet-delivered' : 'relay.packet-received';
      const receivedId = queue.schedule({
        time: receiveSeconds,
        priority: index * 40 + 22,
        kind: receiveKind,
        payload: eventPayload({
          causalParentIds: [receiveParentId],
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
        linkBudget: budget,
        transmitOffsetSeconds: cursorSeconds,
        transmitDurationSeconds,
        receiveOffsetSeconds: receiveSeconds,
        channelMode: channel.mode,
        channelReceipt: channel,
        operationalHop,
      }));
      cursorSeconds = receiveSeconds;
      causalParentIds = [receivedId];
      if (index < relayPath.length - 2) {
        const processingCompleteSeconds = cursorSeconds + processingDelayHours * 3600;
        const processingId = queue.schedule({
          time: processingCompleteSeconds,
          priority: index * 40 + 23,
          kind: 'relay.processing-completed',
          payload: eventPayload({
            causalParentIds: [receivedId],
            affectedEntityIds: ['packet:0', toId],
            evidenceReferences: [
              'interstellar.relay.models.v1:deterministic-store-forward-v2',
              'interstellar.operations.models.v1',
            ],
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
              omissionIds: Object.freeze(['infrastructure-not-observed']),
              modeledEffectIds: Object.freeze([
                'acquisition-modeled',
                'availability-and-outages-modeled',
                'maintenance-modeled',
                'hardware-failure-and-repair-modeled',
                'retries-modeled',
                'queue-delay-modeled',
                'dust-and-plasma-attenuation-modeled',
                'detector-background-noise-modeled',
              ]),
              continuousContactAssumed: false,
            }),
          }),
        }),
      });
    });
    return Object.freeze({
      schema: 'simulatte.interstellarContactSchedule.v3',
      relayPath: Object.freeze(relayPath.slice()),
      startEpochIso,
      deliveryEpochIso: deliveryStatus === 'delivered'
        ? new Date(Date.parse(startEpochIso) + cursorSeconds * 1000).toISOString()
        : null,
      deliveryStatus,
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
        modelId: 'operational-store-forward-v3',
        parameters: Object.freeze({
          packetBits,
          processingDelayHours,
          operationsSampleIndex: operationalPlan?.sampleIndex ?? null,
        }),
        validationIds: Object.freeze(['causal-event-order-and-conservation-v1', 'operational-stage-order-v1']),
        assumptions: Object.freeze(['seeded-operational-profile']),
        omissionIds: Object.freeze(['infrastructure-not-observed']),
        reliabilityScope: Object.freeze({
          conditionalOn: Object.freeze(['declared-operational-profile', 'infrastructure-not-observed']),
          excludes: Object.freeze(['empirical-interstellar-operations-unavailable']),
        }),
      }),
    });
  }

  function scheduleOperationalStages({
    queue,
    cursorSeconds,
    causalParentIds,
    operationalHop,
    hopIndex,
    fromId,
    toId,
    evidenceReferences,
  }) {
    const stages = [
      ['relay.acquisition', operationalHop.acquisitionSeconds],
      ['relay.queue-wait', operationalHop.queueDelaySeconds],
      ['relay.maintenance', operationalHop.maintenanceSeconds],
      ['relay.outage-repair', operationalHop.repairSeconds],
    ];
    let cursor = cursorSeconds;
    let parents = causalParentIds;
    stages.forEach(([kind, duration], stageIndex) => {
      if (!(duration > 0)) return;
      const startedId = queue.schedule({
        time: cursor,
        priority: hopIndex * 40 + stageIndex * 2 + 1,
        kind: `${kind}-started`,
        payload: eventPayload({
          causalParentIds: parents,
          affectedEntityIds: ['packet:0', fromId, toId],
          evidenceReferences,
          hopIndex,
          fromId,
          toId,
        }),
      });
      cursor += duration;
      const completedId = queue.schedule({
        time: cursor,
        priority: hopIndex * 40 + stageIndex * 2 + 2,
        kind: `${kind}-completed`,
        payload: eventPayload({
          causalParentIds: [startedId],
          affectedEntityIds: ['packet:0', fromId, toId],
          evidenceReferences,
          hopIndex,
          fromId,
          toId,
        }),
      });
      parents = [completedId];
    });
    for (let retryIndex = 0; retryIndex < operationalHop.retryCount; retryIndex += 1) {
      cursor += operationalHop.retryDelaySeconds / Math.max(1, operationalHop.retryCount);
      const retryId = queue.schedule({
        time: cursor,
        priority: hopIndex * 40 + 10 + retryIndex,
        kind: 'relay.retry-scheduled',
        payload: eventPayload({
          causalParentIds: parents,
          affectedEntityIds: ['packet:0', fromId, toId],
          evidenceReferences,
          hopIndex,
          fromId,
          toId,
        }),
      });
      parents = [retryId];
    }
    return { cursorSeconds: cursor, causalParentIds: parents };
  }

  function eventPayload({
    causalParentIds, affectedEntityIds, evidenceReferences, hopIndex, fromId, toId, progressFraction = null,
  }) {
    return Object.freeze({
      causalParentIds: Object.freeze(causalParentIds.slice()),
      affectedEntityIds: Object.freeze(affectedEntityIds.slice()),
      evidenceReferences: Object.freeze(evidenceReferences.slice()),
      hopIndex,
      fromId,
      toId,
      progressFraction,
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
        'interstellar.operations.models.v1',
      ]),
    });
  }

  function applyDomainEvent(state, event, timestamp) {
    const isStarted = event.kind === 'relay.transmission-started';
    const isReceived = event.kind === 'relay.packet-received';
    const isDelivered = event.kind === 'relay.packet-delivered';
    const isFailed = event.kind === 'relay.packet-failed';
    return Object.freeze({
      ...state,
      status: isDelivered ? 'settled' : isFailed ? 'failed' : 'running',
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
