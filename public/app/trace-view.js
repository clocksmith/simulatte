(function attachAutonomyTraceView(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteAutonomyTraceView = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createAutonomyTraceView() {
  function createTraceView(elements, policy, rerankerEvidence = null) {
    if (rerankerEvidence) {
      const delta = rerankerEvidence.deltas.meanReciprocalRank;
      elements.rerankerProof.textContent = `Public diagnostic · MRR ${format(rerankerEvidence.control.meanReciprocalRank, 3)} → ${format(rerankerEvidence.challenger.meanReciprocalRank, 3)} · Δ +${format(delta, 3)}`;
      elements.rerankerProof.title = rerankerEvidence.claimBoundary;
    }
    function renderTick(entry, snapshot) {
      const receipt = entry.payload;
      if (receipt.schema !== 'simulatte.autonomyTickReceipt.v2') {
        renderFailure(receipt);
        return;
      }
      const selected = receipt.bets.find((row) => row.bet.id === receipt.selectedBetId);
      elements.decisionTitle.textContent = selected ? label(selected.bet.action.maneuver) : 'No decision';
      const nearbyActorSummary = actorSummary(receipt.observation.nearbyActors);
      elements.decisionMeta.textContent = selected
        ? `Tick ${receipt.tick} · utility ${format(selected.utility, 2)} · confidence ${format(selected.bet.confidence * 100, 0)}% · ${nearbyActorSummary}`
        : `Tick ${receipt.tick} · ${nearbyActorSummary}`;
      elements.betList.replaceChildren(...receipt.bets.map((row) => betRow(row, receipt.selectedBetId)));
      renderRoute(elements, receipt.observation.route);
      renderRetrieval(elements, receipt.observation.featureRetrieval);
      renderOccurrences(elements, receipt.observation.occurrenceReceipt);
      renderGates(elements, selected);
      renderSettlement(elements, receipt.settlement);
      renderTrace(elements, receipt, selected);
      renderMetrics(elements, snapshot, selected, receipt);
    }

    function renderInitial(snapshot, rendererReceipt) {
      elements.decisionTitle.textContent = 'Awaiting first observation';
      elements.decisionMeta.textContent = rendererReceipt
        ? `${rendererReceipt.backend.toUpperCase()} ready · ${rendererReceipt.buildingCount.toLocaleString()} buildings`
        : 'No action selected';
      elements.betList.replaceChildren();
      elements.gateList.replaceChildren();
      elements.traceList.replaceChildren();
      elements.routeStats.textContent = 'Route not planned';
      elements.routeFormula.textContent = 'cost = travel + risk + preference';
      elements.routeComponents.replaceChildren();
      elements.retrievalQuery.textContent = 'Waiting for observation';
      elements.retrievalCandidates.textContent = 'No candidates';
      elements.rerankCandidates.textContent = 'No ranking';
      elements.retrievalStats.textContent = 'No query';
      elements.occurrenceStats.textContent = 'No patterns evaluated';
      elements.occurrencePatterns.textContent = 'No active pattern';
      elements.occurrenceEffects.textContent = 'No world effect';
      elements.settlementMath.textContent = 'No settled bet';
      renderMetrics(elements, snapshot, null, null);
    }

    function renderFailure(receipt) {
      elements.decisionTitle.textContent = 'Agent stopped';
      elements.decisionMeta.textContent = receipt.message || receipt.code || 'Runtime failure';
      const traceRow = document.createElement('article');
      traceRow.className = 'trace-row is-failure';
      traceRow.textContent = `${receipt.code || 'runtime_failure'}: ${receipt.message || 'No message'}`;
      elements.traceList.prepend(traceRow);
    }

    return { renderTick, renderInitial, renderFailure };
  }

  function renderRoute(elements, route) {
    const components = route.costBreakdown;
    const method = route.algorithm === 'declared_closed_circuit_v1' ? 'declared circuit' : 'A*';
    elements.routeStats.textContent = `${method} · ${route.visitedNodeCount} nodes · ${route.evaluatedSegmentCount} edges`;
    elements.routeFormula.textContent = components.formula;
    elements.routeComponents.replaceChildren(
      metricToken('travel', components.travel),
      metricToken('risk', components.risk),
      metricToken('preference', components.preference),
      metricToken('total', components.total, true)
    );
  }

  function renderRetrieval(elements, retrieval) {
    elements.retrievalStats.textContent = `${retrieval.counts.catalogCount} cards · ${retrieval.counts.retrievedCount} found · ${retrieval.counts.selectedCount} selected`;
    elements.retrievalQuery.replaceChildren(...retrieval.queryRows.map((row) => textToken(row.text, 'query-token')));
    const visibleRetrieved = retrieval.retrievedRows.slice(0, 8).map((row) => textToken(`${row.label} ${format(row.retrievalScore, 0)}`, 'candidate-token'));
    if (retrieval.retrievedRows.length > visibleRetrieved.length) {
      visibleRetrieved.push(textToken(`+${retrieval.retrievedRows.length - visibleRetrieved.length} more in receipt`, 'candidate-token'));
    }
    elements.retrievalCandidates.replaceChildren(...visibleRetrieved);
    elements.rerankCandidates.replaceChildren(...retrieval.rerankedRows.slice(0, 5).map((row, index) => textToken(`${index + 1}. ${row.label} ${format(row.rerankScore, 1)}`, index === 0 ? 'rank-token is-first' : 'rank-token')));
  }

  function renderOccurrences(elements, receipt) {
    const active = receipt.activePatternIds.length
      ? receipt.activePatternIds
      : ['none'];
    const effects = [
      ...receipt.effects.signalStates.map((row) => `${row.signalId}: ${row.state}`),
      ...receipt.effects.actorStates.map((row) => `${row.actorId}: active ${format((row.progress || 0) * 100, 0)}%`),
      ...receipt.effects.blockedSegmentIds.map((id) => `${id}: blocked`),
      ...receipt.effects.annotations.map((row) => row.label),
    ];
    elements.occurrenceStats.textContent = `${receipt.evaluations.length} patterns · ${receipt.eventCount} events`;
    elements.occurrencePatterns.replaceChildren(...active.map((row) => textToken(row, row === 'none' ? 'candidate-token' : 'query-token')));
    elements.occurrenceEffects.replaceChildren(...(effects.length ? effects : ['No world effect']).map((row) => textToken(row, 'candidate-token')));
  }

  function renderGates(elements, selected) {
    if (!selected) {
      elements.gateList.replaceChildren();
      return;
    }
    elements.gateList.replaceChildren(...selected.gate.checks.map((check) => {
      const row = document.createElement('div');
      row.className = `gate-row ${check.pass ? 'is-pass' : 'is-blocked'}`;
      const mark = document.createElement('span');
      mark.className = 'gate-mark';
      mark.textContent = check.pass ? 'PASS' : 'BLOCK';
      const name = document.createElement('span');
      name.textContent = label(check.id);
      row.append(mark, name);
      return row;
    }));
  }

  function renderSettlement(elements, settlement) {
    const rows = [
      `progress error ${format(settlement.errors.progressM, 3)} m`,
      `speed error ${format(settlement.errors.speedMps, 3)} m/s`,
      `clearance error ${format(settlement.errors.clearanceM, 3)} m`,
    ];
    elements.settlementMath.replaceChildren(...rows.map((row) => textToken(row, 'settlement-token')));
    elements.settlementMath.dataset.verdict = settlement.verdict;
  }

  function renderTrace(elements, receipt, selected) {
    const traceRow = document.createElement('article');
    traceRow.className = `trace-row${selected ? ' is-selected' : ''}`;
    const rejected = receipt.bets.filter((row) => !row.gate.accepted).length;
    const heading = document.createElement('div');
    heading.className = 'trace-row-head';
    heading.innerHTML = `<span>Tick ${receipt.tick}</span><span>${escapeHtml(selected ? label(selected.bet.action.maneuver) : 'failure')}</span>`;
    const meta = document.createElement('div');
    meta.className = 'trace-row-meta';
    meta.textContent = `${format(receipt.transition.progressDeltaM, 1)} m · ${format(receipt.transition.endSpeedMps, 1)} m/s · ${receipt.observation.nearbyActors.length} actors · ${rejected} gated · ${receipt.settlement.verdict}`;
    traceRow.append(heading, meta);
    elements.traceList.prepend(traceRow);
    while (elements.traceList.children.length > 48) elements.traceList.lastElementChild.remove();
  }

  function renderMetrics(elements, snapshot, selected, receipt) {
    const state = snapshot.state;
    setText(elements.metricState, state.status);
    setText(elements.metricTick, state.tick);
    setText(elements.metricSpeed, `${format(state.speedMps, 1)} m/s`);
    setText(elements.metricDistance, `${format(state.distanceTraveledM, 1)} m`);
    const routeMetric = state.taskType === 'loop'
      ? `${state.completedLaps} laps · ${snapshot.route?.segmentIds.length || 0} edges`
      : snapshot.route ? `${snapshot.route.segmentIds.length} edges` : 'unplanned';
    setText(elements.metricRoute, routeMetric);
    setText(elements.metricBet, selected ? label(selected.bet.action.maneuver) : 'none');
    setText(elements.metricSettlement, receipt ? receipt.settlement.verdict : 'none');
    setText(elements.metricCalibration, `${snapshot.policyMemory.wonBetCount} / ${snapshot.policyMemory.settledBetCount}`);
  }

  function betRow(row, selectedBetId) {
    const element = document.createElement('div');
    const selected = row.bet.id === selectedBetId;
    element.className = `bet-row${selected ? ' is-selected' : ''}${row.gate.accepted ? '' : ' is-rejected'}`;
    const state = selected ? 'SELECTED' : row.gate.accepted ? 'ELIGIBLE' : 'GATED';
    const utility = row.utilityBreakdown;
    element.innerHTML = `
      <span class="bet-state">${state}</span>
      <strong class="bet-name">${escapeHtml(label(row.bet.action.maneuver))}</strong>
      <span class="bet-utility">${row.utility === null ? 'n/a' : format(row.utility, 2)}</span>
      <span class="bet-prediction">Δ ${format(row.bet.prediction.progressDeltaM, 1)} m · clear ${format(row.bet.prediction.minimumClearanceM, 1)} m</span>
      <span class="bet-equation">${utility ? `p ${signed(utility.progress)} · c ${signed(utility.clearance)} · conf ${signed(utility.confidence)} · adj ${signed(utility.maneuver + utility.arrival)}` : row.gate.blockingCheckIds.map(label).join(', ')}</span>
    `;
    return element;
  }

  function metricToken(name, value, emphasized = false) {
    const row = document.createElement('span');
    row.className = `metric-token${emphasized ? ' is-total' : ''}`;
    row.innerHTML = `<small>${escapeHtml(name)}</small><strong>${format(value, 2)}</strong>`;
    return row;
  }

  function textToken(value, className) {
    const row = document.createElement('span');
    row.className = className;
    row.textContent = value;
    return row;
  }

  function label(value) {
    return String(value || '').replaceAll('_', ' ').replace(/^./, (row) => row.toUpperCase());
  }

  function format(value, digits = 1) {
    return Number(value || 0).toFixed(digits).replace(/\.0+$/, '');
  }

  function signed(value) {
    const number = Number(value || 0);
    return `${number >= 0 ? '+' : ''}${format(number, 2)}`;
  }

  function actorSummary(actors) {
    if (!actors.length) return 'no nearby actors';
    const counts = actors.reduce((rows, actor) => ({ ...rows, [actor.type]: (rows[actor.type] || 0) + 1 }), {});
    const mix = Object.entries(counts).sort(([left], [right]) => left.localeCompare(right))
      .map(([kind, count]) => `${count} ${kind}`).join(', ');
    return `${actors.length} nearby: ${mix}`;
  }

  function setText(element, value) {
    if (element) element.textContent = String(value);
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[character]));
  }

  return { actorSummary, createTraceView, format, label, signed };
});
