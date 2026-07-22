(function attachInterstellarRelayPlugin(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulattePluginInterstellarRelayNetwork = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createInterstellarRelayPluginApi() {
  async function activate({ sdk, config, profile, scenario }) {
    const starsData = sdk.datasets.require('gaia.dr3.nearby-stars.v1');
    const transceiversData = sdk.datasets.require('relay.hardware.archetypes.v1');
    const scenariosData = sdk.datasets.require('interstellar.scenario.network.v1');

    let activeScenarioId = typeof scenario === 'string' ? scenario : scenario?.id || config?.defaultScenarioId || 'sol-proxima-direct';
    let sc = scenariosData.scenarios?.find((s) => s.id === activeScenarioId) || scenariosData.scenarios?.[0];

    let sourceStar = starsData.stars?.find((s) => s.sourceId === sc.sourceId) || starsData.stars?.[0];
    let targetStar = starsData.stars?.find((s) => s.sourceId === sc.targetId) || starsData.stars?.[1];

    let sourceState = globalThis.InterstellarStellarState.convertEquatorialToCartesianPc(sourceStar);
    let targetState = globalThis.InterstellarStellarState.convertEquatorialToCartesianPc(targetStar);

    let lightTime = globalThis.InterstellarLightTime.computeOneWayLightTime(sourceState.positionPc, targetState.positionPc);
    let transceiver = transceiversData.archetypes?.[sc.transceiverId] || transceiversData.archetypes?.['sol-primary-gateway'];
    let linkBudget = globalThis.InterstellarOpticalLinkBudget.computeLinkBudget(lightTime.distanceMeters, transceiver);
    let packetReceipt = globalThis.InterstellarPacketQueue.enqueuePacket('SYN-ACK-INTERSTELLAR', sc.relayHops, lightTime);

    function setScenario(nextScenario) {
      activeScenarioId = typeof nextScenario === 'string' ? nextScenario : nextScenario?.id || 'sol-proxima-direct';
      sc = scenariosData.scenarios?.find((s) => s.id === activeScenarioId) || scenariosData.scenarios?.[0];
      sourceStar = starsData.stars?.find((s) => s.sourceId === sc.sourceId) || starsData.stars?.[0];
      targetStar = starsData.stars?.find((s) => s.sourceId === sc.targetId) || starsData.stars?.[1];
      sourceState = globalThis.InterstellarStellarState.convertEquatorialToCartesianPc(sourceStar);
      targetState = globalThis.InterstellarStellarState.convertEquatorialToCartesianPc(targetStar);
      lightTime = globalThis.InterstellarLightTime.computeOneWayLightTime(sourceState.positionPc, targetState.positionPc);
      transceiver = transceiversData.archetypes?.[sc.transceiverId] || transceiversData.archetypes?.['sol-primary-gateway'];
      linkBudget = globalThis.InterstellarOpticalLinkBudget.computeLinkBudget(lightTime.distanceMeters, transceiver);
      packetReceipt = globalThis.InterstellarPacketQueue.enqueuePacket('SYN-ACK-INTERSTELLAR', sc.relayHops, lightTime);
      return { activeScenarioId, lightTime, linkBudget, packetReceipt };
    }

    function handleAction(actionId, context = {}) {
      if (actionId === 'simulate.packet.transmission') {
        sdk.receipts.append(packetReceipt);
        return { status: 'settled', latencyYears: lightTime.latencyYears, achievableGbps: linkBudget.achievableDataRateGbps };
      }
      if (actionId === 'counterfactual.compare') {
        const directLightTime = globalThis.InterstellarLightTime.computeOneWayLightTime([0, 0, 0], [-0.92, -0.90, -0.11]);
        const delayDiffYears = lightTime.latencyYears - directLightTime.latencyYears;
        sdk.receipts.append({
          schema: 'simulatte.plugin.interstellarCounterfactualReceipt.v1',
          baselineScenarioId: 'sol-proxima-direct',
          counterfactualScenarioId: activeScenarioId,
          delayDiffYears
        });
        return { status: 'settled', delayDiffYears };
      }
      return { status: 'refused', reason: 'unknown_action' };
    }

    function settle() {
      const results = [
        { obligationId: 'interstellar:latency-bound', status: lightTime.latencyYears <= 10.0 ? 'settled' : 'unmet', evidence: { latencyYears: lightTime.latencyYears, limitYears: 10.0 } },
        { obligationId: 'interstellar:bandwidth-floor', status: linkBudget.achievableDataRateGbps >= 0.1 ? 'settled' : 'unmet', evidence: { achievableGbps: linkBudget.achievableDataRateGbps, floorGbps: 0.1 } }
      ];
      return { obligationResults: results, stateIdentity: `${activeScenarioId}:${sourceStar.sourceId}->${targetStar.sourceId}`, losses: [] };
    }

    function view() {
      return {
        slot: 'inspector',
        title: 'Interstellar Relay Network',
        rows: [
          { label: 'Scenario', value: sc.name },
          { label: 'Link', value: `${sourceState.name} → ${targetState.name}` },
          { label: 'Distance', value: `${lightTime.distanceLy.toFixed(2)} light years (${lightTime.distancePc.toFixed(2)} pc)` },
          { label: 'One-Way Latency', value: `${lightTime.latencyYears.toFixed(2)} years` },
          { label: 'Achievable Rate', value: `${linkBudget.achievableDataRateGbps.toFixed(1)} Gbps` }
        ],
        actions: [
          { id: 'simulate.packet.transmission', label: 'Transmit Optical Packet' },
          { id: 'counterfactual.compare', label: 'Compare Proxima Direct Latency' }
        ]
      };
    }

    function present() {
      return globalThis.InterstellarRelayPresentation.createPresentation(starsData, {
        pathPositions: [sourceState.positionPc, targetState.positionPc]
      });
    }

    return Object.freeze({
      id: 'interstellar-relay-network',
      setScenario,
      view,
      handleAction,
      settle,
      present,
      capabilities: {
        'field.stellar-flux.v1': () => ({ targetMagnitude: targetStar?.photGMag || 11.13 }),
        'simulation.light-delay-queue.v1': () => lightTime,
        'simulation.interstellar-communications.v1': () => linkBudget
      },
      dispose() {}
    });
  }

  return Object.freeze({ activate });
});
